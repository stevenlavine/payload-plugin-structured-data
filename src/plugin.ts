import type { Config, Field } from 'payload'
import { CUSTOM_KEY, documentTypesFor, GROUP_NAME } from './constants.js'
import { discoverCurrencies } from './currencies.js'
import { settingsGlobal } from './fields/settingsGlobal.js'
import { sidebarGroup } from './fields/sidebarGroup.js'
import type { ResolvedOptions, ShopOptions, StructuredDataPluginOptions } from './types.js'

function resolveShop(shop: ShopOptions, config: Config): NonNullable<ResolvedOptions['shop']> {
  const currencies = (shop.currencies ?? []).map((c) => ({ ...c, code: c.code.toUpperCase() }))
  for (const found of discoverCurrencies(config.collections ?? [])) {
    if (!currencies.some((c) => c.code === found.code)) currencies.push(found)
  }
  const currency = shop.currency?.trim().toUpperCase()
  return { ...(currency ? { currency } : {}), currencies }
}

// Rows, collapsibles and unnamed tabs store their children at the top level of the document, so a
// clash inside them is a real clash. Named groups and named tabs nest their data, so they are skipped.
function hasTopLevelField(fields: Field[], name: string): boolean {
  return fields.some((field) => {
    if ('name' in field && field.name === name) return true
    if (field.type === 'row' || field.type === 'collapsible') return hasTopLevelField(field.fields, name)
    if (field.type === 'tabs') {
      return field.tabs.some((tab) => !('name' in tab && tab.name) && hasTopLevelField(tab.fields, name))
    }
    return false
  })
}

export const structuredDataPlugin =
  (options: StructuredDataPluginOptions) =>
  (config: Config): Config => {
    if (!options.siteUrl?.trim()) {
      throw new Error('structuredDataPlugin: siteUrl is required (e.g. process.env.NEXT_PUBLIC_SERVER_URL)')
    }
    const urlTemplate = options.search?.urlTemplate?.trim()
    const { search: _search, shop, ...rest } = options
    const resolved: ResolvedOptions = {
      ...rest,
      siteUrl: options.siteUrl.trim().replace(/\/+$/, ''),
      ...(urlTemplate ? { search: { urlTemplate } } : {}),
      ...(shop ? { shop: resolveShop(shop, config) } : {}),
    }

    const collections = (config.collections ?? []).map((collection) => {
      if (!Object.hasOwn(resolved.collections, collection.slug)) return collection
      const collectionOptions = resolved.collections[collection.slug]
      if (hasTopLevelField(collection.fields, GROUP_NAME)) {
        throw new Error(`structuredDataPlugin: collection "${collection.slug}" already has a field named "${GROUP_NAME}"`)
      }
      return { ...collection, fields: [...collection.fields, sidebarGroup(collectionOptions ? documentTypesFor(collectionOptions) : undefined)] }
    })

    for (const slug of Object.keys(resolved.collections)) {
      if (!collections.some((c) => c.slug === slug)) {
        throw new Error(
          `structuredDataPlugin: collection "${slug}" not found in the Payload config; if another plugin (such as ecommercePlugin) adds this collection, list structuredDataPlugin after it`,
        )
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
