"use client"

import { useEffect } from "react"
import { init } from "@fullstory/browser"

export function FullStoryInit() {
  useEffect(() => {
    init({ orgId: "o-1KAFER-na1" })
  }, [])

  return null
}
