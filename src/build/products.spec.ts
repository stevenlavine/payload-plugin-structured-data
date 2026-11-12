import { describe, expect, test } from 'vitest'
import type { CollectionOptions, Doc, JsonLdNode, ResolvedOptions, Settings } from '../types.js'
import { buildStructuredData } from './buildStructuredData.js'
import { buildProductNodes, defaultVariantUrl, pageCurrency, type ProductNodeInput } from './products.js'

const media = (name: string) => ({ id: name, url: `/media/${name}.jpg` })
const lexical = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

const watch: Doc = {
  id: 7,
  title: 'Brass Calibre Duplex by Barwise',
  slug: 'brass-duplex',
  inventory: 1,
  priceInGBPEnabled: true,
  priceInGBP: 175000,
  gallery: [{ image: media('w1') }, { image: media('w2') }],
  description: lexical('An early 19th Century English duplex.'),
  sku: 'A1308',
}

const productsConfig: CollectionOptions = { type: 'Product', path: (doc) => `/products/${doc.slug}` }
const url = 'https://example.com/products/brass-duplex'

const optionsFor = (shop: ResolvedOptions['shop'] = { currency: 'GBP', currencies: [{ code: 'GBP', decimals: 2 }] }): ResolvedOptions => ({
  siteUrl: 'https://example.com',
  ...(shop ? { shop } : {}),
  collections: { products: productsConfig },
})

const inputFor = (overrides: Partial<ProductNodeInput> = {}): ProductNodeInput => ({
  doc: watch,
  url,
  ref: 'products/7',
  config: productsConfig,
  options: optionsFor(),
  settings: null,
  currency: undefined,
  hasOrganization: true,
  ...overrides,
})

const offerOf = (nodes: JsonLdNode[]) => nodes[0]?.offers as Record<string, unknown> | undefined

describe('buildProductNodes', () => {
  test('outputs one Product with one GBP Offer, absolute URLs and @id <url>#product', () => {
    const warnings: string[] = []
    const nodes = buildProductNodes(inputFor(), warnings)
    expect(warnings).toEqual([])
    expect(nodes).toEqual([
      {
        '@type': 'Product',
        '@id': `${url}#product`,
        name: 'Brass Calibre Duplex by Barwise',
        url,
        description: 'An early 19th Century English duplex.',
        image: ['https://example.com/media/w1.jpg', 'https://example.com/media/w2.jpg'],
        offers: {
          '@type': 'Offer',
          url,
          price: 1750,
          priceCurrency: 'GBP',
          availability: 'https://schema.org/InStock',
          seller: { '@id': 'https://example.com/#organization' },
        },
      },
    ])
  })

  test('the currency prop picks the currency; a product without it enabled gets no offer and a warning', () => {
    const both = { ...watch, priceInEUREnabled: true, priceInEUR: 200000 }
    const options = optionsFor({ currency: 'GBP', currencies: [{ code: 'GBP', decimals: 2 }, { code: 'EUR', decimals: 2 }] })
    const eur = buildProductNodes(inputFor({ doc: both, options, currency: 'eur' }), [])
    expect(offerOf(eur)).toMatchObject({ price: 2000, priceCurrency: 'EUR' })

    const warnings: string[] = []
    const none = buildProductNodes(inputFor({ options, currency: 'EUR' }), warnings)
    expect(none).toEqual([])
    expect(warnings.some((w) => w.includes('EUR'))).toBe(true)
    expect(warnings.some((w) => w.includes('WebPage'))).toBe(true)
  })

  test('a product enabled in GBP and EUR outputs GBP only when shop.currency is GBP', () => {
    const both = { ...watch, priceInEUREnabled: true, priceInEUR: 200000 }
    const options = optionsFor({ currency: 'GBP', currencies: [{ code: 'GBP', decimals: 2 }, { code: 'EUR', decimals: 2 }] })
    const nodes = buildProductNodes(inputFor({ doc: both, options }), [])
    expect(offerOf(nodes)).toMatchObject({ price: 1750, priceCurrency: 'GBP' })
    expect(JSON.stringify(nodes)).not.toContain('EUR')
  })

  test('with no currency prop or shop.currency, the first enabled currency is used with a warning', () => {
    const doc = { ...watch, priceInUSDEnabled: false, priceInUSD: 1, priceInEUREnabled: true, priceInEUR: 200000 }
    const warnings: string[] = []
    expect(pageCurrency(inputFor({ options: optionsFor({ currencies: [] }) }), doc, 'products/7', warnings)).toBe('GBP')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('GBP')
  })

  test('decimals from the Intl fallback warn to list ecommercePlugin first', () => {
    const warnings: string[] = []
    const nodes = buildProductNodes(inputFor({ options: optionsFor({ currency: 'GBP', currencies: [] }) }), warnings)
    expect(offerOf(nodes)).toMatchObject({ price: 1750, priceCurrency: 'GBP' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('ecommercePlugin')
  })

  test('no offer and no review data: [] and a warning, and buildStructuredData outputs a WebPage', () => {
    const onRequest = { ...watch, priceInGBP: 0 }
    const warnings: string[] = []
    expect(buildProductNodes(inputFor({ doc: onRequest }), warnings)).toEqual([])
    expect(warnings.some((w) => w.includes('WebPage'))).toBe(true)

    const result = buildStructuredData({ options: optionsFor(), settings: { name: 'Acme' }, collection: 'products', doc: onRequest })
    const graph = result.graph?.['@graph'] ?? []
    expect(graph.map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'])
    expect(graph[2]?.['@id']).toBe(`${url}#webpage`)
    expect(result.warnings.some((w) => w.includes('WebPage'))).toBe(true)
  })

  test('supplied review data keeps the Product with no offer', () => {
    const onRequest = { ...watch, priceInGBP: 0 }
    const nodes = buildProductNodes(inputFor({ doc: onRequest, reviews: { rating: { value: 4.8, count: 12 } } }), [])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.['@type']).toBe('Product')
    expect(nodes[0]?.offers).toBeUndefined()
  })

  test('maps brand, sku, gtin, mpn, color, size, material, pattern when set', () => {
    const config: CollectionOptions = {
      ...productsConfig,
      product: {
        brand: 'maker.name',
        sku: 'sku',
        gtin: 'barcode',
        mpn: 'mpn',
        color: 'colour',
        size: 'size',
        material: 'material',
        pattern: 'pattern',
      },
    }
    const doc = {
      ...watch,
      maker: { name: 'Barwise' },
      barcode: 5012345678900,
      mpn: 'BW-1',
      colour: 'Brass',
      size: '52 mm',
      material: 'Brass',
      pattern: 'Engine-turned',
    }
    const [product] = buildProductNodes(inputFor({ doc, config }), [])
    expect(product).toMatchObject({
      brand: { '@type': 'Brand', name: 'Barwise' },
      sku: 'A1308',
      gtin: '5012345678900',
      mpn: 'BW-1',
      color: 'Brass',
      size: '52 mm',
      material: 'Brass',
      pattern: 'Engine-turned',
    })

    const [plain] = buildProductNodes(inputFor(), [])
    for (const key of ['brand', 'sku', 'gtin', 'mpn', 'color', 'size', 'material', 'pattern']) expect(plain).not.toHaveProperty(key)
  })

  test('itemCondition from the shop default when no mapping', () => {
    const settings: Settings = { shop: { defaultCondition: 'used' } }
    expect(offerOf(buildProductNodes(inputFor({ settings }), []))?.itemCondition).toBe('https://schema.org/UsedCondition')

    const config: CollectionOptions = { ...productsConfig, product: { condition: () => 'refurbished' } }
    expect(offerOf(buildProductNodes(inputFor({ settings, config }), []))?.itemCondition).toBe('https://schema.org/RefurbishedCondition')

    expect(offerOf(buildProductNodes(inputFor(), []))).not.toHaveProperty('itemCondition')
  })

  test('stock 0 is OutOfStock, or SoldOut when configured; a mapping beats stock', () => {
    const sold = { ...watch, inventory: 0 }
    expect(offerOf(buildProductNodes(inputFor({ doc: sold }), []))?.availability).toBe('https://schema.org/OutOfStock')
    const oneOff: CollectionOptions = { ...productsConfig, product: { outOfStock: 'SoldOut' } }
    expect(offerOf(buildProductNodes(inputFor({ doc: sold, config: oneOff }), []))?.availability).toBe('https://schema.org/SoldOut')
    const madeToOrder: CollectionOptions = { ...productsConfig, product: { availability: () => 'madeToOrder' } }
    expect(offerOf(buildProductNodes(inputFor({ doc: sold, config: madeToOrder }), []))?.availability).toBe('https://schema.org/BackOrder')
  })

  test('offer links the return policy by @id only when returnPolicyId is given', () => {
    const id = 'https://example.com/#return-policy'
    expect(offerOf(buildProductNodes(inputFor({ returnPolicyId: id }), []))?.hasMerchantReturnPolicy).toEqual({ '@id': id })
    expect(offerOf(buildProductNodes(inputFor(), []))).not.toHaveProperty('hasMerchantReturnPolicy')
  })

  test('no seller without an organisation', () => {
    expect(offerOf(buildProductNodes(inputFor({ hasOrganization: false }), []))).not.toHaveProperty('seller')
  })

  test('a mapped image path takes a single value or an array', () => {
    const config: CollectionOptions = { ...productsConfig, fields: { image: 'photo' } }
    const [single] = buildProductNodes(inputFor({ doc: { ...watch, photo: media('p1') }, config }), [])
    expect(single?.image).toEqual(['https://example.com/media/p1.jpg'])
    const [many] = buildProductNodes(inputFor({ doc: { ...watch, photo: [media('p1'), media('p2')] }, config }), [])
    expect(many?.image).toEqual(['https://example.com/media/p1.jpg', 'https://example.com/media/p2.jpg'])
  })

  test('a stored Product override on a collection that does not allow it is ignored', () => {
    const options: ResolvedOptions = {
      siteUrl: 'https://example.com',
      shop: { currency: 'GBP', currencies: [{ code: 'GBP', decimals: 2 }] },
      collections: { pages: { type: 'WebPage', path: (doc) => `/${doc.slug}` } },
    }
    const doc = { ...watch, structuredData: { type: 'Product' } }
    const result = buildStructuredData({ options, settings: { name: 'Acme' }, collection: 'pages', doc })
    expect(result.graph?.['@graph'].map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'])
  })

  test('a type function returning Product on a collection that does not allow it warns', () => {
    const options: ResolvedOptions = {
      siteUrl: 'https://example.com',
      collections: { pages: { type: () => 'Product', path: (doc) => `/${doc.slug}` } },
    }
    const result = buildStructuredData({ options, settings: { name: 'Acme' }, collection: 'pages', doc: watch })
    expect(result.graph?.['@graph'].map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'BreadcrumbList'])
    expect(result.warnings[0]).toContain('does not allow it')
  })
})

const size = { id: 1, name: 'size', label: 'Size' }
const extras = { id: 2, name: 'extras', label: 'Extras' }
const cardigan: Doc = {
  id: 4433,
  title: 'Loopy Cardigan',
  slug: 'loopy-cardigan',
  enableVariants: true,
  variantTypes: [size, extras],
  gallery: [{ image: media('c'), variantOption: null }, { image: media('c-small'), variantOption: { id: 11 } }],
  variants: {
    docs: [
      {
        id: 12,
        title: null,
        _status: 'published',
        inventory: 3,
        priceInGBPEnabled: true,
        priceInGBP: 2000,
        options: [{ id: 11, label: '0-3 months', value: '0-3m', variantType: size }],
      },
      {
        id: 13,
        _status: 'published',
        inventory: 0,
        priceInGBPEnabled: true,
        priceInGBP: 2500,
        options: [
          { id: 14, label: '3-6 months', value: '3-6m', variantType: size },
          { id: 15, label: 'Bow', value: 'bow', variantType: extras },
        ],
      },
      { id: 16, _status: 'draft', inventory: 5, priceInGBPEnabled: true, priceInGBP: 2000, options: [] },
    ],
  },
}
const cardiganUrl = 'https://example.com/products/loopy-cardigan'
const groupInput = (overrides: Partial<ProductNodeInput> = {}) =>
  inputFor({ doc: cardigan, url: cardiganUrl, ref: 'products/4433', ...overrides })
const variantsOf = (nodes: JsonLdNode[]) => (nodes[0]?.hasVariant ?? []) as Record<string, unknown>[]
const variantOffer = (variant: Record<string, unknown> | undefined) => variant?.offers as Record<string, unknown> | undefined
const withVariants = (docs: unknown[]): Doc => ({ ...cardigan, variants: { docs } })
const firstVariant = (cardigan.variants as { docs: Doc[] }).docs[0]

describe('buildProductNodes with variants', () => {
  test('outputs a ProductGroup with productGroupID 4433, url, variesBy size only, and two variants', () => {
    const warnings: string[] = []
    const nodes = buildProductNodes(groupInput(), warnings)
    expect(warnings).toEqual([])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      '@type': 'ProductGroup',
      '@id': `${cardiganUrl}#product`,
      name: 'Loopy Cardigan',
      url: cardiganUrl,
      productGroupID: '4433',
      variesBy: ['https://schema.org/size'],
      image: ['https://example.com/media/c.jpg', 'https://example.com/media/c-small.jpg'],
    })
    expect(nodes[0]).not.toHaveProperty('offers')
    expect(variantsOf(nodes)).toHaveLength(2)
  })

  test('variant name joins option labels; sku falls back to 4433-12; size is the option label', () => {
    const [first, second] = variantsOf(buildProductNodes(groupInput(), []))
    expect(first).toMatchObject({ '@type': 'Product', name: 'Loopy Cardigan, 0-3 months', sku: '4433-12', size: '0-3 months' })
    expect(second).toMatchObject({ name: 'Loopy Cardigan, 3-6 months, Bow', sku: '4433-13', size: '3-6 months' })
    expect(second).not.toHaveProperty('extras')

    const config: CollectionOptions = { ...productsConfig, product: { sku: 'sku' } }
    const doc = { ...withVariants([{ ...firstVariant, sku: 'LC-03', title: 'Newborn cardigan' }]), sku: 'LC' }
    const [group] = buildProductNodes(groupInput({ doc, config }), [])
    expect(group?.productGroupID).toBe('LC')
    expect(variantsOf([group])[0]).toMatchObject({ name: 'Newborn cardigan', sku: 'LC-03' })
  })

  test('variant offer URL copies the template: ?size=11&variant=12', () => {
    const [first, second] = variantsOf(buildProductNodes(groupInput(), []))
    expect(variantOffer(first)).toMatchObject({
      '@type': 'Offer',
      url: `${cardiganUrl}?size=11&variant=12`,
      price: 20,
      priceCurrency: 'GBP',
      seller: { '@id': 'https://example.com/#organization' },
    })
    expect(variantOffer(second)?.url).toBe(`${cardiganUrl}?size=14&extras=15&variant=13`)
    expect(defaultVariantUrl('/products/loopy-cardigan', { id: 12, options: [{ id: 11, variantType: size }] })).toBe(
      '/products/loopy-cardigan?size=11&variant=12',
    )
  })

  test('variant with ID-only options gets ?variant=<id>', () => {
    expect(defaultVariantUrl(cardiganUrl, { id: 12, options: [11, 14] })).toBe(`${cardiganUrl}?variant=12`)
    const doc = withVariants([{ id: 12, _status: 'published', inventory: 1, priceInGBPEnabled: true, priceInGBP: 2000, options: [11] }])
    const [variant] = variantsOf(buildProductNodes(groupInput({ doc }), []))
    expect(variantOffer(variant)?.url).toBe(`${cardiganUrl}?variant=12`)
    expect(variant?.name).toBe('Loopy Cardigan')
  })

  test('variant images come from gallery rows whose variantOption is one of its options', () => {
    const [first, second] = variantsOf(buildProductNodes(groupInput(), []))
    expect(first?.image).toEqual(['https://example.com/media/c-small.jpg'])
    expect(second?.image).toEqual(['https://example.com/media/c.jpg', 'https://example.com/media/c-small.jpg'])
  })

  test('variant stock: 3 is InStock, 0 is OutOfStock; draft variant skipped', () => {
    const variants = variantsOf(buildProductNodes(groupInput(), []))
    expect(variants.map((v) => variantOffer(v)?.availability)).toEqual(['https://schema.org/InStock', 'https://schema.org/OutOfStock'])
    expect(variants.map((v) => v.sku)).not.toContain('4433-16')
  })

  test('a product availability mapping applies to every variant and beats stock', () => {
    let calls = 0
    const config: CollectionOptions = {
      ...productsConfig,
      product: {
        availability: () => {
          calls += 1
          return 'madeToOrder'
        },
        condition: () => 'new',
      },
    }
    const id = 'https://example.com/#return-policy'
    const variants = variantsOf(buildProductNodes(groupInput({ config, returnPolicyId: id }), []))
    expect(calls).toBe(1)
    expect(variants).toHaveLength(2)
    for (const variant of variants) {
      expect(variantOffer(variant)).toMatchObject({
        availability: 'https://schema.org/BackOrder',
        itemCondition: 'https://schema.org/NewCondition',
        hasMerchantReturnPolicy: { '@id': id },
      })
    }
  })

  test('no valid variants: plain Product from the product price, else [] (WebPage fallback)', () => {
    const unpriced = withVariants([{ id: 12, _status: 'published', inventory: 1, priceInGBPEnabled: true, priceInGBP: 0, options: [] }])
    const priced = { ...unpriced, priceInGBPEnabled: true, priceInGBP: 1800, inventory: 2 }
    const warnings: string[] = []
    const nodes = buildProductNodes(groupInput({ doc: priced }), warnings)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ '@type': 'Product', '@id': `${cardiganUrl}#product`, offers: { price: 18 } })
    expect(warnings.some((w) => w.includes('variant 12'))).toBe(true)

    const fallback: string[] = []
    expect(buildProductNodes(groupInput({ doc: unpriced }), fallback)).toEqual([])
    expect(fallback.some((w) => w.includes('WebPage'))).toBe(true)

    const disabled = { ...cardigan, enableVariants: false, priceInGBPEnabled: true, priceInGBP: 1800 }
    expect(buildProductNodes(groupInput({ doc: disabled }), [])[0]?.['@type']).toBe('Product')
  })

  test('variants.docs holding IDs only: skipped with one warning, nothing throws', () => {
    const doc = { ...withVariants([12, 13, 16]), priceInGBPEnabled: true, priceInGBP: 1800 }
    const warnings: string[] = []
    const nodes = buildProductNodes(groupInput({ doc }), warnings)
    expect(nodes[0]?.['@type']).toBe('Product')
    expect(warnings.filter((w) => w.includes('populated'))).toHaveLength(1)
    expect(() => buildProductNodes(groupInput({ doc: withVariants([null, 'x', []]) }), [])).not.toThrow()
  })

  test('a throwing variantUrl warns and uses the default', () => {
    const throwing: CollectionOptions = {
      ...productsConfig,
      product: {
        variantUrl: () => {
          throw new Error('no slug')
        },
      },
    }
    const warnings: string[] = []
    const [first] = variantsOf(buildProductNodes(groupInput({ config: throwing }), warnings))
    expect(variantOffer(first)?.url).toBe(`${cardiganUrl}?size=11&variant=12`)
    expect(warnings.some((w) => w.includes('variantUrl') && w.includes('no slug'))).toBe(true)

    const custom: CollectionOptions = { ...productsConfig, product: { variantUrl: (doc, variant) => `/shop/${doc.slug}/${variant.id}` } }
    const [own] = variantsOf(buildProductNodes(groupInput({ config: custom }), []))
    expect(variantOffer(own)?.url).toBe('https://example.com/shop/loopy-cardigan/12')
  })

  test('colour, color, size, material, pattern, age, gender map; age → suggestedAge', () => {
    const types = [
      { id: 1, name: 'Colour', label: 'Colour' },
      { id: 2, name: 'shade', label: 'color' },
      { id: 3, name: 'SIZE', label: 'Size' },
      { id: 4, name: 'material', label: 'Material' },
      { id: 5, name: 'pattern', label: 'Pattern' },
      { id: 6, name: 'age', label: 'Age' },
      { id: 7, name: 'gender', label: 'Gender' },
      { id: 8, name: 'engraving', label: 'Engraving' },
    ]
    const options = types.map((variantType, i) => ({ id: 100 + i, label: `L${i}`, value: `v${i}`, variantType }))
    const doc = withVariants([{ id: 12, _status: 'published', inventory: 1, priceInGBPEnabled: true, priceInGBP: 2000, options }])
    const [group] = buildProductNodes(groupInput({ doc }), [])
    expect(group?.variesBy).toEqual([
      'https://schema.org/color',
      'https://schema.org/size',
      'https://schema.org/material',
      'https://schema.org/pattern',
      'https://schema.org/suggestedAge',
      'https://schema.org/suggestedGender',
    ])
    // Two colour types: the first label wins
    expect(variantsOf([group])[0]).toMatchObject({
      color: 'L0',
      size: 'L2',
      material: 'L3',
      pattern: 'L4',
      suggestedAge: 'L5',
      suggestedGender: 'L6',
    })
  })

  test('with no page currency set, the first currency a variant enables is used, with one warning', () => {
    const warnings: string[] = []
    const nodes = buildProductNodes(groupInput({ options: optionsFor({ currencies: [{ code: 'GBP', decimals: 2 }] }) }), warnings)
    expect(variantsOf(nodes).map((v) => variantOffer(v)?.priceCurrency)).toEqual(['GBP', 'GBP'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('first enabled currency')
  })
})
