import type { JsonLdGraph } from '../types.js'

/** JSON for a <script> tag: every '<' becomes < so content cannot close the tag. */
export function serializeJsonLd(graph: JsonLdGraph, space?: number): string {
  return JSON.stringify(graph, null, space).replace(/</g, '\\u003c')
}
