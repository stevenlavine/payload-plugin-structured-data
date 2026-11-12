import { describe, expect, test } from 'vitest'
import type { CollectionOptions, Doc, JsonLdNode, ResolvedOptions, Settings } from '../types.js'
import { buildStructuredData } from './buildStructuredData.js'
import { buildProductNodes, pageCurrency, type ProductNodeInput } from './products.js'

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
