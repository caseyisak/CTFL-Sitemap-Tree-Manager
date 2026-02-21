"use client"

import { SDKProvider, useSDK } from "@contentful/react-apps-toolkit"
import { locations } from "@contentful/app-sdk"
import type { KnownSDK } from "@contentful/app-sdk"
import { AppConfigScreen } from "@/components/locations/app-config-screen"
import { EntryFieldLocation } from "@/components/locations/entry-field-location"
import { EntryEditorLocation } from "@/components/locations/entry-editor-location"

function LocationRouter() {
  const sdk = useSDK<KnownSDK>()

  if (sdk.location.is(locations.LOCATION_APP_CONFIG)) return <AppConfigScreen />
  if (sdk.location.is(locations.LOCATION_ENTRY_FIELD)) return <EntryFieldLocation />
  if (sdk.location.is(locations.LOCATION_ENTRY_EDITOR)) return <EntryEditorLocation />

  return (
    <div className="p-8 text-center text-[var(--cf-gray-500)]">
      Open this app within Contentful.
    </div>
  )
}

export function AppWithSDK() {
  return (
    <SDKProvider>
      <LocationRouter />
    </SDKProvider>
  )
}
