import type { ContentfulPageEntry, FolderNode, SitemapMetadata } from "./contentful-types"
import type { SitemapNode } from "./sitemap-types"

/**
 * Converts a title string into a URL-safe slug.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

/**
 * Walks the parent chain for an entry to compute its full path.
 * Stops if a circular reference is detected.
 */
export function computePath(
  entryId: string,
  allEntries: ContentfulPageEntry[],
  visited: Set<string> = new Set()
): string {
  if (visited.has(entryId)) return "" // circular reference guard
  visited.add(entryId)

  const entry = allEntries.find((e) => e.id === entryId)
  if (!entry) return ""

  const slug = entry.slug ?? ""
  const parentId = entry.metadata?.parentEntryId ?? null

  if (!parentId) {
    return `/${slug}`
  }

  const parentPath = computePath(parentId, allEntries, visited)
  return `${parentPath}/${slug}`
}

/**
 * Builds a SitemapNode tree from a flat list of ContentfulPageEntry.
 * Orphaned entries (unknown parentEntryId) are attached to root.
 */
export function buildSitemapTree(entries: ContentfulPageEntry[]): SitemapNode {
  const root: SitemapNode = {
    id: "root",
    title: "Sitemap",
    slug: "",
    type: "root",
    status: "published",
    children: [],
    isExpanded: true,
  }

  if (entries.length === 0) return root

  const nodeMap = new Map<string, SitemapNode>()

  // Create SitemapNode for each entry
  for (const entry of entries) {
    const node: SitemapNode = {
      id: entry.id,
      title: entry.title,
      slug: entry.slug ?? "",
      type: "page",
      status: entry.sys.publishedAt ? "published" : "draft",
      children: [],
      isExpanded: true,
      excludeFromSitemap: entry.excludeFromSitemap,
      contentType: entry.contentType,
    }
    nodeMap.set(entry.id, node)
  }

  // Wire up parent-child relationships
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!
    const parentId = entry.metadata?.parentEntryId ?? null

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node)
    } else {
      root.children.push(node)
    }
  }

  return root
}

/**
 * Builds a SitemapNode tree from a folder config array + flat page entries.
 * Folders (from the Sitemap entry's folderConfig field) become "section" nodes.
 * Page entries become "page" nodes. Both can reference each other as parents.
 */
export function buildSitemapTreeWithFolders(
  folders: FolderNode[],
  entries: ContentfulPageEntry[]
): SitemapNode {
  const root: SitemapNode = {
    id: "root",
    title: "Sitemap",
    slug: "",
    type: "root",
    status: "published",
    children: [],
    isExpanded: true,
  }

  const nodeMap = new Map<string, SitemapNode>()

  // Create folder nodes (type: "section")
  for (const folder of folders) {
    nodeMap.set(folder.id, {
      id: folder.id,
      title: folder.title,
      slug: folder.slug,
      type: "section",
      status: "published",
      children: [],
      isExpanded: true,
    })
  }

  // Create page nodes
  for (const entry of entries) {
    nodeMap.set(entry.id, {
      id: entry.id,
      title: entry.title,
      slug: entry.slug ?? "",
      type: "page",
      status: entry.sys.publishedAt ? "published" : "draft",
      children: [],
      isExpanded: true,
      excludeFromSitemap: entry.excludeFromSitemap,
      contentType: entry.contentType,
    })
  }

  // Wire folder parents
  for (const folder of folders) {
    const node = nodeMap.get(folder.id)!
    if (folder.parentId && nodeMap.has(folder.parentId)) {
      nodeMap.get(folder.parentId)!.children.push(node)
    } else {
      root.children.push(node)
    }
  }

  // Wire page parents
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!
    const parentId = entry.metadata?.parentEntryId ?? null
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node)
    } else {
      root.children.push(node)
    }
  }

  return root
}

/**
 * Returns a flat map of entryId → parentEntryId | null from a tree.
 */
export function flattenParents(tree: SitemapNode): Map<string, string | null> {
  const result = new Map<string, string | null>()

  function walk(node: SitemapNode, parentId: string | null) {
    if (node.id !== "root") {
      result.set(node.id, parentId)
    }
    for (const child of node.children) {
      walk(child, node.id === "root" ? null : node.id)
    }
  }

  walk(tree, null)
  return result
}

/**
 * Compares two trees and returns entries whose parentEntryId changed.
 */
export function findChangedParentIds(
  oldTree: SitemapNode,
  newTree: SitemapNode
): Array<{ id: string; newParentId: string | null }> {
  const oldMap = flattenParents(oldTree)
  const newMap = flattenParents(newTree)
  const changed: Array<{ id: string; newParentId: string | null }> = []

  for (const [id, newParentId] of newMap) {
    const oldParentId = oldMap.get(id)
    if (oldParentId !== newParentId) {
      changed.push({ id, newParentId })
    }
  }

  return changed
}

/**
 * Transforms a raw Contentful entry response into a ContentfulPageEntry.
 */
export function transformEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  contentTypeId: string,
  slugFieldId: string,
  titleFieldId = "title"
): ContentfulPageEntry {
  const fields = raw.fields ?? {}
  const sys = raw.sys ?? {}

  const titleField = fields[titleFieldId]
  const title =
    typeof titleField === "string"
      ? titleField
      : typeof titleField?.["en-US"] === "string"
        ? titleField["en-US"]
        : raw.sys?.id ?? "Untitled"

  const slugField = fields[slugFieldId]
  const slug =
    typeof slugField === "string"
      ? slugField
      : typeof slugField?.["en-US"] === "string"
        ? slugField["en-US"]
        : null

  const metadataField = fields.sitemapMetadata
  const rawMetadata =
    typeof metadataField === "object" && metadataField !== null && !Array.isArray(metadataField)
      ? metadataField?.["en-US"] ?? metadataField
      : null

  const metadata: SitemapMetadata | null =
    rawMetadata &&
    typeof rawMetadata === "object" &&
    "computedPath" in rawMetadata
      ? (rawMetadata as SitemapMetadata)
      : null

  const excludeField = fields.excludeFromSitemap
  const excludeFromSitemap =
    typeof excludeField === "boolean"
      ? excludeField
      : typeof excludeField?.["en-US"] === "boolean"
        ? excludeField["en-US"]
        : false

  const tags: string[] = ((raw.metadata?.tags ?? []) as Array<{ sys: { id: string } }>).map(
    (t) => t.sys.id
  )

  return {
    id: sys.id ?? "",
    title,
    slug,
    contentType: contentTypeId,
    metadata,
    excludeFromSitemap,
    tags,
    sys: {
      publishedAt: sys.publishedAt ?? null,
      updatedAt: sys.updatedAt ?? "",
      createdAt: sys.createdAt ?? "",
    },
  }
}
