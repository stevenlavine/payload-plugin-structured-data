import { DEFAULT_FIELDS, GROUP_NAME, PAGE_TYPES } from '../constants.js'
import type { BuildResult, Doc, JsonLdNode, PageType, ResolvedOptions, Settings } from '../types.js'
import { breadcrumbTrail, buildBreadcrumbList } from './breadcrumbs.js'
import { buildFaqPage } from './faq.js'
import { buildPageNode } from './pageNodes.js'
import { buildOrganization, buildWebSite } from './siteNodes.js'
import { absoluteUrl, readText } from './values.js'

export type BuildInput = {
  options: ResolvedOptions
  settings: Settings | null
  collection?: string
  doc?: Doc
}

const isPageType = (value: unknown): value is PageType =>
  typeof value === 'string' && (PAGE_TYPES as readonly string[]).includes(value)

export function buildStructuredData({ options, settings, collection, doc }: BuildInput): BuildResult {
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
        const type = isPageType(overrides.type)
          ? overrides.type
          : typeof config.type === 'function'
            ? config.type(doc)
            : config.type
        const path = config.path(doc)
        const url = absoluteUrl(options.siteUrl, path)

        if (type) {
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
  } catch (error) {
    warnings.push(`${ref}: structured data failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    graph: nodes.length ? { '@context': 'https://schema.org', '@graph': nodes } : null,
    warnings,
  }
}
