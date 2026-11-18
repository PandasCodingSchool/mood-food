/**
 * Read-aloud text for the cook view: what to say for a day's ingredients or one step, in the cook's language.
 * Words come from the (already translated) cook view; only the small connecting labels live here.
 */
export type SpeechPart = 'ingredients' | 'step';

interface Labels { for: (n: number) => string; ingredients: string; step: (n: number) => string; optional: string; toTaste: string; units?: Record<string, string> }

const LABELS: Record<string, Labels> = {
  en: { for: (n) => `for ${n}`, ingredients: 'Ingredients', step: (n) => `Step ${n}`, optional: 'optional', toTaste: 'to taste',
    units: { g: 'grams', kg: 'kilograms', ml: 'millilitres', l: 'litres', tsp: 'teaspoon', tbsp: 'tablespoon', cup: 'cup', piece: '', clove: 'cloves', bunch: 'bunch', sprig: 'sprig' } },
  hi: { for: (n) => `${n} लोगों के लिए`, ingredients: 'सामग्री', step: (n) => `चरण ${n}`, optional: 'वैकल्पिक', toTaste: 'स्वादानुसार',
    units: { g: 'ग्राम', kg: 'किलो', ml: 'मिलीलीटर', l: 'लीटर', tsp: 'छोटा चम्मच', tbsp: 'बड़ा चम्मच', cup: 'कप', piece: '', clove: 'कली', bunch: 'गुच्छा', sprig: 'टहनी' } },
  hinglish: { for: (n) => `${n} logon ke liye`, ingredients: 'Saamagri', step: (n) => `Step ${n}`, optional: 'optional', toTaste: 'swaad anusaar',
    units: { g: 'gram', kg: 'kilo', ml: 'ml', l: 'litre', tsp: 'chhota chammach', tbsp: 'bada chammach', cup: 'cup', piece: '', clove: 'kali', bunch: 'guchha', sprig: 'tehni' } },
  mr: { for: (n) => `${n} जणांसाठी`, ingredients: 'साहित्य', step: (n) => `पायरी ${n}`, optional: 'ऐच्छिक', toTaste: 'चवीनुसार' },
  ta: { for: (n) => `${n} பேருக்கு`, ingredients: 'தேவையான பொருட்கள்', step: (n) => `படி ${n}`, optional: 'விருப்பத்திற்கு', toTaste: 'சுவைக்கேற்ப' },
  te: { for: (n) => `${n} మందికి`, ingredients: 'కావలసిన పదార్థాలు', step: (n) => `దశ ${n}`, optional: 'ఐచ్ఛికం', toTaste: 'రుచికి తగినంత' },
  bn: { for: (n) => `${n} জনের জন্য`, ingredients: 'উপকরণ', step: (n) => `ধাপ ${n}`, optional: 'ঐচ্ছিক', toTaste: 'স্বাদমতো' },
  kn: { for: (n) => `${n} ಜನರಿಗೆ`, ingredients: 'ಬೇಕಾಗುವ ಸಾಮಗ್ರಿಗಳು', step: (n) => `ಹಂತ ${n}`, optional: 'ಐಚ್ಛಿಕ', toTaste: 'ರುಚಿಗೆ ತಕ್ಕಷ್ಟು' },
};

export interface SpeechDay {
  title: string | null;
  servings: number;
  ingredients: Array<{ name: string; quantity: number | null; unit: string; optional: boolean }>;
  steps: string[];
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Kitchen-friendly amount: whole numbers from 10 up, quarters (as ¼ ½ ¾) below, ⅛ for a pinch. Never 0.13. */
export function kitchenAmount(q: number): string {
  if (q >= 10) return String(Math.round(q));
  const quarters = Math.round(q * 4) / 4;
  if (quarters === 0) return q > 0 ? '⅛' : '0';
  const whole = Math.floor(quarters);
  const part = FRACTIONS[quarters - whole] ?? '';
  return whole && part ? `${whole}${part}` : part || String(whole);
}

/** The words to read for one part of a day, or null when there's nothing to read. */
export function speechText(day: SpeechDay, language: string, part: SpeechPart, index = 0): string | null {
  const l = LABELS[language] ?? LABELS.en;
  if (part === 'step') {
    const step = day.steps[index];
    return step ? `${l.step(index + 1)}. ${step}` : null;
  }
  if (!day.ingredients.length) return null;
  const items = day.ingredients.map((i) => {
    const unit = l.units?.[i.unit] ?? i.unit;
    const qty = i.quantity == null ? l.toTaste : `${kitchenAmount(i.quantity)}${unit ? ` ${unit}` : ''}`;
    return `${i.quantity == null ? `${i.name} ${qty}` : `${qty} ${i.name}`}${i.optional ? ` (${l.optional})` : ''}`;
  });
  return `${day.title ?? ''}, ${l.for(day.servings)}. ${l.ingredients}: ${items.join(', ')}.`.slice(0, 1500);
}
