import type { GlobalConfig } from 'payload'
import { SETTINGS_SLUG } from '../constants.js'
import type { ResolvedOptions } from '../types.js'

export function settingsGlobal(options: ResolvedOptions): GlobalConfig {
  return {
    slug: SETTINGS_SLUG,
    label: 'Structured data',
    admin: {
      group: 'Settings',
      description: 'Business details used for Schema.org structured data on every page.',
    },
    fields: [
      {
        name: 'organizationType',
        type: 'select',
        defaultValue: 'Organization',
        options: [
          { label: 'Organisation', value: 'Organization' },
          { label: 'Local business (needs an address)', value: 'LocalBusiness' },
        ],
      },
      { name: 'name', type: 'text', required: true },
      { name: 'legalName', type: 'text' },
      { name: 'description', type: 'textarea' },
      { name: 'logo', type: 'upload', relationTo: options.mediaCollection ?? 'media' },
      {
        name: 'image',
        type: 'upload',
        relationTo: options.mediaCollection ?? 'media',
        admin: { description: 'A photo of the business, e.g. the premises or team. Leave empty to use the logo.' },
      },
      { name: 'email', type: 'email' },
      { name: 'telephone', type: 'text', admin: { description: 'International format, e.g. +441234567890' } },
      {
        name: 'address',
        type: 'group',
        fields: [
          { name: 'streetAddress', type: 'text' },
          { name: 'addressLocality', type: 'text', label: 'Town or city' },
          { name: 'addressRegion', type: 'text', label: 'County or region' },
          { name: 'postalCode', type: 'text' },
          { name: 'addressCountry', type: 'text', admin: { description: 'Two-letter code, e.g. GB' } },
        ],
      },
      { name: 'sameAs', type: 'array', label: 'Social profiles', fields: [{ name: 'url', type: 'text', required: true }] },
      { name: 'areaServed', type: 'array', label: 'Areas served', fields: [{ name: 'name', type: 'text', required: true }] },
      { name: 'foundingDate', type: 'text', admin: { description: 'YYYY or YYYY-MM-DD' } },
      {
        name: 'founder',
        type: 'group',
        fields: [
          { name: 'name', type: 'text' },
          { name: 'jobTitle', type: 'text' },
        ],
      },
      {
        name: 'identifiers',
        type: 'array',
        admin: { description: 'e.g. Companies House company number' },
        fields: [
          { name: 'propertyID', type: 'text', required: true, label: 'Name' },
          { name: 'value', type: 'text', required: true },
        ],
      },
    ],
  }
}
