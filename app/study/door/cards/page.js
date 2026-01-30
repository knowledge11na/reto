'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function buildCardsKey({ sheet, randomOrder }) {
  const s = String(sheet || 'ALL');
  const rnd = randomOrder ? 1 : 0;
  return `study_door_cards_${s}_${rnd}`;
}

export default function StudyDoorCardsMenuPage() {
  const [rows, setRows] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const [sheet, setSheet] = useState('ALL');
  const [optRandomOrder, setOptRandomOrder] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/door', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          setRows([]);
          setSheets([]);
          setMsg(data?.error || `取得失敗（status=${res.status}）`);
          return;
        }
        setRows(data?.rows || []);
        setSheets(data?.sheets || []);
      } catch {
        setRows([]);
        setSheets([]);
        setMsg('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Excelの並び順を維持（左→右）＋ ALL を先頭
  const sheetOptions = useMemo(() => {
    const arr = [];
    const seen = new Set();
    for (const s of sheets || []) {
      const name = String(s || '').trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      arr.push(name);
    }
    if (!arr.includes('ALL')) return ['ALL', ...arr];
    return ['ALL', ...arr.filter((x) => x !== 'ALL')];
  }, [sheets]);

  const filteredCount = useMemo(() => {
    if (!rows?.length) return 0;
    return rows.filter((r) => (sheet === 'ALL' ? r.sheet === 'ALL' : r.sheet === sheet)).length;
  }, [rows, sheet]);

  const startHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('sheet', sheet);
    params.set('randomOrder', optRandomOrder ? '1' : '0');
    return `/study/door/cards/play?${params.toString()}`;
  }, [sheet, optRandomOrder]);

  function resetCardsProgress() {
    if (!confirm('カードの進捗をリセットしますか？（覚えたが全て復活）')) return;
    try {
      const k = buildCardsKey({ sheet, randomOrder: optRandomOrder });
      window.localStorage.removeItem(k);
      alert('リセットしました');
    } catch {
      alert('リセットに失敗しました');
    }
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">🗂️ 単語カード：扉絵</h1>
          <Link href="/study/door" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            扉絵へ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-cyan-400 bg-cyan-50 p-4 shadow-sm">
          <p className="text-[12px] text-cyan-950 leading-relaxed">
            シリーズ（シート）ごとにカード学習します。
            <br />
            ・<b>ALL</b>は「全ての扉絵」専用
            <br />
            ・カードは自動セーブ（シート＋ランダムごとに別保存）
          </p>
        </div>

        {msg && (
          <div className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs">
            {msg}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* シート選択 */}
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-slate-900 mb-2">シリーズ（シート）</p>

            <select
              className="w-full border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              disabled={loading || !sheetOptions.length}
            >
              {sheetOptions.map((x) => (
                <option key={x} value={x}>
                  {x === 'ALL' ? 'ALL（全ての扉絵）' : x}
                </option>
              ))}
            </select>

            <p className="mt-2 text-[11px] text-slate-600">
              このシートの出題数：{loading ? '---' : filteredCount}
            </p>
          </div>

          {/* 設定 */}
          <div className="rounded-2xl border border-indigo-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-indigo-950 mb-2">設定</p>

            <label className="flex items-start gap-2 text-[12px] text-indigo-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={optRandomOrder}
                onChange={(e) => setOptRandomOrder(e.target.checked)}
              />
              <span>
                出題順を<b>ランダム</b>にする（デフォOFF）
              </span>
            </label>
          </div>

          {/* 開始 */}
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
            <Link
              href={startHref}
              className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                loading || !rows.length ? 'bg-gray-400 pointer-events-none' : 'bg-emerald-600 active:bg-emerald-700'
              }`}
            >
              {loading ? '読み込み中...' : 'カードを開始'}
            </Link>

            <button
              type="button"
              onClick={resetCardsProgress}
              className="mt-2 w-full py-3 rounded-full bg-rose-600 text-white font-extrabold shadow active:bg-rose-700 disabled:bg-gray-400"
              disabled={loading}
            >
              進捗リセット
            </button>

            <p className="mt-2 text-[11px] text-emerald-900">
              ※シート＋ランダムごとに別保存（別条件の進捗には影響しません）
            </p>
          </div>

          <div className="text-center">
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
            >
              ホームへ戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
