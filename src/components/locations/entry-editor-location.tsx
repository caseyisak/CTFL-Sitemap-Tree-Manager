"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSDK } from "@contentful/react-apps-toolkit"
import type { EditorAppSDK } from "@contentful/app-sdk"
import type {
  AppInstallationParameters,
  ContentfulPageEntry,
  FolderNode,
  SitemapMetadata,
} from "@/lib/contentful-types"
import {
  buildSitemapTreeWithFolders,
  findChangedParentIds,
  transformEntry,
} from "@/lib/sitemap-utils"
import type { SitemapNode } from "@/lib/sitemap-types"
import { SitemapPanelWithCallback } from "@/components/sitemap/sitemap-panel-connected"
import { DetailsPanel } from "@/components/sitemap/details-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Loader2 } from "lucide-react"

export function EntryEditorLocation() {
  const sdk = useSDK<EditorAppSDK>()
  const installation = sdk.parameters.installation as AppInstallationParameters
  const baseUrl = installation?.baseUrl ?? "https://smu.edu"
  const enabledContentTypes = installation?.enabledContentTypes ?? []
  const contentTypeConfigs = installation?.contentTypeConfigs ?? {}
  // sitemapContentTypeId from params may be null if the config hasn't been saved yet.
  // We detect the real CT during fetchEntries and store it in state.
  const storedSitemapCtId = installation?.sitemapContentTypeId ?? null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ContentfulPageEntry[]>([])
  const [folderConfig, setFolderConfig] = useState<FolderNode[]>([])
  const [sitemapEntryId, setSitemapEntryId] = useState<string | null>(null)
  // Detected Sitemap CT ID — set during fetchEntries
  const [detectedSitemapCtId, setDetectedSitemapCtId] = useState<string | null>(storedSitemapCtId)
  // True when the currently-open entry IS the Sitemap entry (shows full manager + export button)
  const isSitemapEntry = sdk.ids.contentType === (detectedSitemapCtId ?? storedSitemapCtId ?? "sitemap")

  // ─── Refs for always-current values (avoid stale closures in callbacks) ───────
  // Callbacks like saveFolderConfig and handleSitemapChange are captured in closures
  // at render time, but need to read the latest sitemapEntryId / folderConfig even
  // when called synchronously right after state-updating async operations.
  const sitemapEntryIdRef = useRef<string | null>(null)
  const folderConfigRef = useRef<FolderNode[]>([])

  /** Set sitemapEntryId in both state (for renders) and ref (for immediate reads). */
  const setEntryId = (id: string | null) => {
    sitemapEntryIdRef.current = id
    setSitemapEntryId(id)
  }
  /** Set folderConfig in both state (for renders) and ref (for immediate reads). */
  const setFolders = (folders: FolderNode[]) => {
    folderConfigRef.current = folders
    setFolderConfig(folders)
  }

  const [sitemap, setSitemap] = useState<SitemapNode | null>(null)
  const [originalSitemap, setOriginalSitemap] = useState<SitemapNode | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [showMobile, setShowMobile] = useState(false)

  // ─── Folder config persistence ───────────────────────────────────────────────

  /**
   * Saves updated folderConfig to the singleton Sitemap entry.
   * Uses sitemapEntryIdRef (not state) so it's never stale even when called
   * synchronously right after fetchEntries resolves the entry ID.
   */
  const saveFolderConfig = useCallback(async (newFolders: FolderNode[]) => {
    // Always read from ref — guaranteed current regardless of closure age
    const entryId = sitemapEntryIdRef.current
    if (!entryId) {
      // No sitemap entry yet — keep in local state only
      setFolders(newFolders)
      return
    }
    try {
      const entry = await sdk.cma.entry.get({ entryId })
      await sdk.cma.entry.update(
        { entryId },
        { ...entry, fields: { ...entry.fields, folderConfig: { "en-US": newFolders } } }
      )
      setFolders(newFolders)
    } catch (e) {
      console.error("Failed to save folderConfig:", e)
    }
  }, [sdk]) // no dep on sitemapEntryId — uses ref instead

  // ─── Data loading ─────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ── 1. Resolve the singleton Sitemap entry ID ──
      let resolvedSitemapEntryId = installation?.sitemapEntryId ?? null

      if (!resolvedSitemapEntryId) {
        // Find the Sitemap entry: try stored CT ID first, then detect CT by name.
        // This works even when app params haven't been saved yet (e.g. right after
        // creating the entry from the config screen without clicking Save).
        try {
          let ctIdToQuery = installation?.sitemapContentTypeId ?? null
          if (!ctIdToQuery) {
            // Detect Sitemap CT by name — same logic as the config screen
            const ctResp = await sdk.cma.contentType.getMany({ query: { limit: 200 } })
            const sitemapCt = (ctResp.items ?? []).find(
              (ct) => ct.name.toLowerCase() === "sitemap"
            )
            ctIdToQuery = sitemapCt?.sys.id ?? null
            // Store for isSitemapEntry and future use
            if (ctIdToQuery) setDetectedSitemapCtId(ctIdToQuery)
          }
          if (ctIdToQuery) {
            const resp = await sdk.cma.entry.getMany({
              query: { content_type: ctIdToQuery, limit: 1 },
            })
            if ((resp.items ?? []).length > 0) {
              resolvedSitemapEntryId = resp.items[0].sys.id
            }
          }
        } catch { /* no sitemap entry available yet */ }
      }

      setEntryId(resolvedSitemapEntryId)

      // ── 2. Load folderConfig from Sitemap entry ──
      let loadedFolders: FolderNode[] = []
      if (resolvedSitemapEntryId) {
        try {
          const sitemapEntry = await sdk.cma.entry.get({ entryId: resolvedSitemapEntryId })
          const raw = sitemapEntry.fields?.folderConfig?.["en-US"]
          if (Array.isArray(raw)) {
            loadedFolders = raw as FolderNode[]
          }
        } catch { /* folderConfig field might not exist yet */ }
      }
      setFolders(loadedFolders)

      // ── 3. Fetch page entries ──
      const allEntries: ContentfulPageEntry[] = []
      const typesToFetch = isSitemapEntry
        ? enabledContentTypes
        : enabledContentTypes.filter((ct) => ct === sdk.ids.contentType)

      const fetchTypes = typesToFetch.length > 0 ? typesToFetch : enabledContentTypes

      for (const ctId of fetchTypes) {
        const slugFieldId = contentTypeConfigs[ctId]?.slugFieldId ?? "slug"
        let titleFieldId = "title"
        try {
          const ctDef = await sdk.cma.contentType.get({ contentTypeId: ctId })
          titleFieldId = ctDef.displayField ?? "title"
        } catch { /* fall back to "title" */ }

        let skip = 0
        const limit = 200
        while (true) {
          const response = await sdk.cma.entry.getMany({
            query: { content_type: ctId, limit, skip },
          })
          const items = response.items ?? []
          for (const item of items) {
            allEntries.push(transformEntry(item, ctId, slugFieldId, titleFieldId))
          }
          if (items.length < limit) break
          skip += limit
          if (skip >= 1000) break
        }
      }

      setEntries(allEntries)
      const tree = buildSitemapTreeWithFolders(loadedFolders, allEntries)
      setSitemap(tree)
      setOriginalSitemap(JSON.parse(JSON.stringify(tree)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, enabledContentTypes, contentTypeConfigs, installation?.sitemapEntryId, installation?.sitemapContentTypeId])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const currentEntryId = !isSitemapEntry ? sdk.entry.getSys().id : null

  useEffect(() => {
    if (sitemap && currentEntryId && selectedNodeId === null) {
      setSelectedNodeId(currentEntryId)
    }
  }, [sitemap, currentEntryId, selectedNodeId])

  // ─── Path computation ─────────────────────────────────────────────────────────

  /** Computes full slug path for a node using tree structure. Self-contained — no external deps. */
  const computeFullPath = (tree: SitemapNode, targetId: string): string => {
    let targetSlug = ""
    const walkPath = (node: SitemapNode, id: string, ancestorSlugs: string[]): string[] | null => {
      if (node.id === id) { targetSlug = node.slug; return ancestorSlugs }
      for (const child of node.children) {
        const result = walkPath(child, id, [...ancestorSlugs, node.slug])
        if (result) return result
      }
      return null
    }
    const ancestorSlugs = walkPath(tree, targetId, [])
    if (ancestorSlugs === null) return ""
    const parts = [...ancestorSlugs.filter(Boolean), targetSlug].filter(Boolean)
    return parts.length ? `/${parts.join("/")}` : `/${targetSlug}`
  }

  // ─── Sitemap change handler ───────────────────────────────────────────────────

  const handleSitemapChange = useCallback(
    async (newSitemap: SitemapNode) => {
      setSitemap(newSitemap)
      if (!originalSitemap) return

      const changed = findChangedParentIds(originalSitemap, newSitemap)
      const realEntryIds = new Set(entries.map((e) => e.id))

      // Read folderConfig from ref — always current even if state is stale
      const currentFolders = folderConfigRef.current
      const folderIds = new Set(currentFolders.map((f) => f.id))

      // Separate pages from folders
      const changedPages = changed.filter(({ id }) => realEntryIds.has(id))

      // Only update positions of folders that ALREADY existed in the original sitemap.
      // Newly-added folders are handled (and saved) by handleCreateFolder — including
      // them here would cause handleSitemapChange to overwrite the newly-saved folder
      // with the stale (pre-add) folderConfig.
      const changedFolders = changed.filter(({ id }) =>
        !realEntryIds.has(id) && id !== "root" && folderIds.has(id)
      )

      if (changedPages.length === 0 && changedFolders.length === 0) return

      setSaveStatus("saving")
      try {
        // Update page entries' sitemapMetadata
        for (const { id, newParentId } of changedPages) {
          const entry = await sdk.cma.entry.get({ entryId: id })
          const ctId = entry.sys.contentType?.sys?.id ?? ""

          const hasMeta =
            (entry.fields as Record<string, unknown>)?.sitemapMetadata !== undefined ||
            (await sdk.cma.contentType
              .get({ contentTypeId: ctId })
              .then(
                (ct) => ct.fields.some((f) => f.id === "sitemapMetadata"),
                () => false
              ))
          if (!hasMeta) continue

          // Allow folder IDs and entry IDs as valid parents; reject anything unknown
          const resolvedParentId =
            newParentId && (realEntryIds.has(newParentId) || folderIds.has(newParentId))
              ? newParentId
              : null

          const newMeta: SitemapMetadata = {
            parentEntryId: resolvedParentId,
            computedPath: computeFullPath(newSitemap, id),
          }

          await sdk.cma.entry.update(
            { entryId: id },
            { ...entry, fields: { ...entry.fields, sitemapMetadata: { "en-US": newMeta } } }
          )
        }

        // Update positions for existing folders that were dragged to a new parent.
        // Uses currentFolders (from ref) — not the state closure — so it has the
        // latest list including any folders added earlier in this session.
        if (changedFolders.length > 0) {
          const updatedFolders = currentFolders.map((f) => {
            const change = changedFolders.find((c) => c.id === f.id)
            if (change) return { ...f, parentId: change.newParentId }
            return f
          })
          await saveFolderConfig(updatedFolders)
        }

        setOriginalSitemap(JSON.parse(JSON.stringify(newSitemap)))
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e)
        console.error("Save failed:", msg, e)
        setSaveStatus("error")
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdk, originalSitemap, entries, folderConfig, saveFolderConfig]
  )

  // ─── Export sitemap.xml ───────────────────────────────────────────────────────

  const handleExportSitemap = () => {
    if (!entries.length) return

    const included = entries.filter((e) => !e.excludeFromSitemap && e.metadata?.computedPath)
    const urls = included
      .map((e) => `  <url>\n    <loc>${baseUrl}${e.metadata!.computedPath}</loc>\n  </url>`)
      .join("\n")

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`

    const blob = new Blob([xml], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "sitemap.xml"
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Tree helpers ─────────────────────────────────────────────────────────────

  const findNode = (node: SitemapNode, id: string): SitemapNode | null => {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findNode(child, id)
      if (found) return found
    }
    return null
  }

  const getBreadcrumb = (
    node: SitemapNode,
    targetId: string,
    path: string[] = []
  ): string[] | null => {
    if (node.id === targetId) return [...path, node.title]
    for (const child of node.children) {
      const result = getBreadcrumb(child, targetId, [...path, node.title])
      if (result) return result
    }
    return null
  }

  const getNodePath = (
    root: SitemapNode,
    targetId: string,
    path: string[] = []
  ): string[] | null => {
    if (root.id === targetId) return path
    for (const child of root.children) {
      const result = getNodePath(child, targetId, [...path, root.id])
      if (result) return result
    }
    return null
  }

  const getAllFolders = (
    node: SitemapNode,
    path: string[] = []
  ): Array<{ id: string; title: string; path: string[] }> => {
    const folders: Array<{ id: string; title: string; path: string[] }> = []
    if (node.type === "root" || node.type === "section") {
      folders.push({ id: node.id, title: node.title, path })
    }
    for (const child of node.children) {
      folders.push(...getAllFolders(child, [...path, node.title]))
    }
    return folders
  }

  const handleMoveNode = (nodeId: string, newParentId: string) => {
    if (!sitemap) return
    const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode

    let movedNode: SitemapNode | null = null
    const removeNode = (parent: SitemapNode): boolean => {
      const index = parent.children.findIndex((c) => c.id === nodeId)
      if (index !== -1) {
        movedNode = parent.children[index]
        parent.children.splice(index, 1)
        return true
      }
      return parent.children.some(removeNode)
    }
    removeNode(newSitemap)
    if (!movedNode) return

    const addToParent = (parent: SitemapNode): boolean => {
      if (parent.id === newParentId) {
        parent.children.push(movedNode!)
        return true
      }
      return parent.children.some(addToParent)
    }
    addToParent(newSitemap)
    handleSitemapChange(newSitemap)
  }

  const getTitleFieldId = useCallback(async (ctId: string): Promise<string> => {
    try {
      const ctDef = await sdk.cma.contentType.get({ contentTypeId: ctId })
      return ctDef.displayField ?? "title"
    } catch {
      return "title"
    }
  }, [sdk])

  // ─── Folder CRUD (stored in folderConfig, NOT as Contentful entries) ──────────

  const handleCreateFolder = useCallback(async (
    parentId: string | null,
    title: string,
    slug: string,
  ): Promise<SitemapNode> => {
    const newId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newFolder: FolderNode = { id: newId, title, slug, parentId }
    // Use ref for current folders — state closure may be stale if fetchEntries
    // just updated it moments ago
    const updatedFolders = [...folderConfigRef.current, newFolder]
    await saveFolderConfig(updatedFolders)
    return { id: newId, title, slug, type: "section", status: "published", children: [], isExpanded: true }
  }, [saveFolderConfig])

  // ─── Entry CRUD ───────────────────────────────────────────────────────────────

  const handleRenameEntry = useCallback(async (nodeId: string, newTitle: string) => {
    const currentFolders = folderConfigRef.current
    const isFolder = currentFolders.some((f) => f.id === nodeId)

    if (isFolder) {
      // Rename folder in folderConfig
      await saveFolderConfig(currentFolders.map((f) => f.id === nodeId ? { ...f, title: newTitle } : f))
    } else {
      // Rename real entry
      const realEntry = entries.find((e) => e.id === nodeId)
      if (realEntry) {
        const entry = await sdk.cma.entry.get({ entryId: nodeId })
        const ctId = entry.sys.contentType?.sys?.id ?? ""
        const titleFieldId = await getTitleFieldId(ctId)
        await sdk.cma.entry.update({ entryId: nodeId }, {
          ...entry,
          fields: { ...entry.fields, [titleFieldId]: { "en-US": newTitle } },
        })
        setEntries((prev) => prev.map((e) => e.id === nodeId ? { ...e, title: newTitle } : e))
      }
    }

    // Update local tree
    setSitemap((prev) => {
      if (!prev) return prev
      const updateNode = (node: SitemapNode): SitemapNode => {
        if (node.id === nodeId) return { ...node, title: newTitle }
        return { ...node, children: node.children.map(updateNode) }
      }
      return updateNode(prev)
    })
  }, [sdk, entries, getTitleFieldId, saveFolderConfig])

  const handleDuplicateEntry = useCallback(async (nodeId: string) => {
    const realEntry = entries.find((e) => e.id === nodeId)
    if (!realEntry) return
    const entry = await sdk.cma.entry.get({ entryId: nodeId })
    const ctId = entry.sys.contentType?.sys?.id ?? ""
    const titleFieldId = await getTitleFieldId(ctId)
    const originalTitle = (entry.fields?.[titleFieldId]?.["en-US"] as string | undefined) ?? "Entry"
    const { sitemapMetadata: _sm, ...restFields } = entry.fields as Record<string, unknown>
    await sdk.cma.entry.create(
      { contentTypeId: ctId, spaceId: sdk.ids.space, environmentId: sdk.ids.environment ?? "master" },
      { fields: { ...restFields, [titleFieldId]: { "en-US": `${originalTitle} (Copy)` } } }
    )
    await fetchEntries()
  }, [sdk, entries, getTitleFieldId, fetchEntries])

  const handleDeleteEntry = useCallback(async (nodeId: string) => {
    const currentFolders = folderConfigRef.current
    const isFolder = currentFolders.some((f) => f.id === nodeId)

    if (isFolder) {
      // Remove folder from folderConfig; reparent its children to the folder's parent
      const folder = currentFolders.find((f) => f.id === nodeId)!
      const newFolderParentId = folder.parentId

      // Reparent child folders
      const updatedFolders = currentFolders
        .filter((f) => f.id !== nodeId)
        .map((f) => f.parentId === nodeId ? { ...f, parentId: newFolderParentId } : f)
      await saveFolderConfig(updatedFolders)

      // Reparent page entries that had this folder as their parent
      const affectedEntries = entries.filter((e) => e.metadata?.parentEntryId === nodeId)
      for (const affected of affectedEntries) {
        try {
          const entry = await sdk.cma.entry.get({ entryId: affected.id })
          const newMeta: SitemapMetadata = {
            parentEntryId: newFolderParentId,
            computedPath: affected.metadata?.computedPath ?? "",
          }
          await sdk.cma.entry.update(
            { entryId: affected.id },
            { ...entry, fields: { ...entry.fields, sitemapMetadata: { "en-US": newMeta } } }
          )
        } catch (e) { console.error("Failed to reparent entry after folder delete:", e) }
      }
      setEntries((prev) => prev.map((e) =>
        e.metadata?.parentEntryId === nodeId
          ? { ...e, metadata: { ...e.metadata!, parentEntryId: newFolderParentId } }
          : e
      ))
    } else {
      // Delete real Contentful entry
      try {
        await sdk.cma.entry.delete({ entryId: nodeId })
        setEntries((prev) => prev.filter((e) => e.id !== nodeId))
      } catch (e) {
        console.error("Delete failed:", e instanceof Error ? e.message : e)
        return
      }
    }

    const removeFromTree = (node: SitemapNode): SitemapNode => ({
      ...node,
      children: node.children.filter((c) => c.id !== nodeId).map(removeFromTree),
    })
    setSitemap((prev) => prev ? removeFromTree(prev) : prev)
    setOriginalSitemap((prev) => prev ? removeFromTree(prev) : prev)
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }, [sdk, entries, selectedNodeId, saveFolderConfig])

  const handleOpenEntryNewTab = useCallback((nodeId: string) => {
    const envId = sdk.ids.environment ?? "master"
    window.open(
      `https://app.contentful.com/spaces/${sdk.ids.space}/environments/${envId}/entries/${nodeId}`,
      "_blank"
    )
  }, [sdk])

  const handleSaveDetails = useCallback(async (nodeId: string, data: { title: string; slug: string }) => {
    // Folders have no Contentful entry to save to — update folderConfig
    const currentFolders = folderConfigRef.current
    const isFolder = currentFolders.some((f) => f.id === nodeId)
    if (isFolder) {
      await saveFolderConfig(currentFolders.map((f) =>
        f.id === nodeId ? { ...f, title: data.title, slug: data.slug } : f
      ))
      setSitemap((prev) => {
        if (!prev) return prev
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === nodeId) return { ...node, title: data.title, slug: data.slug }
          return { ...node, children: node.children.map(updateNode) }
        }
        return updateNode(prev)
      })
      return
    }

    setSaveStatus("saving")
    try {
      const entry = await sdk.cma.entry.get({ entryId: nodeId })
      const ctId = entry.sys.contentType?.sys?.id ?? ""
      const titleFieldId = await getTitleFieldId(ctId)
      const slugFieldId = contentTypeConfigs[ctId]?.slugFieldId ?? "slug"
      await sdk.cma.entry.update({ entryId: nodeId }, {
        ...entry,
        fields: {
          ...entry.fields,
          [titleFieldId]: { "en-US": data.title },
          [slugFieldId]: { "en-US": data.slug },
        },
      })
      setEntries((prev) => prev.map((e) => e.id === nodeId ? { ...e, title: data.title, slug: data.slug } : e))
      setSitemap((prev) => {
        if (!prev) return prev
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === nodeId) return { ...node, title: data.title, slug: data.slug }
          return { ...node, children: node.children.map(updateNode) }
        }
        return updateNode(prev)
      })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (e) {
      console.error("Save failed:", e instanceof Error ? e.message : e)
      setSaveStatus("error")
    }
  }, [sdk, entries, contentTypeConfigs, getTitleFieldId, saveFolderConfig])

  const handleExcludeFromSitemap = useCallback(
    async (nodeId: string, excluded: boolean) => {
      if (sitemap) {
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === nodeId) return { ...node, excludeFromSitemap: excluded }
          return { ...node, children: node.children.map(updateNode) }
        }
        setSitemap(updateNode(sitemap))
      }
      try {
        const entry = await sdk.cma.entry.get({ entryId: nodeId })
        await sdk.cma.entry.update(
          { entryId: nodeId },
          { ...entry, fields: { ...entry.fields, excludeFromSitemap: { "en-US": excluded } } }
        )
      } catch (e) {
        console.error("Failed to update excludeFromSitemap:", e)
      }
    },
    [sdk, sitemap]
  )

  // ─── Derived state ────────────────────────────────────────────────────────────

  const derivedSelectedNode = sitemap && selectedNodeId ? findNode(sitemap, selectedNodeId) : null
  const selectedEntry = selectedNodeId ? entries.find((e) => e.id === selectedNodeId) ?? null : null
  const breadcrumb =
    sitemap && derivedSelectedNode ? getBreadcrumb(sitemap, derivedSelectedNode.id) : null

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-[var(--cf-gray-500)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading sitemap data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--cf-red-500)]">
        <p className="font-medium">Failed to load sitemap data</p>
        <p className="text-sm text-[var(--cf-gray-500)]">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchEntries} className="bg-transparent">
          Retry
        </Button>
      </div>
    )
  }

  if (!sitemap) return null

  return (
    <div className="flex flex-col h-screen bg-[var(--cf-gray-100)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-[var(--cf-gray-200)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--cf-gray-700)]">
            {isSitemapEntry ? "Sitemap Manager" : "Sitemap"}
          </span>
          {saveStatus === "saving" && (
            <Badge className="bg-[var(--cf-orange-100)] text-[var(--cf-orange-500)] hover:bg-[var(--cf-orange-100)] text-xs">
              Saving...
            </Badge>
          )}
          {saveStatus === "saved" && (
            <Badge className="bg-[var(--cf-green-100)] text-[var(--cf-green-500)] hover:bg-[var(--cf-green-100)] text-xs">
              Saved
            </Badge>
          )}
          {saveStatus === "error" && (
            <Badge className="bg-[var(--cf-red-100)] text-[var(--cf-red-500)] hover:bg-[var(--cf-red-100)] text-xs">
              Save failed
            </Badge>
          )}
        </div>
        {isSitemapEntry && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportSitemap}
            className="bg-transparent h-8"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export sitemap.xml
          </Button>
        )}
      </div>

      {/* Mobile toggle */}
      <div className="lg:hidden p-2 bg-white border-b border-[var(--cf-gray-200)]">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowMobile(!showMobile)}
        >
          {showMobile ? "Show Tree" : "Show Details"}
        </Button>
      </div>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        <div
          className={`w-full lg:w-[420px] xl:w-[500px] shrink-0 p-4 ${
            showMobile ? "hidden lg:block" : "block"
          }`}
        >
          <SitemapPanelWithCallback
            onSelectNode={setSelectedNodeId}
            sitemap={sitemap}
            onSitemapChange={handleSitemapChange}
            currentPageId={currentEntryId ?? undefined}
            onRenameEntry={handleRenameEntry}
            onDuplicateEntry={handleDuplicateEntry}
            onDeleteEntry={handleDeleteEntry}
            onOpenEntryNewTab={handleOpenEntryNewTab}
            onCreateFolder={handleCreateFolder}
          />
        </div>

        <div
          className={`flex-1 p-4 pl-0 overflow-hidden ${
            showMobile ? "block" : "hidden lg:block"
          }`}
        >
          <DetailsPanel
            node={derivedSelectedNode}
            entry={selectedEntry}
            breadcrumb={breadcrumb}
            parentPath={
              sitemap && derivedSelectedNode
                ? getNodePath(sitemap, derivedSelectedNode.id)
                : null
            }
            allFolders={getAllFolders(sitemap)}
            onMoveNode={handleMoveNode}
            baseUrl={baseUrl}
            onExcludeFromSitemap={handleExcludeFromSitemap}
            onSave={handleSaveDetails}
          />
        </div>
      </main>
    </div>
  )
}
