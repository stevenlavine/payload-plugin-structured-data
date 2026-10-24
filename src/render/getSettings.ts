import type { Payload } from 'payload'
import { cache } from 'react'
import { SETTINGS_SLUG } from '../constants.js'
import { logWarnings } from '../log.js'
import type { Settings } from '../types.js'

/** One read per request; depth 1 so the logo upload is populated. */
export const getSettings = cache(async (payload: Payload): Promise<Settings | null> => {
  try {
    return (await payload.findGlobal({ slug: SETTINGS_SLUG as never, depth: 1 })) as Settings
  } catch (error) {
    logWarnings([`settings: could not read ${SETTINGS_SLUG}: ${error instanceof Error ? error.message : String(error)}`])
    return null
  }
})
