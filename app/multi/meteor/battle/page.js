// file: app/multi/meteor/battle/page.js
import { Suspense } from 'react';
import MultiMeteorBattleClient from './MultiMeteorBattleClient';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4">
          対戦情報を取得中...
        </div>
      }
    >
      <MultiMeteorBattleClient />
    </Suspense>
  );
}
