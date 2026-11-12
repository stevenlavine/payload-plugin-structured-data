import type { OfferLeaf, ProductLeaf } from 'schema-dts'
import { DEFAULT_PRODUCT_FIELDS } from '../constants.js'
import { currencyDecimals } from '../currencies.js'
import type { CollectionOptions, Doc, FieldPath, JsonLdNode, ProductOptions, ResolvedOptions, ReviewsInput, Settings } from '../types.js'
import { readMoney, resolveAvailability, resolveCondition } from './productValues.js'
import { compact, organizationId } from './siteNodes.js'
import { mediaUrl, plainText, readFirst, readPath, readText } from './values.js'

export type ProductNodeInput = {
  doc: Doc
  /** Absolute page URL */
  url: string
  /** e.g. 'products/7', used in warnings */
  ref: string
  config: CollectionOptions
  options: ResolvedOptions
  settings: Settings | null
  /** The currency this page shows, from the StructuredData prop */
  currency: string | undefined
  /** Ratings and reviews the site supplies. Rating and review nodes are built in a later step */
  reviews?: ReviewsInput
  hasOrganization: boolean
  /** @id of the Organization's return policy, linked from the offer */
  returnPolicyId?: string
}

const ENABLED_FIELD = /^priceIn([A-Z]{3})Enabled$/
const pathsOf = (path: FieldPath): string[] => (Array.isArray(path) ? path : [path])

/** Text from a string, or a finite number as text (barcodes are often stored as numbers) */
function textAt(doc: Doc, path: FieldPath | undefined): string | undefined {
  if (path === undefined) return undefined
  const value = readFirst(doc, path)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * The one currency this page outputs: the currency prop, then shop.currency, then the first
 * priceIn<CODE>Enabled: true field on the document in key order (with a warning).
 */
export function pageCurrency(
  input: Pick<ProductNodeInput, 'currency' | 'options'>,
  product: Doc,
  ref: string,
  warnings: string[],
): string | undefined {
  const prop = input.currency?.trim().toUpperCase()
  if (prop) return prop
  if (input.options.shop?.currency) return input.options.shop.currency
  for (const key of Object.keys(product)) {
    const match = ENABLED_FIELD.exec(key)
    if (match && product[key] === true) {
      warnings.push(`${ref}: no page currency set (pass currency to StructuredData or set shop.currency), using ${match[1]}, the first enabled currency`)
      return match[1]
    }
  }
  return undefined
}

/** Every image: the mapped image path (one value or a list), else each gallery row's image */
function imagesOf(doc: Doc, config: CollectionOptions, options: ResolvedOptions): string[] | undefined {
  const mapped = config.fields?.image
  const raw = mapped ? readFirst(doc, mapped) : readFirst(doc, DEFAULT_PRODUCT_FIELDS.image)
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  const media = mapped ? items : items.map((row) => readPath(row, 'image'))
  const urls = media.map((m) => mediaUrl(options.siteUrl, m, options.imageSize)).filter((u): u is string => Boolean(u))
  return urls.length ? [...new Set(urls)] : undefined
}

/** The mapped description, then meta.description, then the rich text description, as plain text */
function descriptionOf(doc: Doc, config: CollectionOptions): string | undefined {
  const paths = [...(config.fields?.description ? pathsOf(config.fields.description) : []), ...pathsOf(DEFAULT_PRODUCT_FIELDS.description)]
  for (const path of paths) {
    const text = plainText(readPath(doc, path))
    if (text) return text
  }
  return undefined
}

function priceOf(input: ProductNodeInput, product: ProductOptions, currency: string, warnings: string[]): number | undefined {
  const { doc, ref, options } = input
  if (product.price?.currency !== undefined) {
    const stated = readText(doc, product.price.currency)?.toUpperCase()
    if (stated && stated !== currency) {
      warnings.push(`${ref}: offer left out, the product's price is in ${stated} and this page shows ${currency}`)
      return undefined
    }
  }
  const known = options.shop?.currencies ?? []
  const before = warnings.length
  const price = readMoney(
    doc,
    {
      currency,
      decimals: currencyDecimals(currency, known),
      decimalsSource: known.some((c) => c.code.toUpperCase() === currency) ? 'known' : 'iso',
      mapping: product.price,
      ref,
    },
    warnings,
  )
  if (price === undefined && warnings.length === before) warnings.push(`${ref}: offer left out, the product has no ${currency} price`)
  return price
}

function buildOffer(input: ProductNodeInput, product: ProductOptions, warnings: string[]): Record<string, unknown> | undefined {
  const { doc, url, ref, options, settings, hasOrganization, returnPolicyId } = input
  const currency = pageCurrency(input, doc, ref, warnings)
  if (!currency) {
    warnings.push(`${ref}: offer left out, no currency (pass currency to StructuredData, set shop.currency, or enable a currency on the product)`)
    return undefined
  }
  const price = priceOf(input, product, currency, warnings)
  if (price === undefined) return undefined

  const props: Omit<Partial<OfferLeaf>, '@type'> = {
    url,
    price,
    priceCurrency: currency,
    availability: resolveAvailability(doc, doc, product, ref, warnings),
    itemCondition: resolveCondition(doc, product, settings?.shop?.defaultCondition, ref, warnings),
    seller: hasOrganization ? { '@id': organizationId(options.siteUrl) } : undefined,
    hasMerchantReturnPolicy: returnPolicyId ? { '@id': returnPolicyId } : undefined,
  }
  return compact({ '@type': 'Offer', ...props })
}

/** Review data the site supplied. Rating and review nodes themselves are built in a later step */
const hasReviewData = (reviews: ReviewsInput | undefined): boolean => Boolean(reviews?.rating) || Boolean(reviews?.items?.length)

/**
 * The product page's node: [Product], or [] when the caller must fall back to a WebPage
 * (no name, or no offer and no review data).
 */
export function buildProductNodes(input: ProductNodeInput, warnings: string[]): JsonLdNode[] {
  const { doc, url, ref, config, options, reviews } = input
  const name = readText(doc, config.fields?.headline ?? DEFAULT_PRODUCT_FIELDS.headline)
  if (!name) {
    warnings.push(`${ref}: Product skipped, no name; output as a WebPage instead`)
    return []
  }

  const product: ProductOptions = { ...config.product, stock: config.product?.stock ?? DEFAULT_PRODUCT_FIELDS.stock }
  const offer = buildOffer(input, product, warnings)
  if (!offer && !hasReviewData(reviews)) {
    warnings.push(`${ref}: Product skipped, no offer and no review data; output as a WebPage instead`)
    return []
  }

  const brand = textAt(doc, product.brand)
  const props: Omit<Partial<ProductLeaf>, '@type' | '@id'> = {
    name,
    url,
    description: descriptionOf(doc, config),
    image: imagesOf(doc, config, options),
    sku: textAt(doc, product.sku),
    gtin: textAt(doc, product.gtin),
    mpn: textAt(doc, product.mpn),
    brand: brand ? { '@type': 'Brand', name: brand } : undefined,
    color: textAt(doc, product.color),
    size: textAt(doc, product.size),
    material: textAt(doc, product.material),
    pattern: textAt(doc, product.pattern),
  }
  // The offer is a typed OfferLeaf literal (buildOffer); it joins here because compact() widens its type.
  // Variants (ProductGroup) and rating/review nodes are not built yet: `reviews` only keeps a priceless product.
  return [compact({ '@type': 'Product', '@id': `${url}#product`, ...props, offers: offer })]
}
