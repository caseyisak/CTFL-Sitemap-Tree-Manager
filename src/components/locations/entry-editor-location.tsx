"use client"

import { useEffect, useState, useCallback } from "react"
import { useSDK } from "@contentful/react-apps-toolkit"
import type { EditorAppSDK } from "@contentful/app-sdk"
import type { AppInstallationParameters, ContentfulPageEntry, SitemapMetadata } from "@/lib/contentful-types"
import {
  buildSitemapTree,
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
  const isSitemapEntry = sdk.ids.contentType === "sitemap"

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ContentfulPageEntry[]>([])
  const [sitemap, setSitemap] = useState<SitemapNode | null>(null)
  const [originalSitemap, setOriginalSitemap] = useState<SitemapNode | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [showMobile, setShowMobile] = useState(false)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const allEntries: ContentfulPageEntry[] = []
      const typesToFetch = isSitemapEntry
        ? enabledContentTypes
        : enabledContentTypes.filter((ct) => ct === sdk.ids.contentType)

      const fetchTypes = typesToFetch.length > 0 ? typesToFetch : enabledContentTypes

      for (const ctId of fetchTypes) {
        const slugFieldId = contentTypeConfigs[ctId]?.slugFieldId ?? "slug"
        // Resolve display field for title extraction
        let titleFieldId = "title"
        try {
          const ctDef = await sdk.cma.contentType.get({ contentTypeId: ctId })
          titleFieldId = ctDef.displayField ?? "title"
        } catch { /* fall back to "title" */ }

        // Paginate up to 1000 entries per content type
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
      const tree = buildSitemapTree(allEntries)
      setSitemap(tree)
      setOriginalSitemap(JSON.parse(JSON.stringify(tree)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [sdk, enabledContentTypes, contentTypeConfigs, isSitemapEntry])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const currentEntryId = !isSitemapEntry ? sdk.entry.getSys().id : null

  // Auto-select the current entry once the sitemap is loaded
  useEffect(() => {
    if (sitemap && currentEntryId && selectedNodeId === null) {
      setSelectedNodeId(currentEntryId)
    }
  }, [sitemap, currentEntryId, selectedNodeId])

  const handleSitemapChange = useCallback(
    async (newSitemap: SitemapNode) => {
      setSitemap(newSitemap)

      if (!originalSitemap) return

      const changed = findChangedParentIds(originalSitemap, newSitemap)
      // Only persist changes for real Contentful entries — skip locally-added nodes
      const realEntryIds = new Set(entries.map((e) => e.id))
      const changedReal = changed.filter(({ id }) => realEntryIds.has(id))
      if (changedReal.length === 0) return

      setSaveStatus("saving")
      try {
        for (const { id, newParentId } of changedReal) {
          const entry = await sdk.cma.entry.get({ entryId: id })
          const ctId = entry.sys.contentType?.sys?.id ?? ""
          const slugFieldId = contentTypeConfigs[ctId]?.slugFieldId ?? "slug"

          const existingMeta = entry.fields?.["sitemapMetadata"]?.["en-US"] as
            | SitemapMetadata
            | undefined

          const pageEntry = entries.find((e) => e.id === id)
          const slug = pageEntry?.slug ?? ""

          const newMeta: SitemapMetadata = {
            parentEntryId: newParentId,
            computedPath: newParentId
              ? (() => {
                  const parent = entries.find((e) => e.id === newParentId)
                  return `/${parent?.slug ?? ""}/${slug}`
                })()
              : `/${slug}`,
          }

          const updatedEntry = {
            ...entry,
            fields: {
              ...entry.fields,
              sitemapMetadata: { "en-US": newMeta },
            },
          }

          await sdk.cma.entry.update(
            { entryId: id },
            updatedEntry
          )
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
    [sdk, originalSitemap, entries, contentTypeConfigs]
  )

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

  // Find node by ID in the tree
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

  // Helper: get display field ID for a content type
  const getTitleFieldId = useCallback(async (ctId: string): Promise<string> => {
    try {
      const ctDef = await sdk.cma.contentType.get({ contentTypeId: ctId })
      return ctDef.displayField ?? "title"
    } catch {
      return "title"
    }
  }, [sdk])

  const handleRenameEntry = useCallback(async (nodeId: string, newTitle: string) => {
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
    // Update local tree regardless (covers local-only nodes too)
    setSitemap((prev) => {
      if (!prev) return prev
      const updateNode = (node: SitemapNode): SitemapNode => {
        if (node.id === nodeId) return { ...node, title: newTitle }
        return { ...node, children: node.children.map(updateNode) }
      }
      return updateNode(prev)
    })
  }, [sdk, entries, getTitleFieldId])

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
    const realEntry = entries.find((e) => e.id === nodeId)
    if (realEntry) {
      try {
        await sdk.cma.entry.delete({ entryId: nodeId })
        setEntries((prev) => prev.filter((e) => e.id !== nodeId))
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e)
        console.error("Delete failed:", msg, e)
        return
      }
    }
    setSitemap((prev) => {
      if (!prev) return prev
      const removeNode = (node: SitemapNode): SitemapNode => ({
        ...node,
        children: node.children
          .filter((c) => c.id !== nodeId)
          .map(removeNode),
      })
      return removeNode(prev)
    })
    setOriginalSitemap((prev) => {
      if (!prev) return prev
      const removeNode = (node: SitemapNode): SitemapNode => ({
        ...node,
        children: node.children
          .filter((c) => c.id !== nodeId)
          .map(removeNode),
      })
      return removeNode(prev)
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }, [sdk, entries, selectedNodeId])

  const handleOpenEntryNewTab = useCallback((nodeId: string) => {
    const envId = sdk.ids.environment ?? "master"
    window.open(
      `https://app.contentful.com/spaces/${sdk.ids.space}/environments/${envId}/entries/${nodeId}`,
      "_blank"
    )
  }, [sdk])

  const handleSaveDetails = useCallback(async (nodeId: string, data: { title: string; slug: string }) => {
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
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      console.error("Save failed:", msg, e)
      setSaveStatus("error")
    }
  }, [sdk, contentTypeConfigs, getTitleFieldId])

  const handleExcludeFromSitemap = useCallback(
    async (nodeId: string, excluded: boolean) => {
      // Optimistically update local tree
      if (sitemap) {
        const updateNode = (node: SitemapNode): SitemapNode => {
          if (node.id === nodeId) return { ...node, excludeFromSitemap: excluded }
          return { ...node, children: node.children.map(updateNode) }
        }
        setSitemap(updateNode(sitemap))
      }
      // Persist to Contentful entry
      try {
        const entry = await sdk.cma.entry.get({ entryId: nodeId })
        await sdk.cma.entry.update(
          { entryId: nodeId },
          {
            ...entry,
            fields: {
              ...entry.fields,
              excludeFromSitemap: { "en-US": excluded },
            },
          }
        )
      } catch (e) {
        console.error("Failed to update excludeFromSitemap:", e)
      }
    },
    [sdk, sitemap]
  )

  const derivedSelectedNode =
    sitemap && selectedNodeId ? findNode(sitemap, selectedNodeId) : null
  const selectedEntry = selectedNodeId ? entries.find((e) => e.id === selectedNodeId) ?? null : null
  const breadcrumb =
    sitemap && derivedSelectedNode
      ? getBreadcrumb(sitemap, derivedSelectedNode.id)
      : null

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
        {/* Sitemap panel */}
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
          />
        </div>

        {/* Details panel */}
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
