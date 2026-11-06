'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const DECKS_KEY = 'tcg_custom_decks';

const CPU_DECKS = [
  ['random', 'ランダム'],
  ['standard', 'スタンダード'],
  ['villains', 'ヴィランズ'],
  ['revolution', '革命軍'],
  ['world', '世界会議'],
  ['kid', 'キッド海賊団'],
  ['prisoner', '囚人'],
  ['shabondy', 'シャボン舞う諸島'],
];

export default function SoloTcgMenu() {
  const [cpu, setCpu] = useState('random');
  const [mine, setMine] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const list = JSON.parse(localStorage.getItem(DECKS_KEY) || '[]');
        setMine(list.map((d) => ({ id: String(d.id), name: String(d.name || 'マイデッキ') })));
      } catch {
        setMine([]);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const battleHref =
    cpu === 'random' ? '/free/tcg?solo=1' : `/free/tcg?solo=1&cpu=${encodeURIComponent(cpu)}`;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-center text-xl font-extrabold text-slate-900">KNOWLEDGE TCG（ソロ用）</h1>
        <p className="text-center text-[12px] leading-relaxed text-slate-700">
          CPUはカード効果で問題を解けないため、CPUの効果の問題はあなたに出題されます。
          <br />
          あなたが不正解だとCPUの効果が成功し、正解すると失敗します。
        </p>

        <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
          <label className="block text-[12px] font-bold text-slate-800">
            CPUのデッキ
            <select
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              {CPU_DECKS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              {mine.map((d) => (
                <option key={d.id} value={`my:${d.id}`}>
                  マイデッキ：{d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Link
          href={battleHref}
          className="block rounded-2xl border border-rose-400 bg-rose-50 px-4 py-5 shadow-sm transition hover:bg-rose-100"
        >
          <p className="text-base font-extrabold text-rose-900">CPUと対戦</p>
          <p className="mt-2 text-[12px] leading-relaxed text-rose-950">
            デッキを選んで、CPUと対戦します。
          </p>
        </Link>

        <Link
          href="/free/tcg?solo=1&edit=1"
          className="block rounded-2xl border border-sky-400 bg-sky-50 px-4 py-5 shadow-sm transition hover:bg-sky-100"
        >
          <p className="text-base font-extrabold text-sky-900">デッキ編集</p>
          <p className="mt-2 text-[12px] leading-relaxed text-sky-950">
            デッキの作成・編集・保存ができます（フリー対戦と共通）。
          </p>
        </Link>

        <div className="pt-2 text-center">
          <Link href="/solo" className="text-sm text-slate-600 underline">
            ソロモード一覧に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
