# Sitemap Tree Manager — TODO

## Immediate (before closing this branch)

- [ ] Merge feature/sitemap-v2 → main via PR

## Deployment (required for production use)

- [ ] Deploy to Vercel and update `contentful-app-manifest.json` src to production URL
- [ ] Install app in target Contentful space (App Registry or management API)
- [ ] Smoke test in production: open entry → verify all 3 locations work

## Features still outstanding

- [ ] Multi-select bulk actions — visual selection exists, but no bulk delete/move yet
- [ ] Child sitemap entry editor view (sitemapType: "child") — currently shows page editor

## Manual QA checklist (verify in real Contentful, not localhost)

- [ ] excludeFromSitemap toggle ↔ Editor tab radio button stays in sync (bidirectional)
- [ ] Folder rename updates slug AND cascades computedPath to all descendants
- [ ] Moving a folder cascades computedPath to all page entries inside it
- [ ] Field editor badge row shows full ancestor chain, not just immediate parent
- [ ] "Move to folder" picker re-fetches fresh folderConfig on each open

## Completed ✓

- [x] Bidirectional excludeFromSitemap sync: tree toggle ↔ Editor tab radio button (9f875c1)
- [x] Cross-iframe sync: sitemapMetadata + excludeFromSitemap bidirectional (65b6485)
- [x] Cascade computedPath when folder is moved or renamed (65b6485)
- [x] Folder rename now updates slug = slugify(title) (65b6485)
- [x] Field editor: full ancestor chain badges + correct nested computedPath (65b6485)
- [x] Tree UI: Contentful-style connector lines, checkbox multi-select, grip at left (368b139)
- [x] Delete button hover fix (--cf-red-600 added to globals.css) (368b139)
- [x] excludeFromSitemap CMA guard (field existence check before write) (368b139)
- [x] Fixed-width "Show excluded" button (368b139)
- [x] Dialog-based delete/rename (no prompt/confirm in iframes) (1c3a784)
- [x] Folder picker shows folder titles, re-fetches on open (1c3a784)
- [x] Auto-sync contentTypes field validation + checkbox widget (9655924)
- [x] Multi-sitemap V2 architecture: 8-field CT schema, child sitemaps, folderConfig (24e43b8)
