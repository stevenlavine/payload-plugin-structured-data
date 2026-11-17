import { describe, expect, test } from 'vitest'
import type { ResolvedOptions } from '../types.js'
import { buildStructuredData } from './buildStructuredData.js'
import { buildItemList } from './itemList.js'

const site = 'https://example.com'

describe('buildItemList', () => {
  test('builds an ItemList with absolute urls', () => {
    const warnings: string[] = []
    const node = buildItemList(
      {
        path: '/events',
        name: 'What’s on',
        items: [
          { name: 'A', path: '/events/a' },
          { name: 'B', path: 'https://other.example/b' },
        ],
      },
      site,
      warnings,
    )
    expect(node).toEqual({
      '@type': 'ItemList',
      '@id': 'https://example.com/events#itemlist',
      name: 'What’s on',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'A', item: 'https://example.com/events/a' },
        { '@type': 'ListItem', position: 2, name: 'B', item: 'https://other.example/b' },
      ],
    })
    expect(warnings).toEqual([])
  })

  test('drops bad rows with a warning and keeps positions gapless', () => {
    const warnings: string[] = []
    const items = [
      { name: 'A', path: '/a' },
      { name: '', path: '/b' },
      { name: 'C' },
      null,
      'text',
      { name: 'D', path: '/d' },
    ] as unknown as { name: string; path: string }[]
    const node = buildItemList({ path: '/x', items }, site, warnings)
    const list = node?.itemListElement as { position: number; name: string }[]
    expect(list.map((i) => [i.position, i.name])).toEqual([
      [1, 'A'],
      [2, 'D'],
    ])
    expect(warnings).toHaveLength(4)
    expect(node).not.toHaveProperty('name')
  })

  test('returns null for an empty list, non-array items or no path', () => {
    const w: string[] = []
    expect(buildItemList({ path: '/x', items: [] }, site, w)).toBeNull()
    expect(buildItemList({ path: '/x', items: 42 as unknown as [] }, site, w)).toBeNull()
    expect(buildItemList({ items: [{ name: 'A', path: '/a' }] } as never, site, w)).toBeNull()
    expect(buildItemList(null as never, site, w)).toBeNull()
  })

  test('home path gives the site url with its slash in the id', () => {
    const node = buildItemList({ path: '/', items: [{ name: 'A', path: '/a' }] }, site, [])
    expect(node?.['@id']).toBe('https://example.com/#itemlist')
  })
})

describe('buildStructuredData with a list', () => {
  const options: ResolvedOptions = {
    siteUrl: site,
    collections: { pages: { type: 'WebPage', path: (d) => `/${d.slug}` } },
  }
  const settings = { name: 'Acme' }
  const list = { path: '/events', items: [{ name: 'A', path: '/events/a' }] }
  const types = (r: ReturnType<typeof buildStructuredData>) => r.graph?.['@graph'].map((n) => n['@type'])

  test('list alone gives Organization, WebSite, ItemList', () => {
    expect(types(buildStructuredData({ options, settings, list }))).toEqual(['Organization', 'WebSite', 'ItemList'])
  })

  test('list with a doc comes after the document nodes', () => {
    const result = buildStructuredData({ options, settings, collection: 'pages', doc: { id: 1, slug: 'events', title: 'Events' }, list })
    const t = types(result)
    expect(t?.[t.length - 1]).toBe('ItemList')
    expect(t).toContain('WebPage')
  })

  test('disabled gives no graph', () => {
    expect(buildStructuredData({ options: { ...options, disabled: true }, settings, list }).graph).toBeNull()
  })

  test('a malformed list never throws', () => {
    const result = buildStructuredData({ options, settings, list: 'nope' as never })
    expect(types(result)).toEqual(['Organization', 'WebSite'])
  })
})
