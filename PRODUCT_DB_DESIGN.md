# Product Identity & Cross-Store Matching System — Design Document

## 1. Goals

- Make PostgreSQL the **long-term source of truth for product identity**, replacing reliance on store category structure and ad-hoc regex matching.
- Track every product ever discovered on every store, independent of whether it currently appears in its expected category.
- When a product disappears from its expected category, **confirm via the store's search** before concluding it was removed.
- Support **cross-store matching**: many store listings (different titles/formats/descriptions) pointing to one canonical, real-world product.
- Provide an **admin panel** for searching products, reviewing match candidates, and manually linking/merging.
- **Migrate** the current JSON + regex price-comparison data into this system, auto-linking what the existing regex rules already got right.

Initial global categories: Air Conditioners, Phones, Tablets, Dyson, Gaming Headsets, MacBooks, Speakers, TVs, Watches (Laptops/Notebooks to be added later — schema supports this with no changes).

Scale target: under 10,000 products — this matters a lot for tech choices below (see §5).

---

## 2. Core Concepts

| Concept | Meaning |
|---|---|
| **Store** | A single online store being scraped. |
| **Store Category** | A category as it exists on a given store's site (its own name/URL/structure). |
| **Global Category** | Your canonical taxonomy (the 9 categories above). Each Store Category maps to one Global Category. |
| **Store Listing** | One scraped product page from one store, as-is: raw title, normalized title, price, specs, URL. This is what the scraper produces. |
| **Product** | The canonical, real-world product ("master record"). Multiple Store Listings (from different stores, or even duplicate listings on the same store) link to one Product. |
| **Product Match** | A candidate or confirmed link between a Store Listing and a Product, with a method and confidence score — this is the audit trail behind every link. |

A Store Listing is *never deleted* just because it vanished from a category page — its lifecycle is tracked via `status`, and category presence is tracked separately from existence.

**Category assignment, revisited given your existing `categoryDetector.js`:** since you already classify products purely from the scraped name (with strict regex precedence and a `phones` fallback), and this is independent of any store's own category structure, `products.category_id` should keep being set this way — by running the same precedence-ordered regex against `normalized_title` — rather than trusting `store_category → global_category` mapping as the source of truth for what a product *is*. The `store_categories` mapping still matters, but its job narrows to exactly one thing: detecting when a listing goes missing from where it's *expected* to appear (§4), not deciding what the product actually is.

---

## 3. Database Schema

PostgreSQL 15+, `pg_trgm` extension enabled for fuzzy text matching.

### 3.1 `stores`
```
id                uuid PK
name              text
base_url          text
scraper_config    jsonb      -- selectors, search URL pattern, adapter type, etc.
is_active         boolean
is_own_store      boolean default false   -- true for "redstore" — the price-comparison reference point
created_at, updated_at
```
`is_own_store` replaces hardcoding `"redstore"` by name anywhere in matching/reporting logic — the admin panel and any future comparator can just query `WHERE is_own_store = true` to build "vs. our price" views, and it survives a rename or a second reference store later.

### 3.2 `categories` (global taxonomy)
```
id             uuid PK
name           text unique     -- "Phones", "TVs", ...
slug           text unique
parent_id      uuid FK -> categories.id (nullable, future hierarchy e.g. Laptops)
created_at
```

### 3.3 `store_categories` (per-store category → mapped to global)
```
id                    uuid PK
store_id              uuid FK -> stores
global_category_id    uuid FK -> categories (nullable until admin maps it)
store_category_name   text     -- raw name/path as shown on the store
store_category_url    text
created_at, updated_at
unique(store_id, store_category_url)
```
This directly supports your requirement: categories stay **per-store**, mapped to a shared global list, not forced into one shared structure.

### 3.4 `products` (canonical / master record)
```
id                 uuid PK
canonical_title    text
brand              text
category_id        uuid FK -> categories
attributes         jsonb    -- normalized specs: capacity, screen size, color, etc.
primary_image_url  text
status             enum('active','merged','archived')
merged_into_id      uuid FK -> products.id (nullable; set when merged into another record)
created_at, updated_at
```

### 3.5 `store_listings` (what the scraper actually finds)
```
id                     uuid PK
store_id               uuid FK -> stores
product_id             uuid FK -> products (nullable until matched — this is the CONFIRMED link)
store_category_id      uuid FK -> store_categories (nullable; last known category)
external_id            text     -- store's internal SKU/ID, if the store exposes one (nullable)
url                    text     -- nullable for now, see note below
raw_title              text     -- exactly as scraped
normalized_title       text     -- your existing human-readable title-fixing logic
normalized_key         text     -- the grouping KEY from normalizer.js (storage, RAM, color-stripped, model codes, etc.) — drives matching, distinct from normalized_title
price                  numeric
cash_price             numeric  -- kept separate from `price` to match current data (confirm during migration whether these ever actually diverge, or `price` can be dropped)
installment_price      numeric
installation_price     numeric  -- Air Conditioners: professional install cost, tracked separately (acModelCode.js / comparator.js)
currency               text
raw_attributes         jsonb
image_url              text
in_category            boolean  -- currently visible in its expected store category?
last_seen_in_category_at  timestamptz
last_seen_at           timestamptz   -- last time seen ANYWHERE (category or search)
last_checked_at        timestamptz
status                 enum('active','missing_from_category','not_found_via_search','removed','unknown')
search_attempts        int default 0
first_scraped_at       timestamptz
created_at, updated_at
```

**On uniqueness / URLs:** you confirmed URLs weren't captured initially, but now are, across all stores. Recommend treating **URL capture as part of this build**, not optional polish — the URL-check flow (§4) fundamentally needs a URL to verify a listing still exists, and the admin panel needs it to let admins open the product. Now that every scraper captures URL:
- Use a soft dedup key of `(store_id, normalized_key, price)` to avoid obvious duplicate rows on re-scrape, understanding it's imperfect (two genuinely different products could share a key+price).
- Add `unique(store_id, url)` as a **partial unique index** (`WHERE url IS NOT NULL`) so it activates automatically store-by-store as each scraper adds URL capture, without a schema change later.
- URL capture is now standard across all stores (confirmed), so this note is resolved — every listing going forward carries a `url`.

Indexes: `GIN (normalized_key gin_trgm_ops)`, plus btree on `(store_id, status)`, `(product_id)`, `(store_category_id, in_category)`.

### 3.6 `product_matches` (candidate + confirmed link audit trail)
```
id                  uuid PK
store_listing_id    uuid FK -> store_listings
product_id          uuid FK -> products
match_method        enum('identifier','regex_rule','attribute_similarity','text_similarity','manual')
confidence_score    numeric(4,3)   -- 0.000–1.000
status              enum('suggested','confirmed','rejected')
reviewed_by         uuid FK -> admin_users (nullable)
reviewed_at         timestamptz
created_at
```
`store_listings.product_id` is always the **current truth**; `product_matches` is the **history/audit** of every candidate ever proposed, confirmed, or rejected for that listing. This separation means re-running the matcher never silently overwrites a manual decision — rejected suggestions stay rejected.

### 3.7 `price_history`
```
id                  uuid PK
store_listing_id    uuid FK -> store_listings
price               numeric
installment_price   numeric
scraped_at          timestamptz
```

### 3.8 `search_attempts` (the "check via search" audit log)
```
id                  uuid PK
store_listing_id    uuid FK -> store_listings
query_used          text
found               boolean
found_url           text
raw_result          jsonb
attempted_at        timestamptz
```

### 3.9 `admin_users`
```
id, email, name, password_hash, role, created_at
```

### 3.10 `audit_log` (generic action trail for the panel)
```
id, admin_user_id FK, action, entity_type, entity_id, details jsonb, created_at
```

### 3.11 `product_merge_candidates` (review queue data source)
```
id                  uuid PK
product_a_id        uuid FK -> products
product_b_id        uuid FK -> products
confidence_score    numeric(4,3)
status              enum('suggested','confirmed','rejected')
reviewed_by         uuid FK -> admin_users (nullable)
reviewed_at         timestamptz
created_at          timestamptz
unique(product_a_id, product_b_id)
```
Since the migration creates one canonical product per regex/grouping-function group, the main gap left afterward isn't "unmatched listings" (every listing got a product) — it's **two separately-created products that are secretly the same real item**, because the grouping logic didn't catch a title variation. This table is what the review queue works from: candidate *product-to-product* merges, generated by a periodic trigram-similarity pass over `products.canonical_title` within the same category. Confirming a candidate merges `product_b` into `product_a` (reassigns `product_b`'s listings, sets `product_b.status = 'merged'` and `merged_into_id`); rejecting it marks the pair reviewed so it doesn't resurface. `product_matches` (§3.6) remains the right table for the listing-to-product case once live scraper ingestion (§6) starts producing genuinely unmatched listings.

A full ER diagram is provided as a separate artifact (`product-db-erd`).

---

## 4. "Disappeared From Category" Flow

This directly targets your unreliable-category-filter problem. **Revised** now that every listing carries its own URL: instead of a Puppeteer search-adapter per store, the system directly checks whether the listing's stored URL still resolves — much simpler to build and operate, and just as effective at answering the real question ("does this still exist").

1. Scraper crawls a `store_category`. It gets a fresh list of listings currently visible.
2. Any `store_listing` previously `in_category = true` for that store_category, but **not** seen in this crawl, is marked `missing_from_category` (not deleted, not assumed removed).
3. A **URL-check job** (or a manual "Check URL" action in the admin panel) fetches the listing's stored `url` server-side and looks at the response: a normal page load means the product still exists (just miscategorized); a 404/redirect-to-search/removed-product page means it's gone.
4. **Still resolves** → set `status = active`, update `last_checked_at`, `in_category` reflects reality (may still be `false` — it exists, it's just miscategorized).
5. **Doesn't resolve** → log the check, increment a simple failure counter, keep status as `missing_from_category`.
6. Only after **N consecutive failed checks across separate scrape cycles** (configurable, e.g. 3) does status flip to `removed`. This grace period absorbs temporary site glitches or transient errors — a single failed check never marks something removed.

Because every store listing persists regardless of category visibility, and its full history lives in `price_history`, nothing about a product's existence depends on the store's category page being accurate. The `search_attempts` table (§3.8) still exists in the schema and still works exactly like this for any store where a URL genuinely isn't available — but it's no longer the primary mechanism now that URL capture is standard.

---

## 5. Cross-Store Matching Pipeline

You confirmed there are **no reliable unique identifiers** (no GTIN/EAN/MPN available consistently), and you've now shared the actual matching code (`categoryDetector.js`, `normalizer.js`, `macbookMatcher.js`, `modelCode.js`, `gamingFilter.js`, `gamingNormalizer.js`, `simClassifier.js`, plus `comparator.js` which ties them together via `runComparison`). This changes the plan in an important way: **the migration and ongoing matching should directly reuse these modules as library code**, not re-derive their logic. They already encode a large amount of hand-tuned, product-specific knowledge (a hundred-plus-entry color dictionary, Armenian color/word translation, per-brand SKU decoders for JBL/Harman/Samsung/Honor/OnePlus, iPad chip-generation-to-year mapping, PS5/Switch/Xbox/Legion Go family rules, etc.) that would be both wasteful and risky to reimplement from scratch.

Revised layering:

1. **Identifier layer** (rare but free when available) — exact match on any identifier that *is* sometimes present. Auto-confirm.
2. **Ported matching pipeline (reused, not rewritten)** — `runComparison`'s category-routing logic becomes the backbone of the migration importer and the ongoing matcher for new listings:
   - MacBooks -> `extractModelCode` + `groupMacbooksByCode` (Apple MPN-style code extraction, e.g. `MHFA4`).
   - TVs -> `extractTvModelCode` + `groupTvsByCode` *(file not yet shared -- needed to port this category, see note below)*.
   - Dyson -> `extractDysonKey` + `groupDysonByKey` *(file not yet shared)*.
   - Air Conditioners -> `extractACCode` + `groupACsByCode` *(file not yet shared)*.
   - Gaming -> `isConsoleProduct` (excludes accessories: controllers, cases, headsets, etc.) + `normalizeGamingName` (per-console-family rules: PS5 edition/disc-vs-digital/color-strip, Switch color-strip + bundle canonicalization, Xbox color/SSD/edition strip, Legion Go chip-name fixes) + `groupGamingByName` *(location not yet shared)*.
   - Phones/Tablets/Watches/Headphones/Speakers -> `detectCategory` to route, then `normalizeName` + `groupByNormalizedName`, which internally handles:
     - Samsung: exact internal model-code matching (`extractSamsungTabCode` and equivalents) takes precedence over general key matching.
     - iPad: `resolveIpadGroupKey` buckets connectivity into `wifi` vs. `cellular` (collapsing 5G/LTE/nanosim/dual/eSIM into `cellular`), matches on base name + connectivity + year, and **only when multiple candidate groups exist**, picks the one whose price is closest to the item being placed -- a tie-breaker between already-valid candidates, not a threshold gate.
     - Everything else: `resolveProductGroupKey` -- same tie-breaker-by-price behavior, used only when a base name has 2+ *distinct explicit-connectivity* variants to choose between.

   Matches produced by this layer import as `match_method = 'regex_rule'`, `status = 'confirmed'`, `confidence_score = 1.0` during migration (Section 8), and the same functions keep running going forward for new listings -- called from the Node.js backend, not ported to SQL or reimplemented.
3. **Fuzzy layer** -- for anything the ported rules don't catch (typos, unseen phrasing, attribute combinations the current normalizer doesn't cover yet):
   - Hard filters first: same `category_id` (from `detectCategory`, not the store's own category page), same/compatible brand.
   - `pg_trgm` trigram similarity on `normalized_key` for fast candidate retrieval (GIN index -- no need for an external search engine at this scale).
   - Attribute overlap score from parsed specs (storage, RAM, color, connectivity).
   - Combined score -> confidence band:
     - **High (>= ~0.85)**: auto-suggested, shown in panel pre-checked for one-click confirm (not auto-confirmed at first -- build trust before allowing straight auto-link).
     - **Medium (~0.6-0.85)**: goes into the review queue as a real candidate.
     - **Low (< 0.6)**: not surfaced -- avoids drowning admins in noise.
4. **Manual layer**: admin search + "link to existing product" or "create new product", always available regardless of what the automated layers found.

**All matching modules are now in hand** (`categoryDetector.js`, `normalizer.js`, `macbookMatcher.js`/`modelCode.js`, `tvModelCode.js`, `dysonModelCode.js`, `acModelCode.js`, `gamingFilter.js`/`gamingNormalizer.js`, and the group/build functions in `comparator.js`). One behavioral difference worth calling out before porting: **TV grouping (`groupTvsByCode`) is redstore-anchored** — it extracts codes only from redstore's listings first, then matches other stores by substring against that code set, so a TV redstore doesn't carry can never form a cross-store group today. MacBook/Dyson/AC/Gaming grouping extract codes from every source in one pass, with no such anchor. Since removing this anchor requirement doesn't lose any information `extractTvModelCode` produces, the migration will use the same code extraction for TVs but **not** the redstore-first restriction — letting the database capture cross-store TV matches your current pipeline structurally cannot see. This is a direct example of the system doing more than the JSON pipeline ever could, not a deviation to worry about.

Also, Air Conditioner listings carry a third price field, `installation_price`, tracked separately from cash/installment (see `acModelCode.js` usage in `comparator.js`) — added as its own column in `store_listings` (§3.5).

This keeps every category's tribal knowledge -- Samsung codes, iPad connectivity buckets, MacBook MPNs, gaming family rules, and whatever the TV/Dyson/AC modules turn out to contain -- as the audited, trusted first pass. New categories (Laptops later) get their own resolver added the same way instead of forcing everything through one generic scorer.

**Why not embeddings/vector search yet:** at under 10k products, trigram + attribute scoring on Postgres is simple to run, debug, and tune, with no extra infrastructure. This is worth revisiting (pgvector + a small embedding model) only if you scale up significantly or find trigram matching's recall insufficient once regex + Laptops are added.

---

## 6. Scraper Integration

Since stores mostly don't expose APIs and everything currently goes through Puppeteer:

- **No search adapter needed** (revised, see §4) — a URL-check job (or the panel's manual "Check URL" action) is enough now that every listing carries a `url`.
- Scraper writes directly to `store_listings` (and `price_history`) instead of JSON files. Keep your title-normalization step exactly as-is — it feeds `normalized_title`.
- Recommended job structure: category-crawl jobs (as today) + a separate URL-check queue that only processes listings flagged `missing_from_category`, so check load stays proportional to actual anomalies, not the whole catalog.

---

## 7. Admin Panel

**Stack:** Node.js/Express + TypeScript API, React (Vite) frontend, as you specified.

Core screens:

1. **Product search** — full-text/trigram search across canonical products and store listings, filters by category, store, brand, match status (unmatched / suggested / confirmed), price range.
2. **Product detail** — canonical record + every linked store listing side by side (title, price, installment price, image, last seen, status), price history chart, "unlink" per listing.
3. **Match review queue** — the heart of the workflow: paginated list of medium/high-confidence suggested matches, shown side-by-side (both listings' title/image/price/specs) with Confirm / Reject / "not a match, but similar — keep searching" actions. Bulk confirm for a batch of same-score suggestions.
4. **Manual linking tool** — search box to find any store listing or product and link them directly; "create new canonical product from this listing" for genuinely new items.
5. **Merge tool** — merge two canonical products that turned out to be duplicates (keeps history via `merged_into_id`, re-points all listings).
6. **Category mapping** — map newly discovered `store_categories` to the global taxonomy (needed whenever a store restructures its site or a new store is onboarded).
7. **Dashboard** — counts: listings missing from category, listings pending a URL check, pending review queue size, per-store health.

---

## 8. Migration Plan (from current JSON + regex system)

1. **Import store listings**: for each store's JSON (`name`, `price`, `cash_price`, `installment_price`, `source`), insert one `store_listings` row per product: `raw_title = name`, run `detectCategory`/the category-specific filters (same routing `runComparison` does) to set `category_id`, run the matching category's normalizer to populate `normalized_key`. `url`/`external_id`/`image_url` stay null for the historical import — they'll populate as each store's scraper is upgraded to capture them (§3.5/§6).
2. **Import existing matches as confirmed products**: run the same grouping functions `runComparison` uses per category (`groupByNormalizedName`, `groupMacbooksByCode`, `groupTvsByCode`, `groupDysonByKey`, `groupACsByCode`, `groupGamingByName`) over the full historical dataset. For each resulting group, create one `products` row (canonical title = best/most complete title in the group, brand/category inferred), link all member `store_listings.product_id` to it, and insert corresponding `product_matches` rows with `match_method='regex_rule'`, `status='confirmed'`, `confidence_score=1.0`.
3. **Leave unmatched listings unlinked** (`product_id = null`) — these become the initial seed for the review queue once the fuzzy layer runs its first pass.
4. **Map categories**: for each store's current category page structure, create `store_categories` rows and map to the 9 global categories where the mapping is obvious; anything ambiguous is left unmapped for an admin to resolve in the panel (rather than guessing). Note this is only for missing-from-category detection (§4) — it does not drive `products.category_id` (see §2 note above).
5. **Mark the reference store**: set `is_own_store = true` on the `stores` row for redstore.
6. Run the fuzzy layer once over all unmatched listings to pre-populate the review queue, so admins start with real candidates instead of an empty queue.

---

## 9. Suggested Build Order

1. Schema + migrations (Postgres, `pg_trgm`).
2. Migration script from JSON → `store_listings` + `products` + `product_matches` (regex-derived).
3. Scraper refactor: write to Postgres instead of JSON; keep normalization logic unchanged.
4. Missing-from-category detection + status transitions (no search yet — just correct state tracking).
5. URL-check job for listings flagged `missing_from_category`.
6. Similarity-matching pass + review queue population.
7. Admin panel: search/detail views first, then review queue, then manual linking/merge, then category mapping and dashboard.
8. (No longer needed — URL-check works uniformly across all stores from the start.)

This order gets the "don't lose products to bad category filters" win early (steps 1–4), independent of how good matching becomes later.