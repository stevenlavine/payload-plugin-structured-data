import type { FieldPath } from '../types.js'

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

export function readPath(doc: unknown, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function readFirst(doc: unknown, paths: FieldPath): unknown {
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const value = readPath(doc, path)
    if (!isEmpty(value)) return value
  }
  return undefined
}

export function readText(doc: unknown, paths: FieldPath): string | undefined {
  const value = readFirst(doc, paths)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function absoluteUrl(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = siteUrl.replace(/\/+$/, '')
  const path = pathOrUrl.replace(/^\/+/, '')
  return path ? `${base}/${path}` : base
}

export function mediaUrl(siteUrl: string, media: unknown, size?: string): string | undefined {
  if (!media || typeof media !== 'object') return undefined
  const sized = size ? readText(media, `sizes.${size}.url`) : undefined
  const url = sized ?? readText(media, 'url')
  return url ? absoluteUrl(siteUrl, url) : undefined
}
