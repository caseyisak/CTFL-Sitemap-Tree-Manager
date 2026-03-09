"use client"

import { useEffect, useState, useCallback } from "react"
import { useSDK, useAutoResizer } from "@contentful/react-apps-toolkit"
import type { FieldAppSDK } from "@contentful/app-sdk"
import type { AppInstallationParameters, FolderNode, SitemapMetadata } from "@/lib/contentful-types"
import { slugify } from "@/lib/sitemap-utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Globe, Folder, X, Home, ChevronDown, ChevronUp } from "lucide-react"

interface ParentEntry {
  id: string
  title: string
  slug: string | null
  isFolder: boolean
  parentId: string | null
}

/** Read en-US locale value from a CMA field (typed as unknown). */
const loc = (field: unknown): unknown =>
  (field as Record<string, unknown> | undefined)?.["en-US"]

/** Walk up the folder hierarchy to build an ordered chain from root to immediate parent. */
function buildParentChain(folders: ParentEntry[], immediateParentId: string | null): ParentEntry[] {
  if (!immediateParentId) return []
  const chain: ParentEntry[] = []
  let currentId: string | null = immediateParentId
  const visited = new Set<string>()
  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const folder = folders.find((f) => f.id === currentId)
    if (!folder) break
    chain.unshift(folder)
    currentId = folder.parentId
  }
  return chain
}

/** Compute the full URL slug path from an ancestor chain + own slug. */
function computeFullSlugPath(chain: ParentEntry[], slug: string): string {
  const parts = [...chain.map((f) => f.slug).filter((s): s is string => Boolean(s)), slug].filter(Boolean)
  return parts.length ? `/${parts.join("/")}` : `/${slug}`
}

export function EntryFieldLocation() {
  const sdk = useSDK<FieldAppSDK>()
  useAutoResizer()

  const installation = sdk.parameters.installation as AppInstallationParameters
  const baseUrl = installation?.baseUrl ?? ""
  const isMetadataField = sdk.field.type === "Object"

  // All hooks must be called unconditionally — no early returns before this line
  const [slug, setSlug] = useState<string>("")
  const [metadata, setMetadata] = useState<SitemapMetadata | null>(null)
  const [allEntries, setAllEntries] = useState<ParentEntry[]>([])
  const [folderListOpen, setFolderListOpen] = useState(false)
  const [folderSearch, setFolderSearch] = useState("")

  /**
   * Fetch FolderNode[] from the root Sitemap entry's `folderConfig` field.
   * Only folders are shown in the "Move to folder" picker — page entries are excluded.
   */
  const fetchAllEntries = useCallback(async () => {
    if (isMetadataField) return

    try {
      const results: ParentEntry[] = []

      // ── 1. Fetch folders from root Sitemap entry ──
      let sitemapCtId = installation?.sitemapContentTypeId ?? null
      if (!sitemapCtId) {
        try {
          const ctResp = await sdk.cma.contentType.getMany({ query: { limit: 200 } })
          const sitemapCt =
            (ctResp.items ?? []).find((ct) => ct.sys.id === "sitemap") ??
            (ctResp.items ?? []).find((ct) => ct.name.toLowerCase() === "sitemap")
          sitemapCtId = sitemapCt?.sys.id ?? null
        } catch { /* CT lookup failed — skip folders */ }
      }

      if (sitemapCtId) {
        try {
          const resp = await sdk.cma.entry.getMany({
            query: { content_type: sitemapCtId, limit: 10 },
          })
          const items = resp.items ?? []

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
            const raw = loc((rootItem.fields as Record<string, unknown>)?.folderConfig)
            if (Array.isArray(raw)) {
              for (const folder of raw as FolderNode[]) {
                results.push({
                  id: folder.id,
                  title: folder.title,
                  slug: folder.slug ?? null,
                  isFolder: true,
                  parentId: folder.parentId ?? null,
                })
              }
            }
          }
        } catch { /* no sitemap entry yet */ }
      }

      setAllEntries(results)
    } catch (e) {
      console.error("Failed to fetch entries for parent picker:", e)
    }
  }, [sdk, installation, isMetadataField])

  useEffect(() => {
    if (isMetadataField) return

    // Load initial slug value
    const currentSlug = sdk.field.getValue() as string | undefined
    if (currentSlug) {
      setSlug(currentSlug)
    } else {
      // Auto-generate from title if empty
      const titleField = sdk.entry.fields["title"]
      if (titleField) {
        const titleValue = titleField.getValue() as string | undefined
        if (titleValue) {
          setSlug(slugify(titleValue))
        }
      }
    }

    // Load sitemapMetadata
    const metadataField = sdk.entry.fields["sitemapMetadata"]
    if (metadataField) {
      const metaValue = metadataField.getValue() as SitemapMetadata | undefined
      if (metaValue) setMetadata(metaValue)
    }

    // Subscribe to metadata changes
    let unsubMeta: (() => void) | undefined
    if (sdk.entry.fields["sitemapMetadata"]) {
      unsubMeta = sdk.entry.fields["sitemapMetadata"].onValueChanged(
        (val: SitemapMetadata | undefined) => {
          setMetadata(val ?? null)
        }
      )
    }

    fetchAllEntries()

    return () => {
      unsubMeta?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMetadataField])

  // Gracefully handle the sitemapMetadata JSON field
  if (isMetadataField) {
    return (
      <div className="p-3 text-xs text-[var(--cf-gray-500)]">
        Sitemap metadata is managed automatically.
      </div>
    )
  }

  const computedFullUrl = (() => {
    const path = metadata?.computedPath ?? `/${slug}`
    return `${baseUrl}${path}`
  })()

  const handleSlugChange = async (newSlug: string) => {
    setSlug(newSlug)
    await sdk.field.setValue(newSlug)

    const metadataField = sdk.entry.fields["sitemapMetadata"]
    if (metadataField) {
      const existingMeta = metadataField.getValue() as SitemapMetadata | undefined
      const parentId = existingMeta?.parentEntryId ?? null
      const chain = buildParentChain(allEntries, parentId)
      await metadataField.setValue({
        parentEntryId: parentId,
        computedPath: computeFullSlugPath(chain, newSlug),
      } satisfies SitemapMetadata)
    }
  }

  const handleSetParent = async (parentId: string | null) => {
    const metadataField = sdk.entry.fields["sitemapMetadata"]
    if (metadataField) {
      const chain = buildParentChain(allEntries, parentId)
      const newMeta: SitemapMetadata = {
        parentEntryId: parentId,
        computedPath: computeFullSlugPath(chain, slug),
      }
      await metadataField.setValue(newMeta)
      setMetadata(newMeta)
    }
    setFolderListOpen(false)
    setFolderSearch("")
  }

  // Derive the full ancestor chain for badge display and URL computation
  const parentChain = buildParentChain(allEntries, metadata?.parentEntryId ?? null)

  const currentParentId = metadata?.parentEntryId ?? null

  // Build tree-ordered list with depth for each folder (parents before their children)
  const treeOrderedEntries: Array<ParentEntry & { depth: number; fullPath: string }> = (() => {
    const depthMap = new Map<string, number>()
    const getDepth = (id: string): number => {
      if (depthMap.has(id)) return depthMap.get(id)!
      const folder = allEntries.find((f) => f.id === id)
      if (!folder || !folder.parentId) { depthMap.set(id, 0); return 0 }
      const d = getDepth(folder.parentId) + 1
      depthMap.set(id, d)
      return d
    }
    const buildOrder = (parentId: string | null): typeof treeOrderedEntries => {
      return allEntries
        .filter((e) => e.parentId === parentId)
        .flatMap((e) => {
          const depth = getDepth(e.id)
          const chain = buildParentChain(allEntries, e.parentId)
          const fullPath = computeFullSlugPath(chain, e.slug ?? "")
          return [{ ...e, depth, fullPath }, ...buildOrder(e.id)]
        })
    }
    return buildOrder(null)
  })()

  const isSearching = folderSearch.trim().length > 0
  const filteredEntries = isSearching
    ? treeOrderedEntries.filter(
        (e) =>
          e.title.toLowerCase().includes(folderSearch.toLowerCase()) ||
          e.fullPath.toLowerCase().includes(folderSearch.toLowerCase())
      )
    : treeOrderedEntries

  return (
    <div className="p-3 space-y-4">
      {/* URL Slug */}
      <div className="space-y-2">
        <Label className="text-sm text-[var(--cf-gray-600)]">URL Slug</Label>
        <div className="flex items-center gap-1 p-2 border border-[var(--cf-gray-300)] rounded-md bg-white min-h-[36px] flex-wrap">
          {/* Parent chain badges — one per ancestor folder */}
          {parentChain.map((folder, i) => (
            <span key={folder.id} className="flex items-center gap-1">
              <Badge
                variant="secondary"
                className="bg-[var(--cf-blue-100)] text-[var(--cf-blue-600)] hover:bg-[var(--cf-blue-200)] px-2 py-0.5 text-xs font-mono flex items-center gap-1 shrink-0"
              >
                <Folder className="h-3 w-3" />
                {folder.title}
                {i === parentChain.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleSetParent(null)}
                    className="ml-0.5 rounded-full hover:bg-[var(--cf-blue-300)] p-0.5 transition-colors"
                    aria-label="Remove parent"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
              <span className="text-[var(--cf-gray-400)] text-sm font-mono">/</span>
            </span>
          ))}
          {/* Editable slug */}
          <Input
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            className="flex-1 min-w-[100px] h-7 border-0 p-0 font-mono text-sm shadow-none focus-visible:ring-0"
            placeholder="page-slug"
          />
        </div>

        {/* Move to folder — inline collapsible (no floating popover) */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-[var(--cf-gray-500)] hover:text-[var(--cf-gray-700)]"
            onClick={() => {
              const opening = !folderListOpen
              setFolderListOpen(opening)
              setFolderSearch("")
              // Re-fetch on every open so renamed/deleted folders are always fresh
              if (opening) fetchAllEntries()
            }}
          >
            <Folder className="h-3 w-3 mr-1" />
            Move to folder...
            {folderListOpen ? (
              <ChevronUp className="h-3 w-3 ml-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </Button>

          {folderListOpen && (
            <div className="mt-1 border border-[var(--cf-gray-200)] rounded-md bg-white overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-[var(--cf-gray-100)]">
                <Input
                  autoFocus
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  placeholder="Search folders..."
                  className="h-7 text-xs"
                />
              </div>
              {/* List — no max-height, let autoResizer expand iframe */}
              <div>
                {/* Root option */}
                <button
                  type="button"
                  onClick={() => handleSetParent(null)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--cf-gray-50)] transition-colors ${
                    currentParentId === null ? "bg-[var(--cf-blue-50)]" : ""
                  }`}
                >
                  <Home className="h-4 w-4 text-[var(--cf-gray-500)]" />
                  <span className={currentParentId === null ? "font-medium" : ""}>Root (top level)</span>
                  {currentParentId === null && (
                    <span className="ml-auto shrink-0 bg-[var(--cf-blue-500)] text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                      Current
                    </span>
                  )}
                </button>
                {filteredEntries.map((entry) => {
                  const isCurrent = currentParentId === entry.id
                  const indentPx = isSearching ? 0 : entry.depth * 16
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      title={`folder ID: ${entry.id}`}
                      onClick={() => handleSetParent(entry.id)}
                      style={{ paddingLeft: `${12 + indentPx}px` }}
                      className={`w-full flex items-center gap-2 pr-3 py-2 text-sm text-left hover:bg-[var(--cf-gray-50)] transition-colors ${
                        isCurrent ? "bg-[var(--cf-blue-50)]" : ""
                      }`}
                    >
                      <Folder className={`h-4 w-4 shrink-0 ${entry.isFolder ? "text-[var(--cf-blue-500)]" : "text-[var(--cf-gray-400)]"}`} />
                      <span className={`flex-1 truncate ${isCurrent ? "font-medium text-[var(--cf-gray-900)]" : "text-[var(--cf-gray-700)]"}`}>
                        {entry.title}
                      </span>
                      {isCurrent && (
                        <span className="ml-auto shrink-0 bg-[var(--cf-blue-500)] text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                      {!isCurrent && (
                        <span className="text-xs text-[var(--cf-gray-400)] font-mono shrink-0">
                          {entry.fullPath}
                        </span>
                      )}
                    </button>
                  )
                })}
                {filteredEntries.length === 0 && (
                  <p className="px-3 py-3 text-xs text-[var(--cf-gray-400)] italic">No folders found.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full URL Path */}
      <div className="space-y-2">
        <Label className="text-sm text-[var(--cf-gray-600)]">Full URL Path</Label>
        <div className="relative">
          <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cf-gray-400)]" />
          <Input
            readOnly
            value={computedFullUrl}
            className="h-9 pl-8 font-mono text-sm bg-[var(--cf-gray-100)] text-[var(--cf-gray-600)] cursor-default select-all"
          />
        </div>
        <p className="text-xs text-[var(--cf-gray-500)]">
          This is the full URL where this page will be accessible
        </p>
      </div>
    </div>
  )
}
