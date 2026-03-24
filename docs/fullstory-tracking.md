# FullStory Tracking Reference

## Configuration

FullStory is initialized via `src/components/fullstory-init.tsx`.

**To disable:** remove `NEXT_PUBLIC_FULLSTORY_ORG_ID` from Vercel env vars and redeploy.
**To re-enable:** add it back — no code change needed.

| Env var | Value |
|---|---|
| `NEXT_PUBLIC_FULLSTORY_ORG_ID` | `o-1KAFER-na1` |

---

## Tracked Elements (`data-fs-id`)

### App Config (`app-config-screen.tsx`)

| `data-fs-id` | Element | Notes |
|---|---|---|
| `how-it-works-fields-toggle` | "How it works" collapsible — fields section | |
| `how-it-works-sitemap-toggle` | "How it works" collapsible — sitemap section | |
| `toggle-ct-{id}` | Content type enable/disable switch | e.g. `toggle-ct-page` |
| `create-sitemap-ct` | Create Sitemap content type button | First-time setup only |
| `add-field-{id}` | Add missing field button | e.g. `add-field-sitemapMetadata` |
| `create-root-entry` | Create root Sitemap entry button | First-time setup only |
| `add-child-sitemap-open` | "Add child sitemap" button (opens dialog) | |
| `add-child-sitemap-confirm` | Confirm button inside Add child sitemap dialog | |
| `copy-robots-txt` | Copy robots.txt snippet button | |

### Sitemap Panel / Entry Editor (`sitemap-panel-connected.tsx`)

| `data-fs-id` | Element | Notes |
|---|---|---|
| `toolbar-expand-collapse` | Expand all / Collapse all toggle | |
| `toolbar-scope-toggle` | "This sitemap" / "All sitemaps" toggle | Only visible on child sitemap entries |
| `toolbar-show-excluded` | Show excluded / Excluded only toggle | |
| `toolbar-add-folder` | Add folder button (toolbar) | |
| `add-folder-confirm` | Confirm button in Add folder dialog | |
| `delete-node-confirm` | Delete button in Delete confirmation dialog | |
| `rename-node-confirm` | Rename button in Rename dialog | |

### Tree Node (`tree-node.tsx`)

| `data-fs-id` | Element | Notes |
|---|---|---|
| `node-expand-toggle` | Chevron expand/collapse on a node | |
| `node-select` | Click to select a node | |
| `node-actions-menu` | ··· actions menu trigger | |
| `context-add-to-sitemap` | Context menu — Add to this sitemap | Only on out-of-scope nodes |
| `context-add-folder` | Context menu — Add folder | Only on nodes that can have children |
| `context-rename` | Context menu — Rename | |
| `context-duplicate` | Context menu — Duplicate | Not shown on root |
| `context-open-new-tab` | Context menu — Open in new tab | |
| `context-delete` | Context menu — Delete | Not shown on root |

### Entry Field (`entry-field-location.tsx`)

| `data-fs-id` | Element | Notes |
|---|---|---|
| `move-to-folder-toggle` | "Move to folder..." button (opens/closes picker) | |
| `set-parent-root` | "Root (top level)" option in folder picker | |
| `set-parent-entry` | Any folder/page entry in folder picker | |
