/** Logs plugin warnings to the console, outside production only. */
export function logWarnings(warnings: string[]): void {
  if (process.env.NODE_ENV === 'production') return
  for (const warning of warnings) console.warn(`[structured-data] ${warning}`)
}
