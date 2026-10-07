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
    { slug: 'media', fields: [], upload: { staticDir: path.resolve(dirname, 'media') } },
  ],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./dev/dev.db' } }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  plugins: [
    structuredDataPlugin({
      siteUrl: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
      collections: {
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
