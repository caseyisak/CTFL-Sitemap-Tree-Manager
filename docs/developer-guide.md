# Sitemap Tree Manager — Developer Guide

## How this fits into your stack

This Contentful app is a **data management layer**, not a sitemap generator. Here is the full picture:

```
Contentful (this app installed)
  └─ Editors manage the sitemap tree (drag/drop, folders, slugs)
  └─ The app writes structured metadata to each entry:
       entry.fields.sitemapMetadata  →  { parentEntryId, computedPath }
       entry.fields.excludeFromSitemap  →  true | false
  └─ A root "Sitemap" entry stores:
       folderConfig  →  folder hierarchy JSON
       childSitemaps →  links to child Sitemap entries (index mode only)
       contentTypes  →  which CTs each child covers

Your Next.js website
  └─ Reads that data via the Contentful Delivery API
  └─ Generates /sitemap.xml (or sitemap index + children)
  └─ Serves the XML to search engines
```

**The XML generation code lives in your website — not here.** This guide shows you exactly what to write.

---

## Single sitemap vs. sitemap index — how to decide

The app supports two modes. You detect which one to use at runtime by checking whether the root Sitemap entry has any child sitemaps linked:

```ts
const root = await getRootSitemapEntry()       // see §2 below
const isIndexMode = (root.fields.childSitemaps ?? []).length > 0
```

| Mode | When | What you serve |
|---|---|---|
| **Single** | No child sitemaps linked | One `<urlset>` XML at `/{root.slug}.xml` covering all page entries |
| **Index** | One or more child sitemaps linked | A `<sitemapindex>` at `/{root.slug}.xml` pointing to child URLs, each child at `/{child.slug}.xml` |

The root entry's `slug` field controls the filename. For example if `slug = "sitemap-index"` you serve `/sitemap-index.xml`.

---

## 1. Install the Contentful JS SDK

```bash
npm install contentful
# or: bun add contentful
```

---

## 2. Data model quick reference

### Root Sitemap entry (`content_type: "sitemap"`)

| Field | Type | Notes |
|---|---|---|
| `slug` | Symbol | Filename for the XML (e.g. `sitemap-index` → `/sitemap-index.xml`) |
| `sitemapType` | Symbol | `"root"` or `"child"`. Treat `null` as `"root"`. |
| `folderConfig` | Object | JSON `FolderNode[]` — the folder hierarchy. Root mode only. |
| `childSitemaps` | Array\<Link\> | Links to child Sitemap entries. Index mode only. |
| `contentTypes` | Array\<Symbol\> | CT IDs this sitemap covers. Set on the root entry for single mode; set on each child entry for index mode. |
| `changeFrequency` | Symbol | `always\|hourly\|daily\|weekly\|monthly\|yearly\|never`. Set on the root entry (single mode) or each child entry (index mode). |
| `priority` | Number | 0.0 – 1.0. Same placement as `changeFrequency`. |

### Per-page fields (on your content type entries)

```ts
// entry.fields.sitemapMetadata  →  JSON object
interface SitemapMetadata {
  parentEntryId: string | null  // folder ID or page entry ID, null = root level
  computedPath: string          // pre-built URL path, e.g. "/blog/my-post"
}

// entry.fields.excludeFromSitemap  →  boolean
// When true, omit this entry from all XML output.
```

> **`computedPath` vs. recomputing:** `computedPath` is updated by the app whenever an editor moves an entry. It is safe to use for child sitemaps (CT-based) and single sitemaps. If you need guaranteed freshness you can recompute from `parentEntryId` — see §5.

### FolderNode shape (inside `folderConfig`)

```ts
interface FolderNode {
  id: string            // "folder-<timestamp>-<rand>"
  title: string
  slug: string          // URL segment
  parentId: string | null  // null = root level
}
```

---

## 3. Shared helpers

Put these in `lib/sitemap.ts` (or wherever your utilities live).

```ts
// lib/sitemap.ts
import { createClient } from 'contentful'

export const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,
})

export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!   // e.g. "https://example.com"

/** Fetch the root Sitemap entry with child sitemaps resolved one level deep. */
export async function getRootSitemapEntry() {
  const res = await client.getEntries({
    content_type: 'sitemap',
    'fields.sitemapType': 'root',
    limit: 1,
    include: 1,   // resolve childSitemaps links
  })
  // Backwards compat: if nothing has sitemapType="root", take the first entry
  return res.items[0] ?? (await client.getEntries({ content_type: 'sitemap', limit: 1 })).items[0]
}

/** Fetch all entries for a list of content types, filtering out excluded ones. */
export async function fetchPageEntries(contentTypeIds: string[]) {
  const results = await Promise.all(
    contentTypeIds.map(ctId =>
      client.getEntries({
        content_type: ctId,
        limit: 1000,
        select: ['sys.id', 'sys.updatedAt', 'fields.sitemapMetadata', 'fields.excludeFromSitemap'],
      })
    )
  )
  return results
    .flatMap(r => r.items)
    .filter(e => !e.fields.excludeFromSitemap)
}

/** Build a <urlset> XML string from a list of { loc, lastmod?, changefreq?, priority? }. */
export function buildUrlset(urls: Array<{
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: number
}>) {
  const entries = urls.map(({ loc, lastmod, changefreq, priority }) => {
    const lines = [`    <loc>${loc}</loc>`]
    if (lastmod)    lines.push(`    <lastmod>${lastmod}</lastmod>`)
    if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`)
    if (priority != null) lines.push(`    <priority>${priority.toFixed(1)}</priority>`)
    return `  <url>\n${lines.join('\n')}\n  </url>`
  })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries,
    `</urlset>`,
  ].join('\n')
}

/** Build a <sitemapindex> XML string from a list of sitemap URLs. */
export function buildSitemapIndex(sitemapUrls: string[]) {
  const entries = sitemapUrls.map(url =>
    `  <sitemap>\n    <loc>${url}</loc>\n  </sitemap>`
  )
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries,
    `</sitemapindex>`,
  ].join('\n')
}

export const xmlResponse = (xml: string) =>
  new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
```

---

## 4. Unified route handler (handles all modes)

A single dynamic route handles everything: the index, the root visual-tree sitemap, and all child sitemaps. Create this file in your Next.js app:

```ts
// app/[sitemapSlug]/route.ts
import {
  getRootSitemapEntry,
  fetchPageEntries,
  buildUrlset,
  buildSitemapIndex,
  xmlResponse,
  BASE_URL,
} from '@/lib/sitemap'

export const dynamic = 'force-dynamic'   // always fresh; or use revalidate for ISR

export async function GET(_req: Request, { params }: { params: { sitemapSlug: string } }) {
  // Strip the .xml extension from the URL segment
  const slug = params.sitemapSlug.replace(/\.xml$/i, '')

  const root = await getRootSitemapEntry()
  const rootSlug: string = (root.fields.slug as string) ?? 'sitemap'
  const children = (root.fields.childSitemaps ?? []) as Array<{ fields: Record<string, unknown> }>
  const isIndexMode = children.length > 0

  // ── A. Sitemap Index (root slug in index mode) ────────────────────────────
  if (isIndexMode && slug === rootSlug) {
    const childUrls = children.map(c => `${BASE_URL}/${c.fields.slug as string}.xml`)
    return xmlResponse(buildSitemapIndex(childUrls))
  }

  // ── B. Child sitemap ──────────────────────────────────────────────────────
  if (isIndexMode) {
    const child = children.find(c => (c.fields.slug as string) === slug)
    if (!child) return new Response('Not found', { status: 404 })

    const ctIds = (child.fields.contentTypes as string[]) ?? []
    const changefreq = (child.fields.changeFrequency as string | undefined) ?? 'weekly'
    const priority = (child.fields.priority as number | undefined) ?? 0.5

    const entries = await fetchPageEntries(ctIds)
    const urls = entries.map(e => {
      const meta = e.fields.sitemapMetadata as { computedPath?: string } | undefined
      const path = meta?.computedPath ?? `/${e.fields.slug as string}`
      return {
        loc: `${BASE_URL}${path}`,
        lastmod: (e.sys.updatedAt as string).split('T')[0],
        changefreq,
        priority,
      }
    })

    return xmlResponse(buildUrlset(urls))
  }

  // ── C. Single sitemap (no child sitemaps) ─────────────────────────────────
  if (slug === rootSlug) {
    // In single mode the root Sitemap entry itself carries the contentTypes,
    // changeFrequency, and priority fields — same fields used by child entries.
    const enabledCTs: string[] = (root.fields.contentTypes as string[] | undefined) ?? []
    const changefreq = (root.fields.changeFrequency as string | undefined) ?? 'weekly'
    const priority = (root.fields.priority as number | undefined) ?? 0.5
    const entries = await fetchPageEntries(enabledCTs)

    const urls = entries.map(e => {
      const meta = e.fields.sitemapMetadata as { computedPath?: string } | undefined
      const path = meta?.computedPath ?? `/${e.fields.slug as string}`
      return {
        loc: `${BASE_URL}${path}`,
        lastmod: (e.sys.updatedAt as string).split('T')[0],
        changefreq,
        priority,
      }
    })

    return xmlResponse(buildUrlset(urls))
  }

  return new Response('Not found', { status: 404 })
}
```

> **Single mode and content types:** Both modes use the same `contentTypes`, `changeFrequency`, and `priority` fields on the Sitemap entry. In single mode, editors fill these in on the root entry. In index mode, they fill them in on each child entry and leave the root's fields empty. No env var needed — all configuration lives in Contentful.

---

## 5. Recomputing `computedPath` from scratch (optional)

`computedPath` is maintained by the app and is reliable for most cases. If you need to recompute it independently (e.g. for a migration or audit), use the parent chain:

```ts
interface EntryRef { slug: string; parentEntryId: string | null }
interface FolderRef { slug: string; parentId: string | null }

function computePath(
  entryId: string,
  entries: Map<string, EntryRef>,
  folders: Map<string, FolderRef>
): string {
  const segments: string[] = []
  let currentId: string | null = entryId

  while (currentId) {
    const entry = entries.get(currentId)
    if (entry) {
      segments.unshift(entry.slug)
      currentId = entry.parentEntryId
    } else {
      const folder = folders.get(currentId)
      if (folder) {
        segments.unshift(folder.slug)
        currentId = folder.parentId
      } else {
        break  // reached root
      }
    }
  }

  return '/' + segments.filter(Boolean).join('/')
}
```

---

## 6. Route registration for the unified handler

The `[sitemapSlug]` dynamic segment in Next.js matches any single path segment. URL segments with `.xml` extensions work fine. However, if your website already uses a `[slug]` catch-all for page content, you'll need to scope it to avoid conflicts.

**Option A — Shared dynamic segment (if no conflict):**
```
app/
  [sitemapSlug]/
    route.ts     ← handles /sitemap-index.xml, /sitemap-blog.xml, etc.
  [slug]/
    page.tsx     ← handles /about, /blog/my-post, etc.
```
These don't conflict because sitemap URLs end in `.xml` and page URLs don't.

**Option B — Route group to isolate sitemaps:**
```
app/
  (sitemaps)/
    [sitemapSlug]/
      route.ts
```
Route groups don't affect the URL — the route still matches `/{sitemapSlug}`.

**Option C — Explicit static routes (no ambiguity, no catch-all):**
```
app/
  sitemap-index.xml/
    route.ts
  sitemap-blog.xml/
    route.ts
```
Use this if you have a small fixed number of child sitemaps and prefer explicit over dynamic.

---

## 7. Environment variables (website only)

Add these to your website's `.env.local` (not in the Sitemap Tree Manager app):

```
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_ACCESS_TOKEN=your_delivery_api_token

# Used in generated <loc> URLs — no trailing slash
NEXT_PUBLIC_BASE_URL=https://example.com
```

---

## 8. robots.txt

```
# public/robots.txt
Sitemap: https://example.com/sitemap-index.xml
```

The App Config screen (in your Contentful space settings) shows the exact URL based on your configured `baseUrl` and root entry `slug`, with a copy button.

---

## 9. Live preview / local development

Because sitemap generation lives in your website, **local preview is just your dev server**:

```
http://localhost:3000/sitemap-index.xml     ← check the index
http://localhost:3000/sitemap-blog.xml      ← check a child
```

No extra tooling is required. If you want Contentful's Content Preview panel to show the XML when you're viewing a Sitemap entry, configure the preview URL in **Space Settings → Content Preview** to point at your website:

```
Dev:  http://localhost:3000/{entry.fields.slug}.xml
Prod: https://example.com/{entry.fields.slug}.xml
```

Contentful will open an iframe to that URL when you click the preview button on a Sitemap entry. The iframe shows whatever your website currently serves for that slug — it reflects saved data, not unsaved field changes. For most sitemap use cases (where you're configuring structure, not copy) this is sufficient.

---

## 10. Caching / ISR

For production, avoid re-fetching from Contentful on every request. Options:

**Next.js ISR (recommended):**
```ts
export const revalidate = 3600  // regenerate at most once per hour
```

**On-demand revalidation via webhook:**
Set up a Contentful webhook that calls `POST /api/revalidate` when Sitemap entries are published. Your handler calls `revalidatePath('/sitemap-index.xml')` etc.

**`Cache-Control` on the Response:**
```ts
return new Response(xml, {
  headers: {
    'Content-Type': 'application/xml',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
})
```
