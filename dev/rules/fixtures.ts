import { buildStructuredData } from '../../src/build/buildStructuredData.js'
import type { Doc, JsonLdGraph, ResolvedOptions, Settings } from '../../src/types.js'

/*
 * Complete inputs for every scenario the plugin outputs. Every graph is built through the
 * public buildStructuredData, the same way the render path builds it. Media and page paths
 * are relative on purpose, so the URL checks prove the builders make them absolute.
 */

const media = (name: string) => ({
  id: name,
  url: `/media/${name}.png`,
  sizes: { og: { url: `/media/${name}-1200x630.png` } },
})

const settings: Settings = {
  organizationType: 'Organization',
  name: 'Lavine Web & AI Solutions',
  legalName: 'Lavine Web & AI Solutions Ltd',
  description: 'Web development and AI consultancy for small businesses.',
  logo: media('logo'),
  image: media('office'),
  email: 'hello@example.com',
  telephone: '+44 1233 000000',
  address: {
    streetAddress: '1 High Street',
    addressLocality: 'Ashford',
    addressRegion: 'Kent',
    postalCode: 'TN24 8AA',
    addressCountry: 'GB',
  },
  sameAs: [{ url: 'https://www.linkedin.com/company/example' }, { url: 'https://github.com/example' }],
  areaServed: [{ name: 'Kent' }, { name: 'United Kingdom' }],
  foundingDate: '2025-01-01',
  founder: { name: 'Steve Lavine', jobTitle: 'Founder' },
  identifiers: [{ propertyID: 'Companies House', value: '01234567' }],
}

const options: ResolvedOptions = {
  siteUrl: 'https://example.com',
  imageSize: 'og',
  search: { urlTemplate: 'https://example.com/search?q={search_term_string}' },
  collections: {
    posts: { type: 'BlogPosting', path: (doc) => `/blog/${String(doc.slug)}` },
    news: { type: 'Article', path: (doc) => `/news/${String(doc.slug)}` },
    pages: {
      type: (doc) => (String(doc.slug).startsWith('services') ? 'Service' : 'WebPage'),
      // nested-docs: the last breadcrumb holds the full path
      path: (doc) => {
        const crumbs = Array.isArray(doc.breadcrumbs) ? (doc.breadcrumbs as { url?: string }[]) : []
        return crumbs.at(-1)?.url ?? (doc.slug === 'home' ? '/' : `/${String(doc.slug)}`)
      },
      faq: { block: 'faq', items: 'faqs', question: 'question', answer: 'answer' },
    },
  },
}

const dates = {
  publishedAt: '2026-10-01T09:00:00.000Z',
  createdAt: '2026-09-30T12:00:00.000Z',
  updatedAt: '2026-10-20T15:30:00.000Z',
}

const authors = [
  { id: 1, name: 'Steve Lavine' },
  { id: 2, name: 'Jo Bloggs' },
]

const meta = (description: string) => ({ description, image: media('hero') })

const post: Doc = {
  id: 10,
  slug: 'structured-data-for-payload',
  title: 'Structured data for Payload',
  meta: meta('How we add Schema.org JSON-LD to a Payload site.'),
  populatedAuthors: authors,
  ...dates,
}

const newsItem: Doc = {
  id: 11,
  slug: 'plugin-released',
  title: 'Structured data plugin released',
  meta: meta('Our open-source plugin is on npm.'),
  populatedAuthors: authors,
  ...dates,
}

const servicePage: Doc = {
  id: 20,
  slug: 'services-ai',
  title: 'AI implementation',
  meta: meta('AI tools and automations built for your business.'),
  ...dates,
}

const aboutPage: Doc = {
  id: 21,
  slug: 'about',
  title: 'About us',
  meta: meta('Who we are and how we work.'),
  ...dates,
}

const faqBlock = (id: string, rows: [string, string][]) => ({
  id,
  blockType: 'faq',
  faqs: rows.map(([question, answer]) => ({ question, answer })),
})

const faqPage: Doc = {
  id: 22,
  slug: 'faq',
  title: 'Frequently asked questions',
  meta: meta('Answers to the questions we hear most.'),
  layout: [
    { id: 'b0', blockType: 'content', text: 'Intro' },
    faqBlock('b1', [
      ['How long does a website take?', 'Most sites take four to eight weeks.'],
      ['Do you host sites?', 'Yes, on Vercel or managed WordPress hosting.'],
    ]),
    faqBlock('b2', [
      ['Can you add AI to an existing site?', 'Yes. We start with a short audit.'],
      ['Do you offer training?', 'Yes, live sessions for your team.'],
    ]),
  ],
  ...dates,
}

const nestedPage: Doc = {
  id: 23,
  slug: 'workshops',
  title: 'Workshops',
  meta: meta('Hands-on AI workshops for small teams.'),
  // Shape written by @payloadcms/plugin-nested-docs
  breadcrumbs: [
    { id: 'c1', doc: 30, label: 'Services', url: '/services' },
    { id: 'c2', doc: 31, label: 'AI consulting', url: '/services/ai-consulting' },
    { id: 'c3', doc: 23, label: 'Workshops', url: '/services/ai-consulting/workshops' },
  ],
  ...dates,
}

const build = (input: Partial<Parameters<typeof buildStructuredData>[0]>): JsonLdGraph => {
  const result = buildStructuredData({ options, settings, ...input })
  if (!result.graph) throw new Error(`No graph built: ${result.warnings.join('; ')}`)
  if (result.warnings.length) throw new Error(`Fixture produced warnings: ${result.warnings.join('; ')}`)
  return result.graph
}

export function fullGraphs(): Record<string, JsonLdGraph> {
  return {
    organization: build({}),
    localBusiness: build({ settings: { ...settings, organizationType: 'LocalBusiness' } }),
    blogPosting: build({ collection: 'posts', doc: post }),
    article: build({ collection: 'news', doc: newsItem }),
    service: build({ collection: 'pages', doc: servicePage }),
    webPage: build({ collection: 'pages', doc: aboutPage }),
    faq: build({ collection: 'pages', doc: faqPage }),
    breadcrumbs: build({ collection: 'pages', doc: nestedPage }),
  }
}
