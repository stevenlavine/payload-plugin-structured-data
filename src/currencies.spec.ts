import { describe, expect, test } from 'vitest'
import { currencyDecimals } from './currencies.js'

describe('currencyDecimals', () => {
  test('falls back to Intl', () => {
    expect(currencyDecimals('GBP', [])).toBe(2)
    expect(currencyDecimals('JPY', [])).toBe(0)
    expect(currencyDecimals('KWD', [])).toBe(3)
  })
  test('known list wins', () => {
    expect(currencyDecimals('GBP', [{ code: 'GBP', decimals: 3 }])).toBe(3)
  })
  test('unknown code is undefined', () => {
    expect(currencyDecimals('XXQ', [])).toBeUndefined()
  })
})
