"use client"

import { useEffect } from "react"
import posthog from "posthog-js"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"

export function PostHogInit() {
  useEffect(() => {
    if (!POSTHOG_KEY) return

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      autocapture: true,
    })

    // Fire named events for every data-fs-id click
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-fs-id]")
      if (!target) return
      const id = (target as HTMLElement).dataset.fsId
      if (id) posthog.capture(id)
    }

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  return null
}
