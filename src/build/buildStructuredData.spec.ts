import { describe, expect, test } from 'vitest'
import type { ResolvedOptions } from '../types.js'
import { buildStructuredData } from './buildStructuredData.js'

const options: ResolvedOptions = {
  siteUrl: 'https://a.com',
  collections: {
    posts: { type: 'BlogPosting', path: (doc) => `/blog/${doc.slug}` },
    pages: {
      type: (doc) => (String(doc.slug).startsWith('services') ? 'Service' : 'WebPage'),
      path: (doc) => (doc.slug === 'home' ? '/' : `/${doc.slug}`),
      faq: { block: 'faq', items: 'faqs', question: 'question', answer: 'answer' },
    },
  },
}
const settings = { name: 'Acme' }
const post = { id: 9, slug: 'hello', title: 'Hello' }

const types = (r: ReturnType<typeof buildStructuredData>) => r.graph?.['@graph'].map((n) => n['@type'])

describe('buildStructuredData', () => {
  test('prototype key as collection gives a not-configured warning', () => {
    const result = buildStructuredData({ options, settings, collection: 'constructor', doc: post })
    expect(result.warnings).toContain('constructor: not configured in structuredDataPlugin')
    expect(types(result)).toEqual(['Organization', 'WebSite'])
  })

  test('site only', () => {
    expect(types(buildStructuredData({ options, settings }))).toEqual(['Organization', 'WebSite'])
  })

  test('a post gives site nodes, BlogPosting and breadcrumbs in one graph', () => {
    const result = buildStructuredData({ options, settings, collection: 'posts', doc: post })
    expect(result.graph?.['@context']).toBe('https://schema.org')
    expect(types(result)).toEqual(['Organization', 'WebSite', 'BlogPosting', 'BreadcrumbList'])
    expect(result.warnings).toEqual([])
  })

  test('editor override of the type wins', () => {
    const doc = { ...post, structuredData: { type: 'Article' } }
    expect(types(buildStructuredData({ options, settings, collection: 'posts', doc }))).toContain('Article')
  })

  test('an unknown override value is ignored', () => {
    const doc = { ...post, structuredData: { type: 'Recipe' } }
    expect(types(buildStructuredData({ options, settings, collection: 'posts', doc }))).toContain('BlogPosting')
  })

  test('"off for this page" leaves only site nodes', () => {
    const doc = { ...post, structuredData: { disabled: true } }
    expect(types(buildStructuredData({ options, settings, collection: 'posts', doc }))).toEqual(['Organization', 'WebSite'])
  })

  test('type function, FAQ, and no breadcrumbs on the home page', () => {
    const home = { id: 1, slug: 'home', title: 'Home', layout: [{ blockType: 'faq', faqs: [{ question: 'Q', answer: 'A' }] }] }
    expect(types(buildStructuredData({ options, settings, collection: 'pages', doc: home }))).toEqual([
      'Organization', 'WebSite', 'WebPage', 'FAQPage',
    ])
    const service = { id: 2, slug: 'services-ai', title: 'AI' }
    expect(types(buildStructuredData({ options, settings, collection: 'pages', doc: service }))).toContain('Service')
  })

  test('type function returning null still outputs FAQ and breadcrumbs', () => {
    const noType: ResolvedOptions = {
      ...options,
      collections: {
        pages: {
          type: () => null,
          path: (doc) => `/${doc.slug}`,
          faq: { block: 'faq', items: 'faqs', question: 'question', answer: 'answer' },
        },
      },
    }
    const doc = { id: 3, slug: 'about', title: 'About', layout: [{ blockType: 'faq', faqs: [{ question: 'Q', answer: 'A' }] }] }
    expect(types(buildStructuredData({ options: noType, settings, collection: 'pages', doc }))).toEqual([
      'Organization', 'WebSite', 'FAQPage', 'BreadcrumbList',
    ])
  })

  test('unknown collection warns and keeps site nodes', () => {
    const result = buildStructuredData({ options, settings, collection: 'nope', doc: post })
    expect(types(result)).toEqual(['Organization', 'WebSite'])
    expect(result.warnings).toEqual(['nope: not configured in structuredDataPlugin'])
  })

  test('a throwing path function never throws out', () => {
    const broken: ResolvedOptions = {
      ...options,
      collections: { posts: { type: 'BlogPosting', path: () => { throw new Error('boom') } } },
    }
    const result = buildStructuredData({ options: broken, settings, collection: 'posts', doc: post })
    expect(types(result)).toEqual(['Organization', 'WebSite'])
    expect(result.warnings[0]).toBe('posts/9: structured data failed: boom')
  })

  test('nothing to output gives a null graph', () => {
    expect(buildStructuredData({ options, settings: null }).graph).toBeNull()
    expect(buildStructuredData({ options: { ...options, disabled: true }, settings }).graph).toBeNull()
  })
})
