import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@moodfood/ui';
import { COOK_LANGUAGES, type CookDay, type CookLanguage, type CookView } from './api';
import { kc } from './brand';
import { KcSpeakerIcon, KcSpinner, KcStopIcon } from './components';
import { useReadAloud, type Reading, type SpeakFn } from './read-aloud';

const qty = (value: number | null) => (value == null ? '' : `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} `);

/** Haldi pill switch from the brand kit's cook view. */
function HaldiSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
      <Text variant="body14" color={kc.chawal}>{label}</Text>
      <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? kc.haldi : '#3B463F', justifyContent: 'center', paddingHorizontal: 3 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: value ? kc.kadhai : kc.steel, alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
  );
}

/** Haldi "listen" pill for read-aloud. */
function ListenButton({ label, active, loading, onPress }: { label: string; active: boolean; loading: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={active ? `Stop: ${label}` : label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
        backgroundColor: active ? kc.haldi : '#2A352E', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {active && loading ? <KcSpinner size={18} /> : active ? <KcStopIcon size={14} /> : <KcSpeakerIcon size={18} color={kc.haldi} />}
      <Text variant="button13" color={active ? kc.kadhai : kc.chawal}>{active ? (loading ? 'Getting it ready…' : 'Stop') : label}</Text>
    </Pressable>
  );
}

function Day({ day, voice }: { day: CookDay; voice?: ReturnType<typeof useReadAloud> }) {
  const minutes = (day.prepMinutes ?? 0) + (day.cookMinutes ?? 0);
  const here = voice?.reading?.date === day.date ? voice.reading : null;
  const start = (r: Omit<Reading, 'date' | 'steps'>) => voice && (here && here.part === r.part && (r.part === 'ingredients' || here.continuous === r.continuous) && here.index === r.index
    ? voice.stop() : void voice.play({ ...r, date: day.date, steps: day.steps.length }));
  return (
    <View style={{ backgroundColor: kc.kadhai, borderRadius: 24, padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="labelSmall" color={day.today ? kc.haldi : kc.steel} style={{ letterSpacing: 1.6 }}>{day.weekday.toUpperCase()}{day.today ? ' · TODAY' : ''}</Text>
        {day.cooking ? <Text variant="caption13" color={kc.steel}>{day.servings} {day.servings === 1 ? 'person' : 'people'}{minutes ? ` · ${minutes} min` : ''}</Text> : null}
      </View>
      {!day.cooking ? <Text variant="title17" color={kc.steel}>{day.status === 'not_planned' ? 'Not planned yet' : 'No cooking today'}</Text> : <>
        <Text style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 26, lineHeight: 30 }} color={kc.chawal}>{day.title}</Text>
        {voice && (day.ingredients.length || day.steps.length) ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {day.ingredients.length ? <ListenButton label="Listen: ingredients" active={here?.part === 'ingredients'} loading={voice.loading}
            onPress={() => start({ part: 'ingredients', index: 0, continuous: false })} /> : null}
          {day.steps.length ? <ListenButton label="Read the steps" active={here?.part === 'step' && here.continuous} loading={voice.loading}
            onPress={() => here?.part === 'step' && here.continuous ? voice.stop() : void voice.play({ date: day.date, part: 'step', index: 0, steps: day.steps.length, continuous: true })} /> : null}
        </View> : null}
        {day.ingredients.length ? <View style={{ gap: 4 }}>
          {day.ingredients.map((i, index) => <Text key={`${i.name}-${index}`} variant="body15" color={kc.steel}>
            {`${i.name}  ${qty(i.quantity)}${i.unit === 'to taste' ? '' : i.unit}`.trim()}{i.optional ? ' (optional)' : ''}
          </Text>)}
        </View> : null}
        {day.steps.length ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: '#3B463F', paddingTop: 12 }}>
          {day.steps.map((step, index) => {
            const now = here?.part === 'step' && here.index === index;
            const row = <>
              <Text variant="bodyStrong15" color={kc.haldi}>{index + 1}</Text>
              <Text variant="body15" color={kc.chawal} style={{ flex: 1 }}>{step}</Text>
              {voice ? (now && voice.loading ? <KcSpinner size={18} /> : <KcSpeakerIcon size={16} color={now ? kc.haldi : kc.steel} />) : null}
            </>;
            // Tap a step to hear just that one (tap again to stop); the step being read is highlighted.
            return voice ? <Pressable key={index} onPress={() => now ? voice.stop() : void voice.play({ date: day.date, part: 'step', index, steps: day.steps.length, continuous: false })}
              accessibilityRole="button" accessibilityLabel={`Read step ${index + 1} aloud`}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 6, marginHorizontal: -6, borderRadius: 12, backgroundColor: now ? '#2A352E' : 'transparent' }}>
              {row}
            </Pressable> : <View key={index} style={{ flexDirection: 'row', gap: 10 }}>{row}</View>;
          })}
        </View> : null}
      </>}
    </View>
  );
}

/**
 * Cook view (public link and in-app cook role). Shows only meals, people, ingredients and method — no chat,
 * preferences, addresses, prices or orders. Words can be translated; numbers always come from the recipe.
 */
export function CookViewPanel({ view, onLanguage, onTransliterate, busy, speak }: {
  view: CookView; onLanguage: (language: CookLanguage) => void; onTransliterate: (value: boolean) => void; busy?: boolean;
  /** Read-aloud in the view's language (omit to hide the listen controls). */
  speak?: SpeakFn;
}) {
  const voice = useReadAloud(speak ?? (async () => { throw new Error('Read-aloud is off.'); }));
  // A new language means new words: stop whatever is being read.
  const { stop } = voice;
  useEffect(() => { stop(); }, [view.language, view.transliterate, stop]);
  const nativeScript = view.language !== 'en' && view.language !== 'hinglish';
  return (
    <View style={{ gap: 12, opacity: busy ? 0.6 : 1 }}>
      <View style={{ backgroundColor: kc.kadhai, borderRadius: 24, padding: 16, gap: 10 }}>
        <Text variant="labelSmall" color={kc.steel} style={{ letterSpacing: 1.6 }}>COOK VIEW · {view.household.name.toUpperCase()}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {COOK_LANGUAGES.map((l) => <Pressable key={l.code} onPress={() => onLanguage(l.code)} accessibilityRole="button" accessibilityState={{ selected: view.language === l.code }}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: view.language === l.code ? kc.haldi : '#2A352E' }}>
            <Text variant="button13" color={view.language === l.code ? kc.kadhai : kc.chawal}>{l.label}</Text>
          </Pressable>)}
        </ScrollView>
        {nativeScript ? <HaldiSwitch value={view.transliterate} onChange={onTransliterate} label="Show in English letters" /> : null}
        {view.translation === 'fallback' || view.translation === 'partial'
          ? <Text variant="caption13" color={kc.haldiTint}>Some words are shown in English right now. Quantities are always exact.</Text> : null}
        {speak ? <Text variant="caption13" color={kc.steel}>Tap the speaker to hear the recipe read aloud in this language.</Text> : null}
        {voice.error ? <Text variant="caption13" color={kc.haldiTint}>{voice.error}</Text> : null}
      </View>
      {view.days.length ? view.days.map((day) => <Day key={day.date} day={day} voice={speak ? voice : undefined} />)
        : <Text variant="body15" tone="ink2">Nothing left to cook this week.</Text>}
    </View>
  );
}
