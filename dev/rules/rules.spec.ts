import { describe, expect, it } from 'vitest'

import type { JsonLdGraph } from '../../src/types.js'
import { checkSchemaOrg } from './checkSchemaOrg.js'
import { fullGraphs } from './fixtures.js'
import { checkGoogle, GOOGLE_RULES, resolvesIn } from './google.js'

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every object in the graph, top-level nodes and nested ones, with the key it sits under */
const walk = (value: unknown, visit: (key: string, value: unknown) => void, key = ''): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, key))
    return
  }
  visit(key, value)
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) walk(v, visit, k)
  }
}

const URL_KEYS = new Set(['@id', 'image', 'item', 'logo', 'mainEntityOfPage', 'primaryImageOfPage', 'url'])

const graphs = fullGraphs()

const SCENARIOS = ['organization', 'localBusiness', 'blogPosting', 'article', 'service', 'webPage', 'faq', 'breadcrumbs']

it('builds every scenario', () => {
  expect(Object.keys(graphs).sort()).toEqual([...SCENARIOS].sort())
})

for (const scenario of SCENARIOS) {
  describe(scenario, () => {
    const graph = graphs[scenario]
    const nodes = graph['@graph']

    it('every node is valid Schema.org', () => {
      for (const node of nodes) expect(checkSchemaOrg(node)).toEqual([])
    })

    it('every Google rule is met', () => {
      const problems: string[] = []
      walk(nodes, (_key, value) => {
        if (isRecord(value)) problems.push(...checkGoogle(value, graph))
      })
      expect(problems).toEqual([])
    })

    it('every URL is absolute', () => {
      const bad: string[] = []
      walk(nodes, (key, value) => {
        if (!URL_KEYS.has(key) || typeof value !== 'string') return
        if (key === '@id' && value.startsWith('#')) return
        if (!value.startsWith('https://')) bad.push(`${key}: ${value}`)
      })
      expect(bad).toEqual([])
    })

    it('nodes link by @id', () => {
      const ids = nodes.map((n) => n['@id']).filter((id): id is string => typeof id === 'string')
      expect(new Set(ids).size).toBe(ids.length)
      const dangling: string[] = []
      walk(nodes, (_key, value) => {
        if (!isRecord(value)) return
        const keys = Object.keys(value)
        if (keys.length === 1 && keys[0] === '@id' && !ids.includes(String(value['@id']))) {
          dangling.push(String(value['@id']))
        }
      })
      expect(dangling).toEqual([])
    })
  })
}

describe('scenario contents', () => {
  const typesOf = (name: string) => graphs[name]?.['@graph'].map((n) => n['@type'])

  it('each scenario holds the node it is named for', () => {
    expect(typesOf('organization')).toEqual(['Organization', 'WebSite'])
    expect(typesOf('localBusiness')).toEqual(['LocalBusiness', 'WebSite'])
    expect(typesOf('blogPosting')).toEqual(['Organization', 'WebSite', 'BlogPosting', 'BreadcrumbList'])
    expect(typesOf('article')).toEqual(['Organization', 'WebSite', 'Article', 'BreadcrumbList'])
    expect(typesOf('service')).toEqual(['Organization', 'WebSite', 'Service', 'BreadcrumbList'])
    expect(typesOf('webPage')).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'])
    expect(typesOf('faq')).toEqual(['Organization', 'WebSite', 'WebPage', 'FAQPage', 'BreadcrumbList'])
    expect(typesOf('breadcrumbs')).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'])
  })

  it('the FAQ page holds all four questions from both blocks', () => {
    const faq = graphs.faq?.['@graph'].find((n) => n['@type'] === 'FAQPage')
    expect(faq?.mainEntity).toHaveLength(4)
  })

  it('the nested-docs trail gives Home plus every ancestor, at least two items (Google)', () => {
    const list = graphs.breadcrumbs?.['@graph'].find((n) => n['@type'] === 'BreadcrumbList')
    const items = list?.itemListElement as Json[]
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.map((i) => i.name)).toEqual(['Home', 'Services', 'AI consulting', 'Workshops'])
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4])
  })
})

describe('GOOGLE_RULES', () => {
  it('every entry records its source page and the day it was checked', () => {
    for (const rule of Object.values(GOOGLE_RULES)) {
      expect(rule.source).toMatch(/^https:\/\/developers\.google\.com\/search\//)
      expect(rule.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('every knownGap is a recommended property, and really is missing from the output', () => {
    for (const [type, rule] of Object.entries(GOOGLE_RULES)) {
      for (const gap of Object.keys(rule.knownGaps ?? {})) {
        expect(rule.recommended, `${type}: ${gap}`).toContain(gap)
        for (const graph of Object.values(graphs)) {
          walk(graph['@graph'], (_key, value) => {
            if (isRecord(value) && value['@type'] === type) {
              expect(resolvesIn(value, gap, graph), `${type}.${gap} is output, drop it from knownGaps`).toBe(false)
            }
          })
        }
      }
    }
  })
})

describe('the checker catches a broken node', () => {
  const clone = () => structuredClone(graphs.blogPosting)
  const postOf = (graph: JsonLdGraph) => graph['@graph'].find((n) => n['@type'] === 'BlogPosting') as Json

  it('a misspelt property fails Schema.org', () => {
    const graph = clone()
    const post = postOf(graph)
    post.headlin = 'x'
    expect(checkSchemaOrg(post)).toEqual(['BlogPosting.headlin: unknown property for BlogPosting'])
  })

  it('a missing recommended property fails Google', () => {
    const graph = clone()
    const post = postOf(graph)
    delete post.headline
    expect(checkGoogle(post, graph)).toEqual(['BlogPosting: recommended "headline" is missing'])
  })

  it('a missing required property fails Google', () => {
    const graph = clone()
    const list = graph['@graph'].find((n) => n['@type'] === 'BreadcrumbList') as Json
    delete list.itemListElement
    expect(checkGoogle(list, graph)).toEqual(['BreadcrumbList: required "itemListElement" is missing'])
  })
})
