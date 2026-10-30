import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { structuredDataPlugin } from '@lavinedev/payload-plugin-structured-data'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) process.env.ROOT_DIR = dirname

export default buildConfig({
  admin: { importMap: { baseDir: path.resolve(dirname) } },
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text' },
        { name: 'publishedAt', type: 'date' },
        {
          name: 'meta',
          type: 'group',
          fields: [
            { name: 'description', type: 'textarea' },
            { name: 'image', type: 'upload', relationTo: 'media' },
          ],
        },
      ],
    },
    {
      slug: 'pages',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text' },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [
            {
              slug: 'faq',
              fields: [
                {
                  name: 'faqs',
                  type: 'array',
                  fields: [
                    { name: 'question', type: 'text' },
                    { name: 'answer', type: 'textarea' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: 'events',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text' },
        { name: 'summary', type: 'textarea' },
        { name: 'startsAt', type: 'date', timezone: true },
        { name: 'endsAt', type: 'date', timezone: true },
        {
          name: 'venue',
          type: 'group',
          fields: [
            { name: 'name', type: 'text' },
            { name: 'street', type: 'text' },
            { name: 'town', type: 'text' },
            { name: 'postcode', type: 'text' },
            { name: 'country', type: 'text' },
            { name: 'onlineUrl', type: 'text' },
          ],
        },
        {
          name: 'tickets',
          type: 'array',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'price', type: 'number' },
            { name: 'currency', type: 'text' },
            { name: 'link', type: 'text' },
          ],
        },
        { name: 'artists', type: 'array', fields: [{ name: 'name', type: 'text' }] },
        {
          name: 'status',
          type: 'select',
          options: ['scheduled', 'cancelled', 'postponed', 'rescheduled', 'movedOnline'],
        },
        { name: 'festival', type: 'relationship', relationTo: 'events' },
      ],
    },
    { slug: 'media', fields: [], upload: { staticDir: path.resolve(dirname, 'media') } },
  ],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./dev/dev.db' } }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  plugins: [
    structuredDataPlugin({
      siteUrl: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
      timeZone: 'Europe/London',
      collections: {
        events: {
          type: 'Event',
          path: (doc) => `/events/${doc.slug}`,
          fields: { headline: 'title', description: 'summary' },
          event: {
            startDate: 'startsAt',
            endDate: 'endsAt',
            status: 'status',
            location: {
              name: 'venue.name',
              streetAddress: 'venue.street',
              addressLocality: 'venue.town',
              postalCode: 'venue.postcode',
              addressCountry: 'venue.country',
              onlineUrl: 'venue.onlineUrl',
            },
            offers: { path: 'tickets', name: 'label', priceCurrency: 'currency', url: 'link', defaultCurrency: 'GBP' },
            performers: { path: 'artists' },
            superEvent: (doc) => {
              const festival = doc.festival
              if (!festival || typeof festival !== 'object') return null
              const { title, slug, startsAt, endsAt, venue } = festival as Record<string, unknown>
              const place = (venue ?? {}) as Record<string, string | undefined>
              if (typeof title !== 'string' || typeof slug !== 'string') return null
              return {
                name: title,
                path: `/events/${slug}`,
                startDate: startsAt,
                endDate: endsAt,
                location: {
                  name: place.name,
                  streetAddress: place.street,
                  addressLocality: place.town,
                  postalCode: place.postcode,
                  addressCountry: place.country,
                },
              }
            },
          },
        },
        posts: { type: 'BlogPosting', path: (doc) => `/blog/${doc.slug}` },
        pages: {
          type: 'WebPage',
          path: (doc) => (doc.slug === 'home' ? '/' : `/${doc.slug}`),
          faq: { block: 'faq', items: 'faqs', question: 'question', answer: 'answer' },
        },
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
