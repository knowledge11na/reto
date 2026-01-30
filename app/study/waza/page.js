// file: app/study/waza/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function pad2(n) {
  return String(n).padStart(2, '0');
}
function msToClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${pad2(s)}`;
}

function buildSaveKey({ mode, rangeStart, rangeEnd, who, whom }) {
  const m = mode || 'range';
  const rs = Number(rangeStart || 1);
  const re = Number(rangeEnd || 0);
  const a = String(who || 'ALL');
  const b = String(whom || 'ALL');
  return `study_waza_save_${m}_${rs}_${re}_${a}_${b}`;
}

export default function StudyWazaPage() {
  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  // mode: range / custom / all / cards
  const [mode, setMode] = useState('range');

  // range 100話ごと
  const [rangeStart, setRangeStart] = useState(1);

  // custom
  const [customStart, setCustomStart] = useState(1);
  const [customEnd, setCustomEnd] = useState(20);

  // 絞り込み
  const [who, setWho] = useState('ALL');
  const [whom, setWhom] = useState('ALL');

  // 設定（技はこれだけ）
  const [optIgnoreWrongAndGo, setOptIgnoreWrongAndGo] = useState(true);

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

  // いま画面で選ばれている「実範囲」
  const selectedRange = useMemo(() => {
    if (mode === 'custom') return { start: customRange.start, end: customRange.end };
    if (mode === 'range') return { start: currentRange.start, end: currentRange.end };
    // all
    return { start: 1, end: maxEpisode || 0 };
  }, [mode, customRange.start, customRange.end, currentRange.start, currentRange.end, maxEpisode]);

  // ★この条件のセーブキー
  const selectedSaveKey = useMemo(() => {
    if (mode === 'cards') return null;
    return buildSaveKey({
      mode,
      rangeStart: selectedRange.start,
      rangeEnd: selectedRange.end,
      who,
      whom,
    });
  }, [mode, selectedRange.start, selectedRange.end, who, whom]);

  // セーブ情報（この条件）
  const resumeInfo = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (mode === 'cards') return null;
    if (!selectedSaveKey) return null;

    try {
      const raw = window.localStorage.getItem(selectedSaveKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (typeof obj.idx !== 'number' || typeof obj.total !== 'number') return null;
      return {
        saveKey: selectedSaveKey,
        idx: obj.idx,
        total: obj.total,
        elapsedMs: Number(obj.elapsedMs || 0),
      };
    } catch {
      return null;
    }
  }, [mode, selectedSaveKey, refresh]);

  // start / resume / cards のhref
  const startHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('rangeStart', String(selectedRange.start));
    params.set('rangeEnd', String(selectedRange.end));
    params.set('who', who);
    params.set('whom', whom);
    params.set('ignoreWrongAndGo', optIgnoreWrongAndGo ? '1' : '0');

    // ★開始は必ず新規扱い（play側は resume=1 のときだけ復元）
    params.set('resume', '0');

    if (mode === 'cards') return '/study/waza/cards';
    return `/study/waza/play?${params.toString()}`;
  }, [mode, selectedRange.start, selectedRange.end, who, whom, optIgnoreWrongAndGo]);

  const resumeHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('rangeStart', String(selectedRange.start));
    params.set('rangeEnd', String(selectedRange.end));
    params.set('who', who);
    params.set('whom', whom);
    params.set('ignoreWrongAndGo', optIgnoreWrongAndGo ? '1' : '0');
    params.set('resume', '1');
    return `/study/waza/play?${params.toString()}`;
  }, [mode, selectedRange.start, selectedRange.end, who, whom, optIgnoreWrongAndGo]);

  // 自己ベスト
  const bestKey = useMemo(() => {
    if (mode === 'all') return `study_waza_best_all_${who}_${whom}`;
    if (mode === 'custom') return `study_waza_best_custom_${customRange.start}_${customRange.end}_${who}_${whom}`;
    if (mode === 'range') return `study_waza_best_${currentRange.start}_${currentRange.end}_${who}_${whom}`;
    return `study_waza_best_cards_${selectedRange.start}_${selectedRange.end}_${who}_${whom}`;
  }, [mode, who, whom, customRange.start, customRange.end, currentRange.start, currentRange.end, selectedRange.start, selectedRange.end]);

  const best = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(bestKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj;
    } catch {
      return null;
    }
  }, [bestKey, refresh]);

  function removeSelectedSave(silent = false) {
    if (typeof window === 'undefined') return false;
    if (!selectedSaveKey) return false;
    try {
      window.localStorage.removeItem(selectedSaveKey);
      setRefresh((x) => x + 1);
      if (!silent) setMsg('進捗をリセットしました');
      return true;
    } catch {
      if (!silent) setMsg('リセットに失敗しました');
      return false;
    }
  }

  // ★「開始（最初から）」は、まずこの条件のセーブを消してから遷移
  function onStartFresh() {
    if (loading || !rows.length) return;
    if (mode === 'cards') {
      router.push(startHref);
      return;
    }
    // セーブが無くてもOK。あれば消す。
    removeSelectedSave(true);
    router.push(startHref);
  }

  function onResetProgress() {
    if (mode === 'cards') return;
    if (!selectedSaveKey) return;
    if (!confirm('この条件の進捗（セーブ）をリセットしますか？')) return;
    removeSelectedSave(false);
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 学習：技</h1>
          <Link href="/study" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            学習メニューへ
          </Link>
        </header>

        <div className="rounded-2xl border border-cyan-400 bg-cyan-50 p-4 shadow-sm">
          <p className="text-[12px] text-cyan-950 leading-relaxed">
            話数順に「技名」を答える学習です。
            <br />
            ※判定ルールは技専用（不要ワード・記号・（ ）などを自動除外）
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

            <div className="grid grid-cols-2 gap-2">
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
                範囲を手入力
              </button>

              <button
                type="button"
                onClick={() => setMode('all')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                全技RTA
              </button>

              <button
                type="button"
                onClick={() => setMode('cards')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'cards' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                単語カード
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
            {mode === 'cards' && <p className="mt-3 text-[11px] text-slate-600">単語帳みたいにめくって覚える</p>}
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

          {/* 設定 */}
          <div className="rounded-2xl border border-indigo-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-indigo-950 mb-2">開始前設定</p>

            <label className="flex items-start gap-2 text-[12px] text-indigo-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={optIgnoreWrongAndGo}
                onChange={(e) => setOptIgnoreWrongAndGo(e.target.checked)}
              />
              <span>
                <b>間違えても</b>答え表示後に無視して次へ進む（OFFだと正解するまで次へ進まない／<b>スキップ</b>のみ次へ）
              </span>
            </label>
          </div>

          {/* 自己ベスト + 開始 */}
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
            <p className="text-sm font-extrabold text-emerald-950 mb-1">自己ベスト</p>

            {best ? (
              <div className="text-[12px] text-emerald-950">
                <p>
                  正解数：<b>{best.correct}</b>
                </p>
                <p>
                  タイム：<b>{msToClock(best.timeMs)}</b>
                </p>
                <p className="text-[10px] text-emerald-800 mt-1">正解数優先／同点ならタイムが速い方</p>
              </div>
            ) : (
              <p className="text-[12px] text-emerald-950">まだ記録がありません</p>
            )}

            {/* cards以外は常に「開始/再開/リセット」を出す */}
            {mode !== 'cards' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onStartFresh}
                  disabled={loading || !rows.length}
                  className={`py-3 rounded-full text-white font-extrabold shadow ${
                    loading || !rows.length ? 'bg-gray-400' : 'bg-emerald-600 active:bg-emerald-700'
                  }`}
                >
                  最初から開始
                </button>

                <Link
                  href={resumeHref}
                  className={`block text-center py-3 rounded-full text-white font-extrabold shadow ${
                    loading || !rows.length || !resumeInfo
                      ? 'bg-gray-400 pointer-events-none'
                      : 'bg-amber-600 active:bg-amber-700'
                  }`}
                >
                  続きから再開
                </Link>

                <button
                  type="button"
                  onClick={onResetProgress}
                  disabled={loading || !rows.length || !resumeInfo}
                  className={`col-span-2 py-3 rounded-full font-extrabold shadow border ${
                    loading || !rows.length || !resumeInfo
                      ? 'bg-white border-slate-200 text-slate-300'
                      : 'bg-white border-rose-300 text-rose-700 active:bg-rose-50'
                  }`}
                >
                  進捗リセット
                </button>

                {resumeInfo && (
                  <p className="col-span-2 text-[11px] text-amber-900 mt-1">
                    セーブあり：{resumeInfo.idx + 1}/{resumeInfo.total}（{msToClock(resumeInfo.elapsedMs)}）
                  </p>
                )}
              </div>
            )}

            {/* cardsは普通にリンクでOK */}
            {mode === 'cards' && (
              <div className="mt-3">
                <Link
                  href={startHref}
                  className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                    loading || !rows.length ? 'bg-gray-400 pointer-events-none' : 'bg-slate-900 active:bg-slate-800'
                  }`}
                >
                  単語カードを開く
                </Link>
              </div>
            )}
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
