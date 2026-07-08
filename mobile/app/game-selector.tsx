import { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { trackEvent } from "../src/utils/analytics";

const GAMES = [
  {
    id: "quiz",
    title: "Mood Quiz",
    description: "4 quick questions to find your perfect meal",
    emoji: "🧠",
    tag: "Classic",
    tagColor: "bg-blue-100",
    tagText: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    id: "swipe-vibe",
    title: "Swipe & Vibe",
    description: "Swipe through food cards to reveal your cravings",
    emoji: "👆",
    tag: "Fun",
    tagColor: "bg-pink-100",
    tagText: "text-pink-700",
    bg: "bg-pink-50",
    border: "border-pink-200",
  },
  {
    id: "wheel",
    title: "Meal Roulette",
    description: "Spin the wheel and let fate decide your vibe",
    emoji: "🎡",
    tag: "Lucky",
    tagColor: "bg-purple-100",
    tagText: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
  {
    id: "story",
    title: "Day Story",
    description: "Describe your day and we map it to a meal",
    emoji: "📖",
    tag: "Immersive",
    tagColor: "bg-green-100",
    tagText: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
  },
  {
    id: "character",
    title: "Character Match",
    description: "Match your personality to a food character",
    emoji: "🎭",
    tag: "Personality",
    tagColor: "bg-orange-100",
    tagText: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
];

export default function GameSelectorScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleSelect = (gameId: string) => {
    trackEvent("game_selected", { game: gameId });
    router.push(`/games/${gameId}` as never);
  };

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <StatusBar barStyle="dark-content" backgroundColor="#fff7ed" />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* Header */}
        <View className="flex-row items-center px-6 pt-4 pb-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4 w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm"
          >
            <Text className="text-gray-700 text-lg">←</Text>
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-gray-900">
              Pick a Game
            </Text>
            <Text className="text-gray-500 text-sm">
              Choose how you want to find your meal
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {GAMES.map((game, index) => (
            <Animated.View
              key={game.id}
              style={{
                opacity: fadeAnim,
                transform: [
                  {
                    translateY: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20 + index * 10, 0],
                    }),
                  },
                ],
              }}
            >
              <TouchableOpacity
                className={`${game.bg} border ${game.border} rounded-2xl p-5 mb-4 flex-row items-center`}
                activeOpacity={0.8}
                onPress={() => handleSelect(game.id)}
              >
                <Text style={{ fontSize: 44 }}>{game.emoji}</Text>
                <View className="flex-1 ml-4">
                  <View className="flex-row items-center mb-1">
                    <Text className="text-lg font-bold text-gray-900 mr-2">
                      {game.title}
                    </Text>
                    <View
                      className={`${game.tagColor} rounded-full px-2 py-0.5`}
                    >
                      <Text className={`${game.tagText} text-xs font-semibold`}>
                        {game.tag}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-gray-600 text-sm leading-relaxed">
                    {game.description}
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl ml-2">›</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}
