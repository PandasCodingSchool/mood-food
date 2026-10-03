// "Powered by Swiggy" attribution required by the Swiggy partnership.
// Text lockup in Swiggy orange; swap in the official logo from Swiggy's partner
// kit when available rather than redrawing it.
export function PoweredBySwiggy({ className }: { className?: string }) {
  return (
    <p className={['powered', className ?? ''].join(' ')}>
      <span>Powered by</span> <strong>Swiggy</strong>
    </p>
  );
}
