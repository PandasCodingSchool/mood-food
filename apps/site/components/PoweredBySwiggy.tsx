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
      {/* Sits on the light Swiggy panel, so the original-colour transparent logo. */}
      <Image src="/moodfood-mark-light.png" alt="MoodFood" width={Math.round(size * 1.3)} height={Math.round(size * 1.3 * (538 / 640))} className="brand-logo" />
      <Icon name="add" size={28} />
      <SwiggyMark size="lg" inverse />
    </div>
  );
}
