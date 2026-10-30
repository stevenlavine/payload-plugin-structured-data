import { describe, expect, test } from 'vitest'
import type { CollectionOptions, Doc, JsonLdNode, ResolvedOptions } from '../types.js'
import { buildStructuredData } from './buildStructuredData.js'

const eventsConfig: CollectionOptions = { type: 'Event', path: (d) => `/events/${d.slug}` }

const optionsFor = (config: CollectionOptions = eventsConfig, timeZone: string | null = 'Europe/London'): ResolvedOptions => ({
  siteUrl: 'https://example.com',
  ...(timeZone ? { timeZone } : {}),
  collections: { events: config },
})

const place = {
  name: 'Town Hall',
  streetAddress: '1 High Street',
  addressLocality: 'Ashford',
  addressRegion: 'Kent',
  postalCode: 'TN24 8BT',
  addressCountry: 'GB',
}

const baseDoc: Doc = {
  id: 1,
  slug: 'opening',
  title: 'Opening night',
  meta: { description: 'Doors at seven.', image: { url: '/media/opening.jpg' } },
  startDate: '2027-07-14T18:30:00.000Z',
  endDate: '2027-07-14T21:00:00.000Z',
  location: place,
}

const run = (doc: Doc, options = optionsFor()) =>
  buildStructuredData({ options, settings: { name: 'Acme' }, collection: 'events', doc })
const eventOf = (result: ReturnType<typeof run>): JsonLdNode | undefined =>
  result.graph?.['@graph'].find((n) => n['@type'] === 'Event')

describe('Event node', () => {
  test('a full document gives one Event in graph order', () => {
    const result = run(baseDoc)
    expect(result.graph?.['@graph'].map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'Event', 'BreadcrumbList'])
    expect(result.warnings).toEqual([])
    expect(eventOf(result)).toEqual({
      '@type': 'Event',
      '@id': 'https://example.com/events/opening#event',
      url: 'https://example.com/events/opening',
      name: 'Opening night',
      description: 'Doors at seven.',
      image: 'https://example.com/media/opening.jpg',
      startDate: '2027-07-14T19:30:00+01:00',
      endDate: '2027-07-14T22:00:00+01:00',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: 'Town Hall',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '1 High Street',
          addressLocality: 'Ashford',
          addressRegion: 'Kent',
          postalCode: 'TN24 8BT',
          addressCountry: 'GB',
        },
      },
    })
  })

  test('mapped location paths and field names override the defaults', () => {
    const config: CollectionOptions = {
      ...eventsConfig,
      fields: { headline: 'heading' },
      event: { startDate: 'when.starts', location: { name: 'venue.title', addressLocality: 'venue.town' } },
    }
    const doc: Doc = { id: 1, slug: 'x', heading: 'Mapped', when: { starts: '2027-01-10T20:00:00.000Z' }, venue: { title: 'The Barn', town: 'Hythe' } }
    const node = eventOf(run(doc, optionsFor(config)))
    expect(node?.name).toBe('Mapped')
    expect(node?.startDate).toBe('2027-01-10T20:00:00+00:00')
    expect(node?.location).toEqual({
      '@type': 'Place',
      name: 'The Barn',
      address: { '@type': 'PostalAddress', addressLocality: 'Hythe' },
    })
  })

  test('no title skips the Event with a warning, site nodes remain', () => {
    const result = run({ ...baseDoc, title: '' })
    expect(eventOf(result)).toBeUndefined()
    // no title also means no breadcrumb trail, as for other types
    expect(result.graph?.['@graph'].map((n) => n['@type'])).toEqual(['Organization', 'WebSite'])
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('Event skipped'))).toBe(true)
  })

  test('no start date skips with a warning', () => {
    const { startDate: _s, ...doc } = baseDoc
    const result = run(doc)
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('Event skipped'))).toBe(true)
  })

  test('a start date that is not a date skips with a warning', () => {
    const result = run({ ...baseDoc, startDate: 'nonsense' })
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('Event skipped') && w.includes('not a valid date'))).toBe(true)
  })

  test('no place skips with a warning', () => {
    const { location: _l, ...doc } = baseDoc
    const result = run(doc)
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('Event skipped'))).toBe(true)
  })

  test('an end date that is not a date is dropped with a warning', () => {
    const result = run({ ...baseDoc, endDate: 'soon' })
    const node = eventOf(result)
    expect(node).toBeDefined()
    expect(node).not.toHaveProperty('endDate')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('an end date before the start is dropped, the node remains', () => {
    const result = run({ ...baseDoc, endDate: '2027-07-14T10:00:00.000Z' })
    const node = eventOf(result)
    expect(node?.startDate).toBe('2027-07-14T19:30:00+01:00')
    expect(node).not.toHaveProperty('endDate')
    expect(result.warnings.some((w) => w.includes('endDate'))).toBe(true)
  })

  test('a stored zone beats the plugin option, per date', () => {
    const doc = { ...baseDoc, startDate: '2027-07-14T23:30:00.000Z', startDate_tz: 'America/New_York', endDate: '2027-07-15T02:00:00.000Z' }
    const node = eventOf(run(doc))
    expect(node?.startDate).toBe('2027-07-14T19:30:00-04:00')
    // the end has no zone of its own, so it follows the start's
    expect(node?.endDate).toBe('2027-07-14T22:00:00-04:00')
  })

  test('a stored zone is read beside a nested date path', () => {
    const config: CollectionOptions = { ...eventsConfig, event: { startDate: 'when.starts' } }
    const doc: Doc = { ...baseDoc, when: { starts: '2027-07-14T23:30:00.000Z', starts_tz: 'America/New_York' } }
    expect(eventOf(run(doc, optionsFor(config)))?.startDate).toBe('2027-07-14T19:30:00-04:00')
  })

  test('a bad stored zone warns and falls back to the plugin option', () => {
    const result = run({ ...baseDoc, startDate_tz: 'Not/AZone' })
    expect(eventOf(result)?.startDate).toBe('2027-07-14T19:30:00+01:00')
    expect(result.warnings.some((w) => w.includes('Not/AZone'))).toBe(true)
  })

  test('with no zone anywhere the date is written in UTC with a warning', () => {
    const result = run(baseDoc, optionsFor(eventsConfig, null))
    expect(eventOf(result)?.startDate).toBe('2027-07-14T18:30:00+00:00')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  describe('dateOnly', () => {
    const late = { ...baseDoc, startDate: '2027-07-14T23:30:00.000Z', endDate: '2027-07-15T08:00:00.000Z' }

    test('true gives dates in the event zone', () => {
      const config: CollectionOptions = { ...eventsConfig, event: { dateOnly: true } }
      const node = eventOf(run(late, optionsFor(config)))
      expect(node?.startDate).toBe('2027-07-15')
      expect(node?.endDate).toBe('2027-07-15')
    })

    test('a field path reads each document', () => {
      const config: CollectionOptions = { ...eventsConfig, event: { dateOnly: 'allDay' } }
      expect(eventOf(run({ ...late, allDay: true }, optionsFor(config)))?.startDate).toBe('2027-07-15')
      expect(eventOf(run({ ...late, allDay: false }, optionsFor(config)))?.startDate).toBe('2027-07-15T00:30:00+01:00')
    })

    test('a function reads each document', () => {
      const config: CollectionOptions = { ...eventsConfig, event: { dateOnly: (d) => d.allDay === true } }
      expect(eventOf(run({ ...late, allDay: true }, optionsFor(config)))?.startDate).toBe('2027-07-15')
      expect(eventOf(run({ ...late, allDay: false }, optionsFor(config)))?.startDate).toBe('2027-07-15T00:30:00+01:00')
    })
  })
})

describe('Event type rules', () => {
  const override = { ...baseDoc, structuredData: { type: 'Event' } }

  test('a stored Event override is ignored where Event is not allowed', () => {
    const config: CollectionOptions = { type: 'Article', path: (d) => `/events/${d.slug}` }
    const result = run(override, optionsFor(config))
    expect(eventOf(result)).toBeUndefined()
    expect(result.graph?.['@graph'].map((n) => n['@type'])).toContain('Article')
  })

  test('a type function returning Event without permission gives a warning and no Event', () => {
    const config: CollectionOptions = { type: () => 'Event', path: (d) => `/events/${d.slug}` }
    const result = run(baseDoc, optionsFor(config))
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('Event'))).toBe(true)
  })

  test('an Article collection with an event block accepts a stored Event override', () => {
    const config: CollectionOptions = { type: 'Article', path: (d) => `/events/${d.slug}`, event: {} }
    const result = run(override, optionsFor(config))
    expect(eventOf(result)?.name).toBe('Opening night')
  })
})
