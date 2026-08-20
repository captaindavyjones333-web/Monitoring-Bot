import type {
  Category,
  Store,
  ProductSearchResult,
  ProductDetail,
  ReviewQueueResult,
  ManualMatchResult,
} from "./types";

const API_ORIGIN = import.meta.env.VITE_API_URL ? String(import.meta.env.VITE_API_URL).replace(/\/$/, "") : "";
const BASE = `${API_ORIGIN}/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

interface SearchProductsParams {
  q?: string;
  category?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
}

export const api = {
  getCategories: () => request<Category[]>("/categories"),
  getStores: () => request<Store[]>("/stores"),
  searchProducts: ({ q, category, storeId, page, pageSize }: SearchProductsParams) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (storeId) params.set("storeId", storeId);
    if (page) params.set("page", String(page));
    if (pageSize) params.set("pageSize", String(pageSize));
    return request<ProductSearchResult>(`/products?${params.toString()}`);
  },
  getProduct: (id: string) => request<ProductDetail>(`/products/${id}`),
  updateProduct: (id: string, updates: { canonicalTitle?: string; categoryId?: string | null }) =>
    request<{ ok: true; canonicalTitle: string; updatedAt: string; category: { id: string; name: string; slug: string } | null }>(`/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }),
  deleteProduct: (id: string) =>
    request<{ ok: true }>(`/products/${id}`, {
      method: "DELETE",
    }),
  manualMatch: (targetProductId: string, otherProductId: string) =>
    request<ManualMatchResult>(`/products/${targetProductId}/manual-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherProductId }),
    }),

  getReviewQueue: (page = 1, pageSize = 20) =>
    request<ReviewQueueResult>(`/review-queue?page=${page}&pageSize=${pageSize}`),
  confirmMerge: (candidateId: string) =>
    request<{ ok: true; mergedInto: string }>(`/review-queue/${candidateId}/confirm`, {
      method: "POST",
    }),
  rejectMerge: (candidateId: string) =>
    request<{ ok: true }>(`/review-queue/${candidateId}/reject`, { method: "POST" }),

  checkListingUrl: (listingId: string) =>
    request<{ id: string; status: string; lastCheckedAt: string }>(
      `/listings/${listingId}/check-url`,
      { method: "POST" },
    ),
  unlinkListing: (listingId: string) =>
    request<{ ok: true; unlinkedListingId: string; previousProductId: string }>(
      `/listings/${listingId}/unlink`,
      { method: "POST" },
    ),
  deleteListing: (listingId: string) =>
    request<{ ok: true; deletedListingId: string }>(`/listings/${listingId}`, {
      method: "DELETE",
    }),
};