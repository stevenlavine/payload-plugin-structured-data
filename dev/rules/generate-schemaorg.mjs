// Run by hand: node dev/rules/generate-schemaorg.mjs
// Downloads the official Schema.org vocabulary and writes a trimmed schemaorg.json
// covering only the types this plugin can output (and the types they nest).
import { writeFileSync } from 'node:fs'

const SOURCE = 'https://schema.org/version/latest/schemaorg-current-https.jsonld'
const KEEP = [
  'Organization', 'LocalBusiness', 'WebSite', 'WebPage', 'Article', 'BlogPosting', 'Service',
  'FAQPage', 'Question', 'Answer', 'BreadcrumbList', 'ListItem', 'PostalAddress', 'Person',
  'PropertyValue', 'ImageObject', 'SearchAction', 'EntryPoint',
]

const strip = (id) => id.replace(/^schema:/, '')
const ids = (v) => (v === undefined ? [] : [].concat(v)).map((x) => strip(x['@id']))

const graph = (await (await fetch(SOURCE)).json())['@graph']
const parentsOf = new Map()
const props = []
for (const n of graph) {
  const kinds = [].concat(n['@type'])
  if (kinds.includes('rdfs:Class') && n['@id'].startsWith('schema:')) {
    parentsOf.set(strip(n['@id']), ids(n['rdfs:subClassOf']))
  } else if (kinds.includes('rdf:Property') && n['@id'].startsWith('schema:')) {
    props.push({ name: strip(n['@id']), domains: ids(n['schema:domainIncludes']), ranges: ids(n['schema:rangeIncludes']) })
  }
}

// Every ancestor, nearest first (breadth-first, de-duplicated).
const ancestors = (type) => {
  const out = []
  let level = parentsOf.get(type) ?? []
  while (level.length) {
    const next = []
    for (const p of level) {
      if (!out.includes(p)) {
        out.push(p)
        next.push(...(parentsOf.get(p) ?? []))
      }
    }
    level = next
  }
  return out
}

const types = {}
for (const type of [...KEEP].sort()) {
  if (!parentsOf.has(type)) throw new Error(`Type not found in vocabulary: ${type}`)
  const parents = ancestors(type)
  const lineage = new Set([type, ...parents])
  const properties = {}
  for (const p of props.filter((x) => x.domains.some((d) => lineage.has(d))).sort((a, b) => a.name.localeCompare(b.name))) {
    properties[p.name] = [...new Set(p.ranges)].sort()
  }
  types[type] = { parents, properties }
}

// The JSON-LD file does not carry its release number, so read it from the releases page.
let version = 'unknown'
try {
  const html = await (await fetch('https://schema.org/docs/releases.html')).text()
  version = html.match(/Version (\d+\.\d+)/)?.[1] ?? version
} catch {
  /* keep 'unknown' */
}

const out = { source: SOURCE, version, fetched: new Date().toISOString().slice(0, 10), types }
writeFileSync(new URL('./schemaorg.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`Wrote schemaorg.json: ${KEEP.length} types, Schema.org ${version}`)
