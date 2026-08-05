import type { MatchedIngredient } from "../../services/instamart";

interface DiyCartProps {
  loading: boolean;
  servings: number;
  matches: MatchedIngredient[];
  removed: Set<string>;
  onToggleRemoved: (name: string) => void;
  manualItems: MatchedIngredient[];
  onRemoveManual: (spinId: string) => void;
  onOpenSearch: () => void;
  error: string | null;
  checkingOut: boolean;
  onCheckout: () => void;
  onLetsCook: () => void;
}

/** Stage 2 — editable ingredient cart matched against Instamart products. */
export default function DiyCart({
  loading,
  servings,
  matches,
  removed,
  onToggleRemoved,
  manualItems,
  onRemoveManual,
  onOpenSearch,
  error,
  checkingOut,
  onCheckout,
  onLetsCook,
}: DiyCartProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-500">Matching ingredients on Instamart…</p>
      </div>
    );
  }

  const matched = matches.filter((m) => m.matched && m.variation);
  const unmatched = matches.filter((m) => !m.matched);
  const active = [...matched.filter((m) => !removed.has(m.ingredient.name)), ...manualItems];
  const total = active.reduce((sum, m) => sum + (m.variation?.price ?? 0), 0);
  const hasItems = active.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-xl bg-orange-50">
        <p className="text-xs font-bold text-orange-600">
          🍽️ This recipe makes {servings} serving{servings === 1 ? "" : "s"} — the quantities below are sized
          for that many people.
        </p>
      </div>

      <div className="p-3 rounded-xl bg-green-50">
        <p className="text-xs font-semibold text-green-700">
          💡 Already have some of these at home? Remove them below — if the cart ends up empty, you'll skip
          straight to cooking.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {matched.map((m) => {
          const isRemoved = removed.has(m.ingredient.name);
          return (
            <div
              key={m.ingredient.name}
              className={`rounded-2xl border-2 overflow-hidden ${
                isRemoved ? "bg-gray-50 border-gray-100 opacity-50" : "bg-white border-green-100"
              }`}
            >
              <div className="relative h-24 bg-green-50 flex items-center justify-center">
                {m.variation?.imageUrl ? (
                  <img src={m.variation.imageUrl} alt={m.product?.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl">🛒</span>
                )}
                <button
                  onClick={() => onToggleRemoved(m.ingredient.name)}
                  className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                    isRemoved ? "bg-green-600 text-white" : "bg-white/90 text-red-600"
                  }`}
                >
                  {isRemoved ? "↺" : "✕"}
                </button>
              </div>
              <div className="p-2.5">
                <p className="text-xs font-extrabold text-gray-900 line-clamp-2">{m.product?.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                  for {m.ingredient.quantity} {m.ingredient.unit} {m.ingredient.name}
                </p>
                {m.variation?.price != null && (
                  <p className="text-sm font-extrabold text-gray-900 mt-1">₹{m.variation.price.toFixed(0)}</p>
                )}
              </div>
            </div>
          );
        })}

        {manualItems.map((m) => (
          <div key={m.variation!.spinId} className="rounded-2xl border-2 border-orange-100 bg-white overflow-hidden">
            <div className="relative h-24 bg-orange-50 flex items-center justify-center">
              {m.variation?.imageUrl ? (
                <img src={m.variation.imageUrl} alt={m.product?.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">🛒</span>
              )}
              <button
                onClick={() => onRemoveManual(m.variation!.spinId)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-sm bg-white/90 text-red-600"
              >
                ✕
              </button>
            </div>
            <div className="p-2.5">
              <p className="text-xs font-extrabold text-gray-900 line-clamp-2">{m.product?.name}</p>
              <p className="text-[10px] text-orange-500 mt-0.5">Added by you</p>
              {m.variation?.price != null && (
                <p className="text-sm font-extrabold text-gray-900 mt-1">₹{m.variation.price.toFixed(0)}</p>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={onOpenSearch}
          className="rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 h-[164px]"
        >
          <span className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center text-xl leading-none">+</span>
          <span className="text-xs font-bold text-gray-500">Add an item</span>
        </button>
      </div>

      {unmatched.length > 0 && (
        <div className="p-3 rounded-xl bg-orange-50">
          <p className="text-xs font-bold text-orange-600">
            Couldn't find a confident match for: {unmatched.map((m) => m.ingredient.name).join(", ")}
          </p>
          <p className="text-xs text-gray-400 mt-1">You may need to pick these up separately.</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-50">
          <p className="text-xs font-semibold text-red-600">{error}</p>
        </div>
      )}

      {hasItems && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-bold text-gray-500">Total</span>
          <span className="text-lg font-black text-gray-900">₹{total.toFixed(0)}</span>
        </div>
      )}

      <button
        onClick={hasItems ? onCheckout : onLetsCook}
        disabled={checkingOut}
        className={`w-full py-3.5 rounded-full font-black text-white text-sm ${
          hasItems ? "bg-gradient-to-r from-orange-500 to-amber-400" : "bg-gradient-to-r from-green-600 to-green-400"
        } disabled:opacity-70`}
      >
        {checkingOut ? "Placing order…" : hasItems ? `🛒 Checkout · ₹${total.toFixed(0)}` : "👨‍🍳 Let's cook"}
      </button>
    </div>
  );
}
