import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Image, ActivityIndicator, Animated, Easing } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Minus, Plus, Sparkles, ShoppingCart } from 'lucide-react-native';
import { fw, colors } from '../src/constants/theme';
import {
  getRestaurantMenu,
  updateCartItems,
  type MenuItem,
  type RestaurantMenu,
} from '../src/services/swiggyOrder';
import MenuChat from '../src/components/MenuChat';

const SYNC_DEBOUNCE_MS = 400;

export default function RestaurantMenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    restaurantId: string;
    addressId: string;
    restaurantName?: string;
    dishId?: string;
    dishName?: string;
    why?: string;
    initialMenuItemId?: string;
  }>();

  const [menu, setMenu] = useState<RestaurantMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [view, setView] = useState<'chat' | 'menu'>('chat');
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuReveal = useRef(new Animated.Value(0)).current;

  const handleExploreMenu = () => {
    setView('menu');
    menuReveal.setValue(0);
    Animated.timing(menuReveal, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    (async () => {
      const result = await getRestaurantMenu(params.restaurantId, params.addressId);
      setMenu(result);
      if (params.initialMenuItemId) {
        setCart({ [params.initialMenuItemId]: 1 });
      }
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
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const items = Object.entries(next)
          .filter(([, qty]) => qty > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (items.length === 0) return;
        void updateCartItems(params.restaurantId, params.addressId, items, params.restaurantName);
      }, SYNC_DEBOUNCE_MS);
    },
    [params.restaurantId, params.addressId, params.restaurantName],
  );

  const changeQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev, [itemId]: Math.max(0, (prev[itemId] || 0) + delta) };
      if (next[itemId] === 0) delete next[itemId];
      syncCart(next);
      return next;
    });
  };

  const addFromChat = (itemId: string) => {
    changeQty(itemId, 1);
  };

  const cartCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const price = allItems[id]?.price || 0;
    return sum + price * qty;
  }, 0);

  const handleViewCart = () => {
    router.push({
      pathname: '/order/confirm',
      params: {
        restaurantId: params.restaurantId,
        restaurantName: params.restaurantName || menu?.restaurant?.name || '',
        addressId: params.addressId,
      },
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.orange} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color={colors.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[fw(900), { fontSize: 18, color: colors.navy }]} numberOfLines={1}>
            {menu?.restaurant?.name || params.restaurantName || 'Menu'}
          </Text>
          {menu?.restaurant?.etaMin != null && (
            <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 1 }]}>{menu.restaurant.etaMin} min delivery</Text>
          )}
        </View>
        {view === 'menu' && (
          <TouchableOpacity
            onPress={() => setView('chat')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(124,58,237,0.1)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Sparkles size={20} color={colors.purple} />
          </TouchableOpacity>
        )}
      </View>

      {view === 'chat' ? (
        <MenuChat
          restaurantId={params.restaurantId}
          addressId={params.addressId}
          dishContext={{ dishId: params.dishId, dishName: params.dishName, why: params.why }}
          getItem={(id) => allItems[id]}
          onSuggestedItemAdd={addFromChat}
          onExploreMenu={handleExploreMenu}
          bottomInset={cartCount > 0 ? 128 : 0}
        />
      ) : !menu?.success ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[fw(700), { fontSize: 14, color: '#64748b', textAlign: 'center' }]}>
            {menu?.error || "Couldn't load this menu right now."}
          </Text>
        </View>
      ) : (
        <Animated.View
          style={{
            flex: 1,
            opacity: menuReveal,
            transform: [{ translateY: menuReveal.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140, gap: 24 }} showsVerticalScrollIndicator={false}>
            {menu.categories.map((cat) => (
              <View key={cat.title} style={{ gap: 12 }}>
                <Text style={[fw(800), { fontSize: 15, color: colors.navy }]}>{cat.title}</Text>
                {cat.items.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    quantity={cart[item.id] || 0}
                    onChange={(delta) => changeQty(item.id, delta)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {cartCount > 0 && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40, backgroundColor: '#fff' }}>
          <TouchableOpacity activeOpacity={0.85} onPress={handleViewCart}>
            <LinearGradient
              colors={['#f97316', '#fbbf24']}
              style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              <ShoppingCart size={18} color="#fff" />
              <Text style={[fw(900), { fontSize: 16, color: '#fff' }]}>
                View Cart · {cartCount} item{cartCount === 1 ? '' : 's'} · ₹{cartTotal.toFixed(0)}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function MenuItemRow({
  item,
  quantity,
  onChange,
}: {
  item: MenuItem;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.02)' }}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} resizeMode="cover" />
      ) : (
        <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: 'rgba(249,115,22,0.08)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>🍽️</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.isVeg != null && (
            <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, borderColor: item.isVeg ? colors.green : colors.rose, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.isVeg ? colors.green : colors.rose }} />
            </View>
          )}
          <Text style={[fw(800), { fontSize: 14, color: colors.navy, flex: 1 }]} numberOfLines={1}>{item.name}</Text>
        </View>
        {item.price != null && <Text style={[fw(700), { fontSize: 13, color: colors.orange, marginTop: 2 }]}>₹{item.price.toFixed(0)}</Text>}
        {item.description && (
          <Text style={[fw(400), { fontSize: 11, color: '#94a3b8', marginTop: 2 }]} numberOfLines={2}>{item.description}</Text>
        )}
      </View>
      {quantity === 0 ? (
        <TouchableOpacity
          onPress={() => onChange(1)}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.orange }}
        >
          <Text style={[fw(800), { fontSize: 12, color: '#fff' }]}>Add</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: colors.orange, paddingHorizontal: 4 }}>
          <TouchableOpacity onPress={() => onChange(-1)} style={{ padding: 6 }}>
            <Minus size={14} color={colors.orange} />
          </TouchableOpacity>
          <Text style={[fw(800), { fontSize: 13, color: colors.navy, minWidth: 16, textAlign: 'center' }]}>{quantity}</Text>
          <TouchableOpacity onPress={() => onChange(1)} style={{ padding: 6 }}>
            <Plus size={14} color={colors.orange} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
