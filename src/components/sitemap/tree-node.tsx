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
  Plus,
  Edit3,
  Trash2,
  Copy,
  ExternalLink,
  Home,
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
  currentPageId: string | null
  expandedNodes: Set<string>
  dragState: DragState
  onSelect: (nodeId: string) => void
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
  path: string[]
}

export function TreeNode({
  node,
  depth,
  selectedNodeId,
  currentPageId,
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
  path,
}: TreeNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const [dropIndicator, setDropIndicator] = useState<"before" | "after" | "inside" | null>(null)

  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedNodeId === node.id
  const isCurrentPage = currentPageId === node.id
  const isDragging = dragState.draggedNodeId === node.id
  const isDragTarget = dragState.targetNodeId === node.id
  const hasChildren = node.children.length > 0
  const isFolder = node.type === "section" || node.type === "root"
  const canHaveChildren = node.type !== "page" || depth < MAX_DEPTH - 1
  const isRoot = node.type === "root"

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
          "group relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-all duration-150",
          "hover:bg-[var(--cf-gray-100)]",
          isSelected && "bg-[var(--cf-blue-100)] hover:bg-[var(--cf-blue-100)]",
          isCurrentPage && "ring-2 ring-[var(--cf-blue-400)] ring-offset-1",
          isDragging && "opacity-50 cursor-grabbing",
          !isDragging && !isRoot && "cursor-grab",
          isDragTarget && dropIndicator === "inside" && "bg-[var(--cf-blue-100)] ring-2 ring-[var(--cf-blue-400)] ring-inset"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
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

        {/* Drag handle */}
        {!isRoot && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-[var(--cf-gray-400)]" />
          </div>
        )}

        {/* Expand/Collapse toggle - show for folders even if empty */}
        {(hasChildren || isFolder) ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
            className="p-0.5 rounded hover:bg-[var(--cf-gray-200)] transition-colors"
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
          onClick={() => onSelect(node.id)}
          className={cn(
            "flex-1 flex items-center gap-2 text-left rounded px-2 py-1 min-w-0",
            getTypeColor()
          )}
        >
          <span className="truncate text-sm font-medium">{isRoot ? "root" : node.title}</span>
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
            >
              <MoreHorizontal className="h-4 w-4 text-[var(--cf-gray-500)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {canHaveChildren && (
              <>
                <DropdownMenuItem onClick={() => onAddChild(node.id, "page")}>
                  <FileText className="mr-2 h-4 w-4" />
                  Add child page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, "section")}>
                  <Folder className="mr-2 h-4 w-4" />
                  Add folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onRename(node.id)}>
              <Edit3 className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            {!isRoot && (
              <DropdownMenuItem onClick={() => onDuplicate(node.id)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onOpenNewTab(node.id)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new tab
            </DropdownMenuItem>
            {!isRoot && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(node.id)}
                  className="text-[var(--cf-red-500)] focus:text-[var(--cf-red-500)]"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {isExpanded && (hasChildren || isFolder) && (
        <div className="relative">
          {/* Vertical connector line */}
          {hasChildren && (
            <div
              className="absolute top-0 bottom-0 w-px bg-[var(--cf-gray-300)]"
              style={{ left: `${depth * 20 + 24}px` }}
            />
          )}
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              currentPageId={currentPageId}
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
          ))}
        </div>
      )}
    </div>
  )
}
