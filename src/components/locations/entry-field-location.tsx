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
import { Globe, Folder, X, Home, ChevronDown, ChevronUp, Check } from "lucide-react"

interface ParentEntry {
  id: string
  title: string
  slug: string | null
  isFolder: boolean
}

/** Read en-US locale value from a CMA field (typed as unknown). */
const loc = (field: unknown): unknown =>
  (field as Record<string, unknown> | undefined)?.["en-US"]

export function EntryFieldLocation() {
  const sdk = useSDK<FieldAppSDK>()
  useAutoResizer()

  const installation = sdk.parameters.installation as AppInstallationParameters
  const baseUrl = installation?.baseUrl ?? "https://smu.edu"
  const isMetadataField = sdk.field.type === "Object"

  // All hooks must be called unconditionally — no early returns before this line
  const [slug, setSlug] = useState<string>("")
  const [metadata, setMetadata] = useState<SitemapMetadata | null>(null)
  const [parentEntry, setParentEntry] = useState<ParentEntry | null>(null)
  const [allEntries, setAllEntries] = useState<ParentEntry[]>([])
  const [folderListOpen, setFolderListOpen] = useState(false)
  const [folderSearch, setFolderSearch] = useState("")

  /**
   * Fetch:
   *  1. FolderNode[] from the root Sitemap entry's `folderConfig` field
   *  2. Page entries from enabled content types (for parent selection)
   * Combines both into the `allEntries` picker list.
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
                })
              }
            }
          }
        } catch { /* no sitemap entry yet */ }
      }

      // ── 2. Fetch page entries from enabled content types ──
      const enabledTypes = installation?.enabledContentTypes ?? []
      for (const ctId of enabledTypes) {
        const response = await sdk.cma.entry.getMany({
          query: {
            content_type: ctId,
            limit: 200,
            "sys.id[ne]": sdk.entry.getSys().id,
          },
        })

        const configs = installation?.contentTypeConfigs ?? {}
        const slugFieldId = configs[ctId]?.slugFieldId ?? "slug"

        let titleFieldId = "title"
        try {
          const ctDef = await sdk.cma.contentType.get({ contentTypeId: ctId })
          titleFieldId = ctDef.displayField ?? "title"
        } catch { /* fall back to "title" */ }

        for (const item of response.items ?? []) {
          const fields = item.fields as Record<string, unknown>
          const titleRaw = loc(fields[titleFieldId]) ?? loc(fields["title"])
          const title =
            typeof titleRaw === "string" ? titleRaw : item.sys.id

          const slugRaw = loc(fields[slugFieldId])
          const entrySlug = typeof slugRaw === "string" ? slugRaw : null

          results.push({ id: item.sys.id, title, slug: entrySlug, isFolder: false })
        }
      }

      setAllEntries(results)

      // Resolve current parent entry
      const parentId = metadata?.parentEntryId
      if (parentId) {
        const parent = results.find((e) => e.id === parentId)
        setParentEntry(parent ?? null)
      }
    } catch (e) {
      console.error("Failed to fetch entries for parent picker:", e)
    }
  }, [sdk, installation, metadata?.parentEntryId, isMetadataField])

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

  // Resolve parent label when metadata changes
  useEffect(() => {
    if (metadata?.parentEntryId && allEntries.length > 0) {
      const parent = allEntries.find((e) => e.id === metadata.parentEntryId)
      setParentEntry(parent ?? null)
    } else {
      setParentEntry(null)
    }
  }, [metadata?.parentEntryId, allEntries])

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
      await metadataField.setValue({
        parentEntryId: parentId,
        computedPath: parentId
          ? `${parentEntry?.slug ? `/${parentEntry.slug}` : ""}/${newSlug}`
          : `/${newSlug}`,
      } satisfies SitemapMetadata)
    }
  }

  const handleSetParent = async (parentId: string | null) => {
    const parent = parentId ? allEntries.find((e) => e.id === parentId) ?? null : null
    setParentEntry(parent)

    const metadataField = sdk.entry.fields["sitemapMetadata"]
    if (metadataField) {
      const newMeta: SitemapMetadata = {
        parentEntryId: parentId,
        computedPath: parentId
          ? `/${parent?.slug ?? ""}/${slug}`
          : `/${slug}`,
      }
      await metadataField.setValue(newMeta)
      setMetadata(newMeta)
    }
    setFolderListOpen(false)
    setFolderSearch("")
  }

  const filteredEntries = folderSearch.trim()
    ? allEntries.filter(
        (e) =>
          e.title.toLowerCase().includes(folderSearch.toLowerCase()) ||
          (e.slug ?? "").toLowerCase().includes(folderSearch.toLowerCase())
      )
    : allEntries

  const currentParentId = metadata?.parentEntryId ?? null

  return (
    <div className="p-3 space-y-4">
      {/* URL Slug */}
      <div className="space-y-2">
        <Label className="text-sm text-[var(--cf-gray-600)]">URL Slug</Label>
        <div className="flex items-center gap-1 p-2 border border-[var(--cf-gray-300)] rounded-md bg-white min-h-[36px] flex-wrap">
          {/* Parent badge */}
          {parentEntry && (
            <span className="flex items-center gap-1">
              <Badge
                variant="secondary"
                className="bg-[var(--cf-blue-100)] text-[var(--cf-blue-600)] hover:bg-[var(--cf-blue-200)] px-2 py-0.5 text-xs font-mono flex items-center gap-1 shrink-0"
              >
                <Folder className="h-3 w-3" />
                {parentEntry.slug ?? parentEntry.title}
                <button
                  type="button"
                  onClick={() => handleSetParent(null)}
                  className="ml-0.5 rounded-full hover:bg-[var(--cf-blue-300)] p-0.5 transition-colors"
                  aria-label="Remove parent"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
              <span className="text-[var(--cf-gray-400)] text-sm font-mono">/</span>
            </span>
          )}
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
              setFolderListOpen((v) => !v)
              setFolderSearch("")
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
                  placeholder="Search folders and pages..."
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
                    <Check className="h-3.5 w-3.5 ml-auto text-[var(--cf-blue-500)]" />
                  )}
                </button>
                {filteredEntries.map((entry) => {
                  const isCurrent = currentParentId === entry.id
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      title={entry.id}
                      onClick={() => handleSetParent(entry.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--cf-gray-50)] transition-colors ${
                        isCurrent ? "bg-[var(--cf-blue-50)]" : ""
                      }`}
                    >
                      <Folder className={`h-4 w-4 shrink-0 ${entry.isFolder ? "text-[var(--cf-blue-500)]" : "text-[var(--cf-gray-400)]"}`} />
                      <span className={`flex-1 truncate ${isCurrent ? "font-medium text-[var(--cf-gray-900)]" : "text-[var(--cf-gray-700)]"}`}>
                        {entry.title}
                      </span>
                      {isCurrent && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--cf-blue-500)]" />
                      )}
                      {!isCurrent && entry.slug && (
                        <span className="text-xs text-[var(--cf-gray-400)] font-mono shrink-0">
                          /{entry.slug}
                        </span>
                      )}
                    </button>
                  )
                })}
                {filteredEntries.length === 0 && (
                  <p className="px-3 py-3 text-xs text-[var(--cf-gray-400)] italic">No folders or pages found.</p>
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
