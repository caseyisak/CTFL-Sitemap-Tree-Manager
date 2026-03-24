"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSDK } from "@contentful/react-apps-toolkit"
import type { ConfigAppSDK, AppState } from "@contentful/app-sdk"
import type { AppInstallationParameters, ContentTypeConfig } from "@/lib/contentful-types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Globe, LayoutGrid, Plus, CheckCircle2, AlertCircle, ExternalLink, Copy, Check, FileText, FolderOpen, ChevronDown, ChevronUp, Info } from "lucide-react"

const CHANGE_FREQ_OPTIONS = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] as const

/** Extract a human-readable message from any thrown value (including non-Error CMA responses). */
function extractErrorMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e !== null && typeof e === "object") {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === "string") return obj.message
    if (typeof obj.details === "object" && obj.details !== null) {
      return JSON.stringify(obj.details)
    }
    return JSON.stringify(e)
  }
  return String(e)
}

interface ContentTypeOption {
  id: string
  name: string
  symbolFields: Array<{ id: string; name: string }>
}

interface ChildSitemapInfo {
  id: string
  internalName: string
  slug: string
  contentTypes: string[]
  changeFrequency: string
  priority: number | null
  isPublished: boolean
}

/** Required fields for the Sitemap content type and their expected types */
const REQUIRED_SITEMAP_FIELDS = [
  { id: "internalName", name: "Internal Name", type: "Symbol" as const },
  { id: "slug",         name: "Slug",          type: "Symbol" as const },
  { id: "sitemapType",  name: "Sitemap Type",  type: "Symbol" as const },
  { id: "folderConfig", name: "Folder Config", type: "Object" as const },
  { id: "childSitemaps",name: "Child Sitemaps",type: "Array"  as const },
  { id: "contentTypes", name: "Content Types", type: "Array"  as const },
  { id: "changeFrequency", name: "Change Frequency", type: "Symbol" as const },
  { id: "priority",     name: "Priority",      type: "Number" as const },
]

export function AppConfigScreen() {
  const sdk = useSDK<ConfigAppSDK>()

  const [baseUrl, setBaseUrl] = useState("")
  const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>([])
  const [enabledContentTypes, setEnabledContentTypes] = useState<string[]>([])
  const [contentTypeConfigs, setContentTypeConfigs] = useState<
    Record<string, ContentTypeConfig>
  >({})

  // Sitemap CT state
  const [sitemapCtId, setSitemapCtId] = useState<string | null>(null)
  const [sitemapCtExists, setSitemapCtExists] = useState<boolean | null>(null)
  const [existingFieldIds, setExistingFieldIds] = useState<Set<string>>(new Set())

  // Root sitemap entry state
  const [rootEntry, setRootEntry] = useState<{
    id: string; internalName: string; slug: string; isPublished: boolean
  } | null>(null)
  const [childSitemaps, setChildSitemaps] = useState<ChildSitemapInfo[]>([])
  const [multipleEntries, setMultipleEntries] = useState<Array<{ id: string; name: string }>>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // Add child sitemap dialog
  const [showAddChildDialog, setShowAddChildDialog] = useState(false)
  const [childName, setChildName] = useState("")
  const [childSlug, setChildSlug] = useState("")
  const [childContentTypes, setChildContentTypes] = useState<string[]>([])
  const [addingChild, setAddingChild] = useState(false)
  const [addChildStatus, setAddChildStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // robots.txt copy state
  const [copied, setCopied] = useState(false)

  // "How it works" info box open state (Managed Content Types section)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  // "How it works" info box open state (Sitemap section)
  const [showSitemapHowItWorks, setShowSitemapHowItWorks] = useState(false)

  // Keep handleConfigure ref fresh
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleConfigureRef = useRef<() => Promise<any>>(() => Promise.resolve({}))

  // ── helpers ────────────────────────────────────────────────────────────────────

  /** Safely reads the en-US locale value from a CMA field (which is typed as `unknown`). */
  const loc = (field: unknown): unknown =>
    (field as Record<string, unknown> | undefined)?.["en-US"]

  const readEntryName = (fields: Record<string, unknown>): string => {
    const internalName = loc(fields?.internalName) as string | undefined
    const legacyName = loc(fields?.name) as string | undefined
    const title = loc(fields?.title) as string | undefined
    return internalName ?? legacyName ?? title ?? "(unnamed)"
  }

  const buildEntryLink = (entryId: string) => {
    const envId = sdk.ids.environment ?? "master"
    return `https://app.contentful.com/spaces/${sdk.ids.space}/environments/${envId}/entries/${entryId}`
  }

  // ── resolve root + children from a list of sitemap entries ────────────────────

  const resolveRootAndChildren = useCallback(async (
    items: Array<{ sys: { id: string; publishedVersion?: number }; fields: Record<string, unknown> }>
  ) => {
    // Find root: sitemapType = "root" || sitemapType is null (legacy)
    const rootItem = items.find((e) => {
      const t = loc(e.fields?.sitemapType) as string | null | undefined
      return t === "root" || t == null
    }) ?? items[0] // fallback to first

    if (!rootItem) return

    const rootId = rootItem.sys.id
    const rootSlug = (loc(rootItem.fields?.slug) as string | undefined) ?? "sitemap-index"
    const rootName = readEntryName(rootItem.fields)
    const rootPublished = (rootItem.sys.publishedVersion ?? 0) > 0

    setRootEntry({ id: rootId, internalName: rootName, slug: rootSlug, isPublished: rootPublished })
    setSelectedEntryId(rootId)

    // Resolve child sitemaps
    const childLinks = (loc(rootItem.fields?.childSitemaps) as Array<{ sys: { id: string } }> | undefined) ?? []
    const resolvedChildren: ChildSitemapInfo[] = []
    for (const link of childLinks) {
      try {
        const child = await sdk.cma.entry.get({ entryId: link.sys.id })
        const f = child.fields ?? {}
        const ctIds = (loc(f?.contentTypes) as string[] | undefined) ?? []
        resolvedChildren.push({
          id: link.sys.id,
          internalName: readEntryName(f),
          slug: (loc(f?.slug) as string | undefined) ?? "",
          contentTypes: ctIds,
          changeFrequency: (loc(f?.changeFrequency) as string | undefined) ?? "",
          priority: (loc(f?.priority) as number | undefined) ?? null,
          isPublished: (child.sys.publishedVersion ?? 0) > 0,
        })
      } catch { /* child entry not accessible */ }
    }
    setChildSitemaps(resolvedChildren)
  }, [sdk])

  // ── init ───────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [params, ctResponse] = await Promise.all([
        sdk.app.getParameters<AppInstallationParameters>(),
        sdk.cma.contentType.getMany({ query: { limit: 200 } }),
      ])

      if (params) {
        setBaseUrl(params.baseUrl ?? "")
        setEnabledContentTypes(params.enabledContentTypes ?? [])
        setContentTypeConfigs(params.contentTypeConfigs ?? {})
      }

      // Detect Sitemap CT by ID "sitemap" first, then by name — must be done before
      // building options so we can exclude it from the toggleable list.
      const sitemapCt =
        (ctResponse.items ?? []).find((ct) => ct.sys.id === "sitemap") ??
        (ctResponse.items ?? []).find((ct) => ct.name.toLowerCase() === "sitemap")

      const detectedSitemapCtId = sitemapCt?.sys.id ?? null

      const options: ContentTypeOption[] = (ctResponse.items ?? [])
        // Exclude the Sitemap CT itself from the manageable content-type list
        .filter((ct) => ct.sys.id !== detectedSitemapCtId)
        .map((ct) => ({
          id: ct.sys.id,
          name: ct.name,
          symbolFields: (ct.fields ?? [])
            .filter((f) => f.type === "Symbol")
            .map((f) => ({ id: f.id, name: f.name })),
        }))
      setContentTypes(options)

      if (sitemapCt) {
        setSitemapCtId(sitemapCt.sys.id)
        setSitemapCtExists(true)
        const fieldIds = new Set((sitemapCt.fields ?? []).map((f) => f.id))
        setExistingFieldIds(fieldIds)

        // Find sitemap entries
        try {
          const entryResponse = await sdk.cma.entry.getMany({
            query: { content_type: sitemapCt.sys.id, limit: 10 },
          })
          const items = (entryResponse.items ?? []) as Array<{
            sys: { id: string; publishedVersion?: number }
            fields: Record<string, unknown>
          }>

          if (items.length === 0) {
            // No entries yet — show create button
          } else if (items.length === 1) {
            await resolveRootAndChildren(items)
          } else {
            // Multiple: check if we can auto-detect root
            const rootItem = items.find((e) => {
              const t = loc(e.fields?.sitemapType) as string | null | undefined
              return t === "root"
            })
            if (rootItem) {
              await resolveRootAndChildren(items)
            } else {
              // Need user to pick
              setMultipleEntries(items.map((e) => ({ id: e.sys.id, name: readEntryName(e.fields) })))
            }
          }
        } catch { /* ignore */ }
      } else {
        setSitemapCtExists(false)
      }
    }

    init()
    sdk.app.onConfigure(() => handleConfigureRef.current())
    sdk.app.setReady()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── keep onConfigure fresh via ref ────────────────────────────────────────────

  const handleConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState()
    const editorInterfaceAssignments: AppState["EditorInterface"] = {}

    for (const ctId of enabledContentTypes) {
      const config = contentTypeConfigs[ctId]
      if (!config?.slugFieldId) continue

      try {
        const ct = await sdk.cma.contentType.get({ contentTypeId: ctId })
        const fieldIds = (ct.fields ?? []).map((f) => f.id)
        const fieldsToAdd = []

        if (!fieldIds.includes("sitemapMetadata")) {
          fieldsToAdd.push({
            id: "sitemapMetadata",
            name: "Sitemap Metadata",
            type: "Object" as const,
            required: false,
            localized: false,
          })
        }
        if (!fieldIds.includes("excludeFromSitemap")) {
          fieldsToAdd.push({
            id: "excludeFromSitemap",
            name: "Exclude from Sitemap",
            type: "Boolean" as const,
            required: false,
            localized: false,
          })
        }

        const SITEMAP_GROUP_ID = "sitemapInfo"
        const SITEMAP_GROUP_NAME = "Sitemap Info"
        const sitemapFieldIds = new Set(["sitemapMetadata", "excludeFromSitemap"])

        // Assign groupId to both sitemap fields (new and existing)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatedFields = [...(ct.fields ?? []), ...fieldsToAdd].map((f: any) =>
          sitemapFieldIds.has(f.id) ? { ...f, groupId: SITEMAP_GROUP_ID } : f
        )

        // Add the field group if not already present
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingGroups: Array<{ id: string; name: string }> = (ct as any).fieldGroups ?? []
        const hasGroup = existingGroups.some((g) => g.id === SITEMAP_GROUP_ID)
        const updatedGroups = hasGroup
          ? existingGroups
          : [...existingGroups, { id: SITEMAP_GROUP_ID, name: SITEMAP_GROUP_NAME }]

        // Check if any sitemap field is missing its groupId
        const missingGroupId = (ct.fields ?? []).some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (f: any) => sitemapFieldIds.has(f.id) && f.groupId !== SITEMAP_GROUP_ID
        )

        if (fieldsToAdd.length > 0 || !hasGroup || missingGroupId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updatedCt = await sdk.cma.contentType.update(
            { contentTypeId: ctId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { ...ct, fields: updatedFields, fieldGroups: updatedGroups } as any // fieldGroups not in SDK types
          )
          await sdk.cma.contentType.publish({ contentTypeId: ctId }, updatedCt)
        }
      } catch (e) {
        console.error(`Failed to update content type ${ctId}:`, e)
      }

      // Directly assign our app as the widget for the selected slug field,
      // so its appearance is overridden immediately on save (same pattern as
      // applyEditorInterfaceSettings for the Sitemap CT).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ei = await (sdk.cma.editorInterface as any).get({ contentTypeId: ctId })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const controls: Array<Record<string, any>> = ei.controls ?? []
        const updated = controls.filter((c) => c.fieldId !== config.slugFieldId)
        updated.push({
          fieldId: config.slugFieldId,
          widgetId: sdk.ids.app,
          widgetNamespace: "app",
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sdk.cma.editorInterface as any).update(
          { contentTypeId: ctId },
          { ...ei, controls: updated }
        )
      } catch (e) {
        console.warn(`Could not assign app widget to slug field on ${ctId}:`, e)
      }

      editorInterfaceAssignments[ctId] = {
        controls: [{ fieldId: config.slugFieldId }],
        editors: { position: 1 },
      }
    }

    // Revert slug field widget for CTs that are being disabled.
    // Finds CTs that currently have our app in their editor interface but are
    // no longer in enabledContentTypes, and resets the slug field back to the
    // builtin singleLine widget.
    const previouslyManagedCTs = Object.keys(currentState?.EditorInterface ?? {})
      .filter((ctId) => ctId !== sitemapCtId)
    const disabledCTs = previouslyManagedCTs.filter((ctId) => !enabledContentTypes.includes(ctId))
    for (const ctId of disabledCTs) {
      const slugFieldId = contentTypeConfigs[ctId]?.slugFieldId
      if (!slugFieldId) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ei = await (sdk.cma.editorInterface as any).get({ contentTypeId: ctId })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const controls: Array<Record<string, any>> = ei.controls ?? []
        const updated = controls.filter((c) => c.fieldId !== slugFieldId)
        updated.push({ fieldId: slugFieldId, widgetId: "singleLine", widgetNamespace: "builtin" })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sdk.cma.editorInterface as any).update(
          { contentTypeId: ctId },
          { ...ei, controls: updated }
        )
      } catch (e) {
        console.warn(`Could not revert slug widget on disabled CT ${ctId}:`, e)
      }
    }

    // Assign Sitemap CT editor interface
    if (sitemapCtId) {
      editorInterfaceAssignments[sitemapCtId] = {
        editors: { position: 0 },
      }

      // Auto-sync the contentTypes field's "Accept only specified values" list
      // to match the current enabledContentTypes. Runs silently on every save.
      await syncContentTypesValidation(sitemapCtId, enabledContentTypes)
      await applyEditorInterfaceSettings(sitemapCtId)
      await applyOmittedFields(sitemapCtId)
    }

    return {
      parameters: {
        enabledContentTypes,
        contentTypeConfigs,
        baseUrl,
        ...(sitemapCtId ? { sitemapContentTypeId: sitemapCtId } : {}),
        // sitemapEntryId intentionally omitted — detect root by sitemapType query
      },
      targetState: {
        EditorInterface: {
          ...currentState?.EditorInterface,
          ...editorInterfaceAssignments,
        },
      },
    }
  }, [sdk, enabledContentTypes, contentTypeConfigs, baseUrl, sitemapCtId])

  useEffect(() => {
    handleConfigureRef.current = handleConfigure
  }, [handleConfigure])

  // ── CT and entry creation ──────────────────────────────────────────────────────

  /**
   * Applies editor interface settings for the Sitemap CT:
   * - `contentTypes` field: Checkbox widget + help text explaining single vs index mode
   * - `sitemapType` field: help text explaining root vs child, and which fields to fill in
   * Safe to call multiple times.
   */
  const applyEditorInterfaceSettings = async (ctId: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ei = await (sdk.cma.editorInterface as any).get({ contentTypeId: ctId })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controls: Array<Record<string, any>> = ei.controls ?? []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const desired: Record<string, Record<string, any>> = {
        contentTypes: {
          widgetId: "checkbox",
          widgetNamespace: "builtin",
          settings: {
            helpText:
              "Content types whose entries appear in this sitemap's generated XML. " +
              "Single sitemap: set this on the root entry. " +
              "Sitemap index: leave the root empty — set this on each child sitemap entry instead.",
          },
        },
        sitemapType: {
          settings: {
            helpText:
              '"root" — the primary sitemap entry. For a single sitemap, set Content Types, Change Frequency, and Priority directly here. ' +
              "To generate multiple XML files (sitemap index), add entries to Child Sitemaps and configure those fields on each child instead. " +
              '"child" — a sub-sitemap in an index. Set Content Types, Change Frequency, and Priority on this entry.',
          },
        },
      }

      const updated = controls.filter((c) => !(c.fieldId in desired))
      for (const [fieldId, settings] of Object.entries(desired)) {
        const existing = controls.find((c) => c.fieldId === fieldId) ?? {}
        updated.push({ ...existing, fieldId, ...settings })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sdk.cma.editorInterface as any).update(
        { contentTypeId: ctId },
        { ...ei, controls: updated }
      )
    } catch (e) {
      console.warn("Could not set checkbox appearance for contentTypes field:", e)
    }
  }

  /**
   * Hides `folderConfig` (internal JSON) from the Sitemap CT editor interface.
   * `sitemapType` is intentionally left visible so editors can see the help text.
   * If `sitemapType` was previously omitted (older installs), this un-omits it.
   * Safe to call multiple times.
   */
  const applyOmittedFields = async (ctId: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ei = await (sdk.cma.editorInterface as any).get({ contentTypeId: ctId })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controls: Array<Record<string, any>> = ei.controls ?? []
      const folderConfigOmitted = controls.some((c) => c.fieldId === "folderConfig" && c.omitted)
      const sitemapTypeOmitted = controls.some((c) => c.fieldId === "sitemapType" && c.omitted)
      // Already correct: folderConfig hidden, sitemapType visible
      if (folderConfigOmitted && !sitemapTypeOmitted) return
      // Filter out both, re-add only folderConfig as omitted.
      // Omitting sitemapType from the controls list entirely = default (visible).
      const updated = controls.filter(
        (c) => c.fieldId !== "folderConfig" && c.fieldId !== "sitemapType"
      )
      updated.push({ fieldId: "folderConfig", omitted: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sdk.cma.editorInterface as any).update(
        { contentTypeId: ctId },
        { ...ei, controls: updated }
      )
    } catch (e) {
      console.warn("Could not update omitted fields on Sitemap CT editor interface:", e)
    }
  }

  /**
   * Updates the Sitemap CT's `contentTypes` field `in` validation to exactly
   * match the current `enabledContentTypes` list, then publishes the CT.
   * Called on every app-config save so options stay in sync automatically.
   */
  const syncContentTypesValidation = async (ctId: string, ctIds: string[]) => {
    try {
      const ct = await sdk.cma.contentType.get({ contentTypeId: ctId })
      const hasField = (ct.fields ?? []).some((f) => f.id === "contentTypes")
      if (!hasField) return
      // Never include the Sitemap CT itself as a selectable content type option
      const filteredCtIds = ctIds.filter((id) => id !== ctId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedFields = (ct.fields ?? []).map((f: any) =>
        f.id === "contentTypes"
          ? { ...f, items: { type: "Symbol", validations: filteredCtIds.length ? [{ in: filteredCtIds }] : [] } }
          : f
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedCt = await (sdk.cma.contentType.update as any)(
        { contentTypeId: ctId },
        { ...ct, fields: updatedFields }
      )
      await sdk.cma.contentType.publish({ contentTypeId: ctId }, updatedCt)
    } catch (e) {
      console.warn("Could not sync contentTypes field validation:", e)
    }
  }

  /** Creates the Sitemap CT with ID "sitemap" + all 8 fields + root entry in one shot. */
  const handleCreateSitemapContentType = async () => {
    setCreating(true)
    setCreateStatus(null)
    try {
      const spaceId = sdk.ids.space
      const environmentId = sdk.ids.environment ?? "master"

      // Guard: if the CT already exists (e.g. from a previous partial attempt),
      // recover state rather than failing with 422.
      try {
        const existing = await sdk.cma.contentType.get({ contentTypeId: "sitemap" })
        if (existing) {
          setSitemapCtId(existing.sys.id)
          setSitemapCtExists(true)
          setExistingFieldIds(new Set((existing.fields ?? []).map((f: { id: string }) => f.id)))
          // Try to load any existing entries
          const entryResponse = await sdk.cma.entry.getMany({
            query: { content_type: "sitemap", limit: 10 },
          })
          const items = (entryResponse.items ?? []) as Array<{
            sys: { id: string; publishedVersion?: number }
            fields: Record<string, unknown>
          }>
          if (items.length > 0) await resolveRootAndChildren(items)
          setCreateStatus({ type: "success", msg: "Sitemap CT already exists — loaded successfully." })
          return
        }
      } catch {
        // CT doesn't exist yet — proceed with creation below
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ct = await (sdk.cma.contentType as any).createWithId(
        { contentTypeId: "sitemap", spaceId, environmentId },
        {
          name: "Sitemap",
          displayField: "internalName",
          fields: [
            { id: "internalName", name: "Internal Name", type: "Symbol", required: true, localized: false },
            { id: "slug", name: "Slug", type: "Symbol", required: false, localized: false },
            {
              id: "sitemapType",
              name: "Sitemap Type",
              type: "Symbol",
              required: false,
              localized: false,
              validations: [{ in: ["root", "child"] }],
            },
            {
              id: "childSitemaps",
              name: "Child Sitemaps",
              type: "Array",
              required: false,
              localized: false,
              items: {
                type: "Link",
                linkType: "Entry",
                validations: [{ linkContentType: ["sitemap"] }],
              },
            },
            {
              id: "contentTypes",
              name: "Content Types",
              type: "Array",
              required: false,
              localized: false,
              items: {
                type: "Symbol",
                validations: enabledContentTypes.length ? [{ in: enabledContentTypes }] : [],
              },
            },
            {
              id: "changeFrequency",
              name: "Change Frequency",
              type: "Symbol",
              required: false,
              localized: false,
              validations: [{ in: ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] }],
            },
            {
              id: "priority",
              name: "Priority",
              type: "Number",
              required: false,
              localized: false,
              validations: [{ range: { min: 0, max: 1 } }],
            },
            { id: "folderConfig", name: "Folder Config", type: "Object", required: false, localized: false },
          ],
        }
      )
      const publishedCt = await sdk.cma.contentType.publish({ contentTypeId: ct.sys.id }, ct)

      // Set checkbox appearance for contentTypes field
      await applyEditorInterfaceSettings(publishedCt.sys.id)

      // Create root entry
      const entry = await sdk.cma.entry.create(
        { contentTypeId: publishedCt.sys.id, spaceId, environmentId },
        {
          fields: {
            internalName: { "en-US": "Main Sitemap" },
            slug: { "en-US": "sitemap-index" },
            sitemapType: { "en-US": "root" },
            folderConfig: { "en-US": [] },
          },
        }
      )

      setSitemapCtId(publishedCt.sys.id)
      setSitemapCtExists(true)
      setExistingFieldIds(new Set(REQUIRED_SITEMAP_FIELDS.map((f) => f.id)))
      setRootEntry({ id: entry.sys.id, internalName: "Main Sitemap", slug: "sitemap-index", isPublished: false })
      setSelectedEntryId(entry.sys.id)
      setCreateStatus({ type: "success", msg: `Sitemap CT and root entry created.` })
    } catch (e: unknown) {
      const msg = extractErrorMsg(e)
      setCreateStatus({ type: "error", msg })
    } finally {
      setCreating(false)
    }
  }

  /** Adds a single missing field to the existing Sitemap CT. */
  const handleAddField = async (fieldDef: typeof REQUIRED_SITEMAP_FIELDS[number]) => {
    if (!sitemapCtId) return
    setCreating(true)
    setCreateStatus(null)
    try {
      const ct = await sdk.cma.contentType.get({ contentTypeId: sitemapCtId })

      // Build field object based on type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newField: Record<string, any> = {
        id: fieldDef.id,
        name: fieldDef.name,
        type: fieldDef.type,
        required: false,
        localized: false,
      }
      if (fieldDef.id === "sitemapType") {
        newField.validations = [{ in: ["root", "child"] }]
      } else if (fieldDef.id === "childSitemaps") {
        newField.items = { type: "Link", linkType: "Entry", validations: [{ linkContentType: ["sitemap"] }] }
      } else if (fieldDef.id === "contentTypes") {
        newField.items = {
          type: "Symbol",
          validations: enabledContentTypes.length ? [{ in: enabledContentTypes }] : [],
        }
      } else if (fieldDef.id === "changeFrequency") {
        newField.validations = [{ in: ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] }]
      } else if (fieldDef.id === "priority") {
        newField.validations = [{ range: { min: 0, max: 1 } }]
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedCt = await (sdk.cma.contentType.update as any)(
        { contentTypeId: sitemapCtId },
        { ...ct, fields: [...(ct.fields ?? []), newField] }
      )
      await sdk.cma.contentType.publish({ contentTypeId: sitemapCtId }, updatedCt)
      setExistingFieldIds((prev) => new Set([...prev, fieldDef.id]))

      // If we just added contentTypes, also set checkbox appearance
      if (fieldDef.id === "contentTypes") {
        await applyEditorInterfaceSettings(sitemapCtId)
      }

      setCreateStatus({ type: "success", msg: `Field "${fieldDef.name}" added.` })
    } catch (e: unknown) {
      const msg = extractErrorMsg(e)
      setCreateStatus({ type: "error", msg })
    } finally {
      setCreating(false)
    }
  }

  /** Creates the root Sitemap entry when CT exists but no entries exist. */
  const handleCreateRootEntry = async () => {
    if (!sitemapCtId) return
    setCreating(true)
    setCreateStatus(null)
    try {
      const entry = await sdk.cma.entry.create(
        {
          contentTypeId: sitemapCtId,
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment ?? "master",
        },
        {
          fields: {
            internalName: { "en-US": "Main Sitemap" },
            slug: { "en-US": "sitemap-index" },
            sitemapType: { "en-US": "root" },
            folderConfig: { "en-US": [] },
          },
        }
      )
      setRootEntry({ id: entry.sys.id, internalName: "Main Sitemap", slug: "sitemap-index", isPublished: false })
      setSelectedEntryId(entry.sys.id)
      setCreateStatus({ type: "success", msg: `Root entry created.` })
    } catch (e: unknown) {
      const msg = extractErrorMsg(e)
      setCreateStatus({ type: "error", msg })
    } finally {
      setCreating(false)
    }
  }

  /** Handles "Add child sitemap" dialog submission. */
  const handleAddChildSitemap = async () => {
    if (!sitemapCtId || !rootEntry) return
    setAddingChild(true)
    setAddChildStatus(null)
    try {
      // Create child entry
      const child = await sdk.cma.entry.create(
        {
          contentTypeId: sitemapCtId,
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment ?? "master",
        },
        {
          fields: {
            internalName: { "en-US": childName },
            slug: { "en-US": childSlug },
            sitemapType: { "en-US": "child" },
            contentTypes: { "en-US": childContentTypes },
          },
        }
      )

      // Patch root entry's childSitemaps
      const rootEntryData = await sdk.cma.entry.get({ entryId: rootEntry.id })
      const currentLinks = (loc(rootEntryData.fields?.childSitemaps) as Array<{ sys: { id: string; type: string; linkType: string } }> | undefined) ?? []
      const updatedLinks = [
        ...currentLinks,
        { sys: { type: "Link", linkType: "Entry", id: child.sys.id } },
      ]
      await sdk.cma.entry.update(
        { entryId: rootEntry.id },
        { ...rootEntryData, fields: { ...rootEntryData.fields, childSitemaps: { "en-US": updatedLinks } } }
      )

      setChildSitemaps((prev) => [
        ...prev,
        {
          id: child.sys.id,
          internalName: childName,
          slug: childSlug,
          contentTypes: childContentTypes,
          changeFrequency: "",
          priority: null,
          isPublished: false,
        },
      ])
      setShowAddChildDialog(false)
      setChildName("")
      setChildSlug("")
      setChildContentTypes([])
      setAddChildStatus({ type: "success", msg: "Child sitemap created and linked to root." })
    } catch (e: unknown) {
      const msg = extractErrorMsg(e)
      setAddChildStatus({ type: "error", msg })
    } finally {
      setAddingChild(false)
    }
  }

  const toggleContentType = (ctId: string) => {
    setEnabledContentTypes((prev) => {
      if (prev.includes(ctId)) return prev.filter((id) => id !== ctId)
      return [...prev, ctId]
    })
  }

  /** Strip a trailing .xml extension from a slug to prevent double .xml.xml in display URLs. */
  const normalizeSlug = (slug: string) => slug.replace(/\.xml$/i, "")

  const setSlugField = (ctId: string, slugFieldId: string) => {
    setContentTypeConfigs((prev) => ({ ...prev, [ctId]: { slugFieldId } }))
  }

  const handleCopyRobotsTxt = () => {
    const snippet = `Sitemap: ${baseUrl}/${normalizeSlug(rootEntry?.slug ?? "sitemap-index")}.xml`
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const toggleChildContentType = (ctId: string) => {
    setChildContentTypes((prev) =>
      prev.includes(ctId) ? prev.filter((id) => id !== ctId) : [...prev, ctId]
    )
  }

  // ── missing fields detection ───────────────────────────────────────────────────

  const missingFields = sitemapCtExists
    ? REQUIRED_SITEMAP_FIELDS.filter((f) => !existingFieldIds.has(f.id))
    : []

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--cf-gray-700)] mb-1">
          Sitemap Tree Manager
        </h1>
        <p className="text-sm text-[var(--cf-gray-500)]">
          Configure which content types are managed by this app.
        </p>
      </div>

      <Separator />

      {/* Base URL */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[var(--cf-blue-500)]" />
          <h2 className="font-semibold text-[var(--cf-gray-700)]">Base URL</h2>
        </div>
        <div className="space-y-1">
          <Label htmlFor="baseUrl" className="text-sm text-[var(--cf-gray-600)]">
            Your site&apos;s root URL (no trailing slash)
          </Label>
          <Input
            id="baseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://example.com"
            className="max-w-sm"
          />
        </div>
      </section>

      <Separator />

      {/* Managed Content Types */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-[var(--cf-blue-500)]" />
          <h2 className="font-semibold text-[var(--cf-gray-700)]">Managed Content Types</h2>
        </div>
        <p className="text-xs text-[var(--cf-gray-500)]">
          Enabling a content type wires this app as the slug field widget and an entry editor
          tab. We add &ldquo;Sitemap Metadata&rdquo; and &ldquo;Exclude from Sitemap&rdquo; fields if they
          don&apos;t exist. We never create or modify the slug field itself — map to your existing
          one.
        </p>

        {/* "How it works" collapsible info box */}
        <div className="rounded-md border border-[var(--cf-blue-200)] bg-[var(--cf-blue-50)]">
          <button
            onClick={() => setShowHowItWorks((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[var(--cf-blue-700)] hover:bg-[var(--cf-blue-100)] rounded-md transition-colors"
            data-fs-id="how-it-works-fields-toggle"
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">How it works — sitemapMetadata &amp; excludeFromSitemap</span>
            {showHowItWorks ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>
          {showHowItWorks && (
            <div className="px-4 pb-3 pt-1 text-xs text-[var(--cf-gray-700)] space-y-2 border-t border-[var(--cf-blue-200)]">
              <p>
                When a content type is enabled, the app automatically adds two fields to it:
              </p>
              <ul className="space-y-1 ml-3 list-disc list-outside">
                <li>
                  <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">sitemapMetadata</code>{" "}
                  (JSON) — stores <code>parentEntryId</code> (which folder/page this entry belongs to) and{" "}
                  <code>computedPath</code> (the full URL path, e.g. <code>/faculty/departments/cs</code>).
                  Written automatically when you drag entries in the tree or use &ldquo;Move to folder.&rdquo;
                </li>
                <li>
                  <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">excludeFromSitemap</code>{" "}
                  (Boolean) — hides an entry from the sitemap XML. Toggle it in the tree or the entry editor.
                </li>
              </ul>
              <p className="text-[var(--cf-gray-500)]">You don&apos;t need to edit these fields manually — the app manages them for you.</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {contentTypes.map((ct) => {
            const isEnabled = enabledContentTypes.includes(ct.id)
            const config = contentTypeConfigs[ct.id]

            return (
              <div
                key={ct.id}
                className="border border-[var(--cf-gray-200)] rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() => toggleContentType(ct.id)}
                      data-fs-id={`toggle-ct-${ct.id}`}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        isEnabled ? "bg-[var(--cf-blue-500)]" : "bg-[var(--cf-gray-300)]"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          isEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="font-medium text-[var(--cf-gray-700)]">{ct.name}</span>
                      <code className="ml-2 text-xs text-[var(--cf-gray-500)] bg-[var(--cf-gray-100)] px-1.5 py-0.5 rounded">
                        {ct.id}
                      </code>
                    </div>
                  </div>
                  {isEnabled && (
                    <Badge className="bg-[var(--cf-green-100)] text-[var(--cf-green-500)] hover:bg-[var(--cf-green-100)]">
                      Enabled
                    </Badge>
                  )}
                </div>

                {isEnabled && (
                  <div className="pl-12 space-y-1">
                    <Label className="text-xs text-[var(--cf-gray-500)]">
                      Slug field (Short Text)
                    </Label>
                    <Select
                      value={config?.slugFieldId ?? ""}
                      onValueChange={(val) => setSlugField(ct.id, val)}
                    >
                      <SelectTrigger className="h-8 text-sm max-w-xs">
                        <SelectValue placeholder="Select a Short Text field" />
                      </SelectTrigger>
                      <SelectContent>
                        {ct.symbolFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}{" "}
                            <span className="text-[var(--cf-gray-400)]">({f.id})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )
          })}

          {contentTypes.length === 0 && (
            <p className="text-sm text-[var(--cf-gray-400)] italic">Loading content types...</p>
          )}
        </div>
      </section>

      <Separator />

      {/* Sitemap section */}
      <section className="space-y-4">
        <h2 className="font-semibold text-[var(--cf-gray-700)]">Sitemap</h2>

        {/* "How it works" collapsible — single sitemap vs sitemap index */}
        <div className="rounded-md border border-[var(--cf-blue-200)] bg-[var(--cf-blue-50)]">
          <button
            onClick={() => setShowSitemapHowItWorks((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[var(--cf-blue-700)] hover:bg-[var(--cf-blue-100)] rounded-md transition-colors"
            data-fs-id="how-it-works-sitemap-toggle"
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">How it works — single sitemap vs. sitemap index</span>
            {showSitemapHowItWorks ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>
          {showSitemapHowItWorks && (
            <div className="px-4 pb-3 pt-1 text-xs text-[var(--cf-gray-700)] space-y-2 border-t border-[var(--cf-blue-200)]">
              <p>
                Two modes are supported, controlled by the <strong>Child Sitemaps</strong> field on the root Sitemap entry:
              </p>
              <ul className="space-y-2 ml-3 list-disc list-outside">
                <li>
                  <strong>Single sitemap</strong> (no children) — generates one XML file at{" "}
                  <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">/{"{"}root slug{"}"}.xml</code>.
                  {" "}Set <strong>Content Types</strong>, <strong>Change Frequency</strong>, and <strong>Priority</strong> on the root Sitemap entry.
                </li>
                <li>
                  <strong>Sitemap index</strong> (one or more children) — generates a sitemap index at{" "}
                  <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">/{"{"}root slug{"}"}.xml</code>{" "}
                  plus one URL list per child at{" "}
                  <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">/{"{"}child slug{"}"}.xml</code>.
                  {" "}Set <strong>Content Types</strong>, <strong>Change Frequency</strong>, and <strong>Priority</strong> on each child entry — leave those fields empty on the root.
                </li>
              </ul>
              <p className="text-[var(--cf-gray-500)]">
                The <strong>Sitemap Type</strong> field on each entry shows its role: <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">root</code> for the main entry, <code className="bg-white border border-[var(--cf-gray-200)] px-1 py-0.5 rounded">child</code> for sub-sitemaps. Your website reads this data from the Contentful Delivery API to generate the XML files.
              </p>
            </div>
          )}
        </div>

        {sitemapCtExists === null && (
          <p className="text-xs text-[var(--cf-gray-400)] italic">Checking for Sitemap content type…</p>
        )}

        {/* No Sitemap CT → create */}
        {sitemapCtExists === false && (
          <>
            <p className="text-xs text-[var(--cf-gray-500)]">
              Creates a &ldquo;Sitemap&rdquo; content type (ID: <code>sitemap</code>) with all required fields,
              plus one root entry. Opening that entry gives you the full sitemap manager.
              Folder structure is stored centrally and shared across all page entries.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateSitemapContentType}
                disabled={creating}
                className="bg-transparent"
                data-fs-id="create-sitemap-ct"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {creating ? "Creating…" : "Create Sitemap content type"}
              </Button>
              {createStatus && (
                <StatusMsg status={createStatus} />
              )}
            </div>
          </>
        )}

        {/* Sitemap CT exists */}
        {sitemapCtExists === true && (
          <div className="space-y-4">
            {/* CT status row */}
            <div className="flex items-center gap-2 p-3 rounded-md bg-[var(--cf-green-50)] border border-[var(--cf-green-200)]">
              <CheckCircle2 className="h-4 w-4 text-[var(--cf-green-500)] shrink-0" />
              <div className="text-xs text-[var(--cf-gray-700)]">
                <span className="font-medium">Sitemap content type found</span>
                <code className="ml-2 text-[var(--cf-gray-500)] bg-white px-1.5 py-0.5 rounded border border-[var(--cf-gray-200)]">
                  {sitemapCtId}
                </code>
              </div>
            </div>

            {/* Missing fields — per-field warning + Add button */}
            {missingFields.length > 0 && (
              <div className="space-y-2">
                {missingFields.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 p-3 rounded-md bg-[var(--cf-orange-50)] border border-[var(--cf-orange-200)]"
                  >
                    <AlertCircle className="h-4 w-4 text-[var(--cf-orange-500)] shrink-0" />
                    <div className="flex-1 text-xs text-[var(--cf-gray-700)]">
                      Missing field: <code>{f.id}</code> ({f.name})
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddField(f)}
                      disabled={creating}
                      className="h-7 text-xs bg-transparent shrink-0"
                      data-fs-id={`add-field-${f.id}`}
                    >
                      {creating ? "Adding…" : "Add field"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {createStatus && !rootEntry && (
              <StatusMsg status={createStatus} />
            )}

            {/* Multiple entries, can't auto-detect root → picker */}
            {!rootEntry && multipleEntries.length > 1 && (
              <div className="space-y-2 p-3 rounded-md bg-[var(--cf-orange-50)] border border-[var(--cf-orange-200)]">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[var(--cf-orange-500)]" />
                  <p className="text-xs font-medium text-[var(--cf-gray-700)]">
                    Multiple Sitemap entries found with no clear root. Pick one to use as root.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {multipleEntries.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelectedEntryId(e.id)
                        setRootEntry({ id: e.id, internalName: e.name, slug: "sitemap-index", isPublished: false })
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded border text-left text-xs transition-colors ${
                        selectedEntryId === e.id
                          ? "bg-[var(--cf-blue-100)] border-[var(--cf-blue-400)] text-[var(--cf-blue-700)]"
                          : "bg-white border-[var(--cf-gray-200)] text-[var(--cf-gray-700)] hover:border-[var(--cf-blue-300)]"
                      }`}
                    >
                      <span className="font-medium">{e.name}</span>
                      <code className="text-[var(--cf-gray-400)]">{e.id}</code>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CT exists but no entries */}
            {!rootEntry && multipleEntries.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--cf-gray-500)]">
                  No Sitemap entry found. Create the root entry to start managing your sitemap.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateRootEntry}
                    disabled={creating}
                    className="bg-transparent"
                    data-fs-id="create-root-entry"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {creating ? "Creating…" : "Create root Sitemap entry"}
                  </Button>
                  {createStatus && <StatusMsg status={createStatus} />}
                </div>
              </div>
            )}

            {/* Root Sitemap card */}
            {rootEntry && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-[var(--cf-green-200)] bg-[var(--cf-green-50)] space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--cf-gray-700)]">{rootEntry.internalName}</p>
                      <p className="text-xs text-[var(--cf-gray-500)] font-mono mt-0.5">
                        {baseUrl}/{normalizeSlug(rootEntry.slug)}.xml
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rootEntry.isPublished ? (
                        <Badge className="bg-[var(--cf-green-100)] text-[var(--cf-green-500)] hover:bg-[var(--cf-green-100)] text-xs">
                          Published
                        </Badge>
                      ) : (
                        <Badge className="bg-[var(--cf-orange-100)] text-[var(--cf-orange-500)] hover:bg-[var(--cf-orange-100)] text-xs">
                          Draft
                        </Badge>
                      )}
                      <a
                        href={buildEntryLink(rootEntry.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs flex items-center gap-1 text-[var(--cf-blue-500)] hover:underline"
                      >
                        Open entry
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--cf-gray-500)]">Root sitemap index</p>
                </div>

                {/* Single sitemap mode banner — only shown when no children */}
                {childSitemaps.length === 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-md border border-[var(--cf-blue-200)] bg-[var(--cf-blue-50)]">
                    <FileText className="h-4 w-4 text-[var(--cf-blue-500)] shrink-0 mt-0.5" />
                    <div className="text-xs text-[var(--cf-gray-700)] space-y-0.5">
                      <p className="font-semibold text-[var(--cf-blue-700)]">Single Sitemap Mode</p>
                      <p>This sitemap covers all your enabled content types in one XML file. To switch to a sitemap index (multiple XML files), add child sitemaps below.</p>
                    </div>
                  </div>
                )}

                {/* Child sitemaps */}
                {childSitemaps.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-[var(--cf-gray-600)] uppercase tracking-wide">
                      Child Sitemaps
                    </h3>

                    {/* Child sitemaps detected notification */}
                    <div className="rounded-md border border-[var(--cf-blue-200)] bg-[var(--cf-blue-50)] px-3 py-2.5 flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 text-[var(--cf-blue-500)] shrink-0 mt-0.5" />
                      <div className="text-xs text-[var(--cf-gray-700)] space-y-1 flex-1">
                        <p className="font-medium text-[var(--cf-blue-700)]">
                          {childSitemaps.length === 1
                            ? "1 child sitemap detected"
                            : `${childSitemaps.length} child sitemaps detected`}
                        </p>
                        <p>This root entry generates a sitemap index file. Each child sitemap should have Content Types, Change Frequency, and Priority configured.</p>
                        {childSitemaps.some((c) => !c.contentTypes.length || !c.changeFrequency || c.priority === null) && (
                          <ul className="mt-1 space-y-0.5">
                            {childSitemaps
                              .filter((c) => !c.contentTypes.length || !c.changeFrequency || c.priority === null)
                              .map((c) => {
                                const missing = [
                                  ...(!c.contentTypes.length ? ["Content Types"] : []),
                                  ...(!c.changeFrequency ? ["Change Frequency"] : []),
                                  ...(c.priority === null ? ["Priority"] : []),
                                ]
                                return (
                                  <li key={c.id} className="flex items-center gap-1 text-[var(--cf-orange-700)]">
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    <span><span className="font-medium">{c.internalName}</span> — missing: {missing.join(", ")}</span>
                                  </li>
                                )
                              })}
                          </ul>
                        )}
                      </div>
                    </div>

                    {childSitemaps.map((child) => (
                      <div
                        key={child.id}
                        className="p-3 rounded-md border border-[var(--cf-gray-200)] bg-white space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[var(--cf-gray-700)]">{child.internalName}</p>
                            <p className="text-xs text-[var(--cf-gray-500)] font-mono">
                              {baseUrl}/{normalizeSlug(child.slug)}.xml
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {child.isPublished ? (
                              <Badge className="bg-[var(--cf-green-100)] text-[var(--cf-green-500)] hover:bg-[var(--cf-green-100)] text-xs">
                                Published
                              </Badge>
                            ) : (
                              <Badge className="bg-[var(--cf-orange-100)] text-[var(--cf-orange-500)] hover:bg-[var(--cf-orange-100)] text-xs">
                                Draft
                              </Badge>
                            )}
                            <a
                              href={buildEntryLink(child.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs flex items-center gap-1 text-[var(--cf-blue-500)] hover:underline"
                            >
                              Open entry
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                        {child.contentTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {child.contentTypes.map((ct) => (
                              <code key={ct} className="text-xs bg-[var(--cf-gray-100)] px-1.5 py-0.5 rounded text-[var(--cf-gray-600)]">
                                {ct}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddChildDialog(true)}
                  className="bg-transparent"
                  data-fs-id="add-child-sitemap-open"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add child sitemap
                </Button>

                {addChildStatus && <StatusMsg status={addChildStatus} />}
                {createStatus && rootEntry && <StatusMsg status={createStatus} />}

                {/* robots.txt snippet */}
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-semibold text-[var(--cf-gray-600)] uppercase tracking-wide">
                    robots.txt
                  </h3>
                  <p className="text-xs text-[var(--cf-gray-500)]">
                    Add this line to your site&apos;s robots.txt file.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-[var(--cf-gray-100)] border border-[var(--cf-gray-200)] px-3 py-2 rounded font-mono text-[var(--cf-gray-700)]">
                      Sitemap: {baseUrl}/{normalizeSlug(rootEntry.slug)}.xml
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyRobotsTxt}
                      className="bg-transparent shrink-0 h-8 w-8 p-0"
                      title="Copy to clipboard"
                      data-fs-id="copy-robots-txt"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-[var(--cf-green-500)]" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Add child sitemap dialog */}
      <Dialog open={showAddChildDialog} onOpenChange={setShowAddChildDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add child sitemap</DialogTitle>
            <DialogDescription>
              Creates a child sitemap entry covering specific content types. It will be linked to the root sitemap index automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-sm text-[var(--cf-gray-600)]">Internal Name</Label>
              <Input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="Blog Posts Sitemap"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-[var(--cf-gray-600)]">Slug</Label>
              <div className="flex items-center gap-1">
                <Input
                  value={childSlug}
                  onChange={(e) => setChildSlug(e.target.value)}
                  placeholder="sitemap-blog"
                  className="font-mono"
                />
                <span className="text-xs text-[var(--cf-gray-500)] shrink-0">.xml</span>
              </div>
              <p className="text-xs text-[var(--cf-gray-500)]">
                Do not include <code>.xml</code> — it is appended automatically.
              </p>
              <p className="text-xs text-[var(--cf-gray-500)]">
                URL: {baseUrl}/{normalizeSlug(childSlug) || "sitemap-blog"}.xml
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-[var(--cf-gray-600)]">Content Types</Label>
              <div className="space-y-1 max-h-40 overflow-auto">
                {enabledContentTypes.map((ctId) => {
                  const ct = contentTypes.find((c) => c.id === ctId)
                  const checked = childContentTypes.includes(ctId)
                  return (
                    <label key={ctId} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-[var(--cf-gray-50)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChildContentType(ctId)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm text-[var(--cf-gray-700)]">{ct?.name ?? ctId}</span>
                      <code className="text-xs text-[var(--cf-gray-400)]">{ctId}</code>
                    </label>
                  )
                })}
                {enabledContentTypes.length === 0 && (
                  <p className="text-xs text-[var(--cf-gray-400)] italic">No enabled content types yet.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddChildDialog(false)}
              className="bg-transparent"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddChildSitemap}
              disabled={addingChild || !childName.trim() || !childSlug.trim()}
              className="bg-[var(--cf-blue-500)] hover:bg-[var(--cf-blue-600)]"
              data-fs-id="add-child-sitemap-confirm"
            >
              {addingChild ? "Creating…" : "Create child sitemap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusMsg({ status }: { status: { type: "success" | "error"; msg: string } }) {
  return (
    <span
      className={`flex items-center gap-1 text-xs ${
        status.type === "error" ? "text-[var(--cf-red-500)]" : "text-[var(--cf-green-500)]"
      }`}
    >
      {status.type === "success" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5" />
      )}
      {status.msg}
    </span>
  )
}
