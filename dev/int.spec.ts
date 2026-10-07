import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { getPluginOptions } from '../src/plugin.js'
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
