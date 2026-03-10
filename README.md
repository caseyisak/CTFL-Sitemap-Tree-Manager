# Sitemap Tree Manager

A **Contentful App** that gives content editors a visual, drag-and-drop interface for managing their site's URL hierarchy — and writes structured metadata back to Contentful so your website can generate accurate XML sitemaps automatically.

> **This app is a data layer, not a sitemap generator.** It stores `sitemapMetadata` and `excludeFromSitemap` on your content entries. Your website reads that data via the Contentful Delivery API and generates the XML.

---

## What it does

| Feature | Description |
|---|---|
| Visual tree editor | Drag-and-drop pages and folders to reorder/nest them |
| Folder hierarchy | Organize pages into URL-path-aware folders (stored as JSON, not entries) |
| URL path resolution | Computes `computedPath` for every page based on its position in the tree |
| Exclude from sitemap | Toggle to hide individual pages from XML output |
| Multi-sitemap support | Configure a root sitemap (single mode) or a sitemap index with child sitemaps |
| App Config screen | Set base URL, enable content types, manage child sitemaps, get robots.txt snippet |
| Entry Field widget | Inline folder picker with breadcrumb badges showing the full ancestor chain |
| Scoped tree view | When editing a page, the tree automatically scopes to the relevant child sitemap |

---

## App locations

The app registers three Contentful locations:

| Location | Purpose |
|---|---|
| **App Config** | Space-level setup: base URL, managed content types, sitemap entry management |
| **Entry Editor** | Full-width tree panel shown when editing any managed content type |
| **Entry Field** | Inline slug/folder picker embedded in the entry sidebar |

---

## Sitemap modes

**Single sitemap** — No child sitemaps configured. The root Sitemap entry holds `contentTypes`, `changeFrequency`, and `priority`. Your website serves one `<urlset>` XML file.

**Sitemap index** — One or more child Sitemap entries linked. The root serves a `<sitemapindex>` pointing to each child's URL. Each child entry holds its own `contentTypes`, `changeFrequency`, and `priority`.

Your website detects the mode at runtime by inspecting the root entry's `childSitemaps` field.

---

## Getting started (development)

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- Node.js 20.9.0+
- A Contentful space

### Install & run

```bash
bun install
bun dev          # starts on http://localhost:5000
```

### Install in Contentful

The app definition lives at the **organization** level and can be installed into multiple spaces simultaneously. Both spaces load from the same URL — so `localhost:5000` in dev serves all installed spaces at once.

For local dev, set the App URL to `http://localhost:5000` directly in the Contentful App Definition (no tunnel needed — Contentful supports localhost).

1. Go to your Contentful organization → **Apps → App definitions**
2. Create or open the app definition, set the Frontend URL to `http://localhost:5000`
3. Install the app into each space you want to test
4. Open **App Config** in each space to complete setup

---

## Scripts

| Command | Description |
|---|---|
| `bun dev` | Start dev server on port 5000 |
| `bun run build` | Static export to `out/` |
| `bun run start` | Serve the `out/` directory locally (`npx serve out`) |
| `bun run lint` | Run ESLint (0 errors required) |
| `bun run test` | Run Vitest test suite |
| `bun run test:watch` | Run tests in watch mode |

---

## Building & hosting

The app is a **static export** (`output: "export"` in `next.config.ts`). `bun run build` produces an `out/` directory of plain HTML/JS/CSS — no Node.js server required at runtime.

```bash
bun run build   # → out/
```

### Contentful App Hosting

Upload the `out/` directory to Contentful App Hosting via the Contentful CLI:

```bash
npx @contentful/app-scripts upload --bundle-dir out
```

### Self-hosting

Any static file host works (Vercel, S3, Cloudflare Pages, etc.). Point the App Definition Frontend URL at your hosted domain.

### Security headers

Frame embedding is restricted via a CSP meta tag in `src/app/layout.tsx` (static exports can't use HTTP headers):

```html
<meta http-equiv="Content-Security-Policy"
      content="frame-ancestors 'self' https://app.contentful.com https://app.eu.contentful.com" />
```

---

## App Config — what it does on save

When you save the App Config screen, the app automatically:

1. **Creates the `sitemap` content type** (if it doesn't exist) with 8 fields: `internalName`, `slug`, `sitemapType`, `childSitemaps`, `contentTypes`, `changeFrequency`, `priority`, `folderConfig`
2. **Creates a root Sitemap entry** with `sitemapType: "root"`
3. **Adds fields to managed content types** — `sitemapMetadata` (Object) and `excludeFromSitemap` (Boolean) are added to each enabled CT if not already present
4. **Creates a "Sitemap Info" field group** on each managed CT, grouping `sitemapMetadata` and `excludeFromSitemap` together in the Contentful entry editor
5. **Assigns the app** as the Entry Editor and Entry Field widget for each managed CT

All operations are idempotent — re-saving is safe and won't duplicate anything.

---

## Data written to Contentful

### On managed page entries

```ts
// entry.fields.sitemapMetadata  →  JSON object
interface SitemapMetadata {
  parentEntryId: string | null  // folder ID or parent page entry ID
  computedPath: string          // e.g. "/blog/my-post"
}

// entry.fields.excludeFromSitemap  →  boolean
```

### On the root Sitemap entry (`content_type: "sitemap"`)

```ts
// entry.fields.folderConfig  →  FolderNode[]
interface FolderNode {
  id: string             // "folder-<timestamp>-<rand>"
  title: string
  slug: string           // URL segment
  parentId: string | null
}
```

Child Sitemap entries hold `contentTypes`, `changeFrequency`, and `priority` — same fields used by the root entry in single mode.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, static export) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 with Forma36 design tokens |
| UI | shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| Contentful | `@contentful/app-sdk`, `@contentful/react-apps-toolkit`, `contentful-management` |
| Testing | Vitest + jsdom + Testing Library |

---

## Project structure

```
contentful-app-manifest.json      # App manifest (locations, parameters)
vitest.config.ts                  # Test runner config

src/
  app/
    page.tsx                      # SSR-safe shell (dynamic import, ssr: false)
    layout.tsx                    # CSP meta tag, fonts, analytics
    globals.css                   # Forma36 tokens + Tailwind config

  components/
    app-with-sdk.tsx              # SDKProvider + location router
    locations/
      app-config-screen.tsx       # App Config location
      entry-editor-location.tsx   # Entry Editor location
      entry-field-location.tsx    # Entry Field location
      __tests__/                  # Component tests
    sitemap/
      sitemap-panel-connected.tsx # Tree panel: toolbar, search, drag-drop, dialogs
      tree-node.tsx               # Recursive tree node
      details-panel.tsx           # Right-side details (slug, URL, exclude toggle)

  lib/
    sitemap-types.ts              # TypeScript interfaces + FolderNode helpers
    sitemap-utils.ts              # Tree utilities (build, filter, path computation)
    contentful-types.ts           # Shared Contentful field type helpers
    __tests__/                    # Utility tests
```

---

## Testing

```bash
bun run test          # run once
bun run test:watch    # watch mode
```

32 tests across 4 suites:

| Suite | What it covers |
|---|---|
| `sitemap-utils.test.ts` | Tree building, slug computation, folder merging, path resolution |
| `app-config-screen.test.tsx` | CT filtering, field detection, error extraction |
| `entry-editor-location.test.tsx` | Sitemap CT exclusion from the tree, editor wiring |
| `entry-field-location.test.tsx` | Folder picker re-fetch on open, field sync |

**Note on bun + ESLint:** bun hoists `ajv@8` globally but `eslint` and `@eslint/eslintrc` both require `ajv@^6`. The `devDependencies` includes `ajv@^6.12.6` as a direct dep to pin the root version correctly. Do not remove it.

---

## Known issues / gotchas

- **`bun run lint`** requires Node 20.9.0+. It will fail on Node 18 due to ESLint 9 + ajv compatibility.
- **Field groups** (`sitemapInfo`) are set on managed CTs at App Config save time. If you add a new CT to the app before the field group feature existed, re-save App Config to backfill the group.
- **Static export** means no API routes. The app is purely client-side — all Contentful data access goes through the App SDK and CMA token provided by the iframe context.

---

## License

MIT
