import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../../src/constants/theme';
import { getSavedAddressId, saveAddressId, fetchAddresses, type SwiggyAddress } from '../../src/services/aiRecommendations';
import {
  matchIngredients,
  updateInstamartCart,
  checkoutInstamart,
  type MatchedIngredient,
  type InstamartProduct,
  type InstamartVariation,
} from '../../src/services/instamart';
import { createDiySession, updateDiySession, type Recipe } from '../../src/services/diy';
import ProductSearchModal from '../../src/components/ProductSearchModal';

export default function DiyCartScreen() {
  const router = useRouter();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const params = useLocalSearchParams<{ recipe: string; rank?: string }>();
  const recipe: Recipe = JSON.parse(params.recipe);

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchedIngredient[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<SwiggyAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [manualItems, setManualItems] = useState<MatchedIngredient[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const list = await fetchAddresses();
    setAddresses(list);
    let addrId = await getSavedAddressId();
    if (!addrId && list.length > 0) {
      addrId = list[0].id;
      await saveAddressId(addrId);
    }
    if (!addrId) {
      setError('Link a Swiggy address to build your ingredient cart.');
      setLoading(false);
      return;
    }
    setAddressId(addrId);

    const result = await matchIngredients(recipe.items, addrId);
    if (!result.success) {
      setError(result.error || 'Could not search Instamart for these ingredients.');
      setLoading(false);
      return;
    }
    setMatches(result.matches);

    const session = await createDiySession(recipe.dish, recipe, result.matches, result.matches);
    if (session.success && session.id) setSessionId(session.id);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recipeActiveMatches = matches.filter((m) => m.matched && m.variation && !removed.has(m.ingredient.name));
  const activeMatches = [...recipeActiveMatches, ...manualItems];
  const unmatched = matches.filter((m) => !m.matched);
  const total = activeMatches.reduce((sum, m) => sum + (m.variation?.price ?? 0), 0);
  const hasItems = activeMatches.length > 0;

  const toggleRemoved = (name: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAddManual = (product: InstamartProduct, variation: InstamartVariation) => {
    setManualItems((prev) => [
      ...prev,
      {
        ingredient: { name: product.name, quantity: '1', unit: variation.quantity || 'item' },
        matched: true,
        confidence: 100,
        product,
        variation,
      },
    ]);
  };

  const removeManualItem = (spinId: string) => {
    setManualItems((prev) => prev.filter((m) => m.variation?.spinId !== spinId));
  };

  const goToCook = async (status: 'checked_out' | 'cooking', orderId?: string) => {
    if (sessionId) {
      await updateDiySession(sessionId, {
        ingredientCart: activeMatches,
        status,
        ...(orderId ? { instamartOrderId: orderId } : {}),
      });
    }
    router.replace({
      pathname: '/diy/cook',
      params: { recipe: params.recipe, sessionId: sessionId || '' },
    });
  };

  const handleCheckout = async () => {
    if (!addressId || !hasItems) return;
    setCheckingOut(true);
    setError(null);
    const items = activeMatches.map((m) => ({ spinId: m.variation!.spinId, skuId: m.variation!.skuId, quantity: 1 }));
    const cart = await updateInstamartCart(addressId, items);
    if (!cart.success) {
      setError(cart.error || 'Could not build the Instamart cart.');
      setCheckingOut(false);
      return;
    }
    const result = await checkoutInstamart(addressId, undefined, true);
    setCheckingOut(false);
    if (!result.success) {
      setError(result.error || 'Checkout failed. Please try again.');
      return;
    }
    await goToCook('checked_out', result.orderId || undefined);
  };

  const handleLetsCook = async () => {
    await goToCook('cooking');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: safeTop + 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: colors.navy, flex: 1, textAlign: 'center', marginRight: 40 }]}>
          Ingredients — {recipe.dish}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.green} />
          <Text style={[fw(700), { fontSize: 13, color: '#64748b', marginTop: 12 }]}>Matching ingredients on Instamart…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 160 + safeBottom, gap: 12 }} showsVerticalScrollIndicator={false}>
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(249,115,22,0.06)' }}>
            <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>
              🍽️ This recipe makes {recipe.servings} serving{recipe.servings === 1 ? '' : 's'} — the quantities below are sized for that many people.
            </Text>
          </View>

          <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(22,163,74,0.06)' }}>
            <Text style={[fw(600), { fontSize: 12, color: colors.green }]}>
              💡 Already have some of these at home? Remove them below — if the cart ends up empty, you'll skip straight to cooking.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            {matches.filter((m) => m.matched && m.variation).map((m) => {
              const isRemoved = removed.has(m.ingredient.name);
              return (
                <View
                  key={m.ingredient.name}
                  style={{
                    width: '48.5%', borderRadius: 16, overflow: 'hidden',
                    backgroundColor: isRemoved ? 'rgba(0,0,0,0.02)' : '#fff',
                    borderWidth: 1.5, borderColor: isRemoved ? 'rgba(0,0,0,0.06)' : 'rgba(22,163,74,0.15)',
                    opacity: isRemoved ? 0.5 : 1,
                  }}
                >
                  <View style={{ height: 90, backgroundColor: 'rgba(22,163,74,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                    {m.variation?.imageUrl ? (
                      <Image source={{ uri: m.variation.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 32 }}>🛒</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => toggleRemoved(m.ingredient.name)}
                      style={{
                        position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isRemoved ? colors.green : 'rgba(255,255,255,0.92)',
                      }}
                    >
                      <Text style={{ fontSize: 13, color: isRemoved ? '#fff' : '#dc2626' }}>{isRemoved ? '↺' : '✕'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ padding: 10, gap: 3 }}>
                    <Text style={[fw(800), { fontSize: 12.5, color: colors.navy }]} numberOfLines={2}>{m.product?.name}</Text>
                    <Text style={[fw(600), { fontSize: 10.5, color: '#94a3b8' }]} numberOfLines={1}>
                      for {m.ingredient.quantity} {m.ingredient.unit} {m.ingredient.name}
                    </Text>
                    {m.variation?.price != null && (
                      <Text style={[fw(800), { fontSize: 13, color: colors.navy, marginTop: 2 }]}>₹{m.variation.price.toFixed(0)}</Text>
                    )}
                  </View>
                </View>
              );
            })}

            {manualItems.map((m) => (
              <View
                key={m.variation!.spinId}
                style={{ width: '48.5%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(249,115,22,0.2)' }}
              >
                <View style={{ height: 90, backgroundColor: 'rgba(249,115,22,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                  {m.variation?.imageUrl ? (
                    <Image source={{ uri: m.variation.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 32 }}>🛒</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => removeManualItem(m.variation!.spinId)}
                    style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' }}
                  >
                    <Text style={{ fontSize: 13, color: '#dc2626' }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 10, gap: 3 }}>
                  <Text style={[fw(800), { fontSize: 12.5, color: colors.navy }]} numberOfLines={2}>{m.product?.name}</Text>
                  <Text style={[fw(600), { fontSize: 10.5, color: colors.orange }]} numberOfLines={1}>Added by you</Text>
                  {m.variation?.price != null && (
                    <Text style={[fw(800), { fontSize: 13, color: colors.navy, marginTop: 2 }]}>₹{m.variation.price.toFixed(0)}</Text>
                  )}
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setSearchOpen(true)}
              disabled={!addressId}
              style={{
                width: '48.5%', height: 148, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.15)',
                alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>+</Text>
              </View>
              <Text style={[fw(700), { fontSize: 12, color: '#64748b' }]}>Add an item</Text>
            </TouchableOpacity>
          </View>

          {unmatched.length > 0 && (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(249,115,22,0.06)', gap: 4 }}>
              <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>
                Couldn't find a confident match for: {unmatched.map((m) => m.ingredient.name).join(', ')}
              </Text>
              <Text style={[fw(600), { fontSize: 11, color: '#94a3b8' }]}>You may need to pick these up separately.</Text>
            </View>
          )}

          {error && (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(220,38,38,0.06)' }}>
              <Text style={[fw(600), { fontSize: 12, color: '#dc2626' }]}>{error}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {!loading && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 24 + safeBottom, backgroundColor: '#fff', gap: 12 }}>
          {hasItems && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[fw(700), { fontSize: 14, color: '#64748b' }]}>Total</Text>
              <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>₹{total.toFixed(0)}</Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={checkingOut}
            onPress={hasItems ? handleCheckout : handleLetsCook}
          >
            <LinearGradient
              colors={hasItems ? ['#f97316', '#fbbf24'] : ['#16a34a', '#4ade80']}
              style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', opacity: checkingOut ? 0.7 : 1 }}
            >
              <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>
                {checkingOut ? 'Placing order…' : hasItems ? `🛒 Checkout · ₹${total.toFixed(0)}` : "👨‍🍳 Let's cook"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <ProductSearchModal
        visible={searchOpen}
        addressId={addressId}
        onClose={() => setSearchOpen(false)}
        onAdd={handleAddManual}
      />
    </View>
  );
}
