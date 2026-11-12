import type { OfferLeaf, ProductGroupLeaf, ProductLeaf } from 'schema-dts'
import { DEFAULT_PRODUCT_FIELDS } from '../constants.js'
import { currencyDecimals } from '../currencies.js'
import type { CollectionOptions, Doc, FieldPath, JsonLdNode, ProductOptions, ResolvedOptions, ReviewsInput, Settings } from '../types.js'
import { readMoney, resolveAvailability, resolveCondition } from './productValues.js'
import { compact, organizationId } from './siteNodes.js'
import { absoluteUrl, mediaUrl, plainText, readFirst, readPath, readText } from './values.js'

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

/** The price in the page currency, read from `source` (the product, or one variant) */
function priceOf(
  input: ProductNodeInput,
  product: ProductOptions,
  source: Doc,
  ref: string,
  currency: string,
  warnings: string[],
): number | undefined {
  const { options } = input
  if (product.price?.currency !== undefined) {
    const stated = readText(source, product.price.currency)?.toUpperCase()
    if (stated && stated !== currency) {
      warnings.push(`${ref}: offer left out, the product's price is in ${stated} and this page shows ${currency}`)
      return undefined
    }
  }
  const known = options.shop?.currencies ?? []
  const before = warnings.length
  const price = readMoney(
    source,
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

type OfferStatus = Pick<Partial<OfferLeaf>, 'availability' | 'itemCondition'>

/**
 * One Offer: the price from `source`, then the status (resolved only once the price is known, so a
 * priceless product gives no stock or condition warnings).
 */
function buildOffer(
  input: ProductNodeInput,
  product: ProductOptions,
  source: Doc,
  offer: { url: string; ref: string; currency: string; status: () => OfferStatus },
  warnings: string[],
): Record<string, unknown> | undefined {
  const { options, hasOrganization, returnPolicyId } = input
  const price = priceOf(input, product, source, offer.ref, offer.currency, warnings)
  if (price === undefined) return undefined

  const props: Omit<Partial<OfferLeaf>, '@type'> = {
    url: offer.url,
    price,
    priceCurrency: offer.currency,
    ...offer.status(),
    seller: hasOrganization ? { '@id': organizationId(options.siteUrl) } : undefined,
    hasMerchantReturnPolicy: returnPolicyId ? { '@id': returnPolicyId } : undefined,
  }
  return compact({ '@type': 'Offer', ...props })
}

/** The page currency, warning when there is none */
function currencyFor(input: ProductNodeInput, source: Doc, warnings: string[]): string | undefined {
  const currency = pageCurrency(input, source, input.ref, warnings)
  if (!currency) {
    warnings.push(`${input.ref}: offer left out, no currency (pass currency to StructuredData, set shop.currency, or enable a currency on the product)`)
  }
  return currency
}

/** Review data the site supplied. Rating and review nodes themselves are built in a later step */
const hasReviewData = (reviews: ReviewsInput | undefined): boolean => Boolean(reviews?.rating) || Boolean(reviews?.items?.length)

const enablesCurrency = (source: Doc): boolean => Object.keys(source).some((key) => ENABLED_FIELD.test(key) && source[key] === true)

const isObject = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The id of a relationship value: the id itself, or a populated document's id. As text, for comparing */
function idOf(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (isObject(value) && (typeof value.id === 'string' || typeof value.id === 'number')) return String(value.id)
  return undefined
}

/** A variant's populated options (objects), in order. Bare IDs are left out */
const populatedOptions = (variant: Doc): Doc[] => (Array.isArray(variant.options) ? variant.options.filter(isObject) : [])

/**
 * The official eCommerce template's variant URL (components/product/VariantSelector.tsx, v3.90.2):
 * `path` plus one `<variantType.name>=<option.id>` per populated option, then `variant=<variant id>`.
 */
export function defaultVariantUrl(path: string, variant: Doc): string {
  const params = new URLSearchParams()
  for (const option of populatedOptions(variant)) {
    const typeName = isObject(option.variantType) ? readText(option.variantType, 'name') : undefined
    const id = idOf(option)
    if (typeName && id !== undefined) params.append(typeName, id)
  }
  const variantId = idOf(variant)
  if (variantId !== undefined) params.append('variant', variantId)
  const query = params.toString()
  if (!query) return path
  return `${path}${path.includes('?') ? '&' : '?'}${query}`
}

/** The variant's offer URL: the variantUrl option (absolutised), else the template default */
function variantUrlOf(input: ProductNodeInput, product: ProductOptions, variant: Doc, ref: string, warnings: string[]): string {
  const fallback = defaultVariantUrl(input.url, variant)
  if (!product.variantUrl) return fallback
  try {
    const value: unknown = product.variantUrl(input.doc, variant)
    if (typeof value === 'string' && value.trim()) return absoluteUrl(input.options.siteUrl, value.trim())
    warnings.push(`${ref}: variantUrl returned no URL, using the default`)
  } catch (error) {
    warnings.push(`${ref}: variantUrl function failed: ${error instanceof Error ? error.message : String(error)}; using the default`)
  }
  return fallback
}

/** Option type name or label → Google's variesBy property */
const VARIES_BY: Record<string, string> = {
  colour: 'color',
  color: 'color',
  size: 'size',
  material: 'material',
  pattern: 'pattern',
  age: 'suggestedAge',
  gender: 'suggestedGender',
}

function variesByProperty(variantType: unknown): string | undefined {
  if (!isObject(variantType)) return undefined
  for (const key of ['name', 'label']) {
    const text = readText(variantType, key)?.toLowerCase()
    if (text && VARIES_BY[text]) return VARIES_BY[text]
  }
  return undefined
}

/** Images from the gallery rows whose variantOption is one of the variant's options, else undefined */
function variantImages(doc: Doc, variant: Doc, config: CollectionOptions, options: ResolvedOptions): string[] | undefined {
  if (config.fields?.image) return undefined
  const rows = readFirst(doc, DEFAULT_PRODUCT_FIELDS.image)
  if (!Array.isArray(rows)) return undefined
  const optionIds = new Set((Array.isArray(variant.options) ? variant.options : []).map(idOf).filter((id) => id !== undefined))
  const urls = rows
    .filter((row) => {
      const id = idOf(readPath(row, 'variantOption'))
      return id !== undefined && optionIds.has(id)
    })
    .map((row) => mediaUrl(options.siteUrl, readPath(row, 'image'), options.imageSize))
    .filter((u): u is string => Boolean(u))
  return urls.length ? [...new Set(urls)] : undefined
}

type Common = { name: string; product: ProductOptions; images: string[] | undefined }

/**
 * The ProductGroup, or null when no variant has a valid offer (the caller then builds a plain Product).
 * Product-level availability and condition mappings run once here and apply to every variant.
 */
function buildProductGroup(input: ProductNodeInput, common: Common, docs: unknown[], warnings: string[]): JsonLdNode | null {
  const { doc, url, ref, config, options, settings } = input
  const { name, product, images } = common

  const populated = docs.filter(isObject)
  if (populated.length < docs.length) {
    warnings.push(`${ref}: ${docs.length - populated.length} variant(s) skipped, not populated (fetch the product with a depth that populates variants)`)
  }
  const published = populated.filter((variant) => variant._status !== 'draft')
  if (!published.length) return null

  // With no currency prop or shop.currency, the first enabled currency comes from the product, else
  // the first variant that enables one. No currency: null, and the plain-Product path gives the warning
  const currencySource = [doc, ...published].find(enablesCurrency) ?? doc
  const currency = pageCurrency(input, currencySource, ref, warnings)
  if (!currency) return null

  // Run once on the product: a mapped value beats every variant's own stock
  const mappedAvailability = resolveAvailability(doc, doc, { ...product, stock: undefined }, ref, warnings)
  const itemCondition = resolveCondition(doc, product, settings?.shop?.defaultCondition, ref, warnings)
  const variantStock: ProductOptions = { ...product, availability: undefined }

  const groupId = textAt(doc, product.sku) ?? idOf(doc.id)
  const variesBy: string[] = []
  const hasVariant: Record<string, unknown>[] = []

  for (const variant of published) {
    const variantId = idOf(variant.id)
    const vref = `${ref} variant ${variantId ?? '(no id)'}`
    const offer = buildOffer(
      input,
      product,
      variant,
      {
        url: variantUrlOf(input, product, variant, vref, warnings),
        ref: vref,
        currency,
        status: () => ({
          availability: mappedAvailability ?? resolveAvailability(variant, variant, variantStock, vref, warnings),
          itemCondition,
        }),
      },
      warnings,
    )
    if (!offer) {
      warnings.push(`${vref}: variant left out, it has no valid offer`)
      continue
    }

    const options_ = populatedOptions(variant)
    const labels = options_.map((option) => readText(option, 'label')).filter((l): l is string => Boolean(l))
    const varies: Record<string, string> = {}
    for (const option of options_) {
      const property = variesByProperty(option.variantType)
      const label = readText(option, 'label')
      if (!property || !label || property in varies) continue
      varies[property] = label
      if (!variesBy.includes(property)) variesBy.push(property)
    }

    const ownSku = textAt(variant, product.sku)
    hasVariant.push(
      compact({
        '@type': 'Product',
        name: readText(variant, 'title') ?? [name, ...labels].join(', '),
        sku: ownSku ?? (groupId !== undefined && variantId !== undefined ? `${groupId}-${variantId}` : variantId),
        image: variantImages(doc, variant, config, options) ?? images,
        ...varies,
        offers: offer,
      }),
    )
  }
  if (!hasVariant.length) return null

  const brand = textAt(doc, product.brand)
  const props: Omit<Partial<ProductGroupLeaf>, '@type' | '@id' | 'hasVariant'> = {
    name,
    url,
    description: descriptionOf(doc, config),
    image: images,
    brand: brand ? { '@type': 'Brand', name: brand } : undefined,
    productGroupID: groupId,
    variesBy: variesBy.length ? variesBy.map((property) => `https://schema.org/${property}`) : undefined,
  }
  // Rating and review nodes (a later step) go on the group, not the variants
  return compact({ '@type': 'ProductGroup', '@id': `${url}#product`, ...props, hasVariant })
}

/** Variants in the eCommerce plugin's shape: enableVariants true and a non-empty variants.docs array */
function variantDocs(doc: Doc): unknown[] | undefined {
  if (doc.enableVariants !== true) return undefined
  const docs = readPath(doc, 'variants.docs')
  return Array.isArray(docs) && docs.length ? docs : undefined
}

/**
 * The product page's node: [ProductGroup] for a product with valid variants, else [Product], or []
 * when the caller must fall back to a WebPage (no name, or no offer and no review data).
 */
export function buildProductNodes(input: ProductNodeInput, warnings: string[]): JsonLdNode[] {
  const { doc, url, ref, config, options, settings, reviews } = input
  const name = readText(doc, config.fields?.headline ?? DEFAULT_PRODUCT_FIELDS.headline)
  if (!name) {
    warnings.push(`${ref}: Product skipped, no name; output as a WebPage instead`)
    return []
  }

  const product: ProductOptions = { ...config.product, stock: config.product?.stock ?? DEFAULT_PRODUCT_FIELDS.stock }
  const images = imagesOf(doc, config, options)

  const docs = variantDocs(doc)
  if (docs) {
    const group = buildProductGroup(input, { name, product, images }, docs, warnings)
    if (group) return [group]
  }

  const currency = currencyFor(input, doc, warnings)
  const offer = currency
    ? buildOffer(
        input,
        product,
        doc,
        {
          url,
          ref,
          currency,
          status: () => ({
            availability: resolveAvailability(doc, doc, product, ref, warnings),
            itemCondition: resolveCondition(doc, product, settings?.shop?.defaultCondition, ref, warnings),
          }),
        },
        warnings,
      )
    : undefined
  if (!offer && !hasReviewData(reviews)) {
    warnings.push(`${ref}: Product skipped, no offer and no review data; output as a WebPage instead`)
    return []
  }

  const brand = textAt(doc, product.brand)
  const props: Omit<Partial<ProductLeaf>, '@type' | '@id'> = {
    name,
    url,
    description: descriptionOf(doc, config),
    image: images,
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
  // Rating and review nodes are not built yet: `reviews` only keeps a priceless product.
  return [compact({ '@type': 'Product', '@id': `${url}#product`, ...props, offers: offer })]
}
