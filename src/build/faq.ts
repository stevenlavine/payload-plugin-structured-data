import type { Doc, FaqOptions, JsonLdNode } from '../types.js'
import { plainText, readPath, readText } from './values.js'

function readAnswer(row: unknown, path: string): string | undefined {
  const value = readPath(row, path)
  return typeof value === 'string' ? readText(row, path) : plainText(value)
}

export function buildFaqPage(doc: Doc, faq: FaqOptions, url: string): JsonLdNode | null {
  const blocks = doc[faq.blocksField ?? 'layout']
  if (!Array.isArray(blocks)) {return null}

  const rows = blocks
    .filter((block) => block && typeof block === 'object' && block.blockType === faq.block)
    .filter((block) => faq.enabledField === undefined || (typeof faq.enabledField === 'string' && readPath(block, faq.enabledField) === true))
    .flatMap((block) => {
      const items = (block as Record<string, unknown>)[faq.items]
      return Array.isArray(items) ? items : []
    })
    .map((row) => ({ question: readText(row, faq.question), answer: readAnswer(row, faq.answer) }))
    .filter((row): row is { question: string; answer: string } => Boolean(row.question && row.answer))

  if (!rows.length) {return null}

  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: rows.map((row) => ({
      '@type': 'Question',
      name: row.question,
      acceptedAnswer: { '@type': 'Answer', text: row.answer },
    })),
  }
}
