import type { CollectionSlug } from 'payload'

export type Doc = Record<string, unknown>
export type PageType = 'Article' | 'BlogPosting' | 'Service' | 'WebPage'
export type DocumentType = PageType | 'Event'
export type FieldPath = string | string[]
export type PageField = 'headline' | 'description' | 'image' | 'datePublished' | 'dateModified' | 'author'
export type BreadcrumbItem = { name: string; path: string }

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

export type EventOptions = {
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
  /** Keeps the fields (so the schema stays stable) but outputs nothing */
  disabled?: boolean
}

/** Options after the plugin has validated them */
export type ResolvedOptions = Omit<StructuredDataPluginOptions, 'siteUrl'> & { siteUrl: string }

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
}

export type JsonLdNode = Record<string, unknown> & { '@type': string; '@id'?: string }
export type JsonLdGraph = { '@context': 'https://schema.org'; '@graph': JsonLdNode[] }
export type BuildResult = { graph: JsonLdGraph | null; warnings: string[] }
