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
  slugify,
} from "@/lib/sitemap-utils"
import type { SitemapNode } from "@/lib/sitemap-types"
import { SitemapPanelWithCallback } from "@/components/sitemap/sitemap-panel-connected"
import { DetailsPanel } from "@/components/sitemap/details-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

const PANEL_WIDTH_KEY = "stm-panel-width"
const DEFAULT_PANEL_WIDTH = 420
const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 700

// ─── Module-level pure helpers ────────────────────────────────────────────────

/**
 * Computes the full URL path for a node by walking its ancestor slugs in the tree.
 * Skips empty slugs (e.g. the root node's slug is "").
 */
function computeFullPath(tree: SitemapNode, targetId: string): string {
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

/**
 * Collects all page entry IDs that are descendants (at any depth) of a given tree node.
 */
function collectDescendantPageIds(
  tree: SitemapNode,
  startNodeId: string,
  pageEntryIds: Set<string>
): string[] {
  const ids: string[] = []
  const findAndCollect = (node: SitemapNode): boolean => {
    if (node.id === startNodeId) {
      const collect = (n: SitemapNode) => {
        for (const child of n.children) {
          if (pageEntryIds.has(child.id)) ids.push(child.id)
          collect(child)
        }
      }
      collect(node)
      return true
    }
    return node.children.some(findAndCollect)
  }
  findAndCollect(tree)
  return ids
}

export function EntryEditorLocation() {
  const sdk = useSDK<EditorAppSDK>()
  const installation = sdk.parameters.installation as AppInstallationParameters
  const baseUrl = installation?.baseUrl ?? "https://smu.edu"
  const enabledContentTypes = installation?.enabledContentTypes ?? []
  const contentTypeConfigs = installation?.contentTypeConfigs ?? {}
  const storedSitemapCtId = installation?.sitemapContentTypeId ?? null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ContentfulPageEntry[]>([])
  const [folderConfig, setFolderConfig] = useState<FolderNode[]>([])
  const [sitemapEntryId, setSitemapEntryId] = useState<string | null>(null)
  const [detectedSitemapCtId, setDetectedSitemapCtId] = useState<string | null>(storedSitemapCtId)
  /** The internalName (or legacy name) of the root Sitemap entry — used as breadcrumb root label. */
  const [sitemapEntryName, setSitemapEntryName] = useState<string>("Sitemap")
  /** Number of child sitemaps linked to the root — used to determine single vs index mode */
  const [childSitemapCount, setChildSitemapCount] = useState<number>(0)
  /** Whether the currently-open entry is a child Sitemap entry (sitemapType = "child") */
  const [isChildSitemap, setIsChildSitemap] = useState<boolean>(false)
  /** content type IDs owned by this child sitemap (from the contentTypes field) */
  const [thisChildContentTypes, setThisChildContentTypes] = useState<string[]>([])

  const isSitemapEntry = sdk.ids.contentType === (detectedSitemapCtId ?? storedSitemapCtId ?? "sitemap")

  // ─── Refs for always-current values ──────────────────────────────────────────
  const sitemapEntryIdRef = useRef<string | null>(null)
  const folderConfigRef = useRef<FolderNode[]>([])
  /** Prevents the sitemapMetadata onValueChanged subscription from re-fetching our own writes. */
  const isSavingMetaRef = useRef(false)
  /** Prevents the excludeFromSitemap onValueChanged subscription from reacting to our own writes. */
  const isSavingExcludeRef = useRef(false)
  /** Prevents the contentTypes onValueChanged subscription from reacting to our own writes. */
  const isSavingCtRef = useRef(false)

  const setEntryId = (id: string | null) => {
    sitemapEntryIdRef.current = id
    setSitemapEntryId(id)
  }
  const setFolders = (folders: FolderNode[]) => {
    folderConfigRef.current = folders
    setFolderConfig(folders)
  }

  const [sitemap, setSitemap] = useState<SitemapNode | null>(null)
  const [originalSitemap, setOriginalSitemap] = useState<SitemapNode | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [showMobile, setShowMobile] = useState(false)

  // ─── Resizable left panel ─────────────────────────────────────────────────────
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(PANEL_WIDTH_KEY)
      if (stored) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed)) return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, parsed))
      }
    }
    return DEFAULT_PANEL_WIDTH
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const handleDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const containerLeft = containerRef.current.getBoundingClientRect().left
      const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, ev.clientX - containerLeft))
      setLeftPanelWidth(newWidth)
    }

    const onMouseUp = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      // Persist to localStorage
      if (containerRef.current) {
        const containerLeft = containerRef.current.getBoundingClientRect().left
        const finalWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, ev.clientX - containerLeft))
        localStorage.setItem(PANEL_WIDTH_KEY, String(finalWidth))
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [])

  // ─── Folder config persistence ────────────────────────────────────────────────

  const saveFolderConfig = useCallback(async (newFolders: FolderNode[]) => {
    const entryId = sitemapEntryIdRef.current
    if (!entryId) {
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
  }, [sdk])

  // ─── Data loading ─────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ── 1. Resolve the root Sitemap entry ──
      let resolvedSitemapEntryId: string | null = null
      // Track the resolved sitemap CT ID so we can exclude it from page entries below.
      let resolvedSitemapCtId: string | null = installation?.sitemapContentTypeId ?? null

      try {
        let ctIdToQuery = installation?.sitemapContentTypeId ?? null
        if (!ctIdToQuery) {
          const ctResp = await sdk.cma.contentType.getMany({ query: { limit: 200 } })
          const sitemapCt =
            (ctResp.items ?? []).find((ct) => ct.sys.id === "sitemap") ??
            (ctResp.items ?? []).find((ct) => ct.name.toLowerCase() === "sitemap")
          ctIdToQuery = sitemapCt?.sys.id ?? null
          if (ctIdToQuery) {
            setDetectedSitemapCtId(ctIdToQuery)
            resolvedSitemapCtId = ctIdToQuery
          }
        }
        if (ctIdToQuery) {
          // Find root entry: sitemapType = "root" or null (legacy)
          const resp = await sdk.cma.entry.getMany({
            query: { content_type: ctIdToQuery, limit: 10 },
          })
          const items = resp.items ?? []
          /** Read en-US locale value from a CMA field (typed as unknown). */
          const loc = (field: unknown): unknown =>
            (field as Record<string, unknown> | undefined)?.["en-US"]

          const rootItem =
            items.find((e) => {
              const t = loc((e.fields as Record<string, unknown>)?.sitemapType) as string | null | undefined
              return t === "root"
            }) ??
            items.find((e) => {
              const t = loc((e.fields as Record<string, unknown>)?.sitemapType) as string | null | undefined
              return t == null
            }) ??
            items[0] ??
            null

          if (rootItem) {
            resolvedSitemapEntryId = rootItem.sys.id
            // Read the display name for the breadcrumb root label
            const f = rootItem.fields as Record<string, unknown>
            const name =
              (loc(f?.internalName) as string | undefined) ??
              (loc(f?.name) as string | undefined) ??
              "Sitemap"
            setSitemapEntryName(name)
            // Count child sitemaps for mode detection (root only)
            const childLinks = (loc(f?.childSitemaps) as Array<unknown> | undefined) ?? []
            setChildSitemapCount(childLinks.length)
          }

          // Detect if the currently-open entry is a child Sitemap entry
          const currentEntryIsChild = items.some((e) => {
            const t = loc((e.fields as Record<string, unknown>)?.sitemapType) as string | null | undefined
            return e.sys.id === sdk.entry.getSys().id && t === "child"
          })
          setIsChildSitemap(currentEntryIsChild)
          if (currentEntryIsChild) {
            const currentItem = items.find((e) => e.sys.id === sdk.entry.getSys().id)
            if (currentItem) {
              const cf = currentItem.fields as Record<string, unknown>
              const ctIds = (loc(cf?.contentTypes) as string[] | undefined) ?? []
              setThisChildContentTypes(ctIds)
            }
          }
        }
      } catch { /* no sitemap entry available yet */ }

      setEntryId(resolvedSitemapEntryId)

      // ── 2. Load folderConfig from root Sitemap entry ──
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
        // Never treat Sitemap CT entries as page tree nodes
        if (resolvedSitemapCtId && ctId === resolvedSitemapCtId) continue

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
            // Extra safety: filter out any entry whose content type is the sitemap CT
            if (
              resolvedSitemapCtId &&
              (item as { sys: { contentType?: { sys?: { id?: string } } } }).sys?.contentType?.sys?.id === resolvedSitemapCtId
            ) continue
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
  }, [sdk, enabledContentTypes, contentTypeConfigs, installation?.sitemapContentTypeId])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const currentEntryId = !isSitemapEntry ? sdk.entry.getSys().id : null

  // ─── Subscribe to sitemapMetadata changes from the field editor ───────────────
  // When the field editor moves this entry to a different folder, re-fetch so the
  // sitemap tree reflects the change. Guard with isSavingMetaRef to skip our own writes.
  useEffect(() => {
    if (isSitemapEntry) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaField = (sdk.entry as any)?.fields?.["sitemapMetadata"]
    if (!metaField?.onValueChanged) return
    const unsub = metaField.onValueChanged(() => {
      if (isSavingMetaRef.current) return
      fetchEntries()
    })
    return () => unsub?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSitemapEntry, fetchEntries, sdk])

  // Subscribe to excludeFromSitemap changes from the Editor tab radio button
  useEffect(() => {
    if (isSitemapEntry) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const excludeField = (sdk.entry as any)?.fields?.["excludeFromSitemap"]
    if (!excludeField?.onValueChanged) return
    const unsub = excludeField.onValueChanged((newVal: boolean | undefined) => {
      if (isSavingExcludeRef.current) return
      const excluded = newVal ?? false
      const entryId = sdk.entry.getSys().id
      setSitemap((prev) => {
        if (!prev) return prev
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === entryId) return { ...node, excludeFromSitemap: excluded }
          return { ...node, children: node.children.map(updateNode) }
        }
        return updateNode(prev)
      })
    })
    return () => unsub?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSitemapEntry, sdk])

  // Subscribe to contentTypes field changes when viewing a child Sitemap entry
  useEffect(() => {
    if (!isSitemapEntry || !isChildSitemap) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctField = (sdk.entry as any)?.fields?.["contentTypes"]
    if (!ctField?.onValueChanged) return
    const unsub = ctField.onValueChanged((val: string[] | undefined) => {
      if (isSavingCtRef.current) return
      setThisChildContentTypes(val ?? [])
    })
    return () => unsub?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSitemapEntry, isChildSitemap, sdk])

  /**
   * Write sitemapMetadata via the SDK field setter for the currently-open entry.
   * This triggers onValueChanged in the field editor iframe so the slug field stays
   * in sync without requiring a page reload.
   */
  const writeCurrentEntryMeta = useCallback(async (meta: SitemapMetadata) => {
    if (!currentEntryId) return
    isSavingMetaRef.current = true
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sdk.entry as any)?.fields?.["sitemapMetadata"]?.setValue(meta)
    } catch { /* field may not be accessible from editor SDK */ }
    // Reset after a tick so the onValueChanged fires and is suppressed, then clears
    setTimeout(() => { isSavingMetaRef.current = false }, 300)
  }, [currentEntryId, sdk])

  /**
   * Recompute and persist computedPath for all page entries that are descendants of
   * a given folder/node in the tree. Also notifies the field editor for the current entry.
   */
  const cascadePathUpdates = useCallback(async (
    tree: SitemapNode,
    folderId: string,
    pageEntryIds: Set<string>,
  ) => {
    const descendantIds = collectDescendantPageIds(tree, folderId, pageEntryIds)
    for (const pageId of descendantIds) {
      try {
        const pageEntry = await sdk.cma.entry.get({ entryId: pageId })
        const existingMeta = (pageEntry.fields?.sitemapMetadata?.["en-US"]) as SitemapMetadata | undefined
        const newPath = computeFullPath(tree, pageId)
        const newMeta: SitemapMetadata = {
          parentEntryId: existingMeta?.parentEntryId ?? null,
          computedPath: newPath,
        }
        await sdk.cma.entry.update(
          { entryId: pageId },
          { ...pageEntry, fields: { ...pageEntry.fields, sitemapMetadata: { "en-US": newMeta } } }
        )
        if (pageId === currentEntryId) {
          await writeCurrentEntryMeta(newMeta)
        }
      } catch (e) {
        console.error(`Failed to cascade computedPath for ${pageId}:`, e)
      }
    }
  }, [sdk, currentEntryId, writeCurrentEntryMeta])

  useEffect(() => {
    if (sitemap && currentEntryId && selectedNodeId === null) {
      setSelectedNodeId(currentEntryId)
    }
  }, [sitemap, currentEntryId, selectedNodeId])

  // ─── Sitemap change handler ───────────────────────────────────────────────────

  const handleSitemapChange = useCallback(
    async (newSitemap: SitemapNode) => {
      setSitemap(newSitemap)
      if (!originalSitemap) return

      const changed = findChangedParentIds(originalSitemap, newSitemap)
      const realEntryIds = new Set(entries.map((e) => e.id))

      const currentFolders = folderConfigRef.current
      const folderIds = new Set(currentFolders.map((f) => f.id))

      const changedPages = changed.filter(({ id }) => realEntryIds.has(id))
      const changedFolders = changed.filter(({ id }) =>
        !realEntryIds.has(id) && id !== "root" && folderIds.has(id)
      )

      if (changedPages.length === 0 && changedFolders.length === 0) return

      setSaveStatus("saving")
      try {
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
          // Notify the field editor iframe so its onValueChanged fires immediately
          if (id === currentEntryId) {
            await writeCurrentEntryMeta(newMeta)
          }
        }

        if (changedFolders.length > 0) {
          const updatedFolders = currentFolders.map((f) => {
            const change = changedFolders.find((c) => c.id === f.id)
            if (change) return { ...f, parentId: change.newParentId }
            return f
          })
          await saveFolderConfig(updatedFolders)

          // Cascade computedPath to all page entries under each re-parented folder
          for (const { id: folderId } of changedFolders) {
            await cascadePathUpdates(newSitemap, folderId, realEntryIds)
          }
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
    [sdk, originalSitemap, entries, folderConfig, saveFolderConfig, currentEntryId, writeCurrentEntryMeta, cascadePathUpdates]
  )

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

  // ─── Folder CRUD ──────────────────────────────────────────────────────────────

  const handleCreateFolder = useCallback(async (
    parentId: string | null,
    title: string,
    slug: string,
  ): Promise<SitemapNode> => {
    const newId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newFolder: FolderNode = { id: newId, title, slug, parentId }
    const updatedFolders = [...folderConfigRef.current, newFolder]
    await saveFolderConfig(updatedFolders)
    return { id: newId, title, slug, type: "section", status: "published", children: [], isExpanded: true }
  }, [saveFolderConfig])

  // ─── Entry CRUD ───────────────────────────────────────────────────────────────

  const handleRenameEntry = useCallback(async (nodeId: string, newTitle: string) => {
    const currentFolders = folderConfigRef.current
    const isFolder = currentFolders.some((f) => f.id === nodeId)

    if (isFolder) {
      const newSlug = slugify(newTitle)
      await saveFolderConfig(currentFolders.map((f) =>
        f.id === nodeId ? { ...f, title: newTitle, slug: newSlug } : f
      ))
      // Build updated tree, set it, then cascade path updates to all descendants
      if (sitemap) {
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === nodeId) return { ...node, title: newTitle, slug: newSlug }
          return { ...node, children: node.children.map(updateNode) }
        }
        const updatedTree = updateNode(sitemap)
        setSitemap(updatedTree)
        const realEntryIds = new Set(entries.map((e) => e.id))
        await cascadePathUpdates(updatedTree, nodeId, realEntryIds)
      }
      return
    }

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

    setSitemap((prev) => {
      if (!prev) return prev
      const updateNode = (node: SitemapNode): SitemapNode => {
        if (node.id === nodeId) return { ...node, title: newTitle }
        return { ...node, children: node.children.map(updateNode) }
      }
      return updateNode(prev)
    })
  }, [sdk, entries, sitemap, getTitleFieldId, saveFolderConfig, cascadePathUpdates])

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
      const folder = currentFolders.find((f) => f.id === nodeId)!
      const newFolderParentId = folder.parentId

      const updatedFolders = currentFolders
        .filter((f) => f.id !== nodeId)
        .map((f) => f.parentId === nodeId ? { ...f, parentId: newFolderParentId } : f)
      await saveFolderConfig(updatedFolders)

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
    const currentFolders = folderConfigRef.current
    const isFolder = currentFolders.some((f) => f.id === nodeId)
    if (isFolder) {
      await saveFolderConfig(currentFolders.map((f) =>
        f.id === nodeId ? { ...f, title: data.title, slug: data.slug } : f
      ))
      if (sitemap) {
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === nodeId) return { ...node, title: data.title, slug: data.slug }
          return { ...node, children: node.children.map(updateNode) }
        }
        const updatedTree = updateNode(sitemap)
        setSitemap(updatedTree)
        const realEntryIds = new Set(entries.map((e) => e.id))
        await cascadePathUpdates(updatedTree, nodeId, realEntryIds)
      } else {
        setSitemap((prev) => {
          if (!prev) return prev
          const updateNode = (node: SitemapNode): SitemapNode => {
            if (node.id === nodeId) return { ...node, title: data.title, slug: data.slug }
            return { ...node, children: node.children.map(updateNode) }
          }
          return updateNode(prev)
        })
      }
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
  }, [sdk, entries, sitemap, contentTypeConfigs, getTitleFieldId, saveFolderConfig, cascadePathUpdates])

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
        const ctId = entry.sys.contentType?.sys?.id ?? ""
        const hasField = await sdk.cma.contentType
          .get({ contentTypeId: ctId })
          .then((ct) => ct.fields.some((f) => f.id === "excludeFromSitemap"), () => false)
        if (!hasField) return
        await sdk.cma.entry.update(
          { entryId: nodeId },
          { ...entry, fields: { ...entry.fields, excludeFromSitemap: { "en-US": excluded } } }
        )
        // Notify the Editor tab's radio button for the currently-open entry
        if (nodeId === currentEntryId) {
          isSavingExcludeRef.current = true
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sdk.entry as any)?.fields?.["excludeFromSitemap"]?.setValue(excluded)
          } catch { /* field may not be accessible from editor SDK */ }
          setTimeout(() => { isSavingExcludeRef.current = false }, 300)
        }
      } catch (e) {
        console.error("Failed to update excludeFromSitemap:", e)
      }
    },
    [sdk, sitemap, currentEntryId]
  )

  // ─── Child sitemap content-type membership callbacks ──────────────────────────

  const handleAddContentTypeToChild = useCallback(async (ctId: string) => {
    if (!isSitemapEntry || !isChildSitemap) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const field = (sdk.entry as any)?.fields?.["contentTypes"]
    if (!field) return
    const current = (field.getValue() as string[] | undefined) ?? []
    if (current.includes(ctId)) return
    isSavingCtRef.current = true
    try {
      await field.setValue([...current, ctId])
    } catch { /* field may not be accessible */ }
    setTimeout(() => { isSavingCtRef.current = false }, 300)
    setThisChildContentTypes((prev) => [...prev, ctId])
  }, [isSitemapEntry, isChildSitemap, sdk])

  const handleRemoveContentTypeFromChild = useCallback(async (ctId: string) => {
    if (!isSitemapEntry || !isChildSitemap) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const field = (sdk.entry as any)?.fields?.["contentTypes"]
    if (!field) return
    const current = (field.getValue() as string[] | undefined) ?? []
    if (!current.includes(ctId)) return
    isSavingCtRef.current = true
    try {
      await field.setValue(current.filter((id) => id !== ctId))
    } catch { /* field may not be accessible */ }
    setTimeout(() => { isSavingCtRef.current = false }, 300)
    setThisChildContentTypes((prev) => prev.filter((id) => id !== ctId))
  }, [isSitemapEntry, isChildSitemap, sdk])

  // ─── Derived state ────────────────────────────────────────────────────────────

  const derivedSelectedNode = sitemap && selectedNodeId ? findNode(sitemap, selectedNodeId) : null
  const selectedEntry = selectedNodeId ? entries.find((e) => e.id === selectedNodeId) ?? null : null

  /**
   * Compute breadcrumb with the root label replaced by the actual Sitemap entry name.
   * getBreadcrumb returns e.g. ["root", "Folder A", "My Page"] — replace index 0
   * with sitemapEntryName so users see "Main Sitemap / Folder A / My Page".
   */
  const rawBreadcrumb =
    sitemap && derivedSelectedNode ? getBreadcrumb(sitemap, derivedSelectedNode.id) : null
  const breadcrumb = rawBreadcrumb
    ? [sitemapEntryName, ...rawBreadcrumb.slice(1)]
    : null

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
            {isSitemapEntry
              ? isChildSitemap
                ? sitemapEntryName
                : childSitemapCount > 0
                  ? `${sitemapEntryName} — Sitemap index (${childSitemapCount} ${childSitemapCount === 1 ? "child" : "children"})`
                  : `${sitemapEntryName} — Single sitemap`
              : "Sitemap"}
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

      {/* Main content — resizable split */}
      <main ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div
          className={`shrink-0 p-4 ${showMobile ? "hidden lg:block" : "block"}`}
          style={{ width: leftPanelWidth }}
        >
          <SitemapPanelWithCallback
            onSelectNode={setSelectedNodeId}
            sitemap={sitemap}
            onSitemapChange={handleSitemapChange}
            currentPageId={currentEntryId ?? undefined}
            sitemapName={sitemapEntryName}
            isChildSitemap={isChildSitemap}
            childContentTypes={thisChildContentTypes}
            allContentTypes={enabledContentTypes}
            onAddContentTypeToChild={handleAddContentTypeToChild}
            onRemoveContentTypeFromChild={handleRemoveContentTypeFromChild}
            onRenameEntry={handleRenameEntry}
            onDuplicateEntry={handleDuplicateEntry}
            onDeleteEntry={handleDeleteEntry}
            onOpenEntryNewTab={handleOpenEntryNewTab}
            onCreateFolder={handleCreateFolder}
          />
        </div>

        {/* Drag handle */}
        <div
          className="hidden lg:flex items-center justify-center w-1 cursor-col-resize bg-[var(--cf-gray-200)] hover:bg-[var(--cf-blue-300)] transition-colors select-none shrink-0"
          onMouseDown={handleDragHandleMouseDown}
          style={{ userSelect: "none" }}
        />

        {/* Right panel */}
        <div
          className={`flex-1 p-4 pl-3 overflow-hidden ${
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
