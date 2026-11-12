import type { JsonLdGraph } from '../../src/types.js'

export type GoogleRule = {
  /** The Google Search Central page the lists were copied from */
  source: string
  /** The day the page was read, YYYY-MM-DD */
  checked: string
  required: string[]
  recommended: string[]
  /** Recommended properties the plugin does not output, and why */
  knownGaps?: Record<string, string>
  /** Check only nodes that sit directly in the graph, not ones nested inside another node */
  topLevelOnly?: boolean
  /** Recommended paths that apply only when the node meets the condition */
  onlyWhen?: Record<string, (node: Record<string, unknown>) => boolean>
}

/*
 * Property paths are dotted (`author.name`). A path with `|` lists alternatives the
 * page accepts in place of each other ("one of"): `author.url|author.sameAs` is met
 * when either resolves, and a knownGaps key uses the same whole string.
 *
 * Only the type the page documents is checked: a LocalBusiness node is checked against
 * the LocalBusiness page, not the Organization page.
 */
const CHECKED = '2026-10-23'
const PAGES = 'https://developers.google.com/search/docs/appearance'

const ARTICLE: GoogleRule = {
  source: `${PAGES}/structured-data/article`,
  checked: CHECKED,
  // "There are no required properties"
  required: [],
  recommended: [
    'author',
    'author.name',
    // The page says sameAs may be used instead of author.url
    'author.url|author.sameAs',
    'dateModified',
    'datePublished',
    'headline',
    'image',
  ],
  knownGaps: {
    'author.url|author.sameAs': 'authors are read from populated users, which have no profile URL field',
  },
}

const NO_FIELD = 'no field for it in settings'
const IDENTIFIER =
  'no dedicated field; editors can add it under identifiers, which outputs a PropertyValue'

// Google removed the FAQ rich result: no longer shown from 2026-05-07, its documentation
// (structured-data/faqpage, now a redirect to this changelog) removed on 2026-06-15. There are
// no Google lists left to check, so FAQPage, Question and Answer are checked against Schema.org only.
const FAQ_RETIRED: GoogleRule = {
  source: 'https://developers.google.com/search/updates#removing-faq-rich-result',
  checked: CHECKED,
  required: [],
  recommended: [],
}

const EVENT_CHECKED = '2026-10-30'
const ITEM_LIST_CHECKED = '2026-10-30'
const SHOPS_CHECKED = '2026-11-12'

const endsWith = (value: unknown, suffix: string): boolean => typeof value === 'string' && value.endsWith(suffix)

export const GOOGLE_RULES: Record<string, GoogleRule> = {
  Organization: {
    source: `${PAGES}/structured-data/organization`,
    checked: CHECKED,
    topLevelOnly: true,
    // "There are no required properties"
    required: [],
    recommended: [
      'address',
      'address.addressCountry',
      'address.addressLocality',
      'address.addressRegion',
      'address.postalCode',
      'address.streetAddress',
      'alternateName',
      'contactPoint',
      'contactPoint.email',
      'contactPoint.telephone',
      'description',
      'duns',
      'email',
      'foundingDate',
      'globalLocationNumber',
      'hasMerchantReturnPolicy',
      'hasMemberProgram',
      'hasShippingService',
      'iso6523Code',
      'legalName',
      'leiCode',
      'logo',
      'naics',
      'name',
      'numberOfEmployees',
      'sameAs',
      'taxID',
      'telephone',
      'url',
      'vatID',
    ],
    knownGaps: {
      alternateName: NO_FIELD,
      contactPoint: 'settings hold one email and telephone, output at the top level, with no contact type',
      'contactPoint.email': 'settings hold one email, output as Organization.email',
      'contactPoint.telephone': 'settings hold one telephone, output as Organization.telephone',
      duns: IDENTIFIER,
      globalLocationNumber: IDENTIFIER,
      hasMerchantReturnPolicy: 'merchant data is out of scope for this plugin',
      hasMemberProgram: 'merchant data is out of scope for this plugin',
      hasShippingService: 'merchant data is out of scope for this plugin',
      iso6523Code: IDENTIFIER,
      leiCode: IDENTIFIER,
      naics: IDENTIFIER,
      numberOfEmployees: NO_FIELD,
      taxID: IDENTIFIER,
      vatID: IDENTIFIER,
    },
  },
  LocalBusiness: {
    source: `${PAGES}/structured-data/local-business`,
    checked: CHECKED,
    required: ['address', 'name'],
    recommended: [
      'aggregateRating',
      'department',
      'geo',
      'geo.latitude',
      'geo.longitude',
      'menu',
      'openingHoursSpecification',
      'openingHoursSpecification.closes',
      'openingHoursSpecification.dayOfWeek',
      'openingHoursSpecification.opens',
      'openingHoursSpecification.validFrom',
      'openingHoursSpecification.validThrough',
      'priceRange',
      'review',
      'servesCuisine',
      'telephone',
      'url',
    ],
    knownGaps: {
      aggregateRating: 'no reviews or ratings data in the plugin',
      department: 'no department fields in settings',
      geo: 'no latitude/longitude field in settings',
      'geo.latitude': 'no latitude field in settings',
      'geo.longitude': 'no longitude field in settings',
      menu: 'restaurant-only property; no menu field in settings',
      openingHoursSpecification: 'no opening hours fields in settings',
      'openingHoursSpecification.closes': 'no opening hours fields in settings',
      'openingHoursSpecification.dayOfWeek': 'no opening hours fields in settings',
      'openingHoursSpecification.opens': 'no opening hours fields in settings',
      'openingHoursSpecification.validFrom': 'no opening hours fields in settings',
      'openingHoursSpecification.validThrough': 'no opening hours fields in settings',
      priceRange: 'no price range field in settings',
      review: 'no reviews or ratings data in the plugin',
      servesCuisine: 'restaurant-only property; no cuisine field in settings',
    },
  },
  Article: ARTICLE,
  BlogPosting: ARTICLE,
  BreadcrumbList: {
    source: `${PAGES}/structured-data/breadcrumb`,
    checked: CHECKED,
    // The page also asks for at least two ListItems; rules.spec.ts checks that on the breadcrumbs scenario
    required: ['itemListElement'],
    recommended: [],
  },
  ListItem: {
    source: `${PAGES}/structured-data/breadcrumb`,
    checked: CHECKED,
    // The page lets the last item omit `item`; the plugin outputs it on every item, so it is required on all
    required: ['item', 'name', 'position'],
    recommended: [],
  },
  FAQPage: FAQ_RETIRED,
  Question: FAQ_RETIRED,
  Answer: FAQ_RETIRED,
  Event: {
    source: `${PAGES}/structured-data/event`,
    checked: EVENT_CHECKED,
    topLevelOnly: true,
    required: ['location', 'location.address', 'name', 'startDate'],
    recommended: [
      'description',
      'endDate',
      'eventStatus',
      'image',
      'location.name',
      'offers',
      'offers.availability',
      'offers.price',
      'offers.priceCurrency',
      'offers.url',
      'offers.validFrom',
      'organizer',
      'organizer.name',
      'organizer.url',
      'performer',
      'performer.name',
      'previousStartDate',
    ],
    // The page allows previousStartDate only together with EventRescheduled
    onlyWhen: {
      previousStartDate: (node) => String(node.eventStatus).endsWith('EventRescheduled'),
    },
  },
  // An ItemList earns no event result: Google's event page documents no list markup, so
  // there is no Google list to check. Checked against Schema.org only.
  ItemList: {
    source: `${PAGES}/structured-data/event`,
    checked: ITEM_LIST_CHECKED,
    required: [],
    recommended: [],
  },
  Product: {
    // The merchant-listing page (name, image, offers) is the stricter of the two; the snippet page
    // asks only for name plus one of offers, review or aggregateRating
    source: `${PAGES}/structured-data/merchant-listing`,
    checked: SHOPS_CHECKED,
    topLevelOnly: true,
    required: ['name', 'image', 'offers|review|aggregateRating', 'offers.price', 'offers.priceCurrency'],
    recommended: [
      'aggregateRating',
      'brand.name',
      'description',
      'offers.availability',
      'offers.hasMerchantReturnPolicy',
      'offers.itemCondition',
      'offers.shippingDetails',
      'offers.url',
      'review',
      'sku',
    ],
    knownGaps: {
      'offers.shippingDetails':
        'shipping is output on the Organization as a ShippingService; an Offer.shippingDetails would need an OfferShippingDetails node',
    },
    // The page asks for a rating or review only where the site supplies one
    onlyWhen: {
      aggregateRating: (node) => Object.hasOwn(node, 'aggregateRating') || Object.hasOwn(node, 'review'),
      review: (node) => Object.hasOwn(node, 'aggregateRating') || Object.hasOwn(node, 'review'),
    },
  },
  ProductGroup: {
    source: `${PAGES}/structured-data/product-variants`,
    checked: SHOPS_CHECKED,
    topLevelOnly: true,
    // The page's table lists only name. A variant must also meet the Product merchant-listing rules,
    // so its price and currency are required here
    required: ['name', 'hasVariant.offers.price', 'hasVariant.offers.priceCurrency'],
    recommended: ['description', 'hasVariant', 'hasVariant.name', 'hasVariant.sku', 'productGroupID', 'url', 'variesBy'],
  },
  MerchantReturnPolicy: {
    source: `${PAGES}/structured-data/return-policy`,
    checked: SHOPS_CHECKED,
    required: ['applicableCountry|merchantReturnLink', 'returnPolicyCategory|merchantReturnLink'],
    recommended: ['merchantReturnDays', 'returnShippingFeesAmount'],
    onlyWhen: {
      merchantReturnDays: (node) => endsWith(node.returnPolicyCategory, 'MerchantReturnFiniteReturnWindow'),
      returnShippingFeesAmount: (node) => endsWith(node.returnFees, 'ReturnShippingFees'),
    },
  },
  ShippingService: {
    source: `${PAGES}/structured-data/shipping-policy`,
    checked: SHOPS_CHECKED,
    // The page requires only shippingConditions; a destination and rate are recommended on it,
    // and addressCountry / currency are required once those objects exist
    required: ['shippingConditions'],
    recommended: [
      'shippingConditions.shippingDestination.addressCountry',
      'shippingConditions.shippingRate.currency',
    ],
  },
  WebSite: {
    source: `${PAGES}/site-names`,
    checked: CHECKED,
    required: ['name', 'url'],
    recommended: ['alternateName'],
    knownGaps: { alternateName: 'no alternate site name field in settings' },
  },
}

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFilled = (value: unknown): boolean => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0 && value.every(isFilled)
  if (isRecord(value)) return Object.keys(value).length > 0
  return true
}

/** Follows an `{ '@id' }`-only reference to the node it names in the same graph */
const deref = (value: unknown, graph: JsonLdGraph): unknown => {
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== '@id') return value
  return graph['@graph'].find((n) => n['@id'] === value['@id']) ?? value
}

const resolvesPath = (value: unknown, keys: string[], graph: JsonLdGraph): boolean => {
  const here = deref(value, graph)
  if (keys.length === 0) return isFilled(here)
  // An array (e.g. several authors) resolves only when every entry does
  if (Array.isArray(here)) return here.length > 0 && here.every((item) => resolvesPath(item, keys, graph))
  if (!isRecord(here)) return false
  const [key, ...rest] = keys as [string, ...string[]]
  return Object.hasOwn(here, key) && resolvesPath(here[key], rest, graph)
}

/** True when the dotted path (or any `|` alternative) leads to a non-empty value */
export const resolvesIn = (node: Json, path: string, graph: JsonLdGraph): boolean =>
  path.split('|').some((alternative) => resolvesPath(node, alternative.split('.'), graph))

/** Checks one node against GOOGLE_RULES for each of its @types. Returns one message per unmet rule */
export const checkGoogle = (node: Json, graph: JsonLdGraph): string[] => {
  const raw = node['@type']
  const types = (Array.isArray(raw) ? raw : [raw]).filter((t): t is string => typeof t === 'string')
  const messages: string[] = []
  for (const type of types) {
    if (!Object.hasOwn(GOOGLE_RULES, type)) continue
    const rule = GOOGLE_RULES[type]
    if (rule.topLevelOnly && !graph['@graph'].includes(node as never)) continue
    for (const path of rule.required) {
      if (!resolvesIn(node, path, graph)) messages.push(`${type}: required "${path}" is missing`)
    }
    for (const path of rule.recommended) {
      if (rule.knownGaps && Object.hasOwn(rule.knownGaps, path)) continue
      if (rule.onlyWhen && Object.hasOwn(rule.onlyWhen, path) && !rule.onlyWhen[path]?.(node)) continue
      if (!resolvesIn(node, path, graph)) messages.push(`${type}: recommended "${path}" is missing`)
    }
  }
  return messages
}
