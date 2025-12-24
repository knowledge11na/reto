// file: app/solo/speed/play/page.js
'use client';

import { Suspense } from 'react';
import SpeedPlayInner from './SpeedPlayInner';

export default function SpeedPlayPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-emerald-950 text-emerald-50 p-4">
          <div className="max-w-3xl mx-auto">読み込み中…</div>
        </main>
      }
    >
      <SpeedPlayInner />
    </Suspense>
  );
}
