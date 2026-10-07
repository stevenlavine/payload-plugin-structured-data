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

/** Sidebar preview of the JSON-LD for the last saved version of this document. */
export async function StructuredDataPreview(props: UIFieldServerProps) {
  // collectionSlug is part of ServerComponentProps (payload/dist/admin/forms/Field.d.ts)
  const { collectionSlug, data, payload } = props
  const options = getPluginOptions(payload.config)
  if (!options || !data?.id) {
    return <p style={{ fontSize: 12 }}>Save this document to see its structured data.</p>
  }
  const settings = await getSettings(payload)
  const { graph, warnings } = buildStructuredData({ options, settings, collection: collectionSlug as never, doc: data })

  return (
    <div>
      <p style={{ fontSize: 12, margin: '0 0 4px' }}>Preview (last saved version)</p>
      {warnings.map((warning) => (
        <p key={warning} style={{ fontSize: 12, color: 'var(--theme-warning-500)', margin: '0 0 4px' }}>
          {warning}
        </p>
      ))}
      <pre style={box}>{graph ? serializeJsonLd(graph, 2) : 'Nothing to output.'}</pre>
    </div>
  )
}
