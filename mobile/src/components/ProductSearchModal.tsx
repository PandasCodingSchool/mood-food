import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, Image, ActivityIndicator } from 'react-native';
import { fw, colors } from '../constants/theme';
import { searchInstamartProducts, type InstamartProduct, type InstamartVariation } from '../services/instamart';

type Props = {
  visible: boolean;
  addressId: string | null;
  onClose: () => void;
  onAdd: (product: InstamartProduct, variation: InstamartVariation) => void;
};

interface ResultCard {
  key: string;
  product: InstamartProduct;
  variation: InstamartVariation;
}

const PAGE_SIZE = 8;

export default function ProductSearchModal({ visible, addressId, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultCard[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim() || !addressId) return;
    setLoading(true);
    setError(null);
    const result = await searchInstamartProducts(query.trim(), addressId);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Search failed.');
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

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setVisibleCount(PAGE_SIZE);
    setError(null);
    onClose();
  };

  const handlePick = (card: ResultCard) => {
    onAdd(card.product, card.variation);
    handleClose();
  };

  const visible_ = results.slice(0, visibleCount);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={handleClose}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
          <Text style={[fw(900), { fontSize: 17, color: colors.navy }]}>Add an item</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 12 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            placeholder="Search Instamart — coke, bread, eggs…"
            style={{ flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.04)', fontSize: 14 }}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity
            onPress={handleSearch}
            style={{ height: 46, paddingHorizontal: 18, borderRadius: 23, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={[fw(800), { color: '#fff', fontSize: 14 }]}>Search</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator color={colors.green} />
          </View>
        )}

        {error && !loading && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(220,38,38,0.06)' }}>
            <Text style={[fw(600), { fontSize: 12, color: '#dc2626' }]}>{error}</Text>
          </View>
        )}

        <FlatList
          data={visible_}
          keyExtractor={(item) => item.key}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 20 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (visibleCount < results.length) setVisibleCount((c) => Math.min(c + PAGE_SIZE, results.length));
          }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handlePick(item)}
              style={{ width: '48.5%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(22,163,74,0.15)' }}
            >
              <View style={{ height: 90, backgroundColor: 'rgba(22,163,74,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                {item.variation.imageUrl ? (
                  <Image source={{ uri: item.variation.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 32 }}>🛒</Text>
                )}
                <View
                  style={{
                    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 15, lineHeight: 16 }}>+</Text>
                </View>
              </View>
              <View style={{ padding: 10, gap: 3 }}>
                <Text style={[fw(800), { fontSize: 12.5, color: colors.navy }]} numberOfLines={2}>{item.product.name}</Text>
                <Text style={[fw(600), { fontSize: 10.5, color: '#94a3b8' }]} numberOfLines={1}>{item.variation.quantity || '1 unit'}</Text>
                {item.variation.price != null && (
                  <Text style={[fw(800), { fontSize: 13, color: colors.navy, marginTop: 2 }]}>₹{item.variation.price.toFixed(0)}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            visibleCount < results.length ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.green} />
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}
