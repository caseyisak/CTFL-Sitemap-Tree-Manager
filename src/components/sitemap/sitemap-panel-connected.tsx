"use client"

import type React from "react"
import { useState, useCallback } from "react"
import type { SitemapNode, DragState } from "@/lib/sitemap-types"
import { MAX_DEPTH } from "@/lib/sitemap-types"
import { TreeNode } from "./tree-node"
import { cn } from "@/lib/utils"
import {
  Search,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Folder
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface SitemapPanelProps {
  onSelectNode: (nodeId: string) => void
  sitemap: SitemapNode
  onSitemapChange: (sitemap: SitemapNode) => void
  currentPageId?: string
  onRenameEntry?: (nodeId: string, newTitle: string) => Promise<void>
  onDuplicateEntry?: (nodeId: string) => Promise<void>
  onDeleteEntry?: (nodeId: string) => Promise<void>
  onOpenEntryNewTab?: (nodeId: string) => void
  /** When provided, folder creation calls this async fn and uses the returned node (with real CMA ID) */
  onCreateFolder?: (parentId: string | null, title: string, slug: string) => Promise<SitemapNode>
}

export function SitemapPanelWithCallback({
  onSelectNode,
  sitemap,
  onSitemapChange,
  currentPageId: currentPageIdProp,
  onRenameEntry,
  onDuplicateEntry,
  onDeleteEntry,
  onOpenEntryNewTab,
  onCreateFolder,
}: SitemapPanelProps) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [lastClickedNodeId, setLastClickedNodeId] = useState<string | null>(null)
  const [currentPageId] = useState<string>(currentPageIdProp ?? "my-tasks")
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(getAllExpandedIds(sitemap))
  )
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedNodeId: null,
    targetNodeId: null,
    dropPosition: null,
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddFolderDialog, setShowAddFolderDialog] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [newFolderTitle, setNewFolderTitle] = useState("")
  const [history, setHistory] = useState<SitemapNode[]>([sitemap])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [showExcluded, setShowExcluded] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [allExpanded, setAllExpanded] = useState(false)

  function getAllExpandedIds(node: SitemapNode): string[] {
    const ids: string[] = []
    if (node.isExpanded) ids.push(node.id)
    for (const child of node.children) {
      ids.push(...getAllExpandedIds(child))
    }
    return ids
  }

  const updateHistory = (newSitemap: SitemapNode) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newSitemap)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleExpandAll = () => {
    const allIds = getAllNodeIds(sitemap)
    setExpandedNodes(new Set(allIds))
    setAllExpanded(true)
  }

  const handleCollapseAll = () => {
    setExpandedNodes(new Set(["root"]))
    setAllExpanded(false)
  }

  function getAllNodeIds(node: SitemapNode): string[] {
    return [node.id, ...node.children.flatMap(getAllNodeIds)]
  }

  /** Flatten the visible tree into depth-first order (for shift-click range selection). */
  function getVisibleNodeIds(node: SitemapNode, expanded: Set<string>): string[] {
    const ids: string[] = [node.id]
    if (expanded.has(node.id)) {
      for (const child of node.children) {
        ids.push(...getVisibleNodeIds(child, expanded))
      }
    }
    return ids
  }

  const handleSelect = useCallback((nodeId: string, modifiers?: { shift?: boolean; meta?: boolean }) => {
    if (modifiers?.meta) {
      // Cmd/Ctrl+click — toggle individual node
      setSelectedNodeIds((prev) => {
        const next = new Set(prev)
        if (next.has(nodeId)) {
          next.delete(nodeId)
        } else {
          next.add(nodeId)
        }
        return next
      })
      setLastClickedNodeId(nodeId)
    } else if (modifiers?.shift && lastClickedNodeId) {
      // Shift+click — select range between lastClickedNodeId and nodeId
      const visible = getVisibleNodeIds(
        searchQuery ? filterNodes(sitemap, searchQuery) || sitemap : sitemap,
        expandedNodes
      )
      const fromIdx = visible.indexOf(lastClickedNodeId)
      const toIdx = visible.indexOf(nodeId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx)
        const end = Math.max(fromIdx, toIdx)
        const rangeIds = visible.slice(start, end + 1)
        setSelectedNodeIds((prev) => new Set([...prev, ...rangeIds]))
      }
    } else {
      // Plain click — clear set, select only this node
      setSelectedNodeIds(new Set([nodeId]))
      setLastClickedNodeId(nodeId)
    }
    onSelectNode(nodeId)
  }, [onSelectNode, lastClickedNodeId, expandedNodes, searchQuery, sitemap])

  const handleDragStart = useCallback((nodeId: string) => {
    setDragState({
      isDragging: true,
      draggedNodeId: nodeId,
      targetNodeId: null,
      dropPosition: null,
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedNodeId: null,
      targetNodeId: null,
      dropPosition: null,
    })
  }, [])

  const handleDragOver = useCallback((nodeId: string, position: "before" | "after" | "inside") => {
    setDragState((prev) => ({
      ...prev,
      targetNodeId: nodeId,
      dropPosition: position,
    }))
  }, [])

  const handleDrop = useCallback(() => {
    if (!dragState.draggedNodeId || !dragState.targetNodeId || !dragState.dropPosition) {
      return
    }

    const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode

    const findNode = (node: SitemapNode, id: string): SitemapNode | null => {
      if (node.id === id) return node
      for (const child of node.children) {
        const found = findNode(child, id)
        if (found) return found
      }
      return null
    }

    const extractPageSlug = (fullSlug: string): string => {
      const parts = fullSlug.split('/').filter(Boolean)
      return parts.length > 0 ? parts[parts.length - 1] : fullSlug
    }

    const targetNode = findNode(newSitemap, dragState.targetNodeId)
    const isTargetFolder = targetNode && (targetNode.type === "section" || targetNode.type === "root")

    const effectivePosition = isTargetFolder && dragState.dropPosition === "inside"
      ? "inside"
      : dragState.dropPosition

    let draggedNode: SitemapNode | null = null
    const removeNode = (node: SitemapNode): boolean => {
      const index = node.children.findIndex((c) => c.id === dragState.draggedNodeId)
      if (index !== -1) {
        draggedNode = node.children[index]
        node.children.splice(index, 1)
        return true
      }
      return node.children.some(removeNode)
    }
    removeNode(newSitemap)

    if (!draggedNode) return
    const node = draggedNode as SitemapNode

    node.slug = extractPageSlug(node.slug)

    const getDepth = (node: SitemapNode, targetId: string, depth = 0): number => {
      if (node.id === targetId) return depth
      for (const child of node.children) {
        const d = getDepth(child, targetId, depth + 1)
        if (d !== -1) return d
      }
      return -1
    }

    const getMaxChildDepth = (node: SitemapNode): number => {
      if (node.children.length === 0) return 0
      return 1 + Math.max(...node.children.map(getMaxChildDepth))
    }

    let insertedSuccessfully = false

    const insertNode = (parent: SitemapNode): boolean => {
      const targetIndex = parent.children.findIndex((c) => c.id === dragState.targetNodeId)

      if (targetIndex !== -1) {
        if (effectivePosition === "before") {
          parent.children.splice(targetIndex, 0, node)
          insertedSuccessfully = true
          return true
        } else if (effectivePosition === "after") {
          parent.children.splice(targetIndex + 1, 0, node)
          insertedSuccessfully = true
          return true
        } else if (effectivePosition === "inside") {
          const targetNode = parent.children[targetIndex]
          const targetDepth = getDepth(newSitemap, targetNode.id)
          const draggedMaxDepth = getMaxChildDepth(node)
          if (targetDepth + draggedMaxDepth + 1 >= MAX_DEPTH) {
            alert(`Cannot move: Maximum hierarchy depth of ${MAX_DEPTH} would be exceeded.`)
            return false
          }
          targetNode.children.push(node)
          insertedSuccessfully = true
          return true
        }
      }

      if (parent.id === dragState.targetNodeId && effectivePosition === "inside") {
        const targetDepth = getDepth(newSitemap, parent.id)
        const draggedMaxDepth = getMaxChildDepth(node)
        if (targetDepth + draggedMaxDepth + 1 >= MAX_DEPTH) {
          alert(`Cannot move: Maximum hierarchy depth of ${MAX_DEPTH} would be exceeded.`)
          return false
        }
        parent.children.push(node)
        insertedSuccessfully = true
        return true
      }

      for (const child of parent.children) {
        if (insertNode(child)) {
          return true
        }
      }

      return false
    }

    insertNode(newSitemap)

    if (insertedSuccessfully) {
      onSitemapChange(newSitemap)
      updateHistory(newSitemap)

      if (effectivePosition === "inside" && dragState.targetNodeId) {
        setExpandedNodes(prev => new Set([...prev, dragState.targetNodeId!]))
      }
    }

    handleDragEnd()
  }, [dragState, sitemap, handleDragEnd, onSitemapChange])

  /** Opens the "Add folder" dialog, optionally rooted at a specific parent. */
  const handleOpenAddFolder = useCallback((parentId: string | null = null) => {
    setAddParentId(parentId ?? "root")
    setNewFolderTitle("")
    setShowAddFolderDialog(true)
  }, [])

  const handleConfirmAddFolder = async () => {
    if (!newFolderTitle.trim()) return

    const newSlug = newFolderTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, "-")
    const parentId = addParentId === "root" ? null : addParentId

    if (onCreateFolder) {
      setCreatingFolder(true)
      try {
        const newNode = await onCreateFolder(parentId, newFolderTitle, newSlug)
        const targetParentId = addParentId ?? "root"
        const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode
        const addToParent = (node: SitemapNode): boolean => {
          if (node.id === targetParentId) { node.children.push(newNode); return true }
          return node.children.some(addToParent)
        }
        addToParent(newSitemap)
        onSitemapChange(newSitemap)
        updateHistory(newSitemap)
        setExpandedNodes((prev) => new Set([...prev, targetParentId, newNode.id]))
        setShowAddFolderDialog(false)
      } catch (e) {
        console.error("Failed to create folder:", e)
      } finally {
        setCreatingFolder(false)
      }
      return
    }

    // Local-only path (no CMA callback)
    const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode
    const targetParentId = addParentId ?? "root"
    const addToParent = (node: SitemapNode): boolean => {
      if (node.id === targetParentId) {
        const newNode: SitemapNode = {
          id: `${newSlug}-${Date.now()}`,
          title: newFolderTitle,
          slug: newSlug,
          type: "section",
          status: "draft",
          children: [],
          isExpanded: true,
        }
        node.children.push(newNode)
        return true
      }
      return node.children.some(addToParent)
    }
    addToParent(newSitemap)
    onSitemapChange(newSitemap)
    updateHistory(newSitemap)
    setExpandedNodes((prev) => new Set([...prev, targetParentId]))
    setShowAddFolderDialog(false)
  }

  const handleDelete = useCallback(
    (nodeId: string) => {
      if (nodeId === "root") return
      if (!confirm("Are you sure you want to delete this page and all its children?")) return

      if (onDeleteEntry) {
        onDeleteEntry(nodeId).catch(console.error)
        setSelectedNodeIds((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
        return
      }

      const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode
      const deleteNode = (node: SitemapNode): boolean => {
        const index = node.children.findIndex((c) => c.id === nodeId)
        if (index !== -1) { node.children.splice(index, 1); return true }
        return node.children.some(deleteNode)
      }
      deleteNode(newSitemap)
      onSitemapChange(newSitemap)
      updateHistory(newSitemap)
      setSelectedNodeIds((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
    },
    [sitemap, onSitemapChange, onDeleteEntry]
  )

  const handleRename = useCallback(
    (nodeId: string) => {
      const newTitle = prompt("Enter new title:")
      if (!newTitle?.trim()) return

      if (onRenameEntry) {
        onRenameEntry(nodeId, newTitle).catch(console.error)
        return
      }

      const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode
      const renameNode = (node: SitemapNode): boolean => {
        if (node.id === nodeId) { node.title = newTitle; return true }
        return node.children.some(renameNode)
      }
      renameNode(newSitemap)
      onSitemapChange(newSitemap)
      updateHistory(newSitemap)
    },
    [sitemap, onSitemapChange, onRenameEntry]
  )

  const handleDuplicate = useCallback(
    (nodeId: string) => {
      if (onDuplicateEntry) {
        onDuplicateEntry(nodeId).catch(console.error)
        return
      }

      const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode
      const duplicateNode = (parent: SitemapNode): boolean => {
        const index = parent.children.findIndex((c) => c.id === nodeId)
        if (index !== -1) {
          const original = parent.children[index]
          const duplicate = JSON.parse(JSON.stringify(original)) as SitemapNode
          const updateIds = (node: SitemapNode): void => {
            node.id = `${node.id}-copy-${Date.now()}`
            node.title = node.title + " (copy)"
            node.children.forEach(updateIds)
          }
          updateIds(duplicate)
          parent.children.splice(index + 1, 0, duplicate)
          return true
        }
        return parent.children.some(duplicateNode)
      }
      duplicateNode(newSitemap)
      onSitemapChange(newSitemap)
      updateHistory(newSitemap)
    },
    [sitemap, onSitemapChange, onDuplicateEntry]
  )

  // Filter nodes based on search
  const filterNodes = (node: SitemapNode, query: string): SitemapNode | null => {
    const lowerQuery = query.toLowerCase()
    const matchesSearch = node.title.toLowerCase().includes(lowerQuery)
    const filteredChildren = node.children
      .map((child) => filterNodes(child, query))
      .filter((child): child is SitemapNode => child !== null)

    if (matchesSearch || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren, isExpanded: true }
    }
    return null
  }

  const filterExcluded = (node: SitemapNode): SitemapNode | null => {
    const filteredChildren = node.children
      .map((child) => filterExcluded(child))
      .filter((child): child is SitemapNode => child !== null)
    if (node.excludeFromSitemap || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren, isExpanded: true }
    }
    return null
  }

  const displayedSitemap = (() => {
    let result = searchQuery ? filterNodes(sitemap, searchQuery) || sitemap : sitemap
    if (showExcluded) result = filterExcluded(result) || result
    return result
  })()

  const getBreadcrumb = (
    node: SitemapNode,
    targetId: string,
    path: string[] = []
  ): string[] | null => {
    if (node.id === targetId) return [...path, node.title]
    for (const child of node.children) {
      const result = getBreadcrumb(child, targetId, [...path, node.title])
      if (result) return result
    }
    return null
  }

  const currentBreadcrumb = currentPageId ? getBreadcrumb(sitemap, currentPageId) : null

  // Count stats — "section" type is displayed as "folder"
  const countNodes = (node: SitemapNode): { pages: number; sections: number } => {
    let pages = node.type === "page" ? 1 : 0
    let sections = node.type === "section" ? 1 : 0
    for (const child of node.children) {
      const childCounts = countNodes(child)
      pages += childCounts.pages
      sections += childCounts.sections
    }
    return { pages, sections }
  }

  const stats = countNodes(sitemap)

  // Derive the single selected node ID for TreeNode highlighting compatibility
  // (TreeNode takes a single selectedNodeId — highlight all selected nodes by
  //  checking membership in selectedNodeIds)
  const primarySelectedNodeId = lastClickedNodeId && selectedNodeIds.has(lastClickedNodeId)
    ? lastClickedNodeId
    : selectedNodeIds.size === 1
      ? [...selectedNodeIds][0]
      : null

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-[var(--cf-gray-200)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--cf-gray-200)]">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-5 w-5 text-[var(--cf-blue-500)]" />
          <h2 className="text-lg font-semibold text-[var(--cf-gray-700)]">Sitemap</h2>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="bg-[var(--cf-gray-100)] text-[var(--cf-gray-600)] text-xs">
              {stats.sections} {stats.sections === 1 ? "folder" : "folders"}
            </Badge>
            <Badge variant="secondary" className="bg-[var(--cf-gray-100)] text-[var(--cf-gray-600)] text-xs">
              {stats.pages} pages
            </Badge>
          </div>
        </div>
      </div>

      {/* Current page breadcrumb */}
      {currentBreadcrumb && (
        <div className="px-4 py-2 bg-[var(--cf-blue-100)] border-b border-[var(--cf-blue-200)]">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-[var(--cf-gray-500)] text-xs uppercase font-medium">Current page:</span>
            <div className="flex items-center">
              {currentBreadcrumb.map((item, index) => (
                <span key={index} className="flex items-center">
                  {index > 0 && <span className="mx-1 text-[var(--cf-gray-400)]">/</span>}
                  <span
                    className={cn(
                      "text-[var(--cf-gray-600)]",
                      index === currentBreadcrumb.length - 1 && "font-semibold text-[var(--cf-blue-600)]"
                    )}
                  >
                    {item}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="p-3 border-b border-[var(--cf-gray-200)] bg-[var(--cf-gray-100)] space-y-2">
        {/* Row 1: Search bar — full width */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cf-gray-400)]" />
          <Input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm bg-white w-full"
          />
        </div>

        {/* Row 2: Expand/Collapse toggle | Add folder | Show excluded */}
        <div className="flex items-center gap-2">
          {/* Single expand/collapse toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={allExpanded ? handleCollapseAll : handleExpandAll}
            className="h-8 text-xs bg-transparent"
          >
            {allExpanded ? (
              <>
                <ChevronUp className="mr-1 h-3 w-3" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3 w-3" />
                Expand all
              </>
            )}
          </Button>

          <Button
            onClick={() => handleOpenAddFolder(null)}
            variant="outline"
            size="sm"
            className="h-8 bg-transparent"
          >
            <Folder className="mr-1 h-3 w-3" />
            Add folder
          </Button>

          <div className="flex-1" />

          <Button
            variant={showExcluded ? "default" : "outline"}
            size="sm"
            onClick={() => setShowExcluded((v) => !v)}
            className={cn(
              "h-8 text-xs shrink-0",
              showExcluded
                ? "bg-[var(--cf-orange-500)] hover:bg-[var(--cf-orange-500)] text-white"
                : "bg-transparent"
            )}
            title="Show only excluded pages"
          >
            {showExcluded ? "Excluded only" : "Show excluded"}
          </Button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[var(--cf-gray-200)] bg-[var(--cf-gray-50)]">
        <span className="text-xs text-[var(--cf-gray-500)] uppercase font-medium">Status:</span>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--cf-green-400)]" />
            <span className="text-[var(--cf-gray-600)]">Published</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--cf-orange-400)]" />
            <span className="text-[var(--cf-gray-600)]">Draft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--cf-blue-400)]" />
            <span className="text-[var(--cf-gray-600)]">Changed</span>
          </div>
        </div>
      </div>

      {/* Multi-select hint when multiple nodes selected */}
      {selectedNodeIds.size > 1 && (
        <div className="px-4 py-2 bg-[var(--cf-blue-50)] border-b border-[var(--cf-blue-200)] text-xs text-[var(--cf-blue-700)]">
          {selectedNodeIds.size} items selected — use Shift+click to extend, Cmd/Ctrl+click to toggle
        </div>
      )}

      {/* Tree view */}
      <div className="flex-1 overflow-auto p-3">
        <TreeNode
          node={displayedSitemap}
          depth={0}
          selectedNodeId={primarySelectedNodeId}
          currentPageId={currentPageId}
          expandedNodes={searchQuery ? new Set(getAllNodeIds(displayedSitemap)) : expandedNodes}
          dragState={dragState}
          onSelect={(nodeId) => handleSelect(nodeId)}
          onToggleExpand={handleToggleExpand}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onAddChild={(parentId) => handleOpenAddFolder(parentId)}
          onDelete={handleDelete}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onOpenNewTab={onOpenEntryNewTab ?? (() => {})}
          path={[]}
        />
      </div>

      {/* Footer with drag hint */}
      <div className="px-4 py-2 border-t border-[var(--cf-gray-200)] bg-[var(--cf-gray-50)]">
        <p className="text-xs text-[var(--cf-gray-500)]">
          <kbd className="px-1.5 py-0.5 bg-white border border-[var(--cf-gray-300)] rounded text-[10px] font-mono">Drag</kbd>
          {" "}to reorder •{" "}
          <kbd className="px-1.5 py-0.5 bg-white border border-[var(--cf-gray-300)] rounded text-[10px] font-mono">Drop inside</kbd>
          {" "}to nest • Max depth: {MAX_DEPTH} levels
        </p>
      </div>

      {/* Add folder dialog */}
      <Dialog open={showAddFolderDialog} onOpenChange={setShowAddFolderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your pages.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Folder name</Label>
              <Input
                id="title"
                value={newFolderTitle}
                onChange={(e) => setNewFolderTitle(e.target.value)}
                placeholder="Enter folder name..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFolderDialog(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAddFolder}
              disabled={!newFolderTitle.trim() || creatingFolder}
              className="bg-[var(--cf-blue-500)] hover:bg-[var(--cf-blue-600)]"
            >
              {creatingFolder ? "Creating…" : "Add folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
