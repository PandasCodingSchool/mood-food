import { Icon } from '@/components/Icon';

// Not published yet. Plain "coming soon" tiles: the official store badges may
// only be used once the app is live on that store.
const STORES = [
  { name: 'App Store', label: 'iPhone' },
  { name: 'Google Play', label: 'Android' },
];

export function StoreButtons() {
  return (
    <ul className="stores" aria-label="Mobile apps">
      {STORES.map((s) => (
        <li key={s.name} className="store glass" aria-label={`${s.name}: coming soon`}>
          <Icon name="schedule" size={20} />
          <span>
            <span className="store-small">{`${s.label} · coming soon`}</span>
            <span className="store-name">{s.name}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
