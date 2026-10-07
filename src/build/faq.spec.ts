import { describe, expect, test } from 'vitest'
import { buildFaqPage } from './faq.js'

const faq = { block: 'faq', items: 'faqs', question: 'question', answer: 'answer' }

describe('buildFaqPage', () => {
  test('merges all FAQ blocks into one FAQPage and drops blank rows', () => {
    const doc = {
      layout: [
        { blockType: 'faq', faqs: [{ question: ' Q1 ', answer: 'A1' }, { question: '', answer: 'x' }] },
        { blockType: 'content' },
        { blockType: 'faq', faqs: [{ question: 'Q2', answer: ' A2 ' }] },
      ],
    }
    expect(buildFaqPage(doc, faq, 'https://a.com/x')).toEqual({
      '@type': 'FAQPage',
      '@id': 'https://a.com/x#faq',
      mainEntity: [
        { '@type': 'Question', name: 'Q1', acceptedAnswer: { '@type': 'Answer', text: 'A1' } },
        { '@type': 'Question', name: 'Q2', acceptedAnswer: { '@type': 'Answer', text: 'A2' } },
      ],
    })
  })

  test('uses a custom blocks field', () => {
    const doc = { content: [{ blockType: 'faq', faqs: [{ question: 'Q', answer: 'A' }] }] }
    expect(buildFaqPage(doc, { ...faq, blocksField: 'content' }, 'https://a.com/x')).not.toBeNull()
  })

  test('no questions gives null', () => {
    expect(buildFaqPage({ layout: [] }, faq, 'https://a.com/x')).toBeNull()
    expect(buildFaqPage({}, faq, 'https://a.com/x')).toBeNull()
  })
})
