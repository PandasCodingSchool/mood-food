import { API_BASE_URL, getHeaders } from './apiBase';

export interface CartLine {
  id: string;
  name: string;
  price?: number | null;
  quantity: number;
}

/** A way to pay the app can complete (from Swiggy's get_payment_options). */
export interface PaymentOption {
  id: string;
  label: string;
  kind: 'upi_app' | 'upi_qr' | 'swiggy_money' | 'cash';
  paymentMethod: string;
  intentApp?: string | null;
  iconUrl?: string | null;
}

export interface CartState {
  success: boolean;
  items: CartLine[];
  subtotal?: number | null;
  deliveryCharges?: number | null;
  taxes?: number | null;
  total?: number | null;
  availablePaymentMethods: string[];
  paymentOptions: PaymentOption[];
  couponApplied: boolean;
  couponDiscount?: number | null;
  error?: string;
  addressRequired?: boolean;
}

export interface Coupon {
  couponCode: string;
  discount?: string | null;
  description?: string | null;
  applicabilityStatus?: string | null;
  paymentMethod?: string | null;
  termsAndConditions?: string | null;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string | null;
  status?: string | null;
  estimatedDeliveryTime?: string | null;
  message?: string | null;
  error?: string;
  addressRequired?: boolean;
  capExceeded?: boolean;
  capAmount?: number;
  /** UPI: the order is NOT placed until payment succeeds (see waitForUpiPayment). */
  payment?: UpiPayment | null;
}

/** A UPI order awaiting payment, as place_food_order returned it. */
export interface UpiPayment {
  orderId: string;
  paasId: string;
  upiIntentUrl?: string | null;
  bridgeUrl?: string | null;
  isQrFlow: boolean;
  pollingIntervalMs: number;
  maxPollMs: number;
  addressId?: string | null;
  cartId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface TrackOrderResult {
  success: boolean;
  orderId?: string | null;
  status?: string | null;
  eta?: string | null;
  progress?: string | null;
  error?: string;
}

export interface CartItemInput {
  menuItemId: string;
  quantity: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price?: number | null;
  imageUrl?: string | null;
  isVeg?: boolean | null;
  rating?: number | null;
  description?: string | null;
}

export interface MenuCategory {
  title: string;
  items: MenuItem[];
}

export interface RestaurantSummary {
  id: string;
  name: string;
  rating?: number | null;
  etaMin?: number | null;
  cuisines?: string[];
  imageUrl?: string | null;
  costForTwo?: number | null;
}

export interface RestaurantMenu {
  success: boolean;
  restaurant?: RestaurantSummary | null;
  categories: MenuCategory[];
  addressId?: string | null;
  error?: string;
  addressRequired?: boolean;
}

export interface MenuChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface MenuChatResult {
  success: boolean;
  reply?: string | null;
  suggestedItemIds: string[];
  error?: string;
}

function mapCart(data: Record<string, unknown>): CartState {
  return {
    success: !!data.success,
    items: (data.items as CartLine[]) || [],
    subtotal: data.subtotal as number | null,
    deliveryCharges: data.delivery_charges as number | null,
    taxes: data.taxes as number | null,
    total: data.total as number | null,
    availablePaymentMethods: (data.available_payment_methods as string[]) || [],
    paymentOptions: ((data.payment_options as Record<string, unknown>[]) || []).map((o) => ({
      id: o.id as string,
      label: o.label as string,
      kind: o.kind as PaymentOption['kind'],
      paymentMethod: o.payment_method as string,
      intentApp: o.intent_app as string | null,
      iconUrl: o.icon_url as string | null,
    })),
    couponApplied: !!data.coupon_applied,
    couponDiscount: data.coupon_discount as number | null,
    error: data.error as string | undefined,
    addressRequired: !!data.address_required,
  };
}

export async function getCart(addressId: string, restaurantName?: string): Promise<CartState> {
  const params = new URLSearchParams({ address_id: addressId });
  if (restaurantName) params.set('restaurant_name', restaurantName);
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/cart?${params.toString()}`, {
      headers: await getHeaders(),
    });
    return mapCart(await res.json());
  } catch {
    return { success: false, items: [], availablePaymentMethods: [], paymentOptions: [], couponApplied: false, error: "Couldn't load your cart. Please try again." };
  }
}

/**
 * Replaces the cart's contents with exactly `items` (always the full desired
 * state, never a delta) — the docs don't fully specify whether the tool is
 * additive or a full replace, so callers always send the complete cart.
 */
export async function updateCartItems(
  restaurantId: string,
  addressId: string,
  items: CartItemInput[],
  restaurantName?: string,
): Promise<CartState> {
  const res = await fetch(`${API_BASE_URL}/swiggy/cart`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      restaurant_id: restaurantId,
      restaurant_name: restaurantName,
      address_id: addressId,
      items: items.map((i) => ({ menu_item_id: i.menuItemId, quantity: i.quantity })),
    }),
  });
  const data = await res.json();
  return mapCart(data);
}

/** Empties the server-side Swiggy cart (e.g. the user removed every item). Never throws. */
export async function flushCart(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/swiggy/cart`, { method: 'DELETE', headers: await getHeaders() });
  } catch {
    // best effort — checkout re-reads the cart anyway
  }
}

/** Single-dish convenience wrapper — the "Order now!" fast path. */
export async function updateCart(
  restaurantId: string,
  addressId: string,
  menuItemId: string,
  quantity = 1,
  restaurantName?: string,
): Promise<CartState> {
  return updateCartItems(restaurantId, addressId, [{ menuItemId, quantity }], restaurantName);
}

export async function getRestaurantMenu(restaurantId: string, addressId: string): Promise<RestaurantMenu> {
  const params = new URLSearchParams({ address_id: addressId });
  let data;
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/restaurant/${encodeURIComponent(restaurantId)}/menu?${params.toString()}`, {
      headers: await getHeaders(),
    });
    data = await res.json();
  } catch {
    return { success: false, categories: [], error: "Couldn't load this menu right now." };
  }
  const restaurant = data.restaurant
    ? {
        id: data.restaurant.id,
        name: data.restaurant.name,
        rating: data.restaurant.rating,
        etaMin: data.restaurant.eta_min,
        cuisines: data.restaurant.cuisines,
        imageUrl: data.restaurant.image_url,
        costForTwo: data.restaurant.cost_for_two,
      }
    : null;
  const categories: MenuCategory[] = (data.categories || []).map((c: Record<string, unknown>) => ({
    title: c.title,
    items: ((c.items as Record<string, unknown>[]) || []).map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      imageUrl: i.image_url,
      isVeg: i.is_veg,
      rating: i.rating,
      description: i.description,
    })),
  }));
  return {
    success: !!data.success,
    restaurant,
    categories,
    addressId: data.address_id,
    error: data.error,
    addressRequired: !!data.address_required,
  };
}

export interface MenuSearchHit {
  id: string;
  name: string;
  price?: number | null;
  restaurantId: string;
  restaurantName?: string | null;
}

/** Live Swiggy dishes matching `query` near the address; only hits we can open a restaurant for. Never throws. */
export async function searchMenu(query: string, addressId: string): Promise<MenuSearchHit[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/menu-search`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ query, address_id: addressId }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success) return [];
    return ((data.items as Record<string, unknown>[]) || [])
      .filter((i) => i.id && i.restaurant_id)
      .map((i) => ({
        id: String(i.id),
        name: String(i.name),
        price: i.price as number | null,
        restaurantId: String(i.restaurant_id),
        restaurantName: i.restaurant_name as string | null,
      }));
  } catch {
    return [];
  }
}

export async function sendMenuChat(
  restaurantId: string,
  addressId: string,
  messages: MenuChatTurn[],
  dishContext?: { dishId?: string; dishName?: string; why?: string },
  userId?: string,
  preferences?: { diets: string[]; allergies: string[]; cuisines: string[] },
): Promise<MenuChatResult> {
  const res = await fetch(`${API_BASE_URL}/swiggy/menu-chat`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      restaurant_id: restaurantId,
      address_id: addressId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      dish_context: dishContext
        ? { dish_id: dishContext.dishId, dish_name: dishContext.dishName, why: dishContext.why }
        : undefined,
      user_id: userId,
      preferences,
    }),
  });
  const data = await res.json();
  return {
    success: !!data.success,
    reply: data.reply,
    suggestedItemIds: data.suggested_item_ids || [],
    error: data.error,
  };
}

export async function fetchCoupons(restaurantId: string, addressId: string): Promise<Coupon[]> {
  const params = new URLSearchParams({ restaurant_id: restaurantId, address_id: addressId });
  const res = await fetch(`${API_BASE_URL}/swiggy/coupons?${params.toString()}`, {
    headers: await getHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  if (!data.success) return [];
  return (data.coupons || []).map((c: Record<string, unknown>) => ({
    couponCode: c.coupon_code,
    discount: c.discount,
    description: c.description,
    applicabilityStatus: c.applicability_status,
    paymentMethod: c.payment_method,
    termsAndConditions: c.terms_and_conditions,
  }));
}

export async function applyCoupon(couponCode: string, addressId: string): Promise<CartState> {
  const res = await fetch(`${API_BASE_URL}/swiggy/coupons/apply`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ coupon_code: couponCode, address_id: addressId }),
  });
  const data = await res.json();
  if (!data.success) {
    return { success: false, items: [], availablePaymentMethods: [], paymentOptions: [], couponApplied: false, error: data.error };
  }
  return mapCart(data.cart || {});
}

export async function placeOrder(
  addressId: string,
  option: PaymentOption | undefined,
  confirmed: boolean,
): Promise<PlaceOrderResult> {
  const res = await fetch(`${API_BASE_URL}/swiggy/order`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      address_id: addressId,
      payment_method: option?.paymentMethod,
      intent_app: option?.kind === 'upi_app' ? option.intentApp : undefined,
      generate_upi_qr: option?.kind === 'upi_qr',
      confirmed,
    }),
  });
  const data = await res.json();
  const payment: UpiPayment | null =
    data.payment_pending && data.paas_id && data.order_id
      ? {
          orderId: data.order_id,
          paasId: data.paas_id,
          upiIntentUrl: data.upi_intent_url,
          bridgeUrl: data.bridge_url,
          isQrFlow: !!data.is_qr_flow,
          pollingIntervalMs: Math.max(2000, data.polling_interval_ms || 3000),
          maxPollMs: data.max_poll_ms || 5 * 60_000,
          addressId: data.address_id ?? addressId,
          cartId: data.cart_id,
          lat: data.lat,
          lng: data.lng,
        }
      : null;
  return {
    payment,
    success: !!data.success,
    orderId: data.order_id,
    status: data.status,
    estimatedDeliveryTime: data.estimated_delivery_time,
    message: data.message,
    error: data.error,
    addressRequired: !!data.address_required,
    capExceeded: !!data.cap_exceeded,
    capAmount: data.cap_amount,
  };
}

export type UpiOutcome =
  | { state: 'placed'; orderId: string }
  | { state: 'failed'; error: string }
  | { state: 'cancelled' };

async function postJson(path: string, body: unknown): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: await getHeaders(), body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return null; // network blip: callers retry on the next poll
  }
}

async function confirmUpiOrder(p: UpiPayment): Promise<UpiOutcome> {
  if (!p.addressId || p.lat == null || p.lng == null) {
    return { state: 'failed', error: "We couldn't confirm the order. Check the Swiggy app before trying again." };
  }
  const data = await postJson('/swiggy/order/confirm', { order_id: p.orderId, address_id: p.addressId, lat: p.lat, lng: p.lng, cart_id: p.cartId });
  if (data?.success && String(data.result).toLowerCase() === 'success') return { state: 'placed', orderId: data.order_id || p.orderId };
  return { state: 'failed', error: "Payment didn't go through, so the order wasn't placed. If money was debited, Swiggy refunds it." };
}

/**
 * Waits for a UPI payment: polls check_payment_status (Swiggy holds each call
 * ~19s while pending) at the returned interval until paid, failed or the
 * returned cap. Paid but not auto-confirmed → confirm_order; still pending at
 * the cap → confirm_order once, as Swiggy's flow requires. Never claims the
 * order is placed before Swiggy says so.
 */
export async function waitForUpiPayment(p: UpiPayment, isCancelled: () => boolean): Promise<UpiOutcome> {
  const deadline = Date.now() + p.maxPollMs;
  const body = { paas_id: p.paasId, order_id: p.orderId, address_id: p.addressId, cart_id: p.cartId, lat: p.lat, lng: p.lng };
  while (Date.now() < deadline) {
    if (isCancelled()) return { state: 'cancelled' };
    const s = await postJson('/swiggy/payment/status', body);
    if (s?.success && s.paid) return s.confirmed ? { state: 'placed', orderId: s.order_id || p.orderId } : confirmUpiOrder(p);
    if (s?.success && s.failed) {
      return { state: 'failed', error: s.status === 'cart_changed' ? 'Your cart changed during payment, so the order wasn\'t placed. Please review it.' : 'Payment failed or was cancelled. Try again or pick another way to pay.' };
    }
    await new Promise((r) => setTimeout(r, p.pollingIntervalMs));
  }
  return isCancelled() ? { state: 'cancelled' } : confirmUpiOrder(p);
}

export async function trackOrder(orderId: string): Promise<TrackOrderResult> {
  const res = await fetch(`${API_BASE_URL}/swiggy/track/${encodeURIComponent(orderId)}`, {
    headers: await getHeaders(),
  });
  const data = await res.json();
  return {
    success: !!data.success,
    orderId: data.order_id,
    status: data.status,
    eta: data.eta,
    progress: data.progress,
    error: data.error,
  };
}
