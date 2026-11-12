import { describe, expect, test } from 'vitest'
import { minorToMajor, readMoney, resolveAvailability, resolveCondition, runMapped } from './productValues.js'

describe('minorToMajor', () => {
  test('converts whole positive minor units', () => {
    expect(minorToMajor(1999, 2)).toBe(19.99)
    expect(minorToMajor(1750, 0)).toBe(1750)
    expect(minorToMajor(175000, 2)).toBe(1750)
  })
  test.each([[1999.5], [0], [-5], ['1999'], [null], [Number.NaN]])('%j gives undefined', (value) => {
    expect(minorToMajor(value, 2)).toBeUndefined()
  })
})

describe('readMoney', () => {
  const base = { currency: 'GBP', decimals: 2, ref: 'products/1' }

  test('reads priceInGBP only when priceInGBPEnabled is true', () => {
    const warnings: string[] = []
    expect(readMoney({ priceInGBP: 1999, priceInGBPEnabled: true }, base, warnings)).toBe(19.99)
    expect(warnings).toEqual([])
    expect(readMoney({ priceInGBP: 1999, priceInGBPEnabled: false }, base, [])).toBeUndefined()
  })

  test('warns when the currency is not enabled on the product', () => {
    const warnings: string[] = []
    expect(readMoney({ priceInGBP: 1999, priceInGBPEnabled: false }, base, warnings)).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('not enabled')
  })

  test('a mapped major-unit price is read as written; minorUnits converts', () => {
    const warnings: string[] = []
    expect(readMoney({ cost: 12.5 }, { ...base, mapping: { amount: 'cost' } }, warnings)).toBe(12.5)
    expect(readMoney({ cost: '12.50' }, { ...base, mapping: { amount: 'cost' } }, warnings)).toBe(12.5)
    expect(readMoney({ cost: 1250 }, { ...base, mapping: { amount: 'cost', minorUnits: true } }, warnings)).toBe(12.5)
    expect(warnings).toEqual([])
  })

  test('an explicitly disabled currency gives no price even with a mapping', () => {
    const warnings: string[] = []
    const price = readMoney({ priceInGBPEnabled: false, cost: 12 }, { ...base, mapping: { amount: 'cost' } }, warnings)
    expect(price).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  test('unusable decimals give no price and never throw', () => {
    for (const decimals of [101, 21, -1, 1.5, Number.NaN]) {
      const warnings: string[] = []
      const source = { priceInGBP: 1999, priceInGBPEnabled: true }
      expect(() => readMoney(source, { ...base, decimals }, warnings)).not.toThrow()
      expect(warnings).toHaveLength(1)
      expect(readMoney(source, { ...base, decimals }, [])).toBeUndefined()
      expect(minorToMajor(1999, decimals)).toBeUndefined()
    }
    expect(minorToMajor(1, 20)).toBeDefined()
  })

  test('a mapped zero is dropped with a warning', () => {
    const warnings: string[] = []
    expect(readMoney({ cost: 0 }, { ...base, mapping: { amount: 'cost' } }, warnings)).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  test('no decimals known: offer dropped with a warning, never a divide by 100', () => {
    const warnings: string[] = []
    const input = { ...base, currency: 'XXX', decimals: undefined }
    expect(readMoney({ priceInXXX: 1999, priceInXXXEnabled: true }, input, warnings)).toBeUndefined()
    expect(readMoney({ cost: 1999 }, { ...input, mapping: { amount: 'cost', minorUnits: true } }, warnings)).toBeUndefined()
    expect(warnings).toHaveLength(2)
  })

  test('an eCommerce-shaped price whose decimals came from the Intl fallback warns to list ecommercePlugin first', () => {
    const warnings: string[] = []
    const price = readMoney({ priceInGBP: 1999, priceInGBPEnabled: true }, { ...base, decimalsSource: 'iso' }, warnings)
    expect(price).toBe(19.99)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('ecommercePlugin')
    expect(warnings[0]).toContain('shop.currencies')
  })

  test('decimals from the known list give no fallback warning', () => {
    const warnings: string[] = []
    readMoney({ priceInGBP: 1999, priceInGBPEnabled: true }, { ...base, decimalsSource: 'known' }, warnings)
    expect(warnings).toEqual([])
  })
})

describe('runMapped', () => {
  test('reads a path, calls a function, and turns a throw into a warning', () => {
    const warnings: string[] = []
    expect(runMapped({ a: { b: 'x' } }, 'a.b', 'r', 'thing', warnings)).toBe('x')
    expect(runMapped({ a: 1 }, (doc) => `v${String(doc.a)}`, 'r', 'thing', warnings)).toBe('v1')
    expect(runMapped({}, () => null, 'r', 'thing', warnings)).toBeUndefined()
    expect(runMapped({}, undefined, 'r', 'thing', warnings)).toBeUndefined()
    expect(warnings).toEqual([])
    const throwing = () => {
      throw new Error('boom')
    }
    expect(runMapped({}, throwing, 'r', 'thing', warnings)).toBeUndefined()
    expect(warnings[0]).toContain('boom')
  })
})

describe('resolveAvailability', () => {
  test('a mapped value beats stock: madeToOrder at stock 0 gives BackOrder', () => {
    const doc = { status: 'madeToOrder', stock: 0 }
    expect(resolveAvailability(doc, doc, { availability: 'status', stock: 'stock' }, 'r', [])).toBe('https://schema.org/BackOrder')
    const named = { status: 'https://schema.org/MadeToOrder', stock: 0 }
    expect(resolveAvailability(named, named, { availability: 'status', stock: 'stock' }, 'r', [])).toBe('https://schema.org/BackOrder')
  })

  test('stock above 0 is InStock; 0 is OutOfStock; 0 with outOfStock SoldOut is SoldOut', () => {
    expect(resolveAvailability({}, { n: 3 }, { stock: 'n' }, 'r', [])).toBe('https://schema.org/InStock')
    expect(resolveAvailability({}, { n: 0 }, { stock: 'n' }, 'r', [])).toBe('https://schema.org/OutOfStock')
    expect(resolveAvailability({}, { n: 0 }, { stock: 'n', outOfStock: 'SoldOut' }, 'r', [])).toBe('https://schema.org/SoldOut')
  })

  test('no mapping and no stock field gives no availability', () => {
    expect(resolveAvailability({}, {}, undefined, 'r', [])).toBeUndefined()
    expect(resolveAvailability({}, {}, { stock: 'n' }, 'r', [])).toBeUndefined()
  })

  test('an unknown mapped value warns and falls through to stock', () => {
    const warnings: string[] = []
    expect(resolveAvailability({ s: 'maybe' }, { n: 0 }, { availability: 's', stock: 'n' }, 'r', warnings)).toBe('https://schema.org/OutOfStock')
    expect(warnings).toHaveLength(1)
  })

  test('a throwing availability function warns and falls through to stock', () => {
    const warnings: string[] = []
    const availability = () => {
      throw new Error('nope')
    }
    expect(resolveAvailability({}, { n: 2 }, { availability, stock: 'n' }, 'r', warnings)).toBe('https://schema.org/InStock')
    expect(warnings).toHaveLength(1)
  })

  test('a non-numeric stock warns and gives nothing', () => {
    const warnings: string[] = []
    expect(resolveAvailability({}, { n: 'lots' }, { stock: 'n' }, 'r', warnings)).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })
})

describe('resolveCondition', () => {
  test('mapping, then shop default, then nothing; accepts short and Schema.org names', () => {
    expect(resolveCondition({ c: 'used' }, { condition: 'c' }, 'new', 'r', [])).toBe('https://schema.org/UsedCondition')
    expect(resolveCondition({ c: 'RefurbishedCondition' }, { condition: 'c' }, null, 'r', [])).toBe('https://schema.org/RefurbishedCondition')
    expect(resolveCondition({ c: 'https://schema.org/NewCondition' }, { condition: 'c' }, null, 'r', [])).toBe('https://schema.org/NewCondition')
    expect(resolveCondition({}, { condition: 'c' }, 'refurbished', 'r', [])).toBe('https://schema.org/RefurbishedCondition')
    expect(resolveCondition({}, undefined, 'new', 'r', [])).toBe('https://schema.org/NewCondition')
    expect(resolveCondition({}, undefined, null, 'r', [])).toBeUndefined()
  })

  test('an unknown mapped value warns and falls back to the default', () => {
    const warnings: string[] = []
    expect(resolveCondition({ c: 'mint' }, { condition: 'c' }, 'new', 'r', warnings)).toBe('https://schema.org/NewCondition')
    expect(warnings).toHaveLength(1)
  })
})
