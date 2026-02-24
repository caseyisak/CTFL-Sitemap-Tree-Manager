# Sitemap Tree Manager — Open Issues

## Priority issues for next session

### 1. Field editor folder list is stale (rename + delete not reflected)

**Symptoms:**
- Renaming a folder in the entry editor does not update the folder name shown in the "Move to
  folder" picker inside the entry field location.
- Deleting a folder from the entry editor still leaves the folder listed in the entry field
  location's picker.

**Root cause:** `entry-field-location.tsx` fetches `folderConfig` once on mount (inside the
`useEffect`). The entry field is a separate iframe from the entry editor — there is no shared
state or re-render trigger between the two locations.

**Fix direction:**
- Re-fetch `folderConfig` from the Sitemap entry every time the inline picker is opened (move
  the `folderConfig` fetch inside the toggle handler or into a separate `useCallback` triggered
  by `setFolderListOpen(true)`).
- This keeps the list fresh without a full page reload, and the CMA call is lightweight.

---

### 2. Sitemap entries appearing as tree nodes under folders

**Symptom:** The Sitemap CT entry itself (the one with `sitemapType: "root"`) is showing up
as a child node in the visual tree — it should never appear as a page in the tree.

**Root cause:** In `entry-editor-location.tsx`, `fetchEntries` fetches all entries for
`enabledContentTypes`. If the Sitemap CT ID was accidentally added to `enabledContentTypes`
(via the config screen toggle), or if `fetchTypes` falls back to `enabledContentTypes` and
that list includes the Sitemap CT, those entries get included in `allEntries` and rendered
as tree nodes.

**Fix direction:**
- In the `fetchEntries` loop, filter out any entry whose `sys.contentType.sys.id ===
  detectedSitemapCtId` before pushing to `allEntries`.
- Also ensure the config screen prevents the Sitemap CT from being added to
  `enabledContentTypes` (it should never be toggled on as a managed type).

---

### 3. "Add child page" still visible in screenshot (not a code issue)

Context: The code fix was applied and confirmed (`grep` shows no "Add child page" in
`tree-node.tsx`). The screenshot was taken before the dev server hot-reloaded. This item is
resolved — just needs a browser refresh.

---

## Completed this session (feature/sitemap-v2)

| Commit | Summary |
|---|---|
| `24e43b8` | feat(sitemap-v2): multi-sitemap architecture + UI overhaul |
| `9655924` | feat: auto-sync contentTypes field validation + checkbox appearance |
| `1c3a784` | fix: folder picker names, remove add-child-page, dialog-based delete/rename |

### Detailed work done
- **Sitemap CT** now created with `createWithId("sitemap")` — predictable human-readable ID
- **8-field schema**: internalName, slug, sitemapType, folderConfig, childSitemaps,
  contentTypes, changeFrequency, priority
- **Config screen**: root entry card with URL + "Open entry" link; child sitemap management
  dialog; per-field missing-field detection; robots.txt snippet with copy button
- **contentTypes field**: `in` validation auto-synced from enabledContentTypes on every save;
  checkbox widget set via editorInterface API
- **Entry field "Move to folder"**: now fetches `folderConfig` from Sitemap entry (real folder
  names); shows ID on hover; current folder highlighted with ✓ icon
- **Entry editor left panel**: draggable resize handle (280–700px), persisted to localStorage
- **Breadcrumb root label**: reads Sitemap entry `internalName` instead of hardcoded "Sitemap"
- **Sitemap panel**: removed undo/redo/gear buttons; sections→folders display label;
  single expand/collapse toggle; multi-select (shift/cmd-click)
- **Tree node**: removed "Add child page" from context menu
- **Delete/Rename**: replaced `confirm()`/`prompt()` with Dialog components (works in
  Contentful's sandboxed iframes)
- **Developer guide**: `docs/developer-guide.md` — full CDA querying reference
