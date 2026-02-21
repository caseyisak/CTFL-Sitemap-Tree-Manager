"use client"

import { useEffect, useState, useCallback } from "react"
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
import { Separator } from "@/components/ui/separator"
import { Globe, LayoutGrid, Plus, CheckCircle2, AlertCircle } from "lucide-react"

interface ContentTypeOption {
  id: string
  name: string
  symbolFields: Array<{ id: string; name: string }>
}

export function AppConfigScreen() {
  const sdk = useSDK<ConfigAppSDK>()

  const [baseUrl, setBaseUrl] = useState("https://smu.edu")
  const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>([])
  const [enabledContentTypes, setEnabledContentTypes] = useState<string[]>([])
  const [contentTypeConfigs, setContentTypeConfigs] = useState<
    Record<string, ContentTypeConfig>
  >({})

  // Sitemap singleton state
  const [sitemapCtId, setSitemapCtId] = useState<string | null>(null)
  const [sitemapCtExists, setSitemapCtExists] = useState<boolean | null>(null)
  const [sitemapCtHasFolderConfig, setSitemapCtHasFolderConfig] = useState(false)
  const [sitemapEntryId, setSitemapEntryId] = useState<string | null>(null)
  const [sitemapEntryName, setSitemapEntryName] = useState<string | null>(null)
  const [multipleEntries, setMultipleEntries] = useState<Array<{ id: string; name: string }>>([])

  const [creating, setCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // Load saved parameters and detect Sitemap CT on mount
  useEffect(() => {
    async function init() {
      const [params, ctResponse] = await Promise.all([
        sdk.app.getParameters<AppInstallationParameters>(),
        sdk.cma.contentType.getMany({ query: { limit: 200 } }),
      ])

      if (params) {
        setBaseUrl(params.baseUrl ?? "https://smu.edu")
        setEnabledContentTypes(params.enabledContentTypes ?? [])
        setContentTypeConfigs(params.contentTypeConfigs ?? {})
        if (params.sitemapEntryId) setSitemapEntryId(params.sitemapEntryId)
      }

      const options: ContentTypeOption[] = (ctResponse.items ?? []).map((ct) => ({
        id: ct.sys.id,
        name: ct.name,
        symbolFields: (ct.fields ?? [])
          .filter((f) => f.type === "Symbol")
          .map((f) => ({ id: f.id, name: f.name })),
      }))
      setContentTypes(options)

      // Detect Sitemap CT by NAME so it works regardless of auto-generated ID
      const sitemapCt = (ctResponse.items ?? []).find(
        (ct) => ct.name.toLowerCase() === "sitemap"
      )

      if (sitemapCt) {
        setSitemapCtId(sitemapCt.sys.id)
        setSitemapCtExists(true)
        const hasFolderConfig = sitemapCt.fields.some((f) => f.id === "folderConfig")
        setSitemapCtHasFolderConfig(hasFolderConfig)

        // Find sitemap entries
        try {
          const entryResponse = await sdk.cma.entry.getMany({
            query: { content_type: sitemapCt.sys.id, limit: 10 },
          })
          const items = entryResponse.items ?? []
          const named = items.map((e) => ({
            id: e.sys.id,
            name:
              (e.fields?.name?.["en-US"] as string | undefined) ??
              (e.fields?.title?.["en-US"] as string | undefined) ??
              e.sys.id,
          }))

          if (items.length === 1) {
            setSitemapEntryId(named[0].id)
            setSitemapEntryName(named[0].name)
          } else if (items.length > 1) {
            setMultipleEntries(named)
            // Use stored sitemapEntryId if it's one of the existing entries
            const storedId = params?.sitemapEntryId
            if (storedId && named.some((e) => e.id === storedId)) {
              const stored = named.find((e) => e.id === storedId)!
              setSitemapEntryId(storedId)
              setSitemapEntryName(stored.name)
            }
          }
          // items.length === 0 → show "Create Sitemap Entry" button
        } catch { /* ignore */ }
      } else {
        setSitemapCtExists(false)
      }
    }

    init()

    sdk.app.onConfigure(() => handleConfigure())
    sdk.app.setReady()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the onConfigure reference up to date
  useEffect(() => {
    sdk.app.onConfigure(() => handleConfigure())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, enabledContentTypes, contentTypeConfigs, sitemapCtId, sitemapEntryId])

  const toggleContentType = (ctId: string) => {
    setEnabledContentTypes((prev) => {
      if (prev.includes(ctId)) return prev.filter((id) => id !== ctId)
      return [...prev, ctId]
    })
  }

  const setSlugField = (ctId: string, slugFieldId: string) => {
    setContentTypeConfigs((prev) => ({ ...prev, [ctId]: { slugFieldId } }))
  }

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

        if (fieldsToAdd.length > 0) {
          const updatedCt = await sdk.cma.contentType.update(
            { contentTypeId: ctId },
            { ...ct, fields: [...(ct.fields ?? []), ...fieldsToAdd] }
          )
          await sdk.cma.contentType.publish({ contentTypeId: ctId }, updatedCt)
        }
      } catch (e) {
        console.error(`Failed to update content type ${ctId}:`, e)
      }

      editorInterfaceAssignments[ctId] = {
        controls: [{ fieldId: config.slugFieldId }],
        editors: { position: 1 },
      }
    }

    // Also assign the Sitemap CT's editor interface
    if (sitemapCtId) {
      editorInterfaceAssignments[sitemapCtId] = {
        editors: { position: 0 },
      }
    }

    return {
      parameters: {
        enabledContentTypes,
        contentTypeConfigs,
        baseUrl,
        ...(sitemapCtId ? { sitemapContentTypeId: sitemapCtId } : {}),
        ...(sitemapEntryId ? { sitemapEntryId } : {}),
      },
      targetState: {
        EditorInterface: {
          ...currentState?.EditorInterface,
          ...editorInterfaceAssignments,
        },
      },
    }
  }, [sdk, enabledContentTypes, contentTypeConfigs, baseUrl, sitemapCtId, sitemapEntryId])

  /** Creates the Sitemap CT (with folderConfig field) + a singleton entry in one shot. */
  const handleCreateSitemapContentType = async () => {
    setCreating(true)
    setCreateStatus(null)
    try {
      // Create the content type
      const ct = await sdk.cma.contentType.create(
        { spaceId: sdk.ids.space, environmentId: sdk.ids.environment ?? "master" },
        {
          name: "Sitemap",
          displayField: "name",
          fields: [
            { id: "name", name: "Name", type: "Symbol", required: true, localized: false },
            {
              id: "folderConfig",
              name: "Folder Config",
              type: "Object",
              required: false,
              localized: false,
            },
          ],
        }
      )
      const publishedCt = await sdk.cma.contentType.publish({ contentTypeId: ct.sys.id }, ct)

      // Create the singleton entry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = await sdk.cma.entry.create(
        {
          contentTypeId: publishedCt.sys.id,
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment ?? "master",
        },
        { fields: { name: { "en-US": "Main Sitemap" }, folderConfig: { "en-US": [] } } }
      )

      setSitemapCtId(publishedCt.sys.id)
      setSitemapCtExists(true)
      setSitemapCtHasFolderConfig(true)
      setSitemapEntryId(entry.sys.id)
      setSitemapEntryName("Main Sitemap")
      setCreateStatus({ type: "success", msg: `Sitemap ready! Entry ID: ${entry.sys.id}` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setCreateStatus({ type: "error", msg })
    } finally {
      setCreating(false)
    }
  }

  /** Adds the folderConfig field to an existing Sitemap CT that doesn't have it. */
  const handleAddFolderConfigField = async () => {
    if (!sitemapCtId) return
    setCreating(true)
    setCreateStatus(null)
    try {
      const ct = await sdk.cma.contentType.get({ contentTypeId: sitemapCtId })
      const updatedCt = await sdk.cma.contentType.update(
        { contentTypeId: sitemapCtId },
        {
          ...ct,
          fields: [
            ...(ct.fields ?? []),
            { id: "folderConfig", name: "Folder Config", type: "Object", required: false, localized: false },
          ],
        }
      )
      await sdk.cma.contentType.publish({ contentTypeId: sitemapCtId }, updatedCt)
      setSitemapCtHasFolderConfig(true)
      setCreateStatus({ type: "success", msg: "folderConfig field added." })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setCreateStatus({ type: "error", msg })
    } finally {
      setCreating(false)
    }
  }

  /** Creates the singleton Sitemap entry when the CT exists but has no entries. */
  const handleCreateSitemapEntry = async () => {
    if (!sitemapCtId) return
    setCreating(true)
    setCreateStatus(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = await sdk.cma.entry.create(
        {
          contentTypeId: sitemapCtId,
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment ?? "master",
        },
        {
          fields: {
            name: { "en-US": "Main Sitemap" },
            ...(sitemapCtHasFolderConfig ? { folderConfig: { "en-US": [] } } : {}),
          },
        }
      )
      setSitemapEntryId(entry.sys.id)
      setSitemapEntryName("Main Sitemap")
      setCreateStatus({ type: "success", msg: `Entry created (ID: ${entry.sys.id})` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setCreateStatus({ type: "error", msg })
    } finally {
      setCreating(false)
    }
  }

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

      {/* Sitemap singleton section */}
      <section className="space-y-4">
        <h2 className="font-semibold text-[var(--cf-gray-700)]">Sitemap</h2>

        {sitemapCtExists === null && (
          <p className="text-xs text-[var(--cf-gray-400)] italic">Checking for Sitemap content type…</p>
        )}

        {/* No Sitemap CT at all → offer to create */}
        {sitemapCtExists === false && (
          <>
            <p className="text-xs text-[var(--cf-gray-500)]">
              Creates a &ldquo;Sitemap&rdquo; content type with a <code>folderConfig</code> field, plus one
              singleton entry. Opening that entry gives you the full sitemap manager and
              sitemap.xml export. Folder structure is stored centrally and shared across all
              page entries.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateSitemapContentType}
                disabled={creating}
                className="bg-transparent"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {creating ? "Creating…" : "Create Sitemap"}
              </Button>
              {createStatus && (
                <span
                  className={`flex items-center gap-1 text-xs ${
                    createStatus.type === "error"
                      ? "text-[var(--cf-red-500)]"
                      : "text-[var(--cf-green-500)]"
                  }`}
                >
                  {createStatus.type === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {createStatus.msg}
                </span>
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

            {/* folderConfig field missing → offer to add */}
            {!sitemapCtHasFolderConfig && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-[var(--cf-orange-50)] border border-[var(--cf-orange-200)]">
                <AlertCircle className="h-4 w-4 text-[var(--cf-orange-500)] shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-[var(--cf-gray-700)]">
                    The <code>folderConfig</code> field is missing. Add it so folders can be
                    stored centrally in the Sitemap entry instead of as separate page entries.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddFolderConfigField}
                    disabled={creating}
                    className="h-7 text-xs bg-transparent"
                  >
                    {creating ? "Adding…" : "Add folderConfig field"}
                  </Button>
                </div>
              </div>
            )}

            {/* Singleton entry status */}
            {sitemapEntryId ? (
              <div className="flex items-center gap-2 p-3 rounded-md bg-[var(--cf-green-50)] border border-[var(--cf-green-200)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--cf-green-500)] shrink-0" />
                <div className="text-xs text-[var(--cf-gray-700)]">
                  <span className="font-medium">Active Sitemap entry:</span>{" "}
                  <span>{sitemapEntryName}</span>
                  <code className="ml-2 text-[var(--cf-gray-500)] bg-white px-1.5 py-0.5 rounded border border-[var(--cf-gray-200)]">
                    {sitemapEntryId}
                  </code>
                </div>
              </div>
            ) : multipleEntries.length > 1 ? (
              /* Multiple entries → warn and let user pick */
              <div className="space-y-2 p-3 rounded-md bg-[var(--cf-orange-50)] border border-[var(--cf-orange-200)]">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[var(--cf-orange-500)]" />
                  <p className="text-xs font-medium text-[var(--cf-gray-700)]">
                    Multiple Sitemap entries found — pick one as the active singleton.
                    You can delete the others from the Content section.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {multipleEntries.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSitemapEntryId(e.id)
                        setSitemapEntryName(e.name)
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded border text-left text-xs transition-colors ${
                        sitemapEntryId === e.id
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
            ) : (
              /* CT exists but no entries yet */
              <div className="space-y-2">
                <p className="text-xs text-[var(--cf-gray-500)]">
                  No Sitemap entry found. Create the singleton entry that will store your folder
                  config and serve as the sitemap manager.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateSitemapEntry}
                    disabled={creating}
                    className="bg-transparent"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {creating ? "Creating…" : "Create Sitemap Entry"}
                  </Button>
                  {createStatus && (
                    <span
                      className={`flex items-center gap-1 text-xs ${
                        createStatus.type === "error"
                          ? "text-[var(--cf-red-500)]"
                          : "text-[var(--cf-green-500)]"
                      }`}
                    >
                      {createStatus.type === "success" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5" />
                      )}
                      {createStatus.msg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Global create status (for folderConfig add etc.) */}
            {createStatus && sitemapEntryId && (
              <span
                className={`flex items-center gap-1 text-xs ${
                  createStatus.type === "error"
                    ? "text-[var(--cf-red-500)]"
                    : "text-[var(--cf-green-500)]"
                }`}
              >
                {createStatus.type === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {createStatus.msg}
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
