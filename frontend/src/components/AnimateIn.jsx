import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const VARIANT_CLASS = {
  'slide-up': 'animate-slide-up',
  fade: 'animate-fade-in',
  scale: 'animate-scale-in',
};

/**
 * Reveal children with a one-shot animation (on scroll or immediately on mount).
 */
export default function AnimateIn({
  children,
  className = '',
  delay = 0,
  variant = 'slide-up',
  immediate = false,
  as: Component = 'div',
}) {
  const ref = useRef(null);
  const prefersReduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(prefersReduced);

  useEffect(() => {
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    if (immediate) {
      const t = window.setTimeout(() => setVisible(true), Math.max(0, delay));
      return () => clearTimeout(t);
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -48px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReduced, immediate, delay]);

  const animClass = VARIANT_CLASS[variant] || VARIANT_CLASS['slide-up'];

  return (
    <Component
      ref={ref}
      className={`${visible ? animClass : 'opacity-0'} ${className}`.trim()}
      style={
        visible && !prefersReduced
          ? { animationDelay: `${delay}ms`, animationFillMode: 'both' }
          : undefined
      }
    >
      {children}
    </Component>
  );
}
