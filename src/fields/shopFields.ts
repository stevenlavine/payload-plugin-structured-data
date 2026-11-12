import type { Field } from 'payload'

const days = (name: string): Field => ({ name, type: 'number', min: 0, admin: { description: 'Whole days' } })

export function shopFields(): Field {
  return {
    name: 'shop',
    type: 'group',
    label: 'Shop',
    fields: [
      {
        name: 'defaultCondition',
        type: 'select',
        options: [
          { label: 'New', value: 'new' },
          { label: 'Used', value: 'used' },
          { label: 'Refurbished', value: 'refurbished' },
        ],
      },
      {
        name: 'shipping',
        type: 'array',
        label: 'Shipping options',
        fields: [
          { name: 'name', type: 'text' },
          { name: 'countries', type: 'text', required: true, admin: { description: 'Two-letter codes, comma separated, e.g. GB, IE' } },
          { name: 'cost', type: 'number', required: true, min: 0, admin: { description: 'In the shop currency. 0 for free' } },
          { name: 'freeOver', type: 'number', min: 0 },
          days('handlingMin'),
          days('handlingMax'),
          days('transitMin'),
          days('transitMax'),
        ],
      },
      {
        name: 'returns',
        type: 'group',
        fields: [
          {
            name: 'policy',
            type: 'select',
            options: [
              { label: 'Returns within a number of days', value: 'finite' },
              { label: 'No returns', value: 'none' },
              { label: 'Returns at any time', value: 'unlimited' },
            ],
          },
          { name: 'days', type: 'number', min: 1 },
          { name: 'countries', type: 'text' },
          {
            name: 'fees',
            type: 'select',
            options: [
              { label: 'Free', value: 'free' },
              { label: 'Customer pays', value: 'customer' },
              { label: 'Return shipping fee', value: 'shipping' },
            ],
          },
          { name: 'feeAmount', type: 'number', min: 0 },
          {
            name: 'methods',
            type: 'select',
            hasMany: true,
            options: [
              { label: 'Mail', value: 'mail' },
              { label: 'Store', value: 'store' },
            ],
          },
          { name: 'link', type: 'text', admin: { description: 'A page describing the policy. Enough on its own' } },
        ],
      },
    ],
  }
}
