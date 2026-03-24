import { chromium } from "playwright"

const TARGET = "https://app.contentful.com/spaces/uumzxfocy3ef/entries/6yuInMRWMJc5kKiFtW4gea"

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

// Track all FullStory-related network activity
const fsRequests = []
page.on("request", (req) => {
  if (req.url().includes("fullstory") || req.url().includes("rs.fullstory")) {
    fsRequests.push({ type: "request", url: req.url(), method: req.method() })
  }
})
page.on("response", (res) => {
  if (res.url().includes("fullstory") || res.url().includes("rs.fullstory")) {
    fsRequests.push({ type: "response", url: res.url(), status: res.status() })
  }
})
page.on("requestfailed", (req) => {
  if (req.url().includes("fullstory") || req.url().includes("rs.fullstory")) {
    fsRequests.push({ type: "BLOCKED/FAILED", url: req.url(), reason: req.failure()?.errorText })
  }
})

await page.goto(TARGET)
console.log("🔐 Log in to Contentful if needed...")

await page.waitForURL(/entries\/6yuInMRWMJc5kKiFtW4gea/, { timeout: 120_000 })
console.log("✅ On entry page — waiting 20s for FS to fully initialize...")
await page.waitForTimeout(20_000)

// Check all frames for FS status
function getAllFrames(frame) {
  return [frame, ...frame.childFrames().flatMap(getAllFrames)]
}
for (const frame of getAllFrames(page.mainFrame())) {
  const url = frame.url()
  if (!url.includes("ctfl-sitemap-tree-manager.vercel.app") && !url.includes("localhost:5000")) continue
  console.log(`\n🎯 App iframe: ${url}`)
  try {
    const result = await frame.evaluate(() => ({
      FSDefined: typeof window.FS !== "undefined",
      sessionURL: typeof window.FS !== "undefined" ? window.FS.getCurrentSessionURL() : null,
      sessionURLNow: typeof window.FS !== "undefined" ? window.FS.getCurrentSessionURL(true) : null,
      fsScriptLoaded: !!document.querySelector('script[src*="fullstory"]'),
    }))
    console.log("📊 FullStory status:", JSON.stringify(result, null, 2))
  } catch (e) {
    console.log("  ⚠️ Could not evaluate frame:", e.message)
  }
}

// Network report
console.log("\n🌐 FullStory network requests:")
if (fsRequests.length === 0) {
  console.log("  ❌ No FullStory network requests detected — likely blocked by an extension or CSP")
} else {
  for (const r of fsRequests) {
    const icon = r.type === "BLOCKED/FAILED" ? "❌" : r.status >= 400 ? "⚠️" : "✅"
    console.log(`  ${icon} [${r.type}] ${r.url.slice(0, 80)} ${r.status ?? r.reason ?? ""}`)
  }
}

console.log("\n✅ Done. Closing browser.")
await browser.close()
