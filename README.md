# Sitemap Tree Manager

A **Contentful App** that gives content editors a visual, drag-and-drop interface for managing their site's URL hierarchy — and writes structured metadata back to Contentful so your website can generate accurate XML sitemaps automatically.

> **This app is a data layer, not a sitemap generator.** It stores `sitemapMetadata` and `excludeFromSitemap` on your content entries. Your website reads that data via the Contentful Delivery API and generates the XML. See [docs/developer-guide.md](docs/developer-guide.md) for the full integration guide.

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

Your website detects the mode at runtime — see [docs/developer-guide.md](docs/developer-guide.md).

---

## Getting started (development)

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- A Contentful space with API keys
- [Contentful CLI](https://www.contentful.com/developers/docs/tutorials/cli/installation/) or the Contentful web app to install the app

### Install & run

```bash
bun install
bun dev          # starts on http://localhost:5000
```

### Install in Contentful

Contentful Apps must be served over HTTPS. For local development, expose your dev server with a tunneling tool:

```bash
# Option A — localhost.run (no install)
ssh -R 80:localhost:5000 localhost.run

# Option B — ngrok
ngrok http 5000
```

Then in your Contentful space:

1. **Apps → Manage apps → Create app**
2. Set the App URL to your tunnel URL (or `http://localhost:5000` for Contentful's own tunneling)
3. Upload `contentful-app-manifest.json` or configure locations manually
4. Install the app to your space
5. Open **App Config** to complete setup

---

## Scripts

| Command | Description |
|---|---|
| `bun dev` | Start dev server on port 5000 |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run test` | Run tests (Vitest) |
| `bun run test:watch` | Run tests in watch mode |

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
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 with Forma36 design tokens |
| UI | shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| Contentful | `@contentful/app-sdk`, `@contentful/react-apps-toolkit`, `contentful-management` |

---

## Project structure

```
contentful-app-manifest.json      # App manifest (locations, parameters)

src/
  app/
    page.tsx                      # SSR-safe shell (dynamic import, ssr: false)
    layout.tsx
    globals.css                   # Forma36 tokens + Tailwind config

  components/
    app-with-sdk.tsx              # SDKProvider + location router
    locations/
      app-config-screen.tsx       # App Config location
      entry-editor-location.tsx   # Entry Editor location
      entry-field-location.tsx    # Entry Field location
    sitemap/
      sitemap-panel-connected.tsx # Tree panel: toolbar, search, drag-drop, dialogs
      tree-node.tsx               # Recursive tree node
      details-panel.tsx           # Right-side details (slug, URL, exclude toggle)

  lib/
    sitemap-types.ts              # TypeScript interfaces + FolderNode helpers
    sitemap-utils.ts              # Tree utilities (build, filter, path computation)
    contentful-types.ts           # Shared Contentful field type helpers

docs/
  developer-guide.md              # Website integration guide (XML generation, route handler)
```

---

## Website integration

See [docs/developer-guide.md](docs/developer-guide.md) for:

- How to install the Contentful JS SDK
- Shared helper functions (`getRootSitemapEntry`, `fetchPageEntries`, `buildUrlset`)
- A unified Next.js route handler that covers single + index mode
- Route registration options to avoid conflicts with page routes
- Caching / ISR recommendations
- robots.txt setup

---

## License

MIT
