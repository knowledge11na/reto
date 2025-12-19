'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const DURATION_MS = 520; // CSSのアニメ時間と揃える

export default function RouteRipple() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const timerRef = useRef(null);
  const firstRef = useRef(true);

  useEffect(() => {
    // 初回表示は鳴らさない（初回SSR→CSRの見え方を安定させる）
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }

    setActive(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setActive(false), DURATION_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [pathname]);

  return (
    <div className={`routeRipple ${active ? 'isActive' : ''}`} aria-hidden="true">
      <div className="routeRipple__ring" />
      <div className="routeRipple__ring routeRipple__ring--2" />
    </div>
  );
}
