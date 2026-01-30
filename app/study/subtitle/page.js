// file: app/study/subtitle/page.js
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

// セーブキー（プレイ途中の復元用）
function buildSaveKey({ mode, rangeStart, rangeEnd, randomOrder }) {
  const m = mode || 'range';
  const rs = Number(rangeStart || 1);
  const re = Number(rangeEnd || 0);
  const rnd = randomOrder ? 1 : 0;
  return `study_subtitle_save_${m}_${rs}_${re}_${rnd}`;
}

export default function StudySubtitlePage() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // モード: range(100話ごと) / custom(手入力範囲) / all(全話RTA) / cards(単語カード)
  const [mode, setMode] = useState('range');

  // 100話ごと
  const [rangeStart, setRangeStart] = useState(1);

  // 手入力
  const [customStart, setCustomStart] = useState(1);
  const [customEnd, setCustomEnd] = useState(20);

  // 設定
  const [optIgnoreSymbols, setOptIgnoreSymbols] = useState(true); // ①記号無視
  const [optKanaFree, setOptKanaFree] = useState(true); // ②ひら/カタ不問
  const [optIgnoreWrongAndGo, setOptIgnoreWrongAndGo] = useState(true); // ③間違い後進む
  const [optRandomOrder, setOptRandomOrder] = useState(false); // ★順番ランダム（デフォOFF）
  // hydration対策（localStorage参照をマウント後に限定）
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/subtitles', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          setRows([]);
          setMsg(data?.error || `取得失敗（status=${res.status}）`);
          return;
        }
        setRows(data?.rows || []);
      } catch (e) {
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
    return rows[rows.length - 1].episode || 0;
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

  // ★この条件のセーブキー（play復元/リセット用）
  const selectedSaveKey = useMemo(() => {
    const isPlayMode = mode !== 'cards';
    if (!isPlayMode) return null;

    const rs =
      mode === 'custom' ? customRange.start : mode === 'range' ? currentRange.start : 1;
    const re =
      mode === 'custom'
        ? customRange.end
        : mode === 'range'
        ? currentRange.end
        : maxEpisode || 0;

    return buildSaveKey({
      mode: mode === 'custom' ? 'custom' : mode === 'all' ? 'all' : 'range',
      rangeStart: rs,
      rangeEnd: re,
      randomOrder: optRandomOrder,
    });
  }, [
    mode,
    customRange.start,
    customRange.end,
    currentRange.start,
    currentRange.end,
    maxEpisode,
    optRandomOrder,
  ]);

  // bestKey（自己ベストは「範囲＋ランダム有無」ごとに分ける）
  const bestKey = useMemo(() => {
    const rnd = optRandomOrder ? 'rand1' : 'rand0';
    if (mode === 'all') return `study_subtitle_best_all_${rnd}`;
    if (mode === 'custom')
      return `study_subtitle_best_custom_${customRange.start}_${customRange.end}_${rnd}`;
    // range(100話)
    return `study_subtitle_best_${currentRange.start}_${currentRange.end}_${rnd}`;
  }, [
    mode,
    currentRange.start,
    currentRange.end,
    customRange.start,
    customRange.end,
    optRandomOrder,
  ]);

  const best = useMemo(() => {
    if (!mounted) return null;
    try {
      const raw = window.localStorage.getItem(bestKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj;
    } catch {
      return null;
    }
  }, [bestKey, mounted]);

  // プレイURL（play と cards を分ける） ※開始は必ず resume=0
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
      // all
      params.set('rangeStart', '1');
      params.set('rangeEnd', String(maxEpisode || 0));
    }

    params.set('ignoreSymbols', optIgnoreSymbols ? '1' : '0');
    params.set('kanaFree', optKanaFree ? '1' : '0');
    params.set('ignoreWrongAndGo', optIgnoreWrongAndGo ? '1' : '0');
    params.set('randomOrder', optRandomOrder ? '1' : '0');

    if (mode === 'cards') return `/study/subtitle/cards?${params.toString()}`;

    params.set('resume', '0');
    return `/study/subtitle/play?${params.toString()}`;
  }, [
    mode,
    currentRange.start,
    currentRange.end,
    customRange.start,
    customRange.end,
    maxEpisode,
    optIgnoreSymbols,
    optKanaFree,
    optIgnoreWrongAndGo,
    optRandomOrder,
  ]);

  // 再開（該当キーがある時だけ出す）
  const resumeInfo = useMemo(() => {
    if (!mounted) return null;
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
  }, [mode, selectedSaveKey, mounted]);

  // 再開リンク（resume=1）
  const resumeHref = useMemo(() => {
    if (mode === 'cards') return startHref;
    const qs = startHref.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    params.set('resume', '1');
    return `/study/subtitle/play?${params.toString()}`;
  }, [startHref, mode]);

  function removeSelectedSave(silent = false) {
    if (typeof window === 'undefined') return false;
    if (!selectedSaveKey) return false;
    try {
      window.localStorage.removeItem(selectedSaveKey);
      if (!silent) setMsg('進捗をリセットしました');
      return true;
    } catch {
      if (!silent) setMsg('リセットに失敗しました');
      return false;
    }
  }

  function onStartFresh() {
    if (loading || !rows.length) return;
    if (mode === 'cards') return;
    // この条件のセーブだけ消して、新規開始へ
    removeSelectedSave(true);
    window.location.href = startHref; // resume=0
  }

  function onResetProgress() {
    if (mode === 'cards') return;
    if (!resumeInfo) return;
    if (!confirm('この条件の進捗（セーブ）をリセットしますか？')) return;
    removeSelectedSave(false);
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 学習：サブタイ</h1>
          <Link
            href="/study"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            学習メニューへ
          </Link>
        </header>

        <div className="rounded-2xl border border-cyan-400 bg-cyan-50 p-4 shadow-sm">
          <p className="text-[12px] text-cyan-950 leading-relaxed">
            話数（第◯話）→サブタイトルを覚える学習です。
            <br />
            ※どのモードでも「（）」と中身は自動で無視（全角/半角OK）
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
                  mode === 'range'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                100話ごと
              </button>

              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'custom'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                範囲を手入力
              </button>

              <button
                type="button"
                onClick={() => setMode('all')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                全話RTA
              </button>

              <button
                type="button"
                onClick={() => setMode('cards')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'cards'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
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
                <p className="mt-2 text-[11px] text-slate-600">
                  今のデータ上限：{maxEpisode || '---'}話
                </p>
              </div>
            )}

            {mode === 'custom' && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-600 mb-2">
                  例：1〜20 みたいに小刻みに覚えられます
                </p>
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

            {mode === 'all' && (
              <p className="mt-3 text-[11px] text-slate-600">
                1話〜{maxEpisode || '---'}話まで順番に出題
              </p>
            )}

            {mode === 'cards' && (
              <p className="mt-3 text-[11px] text-slate-600">
                単語帳みたいにめくって覚えるモード
              </p>
            )}
          </div>

          {/* 設定 */}
          <div className="rounded-2xl border border-indigo-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-indigo-950 mb-2">開始前設定</p>

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

            <div className="h-px bg-indigo-100 my-3" />

            <label className="flex items-start gap-2 text-[12px] text-indigo-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={optIgnoreSymbols}
                onChange={(e) => setOptIgnoreSymbols(e.target.checked)}
              />
              <span>
                ①「」・、。など <b>記号を無視</b>する（半角/全角も問わない）
              </span>
            </label>

            <label className="mt-2 flex items-start gap-2 text-[12px] text-indigo-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={optKanaFree}
                onChange={(e) => setOptKanaFree(e.target.checked)}
              />
              <span>
                <b>カタカナ/ひらがな表記を問わない</b>
              </span>
            </label>

            <label className="mt-2 flex items-start gap-2 text-[12px] text-indigo-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={optIgnoreWrongAndGo}
                onChange={(e) => setOptIgnoreWrongAndGo(e.target.checked)}
              />
              <span>
                <b>間違えても</b>答え表示後に無視して次へ進む（OFFだと正解するまで次へ進まない／
                <b>スキップ</b>のみ次へ）
              </span>
            </label>
          </div>

          {/* 自己ベスト */}
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
                <p className="text-[10px] text-emerald-800 mt-1">
                  ルール：正解数が最も多い記録を優先。同点ならタイムが速い方。
                </p>
              </div>
            ) : (
              <p className="text-[12px] text-emerald-950">まだ記録がありません</p>
            )}

            {/* 再開ボタン（playのみ） */}
            {resumeInfo && (
              <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-[12px] text-amber-950 font-bold">
                  セーブデータあり：{resumeInfo.idx + 1}/{resumeInfo.total}（
                  {msToClock(resumeInfo.elapsedMs)}）
                </p>

                <Link
                  href={resumeHref}
                  className={`mt-2 block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                    loading || !rows.length
                      ? 'bg-gray-400 pointer-events-none'
                      : 'bg-amber-600 active:bg-amber-700'
                  }`}
                >
                  続きから再開
                </Link>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onStartFresh}
                    disabled={loading || !rows.length}
                    className={`py-2 rounded-full font-extrabold shadow text-white ${
                      loading || !rows.length
                        ? 'bg-gray-400'
                        : 'bg-slate-700 active:bg-slate-800'
                    }`}
                  >
                    最初から
                  </button>

                  <button
                    type="button"
                    onClick={onResetProgress}
                    disabled={loading || !rows.length}
                    className={`py-2 rounded-full font-extrabold shadow text-white ${
                      loading || !rows.length
                        ? 'bg-gray-400'
                        : 'bg-rose-600 active:bg-rose-700'
                    }`}
                  >
                    進捗リセット
                  </button>
                </div>
              </div>
            )}

            {/* セーブが無い時でも「最初から」ボタン欲しいなら出す */}
            {!resumeInfo && mode !== 'cards' && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onStartFresh}
                  disabled={loading || !rows.length}
                  className={`w-full py-3 rounded-full text-white font-extrabold shadow ${
                    loading || !rows.length ? 'bg-gray-400' : 'bg-slate-700 active:bg-slate-800'
                  }`}
                >
                  最初から開始（セーブ無し）
                </button>
              </div>
            )}

            <div className="mt-3">
              <Link
                href={startHref}
                className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                  loading || !rows.length
                    ? 'bg-gray-400 pointer-events-none'
                    : 'bg-emerald-600 active:bg-emerald-700'
                }`}
              >
                {loading
                  ? '読み込み中...'
                  : mode === 'cards'
                  ? '単語カードを開く'
                  : mode === 'all'
                  ? '全RTAを開始'
                  : mode === 'custom'
                  ? `${customRange.start}〜${customRange.end} を開始`
                  : `${currentRange.start}〜${currentRange.end} を開始`}
              </Link>
            </div>
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
