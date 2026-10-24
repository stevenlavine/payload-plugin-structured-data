import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache.js', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache.js'
import { settingsGlobal } from '../fields/settingsGlobal.js'
import { revalidateSettings } from './revalidateSettings.js'

const doc = { name: 'Acme' }
const run = (context: Record<string, unknown> = {}) =>
  (revalidateSettings as (args: unknown) => Promise<unknown>)({ doc, req: { context } })

describe('revalidateSettings', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset()
  })

  test('revalidates the whole site', async () => {
    expect(await run()).toBe(doc)
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  test('skips when disableRevalidate is set', async () => {
    expect(await run({ disableRevalidate: true })).toBe(doc)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test('never throws', async () => {
    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await run()).toBe(doc)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not revalidate pages'))
    warn.mockRestore()
  })

  test('settings global registers the hook', () => {
    const global = settingsGlobal({ siteUrl: 'https://a.com', collections: {} } as never)
    expect(global.hooks?.afterChange).toContain(revalidateSettings)
  })
})
