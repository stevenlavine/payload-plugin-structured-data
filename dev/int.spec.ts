import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPluginOptions } from '../src/plugin.js'
import { StructuredData } from '../src/render/StructuredData.js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
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
    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Hi', slug: 'hi', structuredData: { type: 'Article', disabled: false } },
    })
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
    const post = await payload.create({ collection: 'posts', data: { title: 'A </script> title', slug: 'x' } })

    const element = await StructuredData({ config, collection: 'posts', doc: post as unknown as Record<string, unknown> })
    const html = renderToStaticMarkup(element!)

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
    const html = renderToStaticMarkup((await StructuredData({ config }))!)
    expect(html).toContain('"WebSite"')
    expect(html).not.toContain('BlogPosting')
  })

  test('a null doc does not throw and gives a site-only graph', async () => {
    const element = await StructuredData({ config, collection: 'posts', doc: null as never })
    expect(element).not.toBeNull()
    const html = renderToStaticMarkup(element!)
    expect(html).toContain('"WebSite"')
  })
})
