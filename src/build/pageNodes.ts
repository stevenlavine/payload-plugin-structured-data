import type { ArticleLeaf, ServiceLeaf, WebPageLeaf } from 'schema-dts'
import { DEFAULT_FIELDS } from '../constants.js'
import type { CollectionOptions, Doc, FieldPath, JsonLdNode, PageField, PageType, ResolvedOptions, Settings } from '../types.js'
import { compact, organizationId, websiteId } from './siteNodes.js'
import { mediaUrl, readFirst, readText } from './values.js'

export type PageNodeInput = {
  type: PageType
  doc: Doc
  /** Absolute page URL */
  url: string
  /** e.g. 'posts/123', used in warnings */
  ref: string
  fields?: CollectionOptions['fields']
  options: ResolvedOptions
  settings: Settings | null
  hasOrganization: boolean
}

const firstPath = (path: FieldPath) => (Array.isArray(path) ? path[0] : path)

function authorOf(value: unknown, orgRef: { '@id': string } | undefined) {
  if (Array.isArray(value)) {
    const people = value
      .map((a) => (a && typeof a === 'object' ? readText(a, 'name') : undefined))
      .filter((n): n is string => Boolean(n))
      .map((name) => ({ '@type': 'Person' as const, name }))
    if (people.length) return people
  }
  if (typeof value === 'string' && value.trim()) return { '@type': 'Person' as const, name: value.trim() }
  return orgRef
}

export function buildPageNode(input: PageNodeInput, warnings: string[]): JsonLdNode | null {
  const { type, doc, url, ref, options, settings, hasOrganization } = input
  const path = (field: PageField): FieldPath => input.fields?.[field] ?? [...[DEFAULT_FIELDS[field]].flat()]

  const headline = readText(doc, path('headline'))
  if (!headline) {
    warnings.push(`${ref}: ${type} skipped, no headline (field "${firstPath(path('headline'))}" is empty)`)
    return null
  }

  const orgRef = hasOrganization ? { '@id': organizationId(options.siteUrl) } : undefined
  const description = readText(doc, path('description'))
  const image = mediaUrl(options.siteUrl, readFirst(doc, path('image')), options.imageSize)
  const datePublished = readText(doc, path('datePublished'))
  const dateModified = readText(doc, path('dateModified'))

  // Typed object literals: a misspelt property name fails typecheck (excess property check).
  // BlogPosting adds no properties to Article, so both use ArticleLeaf.
  if (type === 'Article' || type === 'BlogPosting') {
    const props: Omit<Partial<ArticleLeaf>, '@type' | '@id'> = {
      headline,
      description,
      image,
      datePublished,
      dateModified,
      author: authorOf(readFirst(doc, path('author')), orgRef),
      publisher: orgRef,
      mainEntityOfPage: url,
    }
    return compact({ '@type': type, '@id': `${url}#article`, ...props })
  }

  if (type === 'Service') {
    const areas = (settings?.areaServed ?? []).map((a) => a.name?.trim()).filter((n): n is string => Boolean(n))
    const props: Omit<Partial<ServiceLeaf>, '@type' | '@id'> = {
      name: headline,
      serviceType: headline,
      description,
      url,
      provider: orgRef,
      areaServed: areas.length ? areas : undefined,
    }
    return compact({ '@type': 'Service', '@id': `${url}#service`, ...props })
  }

  const props: Omit<Partial<WebPageLeaf>, '@type' | '@id'> = {
    name: headline,
    description,
    url,
    isPartOf: settings?.name?.trim() ? { '@id': websiteId(options.siteUrl) } : undefined,
    datePublished,
    dateModified,
  }
  // schema-dts types primaryImageOfPage as ImageObject only; a plain image URL is accepted by Google, so it sits outside the typed literal
  return compact({ '@type': 'WebPage', '@id': `${url}#webpage`, ...props, primaryImageOfPage: image })
}
