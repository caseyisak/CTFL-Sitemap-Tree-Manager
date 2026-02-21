"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { SitemapNode } from "@/lib/sitemap-types"
import type { ContentfulPageEntry } from "@/lib/contentful-types"
import {
  FileText,
  Folder,
  Home,
  Calendar,
  Tag,
  Save,
  Globe,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Switch } from "@/components/ui/switch"

interface FolderInfo {
  id: string
  title: string
  path: string[]
}

interface DetailsPanelProps {
  node: SitemapNode | null
  entry?: ContentfulPageEntry | null
  breadcrumb: string[] | null
  parentPath?: string[] | null
  allFolders?: FolderInfo[]
  onMoveNode?: (nodeId: string, newParentId: string) => void
  baseUrl?: string
  onExcludeFromSitemap?: (nodeId: string, excluded: boolean) => void
  onSave?: (nodeId: string, data: { title: string; slug: string }) => Promise<void>
}

export function DetailsPanel({ node, entry, breadcrumb, parentPath, allFolders = [], onMoveNode, baseUrl = "https://example.com", onExcludeFromSitemap, onSave }: DetailsPanelProps) {
  const [title, setTitle] = useState(node?.title || "")
  const [slug, setSlug] = useState(node?.slug || "")
  const [status, setStatus] = useState<SitemapNode["status"]>(node?.status || "draft")
  const [saving, setSaving] = useState(false)

  // Extract just the page's own slug (last segment) from the full path
  const extractPageSlug = (fullSlug: string): string => {
    const parts = fullSlug.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : fullSlug
  }

  // Sync state when node changes - use node.id and breadcrumb to detect hierarchy changes
  useEffect(() => {
    if (node) {
      setTitle(node.title)
      // Extract just the page slug, not the full path
      setSlug(extractPageSlug(node.slug))
      setStatus(node.status)
    }
  }, [node?.id, node?.title, node?.slug, node?.status, breadcrumb])

  if (!node) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-[var(--cf-gray-200)]">
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cf-gray-100)] flex items-center justify-center">
              <FileText className="h-8 w-8 text-[var(--cf-gray-400)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--cf-gray-600)] mb-2">
              No page selected
            </h3>
            <p className="text-sm text-[var(--cf-gray-500)]">
              Select a page from the sitemap to view and edit its details
            </p>
          </div>
        </div>
      </div>
    )
  }

  const getNodeIcon = () => {
    if (node.type === "root") return <Home className="h-5 w-5 text-[var(--cf-blue-500)]" />
    if (node.type === "section") return <Folder className="h-5 w-5 text-[var(--cf-blue-500)]" />
    return <FileText className="h-5 w-5 text-[var(--cf-gray-500)]" />
  }

  const getStatusBadge = () => {
    switch (node.status) {
      case "published":
        return (
          <Badge className="bg-[var(--cf-green-100)] text-[var(--cf-green-500)] hover:bg-[var(--cf-green-100)]">
            Published
          </Badge>
        )
      case "draft":
        return (
          <Badge className="bg-[var(--cf-orange-100)] text-[var(--cf-orange-500)] hover:bg-[var(--cf-orange-100)]">
            Draft
          </Badge>
        )
      case "changed":
        return (
          <Badge className="bg-[var(--cf-blue-100)] text-[var(--cf-blue-500)] hover:bg-[var(--cf-blue-100)]">
            Changed
          </Badge>
        )
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-[var(--cf-gray-200)]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--cf-gray-200)]">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-[var(--cf-gray-100)]">
            {getNodeIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[var(--cf-gray-700)] truncate">
              {title || node.title}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {getStatusBadge()}
              <span className="text-xs text-[var(--cf-gray-500)] capitalize">
                {node.type}
              </span>
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        {breadcrumb && breadcrumb.length > 1 && (
          <div className="flex items-center gap-1 text-xs text-[var(--cf-gray-500)] overflow-x-auto pb-1">
            {breadcrumb.map((item, index) => (
              <span key={index} className="flex items-center shrink-0">
                {index > 0 && <ChevronRight className="h-3 w-3 mx-0.5" />}
                <span
                  className={cn(
                    index === breadcrumb.length - 1 && "text-[var(--cf-blue-600)] font-medium"
                  )}
                >
                  {item}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Basic Info */}
        <section>
          <h3 className="text-sm font-semibold text-[var(--cf-gray-600)] uppercase tracking-wide mb-3">
            Basic Information
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm text-[var(--cf-gray-600)]">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug" className="text-sm text-[var(--cf-gray-600)]">
                URL Slug
              </Label>
              <div className="flex items-center gap-1 p-2 border border-[var(--cf-gray-300)] rounded-md bg-white min-h-[36px] flex-wrap">
                {/* Parent path badges */}
                {breadcrumb && breadcrumb.length > 2 && (
                  <>
                    {breadcrumb.slice(1, -1).map((segment, index) => {
                      const segmentSlug = segment.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
                      return (
                        <span key={index} className="flex items-center gap-1">
                          <Badge 
                            variant="secondary" 
                            className="bg-[var(--cf-blue-100)] text-[var(--cf-blue-600)] hover:bg-[var(--cf-blue-200)] px-2 py-0.5 text-xs font-mono flex items-center gap-1 shrink-0"
                          >
                            <Folder className="h-3 w-3" />
                            {segmentSlug}
                            <button
                              type="button"
                              onClick={() => {
                                // Move node to the parent of this segment (or root)
                                if (onMoveNode && node && parentPath) {
                                  const targetParentIndex = index // index in breadcrumb.slice(1, -1)
                                  const targetParentId = targetParentIndex === 0 ? "root" : parentPath[targetParentIndex]
                                  if (targetParentId) {
                                    onMoveNode(node.id, targetParentId)
                                  }
                                }
                              }}
                              className="ml-0.5 rounded-full hover:bg-[var(--cf-blue-300)] p-0.5 transition-colors"
                              title="Remove from this folder"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                          <span className="text-[var(--cf-gray-400)] text-sm font-mono">/</span>
                        </span>
                      )
                    })}
                  </>
                )}
                {/* Editable slug input */}
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1 min-w-[100px] h-7 border-0 p-0 font-mono text-sm shadow-none focus-visible:ring-0"
                  placeholder="page-slug"
                />
              </div>
              <div className="flex items-center gap-2">
                <Popover>
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
                      <CommandInput placeholder="Search folders..." />
                      <CommandList>
                        <CommandEmpty>No folder found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              if (onMoveNode && node) {
                                onMoveNode(node.id, "root")
                              }
                            }}
                            className="flex items-center gap-2"
                          >
                            <Home className="h-4 w-4 text-[var(--cf-gray-500)]" />
                            <span>Root (top level)</span>
                          </CommandItem>
                          {allFolders
                            .filter(f => f.id !== "root" && f.id !== node?.id)
                            .map((folder) => (
                              <CommandItem
                                key={folder.id}
                                onSelect={() => {
                                  if (onMoveNode && node) {
                                    onMoveNode(node.id, folder.id)
                                  }
                                }}
                                className="flex items-center gap-2"
                              >
                                <Folder className="h-4 w-4 text-[var(--cf-blue-500)]" />
                                <span>{folder.title}</span>
                                {folder.path.length > 0 && (
                                  <span className="text-xs text-[var(--cf-gray-400)] ml-auto">
                                    /{folder.path.slice(1).join('/')}
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
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-[var(--cf-gray-600)]">
                Full URL Path
              </Label>
              <div className="relative">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cf-gray-400)]" />
                <Input
                  readOnly
                  value={(() => {
                    // Build URL from breadcrumb path (skip root and current page) + slug
                    if (!breadcrumb || breadcrumb.length <= 1) {
                      // Root level - just base URL + slug
                      return `${baseUrl}/${slug.replace(/^\//, '')}`
                    }
                    // Get parent path segments (skip root "Project" and current page title)
                    const parentSegments = breadcrumb
                      .slice(1, -1) // Skip root and current page
                      .map(segment =>
                        segment
                          .toLowerCase()
                          .replace(/[^a-z0-9\s-]/g, '')
                          .replace(/\s+/g, '-')
                      )
                    // Combine parent path with the slug field value
                    const computedParentPath = parentSegments.length > 0
                      ? `/${parentSegments.join('/')}`
                      : ''
                    const cleanSlug = slug.replace(/^\//, '')
                    return `${baseUrl}${computedParentPath}/${cleanSlug}`
                  })()}
                  className="h-9 pl-8 font-mono text-sm bg-[var(--cf-gray-100)] text-[var(--cf-gray-600)] cursor-default select-all"
                />
              </div>
              <p className="text-xs text-[var(--cf-gray-500)]">
                This is the full URL where this page will be accessible
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-sm text-[var(--cf-gray-600)]">
                Status
              </Label>
              <Select value={status} onValueChange={(v: SitemapNode["status"]) => setStatus(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="changed">Changed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="text-sm text-[var(--cf-gray-600)]">
                Exclude from Sitemap
              </Label>
              <Switch
                checked={node.excludeFromSitemap ?? false}
                onCheckedChange={(checked) => onExcludeFromSitemap?.(node.id, checked)}
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* Metadata */}
        <section>
          <h3 className="text-sm font-semibold text-[var(--cf-gray-600)] uppercase tracking-wide mb-3">
            Metadata
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-1.5">
              <span className="flex items-center gap-2 text-[var(--cf-gray-500)]">
                <Calendar className="h-4 w-4" />
                Created
              </span>
              <span className="text-[var(--cf-gray-700)]">
                {entry?.sys.createdAt
                  ? new Date(entry.sys.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="flex items-center gap-2 text-[var(--cf-gray-500)]">
                <Calendar className="h-4 w-4" />
                Updated
              </span>
              <span className="text-[var(--cf-gray-700)]">
                {entry?.sys.updatedAt
                  ? new Date(entry.sys.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="flex items-center gap-2 text-[var(--cf-gray-500)]">
                <Tag className="h-4 w-4" />
                Entry ID
              </span>
              <code className="text-xs font-mono bg-[var(--cf-gray-100)] px-2 py-0.5 rounded">
                {node.id}
              </code>
            </div>
          </div>
        </section>

        {entry && entry.tags.length > 0 && (
          <>
            <Separator />
            <section>
              <h3 className="text-sm font-semibold text-[var(--cf-gray-600)] uppercase tracking-wide mb-3">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="bg-white border-[var(--cf-gray-300)] text-[var(--cf-gray-600)] font-mono text-xs"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </section>
          </>
        )}

        <Separator />

        {/* Children info */}
        {node.children.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-[var(--cf-gray-600)] uppercase tracking-wide mb-3">
              Child Pages ({node.children.length})
            </h3>
            <div className="space-y-1">
              {node.children.slice(0, 5).map((child) => (
                <div
                  key={child.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--cf-gray-50)] text-sm"
                >
                  {child.type === "section" ? (
                    <Folder className="h-3.5 w-3.5 text-[var(--cf-blue-500)]" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-[var(--cf-gray-500)]" />
                  )}
                  <span className="flex-1 truncate text-[var(--cf-gray-600)]">
                    {child.title}
                  </span>
                </div>
              ))}
              {node.children.length > 5 && (
                <p className="text-xs text-[var(--cf-gray-500)] px-2 pt-1">
                  +{node.children.length - 5} more pages
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      {onSave && (
        <div className="p-4 border-t border-[var(--cf-gray-200)] bg-[var(--cf-gray-50)]">
          <Button
            size="sm"
            className="w-full h-9 bg-[var(--cf-blue-500)] hover:bg-[var(--cf-blue-600)]"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(node.id, { title, slug })
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  )
}
