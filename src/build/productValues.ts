import type { Doc, Mapped, ProductOptions } from '../types.js'
import { readFirst } from './values.js'

export type Availability = `https://schema.org/${'InStock' | 'OutOfStock' | 'SoldOut' | 'PreOrder' | 'PreSale' | 'LimitedAvailability' | 'BackOrder' | 'Discontinued' | 'OnlineOnly' | 'InStoreOnly'}`
export type Condition = `https://schema.org/${'NewCondition' | 'UsedCondition' | 'RefurbishedCondition'}`

export const STATUS_PREFIX = /^(?:https?:\/\/schema\.org\/)?/i

const AVAILABILITY_NAMES = [
  'InStock',
  'OutOfStock',
  'SoldOut',
  'PreOrder',
  'PreSale',
  'LimitedAvailability',
  'BackOrder',
  'Discontinued',
  'OnlineOnly',
  'InStoreOnly',
] as const

/** Keyed by lower-case Schema.org name */
export const AVAILABILITY_MAP: Record<string, Availability> = Object.fromEntries(
  AVAILABILITY_NAMES.map((name) => [name.toLowerCase(), `https://schema.org/${name}`]),
)

/** Products also accept madeToOrder. Google rejects MadeToOrder (hand-checked 2026-11-12), so it outputs BackOrder */
const PRODUCT_AVAILABILITY_MAP: Record<string, Availability> = { ...AVAILABILITY_MAP, madetoorder: 'https://schema.org/BackOrder' }

const CONDITION_MAP: Record<string, Condition> = {
  new: 'https://schema.org/NewCondition',
  newcondition: 'https://schema.org/NewCondition',
  used: 'https://schema.org/UsedCondition',
  usedcondition: 'https://schema.org/UsedCondition',
  refurbished: 'https://schema.org/RefurbishedCondition',
  refurbishedcondition: 'https://schema.org/RefurbishedCondition',
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Minor-unit digits that are safe to use: a whole number from 0 to 20 */
const validDecimals = (decimals: number): boolean => Number.isInteger(decimals) && decimals >= 0 && decimals <= 20

/** Whole minor units to major units. Undefined unless a positive integer: 0 is not a shop price */
export function minorToMajor(amount: unknown, decimals: number): number | undefined {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return undefined
  if (!validDecimals(decimals)) return undefined
  return Number((amount / 10 ** decimals).toFixed(decimals))
}

export type MoneyInput = {
  /** Upper-case ISO 4217 code */
  currency: string
  /** Undefined when the currency is unknown */
  decimals: number | undefined
  /** Where decimals came from: the configured list ('known') or the Intl fallback ('iso') */
  decimalsSource?: 'known' | 'iso'
  mapping?: ProductOptions['price']
  ref: string
}

/** A positive major-unit price: a number, or a plain decimal string */
function majorAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    const number = Number(value.trim())
    return number > 0 ? number : undefined
  }
  return undefined
}

/**
 * The price in one currency. The eCommerce shape (priceIn<CODE> with priceIn<CODE>Enabled true, minor units) wins,
 * then the mapping. Never guesses decimals and never returns a price for a currency that is not enabled.
 */
export function readMoney(source: Doc, input: MoneyInput, warnings: string[]): number | undefined {
  const { currency, decimals, decimalsSource, mapping, ref } = input
  const field = `priceIn${currency}`

  if (decimals !== undefined && !validDecimals(decimals)) {
    warnings.push(`${ref}: ${currency} price left out, ${decimals} is not a usable number of decimals (0 to 20)`)
    return undefined
  }

  if (source[`${field}Enabled`] === false) {
    warnings.push(`${ref}: ${currency} price left out, ${currency} is not enabled on this product`)
    return undefined
  }

  if (source[`${field}Enabled`] === true) {
    if (decimals === undefined) {
      warnings.push(`${ref}: ${currency} price left out, the number of decimals for ${currency} is not known (add it to shop.currencies)`)
      return undefined
    }
    const price = minorToMajor(source[field], decimals)
    if (price === undefined) {
      warnings.push(`${ref}: ${currency} price left out, ${field} is not a positive whole number of minor units`)
      return undefined
    }
    if (decimalsSource === 'iso') {
      warnings.push(
        `${ref}: ${currency} decimals came from the Intl fallback, not the eCommerce plugin; list ecommercePlugin first in the plugin order, or add ${currency} to shop.currencies`,
      )
    }
    return price
  }

  if (!mapping) {
    if (source[field] !== undefined || source[`${field}Enabled`] !== undefined) {
      warnings.push(`${ref}: ${currency} price left out, ${currency} is not enabled on this product`)
    }
    return undefined
  }

  const raw = readFirst(source, mapping.amount)
  if (raw === undefined) return undefined
  if (mapping.minorUnits) {
    if (decimals === undefined) {
      warnings.push(`${ref}: price left out, the number of decimals for ${currency} is not known (add it to shop.currencies)`)
      return undefined
    }
    const price = minorToMajor(raw, decimals)
    if (price === undefined) warnings.push(`${ref}: price left out, minor units must be a positive whole number`)
    return price
  }
  const price = majorAmount(raw)
  if (price === undefined) warnings.push(`${ref}: price left out, it must be a number above 0 or a plain decimal`)
  return price
}

/** Reads a mapped path, or calls the mapped function. A throw becomes a warning and undefined */
export function runMapped<T>(doc: Doc, mapped: Mapped<T> | undefined, ref: string, label: string, warnings: string[]): unknown {
  if (mapped === undefined) return undefined
  if (typeof mapped === 'function') {
    try {
      return mapped(doc) ?? undefined
    } catch (error) {
      warnings.push(`${ref}: ${label} function failed: ${errorText(error)}`)
      return undefined
    }
  }
  return readFirst(doc, mapped)
}

/** Availability: a mapped value, then stock, then nothing. Stock 0 never gives an in-stock value */
export function resolveAvailability(
  source: Doc,
  stockSource: Doc,
  product: ProductOptions | undefined,
  ref: string,
  warnings: string[],
): Availability | undefined {
  const mapped = runMapped(source, product?.availability, ref, 'availability', warnings)
  if (mapped !== undefined) {
    const known = typeof mapped === 'string' ? PRODUCT_AVAILABILITY_MAP[mapped.trim().replace(STATUS_PREFIX, '').toLowerCase()] : undefined
    if (known) return known
    warnings.push(`${ref}: availability mapping ignored, "${typeof mapped === 'string' ? mapped : typeof mapped}" is not a known availability`)
  }

  if (product?.stock === undefined) return undefined
  const stock = readFirst(stockSource, product.stock)
  if (stock === undefined) return undefined
  if (typeof stock !== 'number' || !Number.isFinite(stock)) {
    warnings.push(`${ref}: stock ignored, it is not a number`)
    return undefined
  }
  if (stock > 0) return 'https://schema.org/InStock'
  return product.outOfStock === 'SoldOut' ? 'https://schema.org/SoldOut' : 'https://schema.org/OutOfStock'
}

/** Condition: the mapping, then the shop default, then nothing */
export function resolveCondition(
  doc: Doc,
  product: ProductOptions | undefined,
  shopDefault: string | null | undefined,
  ref: string,
  warnings: string[],
): Condition | undefined {
  const mapped = runMapped(doc, product?.condition, ref, 'condition', warnings)
  if (mapped !== undefined) {
    const known = typeof mapped === 'string' ? CONDITION_MAP[mapped.trim().replace(STATUS_PREFIX, '').toLowerCase()] : undefined
    if (known) return known
    warnings.push(`${ref}: condition mapping ignored, "${typeof mapped === 'string' ? mapped : typeof mapped}" is not new, used or refurbished`)
  }
  return shopDefault ? CONDITION_MAP[shopDefault.trim().toLowerCase()] : undefined
}
