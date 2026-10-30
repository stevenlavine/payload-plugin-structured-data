import type { EventLeaf } from 'schema-dts'
import { DEFAULT_EVENT_FIELDS, DEFAULT_FIELDS } from '../constants.js'
import type { CollectionOptions, Doc, EventOptions, EventPlace, FieldPath, JsonLdNode, ResolvedOptions } from '../types.js'
import { formatEventDate, resolveTimeZone } from './eventDates.js'
import { compact } from './siteNodes.js'
import { mediaUrl, readFirst, readPath, readText } from './values.js'

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

const instant = (date: string) => Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(date) || date.length === 10 ? date : `${date}Z`)

const PLACE_KEYS = ['name', 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'] as const

function readPlace(doc: Doc, map: EventOptions['location']): EventPlace {
  const place: EventPlace = {}
  for (const key of PLACE_KEYS) {
    const value = readText(doc, map?.[key] ?? DEFAULT_EVENT_FIELDS.location[key])
    if (value) place[key] = value
  }
  return place
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

  const location = physicalPlace(readPlace(doc, event.location))
  if (!location) {
    warnings.push(`${ref}: Event skipped, no place (set at least one address field under "location")`)
    return []
  }

  // Typed object literal: a misspelt property name fails typecheck (excess property check)
  const props: Omit<Partial<EventLeaf>, '@type' | '@id'> = {
    name,
    url,
    description: readText(doc, config.fields?.description ?? DEFAULT_FIELDS.description),
    image: mediaUrl(options.siteUrl, readFirst(doc, config.fields?.image ?? [...[DEFAULT_FIELDS.image].flat()]), options.imageSize),
    startDate: start.date,
    endDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location,
  }
  return [compact({ '@type': 'Event', '@id': `${url}#event`, ...props })]
}
