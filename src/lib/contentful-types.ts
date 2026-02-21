export interface ContentTypeConfig {
  slugFieldId: string // field ID the user mapped as the slug, e.g. 'slug', 'urlSlug'
}

export interface AppInstallationParameters {
  enabledContentTypes: string[] // ['page', 'blogPost', ...]
  contentTypeConfigs: Record<string, ContentTypeConfig> // { page: { slugFieldId: 'slug' }, ... }
  baseUrl: string // 'https://smu.edu'
}

// Stored in each entry's sitemapMetadata JSON field
export interface SitemapMetadata {
  parentEntryId: string | null
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
