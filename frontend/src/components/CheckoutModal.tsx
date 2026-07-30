import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, PhoneCall } from "lucide-react";
import {
  getSavedAddressId,
  saveAddressId,
  fetchAddresses,
  type SwiggyAddress,
} from "../services/swiggy";
import {
  getCart,
  updateCart,
  fetchCoupons,
  applyCoupon,
  placeOrder,
  trackOrder,
  type CartState,
  type Coupon,
} from "../services/swiggyOrder";
import { trackEvent } from "../utils/analytics";

// Poll floor per Swiggy MCP docs: no faster than 10s.
const TRACK_POLL_MS = 10000;
const SWIGGY_SUPPORT_NUMBER = "080-67466729";
const ORDER_VALUE_CAP_INR = 1000;

// Single-dish target ("Order now!" fast path) — writes the one item to the
// cart. Cart target (from the restaurant menu browser) — the server-side
// Swiggy cart is already populated; this just reads it back.
export type CheckoutTarget =
  | { mode?: "single"; restaurantId: string; restaurantName?: string; menuItemId: string; dishName: string }
  | { mode: "cart"; restaurantId: string; restaurantName?: string; addressId?: string };

interface CheckoutModalProps {
  target: CheckoutTarget;
  onClose: () => void;
}

function CheckoutModal({ target, onClose }: CheckoutModalProps) {
  const [addresses, setAddresses] = useState<SwiggyAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [trackStatus, setTrackStatus] = useState<string | null>(null);
  const [trackEta, setTrackEta] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const isCartMode = target.mode === "cart";
  const selectedAddress = addresses.find((a) => a.id === addressId) || null;
  const capExceeded = (cart?.total ?? 0) >= ORDER_VALUE_CAP_INR;
  const cartItemCount = cart?.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  const loadCart = useCallback(
    async (addrId: string) => {
      setCartLoading(true);
      setError(null);
      // Cart mode: the menu browser already populated the server-side cart —
      // just read it back. Single-dish mode: write the one item, then read.
      const result = target.mode === "cart"
        ? await getCart(addrId, target.restaurantName)
        : await updateCart(target.restaurantId, addrId, target.menuItemId, 1, target.restaurantName);
      setCart(result);
      if (result.availablePaymentMethods.length > 0) setPaymentMethod(result.availablePaymentMethods[0]);
      if (result.addressRequired) setError("We need a delivery address to continue.");
      else if (!result.success && result.error) setError(result.error);
      setCartLoading(false);
    },
    [isCartMode, target.restaurantId, target.restaurantName, target.mode === "single" ? target.menuItemId : undefined],
  );

  useEffect(() => {
    (async () => {
      const list = await fetchAddresses();
      setAddresses(list);
      let addrId = (target.mode === "cart" && target.addressId) || getSavedAddressId();
      if (!addrId && list.length > 0) {
        addrId = list[0].id;
        saveAddressId(addrId);
      }
      if (!addrId) {
        setError("Link a Swiggy address to order in-app.");
        setCartLoading(false);
        return;
      }
      setAddressId(addrId);
      await loadCart(addrId);
      const fetched = await fetchCoupons(target.restaurantId, addrId);
      setCoupons(fetched);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!orderId) return;
    const poll = async () => {
      const result = await trackOrder(orderId);
      if (result.success) {
        setTrackStatus(result.status || null);
        if (result.eta) setTrackEta(result.eta);
      }
    };
    poll();
    pollRef.current = window.setInterval(poll, TRACK_POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [orderId]);

  const handleSelectAddress = async (id: string) => {
    setAddressId(id);
    saveAddressId(id);
    await loadCart(id);
  };

  const handleApplyCoupon = async (code: string) => {
    if (!addressId) return;
    setCartLoading(true);
    const result = await applyCoupon(code, addressId);
    if (result.success) {
      setCart(result);
      setAppliedCoupon(code);
    } else if (result.error) {
      setError(result.error);
    }
    setCartLoading(false);
  };

  const handlePlaceOrder = async () => {
    if (!addressId || capExceeded) return;
    setPlacing(true);
    setError(null);
    const result = await placeOrder(addressId, paymentMethod || undefined, true);
    if (!result.success) {
      setError(result.error || "Could not place the order. Please try again.");
      setPlacing(false);
      return;
    }
    trackEvent("in_app_order_placed", {
      dish: target.mode === "cart" ? target.restaurantName : target.dishName,
      order_id: result.orderId,
    });
    setOrderId(result.orderId || null);
    setPlacing(false);
  };

  const total = cart?.total ?? 0;
  const isCancelled = (trackStatus || "").toLowerCase().includes("cancel");

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
      <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900">
            {orderId ? "Order status" : target.mode === "cart" ? target.restaurantName || "Your cart" : `Order ${target.dishName}`}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          {orderId ? (
            <div className="flex flex-col gap-4">
              {isCancelled ? (
                <div className="p-3 rounded-xl bg-red-50 flex flex-col gap-2">
                  <p className="text-sm font-bold text-red-600">This order was cancelled or couldn't be tracked.</p>
                  <a href={`tel:${SWIGGY_SUPPORT_NUMBER}`} className="flex items-center gap-2 text-xs font-bold text-red-600">
                    <PhoneCall className="w-4 h-4" /> Call Swiggy support: {SWIGGY_SUPPORT_NUMBER}
                  </a>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Order <span className="font-bold text-gray-900">#{orderId}</span> placed!
                  </p>
                  <div className="p-3 rounded-xl bg-orange-50">
                    <p className="text-sm font-bold text-gray-900">Status: {trackStatus || "Confirmed"}</p>
                    {trackEta && <p className="text-xs text-gray-500 mt-1">ETA: {trackEta}</p>}
                  </div>
                </>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-full bg-gray-900 text-white font-bold text-sm"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-500">Delivery to</span>
                  {addresses.length > 1 && (
                    <select
                      value={addressId || ""}
                      onChange={(e) => handleSelectAddress(e.target.value)}
                      className="text-xs font-bold text-primary-600 bg-transparent"
                    >
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">
                  {selectedAddress ? `${selectedAddress.label} — ${selectedAddress.line}` : "Loading address…"}
                </p>
              </div>

              {coupons.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-gray-500">Coupons</span>
                  <div className="flex flex-col gap-2 mt-1.5">
                    {coupons.map((c) => (
                      <button
                        key={c.couponCode}
                        onClick={() => handleApplyCoupon(c.couponCode)}
                        disabled={cartLoading}
                        className={`text-left p-3 rounded-xl border-2 ${
                          appliedCoupon === c.couponCode ? "border-green-400 bg-green-50" : "border-gray-100"
                        }`}
                      >
                        <p className="text-sm font-extrabold text-gray-900">{c.couponCode}</p>
                        <p className="text-xs text-gray-500">{c.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cart && cart.availablePaymentMethods.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-gray-500">Payment method</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {cart.availablePaymentMethods.map((method) => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`px-3.5 py-2 rounded-full text-xs font-bold border-2 ${
                          paymentMethod === method ? "bg-gray-900 border-gray-900 text-white" : "border-gray-100 text-gray-700"
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!cartLoading && cart && cart.items.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-gray-500">
                    {cartItemCount} item{cartItemCount === 1 ? "" : "s"}
                  </span>
                  <div className="flex flex-col gap-1.5 mt-1.5">
                    {cart.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-gray-700 truncate pr-2">{item.quantity}× {item.name}</span>
                        {item.price != null && (
                          <span className="text-gray-500 font-semibold shrink-0">
                            ₹{(item.price * item.quantity).toFixed(0)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cartLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
              ) : (
                cart && (
                  <div className="p-4 rounded-xl bg-gray-50 flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span><span>₹{(cart.subtotal ?? 0).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Delivery</span><span>₹{(cart.deliveryCharges ?? 0).toFixed(0)}</span>
                    </div>
                    {(cart.couponDiscount ?? 0) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Coupon</span><span>-₹{(cart.couponDiscount ?? 0).toFixed(0)}</span>
                      </div>
                    )}
                    <div className="h-px bg-gray-200 my-1" />
                    <div className="flex justify-between font-black text-gray-900">
                      <span>Total</span><span>₹{total.toFixed(0)}</span>
                    </div>
                  </div>
                )
              )}

              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

              {capExceeded ? (
                <div className="p-3 rounded-xl bg-orange-50">
                  <p className="text-xs font-bold text-orange-600">
                    Orders of ₹{ORDER_VALUE_CAP_INR} or more need the Swiggy app for now (beta limit).
                  </p>
                </div>
              ) : (
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing || cartLoading || !addressId}
                  className="w-full py-3.5 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 text-white font-black text-sm disabled:opacity-50"
                >
                  {placing ? "Placing…" : `Place Order · ₹${total.toFixed(0)}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CheckoutModal;
