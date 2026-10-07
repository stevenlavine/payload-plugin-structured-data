import { describe, expect, test } from 'vitest'
import { absoluteUrl, mediaUrl, readFirst, readPath, readText } from './values.js'

describe('readPath', () => {
  test('reads nested dot paths', () => {
    expect(readPath({ meta: { description: 'x' } }, 'meta.description')).toBe('x')
  })
  test('returns undefined for missing parts and non-objects', () => {
    expect(readPath({ meta: null }, 'meta.description')).toBeUndefined()
    expect(readPath('text', 'a')).toBeUndefined()
  })
})

describe('readFirst', () => {
  test('returns the first non-empty value in a list', () => {
    expect(readFirst({ a: '', b: null, c: 'yes' }, ['a', 'b', 'c'])).toBe('yes')
  })
  test('treats empty arrays as empty', () => {
    expect(readFirst({ a: [], b: [1] }, ['a', 'b'])).toEqual([1])
  })
  test('accepts a single path', () => {
    expect(readFirst({ a: 1 }, 'a')).toBe(1)
  })
})

describe('readText', () => {
  test('trims and drops blank strings', () => {
    expect(readText({ t: '  Hi  ' }, 't')).toBe('Hi')
    expect(readText({ t: '   ' }, 't')).toBeUndefined()
    expect(readText({ t: 5 }, 't')).toBeUndefined()
  })
})

describe('absoluteUrl', () => {
  test('joins paths to the site URL without double slashes', () => {
    expect(absoluteUrl('https://a.com/', '/blog/x')).toBe('https://a.com/blog/x')
    expect(absoluteUrl('https://a.com', 'blog/x')).toBe('https://a.com/blog/x')
  })
  test('home path is the bare site URL', () => {
    expect(absoluteUrl('https://a.com', '/')).toBe('https://a.com')
  })
  test('leaves absolute URLs alone', () => {
    expect(absoluteUrl('https://a.com', 'https://cdn.b.com/i.png')).toBe('https://cdn.b.com/i.png')
  })
})

describe('mediaUrl', () => {
  const media = { url: '/api/media/file/a.png', sizes: { og: { url: '/api/media/file/a-og.png' } } }
  test('prefers the named size', () => {
    expect(mediaUrl('https://a.com', media, 'og')).toBe('https://a.com/api/media/file/a-og.png')
  })
  test('falls back to the original', () => {
    expect(mediaUrl('https://a.com', media, 'missing')).toBe('https://a.com/api/media/file/a.png')
  })
  test('returns undefined for an unpopulated relation (an id)', () => {
    expect(mediaUrl('https://a.com', 12)).toBeUndefined()
    expect(mediaUrl('https://a.com', null)).toBeUndefined()
  })
})
