import { glyph, type IconName } from '@/lib/icons';

/** Material Symbols glyph from the app's icon subset. Decorative unless labelled. */
export function Icon({ name, size = 22, filled, label, className }: { name: IconName; size?: number; filled?: boolean; label?: string; className?: string }) {
  return (
    <span
      className={['icon', filled ? 'icon-filled' : '', className ?? ''].join(' ')}
      style={{ fontSize: size }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {glyph(name)}
    </span>
  );
}
