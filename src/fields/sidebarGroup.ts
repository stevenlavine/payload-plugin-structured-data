import type { Field } from 'payload'
import { GROUP_NAME, PAGE_TYPES } from '../constants.js'

export function sidebarGroup(): Field {
  return {
    name: GROUP_NAME,
    type: 'group',
    label: 'Structured data',
    admin: { position: 'sidebar' },
    fields: [
      {
        name: 'type',
        type: 'select',
        options: PAGE_TYPES.map((value) => ({ label: value, value })),
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
