# Matching System Overview

This document summarizes how product category detection, normalization, and price comparison matching work across `categoryDetector.js`, `normalizer.js`, and `comparator.js`.

---

## 1. Category Detection (`categoryDetector.js`)

Before normalization or matching occurs, scraped raw product names are evaluated against regular expressions in `detectCategory(name)` to assign each product to a specific category.

The categorization pipeline uses strict precedence rules:
1. **Watches**: `WATCH_REGEX` (`watch`, `fit`, `smart band`, `mi band`)
2. **Headphones**: `HEADPHONE_REGEX` (`airpods`, `buds`, `marshall major/minor/etc.`)
3. **MacBooks**: `MACBOOK_REGEX` (`macbook`)
4. **Tablets**: `TABLET_REGEX` (`ipad`, `tab`, `galaxy tab`, `redmi pad`, `pad`)
5. **Speakers**: `SPEAKER_REGEX` (`speaker`, `jbl`, `harman kardon`, Marshall speaker models)
6. **TVs**: `TV_REGEX` (`tv`, `հեռուստացույց`, `led smart`, `qled`, model codes)
7. **Dyson**: `DYSON_REGEX` (`dyson`)
8. **Gaming**: `GAMING_REGEX` (`ps5`, `playstation 5`, `switch`, `xbox series`, `meta quest`, `steam deck`, `rog ally`, `legion go`, `vr 2`)
9. **Air Conditioners**: `AC_REGEX` (`air condition`, `odorak`, `օդորակ`)
10. **Fallback**: Any product not matching the above defaults to **`phones`**.

---

## 2. Product Normalization (`normalizer.js`)

Normalization standardizes raw product titles from different retailer websites into unified canonical keys so identical products can be grouped.

### Key Normalization Steps (`normalizeName`)
1. **Language & Text Cleanup**: Translates Armenian color names (e.g., `սև` -> `black`), converts text to lowercase, and strips standard stop words, punctuation, and non-essential tokens (e.g., `sim`, `esim`, `global`, `eu`, `ru/a`).
2. **Storage Standardisation**: Normalizes unit formats (e.g., `256gb`, `1tb`).
3. **Color Stripping**: Standardizes multi-word and single-word color names and removes them from the normalized key.
4. **RAM & Model Attributes Extraction**: Detects and retains essential product attributes such as RAM sizes (e.g., `8gb`, `12gb`) or series modifiers (e.g., `pro`, `max`, `ultra`, `fe`, `plus`, `wifi`, `cellular`).
5. **Samsung Model Code Extraction**: Extracts specific Samsung internal model numbers (e.g., `s928`, `x526`) to ensure exact generation matching.

---

## 3. Product Grouping & Matching (`groupByNormalizedName`)

Once products are normalized into base keys, `groupByNormalizedName(products)` aggregates products from all competitor sources:

1. **Samsung Matching**: Matches products sharing exact Samsung internal model codes.
2. **iPad Price & Spec Resolution (`resolveIpadGroupKey`)**: Resolves iPad variations by comparing price thresholds and Connectivity (`wifi` vs `cellular`/`nanosim`/`dual`) or generation differences.
3. **Price Disambiguation (`resolveProductGroupKey`)**:
   - Compares products sharing the same base name.
   - If two items share a normalized key but their cash prices differ significantly (e.g., exceeding a 10% or 3,000֏ threshold), the algorithm creates distinct subgroups to prevent pairing standard models with premium/specialized variants.
4. **Source Aggregation**: Groups prices under each source (`redstore`, `yerevanmobile`, `mobilecentre`, etc.). If a source lists multiple listings for the exact same key, the cheapest cash price is selected.

---

## 4. Comparisons & Output Generation (`comparator.js`)

After products are grouped, `comparator.js` builds human-readable Telegram comparison reports:

1. **Model & Storage Structuring**:
   - Groups related product variants into parent model containers using `getModelKey(key)`.
   - Extracts and sorts storage capacities (`getStorageLabel(key)`), ordering tiers from smallest to largest (e.g., `128GB` -> `256GB` -> `512GB`).
2. **Source Prioritization**: Applies domain-specific source display orders based on product tiering (e.g., Tier-1 brands like iPhone/Samsung vs Tier-2 brands).
3. **Price Matching & Flagging**:
   - **`‼️`**: Competitor is cheaper than RedStore.
   - **`♦️`**: Competitor is more expensive than RedStore.
   - **`🏷`**: Competitor price matches RedStore.
   - **`✅`**: RedStore has the absolute lowest price among all competitors.
