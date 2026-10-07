import { describe, expect, test } from 'vitest'
import { structuredDataPlugin } from './plugin.js'

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
})
