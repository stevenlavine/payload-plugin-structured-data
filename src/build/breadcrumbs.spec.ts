import { describe, expect, test } from 'vitest'
import { breadcrumbTrail, buildBreadcrumbList } from './breadcrumbs.js'

describe('breadcrumbTrail', () => {
  test('uses nested-docs breadcrumbs after Home', () => {
    const doc = { breadcrumbs: [{ label: 'Services', url: '/services' }, { label: 'AI', url: '/services/ai' }] }
    expect(breadcrumbTrail(doc, '/services/ai', 'AI')).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Services', path: '/services' },
      { name: 'AI', path: '/services/ai' },
    ])
  })

  test('falls back to Home and this page', () => {
    expect(breadcrumbTrail({}, '/about', 'About')).toEqual([
      { name: 'Home', path: '/' },
      { name: 'About', path: '/about' },
    ])
  })

  test('custom function wins', () => {
    const custom = () => [{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }]
    expect(breadcrumbTrail({ breadcrumbs: [{ label: 'x', url: '/x' }] }, '/b', 'B', custom)).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
    ])
  })
})

describe('buildBreadcrumbList', () => {
  test('builds absolute positions', () => {
    const node = buildBreadcrumbList('https://a.com', [{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }], 'https://a.com/about')
    expect(node).toEqual({
      '@type': 'BreadcrumbList',
      '@id': 'https://a.com/about#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://a.com' },
        { '@type': 'ListItem', position: 2, name: 'About', item: 'https://a.com/about' },
      ],
    })
  })

  test('home page or one item gives null', () => {
    expect(buildBreadcrumbList('https://a.com', [{ name: 'Home', path: '/' }], 'https://a.com')).toBeNull()
  })
})
