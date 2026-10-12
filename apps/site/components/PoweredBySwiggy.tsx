import Image from 'next/image';
import { Icon } from '@/components/Icon';

// "Powered by Swiggy" attribution required by the Swiggy partnership.
// Text lockup in Swiggy orange; swap in the official logo from Swiggy's partner
// kit when available rather than redrawing it.
export function SwiggyMark({ size = 'md', inverse }: { size?: 'md' | 'lg'; inverse?: boolean }) {
  return (
    <span className={['swiggy-mark', `swiggy-mark-${size}`, inverse ? 'swiggy-mark-inverse' : ''].join(' ')}>
      <Icon name="location_on" size={size === 'lg' ? 28 : 22} filled />
      Swiggy
    </span>
  );
}

export function PoweredBySwiggy({ className }: { className?: string }) {
  return (
    <div className={['powered', className ?? ''].join(' ')}>
      <span className="eyebrow">Powered by</span>
      <SwiggyMark />
      <span className="powered-note">Your restaurants, riders and payments</span>
    </div>
  );
}

/** MoodFood + Swiggy logo lockup. */
export function PartnerLockup({ size = 64 }: { size?: number }) {
  return (
    <div className="lockup">
      <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.28 }}>
        <Image src="/moodfood-logo.png" alt="MoodFood" width={size - 4} height={size - 4} />
      </span>
      <Icon name="add" size={28} />
      <SwiggyMark size="lg" inverse />
    </div>
  );
}
