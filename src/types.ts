import type { CollectionSlug } from 'payload'

export type Doc = Record<string, unknown>
export type PageType = 'Article' | 'BlogPosting' | 'Service' | 'WebPage'
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

export type CollectionOptions = {
  type: PageType | ((doc: Doc) => PageType | null)
  /** Public path of the document, starting with '/'. '/' for the home page */
  path: (doc: Doc) => string
  fields?: Partial<Record<PageField, FieldPath>>
  faq?: FaqOptions
  breadcrumbs?: (doc: Doc) => BreadcrumbItem[]
}

export type StructuredDataPluginOptions = {
  siteUrl: string | undefined
  collections: Partial<Record<CollectionSlug, CollectionOptions>>
  /** Upload collection for the logo and image. Default 'media' */
  mediaCollection?: CollectionSlug
  /** Image size name to prefer, e.g. 'og'. Falls back to the original */
  imageSize?: string
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
