import { getSessionHeaders } from "../utils/session";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function headers(): Record<string, string> {
  return { ...getSessionHeaders(), "Content-Type": "application/json" };
}

export interface CartLine {
  id: string;
  name: string;
  price?: number | null;
  quantity: number;
}

export interface CartState {
  success: boolean;
  items: CartLine[];
  subtotal?: number | null;
  deliveryCharges?: number | null;
  total?: number | null;
  availablePaymentMethods: string[];
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
}

export interface TrackOrderResult {
  success: boolean;
  orderId?: string | null;
  status?: string | null;
  eta?: string | null;
  progress?: string | null;
  error?: string;
}

function mapCart(data: Record<string, unknown>): CartState {
  return {
    success: !!data.success,
    items: (data.items as CartLine[]) || [],
    subtotal: data.subtotal as number | null,
    deliveryCharges: data.delivery_charges as number | null,
    total: data.total as number | null,
    availablePaymentMethods: (data.available_payment_methods as string[]) || [],
    couponApplied: !!data.coupon_applied,
    couponDiscount: data.coupon_discount as number | null,
    error: data.error as string | undefined,
    addressRequired: !!data.address_required,
  };
}

export async function getCart(addressId: string, restaurantName?: string): Promise<CartState> {
  const params = new URLSearchParams({ address_id: addressId });
  if (restaurantName) params.set("restaurant_name", restaurantName);
  const res = await fetch(`${API_BASE_URL}/swiggy/cart?${params.toString()}`, { headers: headers() });
  const data = await res.json();
  return mapCart(data);
}

export async function updateCart(
  restaurantId: string,
  addressId: string,
  menuItemId: string,
  quantity = 1,
  restaurantName?: string,
): Promise<CartState> {
  const res = await fetch(`${API_BASE_URL}/swiggy/cart`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      restaurant_id: restaurantId,
      restaurant_name: restaurantName,
      address_id: addressId,
      items: [{ menu_item_id: menuItemId, quantity }],
    }),
  });
  const data = await res.json();
  return mapCart(data);
}

export async function fetchCoupons(restaurantId: string, addressId: string): Promise<Coupon[]> {
  const params = new URLSearchParams({ restaurant_id: restaurantId, address_id: addressId });
  const res = await fetch(`${API_BASE_URL}/swiggy/coupons?${params.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const data = await res.json();
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
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ coupon_code: couponCode, address_id: addressId }),
  });
  const data = await res.json();
  if (!data.success) {
    return { success: false, items: [], availablePaymentMethods: [], couponApplied: false, error: data.error };
  }
  return mapCart(data.cart || {});
}

export async function placeOrder(
  addressId: string,
  paymentMethod: string | undefined,
  confirmed: boolean,
): Promise<PlaceOrderResult> {
  const res = await fetch(`${API_BASE_URL}/swiggy/order`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ address_id: addressId, payment_method: paymentMethod, confirmed }),
  });
  const data = await res.json();
  return {
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

export async function trackOrder(orderId: string): Promise<TrackOrderResult> {
  const res = await fetch(`${API_BASE_URL}/swiggy/track/${encodeURIComponent(orderId)}`, { headers: headers() });
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
