import { describe, expect, it } from 'vitest'

import { checkSchemaOrg } from './checkSchemaOrg.js'

describe('checkSchemaOrg', () => {
  it('accepts a valid node', () => {
    expect(
      checkSchemaOrg({ '@type': 'Organization', '@id': 'x', name: 'A', url: 'https://a.com' }),
    ).toEqual([])
  })

  it('flags an unknown property', () => {
    const messages = checkSchemaOrg({ '@type': 'Organization', nmae: 'A' })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Organization.nmae')
  })

  it('flags a nested object of the wrong type', () => {
    const messages = checkSchemaOrg({ '@type': 'BlogPosting', author: { '@type': 'PostalAddress' } })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('BlogPosting.author')
  })

  it('accepts a subtype in range', () => {
    expect(
      checkSchemaOrg({ '@type': 'BlogPosting', publisher: { '@type': 'LocalBusiness', name: 'A' } }),
    ).toEqual([])
  })

  it('accepts strings for object ranges', () => {
    expect(
      checkSchemaOrg({ '@type': 'WebPage', primaryImageOfPage: 'https://a.com/i.png' }),
    ).toEqual([])
  })

  it('accepts @id references', () => {
    expect(
      checkSchemaOrg({ '@type': 'BlogPosting', publisher: { '@id': 'https://a.com/#organization' } }),
    ).toEqual([])
  })

  it('allows the documented extension', () => {
    expect(
      checkSchemaOrg({ '@type': 'SearchAction', 'query-input': 'required name=search_term_string' }),
    ).toEqual([])
  })

  it('flags an unknown type', () => {
    expect(checkSchemaOrg({ '@type': 'Organisation' })).toHaveLength(1)
  })

  it('walks arrays and nested objects, prefixing the path', () => {
    const messages = checkSchemaOrg(
      { '@type': 'Organization', address: { '@type': 'PostalAddress', stret: 'x' } },
      'root',
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('root.address.stret')
    const list = checkSchemaOrg({
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, bogus: true }],
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toContain('itemListElement[0]')
  })

  it('does not treat Object.prototype keys as properties', () => {
    const inherited = checkSchemaOrg({ '@type': 'Organization', toString: 'x' })
    expect(inherited).toHaveLength(1)
    expect(inherited[0]).toContain('Organization.toString')
    expect(() =>
      checkSchemaOrg({ '@type': 'Organization', constructor: { '@type': 'Person' } }),
    ).not.toThrow()
    expect(
      checkSchemaOrg({ '@type': 'Organization', constructor: { '@type': 'Person' } }),
    ).toHaveLength(1)
  })

  it('does not treat Object.prototype keys as types', () => {
    expect(() => checkSchemaOrg({ '@type': 'constructor', name: 'x' })).not.toThrow()
    expect(checkSchemaOrg({ '@type': 'constructor', name: 'x' })).toHaveLength(1)
    expect(
      checkSchemaOrg({ '@type': 'Organization', address: { '@type': 'toString' } }),
    ).toHaveLength(1)
  })

  it('flags superseded properties', () => {
    const messages = checkSchemaOrg({ '@type': 'Organization', members: 'x' })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Organization.members')
  })

  it('accepts a string or a number for a numeric range', () => {
    expect(checkSchemaOrg({ '@type': 'ListItem', position: '1' })).toEqual([])
    expect(checkSchemaOrg({ '@type': 'ListItem', position: 1 })).toEqual([])
  })

  it('flags a number where the range has no numeric type', () => {
    const messages = checkSchemaOrg({ '@type': 'BlogPosting', author: 42 })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('BlogPosting.author')
  })

  it('flags a boolean where the range has no Boolean', () => {
    const messages = checkSchemaOrg({ '@type': 'Organization', address: true })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Organization.address')
  })

  it('checks scalar types inside arrays', () => {
    const messages = checkSchemaOrg({ '@type': 'BlogPosting', author: ['A', 7] })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('BlogPosting.author[1]')
  })

  it('skips @ keys on untyped value objects', () => {
    expect(
      checkSchemaOrg({ '@type': 'WebPage', name: { '@value': 'x', '@language': 'en' } }),
    ).toEqual([])
  })
})
