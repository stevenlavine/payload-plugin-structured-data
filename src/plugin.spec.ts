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
  test('the unknown-collection error says to list the plugin after one that adds the collection', () => {
    expect(() =>
      structuredDataPlugin({ siteUrl: 'https://a.com', collections: { products: { type: 'Product', path: () => '/' } } as never })(config),
    ).toThrow(/if another plugin \(such as ecommercePlugin\) adds this collection, list structuredDataPlugin after it/)
  })

  test('throws when a configured collection already has a structuredData field', () => {
    const withField = { collections: [{ slug: 'posts', fields: [{ name: 'structuredData', type: 'text' }] }] } as never
    expect(() =>
      structuredDataPlugin({ siteUrl: 'https://a.com', collections: { posts: { type: 'WebPage', path: () => '/' } } })(withField),
    ).toThrow('structuredDataPlugin: collection "posts" already has a field named "structuredData"')
  })
  test('throws when faq.enabledField is not a field path string', () => {
    const cfg = { collections: [{ slug: 'posts', fields: [] }] } as never
    const make = (enabledField: unknown) =>
      structuredDataPlugin({
        siteUrl: 'https://a.com',
        collections: {
          posts: { type: 'WebPage', path: () => '/', faq: { block: 'f', items: 'i', question: 'q', answer: 'a', enabledField: enabledField as string } },
        },
      })(cfg)
    expect(() => make(true)).toThrow('structuredDataPlugin: collection "posts" faq.enabledField must be a field path string')
    expect(() => make('')).toThrow('faq.enabledField must be a field path string')
    expect(() => make('enableSchema')).not.toThrow()
  })
  describe('duplicate guard looks inside presentational fields', () => {
    const dup = { name: 'structuredData', type: 'text' }
    const run = (fields: unknown[]) =>
      structuredDataPlugin({ siteUrl: 'https://a.com', collections: { posts: { type: 'WebPage', path: () => '/' } } })({
        collections: [{ slug: 'posts', fields }],
      } as never)
    const message = 'structuredDataPlugin: collection "posts" already has a field named "structuredData"'
    test('throws inside an unnamed group', () => {
      expect(() => run([{ type: 'group', fields: [dup] }])).toThrow(message)
    })
    test('throws inside a row', () => {
      expect(() => run([{ type: 'row', fields: [dup] }])).toThrow(message)
    })
    test('throws inside a collapsible', () => {
      expect(() => run([{ type: 'collapsible', label: 'x', fields: [dup] }])).toThrow(message)
    })
    test('throws inside an unnamed tab', () => {
      expect(() => run([{ type: 'tabs', tabs: [{ label: 'x', fields: [dup] }] }])).toThrow(message)
    })
    test('throws inside a row nested in an unnamed tab', () => {
      expect(() =>
        run([{ type: 'tabs', tabs: [{ label: 'x', fields: [{ type: 'row', fields: [dup] }] }] }]),
      ).toThrow(message)
    })
    test('does not throw inside a named group', () => {
      expect(() => run([{ type: 'group', name: 'meta', fields: [dup] }])).not.toThrow()
    })
    test('does not throw inside a named tab', () => {
      expect(() => run([{ type: 'tabs', tabs: [{ name: 'seo', label: 'x', fields: [dup] }] }])).not.toThrow()
    })
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

describe('type select options', () => {
  const selectOptions = (collectionOptions: Record<string, unknown>) => {
    const result = structuredDataPlugin({
      siteUrl: 'https://a.com',
      collections: { posts: { path: () => '/', ...collectionOptions } as never },
    })(config)
    const group = result.collections?.[0]?.fields.find((f) => 'name' in f && f.name === 'structuredData')
    const select = group && 'fields' in group ? group.fields.find((f) => 'name' in f && f.name === 'type') : undefined
    return select && 'options' in select ? (select.options as { value: string }[]).map((o) => o.value) : []
  }
  const PAGE = ['Article', 'BlogPosting', 'Service', 'WebPage']
  test('no event config keeps exactly the page types', () => {
    expect(selectOptions({ type: 'WebPage' })).toEqual(PAGE)
  })
  test('type Event adds Event', () => {
    expect(selectOptions({ type: 'Event' })).toEqual([...PAGE, 'Event'])
  })
  test('an event block adds Event', () => {
    expect(selectOptions({ type: 'WebPage', event: {} })).toEqual([...PAGE, 'Event'])
  })
  test('a type function with no event keeps exactly the page types', () => {
    expect(selectOptions({ type: () => 'WebPage' })).toEqual(PAGE)
  })
})
describe('product type and shop options', () => {
  const run = (collectionOptions: Record<string, unknown>, extra: Record<string, unknown> = {}, cfg: unknown = config) =>
    structuredDataPlugin({
      siteUrl: 'https://a.com',
      collections: { posts: { path: () => '/', ...collectionOptions } as never },
      ...extra,
    })(cfg as never)
  const typeValues = (collectionOptions: Record<string, unknown>) => {
    const group = run(collectionOptions).collections?.[0]?.fields.find((f) => 'name' in f && f.name === 'structuredData')
    const select = group && 'fields' in group ? group.fields.find((f) => 'name' in f && f.name === 'type') : undefined
    return select && 'options' in select ? (select.options as { value: string }[]).map((o) => o.value) : []
  }
  const globalNames = (result: ReturnType<typeof run>) =>
    (result.globals?.find((g) => g.slug === 'structured-data-settings')?.fields ?? []).map((f) => ('name' in f ? f.name : ''))

  test('a collection with no product config keeps its exact select options', () => {
    expect(typeValues({ type: 'BlogPosting' })).toEqual(['Article', 'BlogPosting', 'Service', 'WebPage'])
  })
  test('Product is offered only where type is Product or a product block exists', () => {
    expect(typeValues({ type: 'Product' })).toContain('Product')
    expect(typeValues({ type: 'WebPage', product: {} })).toContain('Product')
    expect(typeValues({ type: () => 'WebPage' })).not.toContain('Product')
  })
  test('no shop option adds no shop fields to the settings global', () => {
    expect(globalNames(run({ type: 'WebPage' }))).toEqual([
      'organizationType', 'name', 'legalName', 'description', 'logo', 'image', 'email', 'telephone',
      'address', 'sameAs', 'areaServed', 'foundingDate', 'founder', 'identifiers',
    ])
  })
  test('the shop option adds one group named shop to the settings global', () => {
    const names = globalNames(run({ type: 'WebPage' }, { shop: { currency: 'gbp' } }))
    expect(names.filter((n) => n === 'shop')).toHaveLength(1)
    expect(names.at(-1)).toBe('shop')
  })
  test('resolves shop currencies from the eCommerce price fields, site entries winning', () => {
    const price = (code: string, decimals: number) => ({
      name: `priceIn${code}`,
      type: 'number',
      admin: { components: { Field: { clientProps: { currency: { code, decimals } } } } },
    })
    const cfg = {
      collections: [
        { slug: 'posts', fields: [{ type: 'group', name: 'g', fields: [{ type: 'row', fields: [price('JPY', 0), price('GBP', 5)] }] }] },
      ],
    }
    const result = run({ type: 'WebPage' }, { shop: { currency: 'gbp', currencies: [{ code: 'GBP', decimals: 2 }] } }, cfg)
    expect(getPluginOptions(result)?.shop).toEqual({
      currency: 'GBP',
      currencies: [{ code: 'GBP', decimals: 2 }, { code: 'JPY', decimals: 0 }],
    })
  })
})
