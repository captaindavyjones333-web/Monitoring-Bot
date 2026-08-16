
```
MonitoringBot
├─ .clineignore
├─ bot
│  └─ bot.js
├─ core
│  ├─ acModelCode.js
│  ├─ categoryDetector.js
│  ├─ categoryMenu.js
│  ├─ comparator.js
│  ├─ dysonModelCode.js
│  ├─ gamingFilter.js
│  ├─ gamingNormalizer.js
│  ├─ macbookMatcher.js
│  ├─ modelCode.js
│  ├─ normalizer.js
│  ├─ search.js
│  ├─ simClassifier.js
│  └─ tvModelCode.js
├─ data
├─ errorHandler.js
├─ icentre_raw.html
├─ index.js
├─ jobs
│  ├─ scheduler.js
│  ├─ scrapeJob.js
│  └─ sendJob.js
├─ package-lock.json
├─ package.json
├─ README.md
├─ render.yaml
├─ scrapers
│  ├─ allsell
│  │  ├─ airconditioners.js
│  │  ├─ crawler.js
│  │  ├─ dyson.js
│  │  ├─ gaming.js
│  │  ├─ headphones.js
│  │  ├─ macbooks.js
│  │  ├─ notebooks.js
│  │  ├─ phones.js
│  │  ├─ speakers.js
│  │  ├─ tablets.js
│  │  ├─ tvs.js
│  │  └─ watches.js
│  ├─ d3planet
│  │  ├─ crawler.js
│  │  ├─ dyson.js
│  │  ├─ gaming.js
│  │  ├─ headphones.js
│  │  ├─ macbooks.js
│  │  ├─ notebooks.js
│  │  ├─ phones.js
│  │  ├─ speakers.js
│  │  ├─ tablets.js
│  │  └─ watches.js
│  ├─ eldorado
│  │  ├─ airconditioners.js
│  │  ├─ dyson.js
│  │  ├─ gaming.js
│  │  ├─ speakers.js
│  │  └─ tvs.js
│  ├─ icentre
│  │  └─ macbooks.js
│  ├─ ispace
│  │  └─ macbooks.js
│  ├─ mobilecentre
│  │  ├─ crawler.js
│  │  ├─ dyson.js
│  │  ├─ gaming.js
│  │  ├─ headphones.js
│  │  ├─ macbooks.js
│  │  ├─ phones.js
│  │  ├─ speakers.js
│  │  ├─ tablets.js
│  │  ├─ tvs.js
│  │  └─ watches.js
│  ├─ notebookcentre
│  │  └─ notebooks.js
│  ├─ redstore
│  │  ├─ airconditioners.js
│  │  ├─ client.js
│  │  ├─ dyson.js
│  │  ├─ gaming.js
│  │  ├─ headphones.js
│  │  ├─ macbooks.js
│  │  ├─ notebooks.js
│  │  ├─ phones.js
│  │  ├─ speakers.js
│  │  ├─ tablets.js
│  │  ├─ tvs.js
│  │  └─ watches.js
│  ├─ vega
│  │  ├─ phones.js
│  │  └─ tvs.js
│  ├─ vesta
│  │  ├─ airconditioners.js
│  │  └─ tvs.js
│  ├─ vlv
│  │  ├─ airconditioners.js
│  │  ├─ phones.js
│  │  └─ tvs.js
│  ├─ yerevanmobile
│  │  ├─ crawler.js
│  │  ├─ dyson.js
│  │  ├─ gaming.js
│  │  ├─ headphones.js
│  │  ├─ macbooks.js
│  │  ├─ phones.js
│  │  ├─ speakers.js
│  │  ├─ tablets.js
│  │  ├─ tvs.js
│  │  └─ watches.js
│  └─ zigzag
│     ├─ dyson.js
│     ├─ phones.js
│     └─ tvs.js
├─ scratch
├─ scripts
│  ├─ scrape3DPlanet.js
│  ├─ scrapeTablets.js
│  └─ scrapeTvs.js
├─ z.txt
└─ zz.txt

```

---

## Redstore API — Expected Response Structures

All redstore scrapers hit `https://admin.redstore.am/api/v1/catalog/{category}/category` (or `/search`).
Every endpoint returns the **same top-level envelope**; the differences are in which product fields each scraper actually reads.

### Common Response Envelope (all endpoints)

```jsonc
{
  "data": {
    "data": {
      "products": {
        "last_page": 3,            // int — total number of pages
        "data": [ /* product objects */ ]
      }
    }
  }
}
```

> Access pattern in code: `res.data.data.products.last_page` and `res.data.data.products.data`

### Full Product Object Structure

Every product object inside `products.data[]` has the following shape (based on actual API responses):

```jsonc
{
  "id": 60205,                          // int
  "slug": "samsung-galaxy-book4-pro",   // string — URL-safe identifier
  "category": {                         // object — product's category
    "id": 550,                          // int
    "slug": "notebooks",                // string
    "name": "...",                      // string — display name
    "menu_name": "...",                 // string
    "image": "https://...",             // string — category image URL
    "icon": "https://...",              // string — category icon URL
    "categories_top_image": "https://...", // string|null
    "position": 4,                      // int
    "parent_id": null,                  // int|null
    "active": 1,                        // int (0 or 1)
    "header_slider": 1,                 // int (0 or 1)
    "meta_title": "...",                // string
    "meta_description": "...",          // string
    "meta_keywords": "",                // string
    "og_image": "https://...",          // string|null
    "children": [                       // array — subcategories
      {
        "id": 551,
        "slug": "macbook",
        "name": "MacBook",
        "menu_name": "MacBook",
        "image": "https://...",
        "icon": "https://...",
        "categories_top_image": null,
        "position": 0,
        "parent_id": 550,
        "active": 1,
        "header_slider": 0,
        "meta_title": "...",
        "meta_description": "...",
        "meta_keywords": "",
        "og_image": null,
        "children": [],
        "banner": []
      }
    ],
    "banner": []                        // array
  },
  "brand": {                            // object — product's brand
    "id": 295,                          // int
    "slug": "samsung",                  // string
    "name": "Samsung",                  // string
    "logo": "https://...",              // string — brand logo URL
    "meta_title": "...",                // string
    "meta_description": "...",          // string
    "meta_keywords": ""                 // string
  },
  "name": "Samsung Galaxy Book4 Pro(NP940XGK-KG1US)",  // string
  "image": "https://...",               // string — primary product image
  "gallery": [],                        // array — additional image URLs
  "card_images": [                      // array — card/thumbnail images
    "https://..."
  ],
  "is_favorite": false,                 // boolean
  "sku": "R7246006759",                 // string — stock keeping unit
  "warranty_text": null,                // string|null
  "warranty_value": null,               // string|null
  "warranty_type": null,                // string|null
  "price": 439000,                      // int|string — regular price
  "cash_price": "439000.00",            // string — cash discount price
  "old_price": 0,                       // int|string — previous price (0 if none)
  "installment_price": 439000,          // int|string — installment price
  "status": 1,                          // int — product status
  "description": "<p>Ultra 7 155H/16GB/512GB SSD/...</p>",  // string — HTML description
  "position": 0,                        // int — sort position
  "in_stock": 1,                        // int (0 or 1)
  "product_as_category": 0,             // int (0 or 1)
  "filter_attributes": [],              // array
  "attributes": [                       // array — product spec attributes
    {
      "attribute_id": 1,                // int — attribute type ID
      "attribute_value_id": 103,        // int — specific value ID
      "attribute_name": "...",          // string — attribute display name
      "attribute_value": "14.2\""       // string — attribute value
    }
    // ... more attributes
  ],
  "new": 0,                             // int (0 or 1) — "new product" flag
  "meta_title": "...",                  // string — SEO title
  "meta_description": "...",            // string — SEO description
  "meta_keywords": null,                // string|null
  "og_image": null,                     // string|null — Open Graph image
  "quantity": null,                     // int|null
  "product_category": false,            // boolean
  "stickers": []                        // array — promotional sticker labels
}
```

| API Endpoint | `GET /api/v1/catalog/{categoryEndpoint}/category` |
|---|---|
| **Query params** | `view=all`, `brand_id[]={brandId}`, `page={n}`, + optional `extraParams` |

Does **not** normalize — it returns the raw product array to callers. Expects the common envelope above.

---

### `airconditioners.js`

| API Endpoint | `GET /api/v1/catalog/air-conditioners/category` (via `client.js`) |
|---|---|
| **Brand IDs** | `295`, `326`, `345` |

**Expected product object:**

```jsonc
{
  "name": "...",                   // string
  "price": "150000",              // string|number — regular price
  "cash_price": "140000",         // string|number — cash discount price
  "installment_price": "160000",  // string|number — installment price
  "attributes": [                 // array of attribute objects
    {
      "attribute_id": 184,        // int — installation-related attribute
      "attribute_value": "18000"  // string — numeric BTU-like value
    }
  ]
}
```

---

### `dyson.js`

| API Endpoint | `GET /api/v1/catalog/beauty-and-care/category` |
|---|---|
| **Query params** | `view=all`, `brand_id[]=479`, `page={n}`, `price[min]=4500`, `price[max]=308000`, `category_id[]=602,603`, `lang=hy` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "..."
}
```

---

### `gaming.js`

| API Endpoint | `GET /api/v1/catalog/game-consoles/category` |
|---|---|
| **Query params** | `view=all`, `brand_id[]={brandId}`, `page={n}`, `price[min]=6900`, `price[max]=599000`, `category_id[]=452`, `lang=hy` |
| **Brand IDs** | sony: `303`, brand_509: `509`, brand_510: `510`, brand_490: `490` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "..."
}
```

---

### `headphones.js`

Uses **two** different API endpoints:

**1) Brand-based (via `client.js`):**

| API Endpoint | `GET /api/v1/catalog/headphones/category` |
|---|---|
| **Brand IDs** | samsung: `295`, apple: `294` |

**2) Marshall search:**

| API Endpoint | `GET /api/v1/catalog/Marshall/search` |
|---|---|
| **Query params** | `category_id[]=634`, `page={n}`, `lang=en` |

Both return the same common envelope. **Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "..."
}
```

---

### `macbooks.js`

| API Endpoint | `GET /api/v1/catalog/notebooks/category` (via `client.js`) |
|---|---|
| **Brand IDs** | apple: `294` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "...",
  "attributes": [
    {
      "attribute_id": 6,            // int — RAM attribute
      "attribute_value": "16 GB"    // string — e.g. "8 GB", "16 GB"
    },
    {
      "attribute_id": 4,            // int — Storage attribute
      "attribute_value": "512 GB"   // string — e.g. "256 GB", "1 TB"
    }
  ]
}
```

---

### `notebooks.js`

| API Endpoint | `GET /api/v1/catalog/notebooks/category` (via `client.js`) |
|---|---|
| **Extra params** | `lang=en` |
| **Brand IDs** | Imported from `core/notebookAttributes.js` |

**Expected product object:**

```jsonc
{
  "id": 12345,                     // int — required, throws if missing
  "name": "...",                   // string — required, throws if missing
  "price": "...",
  "cash_price": "...",
  "installment_price": "...",
  "slug": "product-slug-here",    // string — used to build product URL
  "attributes": [                 // array — passed to mapAttributes() & detectBrand()
    // --- mapped by ATTRIBUTE_ID_MAP in core/notebookAttributes.js ---
    { "attribute_id": 8,  "attribute_value": "Intel Core i7-13700H" },   // cpu
    { "attribute_id": 1,  "attribute_value": "15.6\"" },                 // screen_inches (parsed to number)
    { "attribute_id": 9,  "attribute_value": "1920x1080" },              // screen_resolution
    { "attribute_id": 10, "attribute_value": "120" },                    // refresh_rate_hz (parsed to number)
    { "attribute_id": 6,  "attribute_value": "16GB DDR5" },              // ram_gb (parsed → ram_gb: 16, ram_type: "DDR5")
    { "attribute_id": 4,  "attribute_value": "512GB SSD" },              // storage_gb (parsed → storage_gb: 512, storage_type: "SSD")
    { "attribute_id": 15, "attribute_value": "Yes" },                    // touch_screen
    { "attribute_id": 12, "attribute_value": "NVIDIA RTX 4060" },        // gpu
    { "attribute_id": 20, "attribute_value": "2024" },                   // year
    { "attribute_id": 24, "attribute_value": "IPS" },                    // screen_type
    // --- used by detectBrand() (optional, fallback to name matching) ---
    { "attribute_name": "Brand", "attribute_value": "Lenovo" }
  ]
}
```

---

### `phones.js`

| API Endpoint | `GET /api/v1/catalog/smartphones/category` (via `client.js`) |
|---|---|
| **Brand IDs** | apple: `294`, samsung: `295`, xiaomi: `296`, google: `352`, oneplus: `304`, nothing: `478`, asus: `310`, honor: `498`, zte: `335` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "...",
  "attributes": [
    {
      "attribute_id": 19,                           // int — SIM type attribute
      "attribute_value": "1 SIM + eSIM"             // string — e.g. "2 eSIM", "1 SIM + eSIM", "2 SIM", "1 SIM"
    }
  ]
}
```

---

### `speakers.js`

| API Endpoint | `GET /api/v1/catalog/speakers/category` (via `client.js`) |
|---|---|
| **Brand IDs** | `"307,308,309"` (passed as a combined comma-separated value) |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "..."
}
```

---

### `tablets.js`

| API Endpoint | `GET /api/v1/catalog/tablets/category` (via `client.js`) |
|---|---|
| **Brand IDs** | apple: `294`, samsung: `295`, xiaomi: `296` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "...",
  "attributes": [
    {
      "attribute_id": 19,                              // int — SIM type attribute
      "attribute_value": "1 SIM + eSIM"                // string — determines connectivity suffix
    },
    {
      "attribute_value_id": 426,                       // int — one of [426, 425, 423, 427, 3205] — chip attribute IDs
      "attribute_value": "Apple M5"                    // string — chip name
    }
  ]
}
```

> Note: chip detection uses `attribute_value_id` (not `attribute_id`) to match against `CHIP_ATTRIBUTE_IDS`.

---

### `tvs.js`

| API Endpoint | `GET /api/v1/catalog/tv/category` |
|---|---|
| **Query params** | `view=all`, `brand_id[]={brandId}`, `page={n}`, `price[min]=59000`, `price[max]=1659000`, `lang=hy` |
| **Brand IDs** | xiaomi: `296`, samsung: `295`, evvoli: `327` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "..."
}
```

---

### `watches.js`

| API Endpoint | `GET /api/v1/catalog/watches/category` (via `client.js`) |
|---|---|
| **Brand IDs** | apple: `294`, samsung: `295`, xiaomi: `296` |

**Expected product object:**

```jsonc
{
  "name": "...",
  "price": "...",
  "cash_price": "...",
  "installment_price": "..."
}
```