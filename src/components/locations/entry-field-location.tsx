"use client"

import { useEffect, useState, useCallback } from "react"
import { useSDK, useAutoResizer } from "@contentful/react-apps-toolkit"
import type { FieldAppSDK } from "@contentful/app-sdk"
import type { AppInstallationParameters, SitemapMetadata } from "@/lib/contentful-types"
import { slugify } from "@/lib/sitemap-utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Globe, Folder, X, Home } from "lucide-react"

interface ParentEntry {
  id: string
  title: string
  slug: string | null
}

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
  const [popoverOpen, setPopoverOpen] = useState(false)

  // Fetch entries for parent selection
  const fetchAllEntries = useCallback(async () => {
    if (isMetadataField) return
    const enabledTypes = installation?.enabledContentTypes ?? []
    if (enabledTypes.length === 0) return

    try {
      const results: ParentEntry[] = []
      for (const ctId of enabledTypes) {
        const response = await sdk.cma.entry.getMany({
          query: {
            content_type: ctId,
            limit: 200,
            "sys.id[ne]": sdk.entry.getSys().id,
          },
        })
        for (const item of response.items ?? []) {
          const fields = item.fields ?? {}
          const titleField = fields["title"]
          const title =
            typeof titleField === "string"
              ? titleField
              : typeof titleField?.["en-US"] === "string"
                ? titleField["en-US"]
                : item.sys.id

          const configs = installation?.contentTypeConfigs ?? {}
          const slugFieldId = configs[ctId]?.slugFieldId ?? "slug"
          const slugField = fields[slugFieldId]
          const slug =
            typeof slugField === "string"
              ? slugField
              : typeof slugField?.["en-US"] === "string"
                ? slugField["en-US"]
                : null

          results.push({ id: item.sys.id, title, slug })
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
    setPopoverOpen(false)
  }

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

        {/* Move to folder */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-[var(--cf-gray-500)] hover:text-[var(--cf-gray-700)]"
            >
              <Folder className="h-3 w-3 mr-1" />
              Move to folder...
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search entries..." />
              <CommandList>
                <CommandEmpty>No entries found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => handleSetParent(null)}
                    className="flex items-center gap-2"
                  >
                    <Home className="h-4 w-4 text-[var(--cf-gray-500)]" />
                    <span>Root (top level)</span>
                  </CommandItem>
                  {allEntries.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      onSelect={() => handleSetParent(entry.id)}
                      className="flex items-center gap-2"
                    >
                      <Folder className="h-4 w-4 text-[var(--cf-blue-500)]" />
                      <span className="truncate">{entry.title}</span>
                      {entry.slug && (
                        <span className="text-xs text-[var(--cf-gray-400)] ml-auto font-mono shrink-0">
                          /{entry.slug}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
