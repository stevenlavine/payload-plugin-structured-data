import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload, NotFound } from 'payload'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildStructuredData } from '../src/build/buildStructuredData.js'
import { getPluginOptions } from '../src/plugin.js'
import { StructuredData } from '../src/render/StructuredData.js'
import { StructuredDataPreview } from '../src/render/StructuredDataPreview.js'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload
type Tracked = 'events' | 'media' | 'posts'
const created: { collection: Tracked; id: number | string }[] = []

const track = <T extends { id: number | string }>(collection: Tracked, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterEach(async () => {
  while (created.length) {
    const { collection, id } = created.pop()!
    try {
      await payload.delete({ collection, id })
    } catch (error: unknown) {
      // Only "already deleted by the test" is fine; anything else is a real failure.
      if (!(error instanceof NotFound)) {
        throw error
      }
    }
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

  test('saving settings outside Next.js still succeeds', async () => {
    const saved = await payload.updateGlobal({
      slug: 'structured-data-settings',
      data: { name: 'Outside Next', organizationType: 'Organization' },
    })
    expect(saved.name).toBe('Outside Next')
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

describe('events', () => {
  test('a venue-mapped event gets the offset for its stored zone', async () => {
    const event = track(
      'events',
      await payload.create({
        collection: 'events',
        data: {
          title: 'Paris night',
          slug: 'paris-night',
          startsAt: '2027-07-10T18:00:00.000Z',
          startsAt_tz: 'Europe/Paris',
          venue: { name: 'Salle X', street: '1 Rue Y', town: 'Paris', country: 'FR' },
        } as never,
      }),
    )
    const doc = await payload.findByID({ collection: 'events', id: event.id, depth: 1 })
    const options = getPluginOptions(payload.config)!
    const { graph, warnings } = buildStructuredData({ options, settings: null, collection: 'events', doc })
    const node = graph?.['@graph'].find((n) => n['@type'] === 'Event')
    expect(warnings.filter((w) => w.startsWith('events/'))).toEqual([])
    expect(node?.startDate).toBe('2027-07-10T20:00:00+02:00')
    expect((node?.location as { address: { addressLocality: string } }).address.addressLocality).toBe('Paris')
  })

  test('only an event-mapped collection offers Event in its type select', () => {
    const typeOptions = (slug: string) => {
      const collection = payload.config.collections.find((c) => c.slug === slug)
      const group = collection?.fields.find((f) => 'name' in f && f.name === 'structuredData')
      const select = group && 'fields' in group ? group.fields.find((f) => 'name' in f && f.name === 'type') : undefined
      return select && 'options' in select ? select.options.map((o) => (typeof o === 'string' ? o : o.value)) : []
    }
    expect(typeOptions('events')).toContain('Event')
    expect(typeOptions('posts')).not.toContain('Event')
    expect(typeOptions('pages')).not.toContain('Event')
  })
})

describe('eCommerce plugin products', () => {
  test('options discover GBP decimals from the eCommerce price fields', () => {
    const options = getPluginOptions(payload.config)!
    expect(options.shop?.currency).toBe('GBP')
    expect(options.shop?.currencies).toContainEqual({ code: 'GBP', decimals: 2 })
  })

  test('a product with two published variants outputs a ProductGroup with GBP prices from minor units', async () => {
    const cleanUp: (() => Promise<unknown>)[] = []
    try {
      const size = await payload.create({ collection: 'variantTypes', data: { label: 'Size', name: 'size' } })
      cleanUp.push(() => payload.delete({ collection: 'variantTypes', id: size.id }))
      const small = await payload.create({ collection: 'variantOptions', data: { variantType: size.id, label: 'Small', value: 'small' } })
      cleanUp.push(() => payload.delete({ collection: 'variantOptions', id: small.id }))
      const large = await payload.create({ collection: 'variantOptions', data: { variantType: size.id, label: 'Large', value: 'large' } })
      cleanUp.push(() => payload.delete({ collection: 'variantOptions', id: large.id }))

      const product = await payload.create({
        collection: 'products',
        data: { title: 'Loopy Cardigan', slug: 'loopy-cardigan', enableVariants: true, variantTypes: [size.id], _status: 'published' },
      })
      cleanUp.push(() => payload.delete({ collection: 'products', id: product.id }))

      const stored: { id: number; optionId: number; size: string; price: number; inventory: number }[] = []
      for (const [option, price, inventory] of [[small, 2000, 4], [large, 2250, 0]] as const) {
        const variant = await payload.create({
          collection: 'variants',
          data: { product: product.id, options: [option.id], inventory, priceInGBPEnabled: true, priceInGBP: price, _status: 'published' },
        })
        cleanUp.push(() => payload.delete({ collection: 'variants', id: variant.id }))
        stored.push({ id: variant.id, optionId: option.id, size: option.label, price: variant.priceInGBP!, inventory })
      }

      const doc = await payload.findByID({ collection: 'products', id: product.id, depth: 3 })
      const options = getPluginOptions(payload.config)!
      const { graph, warnings } = buildStructuredData({ options, settings: null, collection: 'products', doc })
      expect(warnings.filter((w) => w.startsWith('products/'))).toEqual([])

      const group = graph?.['@graph'].find((n) => n['@type'] === 'ProductGroup')
      expect(group?.name).toBe('Loopy Cardigan')
      expect(group?.variesBy).toEqual(['https://schema.org/size'])
      // The variants join lists the newest first, so match each output variant to its stored row by size
      type OutVariant = { size: string; offers: { price: number; priceCurrency: string; availability: string; url: string } }
      const variants = group?.hasVariant as OutVariant[]
      expect(variants.map((v) => v.size).sort()).toEqual(['Large', 'Small'])
      for (const v of variants) {
        const row = stored.find((s) => s.size === v.size)!
        expect(v.offers.price).toBe(row.price / 100)
        expect(v.offers.priceCurrency).toBe('GBP')
        expect(v.offers.availability).toBe(row.inventory > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock')
        expect(v.offers.url).toBe(`http://localhost:3000/products/loopy-cardigan?size=${row.optionId}&variant=${row.id}`)
      }
      expect(variants.find((v) => v.size === 'Large')?.offers.price).toBe(22.5)
    } finally {
      // Newest first; a delete that throws fails the test
      while (cleanUp.length) {await cleanUp.pop()!()}
    }
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

  test('an event with a bad date renders the preview with a warning and does not throw', async () => {
    const stub = Object.create(payload) as Payload
    stub.findByID = (() => Promise.resolve({
      id: 1,
      title: 'Bad date',
      slug: 'bad-date',
      startsAt: 'not a date',
      venue: { name: 'Hall', street: '1 High Street', town: 'Ashford' },
    })) as never
    const props = { collectionSlug: 'events', data: { id: 1 }, payload: stub } as unknown as Parameters<typeof StructuredDataPreview>[0]
    const html = renderToStaticMarkup(await StructuredDataPreview(props))
    expect(html).toContain('Preview (last saved version)')
    expect(html).toContain('Event skipped')
    expect(html).toContain('WebSite')
  })

  test('unsaved document prompts to save', async () => {
    const html = renderToStaticMarkup(await StructuredDataPreview(baseProps({})))
    expect(html).toContain('Save this document')
  })
})
