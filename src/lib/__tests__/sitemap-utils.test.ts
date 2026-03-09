import { describe, it, expect } from "vitest"
import {
  slugify,
  buildSitemapTree,
  buildSitemapTreeWithFolders,
  findChangedParentIds,
  transformEntry,
} from "../sitemap-utils"
import type { ContentfulPageEntry, FolderNode } from "../contentful-types"

// ─── slugify ────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("removes special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world")
  })

  it("trims leading/trailing whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello")
  })

  it("collapses multiple spaces into one hyphen", () => {
    expect(slugify("hello   world")).toBe("hello-world")
  })

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("")
  })
})

// ─── buildSitemapTree ────────────────────────────────────────────────────────

function makeEntry(id: string, parentId: string | null = null): ContentfulPageEntry {
  return {
    id,
    title: id,
    slug: id,
    contentType: "page",
    metadata: parentId !== null ? { parentEntryId: parentId, computedPath: `/${id}` } : null,
    excludeFromSitemap: false,
    tags: [],
    sys: { publishedAt: null, updatedAt: "", createdAt: "" },
  }
}

describe("buildSitemapTree", () => {
  it("returns a root node for empty entries", () => {
    const tree = buildSitemapTree([])
    expect(tree.id).toBe("root")
    expect(tree.children).toHaveLength(0)
  })

  it("places entries with no parent at root level", () => {
    const entries = [makeEntry("a"), makeEntry("b")]
    const tree = buildSitemapTree(entries)
    expect(tree.children.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("nests entries under their parent", () => {
    const entries = [makeEntry("parent"), makeEntry("child", "parent")]
    const tree = buildSitemapTree(entries)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].children[0].id).toBe("child")
  })

  it("places orphaned entries (unknown parent) at root", () => {
    const entries = [makeEntry("orphan", "non-existent-parent")]
    const tree = buildSitemapTree(entries)
    expect(tree.children[0].id).toBe("orphan")
  })
})

// ─── buildSitemapTreeWithFolders ─────────────────────────────────────────────

function makeFolder(id: string, parentId: string | null = null): FolderNode {
  return { id, title: id, slug: id, parentId }
}

describe("buildSitemapTreeWithFolders", () => {
  it("creates folder nodes at root level", () => {
    const folders = [makeFolder("folder-1")]
    const tree = buildSitemapTreeWithFolders(folders, [])
    expect(tree.children[0].id).toBe("folder-1")
    expect(tree.children[0].type).toBe("section")
  })

  it("nests page entries under a folder", () => {
    const folders = [makeFolder("folder-1")]
    const entries = [makeEntry("page-1", "folder-1")]
    const tree = buildSitemapTreeWithFolders(folders, entries)
    expect(tree.children).toHaveLength(1) // folder-1 at root
    expect(tree.children[0].children[0].id).toBe("page-1")
  })

  it("does NOT include a sitemap CT entry when it is not in the entries list", () => {
    // This test documents the intended behavior after Fix 2:
    // If we pass only page entries (sitemap CT filtered out), it should not appear.
    const folders: FolderNode[] = []
    const entries = [makeEntry("page-1")]
    const tree = buildSitemapTreeWithFolders(folders, entries)
    const allIds = flattenNodeIds(tree)
    expect(allIds).not.toContain("sitemap-entry-id")
    expect(allIds).toContain("page-1")
  })
})

function flattenNodeIds(node: { id: string; children: typeof node[] }): string[] {
  return [node.id, ...node.children.flatMap(flattenNodeIds)]
}

// ─── findChangedParentIds ─────────────────────────────────────────────────────

describe("findChangedParentIds", () => {
  it("detects when a node moved to a new parent", () => {
    const old = buildSitemapTree([makeEntry("a"), makeEntry("b")])
    const updated = buildSitemapTree([makeEntry("a"), makeEntry("b", "a")])
    const changed = findChangedParentIds(old, updated)
    expect(changed.find((c) => c.id === "b")?.newParentId).toBe("a")
  })

  it("returns empty array when nothing changed", () => {
    const tree = buildSitemapTree([makeEntry("a"), makeEntry("b")])
    const changed = findChangedParentIds(tree, JSON.parse(JSON.stringify(tree)))
    expect(changed).toHaveLength(0)
  })
})

// ─── transformEntry ───────────────────────────────────────────────────────────

describe("transformEntry", () => {
  it("reads title from display field", () => {
    const raw = {
      sys: { id: "entry-1", publishedAt: null, updatedAt: "", createdAt: "" },
      fields: { title: { "en-US": "My Page" }, slug: { "en-US": "my-page" } },
      metadata: { tags: [] },
    }
    const result = transformEntry(raw, "page", "slug", "title")
    expect(result.title).toBe("My Page")
    expect(result.slug).toBe("my-page")
    expect(result.id).toBe("entry-1")
  })

  it("falls back to sys.id when title field is missing", () => {
    const raw = {
      sys: { id: "entry-2", publishedAt: null, updatedAt: "", createdAt: "" },
      fields: {},
      metadata: { tags: [] },
    }
    const result = transformEntry(raw, "page", "slug", "title")
    expect(result.title).toBe("entry-2")
  })

  it("reads sitemapMetadata when present", () => {
    const raw = {
      sys: { id: "entry-3", publishedAt: null, updatedAt: "", createdAt: "" },
      fields: {
        title: { "en-US": "Page" },
        slug: { "en-US": "page" },
        sitemapMetadata: {
          "en-US": { parentEntryId: "folder-1", computedPath: "/folder-1/page" },
        },
      },
      metadata: { tags: [] },
    }
    const result = transformEntry(raw, "page", "slug", "title")
    expect(result.metadata?.parentEntryId).toBe("folder-1")
    expect(result.metadata?.computedPath).toBe("/folder-1/page")
  })
})
