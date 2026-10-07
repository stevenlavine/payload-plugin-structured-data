import type { CollectionSlug, SanitizedConfig } from 'payload'
import { getPayload } from 'payload'
import React from 'react'
import { buildStructuredData } from '../build/buildStructuredData.js'
import { serializeJsonLd } from '../build/serialize.js'
import { getPluginOptions } from '../plugin.js'
import { getSettings, logWarnings } from './getSettings.js'

export type StructuredDataProps = {
  config: SanitizedConfig | Promise<SanitizedConfig>
  collection?: CollectionSlug
  doc?: Record<string, unknown>
}

/** Writes one <script type="application/ld+json"> for the page. Never throws. */
export async function StructuredData({ config, collection, doc }: StructuredDataProps) {
  try {
    const payload = await getPayload({ config })
    const options = getPluginOptions(payload.config)
    if (!options) {
      logWarnings(['structuredDataPlugin is not in the Payload config'])
      return null
    }
    const settings = await getSettings(payload)
    const { graph, warnings } = buildStructuredData({ options, settings, collection, doc: doc ?? undefined })
    logWarnings(warnings)
    if (!graph) return null
    return (
      <script
        type="application/ld+json"
        // JSON-LD must be raw script content; serializeJsonLd escapes every '<'
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
      />
    )
  } catch (error) {
    logWarnings([`render failed: ${error instanceof Error ? error.message : String(error)}`])
    return null
  }
}
