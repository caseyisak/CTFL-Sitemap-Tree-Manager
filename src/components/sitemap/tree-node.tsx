"use client"

import type React from "react"
import { useState, useRef } from "react"
import { cn } from "@/lib/utils"
import type { SitemapNode, DragState } from "@/lib/sitemap-types"
import { MAX_DEPTH } from "@/lib/sitemap-types"
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
  Edit3,
  Trash2,
  Copy,
  ExternalLink,
  Home,
  Plus,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

interface TreeNodeProps {
  node: SitemapNode
  depth: number
  selectedNodeId: string | null
  selectedNodeIds?: Set<string>
  currentPageId: string | null
  /** Actual name of the root Sitemap entry — displayed instead of "root" for the root node */
  sitemapName?: string
  expandedNodes: Set<string>
  dragState: DragState
  onSelect: (nodeId: string, modifiers?: { shift?: boolean; meta?: boolean }) => void
  onToggleExpand: (nodeId: string) => void
  onDragStart: (nodeId: string) => void
  onDragEnd: () => void
  onDragOver: (nodeId: string, position: "before" | "after" | "inside") => void
  onDrop: () => void
  onAddChild: (parentId: string, type: "page" | "section") => void
  onDelete: (nodeId: string) => void
  onRename: (nodeId: string) => void
  onDuplicate: (nodeId: string) => void
  onOpenNewTab: (nodeId: string) => void
  /** Function that determines if a node is out-of-scope for the current child sitemap view */
  isNodeOutOfScope?: (node: SitemapNode) => boolean
  /** Called when user clicks "Add to this sitemap" on an out-of-scope node */
  onAddToSitemap?: (ctId: string) => Promise<void>
  path: string[]
  /** Is this node the last child among its siblings? Drives the L-shape vs pass-through connector. */
  isLastChild?: boolean
  /** For each ancestor level (depth 1 … d-1), was that ancestor the last child?
   *  true  → was last  → no vertical continuation line at that depth column
   *  false → was not last → draw a vertical pass-through line */
  ancestorLastChildren?: boolean[]
}

export function TreeNode({
  node,
  depth,
  selectedNodeId,
  selectedNodeIds,
  currentPageId,
  sitemapName,
  expandedNodes,
  dragState,
  onSelect,
  onToggleExpand,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onAddChild,
  onDelete,
  onRename,
  onDuplicate,
  onOpenNewTab,
  isNodeOutOfScope,
  onAddToSitemap,
  path,
  isLastChild,
  ancestorLastChildren,
}: TreeNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const [dropIndicator, setDropIndicator] = useState<"before" | "after" | "inside" | null>(null)

  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedNodeId === node.id
  const isMultiSelected = !isSelected && (selectedNodeIds?.has(node.id) ?? false)
  const isCurrentPage = currentPageId === node.id
  const isDragging = dragState.draggedNodeId === node.id
  const isDragTarget = dragState.targetNodeId === node.id
  const hasChildren = node.children.length > 0
  const isFolder = node.type === "section" || node.type === "root"
  const canHaveChildren = node.type !== "page" || depth < MAX_DEPTH - 1
  const isRoot = node.type === "root"
  const isOutOfScope = isNodeOutOfScope ? isNodeOutOfScope(node) : false

  const handleDragStart = (e: React.DragEvent) => {
    if (isRoot) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", node.id)
    onDragStart(node.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!dragState.isDragging || dragState.draggedNodeId === node.id) return
    if (path.includes(dragState.draggedNodeId || "")) return // Prevent circular reference

    const rect = nodeRef.current?.getBoundingClientRect()
    if (!rect) return

    const y = e.clientY - rect.top
    const height = rect.height

    let position: "before" | "after" | "inside"
    
    // For folders (sections/root), prefer "inside" drop behavior
    // Only allow before/after in the extreme edges (top/bottom 15%)
    if (isFolder) {
      if (y < height * 0.15 && !isRoot) {
        position = "before"
      } else if (y > height * 0.85 && !isRoot) {
        position = "after"
      } else {
        position = "inside"
      }
    } else {
      // For pages, use the standard before/after behavior
      if (y < height * 0.5) {
        position = "before"
      } else {
        position = "after"
      }
    }

    setDropIndicator(position)
    onDragOver(node.id, position)
  }

  const handleDragLeave = () => {
    setDropIndicator(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropIndicator(null)
    onDrop()
  }

  const handleDragEnd = () => {
    setDropIndicator(null)
    onDragEnd()
  }

  const getStatusColor = () => {
    switch (node.status) {
      case "published":
        return "bg-[var(--cf-green-400)]"
      case "draft":
        return "bg-[var(--cf-orange-400)]"
      case "changed":
        return "bg-[var(--cf-blue-400)]"
      default:
        return "bg-[var(--cf-gray-400)]"
    }
  }

  const getNodeIcon = () => {
    if (isRoot) return <Home className="h-4 w-4 text-[var(--cf-gray-500)]" />
    if (node.type === "section") {
      return isExpanded ? (
        <FolderOpen className="h-4 w-4 text-[var(--cf-blue-500)]" />
      ) : (
        <Folder className="h-4 w-4 text-[var(--cf-blue-500)]" />
      )
    }
    return <FileText className="h-4 w-4 text-[var(--cf-gray-500)]" />
  }

  const getTypeColor = () => {
    switch (node.type) {
      case "root":
        return "bg-[var(--cf-blue-500)] text-white"
      case "section":
        return "bg-[var(--cf-blue-100)] text-[var(--cf-blue-600)] border border-[var(--cf-blue-300)]"
      default:
        return "bg-white text-[var(--cf-gray-600)] border border-[var(--cf-gray-300)]"
    }
  }

  return (
    <div className="select-none">
      <div
        ref={nodeRef}
        draggable={!isRoot}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={cn(
          "group relative flex items-center rounded-md pr-2 transition-all duration-150",
          "hover:bg-[var(--cf-gray-100)]",
          isSelected && "bg-[var(--cf-blue-100)] hover:bg-[var(--cf-blue-100)]",
          isMultiSelected && "bg-[var(--cf-blue-50)] ring-1 ring-[var(--cf-blue-300)] hover:bg-[var(--cf-blue-50)]",
          isCurrentPage && "ring-2 ring-[var(--cf-blue-400)] ring-offset-1",
          isDragging && "opacity-50 cursor-grabbing",
          !isDragging && !isRoot && "cursor-grab",
          isDragTarget && dropIndicator === "inside" && "bg-[var(--cf-blue-100)] ring-2 ring-[var(--cf-blue-400)] ring-inset",
          isOutOfScope && "opacity-50"
        )}
      >
        {/* Drop indicators */}
        {dropIndicator === "before" && (
          <div className="absolute -top-0.5 left-0 right-0 h-0.5 bg-[var(--cf-blue-500)] rounded-full z-10">
            <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-[var(--cf-blue-500)]" />
          </div>
        )}
        {dropIndicator === "after" && (
          <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-[var(--cf-blue-500)] rounded-full z-10">
            <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-[var(--cf-blue-500)]" />
          </div>
        )}

        {/* Fixed-left controls: grip + checkbox always anchored at left edge */}
        {!isRoot ? (
          <div className="flex items-center gap-0.5 shrink-0 pl-1 py-1.5">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-[var(--cf-gray-400)]" />
            </div>
            <input
              type="checkbox"
              checked={isSelected || isMultiSelected}
              onChange={(e) => {
                e.stopPropagation()
                onSelect(node.id, { meta: true })
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "h-3.5 w-3.5 shrink-0 rounded border-[var(--cf-gray-300)] accent-[var(--cf-blue-500)] cursor-pointer transition-opacity",
                "opacity-0 group-hover:opacity-100",
                (isSelected || isMultiSelected) && "opacity-100"
              )}
            />
          </div>
        ) : (
          <div className="w-9 shrink-0 py-1.5" />
        )}

        {/* Connector stack — one 20px column per depth level, Contentful-style */}
        {!isRoot && (
          <div className="flex shrink-0" style={{ alignSelf: "stretch" }}>
            {/* Ancestor columns: pass-through vertical if that ancestor was NOT the last child */}
            {(ancestorLastChildren ?? []).map((wasLast, i) => (
              <div key={i} style={{ width: "20px", flexShrink: 0, position: "relative", alignSelf: "stretch" }}>
                {!wasLast && (
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "1px", backgroundColor: "var(--cf-gray-300)" }} />
                )}
              </div>
            ))}
            {/* Current node's own connector column */}
            <div style={{ width: "20px", flexShrink: 0, position: "relative", alignSelf: "stretch" }}>
              {/* Vertical segment: stops at 50% for last child (L-shape), full height for others */}
              <div style={{ position: "absolute", top: 0, bottom: isLastChild ? "50%" : 0, left: "50%", width: "1px", backgroundColor: "var(--cf-gray-300)" }} />
              {/* Horizontal arm pointing right toward the content */}
              <div style={{ position: "absolute", top: "50%", left: "50%", right: 0, height: "1px", backgroundColor: "var(--cf-gray-300)" }} />
            </div>
          </div>
        )}

        {/* Content section — connectors above handle indentation, no paddingLeft needed */}
        <div className="flex items-center gap-2 flex-1 min-w-0 py-1.5">

        {/* Expand/Collapse toggle - show for folders even if empty */}
        {(hasChildren || isFolder) ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
            className="p-0.5 rounded hover:bg-[var(--cf-gray-200)] transition-colors"
            data-fs-id="node-expand-toggle"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--cf-gray-500)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--cf-gray-500)]" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* Node icon */}
        {getNodeIcon()}

        {/* Node content */}
        <button
          onClick={(e) => onSelect(node.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })}
          title={isOutOfScope ? "Not in this sitemap" : undefined}
          data-fs-id="node-select"
          className={cn(
            "flex-1 flex items-center gap-2 text-left rounded px-2 py-1 min-w-0",
            getTypeColor()
          )}
        >
          <span className="truncate text-sm font-medium">{isRoot ? (sitemapName ?? node.title) : node.title}</span>
          {isCurrentPage && (
            <span className="shrink-0 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[var(--cf-blue-500)] text-white">
              Current
            </span>
          )}
        </button>

        {/* Status indicator */}
        <div
          className={cn("shrink-0 w-2 h-2 rounded-full", getStatusColor())}
          title={`Status: ${node.status}`}
        />

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              data-fs-id="node-actions-menu"
            >
              <MoreHorizontal className="h-4 w-4 text-[var(--cf-gray-500)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isOutOfScope && onAddToSitemap && node.contentType && (
              <>
                <DropdownMenuItem onClick={() => onAddToSitemap(node.contentType!)} data-fs-id="context-add-to-sitemap">
                  <Plus className="mr-2 h-4 w-4" />
                  Add to this sitemap
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {canHaveChildren && (
              <>
                <DropdownMenuItem onClick={() => onAddChild(node.id, "section")} data-fs-id="context-add-folder">
                  <Folder className="mr-2 h-4 w-4" />
                  Add folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onRename(node.id)} data-fs-id="context-rename">
              <Edit3 className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            {!isRoot && (
              <DropdownMenuItem onClick={() => onDuplicate(node.id)} data-fs-id="context-duplicate">
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onOpenNewTab(node.id)} data-fs-id="context-open-new-tab">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new tab
            </DropdownMenuItem>
            {!isRoot && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(node.id)}
                  className="text-[var(--cf-red-500)] focus:text-[var(--cf-red-500)]"
                  data-fs-id="context-delete"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>{/* end depth-indented section */}
      </div>

      {/* Children */}
      {isExpanded && (hasChildren || isFolder) && (
        <div>
          {node.children.map((child, index) => {
            const childIsLast = index === node.children.length - 1
            // Build the ancestor context to pass down:
            // Root shows no connector itself, so its children start with an empty ancestor list.
            // For any other node: append whether THIS node is the last child.
            const childAncestors = isRoot
              ? []
              : [...(ancestorLastChildren ?? []), isLastChild ?? true]
            return (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isLastChild={childIsLast}
                ancestorLastChildren={childAncestors}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                currentPageId={currentPageId}
                sitemapName={sitemapName}
                isNodeOutOfScope={isNodeOutOfScope}
                onAddToSitemap={onAddToSitemap}
                expandedNodes={expandedNodes}
                dragState={dragState}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onOpenNewTab={onOpenNewTab}
                path={[...path, node.id]}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
