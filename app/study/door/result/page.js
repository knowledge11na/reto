// file: app/study/door/result/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function pad2(n) {
  return String(n).padStart(2, '0');
}
function msToClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${pad2(s)}`;
}

export default function StudyDoorResultPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('study_door_last_result');
      if (raw) setData(JSON.parse(raw));
    } catch {}
  }, []);

  const mistakes = useMemo(() => (Array.isArray(data?.mistakes) ? data.mistakes : []), [data]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold">✅ 扉絵：結果</h1>
          <Link href="/study/door" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            扉絵へ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          {data ? (
            <>
              <p className="text-[12px] text-slate-700">
                シート：<b className="text-slate-900">{data.sheet}</b>
              </p>
              <p className="mt-2 text-sm">
                正解数：<b>{data.correct}</b>
              </p>
              <p className="text-sm">
                タイム：<b>{msToClock(data.timeMs)}</b>
              </p>

              <p className="mt-3 text-[12px] text-slate-700">
                ミス：<b className="text-slate-900">{mistakes.length}</b>
              </p>

              {mistakes.length > 0 && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[12px] font-extrabold text-slate-900 mb-2">間違い一覧</p>
                  <div className="space-y-2">
                    {mistakes.slice(0, 50).map((m, i) => (
                      <div key={i} className="text-[12px] text-slate-800">
                        <div>
                          問題：<b>{m.q}</b>
                        </div>
                        <div>
                          正解：<b>{m.correct}</b>
                        </div>
                        <div className="text-slate-600">あなた：{m.userAnswer}</div>
                      </div>
                    ))}
                    {mistakes.length > 50 && <div className="text-[11px] text-slate-500">※先頭50件だけ表示</div>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-700">結果データがありません</p>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
