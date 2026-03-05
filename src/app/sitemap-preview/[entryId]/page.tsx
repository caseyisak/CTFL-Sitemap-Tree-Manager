"use client"

import { use, useEffect, useState, useCallback } from "react"
import { ContentfulLivePreview } from "@contentful/live-preview"

// ── Environment variables ─────────────────────────────────────────────────────
// Set these in .env.local for local dev and in Vercel project settings for prod.
const SPACE_ID = process.env.NEXT_PUBLIC_CONTENTFUL_SPACE_ID ?? ""
const ENVIRONMENT = process.env.NEXT_PUBLIC_CONTENTFUL_ENVIRONMENT_ID ?? "master"
const PREVIEW_TOKEN = process.env.NEXT_PUBLIC_CONTENTFUL_PREVIEW_ACCESS_TOKEN ?? ""
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")

// ── CDA helpers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

/** Read a locale-keyed CDA field value, handling both `{ "en-US": v }` and flat `v`. */
function locVal<T>(field: unknown, locale = "en-US"): T | undefined {
  if (field == null) return undefined
  if (typeof field === "object" && !Array.isArray(field) && locale in (field as object)) {
    return (field as AnyRecord)[locale] as T
  }
  return field as T
}

async function cdaFetch(path: string) {
  const sep = path.includes("?") ? "&" : "?"
  const url = `https://preview.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT}${path}${sep}access_token=${PREVIEW_TOKEN}`
  const resp = await fetch(url, { cache: "no-store" })
  if (!resp.ok) throw new Error(`CDA ${resp.status}: ${resp.statusText} (${path})`)
  return resp.json()
}

// ── XML builder ───────────────────────────────────────────────────────────────

function buildXml(entries: Array<{ url: string; lastmod: string }>): string {
  if (entries.length === 0) {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      `  <!-- No entries found for the selected content types -->`,
      `</urlset>`,
    ].join("\n")
  }
  const urls = entries
    .map(({ url, lastmod }) =>
      `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
    )
    .join("\n")
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    urls,
    `</urlset>`,
  ].join("\n")
}

async function fetchEntriesForCTs(contentTypes: string[]): Promise<Array<{ url: string; lastmod: string }>> {
  const results: Array<{ url: string; lastmod: string }> = []
  for (const ctId of contentTypes) {
    let skip = 0
    while (true) {
      const data = await cdaFetch(`/entries?content_type=${ctId}&limit=1000&skip=${skip}`)
      const items: AnyRecord[] = data.items ?? []
      for (const item of items) {
        const slug = locVal<string>(item.fields?.slug)
        if (!slug) continue
        const lastmod = (item.sys?.updatedAt as string | undefined)?.split("T")[0] ?? new Date().toISOString().split("T")[0]
        const fullUrl = BASE_URL ? `${BASE_URL}/${slug}` : `/${slug}`
        results.push({ url: fullUrl, lastmod })
      }
      if (items.length < 1000) break
      skip += 1000
      if (skip >= 10_000) break // safety cap
    }
  }
  return results
}

// ── Page component ────────────────────────────────────────────────────────────

export default function SitemapPreviewPage({
  params,
}: {
  params: Promise<{ entryId: string }>
}) {
  const { entryId } = use(params)

  // Raw CDA entry — used as the live-preview subscription anchor
  const [cdaEntry, setCdaEntry] = useState<AnyRecord | null>(null)
  // Current content types (updated live)
  const [contentTypes, setContentTypes] = useState<string[]>([])
  const [slug, setSlug] = useState<string>("")
  const [xmlContent, setXmlContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const regenerateXml = useCallback(async (cts: string[]) => {
    setRefreshing(true)
    try {
      const entries = await fetchEntriesForCTs(cts)
      setXmlContent(buildXml(entries))
      setLastUpdated(new Date())
    } catch (e) {
      console.error("Failed to regenerate XML:", e)
    } finally {
      setRefreshing(false)
    }
  }, [])

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        if (!SPACE_ID || !PREVIEW_TOKEN) {
          throw new Error(
            "Missing env vars: NEXT_PUBLIC_CONTENTFUL_SPACE_ID and NEXT_PUBLIC_CONTENTFUL_PREVIEW_ACCESS_TOKEN are required."
          )
        }

        // Initialize the live preview SDK (must run client-side)
        ContentfulLivePreview.init({
          locale: "en-US",
          debugMode: false,
          enableLiveUpdates: true,
          enableInspectorMode: false,
        })

        // Fetch the sitemap entry from the CDA preview API
        const entry = await cdaFetch(`/entries/${entryId}`)
        setCdaEntry(entry)

        const cts = locVal<string[]>(entry.fields?.contentTypes) ?? []
        const entrySlug = locVal<string>(entry.fields?.slug) ?? ""

        setContentTypes(cts)
        setSlug(entrySlug)
        await regenerateXml(cts)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId])

  // ── Live preview subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!cdaEntry) return

    const unsub = ContentfulLivePreview.subscribe({
      data: cdaEntry,
      locale: "en-US",
      callback: async (updatedEntry: AnyRecord) => {
        const newCts = locVal<string[]>(updatedEntry.fields?.contentTypes) ?? contentTypes
        const newSlug = locVal<string>(updatedEntry.fields?.slug) ?? slug

        const ctsChanged = JSON.stringify(newCts) !== JSON.stringify(contentTypes)

        setContentTypes(newCts)
        setSlug(newSlug)

        if (ctsChanged) {
          await regenerateXml(newCts)
        }
      },
    })

    return () => unsub()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdaEntry])

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={{ color: "#888" }}>Loading preview…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.page}>
        <p style={{ color: "#f77" }}>
          <strong>Preview error:</strong> {error}
        </p>
        <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
          Required env vars: NEXT_PUBLIC_CONTENTFUL_SPACE_ID,
          NEXT_PUBLIC_CONTENTFUL_ENVIRONMENT_ID (default: master),
          NEXT_PUBLIC_CONTENTFUL_PREVIEW_ACCESS_TOKEN,
          NEXT_PUBLIC_BASE_URL
        </p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Header bar */}
      <div style={styles.header}>
        <span style={{ color: "#ccc", fontWeight: "bold" }}>Live XML Preview</span>
        {slug && (
          <>
            {" — "}
            <span style={{ color: "#9cdcfe" }}>{slug}.xml</span>
          </>
        )}
        {contentTypes.length > 0 && (
          <>
            {" · "}
            <span style={{ color: "#ce9178" }}>{contentTypes.join(", ")}</span>
          </>
        )}
        {refreshing && <span style={{ color: "#ffa" }}> · Refreshing…</span>}
        {!refreshing && lastUpdated && (
          <span style={{ color: "#666" }}> · {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {/* XML output */}
      <pre style={styles.pre}>{xmlContent}</pre>
    </div>
  )
}

const styles = {
  page: {
    fontFamily: "monospace",
    padding: 24,
    background: "#1e1e1e",
    minHeight: "100vh",
    color: "#d4d4d4",
  } as React.CSSProperties,
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #333",
    fontSize: 12,
    color: "#888",
  } as React.CSSProperties,
  pre: {
    margin: 0,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
    fontSize: 13,
    lineHeight: 1.6,
  } as React.CSSProperties,
}
