// Rule-based recommendation engine for Phase 0
// No AI - just smart rule matching

const foodDatabase = {
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

const cuisineTypes = {
  veg: ['Mediterranean', 'Indian', 'Thai', 'Italian', 'Mexican', 'Japanese', 'Chinese'],
  'non-veg': ['American', 'Korean', 'Japanese', 'Italian', 'Indian', 'Mexican', 'Thai', 'Chinese', 'French'],
  both: ['Mediterranean', 'Indian', 'Thai', 'Italian', 'Mexican', 'Japanese', 'Chinese', 'Korean', 'American'],
};

const budgetIndicators = {
  low: ['Street Food', 'Fast Food', 'Food Truck', 'Casual Dining'],
  medium: ['Casual Dining', 'Bistro', 'Cafe', 'Family Restaurant'],
  high: ['Fine Dining', 'Steakhouse', 'Specialty Restaurant', 'Chef\'s Table'],
};

export const getRecommendations = (mood, craving, budget, preference) => {
  const moodKey = mood.toLowerCase();
  const cravingKey = craving.toLowerCase().replace(' ', '');
  
  // Get base recommendations for mood + craving
  const baseRecommendations = foodDatabase[moodKey]?.[cravingKey] || 
    foodDatabase.happy.comfort;
  
  // Get cuisine types based on preference
  const cuisines = cuisineTypes[preference.toLowerCase()] || cuisineTypes.both;
  
  // Get budget context
  const budgetContext = budgetIndicators[budget.toLowerCase()] || budgetIndicators.medium;
  
  // Generate 3 recommendations with variety
  const recommendations = [];
  const usedIndices = new Set();
  
  for (let i = 0; i < 3; i++) {
    let index;
    do {
      index = Math.floor(Math.random() * baseRecommendations.length);
    } while (usedIndices.has(index));
    
    usedIndices.add(index);
    const food = baseRecommendations[index];
    const cuisine = cuisines[Math.floor(Math.random() * cuisines.length)];
    const budgetType = budgetContext[Math.floor(Math.random() * budgetContext.length)];
    
    recommendations.push({
      id: i + 1,
      name: food,
      cuisine,
      budgetType,
      budget,
      why: generateWhy(mood, craving, food),
      tags: generateTags(mood, craving),
    });
  }
  
  return recommendations;
};

const generateWhy = (mood, craving, food) => {
  const reasons = {
    happy: `Perfect for your happy mood! This ${food.toLowerCase()} will keep the good vibes going.`,
    tired: `Great choice when you're feeling tired. This ${food.toLowerCase()} provides the comfort you need.`,
    stressed: `Exactly what you need to unwind. This ${food.toLowerCase()} is pure comfort.`,
    celebrating: `Fits your celebration perfectly! This ${food.toLowerCase()} makes any occasion special.`,
    relaxed: `Ideal for your relaxed state. This ${food.toLowerCase()} complements your chill mood.`,
    adventurous: `Matches your adventurous spirit! Try something new with this ${food.toLowerCase()}.`,
  };
  
  return reasons[mood.toLowerCase()] || reasons.happy;
};

const generateTags = (mood, craving) => {
  const tags = [mood, craving];
  if (craving === 'Comfort Food') tags.push('Hearty');
  if (craving === 'Healthy') tags.push('Nutritious');
  if (craving === 'Spicy') tags.push('Bold Flavors');
  if (craving === 'Sweet') tags.push('Dessert-like');
  return tags;
};

export default { getRecommendations };
