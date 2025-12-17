import { Suspense } from 'react';
import MultiMeteorBattleClient from './MultiMeteorBattleClient';

export default function Page() {
  // useSearchParams を Client 側に逃がすため Suspense で包む
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-slate-200 p-4">対戦情報を取得中...</div>}>
      <MultiMeteorBattleClient />
    </Suspense>
  );
}
