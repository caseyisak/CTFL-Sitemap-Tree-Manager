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
  baseUrl: string // 'https://smu.edu'
  /** ID of the Sitemap content type (auto-detected by name, may not be "sitemap") */
  sitemapContentTypeId?: string
  /** ID of the singleton Sitemap entry that stores folderConfig + is the sitemap manager */
  sitemapEntryId?: string
}

// Stored in each page entry's sitemapMetadata JSON field
export interface SitemapMetadata {
  parentEntryId: string | null // folder ID (from folderConfig) OR another page entry ID
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
