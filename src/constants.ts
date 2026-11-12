import type { CollectionOptions, DocumentType, EventPlace, FieldPath, PageField } from './types.js'

export const SETTINGS_SLUG = 'structured-data-settings'
export const GROUP_NAME = 'structuredData'
export const CUSTOM_KEY = 'structuredData'
export const PAGE_TYPES = ['Article', 'BlogPosting', 'Service', 'WebPage'] as const
export const DEFAULT_FIELDS = {
  headline: 'title',
  description: 'meta.description',
  image: ['meta.image', 'heroImage'],
  datePublished: ['publishedAt', 'createdAt'],
  dateModified: 'updatedAt',
  author: 'populatedAuthors',
} as const satisfies Record<PageField, FieldPath>
export const EVENT_TYPE = 'Event'
export const DEFAULT_EVENT_FIELDS = {
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'eventStatus',
  previousStartDate: 'previousStartDate',
  location: {
    name: 'location.name',
    streetAddress: 'location.streetAddress',
    addressLocality: 'location.addressLocality',
    addressRegion: 'location.addressRegion',
    postalCode: 'location.postalCode',
    addressCountry: 'location.addressCountry',
    onlineUrl: 'location.onlineUrl',
  },
} as const satisfies { location: Record<keyof EventPlace, FieldPath> } & Record<string, FieldPath | Record<string, FieldPath>>

export const PRODUCT_TYPE = 'Product'
export const DEFAULT_PRODUCT_FIELDS = {
  headline: 'title',
  description: ['meta.description', 'description'],
  image: 'gallery',
  stock: 'inventory',
} as const satisfies Record<string, FieldPath>

/** The types a collection may output, and so the options in its editor select */
export function documentTypesFor(config: CollectionOptions): readonly DocumentType[] {
  const types: DocumentType[] = [...PAGE_TYPES]
  if (config.type === EVENT_TYPE || config.event) types.push(EVENT_TYPE)
  if (config.type === PRODUCT_TYPE || config.product) types.push(PRODUCT_TYPE)
  return types.length === PAGE_TYPES.length ? PAGE_TYPES : types
}
