import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { X, Minus, Plus, Sparkles, ShoppingCart, Loader2 } from "lucide-react";
import { getRestaurantMenu, updateCartItems, type MenuItem, type RestaurantMenu } from "../services/swiggyOrder";
import MenuChat from "./MenuChat";
import CheckoutModal from "./CheckoutModal";

const SYNC_DEBOUNCE_MS = 400;

export interface MenuBrowseTarget {
  restaurantId: string;
  restaurantName?: string;
  addressId: string;
  dishId?: string;
  dishName?: string;
  why?: string;
  initialMenuItemId?: string;
}

interface RestaurantMenuModalProps {
  target: MenuBrowseTarget;
  onClose: () => void;
}

// Restaurant menu browser: scroll the live menu, add multiple items to the
// cart as a fallback to the single recommended dish, optionally ask the AI
// "expert recommender" about the menu — then check out with everything picked.
function RestaurantMenuModal({ target, onClose }: RestaurantMenuModalProps) {
  const [menu, setMenu] = useState<RestaurantMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>(
    target.initialMenuItemId ? { [target.initialMenuItemId]: 1 } : {},
  );
  const [view, setView] = useState<"chat" | "menu">("chat");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [menuRevealed, setMenuRevealed] = useState(false);
  const syncTimer = useRef<number | null>(null);

  const handleExploreMenu = () => {
    setView("menu");
    setMenuRevealed(false);
    // Next tick so the transition classes actually animate in from the base state.
    requestAnimationFrame(() => requestAnimationFrame(() => setMenuRevealed(true)));
  };

  useEffect(() => {
    (async () => {
      const result = await getRestaurantMenu(target.restaurantId, target.addressId);
      setMenu(result);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItems = useMemo(() => {
    const map: Record<string, MenuItem> = {};
    for (const cat of menu?.categories || []) {
      for (const item of cat.items) map[item.id] = item;
    }
    return map;
  }, [menu]);

  const syncCart = useCallback(
    (next: Record<string, number>) => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        const items = Object.entries(next)
          .filter(([, qty]) => qty > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (items.length === 0) return;
        void updateCartItems(target.restaurantId, target.addressId, items, target.restaurantName);
      }, SYNC_DEBOUNCE_MS);
    },
    [target.restaurantId, target.addressId, target.restaurantName],
  );

  const changeQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev, [itemId]: Math.max(0, (prev[itemId] || 0) + delta) };
      if (next[itemId] === 0) delete next[itemId];
      syncCart(next);
      return next;
    });
  };

  const cartCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => sum + (allItems[id]?.price || 0) * qty, 0);

  if (checkoutOpen) {
    return (
      <CheckoutModal
        target={{ mode: "cart", restaurantId: target.restaurantId, restaurantName: target.restaurantName, addressId: target.addressId }}
        onClose={() => {
          setCheckoutOpen(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
      <div className="w-full md:max-w-lg h-[90vh] md:h-[640px] bg-white rounded-t-3xl md:rounded-3xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-base truncate">
              {menu?.restaurant?.name || target.restaurantName || "Menu"}
            </p>
            {menu?.restaurant?.etaMin != null && (
              <p className="text-xs text-gray-400 font-semibold">{menu.restaurant.etaMin} min delivery</p>
            )}
          </div>
          {view === "menu" && (
            <button
              onClick={() => setView("chat")}
              className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
            </button>
          )}
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : view === "chat" ? (
          <MenuChat
            restaurantId={target.restaurantId}
            addressId={target.addressId}
            dishContext={{ dishId: target.dishId, dishName: target.dishName, why: target.why }}
            getItem={(id) => allItems[id]}
            onSuggestedItemAdd={(itemId) => changeQty(itemId, 1)}
            onExploreMenu={handleExploreMenu}
          />
        ) : !menu?.success ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-gray-500 text-center">{menu?.error || "Couldn't load this menu right now."}</p>
          </div>
        ) : (
          <div
            className={`flex-1 overflow-y-auto p-5 flex flex-col gap-6 transition-all duration-300 ${
              menuRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {menu.categories.map((cat) => (
              <div key={cat.title} className="flex flex-col gap-2.5">
                <p className="font-extrabold text-gray-900 text-sm">{cat.title}</p>
                {cat.items.map((item) => (
                  <MenuItemRow key={item.id} item={item} quantity={cart[item.id] || 0} onChange={(d) => changeQty(item.id, d)} />
                ))}
              </div>
            ))}
          </div>
        )}

        {cartCount > 0 && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={() => setCheckoutOpen(true)}
              className="w-full py-3.5 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 text-white font-black text-sm flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              View Cart · {cartCount} item{cartCount === 1 ? "" : "s"} · ₹{cartTotal.toFixed(0)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItemRow({ item, quantity, onChange }: { item: MenuItem; quantity: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 text-2xl">🍽️</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.isVeg != null && (
            <span className={`inline-block w-3 h-3 border-2 rounded-sm ${item.isVeg ? "border-green-600" : "border-red-600"}`}>
              <span className={`block w-1 h-1 m-auto rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`} />
            </span>
          )}
          <p className="font-extrabold text-sm text-gray-900 truncate">{item.name}</p>
        </div>
        {item.price != null && <p className="text-sm font-bold text-primary-600 mt-0.5">₹{item.price.toFixed(0)}</p>}
        {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>}
      </div>
      {quantity === 0 ? (
        <button onClick={() => onChange(1)} className="px-3.5 py-2 rounded-xl bg-primary-500 text-white text-xs font-extrabold shrink-0">
          Add
        </button>
      ) : (
        <div className="flex items-center gap-2 border-2 border-primary-500 rounded-xl px-1 shrink-0">
          <button onClick={() => onChange(-1)} className="p-1.5">
            <Minus className="w-3.5 h-3.5 text-primary-600" />
          </button>
          <span className="text-sm font-extrabold text-gray-900 min-w-[16px] text-center">{quantity}</span>
          <button onClick={() => onChange(1)} className="p-1.5">
            <Plus className="w-3.5 h-3.5 text-primary-600" />
          </button>
        </div>
      )}
    </div>
  );
}

export default RestaurantMenuModal;
