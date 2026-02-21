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
  Settings,
  LayoutGrid,
  Undo,
  Redo,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

export function SitemapPanelWithCallback({ onSelectNode, sitemap, onSitemapChange, currentPageId: currentPageIdProp, onRenameEntry, onDuplicateEntry, onDeleteEntry, onOpenEntryNewTab, onCreateFolder }: SitemapPanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
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
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [newPageTitle, setNewPageTitle] = useState("")
  const [newPageType, setNewPageType] = useState<"page" | "section">("page")
  const [history, setHistory] = useState<SitemapNode[]>([sitemap])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [showExcluded, setShowExcluded] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)

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

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      onSitemapChange(history[historyIndex - 1])
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      onSitemapChange(history[historyIndex + 1])
    }
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
  }

  const handleCollapseAll = () => {
    setExpandedNodes(new Set(["root"]))
  }

  function getAllNodeIds(node: SitemapNode): string[] {
    return [node.id, ...node.children.flatMap(getAllNodeIds)]
  }

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    onSelectNode(nodeId)
  }, [onSelectNode])

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

    // Helper function to find a node by ID
    const findNode = (node: SitemapNode, id: string): SitemapNode | null => {
      if (node.id === id) return node
      for (const child of node.children) {
        const found = findNode(child, id)
        if (found) return found
      }
      return null
    }
    
    // Helper to extract just the page slug (last segment) from full path
    const extractPageSlug = (fullSlug: string): string => {
      const parts = fullSlug.split('/').filter(Boolean)
      return parts.length > 0 ? parts[parts.length - 1] : fullSlug
    }
    
    // Helper to find parent of a node
    const findParent = (root: SitemapNode, targetId: string): SitemapNode | null => {
      for (const child of root.children) {
        if (child.id === targetId) return root
        const found = findParent(child, targetId)
        if (found) return found
      }
      return null
    }
    
    const targetNode = findNode(newSitemap, dragState.targetNodeId)
    const isTargetFolder = targetNode && (targetNode.type === "section" || targetNode.type === "root")
    
    // If dropping on a folder and position is "inside", nest inside it
    const effectivePosition = isTargetFolder && dragState.dropPosition === "inside" 
      ? "inside" 
      : dragState.dropPosition

    // Find and remove the dragged node
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

    // Clean up the slug - extract just the page's own slug (not the full path)
    node.slug = extractPageSlug(node.slug)

    // Check for circular reference and max depth
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

    // Insert the node at the new position
    let insertedSuccessfully = false
    
    const insertNode = (parent: SitemapNode): boolean => {
      // Check if the target is a direct child of this parent
      const targetIndex = parent.children.findIndex((c) => c.id === dragState.targetNodeId)
      
      if (targetIndex !== -1) {
        // Target is a direct child of this parent
        if (effectivePosition === "before") {
          parent.children.splice(targetIndex, 0, node)
          insertedSuccessfully = true
          return true
        } else if (effectivePosition === "after") {
          parent.children.splice(targetIndex + 1, 0, node)
          insertedSuccessfully = true
          return true
        } else if (effectivePosition === "inside") {
          // Insert inside the target node itself
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
      
      // Check if this parent IS the target (for dropping inside root or when target is the parent itself)
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

      // Recursively search in children
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
      
      // Auto-expand the target folder if we dropped inside it
      if (effectivePosition === "inside" && dragState.targetNodeId) {
        setExpandedNodes(prev => new Set([...prev, dragState.targetNodeId!]))
      }
    }
    
    handleDragEnd()
  }, [dragState, sitemap, handleDragEnd, onSitemapChange])

  const handleAddChild = useCallback((parentId: string, type: "page" | "section" = "page") => {
    setAddParentId(parentId)
    setNewPageTitle("")
    setNewPageType(type)
    setShowAddDialog(true)
  }, [])

  const handleConfirmAdd = () => {
    if (!addParentId || !newPageTitle.trim()) return

    const newSitemap = JSON.parse(JSON.stringify(sitemap)) as SitemapNode

    const addToParent = (node: SitemapNode): boolean => {
      if (node.id === addParentId) {
        const newSlug = newPageTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, "-")
        const newNode: SitemapNode = {
          id: `${newSlug}-${Date.now()}`,
          title: newPageTitle,
          slug: newSlug,
          type: newPageType,
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
    // Expand parent and the new node (if it's a folder)
    const newNodeId = `${newPageTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, "-")}-${Date.now()}`
    setExpandedNodes((prev) => {
      const next = new Set([...prev, addParentId])
      if (newPageType === "section") {
        // Find the actual new node ID (it was just created)
        const findNewNode = (node: SitemapNode): string | null => {
          const newChild = node.children.find(c => c.title === newPageTitle && c.type === newPageType)
          if (newChild) return newChild.id
          for (const child of node.children) {
            const found = findNewNode(child)
            if (found) return found
          }
          return null
        }
        const actualId = findNewNode(newSitemap)
        if (actualId) next.add(actualId)
      }
      return next
    })
    setShowAddDialog(false)
  }

  const handleDelete = useCallback(
    (nodeId: string) => {
      if (nodeId === "root") return
      if (!confirm("Are you sure you want to delete this page and all its children?")) return

      if (onDeleteEntry) {
        onDeleteEntry(nodeId).catch(console.error)
        if (selectedNodeId === nodeId) setSelectedNodeId(null)
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
      if (selectedNodeId === nodeId) setSelectedNodeId(null)
    },
    [sitemap, selectedNodeId, onSitemapChange, onDeleteEntry]
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
      return {
        ...node,
        children: filteredChildren,
        isExpanded: true,
      }
    }
    return null
  }

  // Filter to show only excluded nodes
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

  // Get breadcrumb path for current page
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

  // Count stats
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

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-[var(--cf-gray-200)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--cf-gray-200)]">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-5 w-5 text-[var(--cf-blue-500)]" />
          <h2 className="text-lg font-semibold text-[var(--cf-gray-700)]">Sitemap</h2>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="bg-[var(--cf-gray-100)] text-[var(--cf-gray-600)] text-xs">
              {stats.sections} sections
            </Badge>
            <Badge variant="secondary" className="bg-[var(--cf-gray-100)] text-[var(--cf-gray-600)] text-xs">
              {stats.pages} pages
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={historyIndex === 0}
            className="h-8 w-8 p-0"
            title="Undo"
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={historyIndex === history.length - 1}
            className="h-8 w-8 p-0"
            title="Redo"
          >
            <Redo className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
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
        {/* Search bar - full width */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cf-gray-400)]" />
            <Input
              type="text"
              placeholder="Search pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm bg-white w-full"
            />
          </div>
          <Button
            variant={showExcluded ? "default" : "outline"}
            size="sm"
            onClick={() => setShowExcluded((v) => !v)}
            className={cn(
              "h-9 text-xs shrink-0",
              showExcluded
                ? "bg-[var(--cf-orange-500)] hover:bg-[var(--cf-orange-500)] text-white"
                : "bg-transparent"
            )}
            title="Show only excluded pages"
          >
            {showExcluded ? "Excluded only" : "Show excluded"}
          </Button>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="h-8 text-xs bg-transparent"
          >
            <ChevronDown className="mr-1 h-3 w-3" />
            Expand
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="h-8 text-xs bg-transparent"
          >
            <ChevronUp className="mr-1 h-3 w-3" />
            Collapse
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => handleAddChild("root", "section")}
            variant="outline"
            size="sm"
            className="h-8 bg-transparent"
          >
            <Folder className="mr-1 h-3 w-3" />
            Add folder
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

      {/* Tree view */}
      <div className="flex-1 overflow-auto p-3">
        <TreeNode
          node={displayedSitemap}
          depth={0}
          selectedNodeId={selectedNodeId}
          currentPageId={currentPageId}
          expandedNodes={searchQuery ? new Set(getAllNodeIds(displayedSitemap)) : expandedNodes}
          dragState={dragState}
          onSelect={handleSelect}
          onToggleExpand={handleToggleExpand}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onAddChild={handleAddChild}
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
          {" "}to reorder • 
          <kbd className="px-1.5 py-0.5 bg-white border border-[var(--cf-gray-300)] rounded text-[10px] font-mono ml-1">Drop inside</kbd>
          {" "}to nest • Max depth: {MAX_DEPTH} levels
        </p>
      </div>

      {/* Add page/folder dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newPageType === "section" ? "Add new folder" : "Add new page"}
            </DialogTitle>
            <DialogDescription>
              {newPageType === "section" 
                ? "Create a new folder to organize your pages."
                : "Create a new page in your sitemap."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">
                {newPageType === "section" ? "Folder name" : "Page title"}
              </Label>
              <Input
                id="title"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
                placeholder={newPageType === "section" ? "Enter folder name..." : "Enter page title..."}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAdd}
              disabled={!newPageTitle.trim()}
              className="bg-[var(--cf-blue-500)] hover:bg-[var(--cf-blue-600)]"
            >
              {newPageType === "section" ? "Add folder" : "Add page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
