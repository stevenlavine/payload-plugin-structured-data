import type { FieldPath } from '../types.js'

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

export function readPath(doc: unknown, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') {return undefined}
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function readFirst(doc: unknown, paths: FieldPath): unknown {
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const value = readPath(doc, path)
    if (!isEmpty(value)) {return value}
  }
  return undefined
}

export function readText(doc: unknown, paths: FieldPath): string | undefined {
  const value = readFirst(doc, paths)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** A finite number >= 0, or a plain decimal string. 0 is a real price. Anything else is undefined */
export function readPrice(doc: unknown, paths: FieldPath): number | undefined {
  const value = readFirst(doc, paths)
  if (typeof value === 'number') {return Number.isFinite(value) && value >= 0 ? value : undefined}
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) {return Number(value.trim())}
  return undefined
}

export function absoluteUrl(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {return pathOrUrl}
  const base = siteUrl.replace(/\/+$/, '')
  const path = pathOrUrl.replace(/^\/+/, '')
  return path ? `${base}/${path}` : base
}

export function mediaUrl(siteUrl: string, media: unknown, size?: string): string | undefined {
  if (!media || typeof media !== 'object') {return undefined}
  const sized = size ? readText(media, `sizes.${size}.url`) : undefined
  const url = sized ?? readText(media, 'url')
  return url ? absoluteUrl(siteUrl, url) : undefined
}

/** Text from a plain string or a Lexical value: text nodes joined, one space between block nodes. Anything else is undefined */
export function plainText(value: unknown): string | undefined {
  if (typeof value === 'string') {return value.trim() || undefined}
  if (typeof value !== 'object' || value === null) {return undefined}
  const root = (value as { root?: unknown }).root
  if (typeof root !== 'object' || root === null) {return undefined}
  const isInline = (node: unknown): boolean => {
    if (typeof node !== 'object' || node === null) {return true}
    const { text, type } = node as { text?: unknown; type?: unknown }
    return typeof text === 'string' || type === 'link' || type === 'autolink' || type === 'linebreak'
  }
  const collect = (node: unknown): string => {
    if (typeof node !== 'object' || node === null) {return ''}
    const { text, children, type } = node as { text?: unknown; children?: unknown; type?: unknown }
    if (typeof text === 'string') {return text}
    if (type === 'linebreak') {return ' '}
    if (!Array.isArray(children)) {return ''}
    return children.map(collect).join(children.some((child) => !isInline(child)) ? ' ' : '')
  }
  return collect(root).replace(/\s+/g, ' ').trim() || undefined
}
