import type { CollectionSlug, SanitizedConfig } from 'payload'
import { getPayload } from 'payload'
import React from 'react'
import { buildStructuredData } from '../build/buildStructuredData.js'
import { serializeJsonLd } from '../build/serialize.js'
import { getPluginOptions } from '../plugin.js'
import type { Doc, ListInput, ReviewsInput } from '../types.js'
import { logWarnings } from '../log.js'
import { getSettings } from './getSettings.js'

export type StructuredDataProps = {
  config: SanitizedConfig | Promise<SanitizedConfig>
  collection?: CollectionSlug
  /** Any Payload document, including generated interfaces such as `Post`. */
  doc?: object | null
  /** A listings page: its path, optional name and the rows to list. Pass the rows in; nothing is queried. */
  list?: ListInput
  /** Product pages: the ISO 4217 currency this URL shows, e.g. 'GBP'. Default shop.currency */
  currency?: string
  /** Product pages: ratings and reviews you supply. Nothing is computed or queried */
  reviews?: ReviewsInput
}

/** Writes one <script type="application/ld+json"> for the page. Never throws. */
export async function StructuredData({ config, collection, doc, list, currency, reviews }: StructuredDataProps) {
  try {
    const payload = await getPayload({ config })
    const options = getPluginOptions(payload.config)
    if (!options) {
      logWarnings(['structuredDataPlugin is not in the Payload config'])
      return null
    }
    const settings = await getSettings(payload)
    const { graph, warnings } = buildStructuredData({
      options,
      settings,
      collection,
      doc: (doc ?? undefined) as Doc | undefined,
      list,
      currency,
      reviews,
    })
    logWarnings(warnings)
    if (!graph) {return null}
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
