/**
 * Tests for entry-field-location.tsx
 *
 * Fix 1: folderConfig is re-fetched every time the "Move to folder" picker is opened.
 */
import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"

// ── Mock all UI components that import radix-ui (avoids version-conflict errors) ──
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, placeholder, className, autoFocus, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", { value, onChange, placeholder, className, autoFocus, ...rest }),
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
  Button: ({ children, onClick, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { onClick, className, ...rest }, children),
}))

// ── Mock lucide-react icons ──
vi.mock("lucide-react", () => ({
  Globe: () => React.createElement("span", { "data-testid": "icon-globe" }),
  Folder: () => React.createElement("span", { "data-testid": "icon-folder" }),
  X: () => React.createElement("span", { "data-testid": "icon-x" }),
  Home: () => React.createElement("span", { "data-testid": "icon-home" }),
  ChevronDown: () => React.createElement("span", { "data-testid": "icon-chevron-down" }),
  ChevronUp: () => React.createElement("span", { "data-testid": "icon-chevron-up" }),
  Check: () => React.createElement("span", { "data-testid": "icon-check" }),
}))

// ── Mock @contentful/react-apps-toolkit ──
const mockGetManyCT = vi.fn()
const mockGetManyEntry = vi.fn()

const mockSdk = {
  field: {
    type: "Symbol",
    getValue: vi.fn(() => "test-slug"),
    setValue: vi.fn(),
  },
  entry: {
    getSys: vi.fn(() => ({ id: "current-entry-id" })),
    fields: {
      title: { getValue: vi.fn(() => "Test Title") },
      sitemapMetadata: {
        getValue: vi.fn(() => null),
        onValueChanged: vi.fn(() => vi.fn()),
      },
    },
  },
  parameters: {
    installation: {
      baseUrl: "https://example.com",
      enabledContentTypes: ["page"],
      sitemapContentTypeId: "sitemap",
      contentTypeConfigs: { page: { slugFieldId: "slug" } },
    },
  },
  cma: {
    contentType: {
      getMany: mockGetManyCT,
      get: vi.fn().mockResolvedValue({ displayField: "title" }),
    },
    entry: {
      getMany: mockGetManyEntry,
    },
  },
}

vi.mock("@contentful/react-apps-toolkit", () => ({
  useSDK: () => mockSdk,
  useAutoResizer: vi.fn(),
}))

// ── Import component after mocks ──
import { EntryFieldLocation } from "../entry-field-location"

// Helper to build a mock folder entry response
function makeFolderEntryResponse(folders: Array<{ id: string; title: string; slug: string }>) {
  return {
    items: [
      {
        sys: { id: "root-sitemap-entry" },
        fields: {
          sitemapType: { "en-US": "root" },
          folderConfig: {
            "en-US": folders.map((f) => ({
              id: f.id,
              title: f.title,
              slug: f.slug,
              parentId: null,
            })),
          },
        },
      },
    ],
  }
}

describe("EntryFieldLocation — Fix 1: re-fetch folderConfig on picker open", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Only one getMany call on mount: for the sitemap entry (folders only, no page entries)
    mockGetManyEntry.mockResolvedValue(
      makeFolderEntryResponse([{ id: "folder-1", title: "Academics", slug: "academics" }])
    )

    mockGetManyCT.mockResolvedValue({ items: [] })
  })

  it("calls entry.getMany on initial mount", async () => {
    render(<EntryFieldLocation />)

    await waitFor(() => {
      // One call on mount: for sitemap entry to load folders
      expect(mockGetManyEntry).toHaveBeenCalled()
    })
  })

  it("re-fetches folderConfig when the picker is opened a second time", async () => {
    render(<EntryFieldLocation />)

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(mockGetManyEntry).toHaveBeenCalledTimes(1) // sitemap only
    })

    const callCountAfterMount = mockGetManyEntry.mock.calls.length

    // Set up fresh response for the re-fetch (simulating renamed folder)
    mockGetManyEntry.mockResolvedValue(
      makeFolderEntryResponse([{ id: "folder-1", title: "Academics (renamed)", slug: "academics" }])
    )

    // Open the picker
    const moveButton = screen.getByText("Move to folder...")
    await act(async () => {
      fireEvent.click(moveButton)
    })

    await waitFor(() => {
      // Should have called getMany again after opening
      expect(mockGetManyEntry.mock.calls.length).toBeGreaterThan(callCountAfterMount)
    })
  })

  it("shows fresh folder name after re-fetch on open", async () => {
    render(<EntryFieldLocation />)

    await waitFor(() => {
      expect(mockGetManyEntry).toHaveBeenCalledTimes(1)
    })

    // Now simulate a rename by returning the new name on the next fetch
    mockGetManyEntry.mockResolvedValue(
      makeFolderEntryResponse([{ id: "folder-1", title: "New Folder Name", slug: "academics" }])
    )

    const moveButton = screen.getByText("Move to folder...")
    await act(async () => {
      fireEvent.click(moveButton)
    })

    await waitFor(() => {
      expect(screen.getByText("New Folder Name")).toBeInTheDocument()
    })
  })

  it("does NOT re-fetch when the picker is closed (toggle off)", async () => {
    render(<EntryFieldLocation />)

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockGetManyEntry).toHaveBeenCalledTimes(1)
    })

    // Open the picker
    const moveButton = screen.getByText("Move to folder...")

    mockGetManyEntry.mockResolvedValue(
      makeFolderEntryResponse([{ id: "folder-1", title: "Academics", slug: "academics" }])
    )

    await act(async () => {
      fireEvent.click(moveButton) // open
    })
    await waitFor(() => {
      expect(mockGetManyEntry.mock.calls.length).toBeGreaterThan(1)
    })

    const callCountAfterOpen = mockGetManyEntry.mock.calls.length

    // Close the picker (toggle off)
    await act(async () => {
      fireEvent.click(moveButton) // close
    })

    // Wait a bit — no new fetch should happen on close
    await new Promise((r) => setTimeout(r, 50))
    expect(mockGetManyEntry.mock.calls.length).toBe(callCountAfterOpen)
  })
})
