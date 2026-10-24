import type { GlobalAfterChangeHook } from 'payload'
import { logWarnings } from '../log.js'

export const revalidateSettings: GlobalAfterChangeHook = async ({ doc, req }) => {
  if (req.context?.disableRevalidate) return doc
  try {
    const { revalidatePath } = await import('next/cache.js')
    revalidatePath('/', 'layout')
  } catch (error) {
    logWarnings([`settings: could not revalidate pages: ${error instanceof Error ? error.message : String(error)}`])
  }
  return doc
}
