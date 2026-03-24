# Sitemap Tree Manager — SE Demo Deck

**Audience:** Contentful SE team
**Format:** ~8 min demo with slides
**Core message:** Contentful's Custom Apps platform gives us the building blocks to solve customer objections in-house — this app is proof.

---

## Narrative Arc

**Limbic Open (emotion)** → **Problem (logic)** → **Platform Reframe** → **Demo (Tell-Show-Tell x3)** → **Value Close (emotion callback)**

---

## Slide 1 — Title

**Layout:** Image background with centered text overlay

| Element | Content |
|---|---|
| Headline | Sitemap Tree Manager |
| Subhead | Solving the "where does my content live?" problem — with Custom Apps |
| Footer | Contentful SE Demo |

---

## Slide 2 — The SMU Story

**Layout:** Split 50/50 — text left, visual right (flat list of entries all named "About")

### Left side

> **"Which About page am I editing?"**
>
> SMU was migrating from Sitecore. Their editors were used to a content tree — every entry had a *place* in the site. When they saw Contentful's flat entry list, they hit a wall.
>
> They had an About page for the School of Business, one for the School of Law, one for Admissions. All named "About."
>
> Tags helped, but felt bolted on. What they really wanted was spatial awareness — *where does this entry live in my site?*

### Speaker notes

This is your emotional hook. Pause after "All named About." Let that land. Every SE in the room has heard a version of this from Sitecore, AEM, or WordPress migration prospects.

---

## Slide 3 — The Real Problem

**Layout:** Large callout (single statement, big font, centered)

| Element | Content |
|---|---|
| Headline | Contentful is structured. But it's not *spatial*. |
| Subtext | Editors think in site trees. Contentful thinks in content models. That gap creates friction — especially in CMS migrations. |

---

## Slide 4 — The Platform Reframe

**Layout:** Large callout

| Element | Content |
|---|---|
| Headline | But Contentful gives us the building blocks. |
| Subtext | Custom Apps. Three location types. The Content Management API. Field-level event subscriptions. That's all we needed to close the gap ourselves. |

### Speaker notes

This is the pivot. The message isn't "Contentful can't do this." It's "Contentful's extensibility platform meant we didn't have to wait for a product feature — we built the answer."

---

## Slide 5 — Tell #1: The Tree (Entry Editor)

**Layout:** Split 50/50 — text left, screenshot right (entry editor with tree panel)

### Left side

**A sitemap tree, inside Contentful**

- Drag-and-drop pages and folders to define hierarchy
- Folders are virtual (JSON on the Sitemap entry) — zero content model bloat
- Every page gets a `computedPath` (e.g. `/business/about`)
- Built as an **Entry Editor** location — editors see it while editing any managed entry

**Custom App building blocks used:**
- Entry Editor location
- CMA `entry.update()` for persisting `sitemapMetadata`
- `onValueChanged` subscriptions for cross-iframe sync

### Speaker notes

*"Let me show you what this looks like."* → Switch to live demo. Show the tree, drag a page into a folder, point out the path update in real time. Then: *"That's the Entry Editor location — one of three locations Custom Apps can register."*

---

## Slide 6 — Tell #2: The Field Widget (Entry Field)

**Layout:** Split 50/50 — text left, screenshot right (entry field with breadcrumb badges + URL preview)

### Left side

**Every entry knows its place**

- Inline slug field with full ancestor breadcrumb chain
- URL preview: `https://smu.edu/business/about`
- "Move to folder" picker — editors reparent without touching the tree
- Changes sync bidirectionally between tree and field in real time

**Custom App building blocks used:**
- Entry Field location (renders inside the slug field)
- `sdk.entry.fields["sitemapMetadata"].setValue()` → triggers `onValueChanged` in the editor iframe
- Guard refs prevent echo loops between the two iframes

### Speaker notes

*"Now let me show what the editor sees on the entry itself."* → Demo: open a page entry, show breadcrumbs, use "Move to folder," watch URL update. *"This is the answer to 'which About page?' — it's the one at /business/about. And this is the Entry Field location — the second building block."*

---

## Slide 7 — Tell #3: Config & Multi-Sitemap

**Layout:** Split 50/50 — text left, screenshot right (app config screen)

### Left side

**One-click setup, any sitemap strategy**

- **Single sitemap** — one XML file, all content types
- **Sitemap index** — multiple XML files, scoped by content type
- Config screen: toggle content types on, auto-creates the Sitemap CT + root entry
- robots.txt snippet with copy button
- Child sitemap scoping — tree auto-filters when editing a child entry

**Custom App building blocks used:**
- App Configuration location
- `sdk.app.onConfigure()` to persist parameters + wire editor interfaces
- CMA `contentType.createWithId()` + `contentType.publish()` to scaffold the Sitemap CT
- `editorInterface.update()` to set widget appearances and help text

### Speaker notes

*"And here's the config — the third location."* → Demo: toggle a content type on, show Sitemap CT creation, add a child sitemap, copy robots.txt. *"One config screen. No manual content model changes. The app manages everything through the CMA."*

---

## Slide 8 — Architecture (30 seconds)

**Layout:** Large callout with bullet list below

| Element | Content |
|---|---|
| Headline | What's under the hood |

**Data written to entries:**
- `sitemapMetadata` (JSON) → `{ parentEntryId, computedPath }` — position + full URL path
- `excludeFromSitemap` (Boolean) → hide from XML output
- `folderConfig` (JSON on Sitemap entry) → virtual folder tree stored centrally

**App architecture:**
- Next.js static export — runs as an iframe inside Contentful
- 3 locations: Config, Entry Editor, Entry Field
- No external server, no database — 100% Contentful APIs

### Speaker notes

Keep this to 30 seconds. The point: no moving parts outside Contentful. The data layer is Contentful entries. The UI is a Custom App. The customer's website reads `sitemapMetadata` via the Delivery API to generate XML.

---

## Slide 9 — The Real Value

**Layout:** Split 50/50 — left: three value statements stacked, right: Contentful Custom Apps logo or platform diagram

### Left side

| For... | The value |
|---|---|
| **Editors migrating from tree-based CMS** | Spatial context — every entry has a place |
| **Developers building the front end** | Structured data — `computedPath` via CDA, no guesswork |
| **SEs in a competitive deal** | "Yes, Contentful can do that — and here's the proof" |

### Right side callout

> **This app exists because Custom Apps exist.**
> Three locations. One API. The building blocks were already there — we just assembled them.

### Speaker notes

Drive this home: the app is impressive, but the *platform* is the story. Any customer-specific gap can be closed the same way. Custom Apps aren't a workaround — they're a first-class extension point.

---

## Slide 10 — Close

**Layout:** Large callout (callback to slide 2)

| Element | Content |
|---|---|
| Headline | "Which About page am I editing?" |
| Subtext | Now they know. It's the one at `/business/about`. |
| Small footer | Built with Contentful Custom Apps — 3 locations, 0 external dependencies. |

### Speaker notes

Let it land. Pause. Then: "Questions?"

---

## Demo Script — Tell-Show-Tell x3

| Loop | Tell (30s) | Show (60–90s) | Tell (15s) |
|---|---|---|---|
| **1 — Tree** | "Editors from tree-based CMS expect to see where content lives. This Custom App adds a drag-and-drop tree to the entry editor — that's the Entry Editor location." | Open a Sitemap entry → show tree → drag a page into a folder → point out `computedPath` update in real time | "Every entry now has spatial context. And that's just one of the three Custom App locations we're using." |
| **2 — Field** | "But editors don't always start from the tree. When they open an individual entry, they need to see where it lives too. That's the Entry Field location." | Open a page entry → show breadcrumb badges → use "Move to folder" → show URL preview update → highlight the real-time sync | "That's the answer to 'which About page?' The breadcrumbs and URL make it obvious — and it's all powered by field-level event subscriptions." |
| **3 — Config** | "Setting this up is a one-click operation from the App Configuration location — the third building block." | Open App Config → toggle on a content type → show Sitemap CT creation → add a child sitemap → copy robots.txt snippet | "Three locations. The CMA. That's all it took to build this. The building blocks were already in Contentful." |

---

## Timing Guide (~8 min)

| Section | Time |
|---|---|
| SMU story + problem framing (slides 1–4) | 2 min |
| Tell-Show-Tell loop 1 — Tree (slide 5) | 2 min |
| Tell-Show-Tell loop 2 — Field (slide 6) | 2 min |
| Tell-Show-Tell loop 3 — Config (slide 7) | 1.5 min |
| Architecture flash (slide 8) | 0.5 min |
| Value close + Q&A (slides 9–10) | open |

---

## Appendix: Key Talking Points for Q&A

**"Is this on the Marketplace?"**
Working toward it. Static export is done, tests pass, build passes. The architecture is marketplace-ready.

**"Does this replace the need for a sitemap generator?"**
No. This is a data layer. It writes `sitemapMetadata` and `excludeFromSitemap` to entries. The customer's website reads that data via CDA and generates the actual XML. See `docs/developer-guide.md` for the full integration guide.

**"How does it handle large sites?"**
Paginated CMA fetches (200 entries per batch, up to 1000 per content type). Folders are JSON, not entries, so they don't count against entry limits. Tree rendering is virtualized for performance.

**"What if the customer already has a sitemap content type?"**
The app detects existing CTs by ID (`sitemap`) or by name. Missing fields get individual "Add field" buttons — no need to recreate from scratch.

**"Can I use this for a customer demo right now?"**
Yes. Clone the repo, `bun install`, `bun dev`, tunnel to HTTPS, install in a demo space. The config screen handles all setup — no manual content model work needed.
