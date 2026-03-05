# CTFL-sitemap-tree-manager

**Sitemap Manager** — An interactive, navigable tree-structure sitemap editor built for Contentful-like content management systems. Next.js (App Router) with **Bun**. Enables content teams to visually organize, reorder, and restructure site hierarchies through drag-and-drop with real-time URL path resolution.

## Getting started

```bash
bun install
bun dev
```

Open [http://localhost:5000](http://localhost:5000). Edit `src/app/page.tsx` and the page will hot-reload.

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `bun dev`       | Start dev server         |
| `bun run build` | Production build         |
| `bun run start` | Start production server  |
| `bun run lint`  | Run ESLint               |

## Features

### Tree Navigation & Hierarchy

- **Collapsible tree view** with expand/collapse toggles for folders and sections
- **Breadcrumb navigation** showing the current page's position within the hierarchy
- **Search filtering** that auto-expands matching paths in the tree
- **Expand all / Collapse all** toolbar controls
- **Maximum nesting depth** of 5 levels with enforcement and user feedback

### Drag-and-Drop

- **Reorder pages** by dragging before or after sibling nodes
- **Nest into folders** by dropping onto the middle zone of a folder node (70% of the target area defaults to "inside" placement)
- **Move parent nodes** with all their children intact
- **Circular reference prevention** so a parent cannot be dragged into its own descendants
- **Visual drop indicators** showing before, after, or inside placement
- **Grip handle affordance** appears on hover for each draggable node
- **Auto-expand** target folders after a successful drop

### Dynamic URL Slug System

- **Parent path badges** in the URL slug field reflect the folder hierarchy (e.g., `[dashboard] / [company] / page-slug`)
- **Badges update automatically** when pages are moved between folders via drag-and-drop or the "Move to folder" command
- **Removable badges** &mdash; clicking the X on a badge moves the page up to the parent folder
- **Full URL path** is dynamically composed from your configured base URL + folder hierarchy + page slug
- **"Move to folder" command** with searchable dropdown listing all available folders

### Page & Folder Management

- **Add new pages** at any level through the toolbar or context menu
- **Add new folders** via a dedicated button or the right-click context menu on existing folders
- **Rename** nodes inline through the context menu
- **Duplicate** pages to quickly scaffold similar content
- **Delete** nodes with confirmation
- **Undo / Redo** history for all structural changes

### Details Panel

- **Title field** dynamically controls the page name displayed in the tree header
- **URL Slug field** with interactive folder badges and editable slug segment
- **Full URL Path** (read-only) showing the resolved URL based on hierarchy + slug
- **Status selector** (Published, Draft, Changed) with color-coded indicators
- **Metadata section** showing created/modified dates, author, and entry ID
- **Taxonomy & Classification** section with concepts, tags, and categories

### Visual Design

- **Forma36 design system** color palette for a native Contentful application aesthetic
- **Status indicators** with colored dots (green = published, yellow = draft/changed)
- **Node type icons** distinguishing pages, folders, and root nodes
- **Current page badge** highlighting the active page in the tree
- **Responsive layout** with mobile toggle between tree and details views

## Tech Stack

| Layer   | Technology                                      |
| ------- | ----------------------------------------------- |
| Framework | Next.js 16 (App Router)                        |
| Language  | TypeScript                                    |
| Styling   | Tailwind CSS v4 with Forma36 design tokens    |
| UI Components | shadcn/ui (Radix UI primitives)           |
| Icons    | Lucide React                                   |
| State    | React `useState` with derived state pattern    |

## Project Structure

```
app/
  page.tsx                          # Main page: state management, node selection, move logic
  layout.tsx                        # Root layout with metadata
  globals.css                       # Forma36 design tokens + Tailwind config

components/sitemap/
  tree-node.tsx                     # Recursive tree node with drag-and-drop handling
  sitemap-panel-connected.tsx       # Sitemap tree panel: toolbar, search, undo/redo, add dialogs
  details-panel.tsx                 # Right-side details panel: title, slug, URL, metadata, taxonomy

lib/
  sitemap-types.ts                  # TypeScript interfaces (SitemapNode, DragState, TreeContext) and seed data
  utils.ts                          # Utility functions (cn class merger)
```

## Data Model

```typescript
interface SitemapNode {
  id: string
  title: string
  slug: string          // Page-level slug only (e.g., "my-tasks"), not the full path
  type: 'root' | 'section' | 'page'
  status: 'published' | 'draft' | 'changed'
  children: SitemapNode[]
  isExpanded?: boolean
}
```

The full URL path is derived at render time from the node's position in the tree hierarchy combined with its slug. Moving a node between folders automatically updates its resolved URL without mutating the slug.

## Design Decisions

- **Derived state over synced state**: The selected node is stored as an ID and derived from the sitemap tree on each render. This avoids infinite update loops from syncing a full node object via `useEffect`.
- **Slug-only storage**: Each node stores only its own slug segment. The full URL path is computed from the breadcrumb hierarchy, so moving a node automatically resolves the correct URL.
- **Folder-biased drop zones**: When dragging over a folder, 70% of the node area triggers an "inside" drop, with only the extreme top/bottom edges (15% each) allowing before/after sibling placement.
- **Forma36 tokens as CSS variables**: The color system uses CSS custom properties mapped to Contentful's Forma36 palette for theming and extension.

## Learn more

- [Next.js docs](https://nextjs.org/docs)
- [Bun](https://bun.sh/docs)

## Deploy

[Vercel](https://vercel.com/new?filter=next.js) is the simplest way to deploy. See [Next.js deployment](https://nextjs.org/docs/app/building-your-application/deploying).

## License

MIT
