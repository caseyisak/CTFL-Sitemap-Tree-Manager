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
import { Globe, LayoutGrid, Plus } from "lucide-react"

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
  const [creating, setCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState<string | null>(null)
  const [sitemapCtExists, setSitemapCtExists] = useState<boolean | null>(null)
  const [sitemapEntries, setSitemapEntries] = useState<Array<{ id: string; name: string }>>([])

  // Load saved parameters and fetch content types on mount
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
      }

      const options: ContentTypeOption[] = (ctResponse.items ?? []).map((ct) => ({
        id: ct.sys.id,
        name: ct.name,
        symbolFields: (ct.fields ?? [])
          .filter((f) => f.type === "Symbol")
          .map((f) => ({ id: f.id, name: f.name })),
      }))
      setContentTypes(options)

      // Check if the "sitemap" content type already exists
      try {
        await sdk.cma.contentType.get({ contentTypeId: "sitemap" })
        setSitemapCtExists(true)
        // Fetch existing sitemap entries
        const entryResponse = await sdk.cma.entry.getMany({
          query: { content_type: "sitemap", limit: 100 },
        })
        setSitemapEntries(
          (entryResponse.items ?? []).map((e) => ({
            id: e.sys.id,
            name:
              (e.fields?.name?.["en-US"] as string | undefined) ??
              (e.fields?.title?.["en-US"] as string | undefined) ??
              e.sys.id,
          }))
        )
      } catch {
        setSitemapCtExists(false)
      }
    }

    init()

    // Register onConfigure callback then signal Contentful the app is ready
    sdk.app.onConfigure(() => handleConfigure())
    sdk.app.setReady()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the onConfigure reference up to date
  useEffect(() => {
    sdk.app.onConfigure(() => handleConfigure())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, enabledContentTypes, contentTypeConfigs])

  const toggleContentType = (ctId: string) => {
    setEnabledContentTypes((prev) => {
      if (prev.includes(ctId)) {
        return prev.filter((id) => id !== ctId)
      }
      return [...prev, ctId]
    })
  }

  const setSlugField = (ctId: string, slugFieldId: string) => {
    setContentTypeConfigs((prev) => ({
      ...prev,
      [ctId]: { slugFieldId },
    }))
  }

  const handleConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState()
    const editorInterfaceAssignments: AppState["EditorInterface"] = {}

    for (const ctId of enabledContentTypes) {
      const config = contentTypeConfigs[ctId]
      if (!config?.slugFieldId) continue

      // Add managed fields if they don't exist
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
            {
              ...ct,
              fields: [...(ct.fields ?? []), ...fieldsToAdd],
            }
          )
          await sdk.cma.contentType.publish(
            { contentTypeId: ctId },
            updatedCt
          )
        }
      } catch (e) {
        console.error(`Failed to update content type ${ctId}:`, e)
      }

      editorInterfaceAssignments[ctId] = {
        controls: [
          { fieldId: config.slugFieldId },
        ],
        editors: {
          position: 1,
        },
      }
    }

    return {
      parameters: {
        enabledContentTypes,
        contentTypeConfigs,
        baseUrl,
      },
      targetState: {
        EditorInterface: {
          ...currentState?.EditorInterface,
          ...editorInterfaceAssignments,
        },
      },
    }
  }, [sdk, enabledContentTypes, contentTypeConfigs, baseUrl])

  const handleCreateSitemapContentType = async () => {
    setCreating(true)
    setCreateStatus(null)
    try {
      const ct = await sdk.cma.contentType.create(
        { spaceId: sdk.ids.space, environmentId: sdk.ids.environment ?? "master" },
        {
          name: "Sitemap",
          displayField: "name",
          fields: [
            { id: "name", name: "Name", type: "Symbol", required: true, localized: false },
            {
              id: "description",
              name: "Description",
              type: "Symbol",
              required: false,
              localized: false,
            },
          ],
        }
      )
      await sdk.cma.contentType.publish({ contentTypeId: ct.sys.id }, ct)
      setCreateStatus(`Created "Sitemap" content type (ID: ${ct.sys.id})`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setCreateStatus(`Error: ${msg}`)
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
            Your site's root URL (no trailing slash)
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
                        isEnabled
                          ? "bg-[var(--cf-blue-500)]"
                          : "bg-[var(--cf-gray-300)]"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          isEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="font-medium text-[var(--cf-gray-700)]">
                        {ct.name}
                      </span>
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
            <p className="text-sm text-[var(--cf-gray-400)] italic">
              Loading content types...
            </p>
          )}
        </div>
      </section>

      <Separator />

      {/* Sitemap content type */}
      <section className="space-y-3">
        <h2 className="font-semibold text-[var(--cf-gray-700)]">Sitemap</h2>

        {sitemapCtExists === null && (
          <p className="text-xs text-[var(--cf-gray-400)] italic">Checking for Sitemap content type…</p>
        )}

        {sitemapCtExists === false && (
          <>
            <p className="text-xs text-[var(--cf-gray-500)]">
              Creates a dedicated &ldquo;Sitemap&rdquo; content type in this space. Opening a Sitemap entry
              shows the full sitemap manager and lets you export sitemap.xml.
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
                {creating ? "Creating..." : "Create Sitemap Content Type"}
              </Button>
              {createStatus && (
                <span
                  className={`text-xs ${
                    createStatus.startsWith("Error")
                      ? "text-[var(--cf-red-500)]"
                      : "text-[var(--cf-green-500)]"
                  }`}
                >
                  {createStatus}
                </span>
              )}
            </div>
          </>
        )}

        {sitemapCtExists === true && (
          <>
            <p className="text-xs text-[var(--cf-gray-500)]">
              A &ldquo;Sitemap&rdquo; content type already exists in this space. Open a Sitemap entry to manage your site hierarchy.
            </p>
            {sitemapEntries.length === 0 ? (
              <p className="text-xs text-[var(--cf-gray-400)] italic">
                No sitemap entries found. Create one from the Content section.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-[var(--cf-gray-600)]">Sitemap entries</p>
                <div className="flex flex-col gap-1">
                  {sitemapEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between px-3 py-2 rounded-md border border-[var(--cf-gray-200)] bg-[var(--cf-gray-50)]"
                    >
                      <span className="text-sm text-[var(--cf-gray-700)]">{entry.name}</span>
                      <code className="text-xs font-mono text-[var(--cf-gray-400)]">{entry.id}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
