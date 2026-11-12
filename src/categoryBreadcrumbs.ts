import type { BreadcrumbItem, Doc, FieldPath } from './types.js'

import { readPath, readText } from './build/values.js'

const HOME: BreadcrumbItem = { name: 'Home', path: '/' }
const MAX_LEVELS = 10

const isDoc = (value: unknown): value is Doc => value !== null && typeof value === 'object' && !Array.isArray(value)

export type CategoryBreadcrumbsInput = {
  /** Field on the category that holds its name. Default `title` */
  categoryName?: FieldPath
  /** Field on the product that holds the categories. Default `categories` */
  field?: string
  /** Field on the product that holds its name. Default `title` */
  name?: FieldPath
  /** Public path of a category. Used for the parent chain and the single-category case, not for nested-docs entries */
  path: (category: Doc) => string
  /** Public path of the product. Required: the helper only receives the product document */
  productPath: (doc: Doc) => string
}

/**
 * Builds a `breadcrumbs` function for a collection: Home, the first category's trail, then the product.
 *
 * The first category is `doc[field][0]`; entries that are not objects (unpopulated IDs) are skipped.
 * - If the category has a nested-docs `breadcrumbs` array (`{ label, url }` entries), it is used as the trail,
 *   with `label` as the name and `url` as the path. `path` is not called.
 * - Otherwise a populated `parent` chain is walked (root first, stopping at a repeat or after 10 levels),
 *   and `path(category)` gives each path. With no parent this is the category alone.
 * A throwing `path` drops the category trail, leaving Home and the product. With no product name the trail
 * ends at the last category.
 */
export function categoryBreadcrumbs(input: CategoryBreadcrumbsInput): (doc: Doc) => BreadcrumbItem[] {
  const { categoryName = 'title', field = 'categories', name = 'title', path, productPath } = input

  const nestedTrail = (category: Doc): BreadcrumbItem[] => {
    if (!Array.isArray(category.breadcrumbs)) {return []}
    return category.breadcrumbs
      .map((crumb) => ({ name: readText(crumb, 'label'), path: readText(crumb, 'url') }))
      .filter((c): c is BreadcrumbItem => Boolean(c.name && c.path))
  }

  const parentTrail = (first: Doc): BreadcrumbItem[] => {
    const chain: Doc[] = []
    const seen = new Set<unknown>()
    let current: unknown = first
    while (isDoc(current) && chain.length < MAX_LEVELS) {
      const key = current.id ?? current
      if (seen.has(key)) {break}
      seen.add(key)
      chain.push(current)
      current = current.parent
    }
    const items: BreadcrumbItem[] = []
    for (const category of chain.reverse()) {
      const categoryLabel = readText(category, categoryName)
      const categoryPath = path(category)
      if (categoryLabel && categoryPath) {items.push({ name: categoryLabel, path: categoryPath })}
    }
    return items
  }

  return (doc) => {
    let categories: BreadcrumbItem[] = []
    try {
      const list = readPath(doc, field)
      const first = Array.isArray(list) ? list.find(isDoc) : undefined
      if (first) {
        const nested = nestedTrail(first)
        categories = nested.length ? nested : parentTrail(first)
      }
    } catch {
      categories = []
    }

    const trail = [HOME, ...categories]
    const productName = readText(doc, name)
    if (productName) {
      try {
        trail.push({ name: productName, path: productPath(doc) })
      } catch {
        // a bad product path leaves the trail at the last category
      }
    }
    return trail
  }
}
