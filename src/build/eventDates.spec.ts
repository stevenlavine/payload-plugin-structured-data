import { describe, expect, it, vi } from 'vitest'

import { formatEventDate, resolveTimeZone } from './eventDates.js'

const ref = 'events/1'
const London = 'Europe/London'

function run(value: unknown, input: { dateOnly?: boolean; timeZone?: string } = {}) {
  const warnings: string[] = []
  const result = formatEventDate(value, { ...input, ref }, warnings)
  return { result, warnings }
}

describe('formatEventDate', () => {
  it('converts UTC to British summer time', () => {
    const { result, warnings } = run('2027-07-14T18:30:00.000Z', { timeZone: London })
    expect(result).toBe('2027-07-14T19:30:00+01:00')
    expect(warnings).toEqual([])
  })

  it('converts UTC to GMT in winter', () => {
    const { result, warnings } = run('2027-01-14T19:30:00.000Z', { timeZone: London })
    expect(result).toBe('2027-01-14T19:30:00+00:00')
    expect(warnings).toEqual([])
  })

  it('moves an offset date into the zone', () => {
    const { result, warnings } = run('2027-07-14T19:30:00+02:00', { timeZone: London })
    expect(result).toBe('2027-07-14T18:30:00+01:00')
    expect(warnings).toEqual([])
  })

  it('falls back to UTC with a warning when there is no zone', () => {
    const { result, warnings } = run('2027-07-14T18:30:00.000Z')
    expect(result).toBe('2027-07-14T18:30:00+00:00')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('events/1')
    expect(warnings[0]).toContain('UTC')
  })

  it('adds the summer offset to a local time', () => {
    const { result, warnings } = run('2027-07-14T19:30', { timeZone: London })
    expect(result).toBe('2027-07-14T19:30:00+01:00')
    expect(warnings).toEqual([])
  })

  it('adds the winter offset to a local time', () => {
    const { result, warnings } = run('2027-01-14T19:30:00', { timeZone: London })
    expect(result).toBe('2027-01-14T19:30:00+00:00')
    expect(warnings).toEqual([])
  })

  it('leaves a local time alone when there is no zone', () => {
    const { result, warnings } = run('2027-07-14T19:30')
    expect(result).toBe('2027-07-14T19:30')
    expect(warnings).toEqual([])
  })

  it('passes a plain date through', () => {
    const { result, warnings } = run('2027-07-14', { timeZone: London })
    expect(result).toBe('2027-07-14')
    expect(warnings).toEqual([])
  })

  it('gives the local date for dateOnly', () => {
    const { result, warnings } = run('2027-07-14T23:30:00.000Z', { dateOnly: true, timeZone: London })
    expect(result).toBe('2027-07-15')
    expect(warnings).toEqual([])
  })

  it('warns for dateOnly with no zone', () => {
    const { result, warnings } = run('2027-07-14T12:00:00.000Z', { dateOnly: true })
    expect(result).toBe('2027-07-14')
    expect(warnings).toHaveLength(1)
  })

  it('rejects an impossible date', () => {
    const { result, warnings } = run('2027-02-31', { timeZone: London })
    expect(result).toBeNull()
    expect(warnings).toEqual([])
  })

  it('rejects an impossible local date-time', () => {
    const { result, warnings } = run('2027-02-31T19:30', { timeZone: London })
    expect(result).toBeNull()
    expect(warnings).toEqual([])
  })

  it.each([['not a date'], [''], [null], [42], [{}]])('returns null for %j', (value) => {
    const { result, warnings } = run(value, { timeZone: London })
    expect(result).toBeNull()
    expect(warnings).toEqual([])
  })

  // London clocks go forward at 01:00 UTC on 2027-03-28, so 01:30 local does not exist.
  it('keeps a local time before the spring clock change on GMT', () => {
    expect(run('2027-03-28T00:30', { timeZone: London }).result).toBe('2027-03-28T00:30:00+00:00')
  })

  it('writes a time inside the spring gap at the offset in force before the change', () => {
    // 01:30 does not exist. The two-pass lookup lands on +00:00, which is the
    // instant 01:30Z, the same moment as 02:30 BST.
    expect(run('2027-03-28T01:30', { timeZone: London }).result).toBe('2027-03-28T01:30:00+00:00')
  })

  it('resolves a time just after the spring clock change on BST', () => {
    expect(run('2027-03-28T02:30', { timeZone: London }).result).toBe('2027-03-28T02:30:00+01:00')
  })

  it.each([
    ['America/New_York', '2027-07-14T18:30:00.000Z', '2027-07-14T14:30:00-04:00'],
    ['America/New_York', '2027-01-14T19:30:00.000Z', '2027-01-14T14:30:00-05:00'],
    ['Asia/Kolkata', '2027-07-14T18:30:00.000Z', '2027-07-15T00:00:00+05:30'],
    ['America/St_Johns', '2027-07-14T18:30:00.000Z', '2027-07-14T16:00:00-02:30'],
    ['America/St_Johns', '2027-01-14T19:30:00.000Z', '2027-01-14T16:00:00-03:30'],
  ])('converts an exact moment in %s: %s', (timeZone, value, expected) => {
    const { result, warnings } = run(value, { timeZone })
    expect(result).toBe(expected)
    expect(warnings).toEqual([])
  })

  it.each([
    ['America/New_York', '2027-07-14T19:30', '2027-07-14T19:30:00-04:00'],
    ['America/New_York', '2027-01-14T19:30', '2027-01-14T19:30:00-05:00'],
    ['Asia/Kolkata', '2027-07-14T19:30', '2027-07-14T19:30:00+05:30'],
    ['America/St_Johns', '2027-07-14T19:30', '2027-07-14T19:30:00-02:30'],
    ['America/St_Johns', '2027-01-14T19:30', '2027-01-14T19:30:00-03:30'],
  ])('adds the offset to a local time in %s: %s', (timeZone, value, expected) => {
    const { result, warnings } = run(value, { timeZone })
    expect(result).toBe(expected)
    expect(warnings).toEqual([])
  })

  describe('when the offset cannot be read', () => {
    function breakOffsets() {
      const Real = Intl.DateTimeFormat
      return vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ) {
        if (options?.timeZoneName) throw new RangeError('no offsets')
        return new Real(locales, options)
      } as unknown as typeof Intl.DateTimeFormat)
    }

    it('writes an exact moment in UTC with a warning, never inventing an offset for the zone', () => {
      const spy = breakOffsets()
      try {
        const { result, warnings } = run('2027-07-14T19:30:00+02:00', { timeZone: London })
        expect(result).toBe('2027-07-14T17:30:00+00:00')
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain('events/1')
      } finally {
        spy.mockRestore()
      }
    })

    it('writes a local time as written, with a warning', () => {
      const spy = breakOffsets()
      try {
        const { result, warnings } = run('2027-07-14T19:30', { timeZone: London })
        expect(result).toBe('2027-07-14T19:30:00')
        expect(warnings).toHaveLength(1)
      } finally {
        spy.mockRestore()
      }
    })
  })
})

describe('resolveTimeZone', () => {
  it('skips a bad name with a warning', () => {
    const warnings: string[] = []
    expect(resolveTimeZone(['Mars/Olympus', London], ref, warnings)).toBe(London)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Mars/Olympus')
  })

  it('returns undefined silently for empty candidates', () => {
    const warnings: string[] = []
    expect(resolveTimeZone([null, undefined, ''], ref, warnings)).toBeUndefined()
    expect(warnings).toEqual([])
  })
})
