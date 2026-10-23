import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPluginOptions } from '../src/plugin.js'
import { StructuredData } from '../src/render/StructuredData.js'
import { StructuredDataPreview } from '../src/render/StructuredDataPreview.js'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload
const created: { collection: 'media' | 'posts'; id: number | string }[] = []

const track = <T extends { id: number | string }>(collection: 'media' | 'posts', doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterEach(async () => {
  while (created.length) {
    const { collection, id } = created.pop()!
    await payload.delete({ collection, id }).catch(() => undefined)
  }
})

afterAll(async () => {
  await payload.destroy()
})

describe('plugin', () => {
  test('adds the settings global and saves it', async () => {
    const saved = await payload.updateGlobal({
      slug: 'structured-data-settings',
      data: { name: 'Acme', organizationType: 'Organization', areaServed: [{ name: 'Kent' }] },
    })
    expect(saved.name).toBe('Acme')
  })

  test('adds the sidebar group to configured collections only', async () => {
    const post = track(
      'posts',
      await payload.create({
        collection: 'posts',
        data: { title: 'Hi', slug: 'hi', structuredData: { type: 'Article', disabled: false } },
      }),
    )
    expect(post.structuredData?.type).toBe('Article')
    expect(payload.collections.media.config.fields.some((f) => 'name' in f && f.name === 'structuredData')).toBe(false)
  })

  test('stores resolved options on config.custom', () => {
    const options = getPluginOptions(payload.config)
    expect(options?.siteUrl).toBe('http://localhost:3000')
    expect(options?.collections.posts?.type).toBe('BlogPosting')
  })
})

describe('StructuredData component', () => {
  test('renders one escaped script tag with the full graph', async () => {
    await payload.updateGlobal({ slug: 'structured-data-settings', data: { name: 'Acme' } })
    const post = track('posts', await payload.create({ collection: 'posts', data: { title: 'A </script> title', slug: 'x' } }))

    const element = await StructuredData({ config, collection: 'posts', doc: post })
    const html = renderToStaticMarkup(element)

    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html).toContain('type="application/ld+json"')
    const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    expect(json).not.toContain('<')
    const graph = JSON.parse(json)
    expect(graph['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual([
      'Organization', 'WebSite', 'BlogPosting', 'BreadcrumbList',
    ])
  })

  test('site-only when no doc is given', async () => {
    await payload.updateGlobal({ slug: 'structured-data-settings', data: { name: 'Acme' } })
    const html = renderToStaticMarkup(await StructuredData({ config }))
    expect(html).toContain('"WebSite"')
    expect(html).not.toContain('BlogPosting')
  })

  test('a null doc does not throw and gives a site-only graph', async () => {
    await payload.updateGlobal({ slug: 'structured-data-settings', data: { name: 'Acme' } })
    const element = await StructuredData({ config, collection: 'posts', doc: null })
    expect(element).not.toBeNull()
    const html = renderToStaticMarkup(element)
    expect(html).toContain('"WebSite"')
  })
})

describe('StructuredDataPreview', () => {
  const baseProps = (data: unknown) =>
    ({ collectionSlug: 'posts', data, payload }) as unknown as Parameters<typeof StructuredDataPreview>[0]

  test('re-reads the document at depth 1 so uploads become image URLs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sd-'))
    const file = path.join(dir, 'pic.png')
    // 1x1 transparent PNG
    await writeFile(
      file,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
    )
    const media = track('media', await payload.create({ collection: 'media', data: {}, filePath: file }))
    const post = track(
      'posts',
      await payload.create({
        collection: 'posts',
        data: { title: 'With image', slug: 'with-image', meta: { image: media.id } as never },
      }),
    )
    // depth 0 shape, as the edit view supplies it
    const flat = await payload.findByID({ collection: 'posts', id: post.id, depth: 0 })
    expect((flat.meta as { image?: unknown } | undefined)?.image).toBe(media.id)

    const html = renderToStaticMarkup(await StructuredDataPreview(baseProps(flat)))
    expect(html).toContain('Preview (last saved version)')
    expect(html).toContain('pic')
    expect(html).toContain('&quot;image&quot;')
  })

  test('never throws: a broken payload renders a message', async () => {
    const broken = { collectionSlug: 'posts', data: { id: 1 }, payload: {} } as never
    const html = renderToStaticMarkup(await StructuredDataPreview(broken))
    expect(html).toContain('Preview unavailable')
  })

  test('unsaved document prompts to save', async () => {
    const html = renderToStaticMarkup(await StructuredDataPreview(baseProps({})))
    expect(html).toContain('Save this document')
  })
})
