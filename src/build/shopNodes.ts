import type { JsonLdNode, ShopSettings } from '../types.js'
import { absoluteUrl } from './values.js'

/** Google allows at most 50 countries on a return policy */
const MAX_RETURN_COUNTRIES = 50

const home = (siteUrl: string) => absoluteUrl(siteUrl, '/')
export const shippingId = (siteUrl: string) => `${home(siteUrl)}#shipping`
export const returnPolicyId = (siteUrl: string) => `${home(siteUrl)}#returns`

const schema = (term: string) => `https://schema.org/${term}`

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Two-letter codes from a comma-separated list: trimmed, upper-cased, duplicates and bad entries dropped */
function parseCountries(value: string | null | undefined): string[] {
  if (typeof value !== 'string') {return []}
  const codes = value
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code))
  return [...new Set(codes)]
}

type DayRange = { min?: number | null; max?: number | null }

/** False when a day range has a value that is not a whole number of days, or a minimum above its maximum */
function validDays({ min, max }: DayRange): boolean {
  const given = [min, max].filter((v) => v !== null && v !== undefined)
  if (!given.every((v) => isNumber(v) && Number.isInteger(v) && v >= 0)) {return false}
  return !(isNumber(min) && isNumber(max) && min > max)
}

/**
 * A valid day range as Google's ServicePeriod, its duration a QuantitativeValue in DAY.
 * Google needs a maximum: a range with only a minimum is left out with a warning.
 */
function servicePeriod({ min, max }: DayRange, what: string, warnings: string[]): JsonLdNode | undefined {
  if (!isNumber(max)) {
    if (isNumber(min)) {warnings.push(`${what} left out, it needs a maximum number of days`)}
    return undefined
  }
  return {
    '@type': 'ServicePeriod',
    duration: {
      '@type': 'QuantitativeValue',
      ...(isNumber(min) ? { minValue: min } : {}),
      maxValue: max,
      unitCode: 'DAY',
    },
  }
}

const money = (value: number, currency: string): JsonLdNode => ({ '@type': 'MonetaryAmount', value, currency })

/**
 * One ShippingService holding a ShippingConditions per usable row. A row with a free-over value
 * becomes two: a paid band below it and a free band from it.
 * Handling time sits on the service in Schema.org, so it is output only when every kept row agrees.
 */
export function buildShippingService(
  shop: ShopSettings,
  currency: string | undefined,
  siteUrl: string,
  warnings: string[],
): JsonLdNode | undefined {
  const rows = Array.isArray(shop.shipping) ? shop.shipping : []
  if (!rows.length) {return undefined}
  const code = currency?.trim().toUpperCase()
  if (!code) {
    warnings.push('settings: shipping skipped, no shop.currency is set')
    return undefined
  }

  const conditions: JsonLdNode[] = []
  const handlings: (JsonLdNode | undefined)[] = []

  rows.forEach((row, index) => {
    const label = row?.name?.trim() || `row ${index + 1}`
    const countries = parseCountries(row?.countries)
    if (!countries.length) {
      warnings.push(`settings: shipping "${label}" dropped, no valid two-letter country code`)
      return
    }
    if (!isNumber(row?.cost) || row.cost < 0) {
      warnings.push(`settings: shipping "${label}" dropped, no cost (use 0 for free)`)
      return
    }
    const handlingDays = { min: row.handlingMin, max: row.handlingMax }
    const transitDays = { min: row.transitMin, max: row.transitMax }
    if (!validDays(handlingDays) || !validDays(transitDays)) {
      warnings.push(`settings: shipping "${label}" dropped, handling and transit days must be whole numbers with the minimum not above the maximum`)
      return
    }
    const handling = servicePeriod(handlingDays, `settings: shipping "${label}" handling time`, warnings)
    const transit = servicePeriod(transitDays, `settings: shipping "${label}" transit time`, warnings)

    const base = {
      '@type': 'ShippingConditions',
      shippingDestination: countries.map((addressCountry) => ({ '@type': 'DefinedRegion', addressCountry })),
    }
    const withTransit = transit ? { transitTime: transit } : {}
    const hasFreeBand = isNumber(row.freeOver) && row.freeOver > 0 && row.cost > 0

    if (hasFreeBand) {
      const threshold = row.freeOver as number
      conditions.push({
        ...base,
        orderValue: { '@type': 'MonetaryAmount', maxValue: threshold, currency: code },
        shippingRate: money(row.cost, code),
        ...withTransit,
      } as JsonLdNode)
      conditions.push({
        ...base,
        orderValue: { '@type': 'MonetaryAmount', minValue: threshold, currency: code },
        shippingRate: money(0, code),
        ...withTransit,
      } as JsonLdNode)
    } else {
      conditions.push({ ...base, shippingRate: money(row.cost, code), ...withTransit } as JsonLdNode)
    }
    handlings.push(handling)
  })

  if (!conditions.length) {return undefined}

  const first = JSON.stringify(handlings[0] ?? null)
  const agree = handlings.every((h) => JSON.stringify(h ?? null) === first)
  if (!agree) {warnings.push('settings: shipping rows have different handling days, handling time left out (it can only be set once)')}
  const handlingTime = agree ? handlings[0] : undefined

  return {
    '@type': 'ShippingService',
    '@id': shippingId(siteUrl),
    shippingConditions: conditions.length === 1 ? conditions[0] : conditions,
    ...(handlingTime ? { handlingTime } : {}),
  }
}

const FEES = {
  free: 'FreeReturn',
  customer: 'ReturnFeesCustomerResponsibility',
  shipping: 'ReturnShippingFees',
} as const
const CATEGORIES = {
  finite: 'MerchantReturnFiniteReturnWindow',
  unlimited: 'MerchantReturnUnlimitedWindow',
  none: 'MerchantReturnNotPermitted',
} as const
const METHODS = { mail: 'ReturnByMail', store: 'ReturnInStore' } as const

/** The shop's MerchantReturnPolicy. Undefined when nothing usable is set */
export function buildReturnPolicy(
  shop: ShopSettings,
  siteUrl: string,
  warnings: string[],
  currency?: string,
): JsonLdNode | undefined {
  const returns = shop.returns
  if (!returns) {return undefined}
  const link = typeof returns.link === 'string' && returns.link.trim() ? absoluteUrl(siteUrl, returns.link.trim()) : undefined
  const id = returnPolicyId(siteUrl)
  const linkOnly = (): JsonLdNode | undefined => (link ? { '@type': 'MerchantReturnPolicy', '@id': id, merchantReturnLink: link } : undefined)

  const policy = returns.policy
  if (!policy) {return linkOnly()}
  if (!Object.hasOwn(CATEGORIES, policy)) {
    warnings.push(
      link
        ? `settings: returns policy "${String(policy)}" is not finite, unlimited or none, only the returns link is output`
        : `settings: returns policy dropped, "${String(policy)}" is not finite, unlimited or none`,
    )
    return linkOnly()
  }

  if (policy === 'finite' && !(isNumber(returns.days) && Number.isInteger(returns.days) && returns.days > 0)) {
    warnings.push(
      link
        ? 'settings: returns window has no whole number of days, only the returns link is output'
        : 'settings: returns policy dropped, a finite window needs a number of days',
    )
    return linkOnly()
  }

  let countries = parseCountries(returns.countries)
  if (countries.length > MAX_RETURN_COUNTRIES) {
    warnings.push(`settings: returns list ${countries.length} countries, Google allows ${MAX_RETURN_COUNTRIES}, keeping the first ${MAX_RETURN_COUNTRIES}`)
    countries = countries.slice(0, MAX_RETURN_COUNTRIES)
  }
  if (!countries.length && !link) {
    warnings.push('settings: returns policy dropped, it needs a country or a returns link')
    return undefined
  }

  const node: JsonLdNode = {
    '@type': 'MerchantReturnPolicy',
    '@id': id,
    ...(countries.length ? { applicableCountry: countries.length === 1 ? countries[0] : countries } : {}),
    returnPolicyCategory: schema(CATEGORIES[policy]),
  }
  if (policy === 'finite') {node.merchantReturnDays = returns.days}

  if (policy !== 'none') {
    if (returns.fees === 'shipping') {
      const code = currency?.trim().toUpperCase()
      if (isNumber(returns.feeAmount) && returns.feeAmount > 0 && code) {
        node.returnFees = schema(FEES.shipping)
        node.returnShippingFeesAmount = money(returns.feeAmount, code)
      } else {
        warnings.push('settings: return shipping fee left out, it needs an amount above 0 and a shop.currency')
      }
    } else if (returns.fees === 'free' || returns.fees === 'customer') {
      node.returnFees = schema(FEES[returns.fees])
    }
    const methods = (Array.isArray(returns.methods) ? returns.methods : []).filter((m): m is 'mail' | 'store' => m === 'mail' || m === 'store')
    if (methods.length) {
      const terms = [...new Set(methods)].map((m) => schema(METHODS[m]))
      node.returnMethod = terms.length === 1 ? terms[0] : terms
    }
  }
  if (link) {node.merchantReturnLink = link}
  return node
}
