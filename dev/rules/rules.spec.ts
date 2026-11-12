import { describe, expect, it } from 'vitest'

import type { JsonLdGraph } from '../../src/types.js'
import { checkSchemaOrg } from './checkSchemaOrg.js'
import { fullGraphs } from './fixtures.js'
import { checkGoogle, GOOGLE_RULES, resolvesIn } from './google.js'

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every object in the graph, top-level nodes and nested ones, with the key it sits under */
const walk = (value: unknown, visit: (key: string, value: unknown) => void, key = ''): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, key))
    return
  }
  visit(key, value)
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) walk(v, visit, k)
  }
}

const URL_KEYS = new Set(['@id', 'image', 'item', 'logo', 'mainEntityOfPage', 'primaryImageOfPage', 'url'])

const graphs = fullGraphs()

const SCENARIOS = ['organization', 'localBusiness', 'blogPosting', 'article', 'service', 'webPage', 'faq', 'breadcrumbs',
  'event', 'eventRescheduled', 'festivalSession', 'eventDates', 'eventOnline', 'eventHybrid', 'listing',
  'productOneOff', 'productSold', 'productMadeToOrder', 'productMadeToOrderVariants', 'productVariants', 'productReviews',
  'shopPolicies', 'productTwoCurrencies', 'productTwoCurrenciesShop']

// Google does not support events with no real-world place, and its required-path check needs every
// `location` entry to have an address. The Google test skips those two.
const SCHEMA_ONLY = new Set(['eventHybrid', 'eventOnline'])

it('builds every scenario', () => {
  expect(Object.keys(graphs).sort()).toEqual([...SCENARIOS].sort())
})

for (const scenario of SCENARIOS) {
  describe(scenario, () => {
    const graph = graphs[scenario]
    const nodes = graph['@graph']

    it('every node is valid Schema.org', () => {
      for (const node of nodes) expect(checkSchemaOrg(node)).toEqual([])
    })

    it.skipIf(SCHEMA_ONLY.has(scenario))('every Google rule is met', () => {
      const problems: string[] = []
      walk(nodes, (_key, value) => {
        if (isRecord(value)) problems.push(...checkGoogle(value, graph))
      })
      expect(problems).toEqual([])
    })

    it('every URL is absolute', () => {
      const bad: string[] = []
      walk(nodes, (key, value) => {
        if (!URL_KEYS.has(key) || typeof value !== 'string') return
        if (key === '@id' && value.startsWith('#')) return
        if (!value.startsWith('https://')) bad.push(`${key}: ${value}`)
      })
      expect(bad).toEqual([])
    })

    it('nodes link by @id', () => {
      // A node may be defined nested inside another (the Organization's return policy), and offers link to it
      const ids: string[] = []
      walk(nodes, (_key, value) => {
        if (!isRecord(value) || typeof value['@id'] !== 'string') return
        if (Object.keys(value).length > 1) ids.push(value['@id'])
      })
      expect(new Set(ids).size).toBe(ids.length)
      const dangling: string[] = []
      walk(nodes, (_key, value) => {
        if (!isRecord(value)) return
        const keys = Object.keys(value)
        if (keys.length === 1 && keys[0] === '@id' && !ids.includes(String(value['@id']))) {
          dangling.push(String(value['@id']))
        }
      })
      expect(dangling).toEqual([])
    })
  })
}

describe('scenario contents', () => {
  const typesOf = (name: string) => graphs[name]?.['@graph'].map((n) => n['@type'])

  it('each scenario holds the node it is named for', () => {
    expect(typesOf('organization')).toEqual(['Organization', 'WebSite'])
    expect(typesOf('localBusiness')).toEqual(['LocalBusiness', 'WebSite'])
    expect(typesOf('blogPosting')).toEqual(['Organization', 'WebSite', 'BlogPosting', 'BreadcrumbList'])
    expect(typesOf('article')).toEqual(['Organization', 'WebSite', 'Article', 'BreadcrumbList'])
    expect(typesOf('service')).toEqual(['Organization', 'WebSite', 'Service', 'BreadcrumbList'])
    expect(typesOf('webPage')).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'])
    expect(typesOf('faq')).toEqual(['Organization', 'WebSite', 'WebPage', 'FAQPage', 'BreadcrumbList'])
    expect(typesOf('breadcrumbs')).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'])
    for (const name of ['event', 'eventRescheduled', 'festivalSession', 'eventOnline', 'eventHybrid']) {
      expect(typesOf(name)).toEqual(['Organization', 'WebSite', 'Event', 'BreadcrumbList'])
    }
    expect(typesOf('eventDates')).toEqual(['Organization', 'WebSite', 'Event', 'Event', 'Event', 'BreadcrumbList'])
    expect(typesOf('listing')).toEqual(['Organization', 'WebSite', 'ItemList'])
    for (const name of ['productOneOff', 'productSold', 'productMadeToOrder', 'productReviews', 'productTwoCurrencies', 'productTwoCurrenciesShop']) {
      expect(typesOf(name)).toEqual(['Organization', 'WebSite', 'Product', 'BreadcrumbList'])
    }
    for (const name of ['productVariants', 'productMadeToOrderVariants']) {
      expect(typesOf(name)).toEqual(['Organization', 'WebSite', 'ProductGroup', 'BreadcrumbList'])
    }
    expect(typesOf('shopPolicies')).toEqual(['Organization', 'WebSite'])
  })

  const eventNodes = (name: string) => graphs[name]?.['@graph'].filter((n) => n['@type'] === 'Event') ?? []

  it('eventDates holds 3 Event nodes with unique @id values', () => {
    const nodes = eventNodes('eventDates')
    expect(nodes).toHaveLength(3)
    expect(new Set(nodes.map((n) => n['@id'])).size).toBe(3)
  })

  it('festivalSession.superEvent carries a date and a physical place, so Google reads it as valid', () => {
    const superEvent = eventNodes('festivalSession')[0]?.superEvent as Json
    expect(isRecord(superEvent)).toBe(true)
    expect(superEvent.startDate).toBeTruthy()
    const location = superEvent.location as Json
    expect(isRecord(location) && isRecord(location.address)).toBe(true)
  })

  it('every startDate in event has an offset', () => {
    const dates: string[] = []
    walk(graphs.event?.['@graph'], (key, value) => {
      if (key === 'startDate' && typeof value === 'string') dates.push(value)
    })
    expect(dates.length).toBeGreaterThan(0)
    for (const date of dates) expect(date).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/)
    expect(dates[0]).toBe('2027-07-10T19:00:00+01:00')
  })

  it('the FAQ page holds all four questions from both blocks', () => {
    const faq = graphs.faq?.['@graph'].find((n) => n['@type'] === 'FAQPage')
    expect(faq?.mainEntity).toHaveLength(4)
  })

  it('the nested-docs trail gives Home plus every ancestor, at least two items (Google)', () => {
    const list = graphs.breadcrumbs?.['@graph'].find((n) => n['@type'] === 'BreadcrumbList')
    const items = list?.itemListElement as Json[]
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.map((i) => i.name)).toEqual(['Home', 'Services', 'AI consulting', 'Workshops'])
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4])
  })
})

describe('product scenario contents', () => {
  const productOf = (name: string) =>
    graphs[name]?.['@graph'].find((n) => n['@type'] === 'Product' || n['@type'] === 'ProductGroup') as Json
  const offerOf = (name: string) => productOf(name).offers as Json
  const variantsOf = (name: string) => productOf(name).hasVariant as Json[]
  const RETURNS = { '@id': 'https://example.com/#returns' }

  it('the one-off used item is in stock at its major-unit price, linked to the shop return policy', () => {
    expect(offerOf('productOneOff')).toMatchObject({
      price: 1750,
      priceCurrency: 'GBP',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      hasMerchantReturnPolicy: RETURNS,
    })
    expect(productOf('productOneOff').description).toBe('A brass duplex pocket watch by Barwise of London, c. 1830, in full working order.')
  })

  it('the sold item (stock 0) is SoldOut, never in stock', () => {
    expect(offerOf('productSold').availability).toBe('https://schema.org/SoldOut')
  })

  it('made to order outputs BackOrder (Google rejects MadeToOrder), with the shop default condition', () => {
    expect(offerOf('productMadeToOrder')).toMatchObject({
      availability: 'https://schema.org/BackOrder',
      itemCondition: 'https://schema.org/NewCondition',
    })
  })

  it('a made-to-order product with variants at stock 0 shows BackOrder on every variant', () => {
    const variants = variantsOf('productMadeToOrderVariants')
    expect(variants).toHaveLength(2)
    for (const variant of variants) expect((variant.offers as Json).availability).toBe('https://schema.org/BackOrder')
  })

  it('variants: size in variesBy, extras left out, draft skipped, each with its own price, sku, URL and stock', () => {
    const group = productOf('productVariants')
    expect(group.variesBy).toEqual(['https://schema.org/size'])
    expect(group.productGroupID).toBe('4433')
    const variants = variantsOf('productVariants')
    expect(variants.map((v) => v.sku)).toEqual(['4433-101', '4433-102', '4433-103'])
    expect(variants.map((v) => v.size)).toEqual(['0-3 months', '0-3 months', '3-6 months'])
    expect(variants.map((v) => (v.offers as Json).price)).toEqual([20, 25, 22])
    expect(variants.map((v) => (v.offers as Json).availability)).toEqual([
      'https://schema.org/InStock',
      'https://schema.org/InStock',
      'https://schema.org/SoldOut',
    ])
    expect((variants[0]?.offers as Json).url).toBe('https://example.com/products/loopy-cardigan?size=11&extras=21&variant=101')
    expect(variants[0]?.image).toEqual(['https://example.com/media/cardigan-small-1200x630.png'])
    for (const variant of variants) expect((variant.offers as Json).hasMerchantReturnPolicy).toEqual(RETURNS)
  })

  it('reviews: the supplied rating and reviews sit on the product as given', () => {
    const product = productOf('productReviews')
    expect(product.aggregateRating).toMatchObject({ ratingValue: 4.8, reviewCount: 12 })
    expect(product.review).toHaveLength(2)
  })

  it('shop policies: shipping and returns on the Organization, each with its own @id', () => {
    const organization = graphs.shopPolicies?.['@graph'][0] as Json
    expect((organization.hasShippingService as Json)['@id']).toBe('https://example.com/#shipping')
    expect((organization.hasMerchantReturnPolicy as Json)['@id']).toBe('https://example.com/#returns')
    // The times are present, so the ServicePeriod duration rules above are checked on this scenario
    const service = organization.hasShippingService as Json
    expect(service.handlingTime).toMatchObject({ '@type': 'ServicePeriod', duration: { maxValue: 1, unitCode: 'DAY' } })
    for (const condition of service.shippingConditions as Json[]) {
      expect(condition.transitTime).toMatchObject({ '@type': 'ServicePeriod', duration: { unitCode: 'DAY' } })
    }
  })

  const currenciesIn = (value: unknown): string[] => {
    const found: string[] = []
    walk(value, (key, v) => {
      if ((key === 'priceCurrency' || key === 'currency') && typeof v === 'string') found.push(v)
    })
    return [...new Set(found)]
  }

  it('two currencies enabled, rendered with currency EUR: the product holds EUR only', () => {
    expect(offerOf('productTwoCurrencies')).toMatchObject({ price: 1400, priceCurrency: 'EUR' })
    expect(currenciesIn(productOf('productTwoCurrencies'))).toEqual(['EUR'])
    // Shipping rates are in shop.currency by design; they are the only other currency on the page
    const others = graphs.productTwoCurrencies?.['@graph'].filter((n) => n !== productOf('productTwoCurrencies'))
    expect(currenciesIn(others)).toEqual(['GBP'])
    expect(currenciesIn((graphs.productTwoCurrencies?.['@graph'][0] as Json).hasShippingService)).toEqual(['GBP'])
  })

  it('two currencies enabled, rendered with shop.currency: GBP only', () => {
    expect(offerOf('productTwoCurrenciesShop')).toMatchObject({ price: 1200, priceCurrency: 'GBP' })
    expect(currenciesIn(graphs.productTwoCurrenciesShop?.['@graph'])).toEqual(['GBP'])
  })

  it('category breadcrumbs follow the parent chain', () => {
    const list = graphs.productOneOff?.['@graph'].find((n) => n['@type'] === 'BreadcrumbList')
    expect((list?.itemListElement as Json[]).map((i) => i.name)).toEqual(['Home', 'Antiques', 'Clocks', 'Brass Calibre Duplex by Barwise'])
  })
})

describe('GOOGLE_RULES', () => {
  it('every entry records its source page and the day it was checked', () => {
    for (const rule of Object.values(GOOGLE_RULES)) {
      expect(rule.source).toMatch(/^https:\/\/developers\.google\.com\/search\//)
      expect(rule.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('every knownGap is a recommended property, and really is missing from the output', () => {
    for (const [type, rule] of Object.entries(GOOGLE_RULES)) {
      for (const gap of Object.keys(rule.knownGaps ?? {})) {
        expect(rule.recommended, `${type}: ${gap}`).toContain(gap)
        for (const graph of Object.values(graphs)) {
          walk(graph['@graph'], (_key, value) => {
            if (isRecord(value) && value['@type'] === type) {
              expect(resolvesIn(value, gap, graph), `${type}.${gap} is output, drop it from knownGaps`).toBe(false)
            }
          })
        }
      }
    }
  })
})

describe('the checker catches a broken node', () => {
  const clone = () => structuredClone(graphs.blogPosting)
  const postOf = (graph: JsonLdGraph) => graph['@graph'].find((n) => n['@type'] === 'BlogPosting') as Json

  it('a misspelt property fails Schema.org', () => {
    const graph = clone()
    const post = postOf(graph)
    post.headlin = 'x'
    expect(checkSchemaOrg(post)).toEqual(['BlogPosting.headlin: unknown property for BlogPosting'])
  })

  it('a missing recommended property fails Google', () => {
    const graph = clone()
    const post = postOf(graph)
    delete post.headline
    expect(checkGoogle(post, graph)).toEqual(['BlogPosting: recommended "headline" is missing'])
  })

  it('a missing required property fails Google', () => {
    const graph = clone()
    const list = graph['@graph'].find((n) => n['@type'] === 'BreadcrumbList') as Json
    delete list.itemListElement
    expect(checkGoogle(list, graph)).toEqual(['BreadcrumbList: required "itemListElement" is missing'])
  })

  it('an array @type is checked against each type', () => {
    const graph = clone()
    const list = graph['@graph'].find((n) => n['@type'] === 'BreadcrumbList') as Json
    list['@type'] = ['BreadcrumbList', 'Thing']
    delete list.itemListElement
    expect(checkGoogle(list, graph)).toEqual(['BreadcrumbList: required "itemListElement" is missing'])
  })

  it('a topLevelOnly rule ignores a nested node of that type', () => {
    const graph = clone()
    const stub = { '@type': 'Event', '@id': 'https://example.com/f#event', name: 'F', url: 'https://example.com/f' }
    expect(checkGoogle(stub, graph)).toEqual([])
    graph['@graph'].push(stub as never)
    expect(checkGoogle(stub, graph)).toContain('Event: required "startDate" is missing')
  })

  it('previousStartDate is only asked for on a rescheduled event', () => {
    const graph = clone()
    const event = { '@type': 'Event', eventStatus: 'https://schema.org/EventScheduled' }
    graph['@graph'].push(event as never)
    expect(checkGoogle(event, graph).join()).not.toContain('previousStartDate')
    event.eventStatus = 'https://schema.org/EventRescheduled'
    expect(checkGoogle(event, graph)).toContain('Event: recommended "previousStartDate" is missing')
  })

  const alone = (node: Json): JsonLdGraph => ({ '@context': 'https://schema.org', '@graph': [node as never] })

  it('a Product with no offers, review or rating fails the snippet rule', () => {
    const node = { '@type': 'Product', name: 'Watch', image: 'https://example.com/w.jpg' }
    expect(checkGoogle(node, alone(node))).toContain('Product: required "offers|review|aggregateRating" is missing')
  })

  it('an Offer price with no currency fails', () => {
    const node = { '@type': 'Product', name: 'Watch', image: 'https://example.com/w.jpg', offers: { '@type': 'Offer', price: 20 } }
    const messages = checkGoogle(node, alone(node))
    expect(messages).toContain('Product: required "offers.priceCurrency" is missing')
    expect(messages).not.toContain('Product: required "offers.price" is missing')
  })

  it('a finite return window needs merchantReturnDays', () => {
    const policy = {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'GB',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    }
    expect(checkGoogle(policy, alone(policy))).toContain('MerchantReturnPolicy: recommended "merchantReturnDays" is missing')
    const unlimited = { ...policy, returnPolicyCategory: 'https://schema.org/MerchantReturnUnlimitedWindow' }
    expect(checkGoogle(unlimited, alone(unlimited)).join()).not.toContain('merchantReturnDays')
  })

  it('a flat-fee return needs returnShippingFeesAmount, a free one does not', () => {
    const policy = { '@type': 'MerchantReturnPolicy', merchantReturnLink: 'https://example.com/returns', returnFees: 'https://schema.org/ReturnShippingFees' }
    expect(checkGoogle(policy, alone(policy))).toContain('MerchantReturnPolicy: recommended "returnShippingFeesAmount" is missing')
    const free = { ...policy, returnFees: 'https://schema.org/FreeReturn' }
    expect(checkGoogle(free, alone(free)).join()).not.toContain('returnShippingFeesAmount')
  })

  it('a nested variant Product is checked through its group, not as a top-level Product', () => {
    const variant = { '@type': 'Product', sku: 'W-1' }
    const group = { '@type': 'ProductGroup', name: 'Watch', hasVariant: [variant] }
    const graph = alone(group)
    expect(checkGoogle(variant, graph)).toEqual([])
    expect(checkGoogle(group, graph)).toContain('ProductGroup: recommended "hasVariant.name" is missing')
  })

  it('a shop Organization is asked for both shipping and returns; one with no shop data for neither', () => {
    const organization = { '@type': 'Organization', name: 'Shop' }
    expect(checkGoogle(organization, alone(organization)).join()).not.toMatch(/hasShippingService|hasMerchantReturnPolicy/)
    const returnsOnly = { ...organization, hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', merchantReturnLink: 'https://example.com/returns' } }
    expect(checkGoogle(returnsOnly, alone(returnsOnly))).toContain('Organization: recommended "hasShippingService" is missing')
  })

  it('shipping times need a ServicePeriod with a maximum; a service with no times is not asked for one', () => {
    const condition = { '@type': 'ShippingConditions', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' } }
    const bare = { '@type': 'ShippingService', shippingConditions: condition }
    expect(checkGoogle(bare, alone(bare)).join()).not.toMatch(/handlingTime|transitTime/)
    const days = { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' }
    const flat = { ...bare, handlingTime: days, shippingConditions: { ...condition, transitTime: days } }
    expect(checkGoogle(flat, alone(flat))).toEqual(
      expect.arrayContaining([
        'ShippingService: recommended "handlingTime.duration.maxValue" is missing',
        'ShippingService: recommended "shippingConditions.transitTime.duration.maxValue" is missing',
      ]),
    )
    const period = { '@type': 'ServicePeriod', duration: days }
    const good = { ...bare, handlingTime: period, shippingConditions: { ...condition, transitTime: period } }
    expect(checkGoogle(good, alone(good)).join()).not.toMatch(/handlingTime|transitTime/)
  })

  it('a ShippingService without shippingConditions fails', () => {
    const node = { '@type': 'ShippingService' }
    expect(checkGoogle(node, alone(node))).toContain('ShippingService: required "shippingConditions" is missing')
  })
})
