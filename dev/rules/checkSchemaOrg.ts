import { readFileSync } from 'node:fs'

type TypeInfo = { parents: string[]; properties: Record<string, string[]> }
type Vocabulary = { fetched: string; source: string; types: Record<string, TypeInfo>; version: string }

const vocabulary = JSON.parse(
  readFileSync(new URL('./schemaorg.json', import.meta.url), 'utf8'),
) as Vocabulary

/**
 * Properties that are not in Schema.org but are documented by a consumer (Google).
 * Keyed by type; also applies to subtypes of that type.
 */
export const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  SearchAction: ['query-input'],
}

const own = <T>(map: Record<string, T> | undefined, key: string): T | undefined =>
  map && Object.hasOwn(map, key) ? map[key] : undefined

const typeInfo = (type: string): TypeInfo | undefined => own(vocabulary.types, type)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const typesOf = (node: Record<string, unknown>): string[] => {
  const raw = node['@type']
  return (Array.isArray(raw) ? raw : [raw]).filter((t): t is string => typeof t === 'string')
}

const isExtension = (type: string, property: string): boolean => {
  const lineage = [type, ...(typeInfo(type)?.parents ?? [])]
  return lineage.some((t) => own(ALLOWED_EXTENSIONS, t)?.includes(property))
}

/** True when `type` is one of `ranges`, or a descendant of one. */
const inRange = (type: string, ranges: string[]): boolean => {
  const lineage = [type, ...(typeInfo(type)?.parents ?? [])]
  return lineage.some((t) => ranges.includes(t))
}

/**
 * Checks a JSON-LD node against the trimmed Schema.org vocabulary, walking nested
 * objects and arrays. Returns one message per problem; an empty array means valid.
 */
export const checkSchemaOrg = (node: Record<string, unknown>, path?: string): string[] => {
  const types = typesOf(node)
  const base = path ?? (types[0] || 'node')
  if (types.length === 0) {
    // A bare reference such as { '@id': '...' } is fine; anything else needs a type.
    const keys = Object.keys(node).filter((k) => !k.startsWith('@'))
    return keys.length > 0 ? [`${base}: node has properties but no @type`] : []
  }

  const messages: string[] = []
  const known = types.filter((t) => typeInfo(t))
  for (const t of types) {
    if (!typeInfo(t)) {
      messages.push(`${base}: unknown type "${t}"`)
    }
  }
  if (known.length === 0) {
    return messages
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@')) {
      continue
    }
    const here = `${base}.${key}`
    const ranges = known.map((t) => own(typeInfo(t)?.properties, key)).find((r) => r !== undefined)
    if (!ranges) {
      if (!known.some((t) => isExtension(t, key))) {
        messages.push(`${here}: unknown property for ${known.join('/')}`)
      }
      continue
    }
    const values = Array.isArray(value) ? value : [value]
    values.forEach((item, index) => {
      if (!isRecord(item)) {
        return // strings, numbers and booleans are accepted for any range
      }
      const itemPath = Array.isArray(value) ? `${here}[${index}]` : here
      const itemTypes = typesOf(item)
      if (itemTypes.length === 0) {
        messages.push(...checkSchemaOrg(item, itemPath))
        return
      }
      if (!itemTypes.some((t) => inRange(t, ranges))) {
        messages.push(`${itemPath}: type ${itemTypes.join('/')} is not in range (${ranges.join(', ')})`)
        return
      }
      messages.push(...checkSchemaOrg(item, itemPath))
    })
  }
  return messages
}
