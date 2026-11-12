import { describe, expect, test } from 'vitest'
import type { CollectionOptions, ResolvedOptions, ShopSettings } from '../types.js'
import { buildStructuredData } from './buildStructuredData.js'
import { buildReturnPolicy, buildShippingService } from './shopNodes.js'

const site = 'https://a.com'
const ship = (shop: ShopSettings, currency: string | undefined = 'GBP') => {
  const warnings: string[] = []
  return { node: buildShippingService(shop, currency, site, warnings), warnings }
}
const policy = (shop: ShopSettings, currency: string | undefined = 'GBP') => {
  const warnings: string[] = []
  return { node: buildReturnPolicy(shop, site, warnings, currency), warnings }
}

const uk = { name: 'UK', countries: 'gb, IE', cost: 4.5, handlingMin: 1, handlingMax: 2, transitMin: 1, transitMax: 3 }
const days = (minValue: number, maxValue: number) => ({
  '@type': 'ServicePeriod',
  duration: { '@type': 'QuantitativeValue', minValue, maxValue, unitCode: 'DAY' },
})

describe('buildShippingService', () => {
  test('one row: ShippingConditions with a DefinedRegion per country, rate, handling and transit in DAY', () => {
    const { node, warnings } = ship({ shipping: [uk] })
    expect(node).toEqual({
      '@type': 'ShippingService',
      '@id': 'https://a.com/#shipping',
      shippingConditions: {
        '@type': 'ShippingConditions',
        shippingDestination: [
          { '@type': 'DefinedRegion', addressCountry: 'GB' },
          { '@type': 'DefinedRegion', addressCountry: 'IE' },
        ],
        shippingRate: { '@type': 'MonetaryAmount', value: 4.5, currency: 'GBP' },
        transitTime: days(1, 3),
      },
      handlingTime: days(1, 2),
    })
    expect(warnings).toEqual([])
  })

  test('freeOver splits a row into a paid band below and a free band from that value', () => {
    const { node } = ship({ shipping: [{ ...uk, freeOver: 50 }] })
    const conditions = node?.shippingConditions as Record<string, unknown>[]
    expect(conditions).toHaveLength(2)
    expect(conditions[0]).toMatchObject({
      orderValue: { '@type': 'MonetaryAmount', maxValue: 50, currency: 'GBP' },
      shippingRate: { value: 4.5 },
    })
    expect(conditions[1]).toMatchObject({
      orderValue: { '@type': 'MonetaryAmount', minValue: 50, currency: 'GBP' },
      shippingRate: { value: 0, currency: 'GBP' },
    })
  })

  test('a free row (cost 0) stays one condition and ignores freeOver', () => {
    const { node } = ship({ shipping: [{ countries: 'GB', cost: 0, freeOver: 50 }] })
    expect(Array.isArray(node?.shippingConditions)).toBe(false)
    expect(node?.shippingConditions).toMatchObject({ shippingRate: { value: 0 } })
    expect(node).not.toHaveProperty('handlingTime')
  })

  test('rows with no valid country, no cost, or a min above its max are dropped with a warning', () => {
    const { node, warnings } = ship({
      shipping: [
        { name: 'Nowhere', countries: 'GBR, 1', cost: 3 },
        { name: 'Pricey', countries: 'GB' },
        { name: 'Backwards', countries: 'GB', cost: 3, transitMin: 5, transitMax: 2 },
        { name: 'Decimal', countries: 'GB', cost: 3, handlingMin: 1.5 },
        { name: 'Good', countries: 'FR', cost: 9 },
      ],
    })
    expect((node?.shippingConditions as Record<string, unknown>).shippingDestination).toEqual([{ '@type': 'DefinedRegion', addressCountry: 'FR' }])
    expect(warnings).toHaveLength(4)
    expect(warnings.join('\n')).toContain('"Nowhere"')
    expect(warnings.join('\n')).toContain('"Backwards"')
  })

  test('every row dropped gives no service', () => {
    expect(ship({ shipping: [{ cost: 1 }] }).node).toBeUndefined()
    expect(ship({ shipping: [] }).node).toBeUndefined()
  })

  test('shipping rows with no shop.currency: no shipping service and a warning', () => {
    const { node, warnings } = ship({ shipping: [uk] }, '')
    expect(node).toBeUndefined()
    expect(warnings).toEqual(['settings: shipping skipped, no shop.currency is set'])
  })

  test('a time with only a minimum is left out with a warning; the row stays', () => {
    const { node, warnings } = ship({ shipping: [{ name: 'Min', countries: 'GB', cost: 3, handlingMin: 1, transitMin: 2 }] })
    expect(node?.shippingConditions).toMatchObject({ shippingRate: { value: 3 } })
    expect(node?.shippingConditions).not.toHaveProperty('transitTime')
    expect(node).not.toHaveProperty('handlingTime')
    expect(warnings).toEqual([
      'settings: shipping "Min" handling time left out, it needs a maximum number of days',
      'settings: shipping "Min" transit time left out, it needs a maximum number of days',
    ])
  })

  test('a time with only a maximum is kept', () => {
    const { node, warnings } = ship({ shipping: [{ countries: 'GB', cost: 3, handlingMax: 1, transitMax: 4 }] })
    const maxOnly = (maxValue: number) => ({ '@type': 'ServicePeriod', duration: { '@type': 'QuantitativeValue', maxValue, unitCode: 'DAY' } })
    expect(node?.shippingConditions).toMatchObject({ transitTime: maxOnly(4) })
    expect(node?.handlingTime).toEqual(maxOnly(1))
    expect(warnings).toEqual([])
  })

  test('rows with different handling days leave handling out with a warning', () => {
    const { node, warnings } = ship({ shipping: [uk, { countries: 'FR', cost: 9, handlingMin: 3, handlingMax: 4 }] })
    expect(node).not.toHaveProperty('handlingTime')
    expect(warnings).toHaveLength(1)
  })
})

describe('buildReturnPolicy', () => {
  test('finite policy with days, countries, fees, methods', () => {
    const { node, warnings } = policy({
      returns: { policy: 'finite', days: 30, countries: 'gb', fees: 'free', methods: ['mail', 'store'], link: '/returns' },
    })
    expect(node).toEqual({
      '@type': 'MerchantReturnPolicy',
      '@id': 'https://a.com/#returns',
      applicableCountry: 'GB',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30,
      returnFees: 'https://schema.org/FreeReturn',
      returnMethod: ['https://schema.org/ReturnByMail', 'https://schema.org/ReturnInStore'],
      merchantReturnLink: 'https://a.com/returns',
    })
    expect(warnings).toEqual([])
  })

  test('several countries output as an array; more than 50 are capped with a warning', () => {
    expect(policy({ returns: { policy: 'unlimited', countries: 'GB, FR' } }).node?.applicableCountry).toEqual(['GB', 'FR'])
    const letter = (n: number) => String.fromCharCode(65 + n)
    const many = Array.from({ length: 60 }, (_, i) => `${letter(Math.floor(i / 26))}${letter(i % 26)}`).join(',')
    const { node, warnings } = policy({ returns: { policy: 'unlimited', countries: many } })
    expect(node?.applicableCountry).toHaveLength(50)
    expect(warnings).toHaveLength(1)
  })

  test('no returns and unlimited use their own categories and carry no days', () => {
    const none = policy({ returns: { policy: 'none', days: 14, countries: 'GB', fees: 'free', methods: ['mail'] } }).node
    expect(none).toEqual({
      '@type': 'MerchantReturnPolicy',
      '@id': 'https://a.com/#returns',
      applicableCountry: 'GB',
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    })
    const unlimited = policy({ returns: { policy: 'unlimited', days: 14, countries: 'GB', methods: ['store'] } }).node
    expect(unlimited?.returnPolicyCategory).toBe('https://schema.org/MerchantReturnUnlimitedWindow')
    expect(unlimited).not.toHaveProperty('merchantReturnDays')
    expect(unlimited?.returnMethod).toBe('https://schema.org/ReturnInStore')
  })

  test('a finite policy with no days is dropped, unless a link is set (link alone is valid)', () => {
    const dropped = policy({ returns: { policy: 'finite', countries: 'GB' } })
    expect(dropped.node).toBeUndefined()
    expect(dropped.warnings).toHaveLength(1)
    const linked = policy({ returns: { policy: 'finite', countries: 'GB', link: 'https://a.com/returns' } })
    expect(linked.node).toEqual({ '@type': 'MerchantReturnPolicy', '@id': 'https://a.com/#returns', merchantReturnLink: 'https://a.com/returns' })
    expect(linked.warnings).toHaveLength(1)
  })

  test('a link with no policy outputs the link alone, with no warning', () => {
    const { node, warnings } = policy({ returns: { link: '/returns' } })
    expect(node).toEqual({ '@type': 'MerchantReturnPolicy', '@id': 'https://a.com/#returns', merchantReturnLink: 'https://a.com/returns' })
    expect(warnings).toEqual([])
  })

  test('a policy with neither a country nor a link is dropped with a warning', () => {
    const { node, warnings } = policy({ returns: { policy: 'unlimited' } })
    expect(node).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  test('return shipping fee needs an amount above 0, else fees left out with a warning', () => {
    const ok = policy({ returns: { policy: 'finite', days: 30, countries: 'GB', fees: 'shipping', feeAmount: 3.99 } })
    expect(ok.node?.returnFees).toBe('https://schema.org/ReturnShippingFees')
    expect(ok.node?.returnShippingFeesAmount).toEqual({ '@type': 'MonetaryAmount', value: 3.99, currency: 'GBP' })
    for (const feeAmount of [0, null, undefined]) {
      const bad = policy({ returns: { policy: 'finite', days: 30, countries: 'GB', fees: 'shipping', feeAmount } })
      expect(bad.node).not.toHaveProperty('returnFees')
      expect(bad.node).not.toHaveProperty('returnShippingFeesAmount')
      expect(bad.node?.merchantReturnDays).toBe(30)
      expect(bad.warnings).toHaveLength(1)
    }
    const noCurrency = policy({ returns: { policy: 'finite', days: 30, countries: 'GB', fees: 'shipping', feeAmount: 2 } }, '')
    expect(noCurrency.node).not.toHaveProperty('returnFees')
  })

  test('customer pays maps to ReturnFeesCustomerResponsibility', () => {
    expect(policy({ returns: { policy: 'unlimited', countries: 'GB', fees: 'customer' } }).node?.returnFees).toBe(
      'https://schema.org/ReturnFeesCustomerResponsibility',
    )
  })

  test('no returns settings: nothing', () => {
    expect(policy({}).node).toBeUndefined()
    expect(policy({ returns: null }).node).toBeUndefined()
  })
})

describe('shop settings in buildStructuredData', () => {
  const productsConfig: CollectionOptions = { type: 'Product', path: (doc) => `/products/${doc.slug}` }
  const options: ResolvedOptions = {
    siteUrl: 'https://a.com',
    shop: { currency: 'GBP', currencies: [{ code: 'GBP', decimals: 2 }] },
    collections: { products: productsConfig },
  }
  const doc = { id: 1, title: 'Watch', slug: 'watch', inventory: 1, priceInGBPEnabled: true, priceInGBP: 5000 }
  const offerLink = (settings: object) => {
    const result = buildStructuredData({ options, settings, collection: 'products', doc })
    const product = result.graph?.['@graph'].find((n) => n['@type'] === 'Product')
    return { graph: result.graph?.['@graph'], offer: product?.offers as Record<string, unknown> | undefined }
  }

  test('Organization carries both nodes and offers link the return policy', () => {
    const { graph, offer } = offerLink({
      name: 'Acme',
      shop: { shipping: [uk], returns: { policy: 'finite', days: 30, countries: 'GB' } },
    })
    const org = graph?.[0]
    expect(org?.hasShippingService).toMatchObject({ '@id': 'https://a.com/#shipping' })
    expect(org?.hasMerchantReturnPolicy).toMatchObject({ '@id': 'https://a.com/#returns' })
    expect(offer?.hasMerchantReturnPolicy).toEqual({ '@id': 'https://a.com/#returns' })
    expect(offer).not.toHaveProperty('shippingDetails')
  })

  test('no return policy built: offers carry no link', () => {
    const { offer } = offerLink({ name: 'Acme', shop: { shipping: [uk] } })
    expect(offer).not.toHaveProperty('hasMerchantReturnPolicy')
  })

  test('no Organization (no name): offers carry no link', () => {
    const { offer } = offerLink({ shop: { returns: { policy: 'unlimited', countries: 'GB' } } })
    expect(offer).not.toHaveProperty('hasMerchantReturnPolicy')
  })
})
