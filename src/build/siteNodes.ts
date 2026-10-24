import type { OrganizationLeaf, WebSiteLeaf } from 'schema-dts'
import type { JsonLdNode, ResolvedOptions, Settings } from '../types.js'
import { absoluteUrl, mediaUrl } from './values.js'

const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined)

/** Drops undefined values so absent data never appears as a key */
export const compact = <T extends Record<string, unknown>>(node: T): T =>
  Object.fromEntries(Object.entries(node).filter(([, v]) => v !== undefined)) as T

const home = (siteUrl: string) => absoluteUrl(siteUrl, '/')
export const organizationId = (siteUrl: string) => `${home(siteUrl)}/#organization`
export const websiteId = (siteUrl: string) => `${home(siteUrl)}/#website`

export function buildOrganization(
  settings: Settings | null,
  options: ResolvedOptions,
  warnings: string[],
): JsonLdNode | null {
  const name = clean(settings?.name)
  if (!settings || !name) {
    warnings.push('settings: Organization skipped, no name (fill in Structured data settings)')
    return null
  }

  const address = settings.address
  const hasAddress = Boolean(clean(address?.streetAddress) || clean(address?.addressLocality))
  let type = settings.organizationType ?? 'Organization'
  if (type === 'LocalBusiness' && !hasAddress) {
    warnings.push('settings: LocalBusiness needs an address, output as Organization')
    type = 'Organization'
  }

  const postal = hasAddress
    ? compact({
        '@type': 'PostalAddress' as const,
        streetAddress: clean(address?.streetAddress),
        addressLocality: clean(address?.addressLocality),
        addressRegion: clean(address?.addressRegion),
        postalCode: clean(address?.postalCode),
        addressCountry: clean(address?.addressCountry),
      })
    : undefined

  const list = (values: (string | undefined)[]) => {
    const kept = values.filter((v): v is string => Boolean(v))
    return kept.length ? kept : undefined
  }

  const founderName = clean(settings.founder?.name)
  const identifiers = (settings.identifiers ?? [])
    .map((i) => ({ propertyID: clean(i.propertyID), value: clean(i.value) }))
    .filter((i) => i.propertyID && i.value)
    .map((i) => ({ '@type': 'PropertyValue' as const, ...i }))

  const logo = mediaUrl(options.siteUrl, settings.logo, options.imageSize)

  // Typed object literal: a misspelt property name fails typecheck (excess property check)
  const props: Omit<Partial<OrganizationLeaf>, '@type' | '@id'> = {
    name,
    url: home(options.siteUrl),
    legalName: clean(settings.legalName),
    description: clean(settings.description),
    logo,
    // Google lists image only for restaurant carousels, but it is valid Schema.org
    // for Organization and other tools read it. The logo stands in when no photo is set.
    image: mediaUrl(options.siteUrl, settings.image, options.imageSize) ?? logo,
    email: clean(settings.email),
    telephone: clean(settings.telephone),
    address: postal,
    areaServed: list((settings.areaServed ?? []).map((a) => clean(a.name))),
    sameAs: list((settings.sameAs ?? []).map((s) => clean(s.url))),
    foundingDate: clean(settings.foundingDate),
    founder: founderName
      ? compact({ '@type': 'Person' as const, name: founderName, jobTitle: clean(settings.founder?.jobTitle) })
      : undefined,
    identifier: identifiers.length ? identifiers : undefined,
  }

  return compact({ '@type': type, '@id': organizationId(options.siteUrl), ...props })
}

export function buildWebSite(
  settings: Settings | null,
  options: ResolvedOptions,
  hasOrganization: boolean,
): JsonLdNode | null {
  const name = clean(settings?.name)
  if (!name) return null
  const props: Omit<Partial<WebSiteLeaf>, '@type' | '@id'> = {
    name,
    url: home(options.siteUrl),
    publisher: hasOrganization ? { '@id': organizationId(options.siteUrl) } : undefined,
  }
  // schema-dts has no 'query-input' (Google's SearchAction extension), so this part sits outside the typed literal
  const potentialAction = options.search
    ? {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: options.search.urlTemplate },
        'query-input': 'required name=search_term_string',
      }
    : undefined
  return compact({ '@type': 'WebSite', '@id': websiteId(options.siteUrl), ...props, potentialAction })
}
