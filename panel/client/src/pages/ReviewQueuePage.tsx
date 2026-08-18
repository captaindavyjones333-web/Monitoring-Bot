import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import type { ReviewQueueResult, MergeCandidateProduct } from "../types";

function ProductSummary({ product, label }: { product: MergeCandidateProduct; label: string }) {
  return (
    <div className="flex-1 min-w-0 bg-surface-subtle p-3.5 sm:p-4 rounded-xl border border-line w-full">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <Link
        to={`/products/${product.id}`}
        target="_blank"
        className="block font-semibold text-ink hover:text-brand transition-colors mt-1 truncate text-sm sm:text-base"
        title={product.canonicalTitle}
      >
        {product.canonicalTitle}
      </Link>
      <p className="text-xs text-muted mt-1 font-medium">
        {product.listingCount} listing{product.listingCount === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {product.storeNames.map((name) => (
          <span
            key={name}
            className="text-xs bg-surface border border-line rounded-md px-2 py-0.5 text-muted font-medium"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReviewQueuePage() {
  const [result, setResult] = useState<ReviewQueueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);

  function load(page = 1) {
    setLoading(true);
    setError("");
    api
      .getReviewQueue(page, 20)
      .then(setResult)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConfirm(candidateId: string) {
    setActioningId(candidateId);
    try {
      await api.confirmMerge(candidateId);
      load(result?.page ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm merge");
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(candidateId: string) {
    setActioningId(candidateId);
    try {
      await api.rejectMerge(candidateId);
      load(result?.page ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject candidate");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink">Review Queue</h2>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Products that might be the same real item, grouped separately because the matching
          rules didn't catch it. Confirm to merge, reject to keep them separate.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-brand/20 bg-brand-soft text-brand text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-4 sm:p-8 text-muted text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
          <span>Loading queue…</span>
        </div>
      )}

      {!loading && result?.items.length === 0 && (
        <div className="bg-surface border border-line rounded-2xl p-8 sm:p-12 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-brand-soft text-brand flex items-center justify-center mx-auto mb-3 font-bold">
            ✓
          </div>
          <h3 className="font-display text-base font-bold text-ink mb-1">All caught up!</h3>
          <p className="text-xs sm:text-sm text-muted max-w-md mx-auto">
            Nothing to review right now. Run the fuzzy-match pass again after your next migration
            or scraper batch to look for new candidates.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {result?.items.map((candidate) => (
          <div
            key={candidate.id}
            className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-2xs hover:border-brand/30 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted bg-surface-subtle border border-line rounded-md px-2.5 py-1">
                {candidate.category ?? "Uncategorized"}
              </span>
              <span className="text-xs font-bold text-brand bg-brand-soft border border-brand/20 rounded-md px-2.5 py-1">
                Confidence: {Math.round(candidate.confidenceScore * 100)}%
              </span>
            </div>

            <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-center">
              <ProductSummary product={candidate.productA} label="Product A" />
              <div className="text-muted font-bold text-lg rotate-90 md:rotate-0">↔</div>
              <ProductSummary product={candidate.productB} label="Product B" />
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 mt-5 pt-4 border-t border-line">
              <button
                onClick={() => handleReject(candidate.id)}
                disabled={actioningId === candidate.id}
                className="w-full sm:w-auto border border-line bg-surface text-ink text-xs font-semibold rounded-xl px-4 py-2.5 hover:bg-surface-subtle hover:border-zinc-300 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer text-center"
              >
                Not the same
              </button>
              <button
                onClick={() => handleConfirm(candidate.id)}
                disabled={actioningId === candidate.id}
                className="w-full sm:w-auto bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl px-5 py-2.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer text-center"
              >
                Merge — same product
              </button>
            </div>
          </div>
        ))}
      </div>

      {result && result.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 text-sm text-muted">
          <span className="text-xs sm:text-sm text-center sm:text-left">
            Page <strong className="text-ink">{result.page}</strong> of <strong className="text-ink">{result.totalPages}</strong> · {result.total} suggestion{result.total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              disabled={result.page <= 1}
              onClick={() => load(result.page - 1)}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand hover:text-brand transition-colors shadow-2xs"
            >
              Previous
            </button>
            <button
              disabled={result.page >= result.totalPages}
              onClick={() => load(result.page + 1)}
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