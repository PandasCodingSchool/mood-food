// Rule-based fallback used when the intelligence service is down. Data ported from v1.
import { randomInt } from 'node:crypto';

const FOOD: Record<string, Record<string, string[]>> = {
  // Mood-based recommendations
  happy: {
    comfort: ['Pizza', 'Burger', 'Pasta', 'Tacos', 'Fried Chicken'],
    spicy: ['Thai Curry', 'Szechuan Noodles', 'Hot Wings', 'Vindaloo', 'Jerk Chicken'],
    sweet: ['Ice Cream Sundae', 'Waffles', 'Donuts', 'Milkshake', 'Cheesecake'],
    healthy: ['Buddha Bowl', 'Smoothie Bowl', 'Grilled Salmon', 'Quinoa Salad', 'Acai Bowl'],
    light: ['Sushi Rolls', 'Caprese Salad', 'Gazpacho', 'Bruschetta', 'Spring Rolls'],
    indulgent: ['BBQ Ribs', 'Lobster Roll', 'Truffle Pasta', 'Wagyu Burger', 'Chocolate Fondue'],
  },
  tired: {
    comfort: ['Mac and Cheese', 'Grilled Cheese', 'Chicken Soup', 'Mashed Potatoes', 'Meatloaf'],
    spicy: ['Ramen', 'Kimchi Fried Rice', 'Chicken Tikka', 'Buffalo Wings', 'Chili'],
    sweet: ['Hot Chocolate', 'Apple Pie', 'Bread Pudding', 'Creme Brulee', 'Tiramisu'],
    healthy: ['Chicken Soup', 'Steamed Fish', 'Vegetable Stir-fry', 'Lentil Soup', 'Oatmeal'],
    light: ['Chicken Noodle Soup', 'Toast with Avocado', 'Yogurt Parfait', 'Fruit Salad', 'Clear Broth'],
    indulgent: ['Beef Stew', 'Lobster Bisque', 'Pork Belly', 'Beef Wellington', 'Risotto'],
  },
  stressed: {
    comfort: ['Chocolate Cake', 'Mashed Potatoes', 'Chicken Pot Pie', 'Beef Stew', 'Mac and Cheese'],
    spicy: ['Hot Wings', 'Spicy Ramen', 'Chili', 'Jalapeno Poppers', 'Spicy Tuna Roll'],
    sweet: ['Chocolate Lava Cake', 'Brownies', 'Cookies', 'Milkshake', 'Cheesecake'],
    healthy: ['Herbal Tea', 'Oatmeal', 'Banana', 'Yogurt', 'Nuts and Berries'],
    light: ['Herbal Tea', 'Crackers', 'Fruit', 'Yogurt', 'Smoothie'],
    indulgent: ['Poutine', 'Fried Chicken', 'Nachos', 'Fondue', 'BBQ Platter'],
  },
  celebrating: {
    comfort: ['Steak and Fries', 'Pizza Feast', 'Pasta Carbonara', 'Lobster', 'Prime Rib'],
    spicy: ['Spicy Seafood Boil', 'Korean BBQ', 'Indian Thali', 'Mexican Fiesta', 'Thai Feast'],
    sweet: ['Champagne and Strawberries', 'Celebration Cake', 'Chocolate Fountain', 'Tiramisu', 'Profiteroles'],
    healthy: ['Seafood Platter', 'Oysters', 'Grilled Fish', 'Sashimi', 'Ceviche'],
    light: ['Champagne', 'Oysters', 'Caviar', 'Canapes', 'Smoked Salmon'],
    indulgent: ['Steakhouse Dinner', 'Omakase', 'Tasting Menu', 'Surf and Turf', 'Champagne Brunch'],
  },
  relaxed: {
    comfort: ['Sunday Roast', 'Pasta', 'Tapas', 'Charcuterie Board', 'Brunch'],
    spicy: ['Mild Curry', 'Poke Bowl', 'Ceviche', 'Tacos', 'Paella'],
    sweet: ['Affogato', 'Crepes', 'Fruit Tart', 'Panna Cotta', 'Gelato'],
    healthy: ['Grain Bowl', 'Mediterranean Plate', 'Sushi', 'Salad Nicoise', 'Grilled Vegetables'],
    light: ['Salad', 'Soup', 'Tea Sandwiches', 'Crudites', 'Fresh Fruit'],
    indulgent: ['Cheese Board', 'Wine Pairing', 'Charcuterie', 'Oysters', 'Foie Gras'],
  },
  adventurous: {
    comfort: ['Fusion Tacos', 'Korean Fried Chicken', 'Ramen Burger', 'Sushi Pizza', 'Dim Sum'],
    spicy: ['Ghost Pepper Wings', 'Szechuan Hot Pot', 'Vindaloo', 'Thai Papaya Salad', 'Ethiopian Doro Wat'],
    sweet: ['Mochi Ice Cream', 'Bubble Tea', 'Churros with Chocolate', 'Baklava', 'Matcha Desserts'],
    healthy: ['Poke Bowl', 'Vietnamese Pho', 'Mediterranean Mezze', 'Bibimbap', 'Ceviche'],
    light: ['Ceviche', 'Sashimi', 'Spring Rolls', 'Raw Bar', 'Edamame'],
    indulgent: ['Foie Gras', 'Truffle Everything', 'Uni', 'Wagyu', 'Caviar'],
  },
};

const CUISINES: Record<string, string[]> = {
  veg: ['Mediterranean', 'Indian', 'Thai', 'Italian', 'Mexican', 'Japanese', 'Chinese'],
  'non-veg': ['American', 'Korean', 'Japanese', 'Italian', 'Indian', 'Mexican', 'Thai', 'Chinese', 'French'],
  both: ['Mediterranean', 'Indian', 'Thai', 'Italian', 'Mexican', 'Japanese', 'Chinese', 'Korean', 'American'],
};

const WHY: Record<string, (food: string) => string> = {
  happy: (f) => `Perfect for your happy mood! This ${f} will keep the good vibes going.`,
  tired: (f) => `Great choice when you're feeling tired. This ${f} provides the comfort you need.`,
  stressed: (f) => `Exactly what you need to unwind. This ${f} is pure comfort.`,
  celebrating: (f) => `Fits your celebration perfectly! This ${f} makes any occasion special.`,
  relaxed: (f) => `Ideal for your relaxed state. This ${f} complements your chill mood.`,
  adventurous: (f) => `Matches your adventurous spirit! Try something new with this ${f}.`,
};

function pickDistinct<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}

/** Three random dishes for (mood, craving), shaped like intelligence recommendations. */
export function fallbackRecommendations(q: { mood: string; craving: string; budget: string; preference: string }) {
  const mood = q.mood.toLowerCase();
  const craving = q.craving.toLowerCase().replace(' ', '');
  const dishes = FOOD[mood]?.[craving] ?? FOOD.happy.comfort;
  const cuisines = CUISINES[q.preference.toLowerCase()] ?? CUISINES.both;
  const why = WHY[mood] ?? WHY.happy;

  return pickDistinct(dishes, 3).map((name, index) => ({
    id: `fb_${index}`,
    rank: index + 1,
    confidence: 0.75,
    dish: {
      id: `fb_dish_${index}`,
      name,
      cuisine: cuisines[randomInt(cuisines.length)],
      category: 'general',
      tags: [q.mood, q.craving],
    },
    image_url: null,
    ai_reasoning: {
      mood_match: `Matches ${q.mood} mood`,
      context_fit: `Fits ${q.budget} budget and ${q.craving} craving`,
      psychological_hook: why(name.toLowerCase()),
    },
    practical_details: { estimated_price: 0, preparation_time: 20, calories: 0, health_score: 5 },
    restaurant: null,
    alternatives: [],
    pairing_suggestions: [],
  }));
}
