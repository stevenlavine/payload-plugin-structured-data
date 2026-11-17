import { buildStructuredData } from '../../src/build/buildStructuredData.js'
import { categoryBreadcrumbs } from '../../src/categoryBreadcrumbs.js'
import type { Doc, JsonLdGraph, ResolvedOptions, Settings, ShopSettings } from '../../src/types.js'

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

// Shop data for the product scenarios. Settings without it keep the Organization free of shop nodes
const shop: ShopSettings = {
  defaultCondition: 'new',
  shipping: [
    { name: 'UK', countries: 'GB', cost: 4.95, freeOver: 50, handlingMin: 0, handlingMax: 1, transitMin: 1, transitMax: 3 },
    { name: 'Europe', countries: 'FR, DE, IE', cost: 12.5, handlingMin: 0, handlingMax: 1, transitMin: 3, transitMax: 7 },
  ],
  returns: { policy: 'finite', days: 30, countries: 'GB', fees: 'free', methods: ['mail'], link: '/returns' },
}
const shopSettings: Settings = { ...settings, shop }

const options: ResolvedOptions = {
  siteUrl: 'https://example.com',
  imageSize: 'og',
  timeZone: 'Europe/London',
  search: { urlTemplate: 'https://example.com/search?q={search_term_string}' },
  // As resolved from structuredDataPlugin({ shop: { currency: 'GBP' } }) after the eCommerce plugin's GBP and EUR fields
  shop: {
    currency: 'GBP',
    currencies: [
      { code: 'GBP', decimals: 2 },
      { code: 'EUR', decimals: 2 },
    ],
  },
  collections: {
    products: {
      type: 'Product',
      path: (doc) => `/products/${String(doc.slug)}`,
      breadcrumbs: categoryBreadcrumbs({
        path: (category) => `/shop/${String(category.slug)}`,
        productPath: (doc) => `/products/${String(doc.slug)}`,
      }),
      product: {
        condition: 'condition',
        availability: (doc) => (doc.madeToOrder === true ? 'madeToOrder' : null),
        outOfStock: 'SoldOut',
        brand: 'brand.name',
        sku: 'sku',
      },
    },
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
          if (!festival) {return null}
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

/** A Lexical value with one paragraph, as the eCommerce template's rich text description stores it */
const richText = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

const clocks = { id: 60, title: 'Clocks', slug: 'clocks', parent: { id: 61, title: 'Antiques', slug: 'antiques' } }

// A one-off antique in the eCommerce plugin's shape: prices in minor units, stock in `inventory`
const oneOff: Doc = {
  id: 50,
  slug: 'brass-duplex',
  title: 'Brass Calibre Duplex by Barwise',
  description: richText('A brass duplex pocket watch by Barwise of London, c. 1830, in full working order.'),
  gallery: [{ image: media('duplex-front') }, { image: media('duplex-back') }],
  categories: [clocks],
  sku: 'A1308',
  brand: { name: 'Barwise' },
  condition: 'used',
  inventory: 1,
  priceInGBPEnabled: true,
  priceInGBP: 175000,
  ...dates,
}

const sold: Doc = { ...oneOff, id: 51, slug: 'brass-duplex-sold', inventory: 0 }

const madeToOrder: Doc = {
  ...oneOff,
  id: 52,
  slug: 'hand-knitted-blanket',
  title: 'Hand-knitted Baby Blanket',
  description: richText('Knitted by hand in merino wool. Made to order: 6-8 weeks from order date.'),
  sku: 'BB-200',
  brand: { name: 'Beautiful Baby Collection' },
  condition: undefined,
  madeToOrder: true,
  inventory: 0,
  priceInGBP: 4500,
}

const sizeType = { id: 1, name: 'size', label: 'Size' }
const extrasType = { id: 2, name: 'extras', label: 'Extras' }
const option = (id: number, label: string, variantType: Doc) => ({ id, label, value: label.toLowerCase().replace(/\s+/g, '-'), variantType })
const small = option(11, '0-3 months', sizeType)
const large = option(12, '3-6 months', sizeType)
const noWrap = option(21, 'No gift wrap', extrasType)
const giftWrap = option(22, 'Gift wrap', extrasType)

/** A published variant. The eCommerce plugin writes the title itself, from the product and option labels */
const variant = (id: number, options: Doc[], price: number, inventory: number, status: 'draft' | 'published' = 'published') => ({
  id,
  title: ['Loopy Cardigan', ...options.map((o) => String(o.label))].join(' — '),
  options,
  inventory,
  priceInGBPEnabled: true,
  priceInGBP: price,
  _status: status,
})

const withVariants: Doc = {
  id: 53,
  slug: 'loopy-cardigan',
  title: 'Loopy Cardigan',
  description: richText('A soft cotton cardigan, hand finished. Gift wrap available.'),
  gallery: [{ image: media('cardigan') }, { image: media('cardigan-small'), variantOption: small }],
  categories: [{ id: 62, title: 'Knitwear', slug: 'knitwear' }],
  sku: '4433',
  brand: { name: 'Beautiful Baby Collection' },
  enableVariants: true,
  variantTypes: [sizeType, extrasType],
  variants: {
    docs: [
      variant(101, [small, noWrap], 2000, 3),
      variant(102, [small, giftWrap], 2500, 3),
      variant(103, [large, noWrap], 2200, 0),
      variant(104, [large, giftWrap], 2700, 2, 'draft'),
    ],
  },
  ...dates,
}

const madeToOrderVariants: Doc = {
  ...withVariants,
  id: 54,
  slug: 'made-to-order-cardigan',
  madeToOrder: true,
  variants: {
    docs: [variant(111, [small, noWrap], 2000, 0), variant(112, [large, giftWrap], 2700, 0)],
  },
}

const twoCurrencies: Doc = {
  ...oneOff,
  id: 55,
  slug: 'silver-hunter',
  title: 'Silver Hunter by Dent',
  sku: 'A1412',
  brand: { name: 'Dent' },
  priceInGBP: 120000,
  priceInEUREnabled: true,
  priceInEUR: 140000,
}

const reviews = {
  rating: { value: 4.8, count: 12 },
  items: [
    { author: 'Jo Bloggs', rating: 5, body: 'Arrived beautifully packed and keeps perfect time.', date: '2026-10-02' },
    { author: 'Sam Smith', rating: 4, body: 'Lovely piece, slower delivery than I hoped.', date: '2026-09-14' },
  ],
}

const build = (input: Partial<Parameters<typeof buildStructuredData>[0]>): JsonLdGraph => {
  const result = buildStructuredData({ options, settings, ...input })
  if (!result.graph) {throw new Error(`No graph built: ${result.warnings.join('; ')}`)}
  if (result.warnings.length) {throw new Error(`Fixture produced warnings: ${result.warnings.join('; ')}`)}
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
    productOneOff: build({ settings: shopSettings, collection: 'products', doc: oneOff }),
    productSold: build({ settings: shopSettings, collection: 'products', doc: sold }),
    productMadeToOrder: build({ settings: shopSettings, collection: 'products', doc: madeToOrder }),
    productMadeToOrderVariants: build({ settings: shopSettings, collection: 'products', doc: madeToOrderVariants }),
    productVariants: build({ settings: shopSettings, collection: 'products', doc: withVariants }),
    productReviews: build({ settings: shopSettings, collection: 'products', doc: oneOff, reviews }),
    shopPolicies: build({ settings: shopSettings }),
    productTwoCurrencies: build({ settings: shopSettings, collection: 'products', doc: twoCurrencies, currency: 'EUR' }),
    productTwoCurrenciesShop: build({ settings: shopSettings, collection: 'products', doc: twoCurrencies }),
  }
}
