import type { UIFieldServerProps } from 'payload'
import React from 'react'
import { buildStructuredData } from '../build/buildStructuredData.js'
import { serializeJsonLd } from '../build/serialize.js'
import { getPluginOptions } from '../plugin.js'
import { getSettings } from './getSettings.js'

const box: React.CSSProperties = {
  fontSize: 11,
  maxHeight: 320,
  overflow: 'auto',
  padding: 8,
  background: 'var(--theme-elevation-50)',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

/** Sidebar preview of the JSON-LD for the last saved version of this document. Never throws. */
export async function StructuredDataPreview(props: UIFieldServerProps) {
  try {
    // collectionSlug is part of ServerComponentProps (payload/dist/admin/forms/Field.d.ts)
    const { collectionSlug, data, payload } = props
    const options = getPluginOptions(payload.config)
    if (!options || !data?.id) {
      return <p style={{ fontSize: 12 }}>Save this document to see its structured data.</p>
    }

    // The edit view loads the document at depth 0, so uploads arrive as IDs. Re-read with depth 1.
    let doc: Record<string, unknown> = data
    try {
      doc = (await payload.findByID({
        collection: collectionSlug as never,
        id: data.id,
        depth: 1,
        draft: true,
      })) as unknown as Record<string, unknown>
    } catch {
      doc = data
    }

    const settings = await getSettings(payload)
    const { graph, warnings } = buildStructuredData({ options, settings, collection: collectionSlug as never, doc })

    return (
      <div>
        <p style={{ fontSize: 12, margin: '0 0 4px' }}>Preview (last saved version)</p>
        {warnings.map((warning, index) => (
          <p key={`${index}-${warning}`} style={{ fontSize: 12, color: 'var(--theme-warning-500)', margin: '0 0 4px' }}>
            {warning}
          </p>
        ))}
        <pre style={box}>{graph ? serializeJsonLd(graph, 2) : 'Nothing to output.'}</pre>
      </div>
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return <p style={{ fontSize: 12 }}>Preview unavailable: {message}</p>
  }
}
