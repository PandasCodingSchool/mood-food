import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Chip, Icon, Screen, SegmentedControl, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  buildCart, getLatestCart, listDeliveryAddresses, placeInstamartOrder, setDeliveryAddress, writeInstamartCart,
  type CartCapabilities, type CartLineView, type CartProposal,
} from '../../src/features/kitchen-circle/api';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const rupees = (value: number | null | undefined) => value == null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const statusLabel: Record<CartProposal['status'], string> = {
  preview: 'Preview', superseded: 'Replaced', cart_written: 'In your Instamart cart', payment_pending: 'Payment pending', ordered: 'Ordered', failed: 'Failed',
};

/** Pack-optimized cart for a grocery list. Members review; only the owner sends it to Instamart and orders. */
export default function KitchenCircleCartScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { listId, householdId } = useLocalSearchParams<{ listId: string; householdId: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const [cart, setCart] = useState<CartProposal | null>(null);
  const [caps, setCaps] = useState<CartCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scope, setScope] = useState<'buy_now' | 'all'>('buy_now');
  const [open, setOpen] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Array<{ id: string; label: string; tag?: string | null }> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [payment, setPayment] = useState<'COD' | 'SwiggyPay'>('COD');
  const [acknowledged, setAcknowledged] = useState(false);

  const load = useCallback(async () => {
    if (!listId) return;
    setLoading(true); setError(null);
    try { const res = await getLatestCart(listId); setCart(res.cart); setCaps(res.capabilities); if (res.cart) setScope(res.cart.scope); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the cart'); }
    finally { setLoading(false); }
  }, [listId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setNotice(null);
    try { await action(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Something went wrong'); }
    finally { setBusy(null); }
  };

  const build = () => run('build', async () => { const res = await buildCart(listId, scope); setCart(res.cart); setCaps(res.capabilities); setConfirming(false); });
  const owner = caps?.role === 'owner';
  const live = cart?.provider === 'instamart';
  const writtenTotal = cart?.cart?.total ?? null;

  const line = (item: CartLineView) => {
    const matched = item.status === 'matched' && item.product;
    return <Surface key={item.line_id} radius={16} style={{ padding: 14, gap: 6 }}>
      <Pressable onPress={() => setOpen(open === item.line_id ? null : item.line_id)} accessibilityRole="button" accessibilityLabel={`${item.name}, needs ${item.required}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong15" style={{ textTransform: 'capitalize' }}>{item.name}</Text>
          <Text variant="caption13" tone="ink2">{matched ? `${item.product!.packs.map((p) => `${p.count} × ${p.label}`).join(' + ')} · ${item.product!.brand ?? item.product!.name}` : item.status === 'unmatched' ? 'No product match' : item.status === 'out_of_stock' ? 'Out of stock' : 'Pack size needs a manual pick'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text variant="bodyStrong15">{matched ? rupees(item.product!.cost) : '—'}</Text>
          {matched ? <Text variant="caption13" tone="ink2">need {item.required}</Text> : <Chip label="Check" size="sm" variant="soft" />}
        </View>
      </Pressable>
      {item.approximate ? <Text variant="caption13" tone="accText">Compared using typical weights — check this one.</Text> : null}
      {open === item.line_id ? <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
        <Text variant="caption13">{item.explanation}</Text>
        {matched ? <Text variant="caption13" tone="ink2">Buying {item.product!.purchased} · extra {item.product!.surplus}</Text> : null}
        {item.alternatives.map((alt) => <Text key={alt.name} variant="caption13" tone="ink2">Other option: {alt.brand ?? ''} {alt.name} — {alt.packs.map((p) => `${p.count} × ${p.label}`).join(' + ')} · {rupees(alt.cost)}</Text>)}
      </View> : null}
    </Surface>;
  };

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} title="Cart" subtitle={cart ? statusLabel[cart.status] : 'Pack-optimized from your list'} />
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 12, paddingBottom: 48 }}>
      {loading ? <KcLoader label="Loading cart" /> : error ? <ErrorBlock message={error} onRetry={load} /> : <>
        {notice ? <Surface radius={16} style={{ padding: 14, flexDirection: 'row', gap: 10 }}><Icon name="info" size={18} tone="accText" /><Text variant="caption13" style={{ flex: 1 }}>{notice}</Text></Surface> : null}

        <Surface radius={20} style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip label={live ? 'Instamart · live prices' : 'Sample prices'} size="sm" variant={live ? 'accent' : 'glass'} icon={live ? 'storefront' : 'info'} />
            {caps?.address ? <Chip label={caps.address.label} size="sm" variant="glass" icon="location_on" /> : null}
          </View>
          <SegmentedControl options={[{ value: 'buy_now', label: 'Buy now' }, { value: 'all', label: 'Whole list' }]} value={scope} onChange={setScope} />
          <Button label={cart ? 'Rebuild cart' : 'Build cart'} variant={cart ? 'glass' : 'primary'} iconLeft="shopping_bag" block loading={busy === 'build'} onPress={() => void build()} />
          {!caps?.liveGrocery ? <Text variant="caption13" tone="ink2">Live Instamart matching isn’t switched on yet, so this uses a sample catalogue to show the packs and the cost.</Text>
            : !caps.ownerLinked ? (owner
              ? <Button label="Connect Swiggy for live products" size="sm" variant="glass" iconLeft="link" onPress={() => router.push({ pathname: '/kitchen-circle/swiggy', params: { householdId } } as never)} />
              : <Text variant="caption13" tone="ink2">The household owner needs to connect Swiggy for live Instamart products.</Text>)
              : !caps.address ? <Text variant="caption13" tone="ink2">The owner needs to choose a delivery address for live products.</Text> : null}
        </Surface>

        {owner && caps?.liveGrocery && caps.ownerLinked ? <Surface radius={18} style={{ padding: 14, gap: 8 }}>
          <Text variant="bodyStrong15">Delivery address</Text>
          <Text variant="caption13" tone="ink2">{caps.address ? caps.address.label : 'Not set'}</Text>
          {addresses ? addresses.map((a) => <Button key={a.id} label={`${a.tag ? `${a.tag} · ` : ''}${a.label}`} size="sm" variant={caps.address?.id === a.id ? 'primary' : 'glass'} block
            onPress={() => void run('address', async () => { await setDeliveryAddress(householdId, a.id, a.label); setAddresses(null); await load(); })} />)
            : <Button label={caps.address ? 'Change address' : 'Choose address'} size="sm" variant="glass" loading={busy === 'addresses'} onPress={() => void run('addresses', async () => setAddresses(await listDeliveryAddresses(householdId)))} />}
        </Surface> : null}

        {cart ? <>
          <Surface radius={20} style={{ padding: 16, gap: 6 }}>
            <Text variant="display26">{rupees(writtenTotal ?? cart.totals.estimated_cost)}</Text>
            <Text variant="caption13" tone="ink2">{writtenTotal != null ? 'Instamart cart total' : 'Estimated from pack prices'} · {cart.totals.matched} matched{cart.totals.unmatched ? ` · ${cart.totals.unmatched} need a manual pick` : ''}</Text>
            {cart.warnings.map((w) => <Text key={w} variant="caption13" tone="accText">• {w}</Text>)}
            {cart.cart?.removed_out_of_stock?.length ? <Text variant="caption13" tone="accText">Instamart removed (out of stock): {cart.cart.removed_out_of_stock.join(', ')}</Text> : null}
            {cart.cart?.reduced_quantity?.length ? <Text variant="caption13" tone="accText">Instamart reduced: {cart.cart.reduced_quantity.map((r) => `${r.item} to ${r.capped}`).join(', ')}</Text> : null}
            {cart.order?.order_id ? <Text variant="bodyStrong15">{cart.order.message ?? 'Order placed'} · #{cart.order.order_id}</Text> : null}
          </Surface>

          {cart.lines.filter((l) => l.status !== 'matched').length ? <Text variant="label" tone="ink2">NEEDS A LOOK</Text> : null}
          {cart.lines.filter((l) => l.status !== 'matched').map(line)}
          <Text variant="label" tone="ink2">IN THE CART</Text>
          {cart.lines.filter((l) => l.status === 'matched').map(line)}

          {!owner ? <Text variant="caption13" tone="ink2">Only the household owner can send this to Instamart and place the order.</Text>
            : !caps?.liveWrites ? <Text variant="caption13" tone="ink2">Sending carts to Instamart is switched off for now. Nothing has been ordered.</Text>
              : !live ? <Text variant="caption13" tone="ink2">Build a live cart (with a delivery address) before sending it to Instamart.</Text>
                : <View style={{ gap: 8 }}>
                  {cart.status === 'preview' || cart.status === 'cart_written' ? <Button label={cart.status === 'cart_written' ? 'Update my Instamart cart' : 'Send to my Instamart cart'} variant="glass" iconLeft="shopping_bag" block
                    loading={busy === 'write'} onPress={() => void run('write', async () => { setCart(await writeInstamartCart(cart.id)); setConfirming(false); setAcknowledged(false); })} /> : null}
                  {cart.status === 'cart_written' && writtenTotal != null ? (confirming ? <Surface radius={18} style={{ padding: 14, gap: 10, borderWidth: 1, borderColor: colors.acc }}>
                    <Text variant="bodyStrong16">Place this order?</Text>
                    <Text variant="caption13">Total {rupees(writtenTotal)} · delivered to {caps?.address?.label}</Text>
                    <SegmentedControl options={[{ value: 'COD', label: 'Pay on delivery' }, { value: 'SwiggyPay', label: 'Swiggy Money' }]} value={payment} onChange={setPayment} />
                    <Pressable onPress={() => setAcknowledged(!acknowledged)} accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged }} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Icon name={acknowledged ? 'check_circle' : 'add'} size={18} tone={acknowledged ? 'accText' : 'ink2'} />
                      <Text variant="caption13" style={{ flex: 1 }}>I’ve checked the items and total. This places a real Instamart order.</Text>
                    </Pressable>
                    <Button label={`Place order · ${rupees(writtenTotal)}`} block disabled={!acknowledged} loading={busy === 'checkout'}
                      onPress={() => void run('checkout', async () => { setCart(await placeInstamartOrder(cart.id, writtenTotal, payment)); setConfirming(false); })} />
                    <Button label="Not now" variant="ghost" onPress={() => setConfirming(false)} />
                  </Surface> : <Button label="Review and place order" iconLeft="lock" block onPress={() => setConfirming(true)} />) : null}
                </View>}
        </> : null}
      </>}
    </ScrollView></Screen></View>;
}
