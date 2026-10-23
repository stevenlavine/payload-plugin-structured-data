import { describe, expect, test } from 'vitest'
import { getPluginOptions, structuredDataPlugin } from './plugin.js'

const config = { collections: [{ slug: 'posts', fields: [] }] } as never

describe('structuredDataPlugin config checks', () => {
  test('requires siteUrl', () => {
    expect(() => structuredDataPlugin({ siteUrl: '', collections: {} })(config)).toThrow(/siteUrl is required/)
  })
  test('rejects unknown collections', () => {
    expect(() =>
      structuredDataPlugin({ siteUrl: 'https://a.com', collections: { nope: { type: 'WebPage', path: () => '/' } } as never })(config),
    ).toThrow(/collection "nope" not found/)
  })

  test('throws when a configured collection already has a structuredData field', () => {
    const withField = { collections: [{ slug: 'posts', fields: [{ name: 'structuredData', type: 'text' }] }] } as never
    expect(() =>
      structuredDataPlugin({ siteUrl: 'https://a.com', collections: { posts: { type: 'WebPage', path: () => '/' } } })(withField),
    ).toThrow('structuredDataPlugin: collection "posts" already has a field named "structuredData"')
  })
  test('ignores Object.prototype keys', () => {
    const protoConfig = { collections: [{ slug: 'constructor', fields: [] }] } as never
    const result = structuredDataPlugin({ siteUrl: 'https://a.com', collections: {} })(protoConfig)
    expect(result.collections?.[0]?.fields).toEqual([])
  })
  test('drops an empty search template', () => {
    const run = (urlTemplate: string) =>
      getPluginOptions(structuredDataPlugin({ siteUrl: 'https://a.com', collections: {}, search: { urlTemplate } })(config))
    expect(run('   ')?.search).toBeUndefined()
    expect(run(' https://a.com/s?q={search_term_string} ')?.search).toEqual({
      urlTemplate: 'https://a.com/s?q={search_term_string}',
    })
  })
})
