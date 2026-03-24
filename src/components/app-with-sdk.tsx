"use client"

import { useEffect } from "react"
import { SDKProvider, useSDK } from "@contentful/react-apps-toolkit"
import { locations } from "@contentful/app-sdk"
import type { KnownSDK, PageAppSDK } from "@contentful/app-sdk"
import posthog from "posthog-js"
import { AppConfigScreen } from "@/components/locations/app-config-screen"
import { EntryFieldLocation } from "@/components/locations/entry-field-location"
import { EntryEditorLocation } from "@/components/locations/entry-editor-location"

function PageLocation() {
  const sdk = useSDK<PageAppSDK>()

  useEffect(() => {
    sdk.navigator.openAppConfig()
  }, [sdk])

  return null
}

function LocationRouter() {
  const sdk = useSDK<KnownSDK>()

  useEffect(() => {
    const user = sdk.user
    const userId = user.sys.id
    posthog.identify(userId, {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
    })

    const location = sdk.location.is(locations.LOCATION_APP_CONFIG)
      ? "app-config"
      : sdk.location.is(locations.LOCATION_ENTRY_EDITOR)
        ? "entry-editor"
        : sdk.location.is(locations.LOCATION_ENTRY_FIELD)
          ? "entry-field"
          : sdk.location.is(locations.LOCATION_PAGE)
            ? "page"
            : "unknown"

    posthog.capture("app_location_opened", { location })
  }, [sdk])

  if (sdk.location.is(locations.LOCATION_APP_CONFIG)) return <AppConfigScreen />
  if (sdk.location.is(locations.LOCATION_PAGE)) return <PageLocation />
  if (sdk.location.is(locations.LOCATION_ENTRY_FIELD)) return <EntryFieldLocation />
  if (sdk.location.is(locations.LOCATION_ENTRY_EDITOR)) return <EntryEditorLocation />

  return (
    <div className="p-8 text-center text-[var(--cf-gray-500)]">
      Open this app within Contentful.
    </div>
  )
}

const SEQUENCE = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
]

function useKonamiCode() {
  useEffect(() => {
    let index = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === SEQUENCE[index]) {
        index++
        if (index === SEQUENCE.length) {
          console.log(`
  ██╗  ██╗ █████╗ ███████╗
  ██║ ██╔╝██╔══██╗╚══███╔╝
  █████╔╝ ███████║  ███╔╝
  ██╔═██╗ ██╔══██║ ███╔╝
  ██║  ██╗██║  ██║███████╗
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

  Built with ♥ by Kaz
`)
          index = 0
        }
      } else {
        index = e.key === SEQUENCE[0] ? 1 : 0
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

export function AppWithSDK() {
  useKonamiCode()
  return (
    <SDKProvider>
      <LocationRouter />
    </SDKProvider>
  )
}
