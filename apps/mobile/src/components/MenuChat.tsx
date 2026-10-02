import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Send, Sparkles, Plus, Check, Mic, UtensilsCrossed } from 'lucide-react-native';
import { fw, colors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { sendMenuChat, type MenuChatTurn, type MenuItem } from '../services/swiggyOrder';
import { fetchCurrentUser } from '../services/auth';
import { fetchPreferences, type UserPreferences } from '../services/preferences';

interface DisplayMessage extends MenuChatTurn {
  suggestedItemIds?: string[];
}

interface MenuChatProps {
  restaurantId: string;
  addressId: string;
  dishContext?: { dishId?: string; dishName?: string; why?: string };
  getItem: (itemId: string) => MenuItem | undefined;
  onSuggestedItemAdd: (itemId: string) => void;
  onExploreMenu: () => void;
  /** Extra bottom space to keep the input row clear of the cart footer bar, which is
   * absolutely positioned over this screen and would otherwise cover it. */
  bottomInset?: number;
}

// AI "expert recommender" over a restaurant's live menu — stateless server
// side (see intelligence/app/services/menu_chat.py); we hold and resend the
// full turn history each message, the same convention as the OpenAI chat API.
// This is the default landing view when browsing a restaurant (see
// restaurant-menu.tsx) — the item list is a secondary "explore yourself"
// view reached via onExploreMenu, not the other way around.
export default function MenuChat({ restaurantId, addressId, dishContext, getItem, onSuggestedItemAdd, onExploreMenu, bottomInset = 0 }: MenuChatProps) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content: dishContext?.dishName
        ? `Hey! You were looking at ${dishContext.dishName} — want something similar, or feeling like exploring the rest of the menu?`
        : "Hey! Ask me anything about this menu — I'll help you pick.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  useEffect(() => {
    fetchPreferences().then(setPreferences).catch(() => setPreferences(null));
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setSending(true);

    const user = await fetchCurrentUser().catch(() => null);
    const result = await sendMenuChat(
      restaurantId,
      addressId,
      next.map((m) => ({ role: m.role, content: m.content })),
      dishContext,
      user?.id,
      preferences
        ? { diets: preferences.diets, allergies: preferences.allergies, cuisines: preferences.cuisines }
        : undefined,
    );
    setSending(false);

    if (result.success && result.reply) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply!, suggestedItemIds: result.suggestedItemIds },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, I couldn't answer that just now — try again?" },
      ]);
    }
  };

  const handleAdd = (itemId: string) => {
    onSuggestedItemAdd(itemId);
    setAddedIds((prev) => new Set(prev).add(itemId));
  };

  const exploreMenuButton = (
    <TouchableOpacity onPress={onExploreMenu} activeOpacity={0.8}>
      <View
        style={{
          height: 42, borderRadius: 21, backgroundColor: 'rgba(124,58,237,0.06)',
          borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.25)',
          alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
        }}
      >
        <UtensilsCrossed size={15} color={colors.purple} />
        <Text style={[fw(800), { fontSize: 13, color: colors.purple }]}>Explore the menu yourself</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, marginBottom: bottomInset }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[fw(900), { fontSize: 19, color: theme.text }]}>Captain</Text>
            <Text style={[fw(700), { fontSize: 12, color: colors.purple }]}>Your personal food expert</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 24, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m, i) => (
            <View key={i} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  maxWidth: '85%',
                  padding: 12,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  backgroundColor: m.role === 'user' ? colors.orange : 'rgba(124,58,237,0.08)',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                  borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                }}
              >
                <Text style={[fw(600), { fontSize: 14, color: m.role === 'user' ? '#fff' : theme.text, lineHeight: 20 }]}>
                  {m.content}
                </Text>
              </View>
              {m.suggestedItemIds && m.suggestedItemIds.length > 0 && (
                <View style={{ gap: 8, marginTop: 8, width: '85%' }}>
                  {m.suggestedItemIds.map((id) => {
                    const item = getItem(id);
                    if (!item) return null;
                    const added = addedIds.has(id);
                    return (
                      <View
                        key={id}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          padding: 8, borderRadius: 14, backgroundColor: theme.card,
                          borderWidth: 1, borderColor: theme.border,
                        }}
                      >
                        {item.imageUrl ? (
                          <Image source={{ uri: item.imageUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
                        ) : (
                          <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: 'rgba(249,115,22,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 20 }}>🍽️</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[fw(800), { fontSize: 13, color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                          {item.price != null && (
                            <Text style={[fw(700), { fontSize: 12, color: colors.orange, marginTop: 1 }]}>₹{item.price.toFixed(0)}</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          onPress={() => handleAdd(id)}
                          disabled={added}
                          style={{
                            width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: added ? 'rgba(34,197,94,0.12)' : colors.orange,
                          }}
                        >
                          {added ? <Check size={16} color={colors.green} /> : <Plus size={16} color="#fff" />}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
          {sending && (
            <View style={{ alignItems: 'flex-start' }}>
              <View style={{ padding: 12, borderRadius: 16, backgroundColor: 'rgba(124,58,237,0.08)' }}>
                <ActivityIndicator size="small" color={colors.purple} />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 16 }}>{exploreMenuButton}</View>

        <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: theme.border, alignItems: 'flex-end' }}>
          <TouchableOpacity
            onPress={() => Alert.alert('Voice input coming soon')}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}
          >
            <Mic size={18} color={theme.text} />
          </TouchableOpacity>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about the menu…"
            placeholderTextColor={theme.muted}
            multiline
            style={{ flex: 1, maxHeight: 100, padding: 12, borderRadius: 16, backgroundColor: theme.overlay, fontSize: 14, color: theme.text }}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || sending}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', opacity: !input.trim() || sending ? 0.5 : 1 }}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
