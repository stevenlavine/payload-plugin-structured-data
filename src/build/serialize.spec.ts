import { describe, expect, test } from 'vitest'
import { serializeJsonLd } from './serialize.js'

describe('serializeJsonLd', () => {
  const graph = {
    '@context': 'https://schema.org' as const,
    '@graph': [{ '@type': 'WebPage', name: 'Bad </script><script>alert(1)</script>' }],
  }

  test('contains no < character at all', () => {
    expect(serializeJsonLd(graph)).not.toContain('<')
  })

  test('escapes < as the six characters \\u003c', () => {
    const out = serializeJsonLd(graph)
    expect(out).toContain('\\u003c/script>')
    // byte check: backslash (0x5c) then u003c
    expect(out.indexOf(String.fromCharCode(0x5c) + 'u003c')).toBeGreaterThan(-1)
  })

  test('round-trips to the same data', () => {
    expect(JSON.parse(serializeJsonLd(graph))).toEqual(graph)
  })
})
