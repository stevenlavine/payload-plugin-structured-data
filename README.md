# Structured data for Payload

A Payload CMS 3 plugin that outputs Schema.org structured data (JSON-LD) for your pages. Business details live in a settings screen in the admin. You choose a default type per collection in config. Editors can override it or switch it off per document.

It outputs thirteen types: `Organization`, `LocalBusiness`, `WebSite`, `Article`, `BlogPosting`, `Service`, `WebPage`, `FAQPage`, `BreadcrumbList`, `Event`, `ItemList`, `Product` and `ProductGroup`. Shops also get shipping and returns on the `Organization`. See [Shops](#shops).

Each page gets one `<script type="application/ld+json">` holding a connected `@graph`. Nodes link to each other by `@id`, for example the article's `publisher` points at `<siteUrl>/#organization`.

Requires Payload `^3.82.1`, Next.js 15 or 16, React 19 and Node 20.9 or later.

If the plugin saves you time, you can [buy us a coffee](https://buymeacoffee.com/lavinedev).

## Install

```bash
pnpm add @lavinedev/payload-plugin-structured-data
```

## Configure

Add the plugin to `payload.config.ts`:

```ts
import { structuredDataPlugin } from '@lavinedev/payload-plugin-structured-data'

export default buildConfig({
  // ...
  plugins: [
    structuredDataPlugin({
      siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
      collections: {
        posts: {
          type: 'BlogPosting',
          path: (doc) => `/blog/${doc.slug}`,
          fields: { headline: 'title', image: 'meta.image', author: 'authors' },
        },
        pages: {
          type: 'WebPage',
          path: (doc) => (doc.slug === 'home' ? '/' : `/${doc.slug}`),
          faq: { block: 'faq', items: 'faqs', question: 'question', answer: 'answer' },
        },
      },
    }),
  ],
})
```

`siteUrl` is required. If it is empty, Payload throws a clear error when the config loads. Trailing slashes are removed.

### Generate the import map

The sidebar preview is an admin component, registered as `@lavinedev/payload-plugin-structured-data/rsc#StructuredDataPreview`. Payload finds it through the import map. After you add the plugin, run:

```bash
payload generate:importmap
```

Commit the updated `importMap.js` if your project tracks it. Without this step the preview does not appear in the admin.

### Plugin options

| Key | Type | What it does |
| --- | --- | --- |
| `siteUrl` | `string` | Required. The public origin, such as `https://example.com`. Every URL in the output is built from it. |
| `collections` | `Record<slug, CollectionOptions>` | The collections that get structured data. Each one gets a sidebar group in the admin. A slug that does not exist in your config throws. |
| `mediaCollection` | `string` | Upload collection for the logo and image. Default `media`. |
| `imageSize` | `string` | Image size name to prefer, such as `og`. Falls back to the original file. |
| `search` | `{ urlTemplate: string }` | Adds a `SearchAction` to `WebSite`, for example `https://example.com/search?q={search_term_string}`. Google retired the sitelinks search box in November 2024, so this no longer changes Google results. It is still valid Schema.org, and other tools and AI assistants can read it. |
| `timeZone` | `string` | IANA time zone for event dates, such as `Europe/London`. A zone stored on the document wins. See [Events](#events). |
| `shop` | `{ currency?, currencies? }` | Turns on the shop settings and sets the page currency. See [Shops](#shops). |
| `disabled` | `boolean` | Keeps the fields so your schema stays stable, but outputs nothing. |

### Collection options

| Key | Type | What it does |
| --- | --- | --- |
| `type` | `'Article' \| 'BlogPosting' \| 'Service' \| 'WebPage' \| 'Event' \| 'Product'`, or `(doc) => type \| null` | The collection's default type. A function lets one collection mix types, for example `Service` under `/services/` and `WebPage` elsewhere. Return `null` to output no page node. |
| `path` | `(doc) => string` | The document's public path, starting with `/`. Use `/` for the home page. The plugin joins it to `siteUrl`. |
| `fields` | `Partial<Record<PageField, string \| string[]>>` | Maps Schema.org properties to field paths. Dot paths work. A list means the first non-empty value wins, for example `datePublished: ['completedAt', 'publishedAt', 'createdAt']`. |
| `faq` | `{ block, items, question, answer, enabled?, blocksField? }` | Builds a `FAQPage` from a blocks field. `block` is the block slug. `items` is the array field inside the block that holds the rows. `question` and `answer` are the field names in each row. `blocksField` is the blocks field on the document and defaults to `layout`. All matching blocks on a page merge into one `FAQPage`. Answers can be plain text (a text or textarea field) or rich text (Lexical). Rich text is flattened to plain text. `enabled` is a field path inside the block, for example `'enableSchema'`. Only blocks where that value is `true` count. A missing value counts as off. See [FAQ blocks](#faq-blocks). Google retired the FAQ rich result (not shown from 7 May 2026, documentation removed 15 June 2026), so this no longer changes Google results. The markup stays valid Schema.org, and other tools and AI assistants still read it. We check it against Schema.org only. |
| `breadcrumbs` | `(doc) => { name, path }[]` | Builds the breadcrumb trail yourself, for collections outside nested docs. Include Home as the first item. |
| `event` | `EventOptions` | Maps the document's fields to an `Event`. Setting it also offers Event in the editor's type select. See [Events](#events). |
| `product` | `ProductOptions` | Maps the document's fields to a `Product`. Setting it also offers Product in the editor's type select. See [Shops](#shops). |

`PageField` is one of `headline`, `description`, `image`, `datePublished`, `dateModified` and `author`.

### FAQ blocks

Answers can be a text field, a textarea or a rich text field. If your FAQ block has a checkbox that turns the markup on or off, name it with `enabled`:

```ts
faq: {
  block: 'faqBlock',
  items: 'faqs',
  question: 'question',
  answer: 'answer',
  enabled: 'enableSchema',
},
```

Blocks where `enableSchema` is not `true` are left out of the `FAQPage`. Leave `enabled` out to count every matching block.

### Default field paths

Most collections need few or no `fields` entries. These defaults follow Payload's website template:

| Property | Default path |
| --- | --- |
| `headline` | `title` |
| `description` | `meta.description` |
| `image` | `meta.image`, then `heroImage` |
| `datePublished` | `publishedAt`, then `createdAt` |
| `dateModified` | `updatedAt` |
| `author` | `populatedAuthors` |

## Render

In a Next.js server component, pass your Payload config and the document:

```tsx
import config from '@payload-config'
import { StructuredData } from '@lavinedev/payload-plugin-structured-data/rsc'

export default async function PostPage({ post }) {
  return (
    <>
      <StructuredData config={config} collection="posts" doc={post} />
      {/* the rest of the page */}
    </>
  )
}
```

`doc` accepts any Payload document type, including your generated interfaces such as `Post`.

For routes that are not CMS documents, leave out `collection` and `doc`. You get the site nodes only (`Organization` or `LocalBusiness`, plus `WebSite`):

```tsx
<StructuredData config={config} />
```

### Without React

For a page that does not use React, call the builder yourself:

```ts
import {
  buildStructuredData,
  getPluginOptions,
  serializeJsonLd,
} from '@lavinedev/payload-plugin-structured-data'

const options = getPluginOptions(payload.config)
if (!options) throw new Error('structuredDataPlugin is not configured')

const { graph, warnings } = buildStructuredData({ options, settings, collection: 'posts', doc })
const json = graph ? serializeJsonLd(graph) : null
```

For a product page, `buildStructuredData` also takes `currency` (the currency the page shows, default `shop.currency`) and `reviews` (`{ rating, items }`, as for the `reviews` prop under Shops).

`getPluginOptions` returns `null` when the plugin is not in your config, so check for that. `settings` is the `structured-data-settings` global, read with `payload.findGlobal`. Put `json` inside a `<script type="application/ld+json">` tag.

## Events

Set `type: 'Event'` on a collection, or set `event` on it so editors can pick Event per document. A page gets one `Event` node. A page with several dates gets one per date.

The event fields belong to your site. The plugin adds no event columns, and you map your own fields to the Schema.org properties. Turning on events for a collection does add `Event` to that collection's type select, so on Postgres and SQLite run `payload migrate:create` and `payload migrate`. MongoDB needs nothing. Collections with no event config are unaffected.

```ts
structuredDataPlugin({
  siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
  timeZone: 'Europe/London',
  collections: {
    events: {
      type: 'Event',
      path: (doc) => `/events/${doc.slug}`,
      fields: { headline: 'title', description: 'summary' },
      event: {
        startDate: 'startsAt',
        endDate: 'endsAt',
        status: 'status',
        location: {
          name: 'venue.name',
          streetAddress: 'venue.street',
          addressLocality: 'venue.town',
          postalCode: 'venue.postcode',
          addressCountry: 'venue.country',
        },
        offers: { path: 'tickets', name: 'label', priceCurrency: 'currency', url: 'link', defaultCurrency: 'GBP' },
        performers: { path: 'artists' },
      },
    },
  },
})
```

The name comes from `fields.headline`, the description from `fields.description` and the image from `fields.image`, as on any other page. Every key in `event` is optional. Where a key is left out, the plugin reads the field with that key's name: `startDate`, `endDate`, `eventStatus`, `previousStartDate`, `location.name` and so on.

### Event options

| Key | What it does |
| --- | --- |
| `startDate`, `endDate` | Date fields. Defaults `startDate` and `endDate`. A start date is required. An end date before the start is dropped with a warning. |
| `dateOnly` | `true`, a field path, or `(doc) => boolean`. Outputs `YYYY-MM-DD` in the event's time zone, for events with no known hour. |
| `location` | A field path for each part of the place (`name`, `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`, `onlineUrl`), or `(doc) => place \| null` for a fixed venue. Defaults are `location.<key>`. |
| `status` | Field holding `scheduled`, `cancelled`, `postponed`, `rescheduled` or `movedOnline`. The Schema.org names also work. Default `eventStatus`. |
| `previousStartDate` | Date field read only with a `rescheduled` status. Default `previousStartDate`. |
| `offers` | Ticket offers. `path` (default `offers`), then `price`, `priceCurrency`, `availability`, `validFrom`, `url` and `name` as paths inside one row, plus `defaultCurrency`. Currency codes are trimmed and upper-cased, so `gbp` outputs as `GBP`. Anything that is not three letters counts as no currency. An offer with a price and no currency is dropped with a warning. A price of 0 is a free ticket. An offer with no price is kept if it has a link or an availability. |
| `organizer` | `{ name, url, type? }`. With no mapping, or nothing at the mapped paths, the event points at your site's organisation by `@id`. |
| `performers` | `{ path, name, type? }`. Defaults `performers` and `name`. A row can be an object or a plain string. `type` is `Person` or `PerformingGroup`. |
| `performances` | Several dates on one page. See below. |
| `superEvent` | The festival or series the event belongs to. See below. |

A place needs a postal address, an online link, or both. With neither, the event is skipped with a warning. An address and a link together output as a mixed event.

### Depth

Relationship fields are not fetched, as with every other type. If your event stores its venue, performers or festival as a relationship, load the document with enough `depth` for those paths to hold objects. An ID is skipped. The admin preview loads the document at depth 1, so a deeper festival field may show a warning there when the live page is fine.

### Several dates

For a page with a run of dates, give `performances` the array field that holds one row per date:

```ts
event: {
  location: { /* ... */ },
  offers: { path: 'tickets', defaultCurrency: 'GBP' },
  performances: { path: 'dates', startDate: 'startsAt', endDate: 'endsAt', status: 'status' },
}
```

Each row gives one `Event`, with the id `<pageUrl>#event-<start>`. The place, name, image and performers are shared. Inside a row, `startDate`, `endDate`, `status` and `previousStartDate` default to those names. A row's status key defaults to `status`, while the document's status key defaults to `eventStatus`. A row's `offers` replace the document's. A row with no offers field, or an empty one, uses the document's. A row whose offers were all dropped as invalid gets none, so it never takes the document's price by accident. `performances.offers` inherits `defaultCurrency` from `event.offers` when it sets none. A row with no status or `previousStartDate` of its own takes the document's, so a cancelled run is output as cancelled. Rows with no valid start date are skipped, as are rows that repeat another row's start. If no row gives an event, the plugin falls back to the document's own date.

### Festival link

Use `superEvent` when a session belongs to a festival that has its own page:

```ts
superEvent: (doc) => {
  const festival = doc.festival
  if (!festival || typeof festival !== 'object') return null
  const { title, slug, startsAt, endsAt, venue } = festival as Record<string, unknown>
  if (typeof title !== 'string' || typeof slug !== 'string') return null
  const place = venue && typeof venue === 'object' ? (venue as Record<string, string | undefined>) : {}
  return {
    name: title,
    path: `/events/${slug}`,
    startDate: startsAt,
    endDate: endsAt,
    location: { name: place.name, streetAddress: place.street, addressLocality: place.town, postalCode: place.postcode },
  }
},
```

It returns `{ name, path, startDate, endDate?, dateOnly?, location }`, or `null` for no festival. The festival needs its own page, one date range and no `performances`, so that its `@id` (`<festivalUrl>#event`) matches the `Event` that page outputs. Its `path` must differ from the session's page.

The link needs a valid start date and a physical address. Without both, the plugin drops the link and warns, because Google's Rich Results Test reads any `superEvent` with no date and place as an invalid event (tested on 2026-10-30). The session's own `Event` is still output. That is the test's result, and Google may still show only the page's main event.

### Time zones

The plugin picks a time zone for each date in this order:

1. The zone Payload stores beside the date field, read from `<field>_tz`. This applies when the field has time zones switched on.
2. The `timeZone` plugin option.
3. UTC, with a development warning.

An invalid name never throws. It warns and the next source is used. Offsets come from the built-in `Intl` API, so a July and a January event in `Europe/London` get the right offsets.

The plugin reads each date value by its shape:

| Value | Treated as | Output |
| --- | --- | --- |
| Has `Z` or an offset, such as Payload's stored dates | An exact moment | Converted to the event's time zone. With no zone known: UTC, and a warning |
| Date and time, no offset (`2027-07-14T19:30`) | Local time at the event | With a zone known: that time and its offset. With none: as written, with no offset |
| Date only (`2027-07-14`) | A day with no known hour | As written |
| Anything else | Not a date | Skipped with a warning |

### Listings pages

For a page that lists events, pass `list` to `StructuredData`. The site fetches the rows and passes them in. The plugin runs no queries.

```tsx
<StructuredData
  config={config}
  list={{ path: '/events', name: 'What is on', items: events.map((e) => ({ name: e.title, path: `/events/${e.slug}` })) }}
/>
```

This outputs one `ItemList` with the id `<listUrl>#itemlist` and one `ListItem` per row. A row without a name and a path is skipped with a warning.

### What Google shows

Google shows no event result for online-only events or for listing pages. The plugin still outputs the markup for both. It is valid Schema.org that other tools can read. `movedOnline` is not on Google's list of statuses either. It is valid Schema.org, and Google may ignore it.

## Shops

Set `type: 'Product'` on a collection, or add a `product` block so editors can pick Product per document. A product page gets a `Product` node, or a `ProductGroup` when the product has variants. Shops built on Payload's own eCommerce plugin (`@payloadcms/plugin-ecommerce`) need no field mapping, because the plugin reads that plugin's fields.

```ts
import { categoryBreadcrumbs, structuredDataPlugin } from '@lavinedev/payload-plugin-structured-data'

plugins: [
  // List the eCommerce plugin first
  ecommercePlugin({ /* ... */ }),
  structuredDataPlugin({
    siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
    shop: { currency: 'GBP' },
    collections: {
      products: {
        type: 'Product',
        path: (doc) => `/products/${doc.slug}`,
        breadcrumbs: categoryBreadcrumbs({
          path: (category) => `/shop/${category.slug}`,
          productPath: (doc) => `/products/${doc.slug}`,
        }),
        product: { outOfStock: 'SoldOut', brand: 'brand.name' },
      },
    },
  }),
]
```

Every key in `product` is optional. The `shop` option is the switch for the shop settings. Without it the settings global does not change. A `product` block without `shop` still works, but the node then has no shipping, returns or default condition.

### Product options

Field paths are dotted strings such as `brand.name`, or an array of paths where the first one with a value wins. A mapped value is either a field path or a function of the document.

| Key | What it does |
| --- | --- |
| `sku` | Field path for the SKU. On a variant it is read from the variant; with no variant SKU, see Options and variants below. |
| `gtin`, `mpn` | Field paths for the barcode and the manufacturer part number. A number is output as text. |
| `brand` | Field path for the brand name, output as a `Brand`. |
| `color`, `size`, `material`, `pattern` | Field paths, read on a product with no variants. Variants take these from their options instead. |
| `stock` | Field path for the stock number. Default `inventory`. |
| `outOfStock` | `'OutOfStock'` (the default) or `'SoldOut'`, used when stock is 0 or less. |
| `availability` | A field path or `(doc) => value`. See Stock and availability below. |
| `condition` | A field path or `(doc) => value` giving `new`, `used`, `refurbished` or the Schema.org names. |
| `price` | `{ amount, currency?, minorUnits? }`. `amount` and `currency` are field paths. With `currency` mapped, a product priced in another currency than the page gets no offer. `minorUnits: true` reads the amount in the smallest unit, such as pence. Not needed with the eCommerce plugin. |
| `rating` | A field path or `(doc) => rating` giving `{ value, count, best?, worst? }`. The `reviews` prop beats it. |
| `reviews` | A field path or `(doc) => reviews` giving an array of `{ author, rating, body?, date?, best?, worst? }`. The `reviews` prop beats it. |
| `variantUrl` | `(doc, variant) => string`, the path or URL of one variant. See Options and variants below. |

The plugin-level `shop` option is `{ currency?, currencies? }`. `currency` is an ISO 4217 code such as `'GBP'`. `currencies` is a list of `{ code, decimals }`, such as `[{ code: 'JPY', decimals: 0 }]`, which beats every other source of decimals.

### Plugin order

List the eCommerce plugin before this one in `plugins`. The eCommerce plugin adds the `products` collection itself, so if this plugin runs first, startup fails with `collection "products" not found in the Payload config`. Listed after it, this plugin also reads each currency's decimals from the eCommerce plugin's price fields when your config loads. A `priceIn<CODE>` field that does not carry the eCommerce plugin's currency settings (and has no `shop.currencies` entry) falls back to the ISO digits for the currency, with a warning in development.

### Depth

The render path runs no queries, so fetch the product with `depth: 3`. That populates the variants, their options and option types, the gallery images and the categories. A product that arrives with only IDs outputs less: no variants, no extra images, no category trail.

```ts
const { docs } = await payload.find({
  collection: 'products',
  where: { slug: { equals: slug } },
  depth: 3,
  limit: 1,
})
```

### Currency

A page outputs prices in one currency, because Google wants a separate URL for each currency. The currency is the `currency` prop on `StructuredData` if you pass one, then `shop.currency`. If neither is set, the first currency enabled on the product is used (for a product with variants, the first variant that enables one), with a development warning. A product without that currency enabled gets no offer.

```tsx
<StructuredData config={config} collection="products" doc={product} currency="EUR" />
```

Prices are stored in each currency's smallest unit and divided by `10 ** decimals`, never a fixed 100. The decimals come from, in order: `shop.currencies` (a list of `{ code, decimals }` that you set), the eCommerce plugin's price fields, then the ISO digits for the currency. A missing price, a price of 0 or one that is not a number drops the offer with a warning.

Shops that map their own price fields instead of using the eCommerce plugin must set `shop.currency` (or pass the `currency` prop). Without one, no offer is output. Mapped prices are read as written, in pounds and not pence, unless you set `minorUnits: true`:

```ts
product: { price: { amount: 'price', currency: 'currencyCode', minorUnits: false } }
```

Shipping rates always stay in `shop.currency`, even on a page rendered with a different `currency` prop. If you set shipping rows but no `shop.currency`, shipping is left out with a warning.

### Stock and availability

The plugin reads, in this order:

1. The `availability` mapping: a field path or `(doc) => value`. It accepts `inStock`, `outOfStock`, `soldOut`, `preOrder`, `backOrder`, `madeToOrder`, `discontinued`, `limitedAvailability` or the Schema.org names, in any case. An unknown value is dropped with a warning and the stock number is used instead.
2. The stock number (`inventory` by default, or the `stock` mapping). Above 0 is `InStock`. 0 or less is `OutOfStock`, or `SoldOut` if you set `outOfStock: 'SoldOut'`.
3. Neither: no `availability`.

A mapping beats the stock number, so a made-to-order item with stock 0 does not show as out of stock. With no mapping, stock 0 never outputs an in-stock value.

Made to order outputs `BackOrder`. Google's Rich Results Test rejected `MadeToOrder` as an invalid availability value (checked 2026-11-12), and the stock status was not read. `BackOrder` means you can order it now and it ships later.

Condition comes from the `condition` mapping, then the default condition in the admin settings, then nothing. It accepts `new`, `used`, `refurbished` or the Schema.org names.

### Options and variants

When a product has variants and at least one published variant arrives populated, the page outputs a `ProductGroup` with a `Product` for each variant. Each variant has its own price, stock, name and URL. Draft variants are skipped, and a variant with no valid offer is dropped with a warning. If none are left, the page outputs a plain `Product`.

- **URL.** Each variant's offer URL has one `<option type>=<option id>` parameter per option, then `variant=<variant id>`, which is what the official eCommerce template uses. Set `variantUrl: (doc, variant) => string` to change it.
- **SKU.** A variant's mapped SKU, else `<product SKU or id>-<variant id>`. The group's `productGroupID` is the product's SKU, else its ID.
- **Name.** With the eCommerce plugin, the variant name comes from the plugin's generated variant title. Otherwise it is the product name and the option labels.
- **`variesBy`.** Option types named colour (or color), size, material or pattern map to Google's properties. A gender option maps to `audience.suggestedGender` for male, female and unisex only. Age options are not mapped, because Google wants a number range for `suggestedAge`, not a label such as "0-3 months". Other option types, such as extras, stay out of `variesBy`. The variant still outputs with its own price.
- **Mappings apply to every variant.** The `availability` and `condition` mappings run once on the product. A value they return applies to all its variants and beats each variant's stock.

Variants are read in the eCommerce plugin's shape only. A shop built another way gets a plain `Product`, unless its product has the same shape: `enableVariants`, and a populated `variants.docs` array with `options` and prices.

### Reviews and ratings

Pass ratings and reviews from your own data. The plugin never queries for them and never works out a rating. The reviews you pass are usually one page of many, so their average would be wrong.

```tsx
<StructuredData
  config={config}
  collection="products"
  doc={product}
  reviews={{
    rating: { value: 4.8, count: 12 },
    items: [{ author: 'Sam', rating: 5, body: 'Lovely.', date: '2026-10-02' }],
  }}
/>
```

`rating` becomes the `aggregateRating`, and only from the `value` and `count` you give. `best` and `worst` are optional. A count of 0, or a value outside the range, is dropped with a warning. Each item needs an author, a rating, and a body or a date. At most 10 reviews are output. You can also map `product.rating` and `product.reviews` to fields on the document instead.

### Shipping and returns

With `shop` set, the Structured data settings gain a Shop group: default condition, shipping options and a returns policy. Shipping is a list of rows, each with countries, a cost (in `shop.currency`, 0 for free), an optional free-over amount, and handling and transit days. The returns policy covers the window in days, countries, fees, methods, and an optional link to your returns page. A link on its own is enough.

Both are output on the `Organization`, which is where Google recommends shop-wide policies sit. When a returns policy is set in the settings, every offer links to it by `@id`, and Google follows that link (checked 2026-11-12). Shipping sits on the `Organization` only, so Google may show "Missing field shippingDetails" as an optional warning.

Handling and transit days are output as a `ServicePeriod` and need a maximum: a minimum on its own is left out with a warning (the row itself stays), and a maximum on its own is fine. Handling time is one value per shop. It is output only when all the shipping rows agree. Rows that cannot be valid, such as no country or a minimum above its maximum, are dropped with a warning and the rest still output.

### Category breadcrumbs

`categoryBreadcrumbs` builds the `breadcrumbs` function for a product collection. It takes `path` (the public path of a category) and `productPath` (the public path of the product, required), and returns the whole trail starting at Home: the first category's trail, then the product.

If the category has a nested-docs `breadcrumbs` array, that is the trail. Otherwise the plugin walks a populated `parent` chain, stopping at a repeat or after 10 levels. `field` (default `categories`), `name` and `categoryName` (both default `title`) change which fields it reads.

### What Google shows

- A product page where a shopper can buy the item is eligible for a merchant listing. A sold one-off item gets a product snippet, not a merchant listing.
- Category pages get no product result. Use the `list` prop for an `ItemList` of product links. The markup is valid, but Google shows nothing for it.
- Merchant listings need a price above zero. A product with no valid price and no ratings or reviews outputs a plain `WebPage` instead, with a warning. With ratings or reviews it outputs a `Product` with no offer.
- Check a product page and a variant page in the Rich Results Test before you rely on them.

### Database

Turning on `shop` adds fields to the settings global. Run `payload generate:types`, then `payload migrate:create` and `payload migrate` on Postgres or SQLite. MongoDB needs nothing. A config with no `shop` option adds no settings fields, and a collection with no `product` block and a type other than `Product` keeps its exact type options.

## Admin

**Settings.** The plugin adds a global with the slug `structured-data-settings`. In the admin it sits under Settings, then Structured data. It holds:

- Business type: Organisation or Local business
- Name (required), legal name, description and logo
- Image: a photo of the business. Google lists an image only for restaurant carousels, but it is valid Schema.org for an organisation and other tools read it. When empty, the logo is used.
- Email and telephone
- Postal address (street, town or city, county or region, postcode, country code)
- Social profile links (`sameAs`)
- Areas served
- Founding date
- Founder (name and job title)
- Identifiers, such as a Companies House number

A local business needs an address. Without one, the plugin outputs `Organization` and warns.

Saving the settings revalidates every page (`revalidatePath('/', 'layout')`), so cached pages show the new details without a deploy. Revalidation is skipped when the save has `context.disableRevalidate` set. It does nothing harmful outside Next.js, for example in a script or seed: the save still succeeds. If revalidation fails, the plugin logs a warning in development only.

**Sidebar group.** Every configured collection gets a Structured data group in the sidebar:

- A type select. Leave it empty to use the collection default.
- An "Off for this page" checkbox.
- A preview of the JSON-LD for the last saved version of the document, with any warnings. Save the document to refresh it.

## Behaviour

- **Bad data never breaks the page.** Nothing in the render path throws. If anything fails, the component renders nothing.
- **Empty optional field:** the property is left out.
- **Empty required field:** the whole node is left out. A `BlogPosting` with no headline is skipped, for example.
- **Empty settings:** no `Organization` or `WebSite` node. Page nodes still render, without the `publisher` link.
- **Unpopulated relationship** (an ID, not an object): skipped. The plugin does not fetch it. Set `depth` high enough when you load the document.
- **Warnings** are logged to the console in development only, one per skip, such as `posts/123: BlogPosting skipped, no headline (field "title" is empty)`. They are silent in production. The admin preview shows the same warnings.
- **Escaping.** The serialised JSON escapes every `<` as `\u003c`, so a value containing `</script>` cannot close the tag.
- **Absolute URLs.** Every URL in the output is absolute, including media.

The `@id` values are `<siteUrl>/#organization` and `<siteUrl>/#website` for the site, and `<pageUrl>#webpage`, `#article`, `#service`, `#faq` and `#breadcrumb` for a page. Events use `<pageUrl>#event`, or `<pageUrl>#event-<start>` for each date of a page with several. A listings page uses `<listUrl>#itemlist`.

## Validation

Every node the plugin outputs is tested against two things:

- **Schema.org.** The vocabulary (version 30.1, read on 2026-10-23) in `dev/rules/schemaorg.json`. A misspelt property fails the tests, as does a value of the wrong type: a nested node of a type the property does not accept, a number where the property takes no number, or true/false where it takes no Boolean. Text is accepted for any property, as Schema.org allows. Superseded and pending-layer terms are left out.
- **Google's documented rules.** The required and recommended properties on Google Search Central, read on 2026-10-23, in `dev/rules/google.ts`. The Event rules were read on 2026-10-30. FAQPage is checked against Schema.org only, because Google retired that rich result.

These checks run in our test suite, not in your site. The `dev/` folder is not part of the published package.

Google recommends some properties the plugin does not output yet:

- **Organization:** alternate name and number of employees (no settings field). Contact point (settings hold one email and telephone, output at the top level without a contact type). DUNS, GLN, ISO 6523, LEI, NAICS, tax ID and VAT ID (no dedicated field; add them under identifiers and they output as a `PropertyValue`). Member programme (out of scope).
- **LocalBusiness:** geo coordinates, opening hours, price range, department, menu, cuisine, reviews and ratings (no settings fields or data).
- **Article and BlogPosting:** the author's profile URL (authors are read from populated users, which have no URL field).
- **WebSite:** alternate site name (no settings field).

## Database note

The plugin adds a global and a sidebar group to your collections. On Postgres or SQLite, create and run a migration before you deploy:

```bash
payload migrate:create
payload migrate
```

MongoDB needs no migration.

## Not yet supported

- `Recipe`, `Course` and rentals. Google's rules for these are strict and mistakes can cost you rich results. We will add them on demand. Reviews are supported on products only.
- Multi-tenant setups. There is one settings record and one `siteUrl` per install. Multi-tenant support (`@payloadcms/plugin-multi-tenant`) is planned.
- Validation against Google's live tools. The tests use Google's published rules, not its tools. Check your pages with the Rich Results Test.

## Stability

From 1.0, a breaking change to the plugin options or the JSON-LD output needs a major version.

## Licence

MIT.

Made by [Lavine Web & AI Solutions](https://www.lavine.dev). If it helps you, [buy us a coffee](https://buymeacoffee.com/lavinedev).
