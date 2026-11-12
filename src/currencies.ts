import type { CollectionConfig, Field } from 'payload'
import type { CurrencyInfo } from './types.js'

const PRICE_FIELD = /^priceIn[A-Z]{3}$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function currencyOf(field: Field): CurrencyInfo | null {
  if (!('name' in field) || !PRICE_FIELD.test(field.name)) return null
  const components = isRecord(field.admin) ? field.admin.components : undefined
  const fieldComponent = isRecord(components) ? components.Field : undefined
  const clientProps = isRecord(fieldComponent) ? fieldComponent.clientProps : undefined
  const currency = isRecord(clientProps) ? clientProps.currency : undefined
  if (!isRecord(currency) || typeof currency.code !== 'string' || typeof currency.decimals !== 'number') return null
  return { code: currency.code.toUpperCase(), decimals: currency.decimals }
}

function walk(fields: Field[], found: CurrencyInfo[]): void {
  for (const field of fields) {
    const info = currencyOf(field)
    if (info) found.push(info)
    if (field.type === 'tabs') {
      for (const tab of field.tabs) walk(tab.fields, found)
    } else if ('fields' in field && Array.isArray(field.fields)) {
      walk(field.fields, found)
    }
  }
}

/** Currencies declared on the eCommerce plugin's price fields (priceInGBP and so on), first seen wins */
export function discoverCurrencies(collections: CollectionConfig[]): CurrencyInfo[] {
  const found: CurrencyInfo[] = []
  for (const collection of collections) walk(collection.fields, found)
  return found.filter((info, index) => found.findIndex((other) => other.code === info.code) === index)
}

/** Minor-unit digits for a currency: the known list first, then Intl. Undefined for an unknown code */
export function currencyDecimals(code: string, known: CurrencyInfo[]): number | undefined {
  const upper = code.toUpperCase()
  const match = known.find((info) => info.code.toUpperCase() === upper)
  if (match) return match.decimals
  try {
    // Intl accepts any well-formed three-letter code, so check it is a real currency first
    if (!Intl.supportedValuesOf('currency').includes(upper)) return undefined
    return new Intl.NumberFormat('en', { style: 'currency', currency: upper }).resolvedOptions().maximumFractionDigits
  } catch {
    return undefined
  }
}
