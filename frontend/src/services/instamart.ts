import { getSessionHeaders } from "../utils/session";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function headers(): Record<string, string> {
  return { ...getSessionHeaders(), "Content-Type": "application/json" };
}

export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
  notes?: string | null;
}

export interface InstamartVariation {
  spinId: string;
  skuId?: string | null;
  quantity?: string | null;
  price?: number | null;
  stock?: boolean | null;
  imageUrl?: string | null;
}

export interface InstamartProduct {
  name: string;
  brand?: string | null;
  availability: boolean;
  variations: InstamartVariation[];
}

export interface MatchedIngredient {
  ingredient: Ingredient;
  matched: boolean;
  confidence: number;
  product?: InstamartProduct | null;
  variation?: InstamartVariation | null;
}

export interface InstamartCartLine {
  spinId: string;
  name?: string | null;
  price?: number | null;
  quantity: number;
}

export interface InstamartCartState {
  success: boolean;
  items: InstamartCartLine[];
  subtotal?: number | null;
  total?: number | null;
  availablePaymentMethods: string[];
  error?: string;
  addressRequired?: boolean;
  belowMinimum?: boolean;
  minimumAmount: number;
}

export interface InstamartCheckoutResult {
  success: boolean;
  orderId?: string | null;
  paasId?: string | null;
  status?: string | null;
  pendingPayment: boolean;
  message?: string | null;
  error?: string;
  capExceeded?: boolean;
  capAmount?: number;
  belowMinimum?: boolean;
  minimumAmount?: number;
}

function mapVariation(v: Record<string, unknown> | undefined): InstamartVariation | null {
  if (!v) return null;
  return {
    spinId: v.spin_id as string,
    skuId: v.sku_id as string | null,
    quantity: v.quantity as string | null,
    price: v.price as number | null,
    stock: v.stock as boolean | null,
    imageUrl: v.image_url as string | null,
  };
}

function mapProduct(p: Record<string, unknown>): InstamartProduct {
  return {
    name: p.name as string,
    brand: p.brand as string | null,
    availability: !!p.availability,
    variations: ((p.variations as Record<string, unknown>[]) || [])
      .map(mapVariation)
      .filter((v): v is InstamartVariation => v !== null),
  };
}

export async function searchInstamartProducts(
  query: string,
  addressId: string,
): Promise<{ success: boolean; products: InstamartProduct[]; error?: string }> {
  const params = new URLSearchParams({ query, address_id: addressId });
  const res = await fetch(`${API_BASE_URL}/instamart/search-products?${params.toString()}`, { headers: headers() });
  const data = await res.json();
  return {
    success: !!data.success,
    products: ((data.products as Record<string, unknown>[]) || []).map(mapProduct),
    error: data.error,
  };
}

function mapMatch(m: Record<string, unknown>): MatchedIngredient {
  return {
    ingredient: m.ingredient as Ingredient,
    matched: !!m.matched,
    confidence: (m.confidence as number) ?? 0,
    product: m.product ? mapProduct(m.product as Record<string, unknown>) : null,
    variation: mapVariation(m.variation as Record<string, unknown> | undefined),
  };
}

export async function matchIngredients(
  items: Ingredient[],
  addressId: string,
): Promise<{ success: boolean; matches: MatchedIngredient[]; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/instamart/match-ingredients`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ items, address_id: addressId }),
  });
  const data = await res.json();
  return {
    success: !!data.success,
    matches: ((data.matches as Record<string, unknown>[]) || []).map(mapMatch),
    error: data.error,
  };
}

function mapCart(data: Record<string, unknown>): InstamartCartState {
  return {
    success: !!data.success,
    items: (data.items as InstamartCartLine[]) || [],
    subtotal: data.subtotal as number | null,
    total: data.total as number | null,
    availablePaymentMethods: (data.available_payment_methods as string[]) || [],
    error: data.error as string | undefined,
    addressRequired: !!data.address_required,
    belowMinimum: !!data.below_minimum,
    minimumAmount: (data.minimum_amount as number) ?? 99,
  };
}

export async function getInstamartCart(addressId: string): Promise<InstamartCartState> {
  const res = await fetch(`${API_BASE_URL}/instamart/cart?address_id=${encodeURIComponent(addressId)}`, {
    headers: headers(),
  });
  return mapCart(await res.json());
}

/** Always sends the full desired cart state — update_cart replaces, not appends. */
export async function updateInstamartCart(
  addressId: string,
  items: { spinId: string; skuId?: string | null; quantity: number }[],
): Promise<InstamartCartState> {
  const res = await fetch(`${API_BASE_URL}/instamart/cart`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      address_id: addressId,
      items: items.map((i) => ({ spin_id: i.spinId, sku_id: i.skuId, quantity: i.quantity })),
    }),
  });
  return mapCart(await res.json());
}

export async function checkoutInstamart(
  addressId: string,
  paymentMethod: string | undefined,
  confirmed: boolean,
): Promise<InstamartCheckoutResult> {
  const res = await fetch(`${API_BASE_URL}/instamart/checkout`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ address_id: addressId, payment_method: paymentMethod, confirmed }),
  });
  const data = await res.json();
  return {
    success: !!data.success,
    orderId: data.order_id,
    paasId: data.paas_id,
    status: data.status,
    pendingPayment: !!data.pending_payment,
    message: data.message,
    error: data.error,
    capExceeded: !!data.cap_exceeded,
    capAmount: data.cap_amount,
    belowMinimum: !!data.below_minimum,
    minimumAmount: data.minimum_amount,
  };
}
