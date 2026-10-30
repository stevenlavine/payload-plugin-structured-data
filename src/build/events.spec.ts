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
      organizer: { '@id': 'https://example.com/#organization' },
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

describe('Event place', () => {
  const { location: _l, ...noPlace } = baseDoc
  const typesOf = (r: ReturnType<typeof run>) => r.graph?.['@graph'].map((n) => n['@type'])

  test('an online link only gives a VirtualLocation and the online mode', () => {
    const node = eventOf(run({ ...noPlace, location: { onlineUrl: '/live/opening' } }))
    expect(node?.location).toEqual({ '@type': 'VirtualLocation', url: 'https://example.com/live/opening' })
    expect(String(node?.eventAttendanceMode).endsWith('OnlineEventAttendanceMode')).toBe(true)
  })

  test('a venue and an online link give both places and the mixed mode', () => {
    const node = eventOf(run({ ...baseDoc, location: { ...place, onlineUrl: 'https://zoom.example/abc' } }))
    expect(node?.eventAttendanceMode).toBe('https://schema.org/MixedEventAttendanceMode')
    expect(node?.location).toEqual([
      expect.objectContaining({ '@type': 'Place', name: 'Town Hall' }),
      { '@type': 'VirtualLocation', url: 'https://zoom.example/abc' },
    ])
  })

  test('neither a venue nor a link skips with a warning that names the paths tried', () => {
    const result = run(noPlace)
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('Event skipped') && w.includes('location.addressLocality') && w.includes('location.onlineUrl'))).toBe(true)
  })

  test('a venue name with no address is not a place', () => {
    const result = run({ ...baseDoc, location: { name: 'Town Hall' } })
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('Event skipped'))).toBe(true)
  })

  test('a location function outputs its place', () => {
    const config: CollectionOptions = {
      ...eventsConfig,
      event: { location: () => ({ name: 'The Hall', addressLocality: 'Ashford', addressCountry: 'GB' }) },
    }
    const node = eventOf(run(noPlace, optionsFor(config)))
    expect(node?.location).toEqual({
      '@type': 'Place',
      name: 'The Hall',
      address: { '@type': 'PostalAddress', addressLocality: 'Ashford', addressCountry: 'GB' },
    })
  })

  test('a location function returning null skips with a warning', () => {
    const config: CollectionOptions = { ...eventsConfig, event: { location: () => null } }
    const result = run(baseDoc, optionsFor(config))
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('Event skipped'))).toBe(true)
  })

  test('an unpopulated relationship skips with a warning naming the path, and does not throw', () => {
    const config: CollectionOptions = { ...eventsConfig, event: { location: { addressLocality: 'venue.town' } } }
    const result = run({ ...noPlace, venue: 7 }, optionsFor(config))
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('venue.town'))).toBe(true)
  })

  test('a throwing location function warns and the site nodes remain', () => {
    const config: CollectionOptions = {
      ...eventsConfig,
      event: {
        location: () => {
          throw new Error('boom')
        },
      },
    }
    const result = run(baseDoc, optionsFor(config))
    expect(eventOf(result)).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('boom') && w.includes('location'))).toBe(true)
    expect(typesOf(result)).toEqual(expect.arrayContaining(['Organization', 'WebSite']))
  })
})

describe('Event status', () => {
  const withStatus = (value: unknown, extra: Doc = {}) => run({ ...baseDoc, eventStatus: value, ...extra })

  test.each(['cancelled', 'EventCancelled', 'CANCELLED'])('%s gives EventCancelled', (value) => {
    expect(eventOf(withStatus(value))?.eventStatus).toBe('https://schema.org/EventCancelled')
  })

  test('movedOnline gives EventMovedOnline', () => {
    expect(eventOf(withStatus('movedOnline'))?.eventStatus).toBe('https://schema.org/EventMovedOnline')
  })

  test('an unknown value is left out with a warning', () => {
    const result = withStatus('sometime')
    expect(eventOf(result)).toBeDefined()
    expect(eventOf(result)).not.toHaveProperty('eventStatus')
    expect(result.warnings.some((w) => w.includes('sometime'))).toBe(true)
  })

  test('no status field leaves eventStatus out without a warning', () => {
    const result = run(baseDoc)
    expect(eventOf(result)).not.toHaveProperty('eventStatus')
    expect(result.warnings).toEqual([])
  })

  test('previousStartDate outputs with rescheduled', () => {
    const node = eventOf(withStatus('rescheduled', { previousStartDate: '2027-07-01T18:30:00.000Z' }))
    expect(node?.eventStatus).toBe('https://schema.org/EventRescheduled')
    expect(node?.previousStartDate).toBe('2027-07-01T19:30:00+01:00')
  })

  test.each(['scheduled', undefined])('previousStartDate is dropped with a warning when status is %s', (value) => {
    const result = withStatus(value, { previousStartDate: '2027-07-01T18:30:00.000Z' })
    expect(eventOf(result)).not.toHaveProperty('previousStartDate')
    expect(result.warnings.some((w) => w.includes('previousStartDate'))).toBe(true)
  })

  test('a mapped status path is read', () => {
    const config: CollectionOptions = { ...eventsConfig, event: { status: 'state' } }
    expect(eventOf(run({ ...baseDoc, state: 'postponed' }, optionsFor(config)))?.eventStatus).toBe('https://schema.org/EventPostponed')
  })
})

describe('Event offers', () => {
  const withOffers = (offers: unknown, event: NonNullable<CollectionOptions['event']> = {}) =>
    run({ ...baseDoc, offers }, optionsFor({ ...eventsConfig, event }))
  const offersOf = (result: ReturnType<typeof run>) => eventOf(result)?.offers

  const full = {
    price: 12,
    priceCurrency: 'GBP',
    availability: 'inStock',
    validFrom: '2027-03-01T09:00:00.000Z',
    url: '/tickets',
  }
  const fullOutput = {
    '@type': 'Offer',
    price: 12,
    priceCurrency: 'GBP',
    availability: 'https://schema.org/InStock',
    validFrom: '2027-03-01T09:00:00+00:00',
    url: 'https://example.com/tickets',
  }

  test('a full offer maps every field', () => {
    const result = withOffers([full])
    expect(offersOf(result)).toEqual([fullOutput])
    expect(result.warnings).toEqual([])
  })

  test('one object works the same as a one-row array', () => {
    expect(offersOf(withOffers(full))).toEqual([fullOutput])
  })

  test('no offers field gives no offers and no warning', () => {
    const result = run(baseDoc)
    expect(eventOf(result)).not.toHaveProperty('offers')
    expect(result.warnings).toEqual([])
  })

  test.each([[[]], [null], ['']])('an empty offers field (%j) gives no warning', (value) => {
    const result = withOffers(value)
    expect(eventOf(result)).not.toHaveProperty('offers')
    expect(result.warnings).toEqual([])
  })

  test('a price of 0 is kept', () => {
    expect(offersOf(withOffers({ price: 0, priceCurrency: 'GBP' }))).toEqual([{ '@type': 'Offer', price: 0, priceCurrency: 'GBP' }])
  })

  test('a numeric string price becomes a number', () => {
    expect(offersOf(withOffers({ price: '12.50', priceCurrency: 'GBP' }))).toEqual([
      { '@type': 'Offer', price: 12.5, priceCurrency: 'GBP' },
    ])
  })

  test('defaultCurrency fills an empty currency; a row currency wins', () => {
    const offers = [{ price: 5 }, { price: 6, priceCurrency: 'EUR' }]
    expect(offersOf(withOffers(offers, { offers: { defaultCurrency: 'GBP' } }))).toEqual([
      { '@type': 'Offer', price: 5, priceCurrency: 'GBP' },
      { '@type': 'Offer', price: 6, priceCurrency: 'EUR' },
    ])
  })

  test('a price with no currency and no default is dropped with a warning', () => {
    const result = withOffers({ price: 5, url: '/tickets' })
    expect(eventOf(result)).not.toHaveProperty('offers')
    expect(result.warnings.some((w) => w.includes('currency'))).toBe(true)
  })

  test('no price with a URL is kept, with no currency even with a default', () => {
    expect(offersOf(withOffers({ url: '/tickets' }, { offers: { defaultCurrency: 'GBP' } }))).toEqual([
      { '@type': 'Offer', url: 'https://example.com/tickets' },
    ])
  })

  test('no price with availability soldOut is kept', () => {
    expect(offersOf(withOffers({ availability: 'soldOut' }))).toEqual([
      { '@type': 'Offer', availability: 'https://schema.org/SoldOut' },
    ])
  })

  test('no price, no URL and no availability is dropped', () => {
    const result = withOffers({ name: 'Standard' })
    expect(eventOf(result)).not.toHaveProperty('offers')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('an unknown availability is left out with a warning; the offer stays', () => {
    const result = withOffers({ price: 5, priceCurrency: 'GBP', availability: 'maybe' })
    expect(offersOf(result)).toEqual([{ '@type': 'Offer', price: 5, priceCurrency: 'GBP' }])
    expect(result.warnings.some((w) => w.includes('maybe'))).toBe(true)
  })

  test('an unknown availability with nothing else drops the offer', () => {
    expect(eventOf(withOffers({ availability: 'maybe' }))).not.toHaveProperty('offers')
  })

  test.each([
    ['SoldOut', 'https://schema.org/SoldOut'],
    ['PreOrder', 'https://schema.org/PreOrder'],
    ['https://schema.org/InStock', 'https://schema.org/InStock'],
  ])('availability %s maps to %s', (value, expected) => {
    const offers = offersOf(withOffers({ price: 5, priceCurrency: 'GBP', availability: value })) as { availability: string }[]
    expect(offers[0]?.availability).toBe(expected)
  })

  test.each([[-1], ['free']])('price %j counts as no price, with a warning', (price) => {
    const result = withOffers({ price, priceCurrency: 'GBP', url: '/tickets' })
    expect(offersOf(result)).toEqual([{ '@type': 'Offer', url: 'https://example.com/tickets' }])
    expect(result.warnings.some((w) => w.includes('price'))).toBe(true)
  })

  test('an invalid validFrom is left out with a warning', () => {
    const result = withOffers({ price: 5, priceCurrency: 'GBP', validFrom: 'soon' })
    expect(offersOf(result)).toEqual([{ '@type': 'Offer', price: 5, priceCurrency: 'GBP' }])
    expect(result.warnings.some((w) => w.includes('validFrom'))).toBe(true)
  })

  test('validFrom uses the event time zone', () => {
    const offers = offersOf(withOffers({ price: 5, priceCurrency: 'GBP', validFrom: '2027-07-01T09:00:00.000Z' })) as {
      validFrom: string
    }[]
    expect(offers[0]?.validFrom).toBe('2027-07-01T10:00:00+01:00')
  })

  test('offers: 42 gives no offers and a warning, and does not throw', () => {
    const result = withOffers(42)
    expect(eventOf(result)).not.toHaveProperty('offers')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('junk rows are skipped; the valid offer stays', () => {
    const result = withOffers([null, 'x', { price: 5, priceCurrency: 'GBP' }])
    expect(offersOf(result)).toEqual([{ '@type': 'Offer', price: 5, priceCurrency: 'GBP' }])
    expect(result.warnings.length).toBeGreaterThanOrEqual(2)
  })

  test('mapped paths are read', () => {
    const offers = { path: 'tickets', price: 'cost', priceCurrency: 'cur', url: 'link', name: 'label' }
    const result = run(
      { ...baseDoc, tickets: [{ cost: 9, cur: 'GBP', link: '/buy', label: 'Standard' }] },
      optionsFor({ ...eventsConfig, event: { offers } }),
    )
    expect(offersOf(result)).toEqual([
      { '@type': 'Offer', name: 'Standard', price: 9, priceCurrency: 'GBP', url: 'https://example.com/buy' },
    ])
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

describe('Event organiser', () => {
  const withEvent = (event: NonNullable<CollectionOptions['event']>, doc: Doc = baseDoc, settings: Parameters<typeof buildStructuredData>[0]['settings'] = { name: 'Acme' }) =>
    buildStructuredData({ options: optionsFor({ ...eventsConfig, event }), settings, collection: 'events', doc })

  test('no mapping uses the site organisation', () => {
    expect(eventOf(run(baseDoc))?.organizer).toEqual({ '@id': 'https://example.com/#organization' })
  })

  test('no mapping and no settings gives no organizer', () => {
    const result = withEvent({}, baseDoc, null)
    expect(eventOf(result)).toBeDefined()
    expect(eventOf(result)).not.toHaveProperty('organizer')
  })

  test('a mapped organiser gives an Organization with an absolute URL', () => {
    const doc = { ...baseDoc, host: 'Kent Arts', hostUrl: '/arts' }
    const result = withEvent({ organizer: { name: 'host', url: 'hostUrl' } }, doc)
    expect(eventOf(result)?.organizer).toEqual({ '@type': 'Organization', name: 'Kent Arts', url: 'https://example.com/arts' })
  })

  test('type Person works', () => {
    const result = withEvent({ organizer: { name: 'host', type: 'Person' } }, { ...baseDoc, host: 'Sam' })
    expect(eventOf(result)?.organizer).toEqual({ '@type': 'Person', name: 'Sam' })
  })

  test('a mapped organiser that is empty here falls back to the site organisation', () => {
    const result = withEvent({ organizer: { name: 'host', url: 'hostUrl' } })
    expect(eventOf(result)?.organizer).toEqual({ '@id': 'https://example.com/#organization' })
  })
})

describe('Event performers', () => {
  const withPerformers = (performers: unknown, event: NonNullable<CollectionOptions['event']> = {}) =>
    run({ ...baseDoc, performers }, optionsFor({ ...eventsConfig, event }))

  test('rows give PerformingGroup when mapped', () => {
    const result = withPerformers([{ name: 'The Band' }], { performers: { type: 'PerformingGroup' } })
    expect(eventOf(result)?.performer).toEqual([{ '@type': 'PerformingGroup', name: 'The Band' }])
  })

  test('a plain string row is a Person by default', () => {
    expect(eventOf(withPerformers(['Solo Act']))?.performer).toEqual([{ '@type': 'Person', name: 'Solo Act' }])
  })

  test('bad rows are dropped without throwing', () => {
    const result = withPerformers([null, { name: '' }, 3, 'Solo Act'])
    expect(eventOf(result)?.performer).toEqual([{ '@type': 'Person', name: 'Solo Act' }])
    expect(result.warnings.filter((w) => w.includes('events/1') && w.includes('performer') && w.includes('skipped'))).toHaveLength(3)
    expect(result.warnings.some((w) => w.includes('performer 2 skipped, it has no name'))).toBe(true)
  })

  test('a non-array performers value gives none', () => {
    const result = withPerformers(42)
    expect(eventOf(result)).not.toHaveProperty('performer')
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('performers ignored, the field is not a list'))).toBe(true)
  })
})

describe('Event festival link', () => {
  const venue = { name: 'Showground', streetAddress: '2 Park Lane', addressLocality: 'Ashford', postalCode: 'TN24 8BT', addressCountry: 'GB' }
  const festival = { name: 'Festival 2027', path: '/events/festival-2027', startDate: '2027-07-10T09:00:00.000Z', endDate: '2027-07-20T18:00:00.000Z', location: venue }
  type Festival = NonNullable<ReturnType<NonNullable<NonNullable<CollectionOptions['event']>['superEvent']>>>
  const withFestival = (superEvent: (() => Festival | null) | ((doc: Doc) => Festival | null)) =>
    run(baseDoc, optionsFor({ ...eventsConfig, event: { superEvent } }))
  const dropped = (result: ReturnType<typeof run>, text: string) => {
    expect(eventOf(result)?.name).toBe('Opening night')
    expect(eventOf(result)).not.toHaveProperty('superEvent')
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('superEvent') && w.includes(text))).toBe(true)
  }

  test('a festival gives a linked Event with a date and a place', () => {
    const result = withFestival(() => festival)
    expect(eventOf(result)?.superEvent).toEqual({
      '@type': 'Event',
      '@id': 'https://example.com/events/festival-2027#event',
      name: 'Festival 2027',
      url: 'https://example.com/events/festival-2027',
      startDate: '2027-07-10T10:00:00+01:00',
      endDate: '2027-07-20T19:00:00+01:00',
      location: {
        '@type': 'Place',
        name: 'Showground',
        address: { '@type': 'PostalAddress', streetAddress: '2 Park Lane', addressLocality: 'Ashford', postalCode: 'TN24 8BT', addressCountry: 'GB' },
      },
    })
    expect(result.warnings).toEqual([])
  })

  test('dateOnly passes through', () => {
    const result = withFestival(() => ({ ...festival, startDate: '2027-07-10T09:00:00.000Z', endDate: undefined, dateOnly: true }))
    expect(eventOf(result)?.superEvent).toMatchObject({ startDate: '2027-07-10' })
  })

  test('null gives no superEvent', () => {
    expect(eventOf(withFestival(() => null))).not.toHaveProperty('superEvent')
  })

  test("the event's own page is dropped with a warning", () => {
    dropped(withFestival(() => ({ ...festival, path: '/events/opening' })), 'own page')
  })

  test('a throwing function warns and the event still outputs', () => {
    dropped(
      withFestival(() => {
        throw new Error('boom')
      }),
      'boom',
    )
  })

  test('a missing startDate drops the link', () => {
    dropped(withFestival(() => ({ ...festival, startDate: undefined })), 'startDate')
  })

  test('an invalid startDate drops the link', () => {
    dropped(withFestival(() => ({ ...festival, startDate: 'not a date' })), 'startDate')
  })

  test('an online-only location drops the link', () => {
    dropped(withFestival(() => ({ ...festival, location: { onlineUrl: 'https://example.com/live' } })), 'physical address')
  })

  test('an empty location drops the link', () => {
    dropped(withFestival(() => ({ ...festival, location: {} })), 'physical address')
  })

  test('an endDate before the start drops only the endDate', () => {
    const result = withFestival(() => ({ ...festival, endDate: '2027-07-01T00:00:00.000Z' }))
    const parent = eventOf(result)?.superEvent as JsonLdNode
    expect(parent.startDate).toBe('2027-07-10T10:00:00+01:00')
    expect(parent).not.toHaveProperty('endDate')
    expect(result.warnings.some((w) => w.includes('superEvent endDate') && w.includes('before'))).toBe(true)
  })
})

describe('Event performances', () => {
  const config = (event: NonNullable<CollectionOptions['event']> = {}): CollectionOptions => ({
    ...eventsConfig,
    event: { performances: { path: 'dates' }, ...event },
  })
  const docWith = (dates: unknown, extra: Doc = {}): Doc => {
    const { startDate: _start, endDate: _end, ...rest } = baseDoc
    return { ...rest, dates, ...extra }
  }
  const events = (result: ReturnType<typeof run>) => (result.graph?.['@graph'] ?? []).filter((n) => n['@type'] === 'Event')
  const rows = [
    { startDate: '2027-07-14T18:30:00.000Z', endDate: '2027-07-14T21:00:00.000Z' },
    { startDate: '2027-07-15T18:30:00.000Z' },
    { startDate: '2027-07-16T18:30:00.000Z' },
  ]

  test('three rows give three nodes sharing url, name and location', () => {
    const result = run(docWith(rows), optionsFor(config()))
    const nodes = events(result)
    expect(nodes).toHaveLength(3)
    expect(new Set(nodes.map((n) => n.url))).toEqual(new Set(['https://example.com/events/opening']))
    expect(new Set(nodes.map((n) => n.name))).toEqual(new Set(['Opening night']))
    expect(nodes.every((n) => (n.location as JsonLdNode).name === 'Town Hall')).toBe(true)
    expect(nodes.map((n) => n.startDate)).toEqual([
      '2027-07-14T19:30:00+01:00',
      '2027-07-15T19:30:00+01:00',
      '2027-07-16T19:30:00+01:00',
    ])
    expect(nodes[0].endDate).toBe('2027-07-14T22:00:00+01:00')
    expect(result.warnings).toEqual([])
  })

  test('the @id is the page url plus the formatted start', () => {
    const nodes = events(run(docWith(rows), optionsFor(config())))
    expect(nodes[0]['@id']).toBe('https://example.com/events/opening#event-2027-07-14T19-30-00-01-00')
  })

  test('a cancelled row is cancelled on its own node only', () => {
    const nodes = events(run(docWith([rows[0], { ...rows[1], status: 'cancelled' }]), optionsFor(config())))
    expect(nodes[0]).not.toHaveProperty('eventStatus')
    expect(nodes[1].eventStatus).toBe('https://schema.org/EventCancelled')
  })

  test("a row's offers replace the document's, and a row with none uses them", () => {
    const docOffers = [{ price: 10, priceCurrency: 'GBP' }]
    const rowOffers = [{ price: 20, priceCurrency: 'GBP' }]
    const nodes = events(run(docWith([{ ...rows[0], offers: rowOffers }, rows[1]], { offers: docOffers }), optionsFor(config())))
    expect(nodes[0].offers).toEqual([{ '@type': 'Offer', price: 20, priceCurrency: 'GBP' }])
    expect(nodes[1].offers).toEqual([{ '@type': 'Offer', price: 10, priceCurrency: 'GBP' }])
  })

  test("a row's stored zone is used for that row", () => {
    const nodes = events(
      run(docWith([{ startDate: '2027-07-14T18:30:00.000Z', startDate_tz: 'America/New_York' }, rows[1]]), optionsFor(config())),
    )
    expect(nodes[0].startDate).toBe('2027-07-14T14:30:00-04:00')
    expect(nodes[1].startDate).toBe('2027-07-15T19:30:00+01:00')
  })

  test('a bad row is skipped with a warning and the others output', () => {
    const result = run(docWith([rows[0], { startDate: 'not a date' }, rows[2]]), optionsFor(config()))
    expect(events(result)).toHaveLength(2)
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('performance 2'))).toBe(true)
  })

  test('mapped but empty falls back to the document startDate', () => {
    const result = run(docWith([], { startDate: '2027-07-14T18:30:00.000Z' }), optionsFor(config()))
    expect(events(result)[0]['@id']).toBe('https://example.com/events/opening#event')
    expect(events(result)).toHaveLength(1)
  })

  test('not an array falls back to the document startDate', () => {
    const result = run(docWith('nope', { startDate: '2027-07-14T18:30:00.000Z' }), optionsFor(config()))
    expect(events(result)[0]['@id']).toBe('https://example.com/events/opening#event')
  })

  test('all rows bad and no document startDate gives no Event and a warning', () => {
    const result = run(docWith([{ startDate: 'x' }, {}]), optionsFor(config()))
    expect(events(result)).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('events/1') && w.includes('Event skipped'))).toBe(true)
  })

  test('two rows with the same start give one node and one warning', () => {
    const result = run(docWith([rows[0], { ...rows[0] }, rows[1]]), optionsFor(config()))
    const nodes = events(result)
    const ids = nodes.map((n) => n['@id'])
    expect(nodes).toHaveLength(2)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.warnings.filter((w) => w.includes('same start'))).toHaveLength(1)
  })

  test('the festival link is shared by every row', () => {
    const superEvent = () => ({
      name: 'Festival',
      path: '/events/festival',
      startDate: '2027-07-10T09:00:00.000Z',
      location: { streetAddress: '2 Park Lane', addressLocality: 'Ashford' },
    })
    const nodes = events(run(docWith(rows), optionsFor(config({ superEvent }))))
    expect(nodes.every((n) => (n.superEvent as JsonLdNode)['@id'] === 'https://example.com/events/festival#event')).toBe(true)
  })
})
