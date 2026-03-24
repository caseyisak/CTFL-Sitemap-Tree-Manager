import { chromium } from "playwright"

const TARGET = "https://app.contentful.com/spaces/uumzxfocy3ef/entries/6yuInMRWMJc5kKiFtW4gea"

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

const analyticsRequests = []
page.on("request", (req) => {
  const url = req.url()
  if (url.includes("posthog") || url.includes("fullstory")) {
    analyticsRequests.push({ type: "request", url: url.slice(0, 100) })
  }
})
page.on("response", (res) => {
  const url = res.url()
  if (url.includes("posthog") || url.includes("fullstory")) {
    analyticsRequests.push({ type: "response", url: url.slice(0, 100), status: res.status() })
  }
})
page.on("requestfailed", (req) => {
  const url = req.url()
  if (url.includes("posthog") || url.includes("fullstory")) {
    analyticsRequests.push({ type: "BLOCKED", url: url.slice(0, 100), reason: req.failure()?.errorText })
  }
})

await page.goto(TARGET)
console.log("🔐 Log in to Contentful if needed...")
await page.waitForURL(/entries\/6yuInMRWMJc5kKiFtW4gea/, { timeout: 120_000 })
console.log("✅ On entry page — waiting 20s...")
await page.waitForTimeout(20_000)

function getAllFrames(frame) {
  return [frame, ...frame.childFrames().flatMap(getAllFrames)]
}
for (const frame of getAllFrames(page.mainFrame())) {
  const url = frame.url()
  if (!url.includes("ctfl-sitemap-tree-manager.vercel.app") && !url.includes("localhost:5000")) continue
  console.log(`\n🎯 App iframe: ${url}`)
  try {
    const result = await frame.evaluate(() => ({
      postHogDefined: typeof window.posthog !== "undefined",
      postHogDistinctId: typeof window.posthog !== "undefined" ? window.posthog.get_distinct_id?.() : null,
      fsDefined: typeof window.FS !== "undefined",
      fsSessionURL: typeof window.FS !== "undefined" ? window.FS.getCurrentSessionURL() : null,
    }))
    console.log("📊 Analytics status:", JSON.stringify(result, null, 2))
  } catch (e) {
    console.log("  ⚠️ Could not evaluate frame:", e.message)
  }
}

console.log("\n🌐 Analytics network requests:")
if (analyticsRequests.length === 0) {
  console.log("  ❌ No analytics requests detected")
} else {
  for (const r of analyticsRequests) {
    const icon = r.type === "BLOCKED" ? "❌" : r.status >= 400 ? "⚠️" : "✅"
    console.log(`  ${icon} [${r.type}] ${r.url} ${r.status ?? r.reason ?? ""}`)
  }
}

console.log("\n✅ Done. Closing.")
await browser.close()
