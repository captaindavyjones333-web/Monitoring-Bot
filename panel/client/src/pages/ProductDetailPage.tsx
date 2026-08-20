import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { api } from "../api";
import type { Category, ProductDetail, ProductListItem, StoreListing, ListingStatus } from "../types";

function formatPrice(n: number | null): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} ֏`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<ListingStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  missing_from_category: "bg-amber-50 text-amber-700 border-amber-200",
  not_found_via_search: "bg-amber-50 text-amber-700 border-amber-200",
  removed: "bg-zinc-100 text-zinc-600 border-zinc-200",
  unknown: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const STATUS_LABELS: Record<ListingStatus, string> = {
  active: "Active",
  missing_from_category: "Missing from category",
  not_found_via_search: "Not found via search",
  removed: "Removed",
  unknown: "Unknown",
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Group title edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Find & link a match states
  const [isMatchSectionOpen, setIsMatchSectionOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkSuccessMessage, setLinkSuccessMessage] = useState("");

  // Category mapping states
  const [categories, setCategories] = useState<Category[]>([]);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    api
      .getProduct(id)
      .then(setProduct)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Load categories for the category mapping dropdown
  useEffect(() => {
    if (isEditingCategory && categories.length === 0) {
      api.getCategories().then(setCategories).catch(() => {});
    }
  }, [isEditingCategory]);

  // Debounced search for manual matching
  useEffect(() => {
    if (!isMatchSectionOpen || !searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError("");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    const timeout = setTimeout(() => {
      api
        .searchProducts({ q: searchQuery.trim(), pageSize: 20 })
        .then((res) => {
          // Exclude the current product from search results
          setSearchResults(res.items.filter((item) => item.id !== id));
        })
        .catch((err: Error) => {
          setSearchError(err.message || "Failed to search products");
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery, isMatchSectionOpen, id]);

  async function handleCheckUrl(listingId: string) {
    setCheckingId(listingId);
    try {
      const result = await api.checkListingUrl(listingId);
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              listings: prev.listings.map((l) =>
                l.id === listingId
                  ? { ...l, status: result.status as ProductDetail["listings"][number]["status"], lastSeenAt: result.lastCheckedAt }
                  : l,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check URL");
    } finally {
      setCheckingId(null);
    }
  }

  async function handleUnlinkListing(listing: StoreListing) {
    if (!product) return;

    const confirmed = window.confirm(
      `Unlink "${listing.rawTitle}" (${listing.store.name}) from "${product.canonicalTitle}"?\n\n` +
      `This store listing will become its own separate product and will appear in search results where it can be rematched or merged.`
    );
    if (!confirmed) return;

    setUnlinkingId(listing.id);
    setError("");
    try {
      await api.unlinkListing(listing.id);
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              listings: prev.listings.filter((l) => l.id !== listing.id),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink listing");
    } finally {
      setUnlinkingId(null);
    }
  }

  async function handleSaveTitle() {
    if (!id || !product || !editedTitle.trim()) return;

    setIsSavingTitle(true);
    setError("");
    try {
      const res = await api.updateProduct(id, { canonicalTitle: editedTitle.trim() });
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              canonicalTitle: res.canonicalTitle,
              updatedAt: res.updatedAt,
            }
          : prev,
      );
      setIsEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product title");
    } finally {
      setIsSavingTitle(false);
    }
  }

  async function handleSaveCategory(newCategoryId: string | null) {
    if (!id || !product) return;

    setIsSavingCategory(true);
    setError("");
    try {
      const res = await api.updateProduct(id, { categoryId: newCategoryId });
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              category: res.category,
              updatedAt: res.updatedAt,
            }
          : prev,
      );
      setIsEditingCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleDeleteListing(listing: StoreListing) {
    if (!product) return;

    const confirmed = window.confirm(
      `Permanently delete listing "${listing.rawTitle}" (${listing.store.name}) from the database?\n\n` +
      `This will remove the store listing completely and cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingListingId(listing.id);
    setError("");
    try {
      await api.deleteListing(listing.id);
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              listings: prev.listings.filter((l) => l.id !== listing.id),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete store listing");
    } finally {
      setDeletingListingId(null);
    }
  }

  async function handleDeleteProduct() {
    if (!id || !product) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete group "${product.canonicalTitle}"?\n\n` +
      `This will delete the group and separate all linked listings into individual groups, each titled with its own product name. This action cannot be easily undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError("");
    try {
      await api.deleteProduct(id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
      setIsDeleting(false);
    }
  }

  async function handleManualMatch(otherProduct: ProductListItem) {
    if (!id || !product) return;

    const confirmed = window.confirm(
      `Merge "${otherProduct.canonicalTitle}" into "${product.canonicalTitle}"?\n\n` +
      `All store listings from "${otherProduct.canonicalTitle}" will be transferred to this product and "${otherProduct.canonicalTitle}" will be marked as merged.\n\n` +
      `This action cannot easily be undone.`
    );
    if (!confirmed) return;

    setLinkingId(otherProduct.id);
    setSearchError("");
    setLinkSuccessMessage("");
    try {
      await api.manualMatch(id, otherProduct.id);
      setLinkSuccessMessage(`Successfully merged "${otherProduct.canonicalTitle}" into this product.`);
      // Refresh current product's details so the newly-transferred listings appear immediately
      const updated = await api.getProduct(id);
      setProduct(updated);
      // Remove the merged product from current search results
      setSearchResults((prev) => prev.filter((p) => p.id !== otherProduct.id));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to merge product");
    } finally {
      setLinkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 text-muted text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
        <span>Loading product details…</span>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-4 sm:p-8 max-w-xl">
        <div className="rounded-xl border border-brand/20 bg-brand-soft text-brand text-sm px-4 py-3">
          {error || "Product not found."}
        </div>
        <Link to="/" className="text-sm text-brand font-medium hover:underline mt-4 inline-block">
          ← Back to search
        </Link>
      </div>
    );
  }

  const hasInstallation = product.listings.some((l) => l.installationPrice != null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand transition-colors"
        >
          <span>←</span>
          <span>Back to search</span>
        </Link>
        <button
          onClick={handleDeleteProduct}
          disabled={isDeleting}
          className="border border-brand/30 bg-brand-soft text-brand hover:bg-brand hover:text-white text-xs font-semibold rounded-xl px-3.5 py-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
        >
          {isDeleting ? "Deleting…" : "Delete Group"}
        </button>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {isEditingCategory ? (
            <div className="flex items-center gap-2">
              <select
                value={product.category?.id ?? ""}
                onChange={(e) => handleSaveCategory(e.target.value || null)}
                disabled={isSavingCategory}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setIsEditingCategory(false)}
                disabled={isSavingCategory}
                className="text-[11px] font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingCategory(true)}
              className="text-[11px] uppercase tracking-wider font-semibold text-muted bg-surface-subtle border border-line rounded-md px-2 py-0.5 hover:border-brand/40 hover:text-brand hover:bg-brand-soft/30 transition-colors cursor-pointer inline-flex items-center gap-1"
              title="Click to change category"
            >
              {product.category?.name ?? "No category"}
              <span className="text-[9px] normal-case tracking-normal opacity-60">✎</span>
            </button>
          )}
          {product.brand && (
            <span className="text-[11px] font-semibold text-brand bg-brand-soft border border-brand/20 rounded-md px-2 py-0.5">
              {product.brand}
            </span>
          )}
        </div>
        {isEditingTitle ? (
          <div className="mt-1 mb-2">
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                autoFocus
                disabled={isSavingTitle}
                className="w-full sm:max-w-xl rounded-xl border border-line bg-surface px-3.5 py-2 text-base sm:text-lg font-bold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all shadow-2xs"
                placeholder="Enter group title…"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle || !editedTitle.trim()}
                  className="bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl px-4 py-2.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isSavingTitle ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setIsEditingTitle(false)}
                  disabled={isSavingTitle}
                  className="border border-line bg-surface text-ink text-xs font-semibold rounded-xl px-3.5 py-2.5 hover:bg-surface-subtle transition-colors disabled:opacity-50 shadow-2xs cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-1">Press Enter to save, Esc to cancel</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink">
              {product.canonicalTitle}
            </h2>
            <button
              onClick={() => {
                setEditedTitle(product.canonicalTitle);
                setIsEditingTitle(true);
              }}
              className="text-xs font-semibold text-muted hover:text-brand bg-surface-subtle hover:bg-brand-soft border border-line hover:border-brand/30 rounded-lg px-2.5 py-1 transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              title="Edit group title"
            >
              <span>✎</span>
              <span>Edit title</span>
            </button>
          </div>
        )}
        <p className="text-xs text-muted mt-1">
          {product.listings.length} store listing{product.listings.length === 1 ? "" : "s"} · updated {formatDate(product.updatedAt)}
        </p>
      </div>

      <div className="bg-surface border border-line rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-line bg-surface-subtle text-left text-xs uppercase tracking-wider text-muted font-semibold">
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Store</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Listing title</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold text-right">Cash price</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold text-right">Installment</th>
                {hasInstallation && (
                  <th className="px-4 sm:px-5 py-3.5 font-semibold text-right">Installation</th>
                )}
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Status</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold">Last seen</th>
                <th className="px-4 sm:px-5 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {product.listings.map((l) => (
                <tr key={l.id} className="hover:bg-brand-soft/20 transition-colors">
                  <td className="px-4 sm:px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-ink whitespace-nowrap">{l.store.name}</span>
                      {l.store.isOwnStore && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-brand bg-brand-soft border border-brand/20 rounded-md px-1.5 py-0.5">
                          own
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-5 py-3.5 text-muted max-w-xs truncate" title={l.rawTitle}>
                    {l.rawTitle}
                  </td>
                  <td className="px-4 sm:px-5 py-3.5 text-right price font-semibold text-ink whitespace-nowrap">
                    {formatPrice(l.cashPrice)}
                  </td>
                  <td className="px-4 sm:px-5 py-3.5 text-right price text-muted whitespace-nowrap">
                    {formatPrice(l.installmentPrice)}
                  </td>
                  {hasInstallation && (
                    <td className="px-4 sm:px-5 py-3.5 text-right price text-muted whitespace-nowrap">
                      {l.installationPrice === 0 ? "Free" : formatPrice(l.installationPrice)}
                    </td>
                  )}
                  <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold rounded-md border px-2 py-0.5 ${
                        STATUS_STYLES[l.status] ?? STATUS_STYLES.unknown
                      }`}
                    >
                      {STATUS_LABELS[l.status] ?? l.status}
                    </span>
                  </td>
                  <td className="px-4 sm:px-5 py-3.5 text-muted text-xs whitespace-nowrap">{formatDate(l.lastSeenAt)}</td>
                  <td className="px-4 sm:px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.url ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:text-brand-hover font-semibold text-xs transition-colors"
                        >
                          Open ↗
                        </a>
                      ) : (
                        <span className="text-xs text-muted">No URL</span>
                      )}
                      {l.url && (
                        <button
                          onClick={() => handleCheckUrl(l.id)}
                          disabled={checkingId === l.id}
                          className="text-xs font-medium border border-line bg-surface rounded-lg px-2.5 py-1 text-ink hover:border-brand hover:text-brand transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
                        >
                          {checkingId === l.id ? "Checking…" : "Check URL"}
                        </button>
                      )}
                      <button
                        onClick={() => handleUnlinkListing(l)}
                        disabled={unlinkingId === l.id}
                        className="text-xs font-medium border border-line bg-surface rounded-lg px-2.5 py-1 text-muted hover:border-brand/40 hover:text-brand hover:bg-brand-soft/30 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
                        title="Unlink this listing into its own product"
                      >
                        {unlinkingId === l.id ? "Unlinking…" : "Unlink"}
                      </button>
                      <button
                        onClick={() => handleDeleteListing(l)}
                        disabled={deletingListingId === l.id}
                        className="text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer rounded-lg px-2.5 py-1"
                        title="Permanently delete this listing"
                      >
                        {deletingListingId === l.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Find & Link a Match Section */}
      <div className="mt-8 bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold tracking-tight text-ink">
              Find &amp; link a match
            </h3>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Search for any other product in the database to manually merge its listings into this one.
            </p>
          </div>
          <button
            onClick={() => setIsMatchSectionOpen(!isMatchSectionOpen)}
            className="self-start sm:self-auto border border-line bg-surface-subtle text-ink text-xs font-semibold rounded-xl px-4 py-2 hover:border-brand hover:text-brand transition-colors shadow-2xs cursor-pointer"
          >
            {isMatchSectionOpen ? "Hide search" : "Search products to link"}
          </button>
        </div>

        {isMatchSectionOpen && (
          <div className="mt-5 pt-5 border-t border-line">
            <div className="relative mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product name to link…"
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all shadow-2xs placeholder:text-muted/60"
              />
            </div>

            {linkSuccessMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs sm:text-sm px-4 py-3 mb-4 flex items-center justify-between">
                <span>{linkSuccessMessage}</span>
                <button
                  onClick={() => setLinkSuccessMessage("")}
                  className="text-emerald-700 hover:text-emerald-950 font-bold ml-3 cursor-pointer text-base leading-none"
                >
                  ×
                </button>
              </div>
            )}

            {searchError && (
              <div className="rounded-xl border border-brand/20 bg-brand-soft text-brand text-xs sm:text-sm px-4 py-3 mb-4">
                {searchError}
              </div>
            )}

            {isSearching && (
              <div className="p-6 text-muted text-xs sm:text-sm flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
                <span>Searching products…</span>
              </div>
            )}

            {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
              <div className="p-6 text-center text-xs sm:text-sm text-muted bg-surface-subtle rounded-xl border border-line">
                No matching products found.
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-brand-soft/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        {item.category && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted bg-surface-subtle border border-line rounded-md px-2 py-0.5">
                            {item.category.name}
                          </span>
                        )}
                        {item.brand && (
                          <span className="text-[10px] font-semibold text-brand bg-brand-soft border border-brand/20 rounded-md px-2 py-0.5">
                            {item.brand}
                          </span>
                        )}
                        <span className="text-xs text-muted font-medium">
                          {item.listingCount} listing{item.listingCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <h4 className="font-semibold text-ink text-sm sm:text-base truncate" title={item.canonicalTitle}>
                        {item.canonicalTitle}
                      </h4>
                      {item.minPrice != null && (
                        <p className="text-xs font-semibold text-ink mt-1">
                          {item.minPrice === item.maxPrice
                            ? formatPrice(item.minPrice)
                            : `${formatPrice(item.minPrice)} – ${formatPrice(item.maxPrice)}`}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.storeNames.map((name) => (
                          <span
                            key={name}
                            className="text-xs bg-surface-subtle border border-line rounded-md px-1.5 py-0.5 text-muted font-medium"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleManualMatch(item)}
                        disabled={linkingId === item.id}
                        className="w-full sm:w-auto bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl px-4 py-2.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer text-center whitespace-nowrap"
                      >
                        {linkingId === item.id ? "Linking…" : "Link as same product"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}