# Sitemap Tree Manager — Developer Guide

This guide covers how to consume the data managed by the Sitemap Tree Manager Contentful app to generate `sitemap.xml` files on your frontend.

---

## 1. Overview

The app manages a **two-layer sitemap model**:

1. **Visual tree** — A root Sitemap entry stores the folder hierarchy (`folderConfig`) and all page entries carry `sitemapMetadata.parentEntryId` pointing to their folder or parent page. This layer drives the drag-and-drop UI and path computation.
2. **Type-based child sitemaps** — Child Sitemap entries list which content types they cover (e.g. all `blogPost` entries). These are linked from the root entry's `childSitemaps` field and generate separate `<sitemap>` entries in the sitemap index.

---

## 2. Data Model

### 2a. Sitemap Content Type (`sitemap`)

| Field ID | Type | Purpose |
|---|---|---|
| `internalName` | Symbol | Display name in the Contentful UI. Required, display field. Replaces legacy `name`. |
| `slug` | Symbol | URL slug for the generated XML file. E.g. `sitemap-index` → `/sitemap-index.xml`. |
| `sitemapType` | Symbol | `"root"` or `"child"`. Treat `null` as `"root"` for backwards compat. |
| `folderConfig` | Object | **Root only.** JSON array of `FolderNode[]` — see §2b. |
| `childSitemaps` | Array\<Link\<Entry\>\> | **Root only.** References to child Sitemap entries. |
| `contentTypes` | Array\<Symbol\> | **Child only.** Content type IDs this sitemap covers, e.g. `["blogPost", "article"]`. |
| `changeFrequency` | Symbol | **Child only.** One of: `always\|hourly\|daily\|weekly\|monthly\|yearly\|never`. |
| `priority` | Number | **Child only.** 0.0–1.0. |

### 2b. FolderNode shape (stored in `folderConfig`)

Folders are **not** Contentful entries — they live as a JSON array in the root Sitemap entry's `folderConfig` field.

```ts
interface FolderNode {
  id: string           // "folder-<timestamp>-<random>", e.g. "folder-1706122800000-ab3c7"
  title: string        // Display name shown in the tree
  slug: string         // URL segment for path computation
  parentId: string | null  // null = root level; another folder ID or page entry ID
}
```

### 2c. SitemapMetadata on page entries

Each page entry managed by the app carries two app-managed fields:

```ts
// Stored in entry.fields.sitemapMetadata["en-US"]
interface SitemapMetadata {
  parentEntryId: string | null  // folder ID from folderConfig OR another page entry ID
  computedPath: string          // ADVISORY — recompute at query time, do not trust stored value
}

// Stored in entry.fields.excludeFromSitemap["en-US"]
// boolean — when true, omit this page from sitemap output
```

> **Important:** `computedPath` is stored for convenience but can become stale if entries are moved. Always **recompute** the path at query time by walking the parent chain via `parentEntryId`. See §3.

### 2d. excludeFromSitemap

`entry.fields.excludeFromSitemap["en-US"]` — boolean. When `true`, exclude this page from all sitemap output.

---

## 3. Querying the Sitemap Structure

### Get the root Sitemap entry

```ts
// Contentful Delivery API
const rootEntry = await client.getEntries({
  content_type: 'sitemap',
  'fields.sitemapType': 'root',
  limit: 1,
  include: 2,  // include linked child sitemap entries
})
const root = rootEntry.items[0]
const folders: FolderNode[] = root.fields.folderConfig ?? []
const childSitemapRefs = root.fields.childSitemaps ?? []
```

> For backwards compat: if no entry has `sitemapType: "root"`, fall back to the first Sitemap entry returned.

### Computing `computedPath` from `parentEntryId`

`parentEntryId` is the **source of truth**. Walk the chain upward to build the full path:

```ts
function computePath(
  entryId: string,
  allEntries: Map<string, { slug: string; parentEntryId: string | null }>,
  folders: Map<string, { slug: string; parentId: string | null }>
): string {
  const segments: string[] = []
  let currentId: string | null = entryId

  while (currentId) {
    const entry = allEntries.get(currentId)
    if (entry) {
      segments.unshift(entry.slug)
      currentId = entry.parentEntryId
    } else {
      const folder = folders.get(currentId)
      if (folder) {
        segments.unshift(folder.slug)
        currentId = folder.parentId
      } else {
        break // root or unknown
      }
    }
  }

  return '/' + segments.filter(Boolean).join('/')
}
```

---

## 4. Generating `sitemap-index.xml`

The root sitemap index lists the root sitemap plus each child sitemap:

```ts
// app/sitemap-index.xml/route.ts
export async function GET() {
  const rootEntry = await getRootSitemapEntry()
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  const sitemaps = [
    // Root visual sitemap
    `${baseUrl}/${rootEntry.fields.slug}.xml`,
    // Child sitemaps
    ...(rootEntry.fields.childSitemaps ?? []).map(
      (child: { fields: { slug: string } }) => `${baseUrl}/${child.fields.slug}.xml`
    ),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(url => `  <sitemap>\n    <loc>${url}</loc>\n  </sitemap>`).join('\n')}
</sitemapindex>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
```

---

## 5. Generating a Child Sitemap

A child sitemap covers all entries of specific content types:

```ts
// app/[sitemapSlug]/route.ts  (dynamic route matching child slugs)
export async function GET(req: Request, { params }: { params: { sitemapSlug: string } }) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
  const slug = params.sitemapSlug.replace('.xml', '')

  // Find the child Sitemap entry by slug
  const childEntry = await client.getEntries({
    content_type: 'sitemap',
    'fields.sitemapType': 'child',
    'fields.slug': slug,
    limit: 1,
  })
  const child = childEntry.items[0]
  if (!child) return new Response('Not found', { status: 404 })

  const contentTypeIds: string[] = child.fields.contentTypes ?? []
  const changeFreq: string = child.fields.changeFrequency ?? 'weekly'
  const priority: number = child.fields.priority ?? 0.5

  // Fetch all entries for each content type
  const allPageEntries = await fetchAllEntriesForTypes(contentTypeIds)

  // Filter excluded entries and compute paths
  const urls = allPageEntries
    .filter(e => !e.fields.excludeFromSitemap)
    .map(e => {
      const path = computePathForEntry(e)  // use computePath() above
      return `  <url>
    <loc>${baseUrl}${path}</loc>
    <changefreq>${changeFreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`
    })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
```

---

## 6. Generating the Root (Visual Tree) Sitemap

The root sitemap outputs pages organized via the folder tree:

```ts
// app/sitemap-index.xml/route.ts (or the root slug's route)
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  const rootEntry = await getRootSitemapEntry()
  const folders: FolderNode[] = rootEntry.fields.folderConfig ?? []

  // Fetch all enabled page entries
  const pageEntries = await fetchAllPageEntries()

  // Build lookup maps
  const folderMap = new Map(folders.map(f => [f.id, f]))
  const entryMap = new Map(pageEntries.map(e => [e.sys.id, {
    slug: e.fields.slug,
    parentEntryId: e.fields.sitemapMetadata?.parentEntryId ?? null,
  }]))

  const urls = pageEntries
    .filter(e => !e.fields.excludeFromSitemap)
    .map(e => {
      const path = computePath(e.sys.id, entryMap, folderMap)
      return `  <url>\n    <loc>${baseUrl}${path}</loc>\n  </url>`
    })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
```

---

## 7. Example Next.js Route Handlers

### `/app/sitemap-index.xml/route.ts`

```ts
import { createClient } from 'contentful'

const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,
})

async function getRootSitemapEntry() {
  const res = await client.getEntries({
    content_type: 'sitemap',
    'fields.sitemapType': 'root',
    limit: 1,
    include: 1,
  })
  return res.items[0]
}

export async function GET() {
  const root = await getRootSitemapEntry()
  const base = process.env.NEXT_PUBLIC_BASE_URL!
  const rootSlug = root.fields.slug as string

  const childSlugs = ((root.fields.childSitemaps ?? []) as { fields: { slug: string } }[])
    .map(c => c.fields.slug)

  const locs = [rootSlug, ...childSlugs]
    .map(slug => `  <sitemap>\n    <loc>${base}/${slug}.xml</loc>\n  </sitemap>`)

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.join('\n')}\n</sitemapindex>`,
    { headers: { 'Content-Type': 'application/xml' } }
  )
}
```

### `/app/[name]/route.ts` (dynamic child sitemaps)

```ts
// Matches /sitemap-blog.xml, /sitemap-news.xml, etc.
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const slug = params.name.replace('.xml', '')
  const base = process.env.NEXT_PUBLIC_BASE_URL!

  const res = await client.getEntries({
    content_type: 'sitemap',
    'fields.sitemapType': 'child',
    'fields.slug': slug,
    limit: 1,
  })
  const child = res.items[0]
  if (!child) return new Response('Not found', { status: 404 })

  const ctIds = child.fields.contentTypes as string[]
  const changeFreq = (child.fields.changeFrequency as string) ?? 'weekly'
  const priority = (child.fields.priority as number) ?? 0.5

  const entries = await Promise.all(
    ctIds.map(ctId =>
      client.getEntries({ content_type: ctId, limit: 1000, select: ['sys.id', 'fields'] })
    )
  )
  const allItems = entries.flatMap(r => r.items)

  const urls = allItems
    .filter(e => !e.fields.excludeFromSitemap)
    .map(e => {
      // Use computedPath from metadata as a starting point; re-derive if needed
      const path = (e.fields.sitemapMetadata as { computedPath?: string } | undefined)?.computedPath
        ?? `/${e.fields.slug as string}`
      return `  <url>\n    <loc>${base}${path}</loc>\n    <changefreq>${changeFreq}</changefreq>\n    <priority>${priority.toFixed(1)}</priority>\n  </url>`
    })

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } }
  )
}
```

---

## 8. robots.txt

Point search engines to your sitemap index by adding this line to `public/robots.txt` (or your dynamic robots handler):

```
Sitemap: https://your-domain.com/sitemap-index.xml
```

The App Config screen (Contentful app installation settings) shows the correct URL based on your configured `baseUrl` and the root sitemap entry's `slug`.

---

## 9. changeFrequency & priority

These fields live directly on **child Sitemap entries** and are readable from the Contentful Delivery API without needing app installation parameters:

```ts
const changeFreq = child.fields.changeFrequency  // e.g. "weekly"
const priority   = child.fields.priority         // e.g. 0.8
```

Apply them uniformly to all `<url>` elements in that child sitemap. They represent the expected update cadence and relative importance of **all entries** covered by that child sitemap, not per-page values.

To set per-page `changeFrequency` or `priority`, add those fields directly to your page content types instead.
