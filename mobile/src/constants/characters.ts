export type TraitKey = 'energy' | 'social' | 'adventure' | 'indulgence' | 'spice' | 'budget';
export type TraitVector = Record<TraitKey, number>;

export interface CharacterProfile {
  id: string;
  name: string;
  show: string;
  emoji: string;
  tagline: string;
  vibe: string;
  signatureFood: string;
  mood: string;
  craving: string;
  budget: string;
  preference: string;
  traits: TraitVector;
}

export interface CharacterQuestionOption {
  id: string;
  label: string;
  emoji: string;
  traitWeights: Partial<TraitVector>;
  next?: string;
}

export interface CharacterQuestion {
  id: string;
  prompt: string;
  subtitle?: string;
  options: CharacterQuestionOption[];
}

export const CHARACTERS: CharacterProfile[] = [
  { id: 'joey', name: 'Joey Tribbiani', show: 'Friends', emoji: '🍕', tagline: "How you doin'?", vibe: 'Lover of food, all food, definitely not sharing.', signatureFood: 'Pizza & meatball subs', mood: 'happy', craving: 'comfort', budget: 'moderate', preference: 'non-veg', traits: { energy: 6, social: 7, adventure: 3, indulgence: 10, spice: 4, budget: 4 } },
  { id: 'chandler', name: 'Chandler Bing', show: 'Friends', emoji: '🥪', tagline: 'Could this BE any more delicious?', vibe: 'Sarcastic snacker. Late-night munchies.', signatureFood: 'Late-night sandwiches', mood: 'stressed', craving: 'comfort', budget: 'moderate', preference: 'both', traits: { energy: 3, social: 4, adventure: 2, indulgence: 7, spice: 3, budget: 3 } },
  { id: 'michael', name: 'Michael Scott', show: 'The Office', emoji: '🎉', tagline: 'I declare... dinner!', vibe: 'Childlike, fun, party food always.', signatureFood: 'Office party platter', mood: 'celebrating', craving: 'indulgent', budget: 'moderate', preference: 'non-veg', traits: { energy: 8, social: 10, adventure: 5, indulgence: 7, spice: 4, budget: 5 } },
  { id: 'ted', name: 'Ted Mosby', show: 'HIMYM', emoji: '🍷', tagline: 'Kids, let me tell you about this dinner...', vibe: 'Romantic, thoughtful, classic dinner.', signatureFood: 'Italian fine dining', mood: 'relaxed', craving: 'light', budget: 'splurge', preference: 'both', traits: { energy: 5, social: 6, adventure: 4, indulgence: 6, spice: 3, budget: 10 } },
  { id: 'barney', name: 'Barney Stinson', show: 'HIMYM', emoji: '🥃', tagline: 'Suit up. Dinner is LEGEN... dary.', vibe: 'Bold, premium, suit-up energy.', signatureFood: 'Premium steakhouse', mood: 'celebrating', craving: 'indulgent', budget: 'splurge', preference: 'non-veg', traits: { energy: 9, social: 8, adventure: 6, indulgence: 7, spice: 5, budget: 8 } },
  { id: 'geet', name: 'Geet', show: 'Jab We Met', emoji: '🌶️', tagline: 'Main apni favourite hoon!', vibe: 'Bubbly, adventurous, street-food chaser.', signatureFood: 'Chole bhature & golgappa', mood: 'happy', craving: 'spicy', budget: 'budget', preference: 'veg', traits: { energy: 9, social: 8, adventure: 9, indulgence: 6, spice: 9, budget: 2 } },
  { id: 'rancho', name: 'Rancho', show: '3 Idiots', emoji: '🌱', tagline: 'All izz well!', vibe: 'Curious, minimalist, eats to live.', signatureFood: 'Dal chawal', mood: 'relaxed', craving: 'healthy', budget: 'budget', preference: 'veg', traits: { energy: 7, social: 6, adventure: 7, indulgence: 2, spice: 4, budget: 1 } },
  { id: 'bunny', name: 'Bunny', show: 'Yeh Jawaani Hai Deewani', emoji: '🌍', tagline: 'Main udna chahta hoon!', vibe: 'Explorer. Always chasing the next meal in a new city.', signatureFood: 'Street food anywhere new', mood: 'adventurous', craving: 'light', budget: 'moderate', preference: 'both', traits: { energy: 8, social: 6, adventure: 10, indulgence: 5, spice: 6, budget: 6 } },
];

export const CHARACTER_QUESTION_BANK: Record<string, CharacterQuestion> = {
  q1_night: {
    id: 'q1_night', prompt: "It's Saturday night. Your move?", subtitle: 'Pick what sounds most like you right now',
    options: [
      { id: 'couch', label: 'Couch + comfort food', emoji: '🛋️', traitWeights: { energy: -2, social: -2, indulgence: 2 }, next: 'q2_solo' },
      { id: 'party', label: 'Out with the squad', emoji: '🎉', traitWeights: { energy: 3, social: 3, indulgence: 1 }, next: 'q2_social' },
      { id: 'explore', label: 'Try a new place in town', emoji: '🗺️', traitWeights: { adventure: 3, energy: 1, budget: 1 }, next: 'q2_adventure' },
      { id: 'date', label: 'Cozy dinner with someone', emoji: '🕯️', traitWeights: { social: 1, budget: 2, indulgence: 1 }, next: 'q2_romance' },
    ],
  },
  q2_solo: {
    id: 'q2_solo', prompt: "The couch is yours. Pick your companion tonight.",
    options: [
      { id: 'binge_show', label: 'Guilty-pleasure reality show', emoji: '📺', traitWeights: { energy: -1, indulgence: 2 }, next: 'q3_calm' },
      { id: 'spicy_noodles', label: 'Something spicy to really feel alive', emoji: '🔥', traitWeights: { spice: 3, energy: 1 }, next: 'q3_edge' },
      { id: 'good_book', label: 'A good book or podcast', emoji: '📚', traitWeights: { energy: -2, adventure: 1 }, next: 'q3_calm' },
      { id: 'doom_scroll', label: 'Food delivery + doom-scroll', emoji: '📱', traitWeights: { energy: -1, indulgence: 1 }, next: 'q3_calm' },
    ],
  },
  q2_social: {
    id: 'q2_social', prompt: "You're with the squad. First order of business?",
    options: [
      { id: 'snack_table', label: 'Hunt the snack spread — immediately', emoji: '🍕', traitWeights: { indulgence: 3, social: 1 }, next: 'q3_edge' },
      { id: 'music_on', label: 'Put on music, get everyone going', emoji: '🎵', traitWeights: { energy: 3, social: 2 }, next: 'q3_edge' },
      { id: 'new_spot', label: 'Suggest somewhere none of you have tried', emoji: '🌍', traitWeights: { adventure: 3, social: 1 }, next: 'q3_global' },
      { id: 'just_vibe', label: 'Just vibe, catch up, go wherever', emoji: '😊', traitWeights: { energy: -1, social: 2 }, next: 'q3_calm' },
    ],
  },
  q2_adventure: {
    id: 'q2_adventure', prompt: "You found the hidden gem. No menu — chef decides. You feel...",
    options: [
      { id: 'love_it', label: 'Excited — I literally live for this', emoji: '✨', traitWeights: { adventure: 4, energy: 2 }, next: 'q3_global' },
      { id: 'cautious', label: 'Cautiously curious — let\'s see the vibe', emoji: '👀', traitWeights: { adventure: 1, indulgence: 1 }, next: 'q3_edge' },
      { id: 'googling', label: 'Fine, but I\'m secretly Googling it', emoji: '📱', traitWeights: { adventure: -1, energy: -1 }, next: 'q3_calm' },
      { id: 'atmosphere', label: 'Love the atmosphere — food is secondary', emoji: '🕯️', traitWeights: { social: 2, budget: 2 }, next: 'q3_global' },
    ],
  },
  q2_romance: {
    id: 'q2_romance', prompt: "You're choosing the dinner spot. You pick...",
    options: [
      { id: 'italian_candlelit', label: 'Classic Italian, candlelit, proper', emoji: '🍷', traitWeights: { budget: 3, social: 1 }, next: 'q3_calm' },
      { id: 'street_food_walk', label: 'Street food walk — casual and honest', emoji: '🌮', traitWeights: { adventure: 2, indulgence: 1 }, next: 'q3_global' },
      { id: 'healthy_spot', label: 'Somewhere healthy but impressive', emoji: '🥗', traitWeights: { indulgence: -2, budget: 2 }, next: 'q3_calm' },
      { id: 'cook_myself', label: "I'm cooking. More personal that way.", emoji: '🍳', traitWeights: { social: 1, indulgence: 2 }, next: 'q3_calm' },
    ],
  },
  q3_calm: {
    id: 'q3_calm', prompt: 'Honestly, your perfect meal is...', subtitle: 'No judgment — what actually sounds good',
    options: [
      { id: 'desi_home', label: 'Dal-rice, sabzi, roti — the works', emoji: '🍛', traitWeights: { indulgence: 1, social: 1 }, next: 'q4_quiet' },
      { id: 'comfort_pasta', label: 'A big bowl of pasta or biryani', emoji: '🍝', traitWeights: { indulgence: 2, energy: 1 }, next: 'q4_quiet' },
      { id: 'light_fresh', label: 'Something light — dosa, salad, smoothie', emoji: '🥗', traitWeights: { indulgence: -2, energy: 1 }, next: 'q4_quiet' },
      { id: 'premium_quiet', label: 'Steak or a fine-dining main', emoji: '🥩', traitWeights: { budget: 3, indulgence: 2 }, next: 'q4_quiet' },
    ],
  },
  q3_edge: {
    id: 'q3_edge', prompt: 'You need to eat right now. What do you grab?',
    options: [
      { id: 'pizza_wings', label: 'Pizza, wings, something messy', emoji: '🍕', traitWeights: { indulgence: 3, social: 1 }, next: 'q4_bold' },
      { id: 'street_fiery', label: 'Street food — the spicier the better', emoji: '🌶️', traitWeights: { spice: 3, adventure: 2 }, next: 'q4_bold' },
      { id: 'bbq_ribs', label: 'BBQ, ribs, something you eat with hands', emoji: '🍖', traitWeights: { indulgence: 2, social: 2 }, next: 'q4_bold' },
      { id: 'late_snack', label: 'Cheesecake, donuts — straight dessert', emoji: '🍩', traitWeights: { indulgence: 2, energy: -1 }, next: 'q4_bold' },
    ],
  },
  q3_global: {
    id: 'q3_global', prompt: "You're ordering from a menu with 10 world cuisines. You go for...",
    options: [
      { id: 'sushi_ramen', label: 'Sushi, ramen, or dim sum', emoji: '🍱', traitWeights: { adventure: 3, budget: 2 }, next: 'q4_wander' },
      { id: 'pho_banh', label: 'Pho, banh mi, or something Vietnamese', emoji: '🍜', traitWeights: { adventure: 3, energy: 1 }, next: 'q4_wander' },
      { id: 'paella_tapas', label: 'Paella, tapas, or mezze', emoji: '🥘', traitWeights: { adventure: 2, social: 2 }, next: 'q4_wander' },
      { id: 'thai_curry', label: 'Thai curry or pad thai', emoji: '🌿', traitWeights: { spice: 2, adventure: 2 }, next: 'q4_wander' },
    ],
  },
  q4_quiet: {
    id: 'q4_quiet', prompt: 'One line that\'s very you tonight?',
    options: [
      { id: 'chandler_real', label: '"Could this BE any more comforting?"', emoji: '🥪', traitWeights: { indulgence: 2, energy: -1 } },
      { id: 'rancho_real', label: '"All izz well — and all izz light."', emoji: '🌱', traitWeights: { indulgence: -2, adventure: 1 } },
      { id: 'ted_real', label: '"Kids, I have a story about this dinner."', emoji: '🍷', traitWeights: { budget: 2, social: 1 } },
      { id: 'munna_real', label: '"Mamu, ek thali laga de full!"', emoji: '🍛', traitWeights: { social: 1, indulgence: 1 } },
    ],
  },
  q4_bold: {
    id: 'q4_bold', prompt: 'Last question — one line that\'s you tonight?',
    options: [
      { id: 'joey_real', label: '"Food is my love language."', emoji: '🍕', traitWeights: { indulgence: 3, social: 1 } },
      { id: 'michael_real', label: '"I declared it a party. That\'s why."', emoji: '🎉', traitWeights: { energy: 2, social: 3 } },
      { id: 'kabir_real', label: '"Sirf full flavour. Kuch compromise nahi."', emoji: '🔥', traitWeights: { spice: 3, indulgence: 2 } },
      { id: 'geet_real', label: '"Main apni favourite hoon!"', emoji: '💃', traitWeights: { energy: 2, adventure: 2 } },
    ],
  },
  q4_wander: {
    id: 'q4_wander', prompt: "One line that captures tonight's energy?",
    options: [
      { id: 'bunny_real', label: '"Main udna chahta hoon — new city, new food."', emoji: '🌍', traitWeights: { adventure: 4, energy: 2 } },
      { id: 'barney_real', label: '"Suit up. Dinner is LEGEN... wait for it."', emoji: '🥃', traitWeights: { budget: 3, social: 2 } },
      { id: 'geet_wander', label: '"Chalo — wherever is fine, as long as it\'s spicy."', emoji: '🌶️', traitWeights: { spice: 2, adventure: 3 } },
      { id: 'ted_wander', label: '"I researched the best spot in town."', emoji: '📖', traitWeights: { budget: 2, adventure: 1 } },
    ],
  },
};

export const FIRST_QUESTION_ID = 'q1_night';
export const TOTAL_QUESTIONS = 4;
export const CHARACTER_QUESTIONS = Object.values(CHARACTER_QUESTION_BANK);
