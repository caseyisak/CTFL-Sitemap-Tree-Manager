/**
 * Tests for entry-editor-location.tsx
 *
 * Fix 2a: Entries whose sys.contentType.sys.id equals the sitemap CT ID are
 * excluded from the tree nodes in fetchEntries.
 */
import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"

// ── Mock radix-ui ──
vi.mock("radix-ui", () => ({
  Slot: {
    Root: ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
      React.createElement("span", props, children),
  },
}))

// ── Mock lucide-react ──
vi.mock("lucide-react", () => ({
  Download: () => React.createElement("span"),
  Loader2: () => React.createElement("span"),
}))

// ── Mock child components so we can inspect props without rendering the full tree ──
let capturedEntries: unknown[] = []
let capturedSitemap: unknown = null

vi.mock("@/components/sitemap/sitemap-panel-connected", () => ({
  SitemapPanelWithCallback: (props: { sitemap: unknown }) => {
    capturedSitemap = props.sitemap
    return React.createElement("div", { "data-testid": "sitemap-panel" })
  },
}))

vi.mock("@/components/sitemap/details-panel", () => ({
  DetailsPanel: () => React.createElement("div", { "data-testid": "details-panel" }),
}))

// ── Mock @contentful/react-apps-toolkit ──
const mockGetManyEntry = vi.fn()
const mockGetManyCT = vi.fn()
const mockGetEntry = vi.fn()

const SITEMAP_CT_ID = "sitemap"
const PAGE_CT_ID = "page"

const mockSdk = {
  ids: {
    contentType: SITEMAP_CT_ID,
    space: "test-space",
    environment: "master",
  },
  parameters: {
    installation: {
      baseUrl: "https://example.com",
      enabledContentTypes: [PAGE_CT_ID],
      sitemapContentTypeId: SITEMAP_CT_ID,
      contentTypeConfigs: { [PAGE_CT_ID]: { slugFieldId: "slug" } },
    },
  },
  cma: {
    contentType: {
      getMany: mockGetManyCT,
      get: vi.fn().mockResolvedValue({ displayField: "title", fields: [] }),
    },
    entry: {
      getMany: mockGetManyEntry,
      get: mockGetEntry,
      update: vi.fn(),
    },
  },
}

vi.mock("@contentful/react-apps-toolkit", () => ({
  useSDK: () => mockSdk,
}))

// ── Import component after mocks ──
import { EntryEditorLocation } from "../entry-editor-location"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRawEntry(id: string, ctId: string, title: string) {
  return {
    sys: {
      id,
      contentType: { sys: { id: ctId } },
      publishedVersion: 1,
      publishedAt: "2024-01-01",
      updatedAt: "2024-01-01",
      createdAt: "2024-01-01",
    },
    fields: {
      title: { "en-US": title },
      slug: { "en-US": id.toLowerCase().replace(/\s/g, "-") },
      internalName: { "en-US": title },
      sitemapType: { "en-US": "root" },
      folderConfig: { "en-US": [] },
    },
    metadata: { tags: [] },
  }
}

function makeSitemapRootEntry(id: string) {
  return {
    sys: {
      id,
      contentType: { sys: { id: SITEMAP_CT_ID } },
      publishedVersion: 1,
      publishedAt: "2024-01-01",
      updatedAt: "2024-01-01",
      createdAt: "2024-01-01",
    },
    fields: {
      internalName: { "en-US": "Main Sitemap" },
      sitemapType: { "en-US": "root" },
      folderConfig: { "en-US": [] },
    },
    metadata: { tags: [] },
  }
}

describe("EntryEditorLocation — Fix 2a: exclude sitemap CT entries from tree", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedEntries = []
    capturedSitemap = null

    // getMany for sitemap CT entries
    mockGetManyEntry.mockImplementation((opts: { query?: { content_type?: string } }) => {
      const ct = opts?.query?.content_type
      if (ct === SITEMAP_CT_ID) {
        return Promise.resolve({
          items: [makeSitemapRootEntry("sitemap-root-id")],
        })
      }
      if (ct === PAGE_CT_ID) {
        return Promise.resolve({
          items: [
            makeRawEntry("page-1", PAGE_CT_ID, "About"),
            makeRawEntry("page-2", PAGE_CT_ID, "Contact"),
          ],
        })
      }
      return Promise.resolve({ items: [] })
    })

    // getEntry for folder config
    mockGetEntry.mockResolvedValue(makeSitemapRootEntry("sitemap-root-id"))

    mockGetManyCT.mockResolvedValue({ items: [] })
  })

  it("renders without crashing", async () => {
    const { getByTestId } = render(<EntryEditorLocation />)
    await waitFor(() => {
      expect(getByTestId("sitemap-panel")).toBeInTheDocument()
    })
  })

  it("does not include sitemap CT entry in the tree nodes", async () => {
    render(<EntryEditorLocation />)

    await waitFor(() => {
      expect(capturedSitemap).not.toBeNull()
    })

    // Flatten all node IDs from the tree
    function flattenIds(node: { id: string; children?: typeof node[] }): string[] {
      return [node.id, ...(node.children ?? []).flatMap(flattenIds)]
    }

    const allIds = flattenIds(capturedSitemap as { id: string; children: { id: string; children: unknown[] }[] })
    expect(allIds).not.toContain("sitemap-root-id")
  })

  it("includes page entries in the tree nodes", async () => {
    render(<EntryEditorLocation />)

    await waitFor(() => {
      expect(capturedSitemap).not.toBeNull()
    })

    function flattenIds(node: { id: string; children?: typeof node[] }): string[] {
      return [node.id, ...(node.children ?? []).flatMap(flattenIds)]
    }

    const allIds = flattenIds(capturedSitemap as { id: string; children: { id: string; children: unknown[] }[] })
    expect(allIds).toContain("page-1")
    expect(allIds).toContain("page-2")
  })

  it("skips fetching page entries for the sitemap CT ID even if it appears in enabledContentTypes", async () => {
    // Simulate the scenario where sitemap CT was accidentally added to enabledContentTypes
    const originalEnabled = mockSdk.parameters.installation.enabledContentTypes
    mockSdk.parameters.installation.enabledContentTypes = [PAGE_CT_ID, SITEMAP_CT_ID]

    render(<EntryEditorLocation />)

    await waitFor(() => {
      expect(capturedSitemap).not.toBeNull()
    })

    function flattenIds(node: { id: string; children?: typeof node[] }): string[] {
      return [node.id, ...(node.children ?? []).flatMap(flattenIds)]
    }

    const allIds = flattenIds(capturedSitemap as { id: string; children: { id: string; children: unknown[] }[] })
    // Sitemap root entry should NOT appear as a tree node
    expect(allIds).not.toContain("sitemap-root-id")
    // Page entries should still appear
    expect(allIds).toContain("page-1")

    // Restore
    mockSdk.parameters.installation.enabledContentTypes = originalEnabled
  })
})
