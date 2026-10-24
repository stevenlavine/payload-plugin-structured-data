import { describe, expect, test } from 'vitest'
import { getPluginOptions, structuredDataPlugin } from './plugin.js'

const config = { collections: [{ slug: 'posts', fields: [] }] } as never

describe('structuredDataPlugin config checks', () => {
  test('happy path adds the group and the global', () => {
    const result = structuredDataPlugin({
      siteUrl: 'https://a.com',
      collections: { posts: { type: 'WebPage', path: () => '/' } },
    })(config)
    expect(result.collections?.[0]?.fields.some((f) => 'name' in f && f.name === 'structuredData')).toBe(true)
    expect(result.globals?.some((g) => g.slug === 'structured-data-settings')).toBe(true)
  })
  test('strips trailing slashes from siteUrl', () => {
    const result = structuredDataPlugin({ siteUrl: 'https://a.com///', collections: {} })(config)
    expect(getPluginOptions(result)?.siteUrl).toBe('https://a.com')
  })
  test('does not mutate the incoming config', () => {
    const input = { collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }], globals: [] }
    const snapshot = structuredClone(input)
    structuredDataPlugin({
      siteUrl: 'https://a.com',
      collections: { posts: { type: 'WebPage', path: () => '/' } },
    })(input as never)
    expect(input).toEqual(snapshot)
  })
  test('disabled still adds the fields', () => {
    const result = structuredDataPlugin({
      siteUrl: 'https://a.com',
      disabled: true,
      collections: { posts: { type: 'WebPage', path: () => '/' } },
    })(config)
    expect(result.collections?.[0]?.fields.some((f) => 'name' in f && f.name === 'structuredData')).toBe(true)
    expect(result.globals?.some((g) => g.slug === 'structured-data-settings')).toBe(true)
  })
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
