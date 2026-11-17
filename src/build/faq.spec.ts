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

  const lexical = (...texts: string[]) => ({
    root: { children: [{ type: 'paragraph', children: texts.map((text) => ({ text })) }] },
  })

  test('reads a Lexical answer as plain text', () => {
    const doc = { layout: [{ blockType: 'faq', faqs: [{ question: 'Q', answer: lexical('Yes, ', 'we do.') }] }] }
    const result = buildFaqPage(doc, faq, 'https://a.com/x') as unknown as { mainEntity: { acceptedAnswer: { text: string } }[] }
    expect(result.mainEntity[0].acceptedAnswer.text).toBe('Yes, we do.')
  })

  test('skips a row whose Lexical answer is empty', () => {
    const doc = {
      layout: [
        {
          blockType: 'faq',
          faqs: [
            { question: 'Empty', answer: { root: { children: [{ type: 'paragraph', children: [] }] } } },
            { question: 'Full', answer: lexical('Hi') },
          ],
        },
      ],
    }
    const result = buildFaqPage(doc, faq, 'https://a.com/x') as unknown as { mainEntity: { name: string }[] }
    expect(result.mainEntity.map((q) => q.name)).toEqual(['Full'])
    const onlyEmpty = { layout: [{ blockType: 'faq', faqs: [{ question: 'Empty', answer: { root: { children: [{ type: 'paragraph', children: [] }] } } }] }] }
    expect(buildFaqPage(onlyEmpty, faq, 'https://a.com/x')).toBeNull()
  })

  test('enabled: only blocks with the box ticked', () => {
    const doc = {
      layout: [
        { blockType: 'faqBlock', enableSchema: true, faqs: [{ question: 'On', answer: 'A' }] },
        { blockType: 'faqBlock', enableSchema: false, faqs: [{ question: 'Off', answer: 'A' }] },
      ],
    }
    const opts = { ...faq, block: 'faqBlock', enabled: 'enableSchema' }
    const result = buildFaqPage(doc, opts, 'https://a.com/x') as unknown as { mainEntity: { name: string }[] }
    expect(result.mainEntity.map((q) => q.name)).toEqual(['On'])
  })

  test('enabled: a missing field counts as off', () => {
    const doc = { layout: [{ blockType: 'faqBlock', faqs: [{ question: 'Q', answer: 'A' }] }] }
    expect(buildFaqPage(doc, { ...faq, block: 'faqBlock', enabled: 'enableSchema' }, 'https://a.com/x')).toBeNull()
  })
})
