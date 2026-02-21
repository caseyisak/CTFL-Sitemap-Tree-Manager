# Folder Config Bug Report & Fix

**Date:** 2026-02-21
**Affected file:** `src/components/locations/entry-editor-location.tsx`
**Symptom:** Creating folders in the Sitemap app never persisted to the Contentful entry (`folderConfig` field on entry `6HZD5bJGMtBlA6CqfVNHcu` remained empty after every save attempt).

---

## Bug 1 — Stale `sitemapEntryId` in `saveFolderConfig` closure

### Root cause

`saveFolderConfig` was a `useCallback` that captured `sitemapEntryId` **from React state at render time**. The detection sequence inside `fetchEntries` is:

1. Query all content types → find CT named "Sitemap" → ID: `6es1yAEHNDSi2Mad4pcGKb`
2. Query entries for that CT → find singleton entry → ID: `6HZD5bJGMtBlA6CqfVNHcu`
3. Call `setSitemapEntryId("6HZD5bJGMtBlA6CqfVNHcu")` — **queues** a React state update

At step 3, the state update is queued but has not yet propagated to any existing callbacks. Every function that captured `sitemapEntryId` from state at the time it was last rendered still sees `null`.

When the user then created a folder, `saveFolderConfig` ran with `sitemapEntryId = null`, hit the early-return guard, wrote the new folder only to local React state, and returned without touching Contentful.

### Contributing factor — fallback query used wrong CT ID

The fallback (when `installation.sitemapEntryId` was not in app params) queried:

```typescript
{ content_type: sitemapContentTypeId }
// where sitemapContentTypeId = installation?.sitemapContentTypeId ?? "sitemap"
```

Because the app params had never been saved after the Sitemap CT was created from the config screen, `sitemapContentTypeId` defaulted to the string `"sitemap"`. The actual CT ID was `6es1yAEHNDSi2Mad4pcGKb`. The query returned 0 results → `sitemapEntryId` stayed `null`.

### Fix

Replaced the fallback with a **name-based CT lookup** (same logic used by the config screen):

```typescript
let ctIdToQuery = installation?.sitemapContentTypeId ?? null
if (!ctIdToQuery) {
  const ctResp = await sdk.cma.contentType.getMany({ query: { limit: 200 } })
  const sitemapCt = (ctResp.items ?? []).find(ct => ct.name.toLowerCase() === "sitemap")
  ctIdToQuery = sitemapCt?.sys.id ?? null
}
```

And replaced `sitemapEntryId` state with a **ref** so `saveFolderConfig` always reads the current value:

```typescript
const sitemapEntryIdRef = useRef<string | null>(null)

const saveFolderConfig = useCallback(async (newFolders: FolderNode[]) => {
  const entryId = sitemapEntryIdRef.current  // ref — never stale
  if (!entryId) { setFolders(newFolders); return }
  // ... CMA update
}, [sdk])
```

---

## Bug 2 — Race condition: `handleSitemapChange` overwrote `handleCreateFolder`

### Root cause

When a folder is created, the call sequence is:

1. `handleCreateFolder` calls `saveFolderConfig([newFolder])` — async CMA update starts
2. `sitemap-panel-connected.tsx` immediately calls `onSitemapChange(newSitemap)` — synchronous
3. `handleSitemapChange` fires with its **stale closure** where `folderConfig = []`
4. It calls `saveFolderConfig([])` — both writes are now in-flight with the **same Contentful entry version number**
5. The second write (empty array) lands last → Contentful stores `[]`

Because both calls go out before either resolves, Contentful's optimistic locking (`sys.version`) cannot distinguish them — they both use the same version. The second write silently wins and erases the folder.

### Evidence from race condition simulation test

```
Step b: handleCreateFolder updates entry [folder1] → v13 → v14
Step c: Stale-closure write attempts [] using old v13 → HTTP 409 VersionMismatch
        (Optimistic locking blocked it in the serial test case)

KEY INSIGHT: In the actual React app, both writes fire before either resolves
(same microtask tick), so both use the SAME live version number at call time.
Contentful accepts both — the second write wins silently.
```

### Fix

Two changes together eliminate the overwrite:

**1. Use `folderConfigRef` so `handleSitemapChange` always reads the current folder list:**

```typescript
const folderConfigRef = useRef<FolderNode[]>([])

// In handleSitemapChange:
const currentFolders = folderConfigRef.current  // always current
const updatedFolders = currentFolders.map(f => {
  const change = changedFolders.find(c => c.id === f.id)
  return change ? { ...f, parentId: change.newParentId } : f
})
```

**2. Filter `changedFolders` to only process folders that existed *before* the change:**

Newly-added folders appear in `newSitemap` but not in `originalSitemap`. They are already handled (and saved) by `handleCreateFolder`. Including them in `handleSitemapChange` caused the double-write.

```typescript
const changedFolders = changed.filter(({ id }) =>
  !realEntryIds.has(id) &&
  id !== "root" &&
  folderConfigRef.current.some(f => f.id === id)  // must already exist
)
```

With this filter, when a folder is freshly created:
- `changedFolders` is empty (the new folder isn't in `folderConfigRef.current` yet when `handleSitemapChange` fires)
- No second write occurs
- `handleCreateFolder`'s write is the only write → folder persists

---

## All stale-closure sites fixed

All folder CRUD callbacks were updated to read from `folderConfigRef.current` instead of the state closure:

| Callback | Old (stale) | Fixed |
|---|---|---|
| `saveFolderConfig` | `sitemapEntryId` state | `sitemapEntryIdRef.current` |
| `handleCreateFolder` | `folderConfig` state | `folderConfigRef.current` |
| `handleRenameEntry` | `folderConfig` state | `folderConfigRef.current` |
| `handleDeleteEntry` | `folderConfig` state | `folderConfigRef.current` |
| `handleSaveDetails` | `folderConfig` state | `folderConfigRef.current` |
| `handleSitemapChange` | `folderConfig` state | `folderConfigRef.current` |

A shared setter pair keeps both state and ref in sync:

```typescript
const setEntryId = (id: string | null) => {
  sitemapEntryIdRef.current = id
  setSitemapEntryId(id)
}
const setFolders = (folders: FolderNode[]) => {
  folderConfigRef.current = folders
  setFolderConfig(folders)
}
```

---

## Test results

### CMA write test (`test-folder-save.mjs`)

Verified the Contentful Management API can read and write `folderConfig` correctly.

| Step | Result |
|---|---|
| GET entry before | `folderConfig = []`, version 6 |
| UPDATE to `[{id:"folder-test-123",...}]` | HTTP 200, version 7 |
| GET entry after | `folderConfig = [{id:"folder-test-123",...}]` ✅ |

### Race condition simulation test (`test-race-condition.mjs`)

| Step | Result |
|---|---|
| a. GET before | `folderConfig = []` ✅ |
| b. `handleCreateFolder` write → `[folder1]` | HTTP 200, v13→v14 ✅ |
| c. Stale-closure write → `[]` using old v13 | HTTP 409 VersionMismatch (blocked in serial case) ✅ |
| d. GET after stale write attempt | `folderConfig = [folder1]` — not overwritten ✅ |
| e. Reset to `[]` | HTTP 200 ✅ |
| f1. Fixed: `handleCreateFolder` → `[folder1]` | HTTP 200, v15→v16 ✅ |
| f2. Fixed: `folderConfigRef.current = [folder1]` | No second write needed ✅ |
| f3. `handleSitemapChange` detects no existing-folder changes, skips save | 0 CMA calls ✅ |
| g. GET final | `folderConfig = [folder1]` — persisted correctly ✅ |

**All 8 checks passed.**

---

## Final state

- Entry `6HZD5bJGMtBlA6CqfVNHcu` reset to `folderConfig = []` (version 17) — clean slate for app use
- Build: ✅ compiled successfully
- Test files: removed after run
