// file: app/study/waza/cards/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export default function StudyWazaCardsMenuPage() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // cards用モード: range / custom / all
  const [mode, setMode] = useState('range');

  // 100話ごと
  const [rangeStart, setRangeStart] = useState(1);

  // 手入力
  const [customStart, setCustomStart] = useState(1);
  const [customEnd, setCustomEnd] = useState(20);

  // 絞り込み（カードでも）
  const [who, setWho] = useState('ALL');
  const [whom, setWhom] = useState('ALL');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/waza', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          setRows([]);
          setMsg(data?.error || `取得失敗（status=${res.status}）`);
          return;
        }
        setRows(data?.rows || []);
      } catch {
        setRows([]);
        setMsg('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const maxEpisode = useMemo(() => {
    if (!rows?.length) return 0;
    return rows[rows.length - 1]?.episode || 0;
  }, [rows]);

  const rangeOptions = useMemo(() => {
    const max = maxEpisode || 0;
    if (max <= 0) return [{ start: 1, end: 100 }];
    const opts = [];
    for (let s = 1; s <= max; s += 100) {
      const e = Math.min(max, s + 99);
      opts.push({ start: s, end: e });
    }
    return opts;
  }, [maxEpisode]);

  const currentRange = useMemo(() => {
    const end = Math.min(maxEpisode || 0, rangeStart + 99);
    return { start: rangeStart, end };
  }, [rangeStart, maxEpisode]);

  const customRange = useMemo(() => {
    const s = Math.max(1, Number(customStart || 1));
    const eRaw = Number(customEnd || s);
    const e = Math.min(maxEpisode || eRaw, Math.max(s, eRaw));
    return { start: s, end: e };
  }, [customStart, customEnd, maxEpisode]);

  const whoOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows || []) {
      if (r?.who && r.who !== '—') set.add(r.who);
    }
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))];
  }, [rows]);

  const whomOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows || []) {
      if (r?.whom && r.whom !== '—') set.add(r.whom);
    }
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))];
  }, [rows]);

  const startHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('mode', mode);

    if (mode === 'range') {
      params.set('rangeStart', String(currentRange.start));
      params.set('rangeEnd', String(currentRange.end));
    } else if (mode === 'custom') {
      params.set('rangeStart', String(customRange.start));
      params.set('rangeEnd', String(customRange.end));
    } else {
      params.set('rangeStart', '1');
      params.set('rangeEnd', String(maxEpisode || 0));
    }

    params.set('who', who);
    params.set('whom', whom);

    return `/study/waza/cards/play?${params.toString()}`;
  }, [mode, currentRange.start, currentRange.end, customRange.start, customRange.end, maxEpisode, who, whom]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">🗂️ 単語カード：技</h1>
          <Link href="/study/waza" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            技へ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-cyan-400 bg-cyan-50 p-4 shadow-sm">
          <p className="text-[12px] text-cyan-950 leading-relaxed">
            話数カードをめくって「技名」を覚えるモードです。
            <br />
            「覚えた」にしたカードは、進捗リセットまで出なくなります。
          </p>
        </div>

        {msg && (
          <div className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs">
            {msg}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* モード */}
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-slate-900 mb-2">モード</p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('range')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'range' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                100話ごと
              </button>

              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'custom' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                範囲入力
              </button>

              <button
                type="button"
                onClick={() => setMode('all')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                全技
              </button>
            </div>

            {mode === 'range' && (
              <div className="mt-3">
                <label className="text-xs font-bold text-slate-700">開始範囲</label>
                <select
                  className="mt-1 w-full border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Number(e.target.value))}
                  disabled={loading || !rangeOptions?.length}
                >
                  {rangeOptions.map((o) => (
                    <option key={o.start} value={o.start}>
                      {o.start}〜{o.end}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-slate-600">今のデータ上限：{maxEpisode || '---'}話</p>
              </div>
            )}

            {mode === 'custom' && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-600 mb-2">例：1〜20 みたいに小刻みにできます</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700">開始</label>
                    <input
                      className="mt-1 w-full border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
                      type="number"
                      min={1}
                      max={maxEpisode || 99999}
                      value={customStart}
                      onChange={(e) => setCustomStart(Number(e.target.value))}
                      disabled={loading || !rows.length}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">終了</label>
                    <input
                      className="mt-1 w-full border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
                      type="number"
                      min={1}
                      max={maxEpisode || 99999}
                      value={customEnd}
                      onChange={(e) => setCustomEnd(Number(e.target.value))}
                      disabled={loading || !rows.length}
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-600">
                  実際に使う範囲：{customRange.start}〜{customRange.end}
                </p>
              </div>
            )}

            {mode === 'all' && <p className="mt-3 text-[11px] text-slate-600">1話〜{maxEpisode || '---'}話まで</p>}
          </div>

          {/* 絞り込み */}
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-slate-900 mb-2">キャラで絞り込み</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-700">誰が（使用者）</label>
                <select
                  className="mt-1 w-full border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  disabled={loading || !rows.length}
                >
                  {whoOptions.map((x) => (
                    <option key={x} value={x}>
                      {x === 'ALL' ? '指定なし' : x}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">誰に（被使用者）</label>
                <select
                  className="mt-1 w-full border border-slate-300 rounded-xl p-2 bg-white text-slate-900"
                  value={whom}
                  onChange={(e) => setWhom(e.target.value)}
                  disabled={loading || !rows.length}
                >
                  {whomOptions.map((x) => (
                    <option key={x} value={x}>
                      {x === 'ALL' ? '指定なし' : x}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-slate-600">※両方指定もOK（AND条件）</p>
          </div>

          {/* 開始 */}
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
            <Link
              href={startHref}
              className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                loading || !rows.length ? 'bg-gray-400 pointer-events-none' : 'bg-emerald-600 active:bg-emerald-700'
              }`}
            >
              {loading
                ? '読み込み中...'
                : mode === 'all'
                ? '全技カードを開始'
                : mode === 'custom'
                ? `${customRange.start}〜${customRange.end} のカードを開始`
                : `${currentRange.start}〜${currentRange.end} のカードを開始`}
            </Link>

            <p className="mt-2 text-[11px] text-emerald-900">※カードは自動セーブされます（範囲＋絞り込みごとに別保存）</p>
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
