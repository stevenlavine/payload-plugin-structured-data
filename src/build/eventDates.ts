const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
const ZONED_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0')

function isValidZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

/** First usable IANA name, in order. Each bad name adds a warning. */
export function resolveTimeZone(candidates: unknown[], ref: string, warnings: string[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') {continue}
    const name = candidate.trim()
    if (isValidZone(name)) {return name}
    warnings.push(`${ref}: "${name}" is not a valid time zone name, so it was ignored.`)
  }
  return undefined
}

/** Offset of `timeZone` from UTC, in minutes, at the instant `ms`. */
function offsetMinutes(ms: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(ms))
    const name = parts.find((part) => part.type === 'timeZoneName')?.value
    if (!name) {return null}
    const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(name)
    if (!match) {return null}
    if (!match[1]) {return 0}
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0)
    return match[1] === '-' ? -minutes : minutes
  } catch {
    return null
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`
}

/** True when the calendar date and clock time exist, e.g. not 31 February. */
function isRealDateTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): boolean {
  if (h > 23 || mi > 59 || s > 59) {return false}
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

function localString(shiftedMs: number): { date: string; time: string } {
  const iso = new Date(shiftedMs).toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) }
}

/** The JSON-LD date string, or null when the value is not a date. */
export function formatEventDate(
  value: unknown,
  input: { timeZone?: string; dateOnly?: boolean; ref: string },
  warnings: string[],
): string | null {
  const { timeZone, dateOnly, ref } = input
  const raw = value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : value
  if (typeof raw !== 'string') {return null}
  const text = raw.trim()

  const dateMatch = DATE_ONLY.exec(text)
  if (dateMatch) {
    const [y, mo, d] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])]
    return isRealDateTime(y, mo, d) ? text : null
  }

  const localMatch = LOCAL_DATE_TIME.exec(text)
  if (localMatch) {
    const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(localMatch[i] ?? 0)) as [
      number, number, number, number, number, number,
    ]
    if (!isRealDateTime(y, mo, d, h, mi, s)) {return null}
    const datePart = text.slice(0, 10)
    if (dateOnly) {return datePart}
    const timePart = `${pad(h)}:${pad(mi)}:${pad(s)}`
    if (!timeZone) {return `${datePart}T${localMatch[4]}:${localMatch[5]}${localMatch[6] ? `:${localMatch[6]}` : ''}`}
    // Treat the local time as UTC, read the offset, subtract it, then read the
    // offset again at the result so times near a clock change are right.
    const guess = Date.UTC(y, mo - 1, d, h, mi, s)
    const first = offsetMinutes(guess, timeZone)
    const second = first === null ? null : offsetMinutes(guess - first * 60000, timeZone)
    if (second === null) {
      warnings.push(`${ref}: could not work out the UTC offset for "${timeZone}", so the time was written without one.`)
      return `${datePart}T${timePart}`
    }
    return `${datePart}T${timePart}${formatOffset(second)}`
  }

  const zonedMatch = ZONED_DATE_TIME.exec(text)
  if (zonedMatch) {
    const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(zonedMatch[i] ?? 0)) as [
      number, number, number, number, number, number,
    ]
    if (!isRealDateTime(y, mo, d, h, mi, s)) {return null}
    const ms = Date.parse(text)
    if (Number.isNaN(ms)) {return null}
    let zone = timeZone
    if (!zone) {
      warnings.push(`${ref}: no time zone was set, so the date was written in UTC.`)
      zone = 'UTC'
    }
    let offset = zone === 'UTC' ? 0 : offsetMinutes(ms, zone)
    if (offset === null) {
      warnings.push(`${ref}: could not work out the UTC offset for "${zone}", so the date was written in UTC.`)
      offset = 0
    }
    const local = localString(ms + offset * 60000)
    return dateOnly ? local.date : `${local.date}T${local.time}${formatOffset(offset)}`
  }

  return null
}
