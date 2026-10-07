import type { Config } from 'payload'
import { CUSTOM_KEY } from './constants.js'
import { settingsGlobal } from './fields/settingsGlobal.js'
import { sidebarGroup } from './fields/sidebarGroup.js'
import type { ResolvedOptions, StructuredDataPluginOptions } from './types.js'

export const structuredDataPlugin =
  (options: StructuredDataPluginOptions) =>
  (config: Config): Config => {
    if (!options.siteUrl?.trim()) {
      throw new Error('structuredDataPlugin: siteUrl is required (e.g. process.env.NEXT_PUBLIC_SERVER_URL)')
    }
    const resolved: ResolvedOptions = { ...options, siteUrl: options.siteUrl.trim().replace(/\/+$/, '') }

    const collections = (config.collections ?? []).map((collection) => {
      if (!(collection.slug in resolved.collections)) return collection
      return { ...collection, fields: [...collection.fields, sidebarGroup()] }
    })

    for (const slug of Object.keys(resolved.collections)) {
      if (!collections.some((c) => c.slug === slug)) {
        throw new Error(`structuredDataPlugin: collection "${slug}" not found in the Payload config`)
      }
    }

    return {
      ...config,
      collections,
      globals: [...(config.globals ?? []), settingsGlobal(resolved)],
      custom: { ...config.custom, [CUSTOM_KEY]: resolved },
    }
  }

export function getPluginOptions(config: { custom?: Record<string, unknown> }): ResolvedOptions | null {
  return (config.custom?.[CUSTOM_KEY] as ResolvedOptions | undefined) ?? null
}
