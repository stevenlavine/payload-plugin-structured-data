import { describe, expect, it } from 'vitest'

import type { Doc } from './types.js'

import { categoryBreadcrumbs } from './categoryBreadcrumbs.js'

const path = (category: Doc) => `/shop/${String(category.slug)}`
const productPath = (doc: Doc) => `/product/${String(doc.slug)}`
const HOME = { name: 'Home', path: '/' }
const product = (extra: Doc): Doc => ({ slug: 'lamp', title: 'Lamp', ...extra })

describe('categoryBreadcrumbs', () => {
  const crumbs = categoryBreadcrumbs({ path, productPath })

  it('uses the nested-docs breadcrumbs array on the first category', () => {
    const doc = product({
      categories: [
        {
          slug: 'b',
          title: 'B',
          breadcrumbs: [
            { label: 'A', url: '/shop/a' },
            { label: 'B', url: '/shop/a/b' },
          ],
        },
        { slug: 'other', title: 'Other' },
      ],
    })
    expect(crumbs(doc)).toEqual([
      HOME,
      { name: 'A', path: '/shop/a' },
      { name: 'B', path: '/shop/a/b' },
      { name: 'Lamp', path: '/product/lamp' },
    ])
  })

  it('walks a populated parent chain, root first', () => {
    const doc = product({
      categories: [{ slug: 'c', title: 'C', parent: { slug: 'b', title: 'B', parent: { slug: 'a', title: 'A' } } }],
    })
    expect(crumbs(doc)).toEqual([
      HOME,
      { name: 'A', path: '/shop/a' },
      { name: 'B', path: '/shop/b' },
      { name: 'C', path: '/shop/c' },
      { name: 'Lamp', path: '/product/lamp' },
    ])
  })

  it('stops at a repeat and after 10 levels', () => {
    const loop: Doc = { id: 1, slug: 'a', title: 'A' }
    loop.parent = { id: 2, slug: 'b', title: 'B', parent: loop }
    expect(crumbs(product({ categories: [loop] })).map((c) => c.name)).toEqual(['Home', 'B', 'A', 'Lamp'])

    let deep: Doc = { id: 0, slug: 'c0', title: 'C0' }
    for (let i = 1; i < 15; i++) {deep = { id: i, slug: `c${i}`, title: `C${i}`, parent: deep }}
    const names = crumbs(product({ categories: [deep] })).map((c) => c.name)
    expect(names).toHaveLength(12)
    expect(names[1]).toBe('C5')
    expect(names[10]).toBe('C14')
  })

  it('a category that is only an ID, or no category: Home and the product', () => {
    const expected = [HOME, { name: 'Lamp', path: '/product/lamp' }]
    expect(crumbs(product({ categories: [12] }))).toEqual(expected)
    expect(crumbs(product({}))).toEqual(expected)
    expect(crumbs(product({ categories: [] }))).toEqual(expected)
  })

  it('honours custom field and name options', () => {
    const custom = categoryBreadcrumbs({
      categoryName: 'label',
      field: 'collections',
      name: 'name',
      path,
      productPath,
    })
    expect(custom({ name: 'Table lamp', collections: [{ slug: 'x', label: 'X' }], slug: 'lamp' })).toEqual([
      HOME,
      { name: 'X', path: '/shop/x' },
      { name: 'Table lamp', path: '/product/lamp' },
    ])
  })

  it('a throwing path function gives Home and the product, and no throw', () => {
    const bad = categoryBreadcrumbs({
      path: () => {
        throw new Error('nope')
      },
      productPath,
    })
    expect(bad(product({ categories: [{ slug: 'a', title: 'A' }] }))).toEqual([
      HOME,
      { name: 'Lamp', path: '/product/lamp' },
    ])
  })

  it('ends the trail at the last category when the product has no name', () => {
    expect(crumbs({ categories: [{ slug: 'a', title: 'A' }], slug: 'lamp' })).toEqual([
      HOME,
      { name: 'A', path: '/shop/a' },
    ])
  })
})
