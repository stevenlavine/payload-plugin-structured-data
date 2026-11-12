import type { CollectionSlug } from 'payload'

export type Doc = Record<string, unknown>
export type PageType = 'Article' | 'BlogPosting' | 'Service' | 'WebPage'
export type DocumentType = PageType | 'Event' | 'Product'
export type FieldPath = string | string[]
export type PageField = 'headline' | 'description' | 'image' | 'datePublished' | 'dateModified' | 'author'
export type BreadcrumbItem = { name: string; path: string }
/** A field path, or a function of the document */
export type Mapped<T = string> = FieldPath | ((doc: Doc) => T | null | undefined)
/** ISO 4217 code and its number of minor-unit digits */
export type CurrencyInfo = { code: string; decimals: number }
export type ShopOptions = { currency?: string; currencies?: CurrencyInfo[] }
export type RatingInput = { value: number; count: number; best?: number; worst?: number }
export type ReviewInput = { author: string; rating: number; body?: string; date?: string; best?: number; worst?: number }
export type ReviewsInput = { rating?: RatingInput | null; items?: ReviewInput[] | null }

export type ProductOptions = {
  availability?: Mapped
  stock?: FieldPath
  outOfStock?: 'OutOfStock' | 'SoldOut'
  condition?: Mapped
  price?: { amount: FieldPath; currency?: FieldPath; minorUnits?: boolean }
  brand?: FieldPath
  sku?: FieldPath
  gtin?: FieldPath
  mpn?: FieldPath
  color?: FieldPath
  size?: FieldPath
  material?: FieldPath
  pattern?: FieldPath
  rating?: Mapped<RatingInput>
  reviews?: Mapped<ReviewInput[]>
  variantUrl?: (doc: Doc, variant: Doc) => string
}

export type FaqOptions = {
  /** Blocks field on the document. Default 'layout' */
  blocksField?: string
  /** Block slug, e.g. 'faq' */
  block: string
  /** Array field inside the block holding the Q&A rows, e.g. 'faqs' */
  items: string
  question: string
  answer: string
}

/** The parts of a venue the plugin can output */
export type EventPlace = {
  name?: string
  streetAddress?: string
  addressLocality?: string
  addressRegion?: string
  postalCode?: string
  addressCountry?: string
  onlineUrl?: string
}

/** Ticket offers. Each key is a field path inside one offer row; each default is the key's own name */
export type EventOfferOptions = {
  /** Array (or single group) field holding the offers. Default 'offers' */
  path?: FieldPath
  price?: FieldPath
  priceCurrency?: FieldPath
  /** inStock, soldOut, preOrder and the other Schema.org ItemAvailability names */
  availability?: FieldPath
  validFrom?: FieldPath
  url?: FieldPath
  name?: FieldPath
  /** ISO 4217 code used when a priced offer has none of its own, e.g. 'GBP' */
  defaultCurrency?: string
}

/** Who runs the event. With no mapping, or nothing at the mapped paths, the site organisation is used */
export type EventOrganizerOptions = { name?: FieldPath; url?: FieldPath; type?: 'Organization' | 'Person' }

/** Performer rows. A row is an object read at `name`, or a plain string. Defaults 'performers' and 'name' */
export type EventPerformerOptions = { path?: FieldPath; name?: FieldPath; type?: 'Person' | 'PerformingGroup' }

/** The festival or series an event belongs to */
export type EventSuperEvent = {
  name: string
  path: string
  /** Required: Google reads a parent with no date and place as an invalid event */
  startDate: unknown
  endDate?: unknown
  dateOnly?: boolean
  /** Needs a physical address; an online-only place is treated as none */
  location: EventPlace
}

/**
 * Several dates on one page: an array field with one row per date, giving one Event each.
 * Each key is a field path inside a row; the defaults are the key's own name.
 * A row's offers replace the document's; a row with none uses the document's.
 */
export type EventPerformanceOptions = {
  /** Array field holding the rows */
  path: FieldPath
  startDate?: FieldPath
  endDate?: FieldPath
  status?: FieldPath
  previousStartDate?: FieldPath
  offers?: EventOfferOptions
}

export type EventOptions = {
  /** One Event per row of an array field, for a page with several dates */
  performances?: EventPerformanceOptions
  /** Date field. Default 'startDate'. A time zone stored beside it is read from '<path>_tz' */
  startDate?: FieldPath
  /** Default 'endDate' */
  endDate?: FieldPath
  /** Output dates as YYYY-MM-DD in the event's time zone: true, a field path, or a function of the document */
  dateOnly?: boolean | FieldPath | ((doc: Doc) => boolean)
  /**
   * Field path for each part of the place (defaults are 'location.<key>'), or a function of the document
   * for a fixed venue. Return null when the document has no place.
   */
  location?: Partial<Record<keyof EventPlace, FieldPath>> | ((doc: Doc) => EventPlace | null)
  /** Field holding scheduled, cancelled, postponed, rescheduled or movedOnline (or the Schema.org names). Default 'eventStatus' */
  status?: FieldPath
  /** Date field used only with a rescheduled status. Default 'previousStartDate' */
  previousStartDate?: FieldPath
  /** Ticket offers on the event */
  offers?: EventOfferOptions
  organizer?: EventOrganizerOptions
  performers?: EventPerformerOptions
  /** The parent festival for a document, or null. Its path must differ from the event's own page */
  superEvent?: (doc: Doc) => EventSuperEvent | null
}

export type CollectionOptions = {
  type: DocumentType | ((doc: Doc) => DocumentType | null)
  /** Public path of the document, starting with '/'. '/' for the home page */
  path: (doc: Doc) => string
  fields?: Partial<Record<PageField, FieldPath>>
  faq?: FaqOptions
  breadcrumbs?: (doc: Doc) => BreadcrumbItem[]
  /** Event field mapping. Setting it also offers Event in the editor's type select */
  event?: EventOptions
  /** Product field mapping. Setting it also offers Product in the editor's type select */
  product?: ProductOptions
}

export type StructuredDataPluginOptions = {
  siteUrl: string | undefined
  collections: Partial<Record<CollectionSlug, CollectionOptions>>
  /** Upload collection for the logo and image. Default 'media' */
  mediaCollection?: CollectionSlug
  /** Image size name to prefer, e.g. 'og'. Falls back to the original */
  imageSize?: string
  /** IANA time zone for event dates, e.g. 'Europe/London'. A zone stored on the document wins */
  timeZone?: string
  /** Adds a SearchAction to WebSite, e.g. 'https://example.com/search?q={search_term_string}' */
  search?: { urlTemplate: string }
  /** Turns on the shop settings (shipping, returns, condition) and sets the currencies */
  shop?: ShopOptions
  /** Keeps the fields (so the schema stays stable) but outputs nothing */
  disabled?: boolean
}

/** Options after the plugin has validated them */
export type ResolvedOptions = Omit<StructuredDataPluginOptions, 'siteUrl' | 'shop'> & {
  siteUrl: string
  shop?: { currency?: string; currencies: CurrencyInfo[] }
}

export type ShopSettings = {
  defaultCondition?: 'new' | 'used' | 'refurbished' | null
  shipping?:
    | {
        name?: string | null
        countries?: string | null
        cost?: number | null
        freeOver?: number | null
        handlingMin?: number | null
        handlingMax?: number | null
        transitMin?: number | null
        transitMax?: number | null
      }[]
    | null
  returns?: {
    policy?: 'finite' | 'none' | 'unlimited' | null
    days?: number | null
    countries?: string | null
    fees?: 'free' | 'customer' | 'shipping' | null
    feeAmount?: number | null
    methods?: ('mail' | 'store')[] | null
    link?: string | null
  } | null
}

export type Settings = {
  organizationType?: 'Organization' | 'LocalBusiness' | null
  name?: string | null
  legalName?: string | null
  description?: string | null
  logo?: unknown
  image?: unknown
  email?: string | null
  telephone?: string | null
  address?: {
    streetAddress?: string | null
    addressLocality?: string | null
    addressRegion?: string | null
    postalCode?: string | null
    addressCountry?: string | null
  } | null
  sameAs?: { url?: string | null }[] | null
  areaServed?: { name?: string | null }[] | null
  foundingDate?: string | null
  founder?: { name?: string | null; jobTitle?: string | null } | null
  identifiers?: { propertyID?: string | null; value?: string | null }[] | null
  shop?: ShopSettings | null
}

/** A listings page: its own path, an optional heading and the rows to list. Generic on purpose. */
export type ListInput = { path: string; name?: string; items: { name: string; path: string }[] }

export type JsonLdNode = Record<string, unknown> & { '@type': string; '@id'?: string }
export type JsonLdGraph = { '@context': 'https://schema.org'; '@graph': JsonLdNode[] }
export type BuildResult = { graph: JsonLdGraph | null; warnings: string[] }
