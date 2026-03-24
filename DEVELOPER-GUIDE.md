# Sitemap Tree Manager — Developer Integration Guide

> For developers connecting the Sitemap Tree Manager app to a production website.
> Last updated: March 2026

---

## Overview

The Sitemap Tree Manager is a **data layer**, not a sitemap generator. When editors use the app in Contentful, it writes structured metadata to entries. Your website reads that metadata from the Contentful Delivery API (CDA) and generates XML sitemaps, resolves URL paths, and serves content on the right routes.

**What the app writes:**

| Where | Field | Type | Purpose |
|---|---|---|---|
| Every managed page entry | `sitemapMetadata` | JSON Object | `parentEntryId` + `computedPath` |
| Every managed page entry | `excludeFromSitemap` | Boolean | Exclude from XML output |
| Root Sitemap entry | `folderConfig` | JSON Object | Folder hierarchy (title, slug, parentId) |
| Root Sitemap entry | `childSitemaps` | Entry link array | Links to child Sitemap entries |
| Child Sitemap entries | `contentTypes` | Text list | Which CTs this sitemap covers |
| Child Sitemap entries | `changeFrequency` | Short text | `weekly`, `daily`, etc. |
| Child Sitemap entries | `priority` | Number | 0.0–1.0 |

**What you need to build:**
- A route that fetches this data and serves XML at `/sitemap.xml` (or `/sitemap-index.xml`)
- Dynamic routes that render pages at the URLs the app computes
- Optionally: a Content Preview setup so editors can preview pages from within Contentful

---

## Step 1 — Detect the sitemap mode

First, fetch the root Sitemap entry to determine whether you're in single-sitemap or sitemap-index mode.

```ts
// lib/sitemap.ts
import { createClient } from "contentful"

const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
})

// For draft/preview content, use the Preview API:
// accessToken: process.env.CONTENTFUL_PREVIEW_TOKEN!
// host: "preview.contentful.com"

export async function getRootSitemapEntry() {
  const response = await client.getEntries({
    content_type: "sitemap",
    "fields.sitemapType": "root",
    limit: 1,
    include: 2, // resolve child sitemap links
  })

  return response.items[0] ?? null
}
```

```ts
const root = await getRootSitemapEntry()
const isIndex = (root?.fields?.childSitemaps as any[])?.length > 0
```

- `isIndex = false` → single sitemap mode, serve one `<urlset>` at `/sitemap.xml`
- `isIndex = true` → sitemap index mode, serve `<sitemapindex>` pointing to each child's URL

---

## Step 2 — Fetch page entries

For each child sitemap (or the root in single mode), fetch the content types it manages.

```ts
export async function getPageEntries(contentTypeIds: string[]) {
  // Fetch in parallel for each content type
  const results = await Promise.all(
    contentTypeIds.map((ctId) =>
      client.getEntries({
        content_type: ctId,
        select: [
          "sys.id",
          "sys.publishedAt",
          "sys.updatedAt",
          "fields.sitemapMetadata",
          "fields.excludeFromSitemap",
          // Add your slug field and title field here:
          "fields.slug",
          "fields.title",
        ].join(","),
        limit: 1000,
      })
    )
  )

  return results.flatMap((r) => r.items)
}
```

**Tip:** If you have more than 1000 entries, paginate using `skip` and collect all results.

---

## Step 3 — Resolve URL paths

The app stores `computedPath` in `sitemapMetadata` as an advisory field. For most use cases, trust it directly — the app keeps it in sync whenever editors move or rename pages.

```ts
// Given a page entry from the CDA:
const path = entry.fields.sitemapMetadata?.computedPath
// e.g. "/blog/2024/my-post"
```

**If you need full accuracy** (e.g. for a route handler, not just XML generation), recompute the path by walking the parent chain. The `parentEntryId` in `sitemapMetadata` is always the source of truth:

```ts
function computePath(
  entryId: string,
  allEntries: Map<string, { slug: string; parentEntryId: string | null }>
): string {
  const entry = allEntries.get(entryId)
  if (!entry) return ""

  const slug = entry.slug ?? ""
  const parentId = entry.parentEntryId

  if (!parentId) return `/${slug}`
  return `${computePath(parentId, allEntries)}/${slug}`
}
```

**Important:** `parentEntryId` may point to either a **folder ID** (from `folderConfig`) or another **page entry ID**. Both are valid parents. Folders don't have CDA entries — their slugs come from the Sitemap entry's `folderConfig` JSON field.

To resolve folder slugs:

```ts
const rootEntry = await getRootSitemapEntry()
const folderConfig: FolderNode[] = rootEntry.fields.folderConfig ?? []

// Build a map: id → { slug, parentId }
const nodeMap = new Map([
  ...folderConfig.map((f) => [f.id, { slug: f.slug, parentId: f.parentId }]),
  ...pageEntries.map((e) => [
    e.sys.id,
    {
      slug: e.fields.slug,
      parentId: e.fields.sitemapMetadata?.parentEntryId ?? null,
    },
  ]),
])

// Now computePath works for both page entries and folder-parented pages
```

---

## Step 4 — Generate XML

### Single sitemap (`/sitemap.xml`)

```ts
// app/sitemap.xml/route.ts  (Next.js App Router)
import { getRootSitemapEntry, getPageEntries } from "@/lib/sitemap"

export async function GET() {
  const root = await getRootSitemapEntry()
  const contentTypeIds: string[] = root.fields.contentTypes ?? []
  const entries = await getPageEntries(contentTypeIds)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://example.com"

  const urls = entries
    .filter((e) => !e.fields.excludeFromSitemap)
    .map((e) => {
      const path = e.fields.sitemapMetadata?.computedPath ?? `/${e.fields.slug}`
      const lastmod = e.sys.updatedAt?.split("T")[0]
      const changefreq = root.fields.changeFrequency ?? "weekly"
      const priority = root.fields.priority ?? 0.5

      return `
  <url>
    <loc>${baseUrl}${path}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    })
    .join("")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  })
}
```

### Sitemap index + child sitemaps

**Root index** (`/sitemap-index.xml` or the slug from the root entry's `fields.slug`):

```ts
// app/sitemap-index.xml/route.ts
export async function GET() {
  const root = await getRootSitemapEntry()
  const children = (root.fields.childSitemaps ?? []) as any[]
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!

  const sitemaps = children.map((child) => {
    const slug = child.fields.slug // e.g. "sitemap-products"
    return `  <sitemap><loc>${baseUrl}/${slug}.xml</loc></sitemap>`
  }).join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>`

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  })
}
```

**Child sitemaps** (one route per child, e.g. `/sitemap-products.xml`):

```ts
// app/[sitemapSlug].xml/route.ts
export async function GET(req: Request, { params }: { params: { sitemapSlug: string } }) {
  const root = await getRootSitemapEntry()
  const children = (root.fields.childSitemaps ?? []) as any[]
  const child = children.find((c) => c.fields.slug === params.sitemapSlug)
  if (!child) return new Response("Not found", { status: 404 })

  const contentTypeIds: string[] = child.fields.contentTypes ?? []
  const changefreq = child.fields.changeFrequency ?? "weekly"
  const priority = child.fields.priority ?? 0.5
  const entries = await getPageEntries(contentTypeIds)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!

  const urls = entries
    .filter((e) => !e.fields.excludeFromSitemap)
    .map((e) => {
      const path = e.fields.sitemapMetadata?.computedPath ?? `/${e.fields.slug}`
      const lastmod = e.sys.updatedAt?.split("T")[0]
      return `
  <url>
    <loc>${baseUrl}${path}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    })
    .join("")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, { headers: { "Content-Type": "application/xml" } })
}
```

---

## Step 5 — Dynamic routing (serving pages at computed paths)

The `computedPath` stored by the app (e.g. `/blog/2024/my-post`) must match the actual routes your website serves. There are two patterns:

### Option A — Catch-all route (recommended for flexible hierarchies)

```ts
// app/[...slug]/page.tsx
export async function generateStaticParams() {
  const entries = await getPageEntries(["page", "blogPost"]) // your managed CTs

  return entries
    .filter((e) => !e.fields.excludeFromSitemap)
    .map((e) => ({
      slug: (e.fields.sitemapMetadata?.computedPath ?? `/${e.fields.slug}`)
        .replace(/^\//, "")
        .split("/"),
    }))
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const path = "/" + params.slug.join("/")
  // fetch the entry whose computedPath matches `path`
  const entry = await getEntryByPath(path)
  // ...render
}
```

### Option B — Flat slug routes (simpler, no nesting)

If your app always serves pages at `/<slug>` with no nesting, ignore `computedPath` and use `fields.slug` directly. Only use `computedPath` if your routes are hierarchical.

---

## Step 6 — Content Preview setup

Contentful's Content Preview lets editors click "Open preview" from any entry and land on a live (draft-mode) preview of that page on your website.

### In Contentful

1. Go to **Space settings → Content preview**
2. Click **Add content preview**
3. Set a preview URL for each managed content type:

```
https://your-site.com/api/preview?secret=YOUR_SECRET&id={entry.sys.id}
```

Or, if the entry already has a `computedPath` written by the app:

```
https://your-site.com{fields.sitemapMetadata.computedPath}?preview=true
```

The second option is simpler but requires the entry to have been saved at least once through the app (so `computedPath` is populated).

### In your Next.js app

**Route handler approach (recommended):**

```ts
// app/api/preview/route.ts
import { draftMode } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "contentful"

const previewClient = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_PREVIEW_TOKEN!,
  host: "preview.contentful.com",
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get("secret")
  const id = searchParams.get("id")

  if (secret !== process.env.PREVIEW_SECRET) {
    return new Response("Invalid token", { status: 401 })
  }

  const entry = await previewClient.getEntry(id!)
  const path = (entry.fields as any).sitemapMetadata?.computedPath
  if (!path) return new Response("No path found", { status: 404 })

  draftMode().enable()
  redirect(path)
}
```

**To exit preview mode:**

```ts
// app/api/exit-preview/route.ts
import { draftMode } from "next/headers"
import { redirect } from "next/navigation"

export async function GET() {
  draftMode().disable()
  redirect("/")
}
```

**Using draft mode in your page component:**

```ts
import { draftMode } from "next/headers"
import { createClient } from "contentful"

export default async function Page({ params }) {
  const { isEnabled } = draftMode()

  const client = createClient({
    space: process.env.CONTENTFUL_SPACE_ID!,
    accessToken: isEnabled
      ? process.env.CONTENTFUL_PREVIEW_TOKEN!
      : process.env.CONTENTFUL_DELIVERY_TOKEN!,
    host: isEnabled ? "preview.contentful.com" : "cdn.contentful.com",
  })

  // fetch and render...
}
```

---

## Step 7 — robots.txt

The App Config screen generates a robots.txt snippet for you. It looks like:

```
User-agent: *
Allow: /
Sitemap: https://your-site.com/sitemap.xml
```

Copy-paste this into your `public/robots.txt` or serve it from a route handler. If you're using a sitemap index, update the `Sitemap:` line to point to your index URL.

---

## Environment variables you'll need

| Variable | Purpose |
|---|---|
| `CONTENTFUL_SPACE_ID` | Your Contentful space ID |
| `CONTENTFUL_DELIVERY_TOKEN` | CDA token (published content) |
| `CONTENTFUL_PREVIEW_TOKEN` | Preview API token (draft content) |
| `PREVIEW_SECRET` | Arbitrary secret used to gate the preview route |
| `NEXT_PUBLIC_BASE_URL` | Your site's base URL, e.g. `https://example.com` |

---

## Key things to know

**`computedPath` is advisory.** The app keeps it in sync, but if you move many pages rapidly or there's a race condition, recompute from `parentEntryId` for critical use cases (like canonical URLs in `<head>`). For XML generation it's fine to trust it.

**Folders are not entries.** Folder slugs live in the root Sitemap entry's `folderConfig` JSON field. If a page's `parentEntryId` looks like `folder-1234567890-abc`, it's a folder ID — look it up in `folderConfig`, not via the CDA entries API.

**`excludeFromSitemap` is a hard exclude.** Pages with this set to `true` should not appear in XML, should not be indexed, and typically should return `noindex` in their page `<meta>` tags.

**Root detection.** Always query for the root entry using `fields.sitemapType=root`. Do not hardcode an entry ID. The app never writes a hardcoded entry ID to parameters.

**Re-saving App Config is safe.** All setup operations are idempotent. If something looks misconfigured, re-saving App Config will repair it without duplicating data.
