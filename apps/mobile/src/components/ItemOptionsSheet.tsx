// Choice sheet for customizable Swiggy dishes: sizes/options (one per group)
// and addon groups (required "Choice of Rice"-style picks plus optional
// extras). Swiggy drops a dish sent without its required choices, so the
// menu opens this before adding one.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Checkbox, Radio, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock } from './v2';
import { getItemOptions, type ItemChoice, type ItemOptions, type MenuItem, type OptionGroup } from '../services/swiggyOrder';

interface Props {
  item: MenuItem | null;
  restaurantId: string;
  addressId: string;
  /** The dish's current picks, when changing them. */
  initial?: ItemChoice;
  onClose: () => void;
  onConfirm: (choice: ItemChoice) => void;
}

const rupees = (n: number) => `₹${Math.round(n)}`;

export default function ItemOptionsSheet({ item, restaurantId, addressId, initial, onClose, onConfirm }: Props) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const [options, setOptions] = useState<ItemOptions | null>(null);
  // Picked variation per variant group, picked choice ids per addon group.
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [addons, setAddons] = useState<Record<string, string[]>>({});

  const load = (it: MenuItem) => {
    setOptions(null);
    void getItemOptions(restaurantId, it.id, addressId, it.name).then((o) => {
      setOptions(o);
      const v: Record<string, string> = {};
      for (const g of o.variantGroups) {
        const prev = initial?.variants.find((x) => x.group_id === g.id)?.variation_id;
        v[g.id] = prev && g.choices.some((c) => c.id === prev) ? prev : (g.choices.find((c) => c.isDefault) ?? g.choices[0]).id;
      }
      const a: Record<string, string[]> = {};
      for (const g of o.addonGroups) {
        a[g.id] = (initial?.addons ?? []).filter((x) => x.group_id === g.id && g.choices.some((c) => c.id === x.choice_id)).map((x) => x.choice_id);
      }
      setVariants(v);
      setAddons(a);
    });
  };

  useEffect(() => {
    if (item) load(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const picked = useMemo(() => new Set(Object.values(variants)), [variants]);
  const visibleAddons = useMemo(
    () =>
      (options?.addonGroups ?? []).filter(
        (g) => (!g.onlyWithVariation || picked.has(g.onlyWithVariation)) && !g.hiddenWithVariations.some((v) => picked.has(v)),
      ),
    [options, picked],
  );
  const missing = visibleAddons.filter((g) => (addons[g.id]?.length ?? 0) < g.min);

  const toggle = (g: OptionGroup, id: string) =>
    setAddons((prev) => {
      const cur = prev[g.id] ?? [];
      if (cur.includes(id)) return { ...prev, [g.id]: cur.filter((x) => x !== id) };
      if (g.max === 1) return { ...prev, [g.id]: [id] };
      if (g.max != null && cur.length >= g.max) return prev;
      return { ...prev, [g.id]: [...cur, id] };
    });

  // Variation prices are the dish's price for that option (e.g. Medium ₹428),
  // or parts of it (a combo's two pizzas); addon prices are on top.
  const unitPrice = useMemo(() => {
    if (!options) return item?.price ?? null;
    const choiceOf = (groups: OptionGroup[], gid: string, cid: string) => groups.find((g) => g.id === gid)?.choices.find((c) => c.id === cid);
    const variantSum = Object.entries(variants).reduce((s, [gid, cid]) => s + (choiceOf(options.variantGroups, gid, cid)?.price ?? 0), 0);
    const addonSum = visibleAddons.reduce((s, g) => s + (addons[g.id] ?? []).reduce((t, cid) => t + (choiceOf([g], g.id, cid)?.price ?? 0), 0), 0);
    return (variantSum > 0 ? variantSum : item?.price ?? 0) + addonSum;
  }, [options, variants, addons, visibleAddons, item?.price]);

  const confirm = () => {
    if (!options) return;
    const labels: string[] = [];
    for (const g of options.variantGroups) {
      const c = g.choices.find((x) => x.id === variants[g.id]);
      // A single-option group ("Choose your Crust": one crust) says nothing new.
      if (c && g.choices.length > 1) labels.push(c.name);
    }
    const chosenAddons = visibleAddons.flatMap((g) =>
      (addons[g.id] ?? []).map((cid) => {
        labels.push(g.choices.find((c) => c.id === cid)?.name ?? '');
        return { group_id: g.id, choice_id: cid };
      }),
    );
    onConfirm({
      variantFormat: options.variantFormat,
      variants: options.variantGroups.map((g) => ({ group_id: g.id, variation_id: variants[g.id] })),
      addons: chosenAddons,
      labels: labels.filter(Boolean),
      unitPrice,
    });
  };

  // Options didn't load: still let them add it — the server fills required picks.
  const addPlain = () => onConfirm({ variantFormat: null, variants: [], addons: [], labels: [], unitPrice: item?.price ?? null });

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} accessibilityLabel="Close choices" />
      <Surface
        kind="solid"
        radius={28}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%', paddingTop: 20, paddingBottom: 16 + safeBottom, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text variant="title19" numberOfLines={2}>{item?.name ?? ''}</Text>
          <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>Customise your dish</Text>
        </View>
        {!options ? (
          <LoadingBlock label="Loading choices" style={{ paddingVertical: 28 }} />
        ) : !options.success ? (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <ErrorBlock message={options.error || "Couldn't load the options for this dish."} onRetry={() => item && load(item)} />
            <Button label="Add with the usual choices" variant="outline" block onPress={addPlain} />
          </View>
        ) : (
          <>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 14 }}>
              {options.variantGroups.map((g) => (
                <Group key={g.id} title={g.name} hint="Pick 1">
                  {g.choices.map((c) => (
                    <ChoiceRow
                      key={c.id}
                      name={c.name}
                      price={c.price != null && c.price > 0 ? rupees(c.price) : ''}
                      selected={variants[g.id] === c.id}
                      kind="radio"
                      onPress={() => setVariants((prev) => ({ ...prev, [g.id]: c.id }))}
                    />
                  ))}
                </Group>
              ))}
              {visibleAddons.map((g) => {
                const cur = addons[g.id] ?? [];
                const single = g.max === 1;
                const full = g.max != null && cur.length >= g.max;
                return (
                  <Group key={g.id} title={g.name} hint={hintFor(g)} required={g.min > 0}>
                    {g.choices.map((c) => {
                      const on = cur.includes(c.id);
                      return (
                        <ChoiceRow
                          key={c.id}
                          name={c.name}
                          price={c.price != null && c.price > 0 ? `+${rupees(c.price)}` : ''}
                          selected={on}
                          kind={single ? 'radio' : 'check'}
                          disabled={!on && full && !single}
                          onPress={() => toggle(g, c.id)}
                        />
                      );
                    })}
                  </Group>
                );
              })}
            </ScrollView>
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {missing.length ? (
                <Text variant="caption12" tone="ink2" style={{ marginBottom: 8, textAlign: 'center' }}>{`Choose ${missing.map((g) => g.name.replace(/\s*:\s*$/, '')).join(', ')}`}</Text>
              ) : null}
              <Button
                label={unitPrice ? `Add item · ${rupees(unitPrice)}` : 'Add item'}
                block
                disabled={missing.length > 0}
                onPress={confirm}
              />
            </View>
          </>
        )}
      </Surface>
    </Modal>
  );
}

function hintFor(g: OptionGroup): string {
  if (g.min > 0 && g.min === g.max) return `Pick ${g.min}`;
  if (g.min > 0) return `Pick at least ${g.min}`;
  return g.max != null ? `Up to ${g.max}` : 'Optional';
}

function Group({ title, hint, required, children }: { title: string; hint: string; required?: boolean; children: React.ReactNode }) {
  return (
    <Surface kind="tint" radius={20} style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Text variant="bodyStrong15" style={{ flex: 1 }}>{title.replace(/\s*:\s*$/, '')}</Text>
        <Text variant="micro12" tone={required ? 'accText' : 'ink2'}>{required ? `Required · ${hint}` : hint}</Text>
      </View>
      <View style={{ marginTop: 4 }}>{children}</View>
    </Surface>
  );
}

function ChoiceRow({ name, price, selected, kind, disabled, onPress }: {
  name: string;
  price: string;
  selected: boolean;
  kind: 'radio' | 'check';
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={kind === 'radio' ? { selected } : { checked: selected, disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: disabled ? 0.45 : 1, borderTopWidth: 1, borderTopColor: colors.line }}
    >
      <Text variant="body14" style={{ flex: 1 }}>{name}</Text>
      {price ? <Text variant="caption13" tone="ink2">{price}</Text> : null}
      {kind === 'radio' ? <Radio selected={selected} /> : <Checkbox checked={selected} />}
    </Pressable>
  );
}
