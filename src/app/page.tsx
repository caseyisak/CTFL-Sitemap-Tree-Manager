"use client"

import dynamic from "next/dynamic"

const AppWithSDK = dynamic(
  () => import("@/components/app-with-sdk").then((m) => ({ default: m.AppWithSDK })),
  { ssr: false }
)

export default function RootPage() {
  return <AppWithSDK />
}
