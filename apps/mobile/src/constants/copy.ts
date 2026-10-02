// MoodFood 2.0 context copy (docs/design/moodfood-2.0). Kept factual: no
// claims about what other people are ordering unless an API says so.
import type { Mood, TimeOfDay, Weather } from '@moodfood/tokens';

export const TIME_COPY: Record<TimeOfDay, { greet: (name?: string | null) => string; hero: string; tagline: string; meal: string; part: string }> = {
  morning: {
    greet: (n) => (n ? `Good morning, ${n}` : 'Good morning'),
    hero: 'Breakfast that matches your mood.',
    tagline: 'Good morning, hungry soul.',
    meal: 'breakfast',
    part: 'mornings',
  },
  afternoon: {
    greet: (n) => (n ? `Good afternoon, ${n}` : 'Good afternoon'),
    hero: 'Lunch deserves a better mood.',
    tagline: 'Lunch deserves a better mood.',
    meal: 'lunch',
    part: 'afternoons',
  },
  evening: {
    greet: (n) => (n ? `Good evening, ${n}` : 'Good evening'),
    hero: "What's tonight for?",
    tagline: "Let's make tonight taste better.",
    meal: 'dinner',
    part: 'evenings',
  },
  night: {
    greet: (n) => (n ? `Still up, ${n}?` : 'Still up?'),
    hero: 'What are you craving tonight?',
    tagline: 'What are you craving tonight?',
    meal: 'late-night',
    part: 'late nights',
  },
};

export const WEATHER_COPY: Record<Weather, { lead: string; insight: string; topFor: string; phrase: string; packNote: string }> = {
  rainy: {
    lead: "it's pouring outside",
    insight: "It's raining — warm, brothy picks travel best right now.",
    topFor: 'Top for rain',
    phrase: 'the rain',
    packNote: 'Expect a little extra time in the rain',
  },
  sunny: {
    lead: "it's bright and warm out",
    insight: "It's bright and warm — lighter, cooling plates are leading your picks.",
    topFor: 'Sunny-day pick',
    phrase: 'the sunshine',
    packNote: 'Cold items travel separately',
  },
  cloudy: {
    lead: 'the sky is grey',
    insight: 'Grey skies — comfort classics are leading your picks.',
    topFor: 'Cosy pick',
    phrase: 'the grey skies',
    packNote: 'Contactless drop at the door',
  },
  stormy: {
    lead: "there's a storm rolling in",
    insight: 'Storm outside — we favour kitchens that can reach you quickly.',
    topFor: 'Storm-proof · fast',
    phrase: 'the storm',
    packNote: 'Riders may take a little longer',
  },
};

export const MOOD_COPY: Record<Mood, { lower: string; lean: string; lead: string; chip: string }> = {
  happy: { lower: 'happy', lean: 'bright, zesty and a little celebratory', lead: "You're in a good mood", chip: 'Mood booster' },
  tired: { lower: 'tired', lean: 'slow-cooked, warm and zero-effort', lead: "Your energy's low", chip: 'Low effort' },
  stressed: { lower: 'stressed', lean: 'grounding, light and familiar', lead: "It's been a heavy day", chip: 'Good for stress relief' },
  adventurous: { lower: 'adventurous', lean: "bold flavours you haven't tried", lead: "You're up for something new", chip: 'New for you' },
};
