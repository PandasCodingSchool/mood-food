// Preference options (ids are what the API stores; same as v1 profile).
import type { UserPreferences } from '../services/preferences';

export const DIETS = [
  { id: 'veg', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'keto', label: 'Keto' },
  { id: 'gf', label: 'Gluten-free' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
];

export const ALLERGIES = [
  { id: 'nuts', label: 'Nuts' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'soy', label: 'Soy' },
];

export const BUDGETS = [
  { value: 0, label: 'Budget' },
  { value: 1, label: 'Moderate' },
  { value: 2, label: 'Splurge' },
  { value: 3, label: 'No limit' },
];

export const CUISINES = [
  { id: 'ital', label: 'Italian' },
  { id: 'mex', label: 'Mexican' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'ind', label: 'Indian' },
  { id: 'thai', label: 'Thai' },
  { id: 'kor', label: 'Korean' },
  { id: 'med', label: 'Mediterranean' },
  { id: 'usa', label: 'American' },
];

export const DEFAULT_PREFS: UserPreferences = { diets: [], allergies: [], cuisines: [], budget: 1 };
