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
  timeZone: 'Europe/London',
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
    events: {
      type: 'Event',
      path: (doc) => `/events/${String(doc.slug)}`,
      event: {
        offers: { path: 'tickets', defaultCurrency: 'GBP' },
        organizer: { name: 'organiser.name', url: 'organiser.url' },
        performers: { path: 'artists' },
        performances: { path: 'performances' },
        superEvent: (doc) => {
          const festival = doc.festival as { name: string; slug: string } | undefined
          if (!festival) return null
          return {
            name: festival.name,
            path: `/festivals/${festival.slug}`,
            startDate: '2027-07-09T10:00:00.000Z',
            endDate: '2027-07-11T22:00:00.000Z',
            location: {
              name: 'Mote Park',
              streetAddress: 'Mote Park',
              addressLocality: 'Maidstone',
              postalCode: 'ME15 8NQ',
              addressCountry: 'GB',
            },
          }
        },
      },
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

const ticket = {
  name: 'General admission',
  price: 25,
  priceCurrency: 'GBP',
  availability: 'inStock',
  validFrom: '2027-01-05T09:00:00.000Z',
  url: '/tickets/general',
}

// Every recommended Event path resolves from this one. July is British Summer Time
const fullEvent: Doc = {
  id: 40,
  slug: 'summer-gig',
  title: 'Summer gig',
  meta: meta('An evening of live music in the park.'),
  startDate: '2027-07-10T18:00:00.000Z',
  endDate: '2027-07-10T21:00:00.000Z',
  eventStatus: 'scheduled',
  location: {
    name: 'Mote Park Bandstand',
    streetAddress: 'Mote Park',
    addressLocality: 'Maidstone',
    addressRegion: 'Kent',
    postalCode: 'ME15 8NQ',
    addressCountry: 'GB',
  },
  tickets: [ticket, { ...ticket, name: 'VIP', price: 60, availability: 'limitedAvailability', url: '/tickets/vip' }],
  organiser: { name: 'Kent Live', url: 'https://kentlive.example.org' },
  artists: [{ name: 'The Marlows' }, { name: 'Jo Bloggs' }],
  ...dates,
}

const rescheduledEvent: Doc = {
  ...fullEvent,
  id: 41,
  slug: 'summer-gig-moved',
  startDate: '2027-07-17T18:00:00.000Z',
  endDate: '2027-07-17T21:00:00.000Z',
  eventStatus: 'rescheduled',
  previousStartDate: '2027-07-10T18:00:00.000Z',
}

const festivalSessionEvent: Doc = {
  ...fullEvent,
  id: 42,
  slug: 'festival-main-stage',
  festival: { name: 'Maidstone Music Festival', slug: 'maidstone-music-festival' },
}

const performance = (startDate: string, endDate: string) => ({ startDate, endDate, status: 'scheduled' })

const multiDateEvent: Doc = {
  ...fullEvent,
  id: 43,
  slug: 'summer-tour',
  startDate: undefined,
  endDate: undefined,
  performances: [
    performance('2027-07-10T18:00:00.000Z', '2027-07-10T21:00:00.000Z'),
    performance('2027-07-11T18:00:00.000Z', '2027-07-11T21:00:00.000Z'),
    performance('2027-07-12T18:00:00.000Z', '2027-07-12T21:00:00.000Z'),
  ],
}

const onlineEvent: Doc = {
  ...fullEvent,
  id: 44,
  slug: 'online-talk',
  location: { onlineUrl: 'https://example.com/live/online-talk' },
}

const hybridEvent: Doc = {
  ...fullEvent,
  id: 45,
  slug: 'hybrid-talk',
  location: { ...(fullEvent.location as object), onlineUrl: 'https://example.com/live/hybrid-talk' },
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
    event: build({ collection: 'events', doc: fullEvent }),
    eventRescheduled: build({ collection: 'events', doc: rescheduledEvent }),
    festivalSession: build({ collection: 'events', doc: festivalSessionEvent }),
    eventDates: build({ collection: 'events', doc: multiDateEvent }),
    eventOnline: build({ collection: 'events', doc: onlineEvent }),
    eventHybrid: build({ collection: 'events', doc: hybridEvent }),
    listing: build({
      list: {
        path: '/events',
        name: 'Upcoming events',
        items: [
          { name: 'Summer gig', path: '/events/summer-gig' },
          { name: 'Summer tour', path: '/events/summer-tour' },
          { name: 'Online talk', path: '/events/online-talk' },
        ],
      },
    }),
  }
}
