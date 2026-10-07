import { describe, expect, test } from 'vitest'
import type { ResolvedOptions } from '../types.js'
import { buildPageNode } from './pageNodes.js'

const options: ResolvedOptions = { siteUrl: 'https://a.com', collections: {}, imageSize: 'og' }
const settings = { name: 'Acme', areaServed: [{ name: 'Kent' }] }
const base = { url: 'https://a.com/blog/hello', ref: 'posts/1', options, settings, hasOrganization: true }

const post = {
  id: 1,
  title: 'Hello world',
  meta: { description: 'A post', image: { url: '/m/a.png', sizes: { og: { url: '/m/a-og.png' } } } },
  publishedAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
  populatedAuthors: [{ id: 1, name: 'Sam Smith' }],
}

describe('buildPageNode', () => {
  test('BlogPosting with defaults', () => {
    expect(buildPageNode({ ...base, type: 'BlogPosting', doc: post }, [])).toEqual({
      '@type': 'BlogPosting',
      '@id': 'https://a.com/blog/hello#article',
      headline: 'Hello world',
      description: 'A post',
      image: 'https://a.com/m/a-og.png',
      datePublished: '2026-10-01T09:00:00.000Z',
      dateModified: '2026-10-02T09:00:00.000Z',
      author: [{ '@type': 'Person', name: 'Sam Smith' }],
      publisher: { '@id': 'https://a.com/#organization' },
      mainEntityOfPage: 'https://a.com/blog/hello',
    })
  })

  test('author falls back to the organization, or is left out', () => {
    const doc = { ...post, populatedAuthors: [] }
    expect(buildPageNode({ ...base, type: 'Article', doc }, [])?.author).toEqual({ '@id': 'https://a.com/#organization' })
    const none = buildPageNode({ ...base, hasOrganization: false, type: 'Article', doc }, [])
    expect(none).not.toHaveProperty('author')
    expect(none).not.toHaveProperty('publisher')
  })

  test('custom field paths win over defaults', () => {
    const doc = { ...post, publishedAt: null, completedAt: '2025-01-01' }
    const node = buildPageNode(
      { ...base, type: 'Article', doc, fields: { datePublished: ['completedAt', 'publishedAt'] } },
      [],
    )
    expect(node?.datePublished).toBe('2025-01-01')
  })

  test('no headline skips the node with a warning', () => {
    const warnings: string[] = []
    expect(buildPageNode({ ...base, type: 'BlogPosting', doc: { ...post, title: '' } }, warnings)).toBeNull()
    expect(warnings).toEqual(['posts/1: BlogPosting skipped, no headline (field "title" is empty)'])
  })

  test('Service', () => {
    const node = buildPageNode({ ...base, url: 'https://a.com/services/web', type: 'Service', doc: post }, [])
    expect(node).toEqual({
      '@type': 'Service',
      '@id': 'https://a.com/services/web#service',
      name: 'Hello world',
      serviceType: 'Hello world',
      description: 'A post',
      url: 'https://a.com/services/web',
      provider: { '@id': 'https://a.com/#organization' },
      areaServed: ['Kent'],
    })
  })

  test('WebPage', () => {
    const node = buildPageNode({ ...base, url: 'https://a.com/about', type: 'WebPage', doc: post }, [])
    expect(node).toMatchObject({
      '@type': 'WebPage',
      '@id': 'https://a.com/about#webpage',
      name: 'Hello world',
      url: 'https://a.com/about',
      isPartOf: { '@id': 'https://a.com/#website' },
      primaryImageOfPage: 'https://a.com/m/a-og.png',
    })
  })

  test('unpopulated image relation is skipped, not fetched', () => {
    const node = buildPageNode({ ...base, type: 'Article', doc: { ...post, meta: { image: 7 } } }, [])
    expect(node).not.toHaveProperty('image')
  })
})
