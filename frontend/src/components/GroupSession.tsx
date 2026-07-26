import { useState, useEffect, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import {
  createGroup,
  joinGroup,
  fetchGroup,
  submitGroupSwipes,
  fetchConsensus,
  type GroupMember,
  type ConsensusOption,
} from "../services/groups";
import { trackEvent } from "../utils/analytics";

interface GroupSessionProps {
  onBack: () => void;
}

const SWIPE_CARDS = [
  { emoji: "🍕", name: "Pepperoni Pizza" },
  { emoji: "🥗", name: "Poke Bowl" },
  { emoji: "🌯", name: "Loaded Burrito" },
  { emoji: "🍣", name: "Sushi Platter" },
  { emoji: "🍔", name: "Smash Burger" },
  { emoji: "🍜", name: "Pad Thai" },
];

type Stage = "landing" | "lobby" | "swipe" | "results";

// 3.6 — Group / social decision games. Poll-based lobby; maximin consensus
// so nobody is miserable.
function GroupSession({ onBack }: GroupSessionProps) {
  const [stage, setStage] = useState<Stage>("landing");
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memberKey, setMemberKey] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [swipeIdx, setSwipeIdx] = useState(0);
  const [swipes, setSwipes] = useState<Array<{ item: string; liked: boolean }>>([]);
  const [options, setOptions] = useState<ConsensusOption[]>([]);

  const pollLobby = useCallback(async () => {
    if (!code) return;
    const group = await fetchGroup(code);
    if (group) setMembers(group.members);
  }, [code]);

  useEffect(() => {
    if (stage !== "lobby") return;
    pollLobby();
    const id = setInterval(pollLobby, 3000);
    return () => clearInterval(id);
  }, [stage, pollLobby]);

  const handleCreate = async () => {
    const newCode = await createGroup();
    if (!newCode) return;
    setCode(newCode);
    const key = await joinGroup(newCode, displayName || "Host");
    setMemberKey(key);
    trackEvent("group_created", { code: newCode });
    setStage("lobby");
  };

  const handleJoin = async () => {
    const upper = joinCode.trim().toUpperCase();
    if (!upper) return;
    const key = await joinGroup(upper, displayName || "Guest");
    if (!key) return;
    setCode(upper);
    setMemberKey(key);
    trackEvent("group_joined", { code: upper });
    setStage("lobby");
  };

  const handleSwipe = (liked: boolean) => {
    const card = SWIPE_CARDS[swipeIdx];
    const next = [...swipes, { item: card.name, liked }];
    setSwipes(next);
    if (swipeIdx + 1 >= SWIPE_CARDS.length) {
      if (memberKey) submitGroupSwipes(code, memberKey, next);
      setStage("lobby");
    } else {
      setSwipeIdx((i) => i + 1);
    }
  };

  const handleGetConsensus = async () => {
    const opts = await fetchConsensus(code);
    setOptions(opts);
    setStage("results");
  };

  const backButton = (
    <button
      onClick={onBack}
      className="inline-flex items-center text-gray-500 hover:text-gray-700 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm mb-8"
    >
      <ChevronLeft className="w-4 h-4" />
    </button>
  );

  if (stage === "landing") {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-purple-50">
        <div className="max-w-md mx-auto">
          {backButton}
          <div className="text-4xl mb-2">👯</div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900">Group decide</h2>
          <p className="text-gray-500 mt-1 mb-6">Everyone swipes, we find what nobody's miserable about.</p>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-100 text-sm mb-3"
          />
          <button
            onClick={handleCreate}
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 text-white font-black shadow-lg hover:scale-[1.02] transition-transform"
          >
            Start a group
          </button>
          <div className="flex gap-2 mt-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter code"
              className="flex-1 px-4 py-3 rounded-xl bg-white border-2 border-gray-100 text-sm uppercase"
            />
            <button onClick={handleJoin} className="px-6 rounded-xl bg-gray-900 text-white font-bold">
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "lobby") {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-purple-50">
        <div className="max-w-md mx-auto text-center">
          <p className="text-sm font-bold text-gray-400">Room code</p>
          <p className="text-4xl font-black tracking-widest text-gray-900">{code}</p>
          <p className="text-xs text-gray-400 mt-1 mb-6">Share this code with your group</p>
          <div className="flex flex-col gap-2 text-left mb-6">
            {members.map((m) => (
              <div key={m.memberKey} className="flex justify-between p-3 rounded-xl bg-white">
                <span className="font-bold text-sm text-gray-900">{m.displayName}</span>
                <span className="text-xs text-gray-400">{m.swipeCount > 0 ? "✅ swiped" : "⏳ waiting"}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setStage("swipe")}
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-400 text-white font-black mb-3"
          >
            👆 Swipe your picks
          </button>
          <button
            onClick={handleGetConsensus}
            className="w-full py-3.5 rounded-full border-2 border-gray-900 text-gray-900 font-extrabold"
          >
            🎯 Get group consensus
          </button>
        </div>
      </div>
    );
  }

  if (stage === "swipe") {
    const card = SWIPE_CARDS[swipeIdx];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-rose-500 to-pink-400 text-white px-4">
        <div className="text-8xl">{card.emoji}</div>
        <p className="text-2xl font-black mt-4">{card.name}</p>
        <p className="text-sm opacity-80 mt-1">{swipeIdx + 1}/{SWIPE_CARDS.length}</p>
        <div className="flex gap-6 mt-10">
          <button onClick={() => handleSwipe(false)} className="w-16 h-16 rounded-full bg-white/90 text-2xl">✕</button>
          <button onClick={() => handleSwipe(true)} className="w-16 h-16 rounded-full bg-white/90 text-2xl">♥</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <div className="max-w-md mx-auto">
        {backButton}
        <h2 className="text-2xl font-black text-gray-900 mb-6">Group picks 🎯</h2>
        {options.length === 0 && (
          <p className="text-gray-400 text-sm">Not enough swipes yet to find consensus.</p>
        )}
        <div className="flex flex-col gap-3">
          {options.map((opt) => (
            <div key={opt.dish_id} className="p-4 rounded-2xl bg-white">
              <p className="font-extrabold text-gray-900">{opt.dish_name}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(opt.member_match).map(([name, pct]) => (
                  <span key={name} className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                    {name}: {pct}%
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GroupSession;
