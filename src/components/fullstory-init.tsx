"use client"

import { useEffect } from "react"
import { init } from "@fullstory/browser"

const ORG_ID = process.env.NEXT_PUBLIC_FULLSTORY_ORG_ID

export function FullStoryInit() {
  useEffect(() => {
    if (!ORG_ID) return
    init({ orgId: ORG_ID })
  }, [])

  return null
}
