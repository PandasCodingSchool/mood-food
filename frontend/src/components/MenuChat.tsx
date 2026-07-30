import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Plus, Check, Loader2, Mic, UtensilsCrossed } from "lucide-react";
import { sendMenuChat, type MenuChatTurn, type MenuItem } from "../services/swiggyOrder";
import { fetchUser } from "../services/swiggy";

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
}

// AI "expert recommender" over a restaurant's live menu — stateless server
// side (intelligence/app/services/menu_chat.py); we hold and resend the full
// turn history each message, the same convention as the OpenAI chat API.
// This is the default landing view when browsing a restaurant (see
// RestaurantMenuModal.tsx) — the item list is a secondary "explore yourself"
// view reached via onExploreMenu, not the other way around.
function MenuChat({ restaurantId, addressId, dishContext, getItem, onSuggestedItemAdd, onExploreMenu }: MenuChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      content: dishContext?.dishName
        ? `Hey! You were looking at ${dishContext.dishName} — want something similar, or feeling like exploring the rest of the menu?`
        : "Hey! Ask me anything about this menu — I'll help you pick.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSending(true);

    const user = await fetchUser().catch(() => null);
    const result = await sendMenuChat(
      restaurantId,
      addressId,
      next.map((m) => ({ role: m.role, content: m.content })),
      dishContext,
      user?.id,
    );
    setSending(false);

    if (result.success && result.reply) {
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply!, suggestedItemIds: result.suggestedItemIds }]);
    } else {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't answer that just now — try again?" }]);
    }
  };

  const handleAdd = (itemId: string) => {
    onSuggestedItemAdd(itemId);
    setAddedIds((prev) => new Set(prev).add(itemId));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="font-black text-gray-900 text-sm">Captain</p>
          <p className="text-[11px] text-gray-400 font-semibold">Your personal food expert</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary-500 text-white rounded-br-md"
                    : "bg-purple-50 text-gray-900 rounded-bl-md"
                }`}
              >
                {m.content}
              </div>
              {m.suggestedItemIds && m.suggestedItemIds.length > 0 && (
                <div className="flex flex-col gap-2 mt-2 w-[85%]">
                  {m.suggestedItemIds.map((id) => {
                    const item = getItem(id);
                    if (!item) return null;
                    const added = addedIds.has(id);
                    return (
                      <div key={id} className="flex items-center gap-2.5 p-2 rounded-2xl bg-white border border-gray-100">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 text-xl">🍽️</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-extrabold text-sm text-gray-900 truncate">{item.name}</p>
                          {item.price != null && <p className="text-xs font-bold text-primary-600 mt-0.5">₹{item.price.toFixed(0)}</p>}
                        </div>
                        <button
                          onClick={() => handleAdd(id)}
                          disabled={added}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            added ? "bg-green-50" : "bg-primary-500"
                          }`}
                        >
                          {added ? <Check className="w-4 h-4 text-green-600" /> : <Plus className="w-4 h-4 text-white" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex items-start">
              <div className="px-3.5 py-2.5 rounded-2xl bg-purple-50">
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              </div>
            </div>
          )}
      </div>

      <div className="px-4">
        <button
          onClick={onExploreMenu}
          className="w-full h-[42px] rounded-full bg-purple-50/60 border-2 border-purple-100 text-purple-600 text-xs font-extrabold flex items-center justify-center gap-2"
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          Explore the menu yourself
        </button>
      </div>

      <div className="flex items-end gap-2.5 p-4 border-t border-gray-100">
        <button
          onClick={() => window.alert("Voice input coming soon")}
          className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center opacity-60 shrink-0"
        >
          <Mic className="w-4 h-4" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask about the menu…"
          rows={1}
          className="flex-1 max-h-24 px-3.5 py-2.5 rounded-2xl bg-gray-50 text-sm resize-none outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-11 h-11 rounded-full bg-primary-500 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default MenuChat;
