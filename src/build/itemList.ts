import type { JsonLdNode, ListInput } from '../types.js'
import { absoluteUrl, readText } from './values.js'

/** A generic ItemList for a listings page. The site passes the rows in; no queries run here. */
export function buildItemList(list: ListInput, siteUrl: string, warnings: string[]): JsonLdNode | null {
  const path = readText(list, 'path')
  const rows: unknown = (list as { items?: unknown } | null | undefined)?.items
  if (!path || !Array.isArray(rows) || rows.length === 0) {return null}

  const elements: JsonLdNode[] = []
  rows.forEach((row, index) => {
    const name = readText(row, 'name')
    const itemPath = readText(row, 'path')
    if (!name || !itemPath) {
      warnings.push(`list ${path}: item ${index + 1} skipped, it needs a name and a path`)
      return
    }
    elements.push({
      '@type': 'ListItem',
      position: elements.length + 1,
      name,
      item: absoluteUrl(siteUrl, itemPath),
    })
  })
  if (!elements.length) {return null}

  const name = readText(list, 'name')
  return {
    '@type': 'ItemList',
    '@id': `${absoluteUrl(siteUrl, path)}#itemlist`,
    ...(name ? { name } : {}),
    itemListElement: elements,
  }
}
