import type { Config } from 'payload'
import { CUSTOM_KEY, GROUP_NAME } from './constants.js'
import { settingsGlobal } from './fields/settingsGlobal.js'
import { sidebarGroup } from './fields/sidebarGroup.js'
import type { ResolvedOptions, StructuredDataPluginOptions } from './types.js'

export const structuredDataPlugin =
  (options: StructuredDataPluginOptions) =>
  (config: Config): Config => {
    if (!options.siteUrl?.trim()) {
      throw new Error('structuredDataPlugin: siteUrl is required (e.g. process.env.NEXT_PUBLIC_SERVER_URL)')
    }
    const urlTemplate = options.search?.urlTemplate?.trim()
    const { search: _search, ...rest } = options
    const resolved: ResolvedOptions = {
      ...rest,
      siteUrl: options.siteUrl.trim().replace(/\/+$/, ''),
      ...(urlTemplate ? { search: { urlTemplate } } : {}),
    }

    const collections = (config.collections ?? []).map((collection) => {
      if (!Object.hasOwn(resolved.collections, collection.slug)) return collection
      if (collection.fields.some((field) => 'name' in field && field.name === GROUP_NAME)) {
        throw new Error(`structuredDataPlugin: collection "${collection.slug}" already has a field named "${GROUP_NAME}"`)
      }
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
