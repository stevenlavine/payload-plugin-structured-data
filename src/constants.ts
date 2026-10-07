import type { FieldPath, PageField } from './types.js'

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
