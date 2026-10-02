import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { searchInstamartProducts, type InstamartProduct, type InstamartVariation } from "../../services/instamart";

interface DiyProductSearchModalProps {
  addressId: string | null;
  onClose: () => void;
  onAdd: (product: InstamartProduct, variation: InstamartVariation) => void;
}

interface ResultCard {
  key: string;
  product: InstamartProduct;
  variation: InstamartVariation;
}

const PAGE_SIZE = 8;

/** Manual "+" add-to-cart — typed Instamart search, for items the recipe matcher missed or extras like drinks. */
export default function DiyProductSearchModal({ addressId, onClose, onAdd }: DiyProductSearchModalProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultCard[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, results.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [results.length]);

  const handleSearch = async () => {
    if (!query.trim() || !addressId) return;
    setLoading(true);
    setError(null);
    const result = await searchInstamartProducts(query.trim(), addressId);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Search failed.");
      setResults([]);
      return;
    }
    const flattened: ResultCard[] = result.products.flatMap((product) =>
      product.variations.map((variation) => ({ key: variation.spinId, product, variation })),
    );
    setResults(flattened);
    setVisibleCount(PAGE_SIZE);
    if (flattened.length === 0) setError("No results — try a different search.");
  };

  const handlePick = (card: ResultCard) => {
    onAdd(card.product, card.variation);
    onClose();
  };

  const visible = results.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
      <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-gray-100 z-10">
          <h3 className="font-black text-gray-900">Add an item</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search Instamart — coke, bread, eggs…"
              className="flex-1 h-11 rounded-full px-4 text-sm bg-gray-50 outline-none"
            />
            <button onClick={handleSearch} className="h-11 px-5 rounded-full bg-green-600 text-white font-bold text-sm">
              Search
            </button>
          </div>

          {loading && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="p-3 rounded-xl bg-red-50">
              <p className="text-xs font-semibold text-red-600">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {visible.map((item) => (
              <button
                key={item.key}
                onClick={() => handlePick(item)}
                className="rounded-2xl border-2 border-green-100 bg-white overflow-hidden text-left"
              >
                <div className="relative h-24 bg-green-50 flex items-center justify-center">
                  {item.variation.imageUrl ? (
                    <img src={item.variation.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">🛒</span>
                  )}
                  <span className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm leading-none">
                    +
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-extrabold text-gray-900 line-clamp-2">{item.product.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate">{item.variation.quantity || "1 unit"}</p>
                  {item.variation.price != null && (
                    <p className="text-sm font-extrabold text-gray-900 mt-1">₹{item.variation.price.toFixed(0)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {visibleCount < results.length && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
