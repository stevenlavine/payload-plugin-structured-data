import type { BreadcrumbItem, Doc, JsonLdNode } from '../types.js'
import { absoluteUrl, readText } from './values.js'

const HOME: BreadcrumbItem = { name: 'Home', path: '/' }

export function breadcrumbTrail(
  doc: Doc,
  path: string,
  headline: string | undefined,
  custom?: (doc: Doc) => BreadcrumbItem[],
): BreadcrumbItem[] {
  if (custom) return custom(doc)

  const nested = Array.isArray(doc.breadcrumbs)
    ? doc.breadcrumbs
        .map((crumb) => ({ name: readText(crumb, 'label'), path: readText(crumb, 'url') }))
        .filter((c): c is BreadcrumbItem => Boolean(c.name && c.path))
    : []
  if (nested.length) return [HOME, ...nested]

  return headline ? [HOME, { name: headline, path }] : [HOME]
}

export function buildBreadcrumbList(siteUrl: string, items: BreadcrumbItem[], url: string): JsonLdNode | null {
  if (items.length < 2) return null
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(siteUrl, item.path),
    })),
  }
}
