export interface ContentTypeConfig {
  slugFieldId: string // field ID the user mapped as the slug, e.g. 'slug', 'urlSlug'
}

/** A folder node stored in the Sitemap entry's folderConfig JSON field. */
export interface FolderNode {
  id: string           // "folder-<uuid>" — not a Contentful entry ID
  title: string
  slug: string
  parentId: string | null // null = root level; can be another folder ID or a page entry ID
}

export interface AppInstallationParameters {
  enabledContentTypes: string[] // ['page', 'blogPost', ...]
  contentTypeConfigs: Record<string, ContentTypeConfig> // { page: { slugFieldId: 'slug' }, ... }
  baseUrl: string // e.g. 'https://example.com'
  /** ID of the Sitemap content type (auto-detected by name, may not be "sitemap") */
  sitemapContentTypeId?: string
  /**
   * @deprecated No longer stored. Root entry detected by sitemapType=root query.
   * Left here for backwards compat reads only — never write this field.
   */
  sitemapEntryId?: string
}

// Stored in each page entry's sitemapMetadata JSON field
export interface SitemapMetadata {
  parentEntryId: string | null // folder ID (from folderConfig) OR another page entry ID
  /**
   * Advisory/derivable — do NOT rely on the stored value for accuracy.
   * Always recompute at query time using computePath() or similar.
   * parentEntryId is the source of truth.
   */
  computedPath: string // '/academics/programs/computer-science'
}

export interface ContentfulPageEntry {
  id: string
  title: string
  slug: string | null // from Short Text slug field
  contentType: string
  metadata: SitemapMetadata | null
  excludeFromSitemap: boolean
  tags: string[] // Contentful tag IDs from entry.metadata.tags
  sys: { publishedAt: string | null; updatedAt: string; createdAt: string }
}

/**
 * Represents a Contentful entry of the "Sitemap" content type.
 * sitemapType = "root" → full visual tree + folder manager
 * sitemapType = "child" → settings panel (content types, changeFreq, priority)
 * Treat sitemapType = null as "root" for backwards compat.
 */
export interface SitemapEntry {
  id: string
  /** Replaces legacy `name` field. Treat both when reading existing entries. */
  internalName: string
  /** URL slug for the generated XML file, e.g. "sitemap-index" → /sitemap-index.xml */
  slug: string
  /** "root" = main sitemap index, "child" = type-based child sitemap. null → treat as "root". */
  sitemapType: "root" | "child" | null
  /** Root only — FolderNode[] array stored as JSON Object field. */
  folderConfig?: FolderNode[]
  /** Root only — IDs of linked child Sitemap entries. */
  childSitemaps?: string[]
  /** Child only — Contentful content type IDs this sitemap covers, e.g. ["blogPost", "article"]. */
  contentTypes?: string[]
  /**
   * Child only — standard sitemap changefreq value applied to all URLs in this sitemap.
   * Read directly from the Contentful Delivery API for sitemap generation.
   */
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"
  /**
   * Child only — sitemap priority (0.0–1.0) applied to all URLs in this sitemap.
   * Read directly from the Contentful Delivery API for sitemap generation.
   */
  priority?: number
  sys: { publishedAt: string | null; updatedAt: string; createdAt: string }
}
