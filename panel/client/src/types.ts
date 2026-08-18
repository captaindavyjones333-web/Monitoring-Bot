export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Store {
  id: string;
  name: string;
  is_own_store: boolean;
  is_active: boolean;
}

export interface ProductListItem {
  id: string;
  canonicalTitle: string;
  brand: string | null;
  primaryImageUrl: string | null;
  category: { id: string; name: string; slug: string } | null;
  listingCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  storeNames: string[];
}

export interface ProductSearchResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ProductListItem[];
}

export type ListingStatus =
  | "active"
  | "missing_from_category"
  | "not_found_via_search"
  | "removed"
  | "unknown";

export interface StoreListing {
  id: string;
  store: { id: string; name: string; isOwnStore: boolean };
  rawTitle: string;
  normalizedTitle: string | null;
  normalizedKey: string | null;
  url: string | null;
  price: number | null;
  cashPrice: number | null;
  installmentPrice: number | null;
  installationPrice: number | null;
  inCategory: boolean;
  status: ListingStatus;
  lastSeenAt: string | null;
  lastSeenInCategoryAt: string | null;
  searchAttempts: number;
  createdAt: string;
}

export interface ProductDetail {
  id: string;
  canonicalTitle: string;
  brand: string | null;
  attributes: Record<string, unknown>;
  primaryImageUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  listings: StoreListing[];
}

export interface MergeCandidateProduct {
  id: string;
  canonicalTitle: string;
  listingCount: number;
  storeNames: string[];
}

export interface MergeCandidate {
  id: string;
  confidenceScore: number;
  createdAt: string;
  category: string | null;
  productA: MergeCandidateProduct;
  productB: MergeCandidateProduct;
}

export interface ReviewQueueResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: MergeCandidate[];
}

export interface ManualMatchResult {
  ok: true;
  mergedInto: string;
}