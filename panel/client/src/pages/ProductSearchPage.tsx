import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../api";
import type { Category, Store, ProductSearchResult } from "../types";

function formatPrice(n: number | null): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} ֏`;
}

export default function ProductSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [result, setResult] = useState<ProductSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const storeId = searchParams.get("storeId") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
    api.getStores().then(setStores).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const timeout = setTimeout(() => {
      api
        .searchProducts({ q, category, storeId, page, pageSize: 20 })
        .then(setResult)
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [q, category, storeId, page]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-xl sm:text-2xl font-bold text-ink tracking-tight">Products</h2>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Search across every store's listings and jump into a product to review its cross-store matches.
        </p>
      </div>

      {/* Responsive Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 mb-6">
        <div className="flex-1 min-w-full sm:min-w-60 relative">
          <input
            type="text"
            value={q}
            onChange={(e) => updateParam("q", e.target.value)}
            placeholder="Search by product name…"
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all shadow-2xs placeholder:text-muted/60"
          />
        </div>
        <select
          value={category}
          onChange={(e) => updateParam("category", e.target.value)}
          className="w-full sm:w-auto rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all shadow-2xs cursor-pointer"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={storeId}
          onChange={(e) => updateParam("storeId", e.target.value)}
          className="w-full sm:w-auto rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all shadow-2xs cursor-pointer"
        >
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_own_store ? " (own store)" : ""}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-brand/20 bg-brand-soft text-brand text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Responsive Table Wrapper */}
      <div className="bg-surface border border-line rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-line bg-surface-subtle text-left text-xs uppercase tracking-wider text-muted font-semibold">
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Product</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Category</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Stores</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold text-right">Price range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-muted">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
                      <span>Loading products…</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && result?.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-muted">
                    No products match these filters.
                  </td>
                </tr>
              )}
              {!loading &&
                result?.items.map((item) => (
                  <tr key={item.id} className="hover:bg-brand-soft/30 transition-colors group">
                    <td className="px-4 sm:px-5 py-3.5">
                      <Link
                        to={`/products/${item.id}`}
                        className="font-semibold text-ink group-hover:text-brand transition-colors line-clamp-2 sm:line-clamp-none"
                      >
                        {item.canonicalTitle}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-5 py-3.5 text-muted whitespace-nowrap">
                      {item.category?.name ?? "—"}
                    </td>
                    <td className="px-4 sm:px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {item.storeNames.map((name) => (
                          <span
                            key={name}
                            className="text-xs bg-surface-subtle border border-line rounded-md px-1.5 py-0.5 text-muted font-medium whitespace-nowrap"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 sm:px-5 py-3.5 text-right price font-semibold text-ink whitespace-nowrap">
                      {item.minPrice === item.maxPrice
                        ? formatPrice(item.minPrice)
                        : `${formatPrice(item.minPrice)} – ${formatPrice(item.maxPrice)}`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Responsive Pagination */}
      {result && result.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 text-sm text-muted">
          <span className="text-xs sm:text-sm text-center sm:text-left">
            Page <strong className="text-ink">{result.page}</strong> of <strong className="text-ink">{result.totalPages}</strong> · {result.total} products
          </span>
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              disabled={page <= 1}
              onClick={() => updateParam("page", String(page - 1))}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand hover:text-brand transition-colors shadow-2xs"
            >
              Previous
            </button>
            <button
              disabled={page >= result.totalPages}
              onClick={() => updateParam("page", String(page + 1))}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand hover:text-brand transition-colors shadow-2xs"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}