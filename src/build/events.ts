import type { EventLeaf, OfferLeaf } from 'schema-dts'
import { DEFAULT_EVENT_FIELDS, DEFAULT_FIELDS } from '../constants.js'
import type { CollectionOptions, Doc, EventOfferOptions, EventOptions, EventOrganizerOptions, EventPerformerOptions, EventPlace, FieldPath, JsonLdNode, ResolvedOptions } from '../types.js'
import { formatEventDate, resolveTimeZone } from './eventDates.js'
import { compact, organizationId } from './siteNodes.js'
import { absoluteUrl, mediaUrl, readFirst, readPath, readPrice, readText } from './values.js'

export type EventNodeInput = {
  doc: Doc
  /** Absolute page URL */
  url: string
  /** e.g. 'events/123', used in warnings */
  ref: string
  config: CollectionOptions
  options: ResolvedOptions
  hasOrganization: boolean
}

/** What the per-date and offer helpers need. timeZone is the plugin option; a stored zone beats it per date */
type EventContext = { ref: string; siteUrl: string; timeZone?: string; dateOnly: boolean }

const pathsOf = (path: FieldPath) => (Array.isArray(path) ? path : [path])
const firstPath = (path: FieldPath) => pathsOf(path)[0]

/** The first path that holds a value, with that value */
function resolveField(doc: unknown, path: FieldPath): { path: string; value: unknown } | undefined {
  for (const candidate of pathsOf(path)) {
    const value = readFirst(doc, candidate)
    if (value !== undefined) return { path: candidate, value }
  }
  return undefined
}

type ReadDate = { found: boolean; date: string | null; zone?: string }

/**
 * One date. The stored zone sits beside the field that held the value, as '<path>_tz'.
 * `inheritedZone` lets an end date follow its start date's stored zone.
 */
function readEventDate(
  doc: Doc,
  path: FieldPath,
  ctx: EventContext,
  inheritedZone: string | undefined,
  warnings: string[],
): ReadDate {
  const field = resolveField(doc, path)
  if (!field) return { found: false, date: null }
  const stored = readPath(doc, `${field.path}_tz`)
  const zone = resolveTimeZone([stored, inheritedZone, ctx.timeZone], ctx.ref, warnings)
  const date = formatEventDate(field.value, { timeZone: zone, dateOnly: ctx.dateOnly, ref: ctx.ref }, warnings)
  const storedZone = resolveTimeZone([stored], ctx.ref, [])
  return { found: true, date, zone: storedZone }
}

function readDateOnly(setting: EventOptions['dateOnly'], doc: Doc, ref: string, warnings: string[]): boolean {
  if (setting === undefined) return false
  if (typeof setting === 'boolean') return setting
  if (typeof setting === 'function') {
    try {
      return setting(doc) === true
    } catch (error) {
      warnings.push(`${ref}: dateOnly function failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
  return readFirst(doc, setting) === true
}

const instant = (date: string) => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(date) || date.length === 10 ? date : `${date}Z`)

const PLACE_KEYS = ['name', 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry', 'onlineUrl'] as const
const ADDRESS_KEYS = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'] as const

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The place parts for a document, from mapped paths or a site function. Null when the function gives none or throws */
function readPlace(doc: Doc, setting: EventOptions['location'], ref: string, warnings: string[]): EventPlace | null {
  if (typeof setting === 'function') {
    try {
      const place = setting(doc)
      if (place && typeof place === 'object') return place
      warnings.push(`${ref}: Event skipped, the location function returned no place`)
      return null
    } catch (error) {
      warnings.push(`${ref}: Event skipped, location function failed: ${errorText(error)}`)
      return null
    }
  }
  const place: EventPlace = {}
  for (const key of PLACE_KEYS) {
    const value = readText(doc, setting?.[key] ?? DEFAULT_EVENT_FIELDS.location[key])
    if (value) place[key] = value
  }
  return place
}

/** The paths readPlace looks at for the parts that make a place, for the warning */
function placePathsTried(setting: EventOptions['location']): string[] {
  if (typeof setting === 'function') return []
  return [...ADDRESS_KEYS, 'onlineUrl' as const].map((key) => firstPath(setting?.[key] ?? DEFAULT_EVENT_FIELDS.location[key]))
}

/** A Place with a postal address, or undefined when no address part is set */
function physicalPlace(place: EventPlace) {
  const address = compact({
    '@type': 'PostalAddress' as const,
    streetAddress: place.streetAddress,
    addressLocality: place.addressLocality,
    addressRegion: place.addressRegion,
    postalCode: place.postalCode,
    addressCountry: place.addressCountry,
  })
  if (Object.keys(address).length === 1) return undefined
  return { '@type': 'Place' as const, name: place.name, address }
}

type EventStatusUrl = `https://schema.org/Event${'Scheduled' | 'Cancelled' | 'Postponed' | 'Rescheduled' | 'MovedOnline'}`

const STATUS_PREFIX = /^(?:https?:\/\/schema\.org\/)?/i

/** Keyed by lower-case word: the short form and the Schema.org name */
const STATUS_MAP: Record<string, EventStatusUrl> = {
  scheduled: 'https://schema.org/EventScheduled',
  eventscheduled: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
  canceled: 'https://schema.org/EventCancelled',
  eventcancelled: 'https://schema.org/EventCancelled',
  postponed: 'https://schema.org/EventPostponed',
  eventpostponed: 'https://schema.org/EventPostponed',
  rescheduled: 'https://schema.org/EventRescheduled',
  eventrescheduled: 'https://schema.org/EventRescheduled',
  movedonline: 'https://schema.org/EventMovedOnline',
  eventmovedonline: 'https://schema.org/EventMovedOnline',
}

function readStatus(doc: Doc, path: FieldPath, ref: string, warnings: string[]): EventStatusUrl | undefined {
  const raw = readFirst(doc, path)
  if (raw === undefined) return undefined
  const word = typeof raw === 'string' ? STATUS_MAP[raw.trim().replace(STATUS_PREFIX, '').toLowerCase()] : undefined
  if (!word) {
    warnings.push(`${ref}: eventStatus left out, "${typeof raw === 'string' ? raw : typeof raw}" is not a known status`)
    return undefined
  }
  return word
}

type Availability = `https://schema.org/${'InStock' | 'OutOfStock' | 'SoldOut' | 'PreOrder' | 'PreSale' | 'LimitedAvailability' | 'BackOrder' | 'Discontinued' | 'OnlineOnly' | 'InStoreOnly'}`

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
const AVAILABILITY_MAP: Record<string, Availability> = Object.fromEntries(
  AVAILABILITY_NAMES.map((name) => [name.toLowerCase(), `https://schema.org/${name}`]),
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

type OfferNode = Omit<Partial<OfferLeaf>, '@type' | '@id'> & { '@type': 'Offer' }

/**
 * Ticket offers read from `source` (the event document, or a performance row).
 * An absent or empty field gives nothing and no warning. A bad row is skipped with a warning.
 */
function buildOffers(source: Doc, offers: EventOfferOptions | undefined, ctx: EventContext, warnings: string[]): OfferNode[] {
  const raw = readFirst(source, offers?.path ?? 'offers')
  if (raw === undefined) return []
  const rows: unknown[] = Array.isArray(raw) ? raw : [raw]
  const result: OfferNode[] = []

  rows.forEach((row, index) => {
    const label = `${ctx.ref}: offer ${index + 1}`
    if (!isRecord(row)) {
      warnings.push(`${label} skipped, it is not an object`)
      return
    }
    const priceField = offers?.price ?? 'price'
    const rawPrice = readFirst(row, priceField)
    const price = readPrice(row, priceField)
    if (rawPrice !== undefined && price === undefined) {
      warnings.push(`${label}: price ignored, "${String(rawPrice)}" is not a number of 0 or more`)
    }

    // A price with no currency must never output. No price means no currency either
    let priceCurrency: string | undefined
    if (price !== undefined) {
      priceCurrency = readText(row, offers?.priceCurrency ?? 'priceCurrency') || offers?.defaultCurrency?.trim() || undefined
      if (!priceCurrency) {
        warnings.push(`${label} skipped, it has a price but no currency (set priceCurrency or defaultCurrency)`)
        return
      }
    }

    const availabilityRaw = readFirst(row, offers?.availability ?? 'availability')
    let availability: Availability | undefined
    if (availabilityRaw !== undefined) {
      availability =
        typeof availabilityRaw === 'string' ? AVAILABILITY_MAP[availabilityRaw.trim().replace(STATUS_PREFIX, '').toLowerCase()] : undefined
      if (!availability) {
        warnings.push(
          `${label}: availability left out, "${typeof availabilityRaw === 'string' ? availabilityRaw : typeof availabilityRaw}" is not a known availability`,
        )
      }
    }

    const urlText = readText(row, offers?.url ?? 'url')
    const url = urlText ? absoluteUrl(ctx.siteUrl, urlText) : undefined
    if (price === undefined && !url && !availability) {
      warnings.push(`${label} skipped, it needs a price, a link or an availability`)
      return
    }

    const validFromField = offers?.validFrom ?? 'validFrom'
    const validFromRaw = readFirst(row, validFromField)
    let validFrom: string | undefined
    if (validFromRaw !== undefined) {
      validFrom = formatEventDate(validFromRaw, { timeZone: ctx.timeZone, dateOnly: false, ref: ctx.ref }, warnings) ?? undefined
      if (!validFrom) warnings.push(`${label}: validFrom left out, "${firstPath(validFromField)}" is not a valid date`)
    }

    result.push(
      compact({
        '@type': 'Offer' as const,
        name: readText(row, offers?.name ?? 'name'),
        price,
        priceCurrency,
        availability,
        validFrom,
        url,
      }),
    )
  })
  return result
}

/** The mapped organiser, or the site organisation when none is mapped or the mapped fields are empty here */
function buildOrganizer(doc: Doc, setting: EventOrganizerOptions | undefined, ctx: EventContext, hasOrganization: boolean) {
  const name = setting?.name ? readText(doc, setting.name) : undefined
  const urlText = setting?.url ? readText(doc, setting.url) : undefined
  if (name || urlText) {
    return compact({
      '@type': setting?.type ?? ('Organization' as const),
      name,
      url: urlText ? absoluteUrl(ctx.siteUrl, urlText) : undefined,
    })
  }
  return hasOrganization ? { '@id': organizationId(ctx.siteUrl) } : undefined
}

function buildPerformers(doc: Doc, setting: EventPerformerOptions | undefined, ctx: EventContext, warnings: string[]) {
  const raw = readFirst(doc, setting?.path ?? 'performers')
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push(`${ctx.ref}: performers ignored, the field is not a list`)
    return []
  }
  const type = setting?.type ?? 'Person'
  const result: { '@type': 'Person' | 'PerformingGroup'; name: string }[] = []
  raw.forEach((row: unknown, index) => {
    const name = typeof row === 'string' ? row.trim() : isRecord(row) ? readText(row, setting?.name ?? 'name') : undefined
    if (name) result.push({ '@type': type, name })
    else warnings.push(`${ctx.ref}: performer ${index + 1} skipped, it has no name`)
  })
  return result
}

const withoutSlash = (url: string) => url.replace(/\/+$/, '')

/** The festival this event belongs to. A throwing function or a link back to the event itself gives a warning and nothing */
function buildSuperEvent(doc: Doc, setting: EventOptions['superEvent'], url: string, ctx: EventContext, warnings: string[]) {
  if (!setting) return undefined
  let festival: unknown
  try {
    festival = setting(doc)
  } catch (error) {
    warnings.push(`${ctx.ref}: superEvent left out, the function failed: ${errorText(error)}`)
    return undefined
  }
  if (festival === null || festival === undefined) return undefined
  const name = isRecord(festival) && typeof festival.name === 'string' ? festival.name.trim() : ''
  const path = isRecord(festival) && typeof festival.path === 'string' ? festival.path.trim() : ''
  if (!name || !path) {
    warnings.push(`${ctx.ref}: superEvent left out, it needs a name and a path`)
    return undefined
  }
  const festivalUrl = absoluteUrl(ctx.siteUrl, path)
  if (withoutSlash(festivalUrl) === withoutSlash(url)) {
    warnings.push(`${ctx.ref}: superEvent left out, it points at the event's own page`)
    return undefined
  }
  return { '@type': 'Event' as const, '@id': `${festivalUrl}#event`, name, url: festivalUrl }
}

export function buildEventNodes(input: EventNodeInput, warnings: string[]): JsonLdNode[] {
  const { doc, url, ref, config, options } = input
  const event = config.event ?? {}

  const name = readText(doc, config.fields?.headline ?? DEFAULT_FIELDS.headline)
  if (!name) {
    warnings.push(`${ref}: Event skipped, no name (field "${firstPath(config.fields?.headline ?? DEFAULT_FIELDS.headline)}" is empty)`)
    return []
  }

  const ctx: EventContext = {
    ref,
    siteUrl: options.siteUrl,
    timeZone: resolveTimeZone([options.timeZone], ref, warnings),
    dateOnly: readDateOnly(event.dateOnly, doc, ref, warnings),
  }

  const startPath = event.startDate ?? DEFAULT_EVENT_FIELDS.startDate
  const start = readEventDate(doc, startPath, ctx, undefined, warnings)
  if (!start.date) {
    warnings.push(
      start.found
        ? `${ref}: Event skipped, "${firstPath(startPath)}" is not a valid date`
        : `${ref}: Event skipped, no start date (field "${firstPath(startPath)}" is empty)`,
    )
    return []
  }

  const endPath = event.endDate ?? DEFAULT_EVENT_FIELDS.endDate
  const end = readEventDate(doc, endPath, ctx, start.zone, warnings)
  let endDate = end.date ?? undefined
  if (end.found && !end.date) warnings.push(`${ref}: endDate left out, "${firstPath(endPath)}" is not a valid date`)
  if (endDate && instant(endDate) < instant(start.date)) {
    warnings.push(`${ref}: endDate left out, it is before the start date`)
    endDate = undefined
  }

  const parts = readPlace(doc, event.location, ref, warnings)
  if (!parts) return []
  const physical = physicalPlace(parts)
  const onlineUrl = parts.onlineUrl ? absoluteUrl(options.siteUrl, parts.onlineUrl) : undefined
  const virtual = onlineUrl ? { '@type': 'VirtualLocation' as const, url: onlineUrl } : undefined
  if (!physical && !virtual) {
    const tried = placePathsTried(event.location)
    warnings.push(
      `${ref}: Event skipped, no place (needs an address${tried.length ? `, looked at ${tried.join(', ')}` : ''}, or an online link)`,
    )
    return []
  }
  const location = physical && virtual ? [physical, virtual] : (physical ?? virtual)
  const attendanceMode =
    physical && virtual ? 'MixedEventAttendanceMode' : virtual ? 'OnlineEventAttendanceMode' : 'OfflineEventAttendanceMode'

  const statusPath = event.status ?? DEFAULT_EVENT_FIELDS.status
  const status = readStatus(doc, statusPath, ref, warnings)

  const previousPath = event.previousStartDate ?? DEFAULT_EVENT_FIELDS.previousStartDate
  let previousStartDate: string | undefined
  if (resolveField(doc, previousPath)) {
    if (status === 'https://schema.org/EventRescheduled') {
      const previous = readEventDate(doc, previousPath, ctx, start.zone, warnings)
      previousStartDate = previous.date ?? undefined
      if (!previous.date) warnings.push(`${ref}: previousStartDate left out, "${firstPath(previousPath)}" is not a valid date`)
    } else {
      warnings.push(`${ref}: previousStartDate left out, it is only allowed with a rescheduled status`)
    }
  }

  const offerNodes = buildOffers(doc, event.offers, { ...ctx, timeZone: start.zone ?? ctx.timeZone }, warnings)

  const performers = buildPerformers(doc, event.performers, ctx, warnings)

  // Typed object literal: a misspelt property name fails typecheck (excess property check)
  const props: Omit<Partial<EventLeaf>, '@type' | '@id'> = {
    name,
    url,
    description: readText(doc, config.fields?.description ?? DEFAULT_FIELDS.description),
    image: mediaUrl(options.siteUrl, readFirst(doc, config.fields?.image ?? [...[DEFAULT_FIELDS.image].flat()]), options.imageSize),
    startDate: start.date,
    endDate,
    eventStatus: status,
    previousStartDate,
    eventAttendanceMode: `https://schema.org/${attendanceMode}`,
    location,
    offers: offerNodes.length ? offerNodes : undefined,
    organizer: buildOrganizer(doc, event.organizer, ctx, input.hasOrganization),
    performer: performers.length ? performers : undefined,
    superEvent: buildSuperEvent(doc, event.superEvent, url, ctx, warnings),
  }
  return [compact({ '@type': 'Event', '@id': `${url}#event`, ...props })]
}
