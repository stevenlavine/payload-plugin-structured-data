import { DEFAULT_FIELDS, documentTypesFor, EVENT_TYPE, GROUP_NAME, PRODUCT_TYPE } from '../constants.js'
import type { BuildResult, Doc, DocumentType, JsonLdNode, ListInput, ResolvedOptions, ReviewsInput, Settings } from '../types.js'
import { breadcrumbTrail, buildBreadcrumbList } from './breadcrumbs.js'
import { buildEventNodes } from './events.js'
import { buildFaqPage } from './faq.js'
import { buildItemList } from './itemList.js'
import { buildPageNode } from './pageNodes.js'
import { buildProductNodes } from './products.js'
import { buildOrganization, buildWebSite } from './siteNodes.js'
import { absoluteUrl, readText } from './values.js'

export type BuildInput = {
  options: ResolvedOptions
  settings: Settings | null
  collection?: string
  doc?: Doc
  list?: ListInput
  /** The currency a product page shows. Default shop.currency */
  currency?: string
  /** Ratings and reviews for a product page, supplied by the site */
  reviews?: ReviewsInput
}

export function buildStructuredData({ options, settings, collection, doc, list, currency, reviews }: BuildInput): BuildResult {
  const warnings: string[] = []
  const nodes: JsonLdNode[] = []
  if (options.disabled) return { graph: null, warnings }

  let ref = 'site'
  try {
    const organization = buildOrganization(settings, options, warnings)
    if (organization) nodes.push(organization)
    const website = buildWebSite(settings, options, Boolean(organization))
    if (website) nodes.push(website)

    if (collection && doc) {
      ref = `${collection}/${doc.id ?? '?'}`
      const config = Object.hasOwn(options.collections, collection) ? options.collections[collection] : undefined
      const overrides = (doc[GROUP_NAME] ?? {}) as { type?: unknown; disabled?: unknown }

      if (!config) {
        warnings.push(`${collection}: not configured in structuredDataPlugin`)
      } else if (overrides.disabled !== true) {
        const allowed = documentTypesFor(config)
        const stored = allowed.find((t) => t === overrides.type)
        const type: DocumentType | null = stored ?? (typeof config.type === 'function' ? config.type(doc) : config.type)
        const path = config.path(doc)
        const url = absoluteUrl(options.siteUrl, path)

        if (type === EVENT_TYPE && !allowed.includes(type)) {
          warnings.push(`${ref}: ${type} skipped, this collection does not allow it (set type: '${type}' or an event block)`)
        } else if (type === EVENT_TYPE) {
          nodes.push(...buildEventNodes({ doc, url, ref, config, options, hasOrganization: Boolean(organization) }, warnings))
        } else if (type === PRODUCT_TYPE && !allowed.includes(type)) {
          warnings.push(`${ref}: ${type} skipped, this collection does not allow it (set type: '${type}' or a product block)`)
        } else if (type === PRODUCT_TYPE) {
          const hasOrganization = Boolean(organization)
          const product = buildProductNodes({ doc, url, ref, config, options, settings, currency, reviews, hasOrganization }, warnings)
          if (product.length) {
            nodes.push(...product)
          } else {
            // No usable product: the page still gets a plain WebPage
            const page = buildPageNode({ type: 'WebPage', doc, url, ref, fields: config.fields, options, settings, hasOrganization }, warnings)
            if (page) nodes.push(page)
          }
        } else if (type) {
          const page = buildPageNode(
            { type, doc, url, ref, fields: config.fields, options, settings, hasOrganization: Boolean(organization) },
            warnings,
          )
          if (page) nodes.push(page)
        }

        if (config.faq) {
          const faq = buildFaqPage(doc, config.faq, url)
          if (faq) nodes.push(faq)
        }

        if (path !== '/') {
          const headline = readText(doc, config.fields?.headline ?? [DEFAULT_FIELDS.headline])
          const trail = breadcrumbTrail(doc, path, headline, config.breadcrumbs)
          const breadcrumbs = buildBreadcrumbList(options.siteUrl, trail, url)
          if (breadcrumbs) nodes.push(breadcrumbs)
        }
      }
    }

    if (list) {
      ref = 'list'
      const itemList = buildItemList(list, options.siteUrl, warnings)
      if (itemList) nodes.push(itemList)
    }
  } catch (error) {
    warnings.push(`${ref}: structured data failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    graph: nodes.length ? { '@context': 'https://schema.org', '@graph': nodes } : null,
    warnings,
  }
}
