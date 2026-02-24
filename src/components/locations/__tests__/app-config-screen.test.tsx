/**
 * Tests for app-config-screen.tsx
 *
 * Fix 2b: The Sitemap CT should not appear in the toggleable content type list.
 */
import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor, screen } from "@testing-library/react"

// ── Mock all UI components that use radix-ui internally ──
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, placeholder, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", { value, onChange, placeholder, className, ...rest }),
}))

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, className }: React.HTMLAttributes<HTMLLabelElement>) =>
    React.createElement("label", { className }, children),
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement("span", { className }, children),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, className, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { onClick, className, disabled, ...rest }, children),
}))

vi.mock("@/components/ui/separator", () => ({
  Separator: () => React.createElement("hr"),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { "data-testid": "select" }, children),
  SelectContent: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) =>
    React.createElement("div", { "data-value": value, role: "option" }, children),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) => React.createElement("span", null, placeholder),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  DialogContent: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  DialogDescription: ({ children }: { children?: React.ReactNode }) => React.createElement("p", null, children),
  DialogFooter: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => React.createElement("h2", null, children),
}))

// ── Mock lucide-react ──
vi.mock("lucide-react", () => ({
  Globe: () => React.createElement("span"),
  LayoutGrid: () => React.createElement("span"),
  Plus: () => React.createElement("span"),
  CheckCircle2: () => React.createElement("span"),
  AlertCircle: () => React.createElement("span"),
  ExternalLink: () => React.createElement("span"),
  Copy: () => React.createElement("span"),
  Check: () => React.createElement("span"),
}))

// ── Mock @contentful/react-apps-toolkit ──
const mockOnConfigure = vi.fn()
const mockGetParameters = vi.fn()
const mockGetManyCT = vi.fn()
const mockGetManyEntry = vi.fn()

const SITEMAP_CT_ID = "sitemap"
const PAGE_CT_ID = "page"
const BLOG_CT_ID = "blogPost"

const mockSdk = {
  ids: {
    space: "test-space",
    environment: "master",
    app: "test-app",
  },
  app: {
    onConfigure: mockOnConfigure,
    getParameters: mockGetParameters,
    getCurrentState: vi.fn().mockResolvedValue(null),
    setReady: vi.fn(),
    isInstalled: vi.fn().mockResolvedValue(false),
  },
  parameters: {
    installation: {
      baseUrl: "https://example.com",
      enabledContentTypes: [PAGE_CT_ID],
      contentTypeConfigs: { [PAGE_CT_ID]: { slugFieldId: "slug" } },
    },
  },
  cma: {
    contentType: {
      getMany: mockGetManyCT,
      get: vi.fn(),
      createWithId: vi.fn(),
      publish: vi.fn(),
    },
    entry: {
      getMany: mockGetManyEntry,
    },
    editorInterface: {
      get: vi.fn().mockResolvedValue({ controls: [] }),
      update: vi.fn(),
    },
  },
}

vi.mock("@contentful/react-apps-toolkit", () => ({
  useSDK: () => mockSdk,
}))

// ── Import component after mocks ──
import { AppConfigScreen } from "../app-config-screen"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCTResponse(cts: Array<{ id: string; name: string }>) {
  return {
    items: cts.map((ct) => ({
      sys: { id: ct.id },
      name: ct.name,
      fields: [
        { id: "title", name: "Title", type: "Symbol" },
        { id: "slug", name: "Slug", type: "Symbol" },
      ],
    })),
  }
}

describe("AppConfigScreen — Fix 2b: Sitemap CT excluded from toggleable CT list", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetParameters.mockResolvedValue({
      baseUrl: "https://example.com",
      enabledContentTypes: [PAGE_CT_ID],
      contentTypeConfigs: { [PAGE_CT_ID]: { slugFieldId: "slug" } },
    })

    // All CT list contains: sitemap, page, blogPost
    mockGetManyCT.mockResolvedValue(
      makeCTResponse([
        { id: SITEMAP_CT_ID, name: "Sitemap" },
        { id: PAGE_CT_ID, name: "Page" },
        { id: BLOG_CT_ID, name: "Blog Post" },
      ])
    )

    mockGetManyEntry.mockResolvedValue({ items: [] })
    mockOnConfigure.mockImplementation(() => {})
  })

  it("renders without crashing", async () => {
    render(<AppConfigScreen />)
    await waitFor(() => {
      expect(mockGetParameters).toHaveBeenCalled()
    })
  })

  it("includes Page CT in the toggleable list (has a toggle switch)", async () => {
    render(<AppConfigScreen />)

    // Wait for CT list to render — look for the toggle switch that is aria-checked=true for "page"
    await waitFor(() => {
      const switches = screen.getAllByRole("switch")
      // At least one switch should exist for page CT
      expect(switches.length).toBeGreaterThanOrEqual(1)
    })

    // The page CT switch should be aria-checked=true (it's in enabledContentTypes)
    const switches = screen.getAllByRole("switch")
    const enabledSwitch = switches.find((sw) => sw.getAttribute("aria-checked") === "true")
    expect(enabledSwitch).toBeDefined()
  })

  it("includes Blog Post CT in the toggleable list", async () => {
    render(<AppConfigScreen />)

    await waitFor(() => {
      const els = screen.getAllByText("Blog Post")
      expect(els.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("does NOT render a toggle switch (role=switch) for the Sitemap CT", async () => {
    render(<AppConfigScreen />)

    // Wait for CT list to load — Blog Post CT switch should appear (it's not pre-enabled)
    await waitFor(() => {
      const switches = screen.getAllByRole("switch")
      // Should have exactly 2 switches: page and blogPost (sitemap is filtered out)
      expect(switches.length).toBe(2)
    }, { timeout: 5000 })

    // Verify only 2 CTs in the toggle list (page + blogPost, NOT sitemap)
    const switches = screen.getAllByRole("switch")
    expect(switches.length).toBe(2)

    // Gather text content of the rows containing switches
    const switchRowTexts = switches.map((sw) => {
      // Each switch is inside a div row that also contains ct.name and ct.id
      const row = sw.closest("div.border")
      return row?.textContent ?? ""
    })

    // Neither row should contain "sitemap" as a CT identifier
    for (const rowText of switchRowTexts) {
      // The text "sitemap" as an ID shouldn't appear in either toggle row
      // (it might appear as part of "Sitemap Metadata" in description text, but not as CT id)
      expect(rowText).not.toMatch(/sitemap/)
    }
  })
})

// ─── Unit tests for the filtering logic ──────────────────────────────────────

describe("Content type filtering logic (unit)", () => {
  it("filters out the sitemap CT from the options list", () => {
    // Simulate what init() does in app-config-screen after Fix 2b
    const ctItems = [
      { sys: { id: "sitemap" }, name: "Sitemap", fields: [] },
      { sys: { id: "page" }, name: "Page", fields: [] },
      { sys: { id: "blogPost" }, name: "Blog Post", fields: [] },
    ]

    const detectedSitemapCtId = ctItems.find((ct) => ct.sys.id === "sitemap")?.sys.id ?? null

    const options = ctItems
      .filter((ct) => ct.sys.id !== detectedSitemapCtId)
      .map((ct) => ({ id: ct.sys.id, name: ct.name }))

    expect(options.map((o) => o.id)).not.toContain("sitemap")
    expect(options.map((o) => o.id)).toContain("page")
    expect(options.map((o) => o.id)).toContain("blogPost")
  })

  it("keeps all CTs when no sitemap CT is detected", () => {
    const ctItems = [
      { sys: { id: "page" }, name: "Page" },
      { sys: { id: "blogPost" }, name: "Blog Post" },
    ]

    const detectedSitemapCtId: string | null = null

    const options = ctItems
      .filter((ct) => ct.sys.id !== detectedSitemapCtId)
      .map((ct) => ({ id: ct.sys.id, name: ct.name }))

    expect(options).toHaveLength(2)
    expect(options.map((o) => o.id)).toContain("page")
    expect(options.map((o) => o.id)).toContain("blogPost")
  })

  it("detects sitemap CT by name when ID is not 'sitemap'", () => {
    const ctItems = [
      { sys: { id: "custom-sitemap-id" }, name: "Sitemap", fields: [] },
      { sys: { id: "page" }, name: "Page", fields: [] },
    ]

    const sitemapCt =
      ctItems.find((ct) => ct.sys.id === "sitemap") ??
      ctItems.find((ct) => ct.name.toLowerCase() === "sitemap")

    const detectedSitemapCtId = sitemapCt?.sys.id ?? null

    const options = ctItems
      .filter((ct) => ct.sys.id !== detectedSitemapCtId)
      .map((ct) => ({ id: ct.sys.id, name: ct.name }))

    expect(options.map((o) => o.id)).not.toContain("custom-sitemap-id")
    expect(options.map((o) => o.id)).toContain("page")
  })
})
