# Structured data for Payload

A Payload CMS 3 plugin that outputs Schema.org structured data (JSON-LD) for your pages. Business details live in a settings screen in the admin. You choose a default type per collection in config. Editors can override it or switch it off per document.

It outputs nine types: `Organization`, `LocalBusiness`, `WebSite`, `Article`, `BlogPosting`, `Service`, `WebPage`, `FAQPage` and `BreadcrumbList`.

Each page gets one `<script type="application/ld+json">` holding a connected `@graph`. Nodes link to each other by `@id`, for example the article's `publisher` points at `<siteUrl>/#organization`.

This is a beta. Requires Payload `^3.82.1`, Next.js 15 or 16, React 19 and Node 20.9 or later.

## Install

```bash
pnpm add @lavinedev/payload-plugin-structured-data
```

While we are in beta, install the beta tag:

```bash
pnpm add @lavinedev/payload-plugin-structured-data@beta
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
| `mediaCollection` | `string` | Upload collection for the logo. Default `media`. |
| `imageSize` | `string` | Image size name to prefer, such as `og`. Falls back to the original file. |
| `search` | `{ urlTemplate: string }` | Adds a `SearchAction` to `WebSite`, for example `https://example.com/search?q={search_term_string}`. Google retired the sitelinks search box in November 2024, so this no longer changes Google results. It is still valid Schema.org, and other tools and AI assistants can read it. |
| `disabled` | `boolean` | Keeps the fields so your schema stays stable, but outputs nothing. |

### Collection options

| Key | Type | What it does |
| --- | --- | --- |
| `type` | `'Article' \| 'BlogPosting' \| 'Service' \| 'WebPage'`, or `(doc) => type \| null` | The collection's default type. A function lets one collection mix types, for example `Service` under `/services/` and `WebPage` elsewhere. Return `null` to output no page node. |
| `path` | `(doc) => string` | The document's public path, starting with `/`. Use `/` for the home page. The plugin joins it to `siteUrl`. |
| `fields` | `Partial<Record<PageField, string \| string[]>>` | Maps Schema.org properties to field paths. Dot paths work. A list means the first non-empty value wins, for example `datePublished: ['completedAt', 'publishedAt', 'createdAt']`. |
| `faq` | `{ block, items, question, answer, blocksField? }` | Builds a `FAQPage` from a blocks field. `block` is the block slug. `items` is the array field inside the block that holds the rows. `question` and `answer` are the field names in each row. `blocksField` is the blocks field on the document and defaults to `layout`. All matching blocks on a page merge into one `FAQPage`. Answers must be plain text (a text or textarea field). Rich text answers are skipped. Since 2023 Google shows FAQ rich results only for well-known government and health sites. The markup stays valid Schema.org, and other tools and AI assistants still read it. |
| `breadcrumbs` | `(doc) => { name, path }[]` | Builds the breadcrumb trail yourself, for collections outside nested docs. Include Home as the first item. |

`PageField` is one of `headline`, `description`, `image`, `datePublished`, `dateModified` and `author`.

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

`getPluginOptions` returns `null` when the plugin is not in your config, so check for that. `settings` is the `structured-data-settings` global, read with `payload.findGlobal`. Put `json` inside a `<script type="application/ld+json">` tag.

## Admin

**Settings.** The plugin adds a global with the slug `structured-data-settings`. In the admin it sits under Settings, then Structured data. It holds:

- Business type: Organisation or Local business
- Name (required), legal name, description and logo
- Email and telephone
- Postal address (street, town or city, county or region, postcode, country code)
- Social profile links (`sameAs`)
- Areas served
- Founding date
- Founder (name and job title)
- Identifiers, such as a Companies House number

A local business needs an address. Without one, the plugin outputs `Organization` and warns.

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

The `@id` values are `<siteUrl>/#organization` and `<siteUrl>/#website` for the site, and `<pageUrl>#webpage`, `#article`, `#service`, `#faq` and `#breadcrumb` for a page.

## Database note

The plugin adds a global and a sidebar group to your collections. On Postgres or SQLite, create and run a migration before you deploy:

```bash
payload migrate:create
payload migrate
```

MongoDB needs no migration.

## Not in version 1

- `Product`, `Event`, `Recipe` and `Review`. Google's rules for these are strict and mistakes can cost you rich results. We will add them on demand.
- Multi-tenant setups. Version 1 has one settings record and one `siteUrl` per install. Multi-tenant support (`@payloadcms/plugin-multi-tenant`) is planned.
- Validation against Google's live tools. Check your pages with the Rich Results Test.

## Licence

MIT.

Made by [Lavine Web & AI Solutions](https://www.lavine.dev).
