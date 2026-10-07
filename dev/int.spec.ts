import type { Payload } from 'payload'

import config from '@payload-config'
import { rmSync } from 'node:fs'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

beforeAll(async () => {
  rmSync('./dev/test.db', { force: true })
  process.env.DATABASE_URL = 'file:./dev/test.db'
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.destroy()
})

describe('dev app', () => {
  test('boots with the plugin installed', () => {
    expect(payload.collections.posts).toBeDefined()
  })
})
