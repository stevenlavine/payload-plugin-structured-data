import { describe, expect, test } from 'vitest'
import type { ResolvedOptions, Settings } from '../types.js'
import { buildOrganization, buildWebSite, organizationId, websiteId } from './siteNodes.js'

const options: ResolvedOptions = { siteUrl: 'https://a.com', collections: {}, imageSize: 'og' }

const full: Settings = {
  organizationType: 'Organization',
  name: 'Acme Studio',
  legalName: 'Acme Studio Ltd',
  description: 'We build things.',
  logo: { url: '/media/logo.png' },
  email: 'hi@a.com',
  telephone: '+441234567890',
  address: { addressLocality: 'Ashford', addressRegion: 'Kent', addressCountry: 'GB' },
  sameAs: [{ url: 'https://github.com/acme' }, { url: '' }],
  areaServed: [{ name: 'Kent' }, { name: 'United Kingdom' }],
  foundingDate: '2025-05-01',
  founder: { name: 'Sam Smith', jobTitle: 'Founder' },
  identifiers: [{ propertyID: 'Companies House company number', value: '12345678' }],
}

describe('buildOrganization', () => {
  test('builds a full Organization node', () => {
    const warnings: string[] = []
    expect(buildOrganization(full, options, warnings)).toEqual({
      '@type': 'Organization',
      '@id': 'https://a.com/#organization',
      name: 'Acme Studio',
      url: 'https://a.com',
      legalName: 'Acme Studio Ltd',
      description: 'We build things.',
      logo: 'https://a.com/media/logo.png',
      image: 'https://a.com/media/logo.png',
      email: 'hi@a.com',
      telephone: '+441234567890',
      address: { '@type': 'PostalAddress', addressLocality: 'Ashford', addressRegion: 'Kent', addressCountry: 'GB' },
      areaServed: ['Kent', 'United Kingdom'],
      sameAs: ['https://github.com/acme'],
      foundingDate: '2025-05-01',
      founder: { '@type': 'Person', name: 'Sam Smith', jobTitle: 'Founder' },
      identifier: [{ '@type': 'PropertyValue', propertyID: 'Companies House company number', value: '12345678' }],
    })
    expect(warnings).toEqual([])
  })

  test('image uses its own upload, preferring the image size', () => {
    const node = buildOrganization(
      { ...full, image: { url: '/media/shop.jpg', sizes: { og: { url: '/media/shop-og.jpg' } } } },
      options,
      [],
    )
    expect(node?.image).toBe('https://a.com/media/shop-og.jpg')
    expect(node?.logo).toBe('https://a.com/media/logo.png')
  })

  test('image falls back to the logo, and is left out when neither is set', () => {
    expect(buildOrganization({ name: 'Acme', logo: { url: '/media/logo.png' } }, options, [])?.image).toBe(
      'https://a.com/media/logo.png',
    )
    expect(buildOrganization({ name: 'Acme', image: 7 }, options, [])).not.toHaveProperty('image')
  })

  test('leaves out empty optional properties', () => {
    const node = buildOrganization({ name: 'Acme' }, options, [])
    expect(node).toEqual({ '@type': 'Organization', '@id': 'https://a.com/#organization', name: 'Acme', url: 'https://a.com' })
  })

  test('no settings or no name gives null and a warning', () => {
    const warnings: string[] = []
    expect(buildOrganization(null, options, warnings)).toBeNull()
    expect(buildOrganization({ name: '  ' }, options, warnings)).toBeNull()
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('Organization skipped')
  })

  test('LocalBusiness without an address falls back to Organization', () => {
    const warnings: string[] = []
    const node = buildOrganization({ name: 'Acme', organizationType: 'LocalBusiness' }, options, warnings)
    expect(node?.['@type']).toBe('Organization')
    expect(warnings[0]).toContain('LocalBusiness needs an address')
  })

  test('LocalBusiness with an address stays LocalBusiness', () => {
    const node = buildOrganization({ ...full, organizationType: 'LocalBusiness' }, options, [])
    expect(node?.['@type']).toBe('LocalBusiness')
  })
})

describe('buildWebSite', () => {
  test('links the publisher and adds search when configured', () => {
    const node = buildWebSite(full, { ...options, search: { urlTemplate: 'https://a.com/search?q={search_term_string}' } }, true)
    expect(node).toEqual({
      '@type': 'WebSite',
      '@id': 'https://a.com/#website',
      name: 'Acme Studio',
      url: 'https://a.com',
      publisher: { '@id': 'https://a.com/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: 'https://a.com/search?q={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    })
  })

  test('no publisher link without an organization; null without a name', () => {
    expect(buildWebSite(full, options, false)).not.toHaveProperty('publisher')
    expect(buildWebSite(null, options, false)).toBeNull()
  })

  test('ids', () => {
    expect(organizationId('https://a.com/')).toBe('https://a.com/#organization')
    expect(websiteId('https://a.com')).toBe('https://a.com/#website')
  })
})

describe('buildWebSite search', () => {
  test('no SearchAction when search is undefined', () => {
    const node = buildWebSite({ name: 'Acme' }, options, false)
    expect(node).not.toHaveProperty('potentialAction')
  })
})
