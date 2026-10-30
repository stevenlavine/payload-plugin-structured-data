import type { Field } from 'payload'
import { GROUP_NAME, PAGE_TYPES } from '../constants.js'
import type { DocumentType } from '../types.js'

export function sidebarGroup(types: readonly DocumentType[] = PAGE_TYPES): Field {
  return {
    name: GROUP_NAME,
    type: 'group',
    label: 'Structured data',
    admin: { position: 'sidebar' },
    fields: [
      {
        name: 'type',
        type: 'select',
        options: types.map((value) => ({ label: value, value })),
        admin: { description: 'Leave empty to use the default for this collection.' },
      },
      { name: 'disabled', type: 'checkbox', label: 'Off for this page' },
      {
        name: 'preview',
        type: 'ui',
        admin: {
          components: {
            Field: '@lavinedev/payload-plugin-structured-data/rsc#StructuredDataPreview',
          },
        },
      },
    ],
  }
}
