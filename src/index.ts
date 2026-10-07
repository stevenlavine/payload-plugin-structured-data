import type { Config } from 'payload'

export { buildStructuredData } from './build/buildStructuredData.js'
export type { BuildInput } from './build/buildStructuredData.js'
export { serializeJsonLd } from './build/serialize.js'
export type * from './types.js'

export const structuredDataPlugin =
  () =>
  (config: Config): Config =>
    config
