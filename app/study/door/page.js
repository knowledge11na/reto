// file: app/study/door/page.js
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

function buildSaveKey({ sheet }) {
  const s = String(sheet || 'ALL');
  return `study_door_save_${s}`;
}

export default function StudyDoorPage() {
  const [rows, setRows] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // mode: play / cards
  const [mode, setMode] = useState('play');

  // sheet selection
  const [sheet, setSheet] = useState('ALL');

  // 設定（技/サブタイ同様）
  const [optIgnoreWrongAndGo, setOptIgnoreWrongAndGo] = useState(true);

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

  // シート候補：Excelの並び順を維持（左→右）＋ ALL を先頭
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

  // ALL を先頭
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
    params.set('ignoreWrongAndGo', optIgnoreWrongAndGo ? '1' : '0');

    if (mode === 'cards') return `/study/door/cards/play?${params.toString()}`;
    return `/study/door/play?${params.toString()}&resume=0`;
  }, [mode, sheet, optIgnoreWrongAndGo]);

  const resumeHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('sheet', sheet);
    params.set('ignoreWrongAndGo', optIgnoreWrongAndGo ? '1' : '0');
    return `/study/door/play?${params.toString()}&resume=1`;
  }, [sheet, optIgnoreWrongAndGo]);

  const resumeInfo = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (mode === 'cards') return null;

    const saveKey = buildSaveKey({ sheet });
    try {
      const raw = window.localStorage.getItem(saveKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (typeof obj.idx !== 'number' || typeof obj.total !== 'number') return null;
      return {
        saveKey,
        idx: obj.idx,
        total: obj.total,
        elapsedMs: Number(obj.elapsedMs || 0),
      };
    } catch {
      return null;
    }
  }, [mode, sheet]);

  function resetProgress() {
    if (!confirm('進捗をリセットしますか？（続きデータを削除）')) return;
    try {
      const k = buildSaveKey({ sheet });
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
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 学習：扉絵</h1>
          <Link href="/study" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            学習メニューへ
          </Link>
        </header>

        <div className="rounded-2xl border border-cyan-400 bg-cyan-50 p-4 shadow-sm">
          <p className="text-[12px] text-cyan-950 leading-relaxed">
            シート名ごとに「問題→答え」を学習します。
            <br />
            ・<b>ALL</b>シートは「全ての扉絵」専用ボタン
            <br />
            ・判定：記号/！/ー/～/（ ）内を無視
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
                onClick={() => setMode('play')}
                className={`py-2 rounded-xl text-sm font-bold border ${
                  mode === 'play'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                解答（RTA）
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
          </div>

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
          {mode === 'play' && (
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
          )}

          {/* 開始 */}
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
            {mode === 'play' && resumeInfo ? (
              <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-[12px] text-amber-950 font-bold">
                  セーブデータあり：{resumeInfo.idx + 1}/{resumeInfo.total}（{msToClock(resumeInfo.elapsedMs)}）
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link
                    href={resumeHref}
                    className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                      loading || !rows.length
                        ? 'bg-gray-400 pointer-events-none'
                        : 'bg-amber-600 active:bg-amber-700'
                    }`}
                  >
                    続きから
                  </Link>
                  <button
                    type="button"
                    onClick={resetProgress}
                    className="py-3 rounded-full bg-rose-600 text-white font-extrabold shadow active:bg-rose-700"
                    disabled={loading}
                  >
                    リセット
                  </button>
                </div>
              </div>
            ) : null}

            <Link
              href={startHref}
              className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                loading || !rows.length ? 'bg-gray-400 pointer-events-none' : 'bg-emerald-600 active:bg-emerald-700'
              }`}
            >
              {loading ? '読み込み中...' : mode === 'cards' ? '単語カードを開始' : '開始'}
            </Link>

            <p className="mt-2 text-[11px] text-emerald-900">
              ※解答モードは自動セーブ（シートごとに保存）／カードも別保存
            </p>
          </div>

          <div className="text-center">
            <Link href="/" className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50">
              ホームへ戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
