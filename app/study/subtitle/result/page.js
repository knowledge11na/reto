// file: app/study/subtitle/result/page.js
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

export default function StudySubtitleResultPage() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('study_subtitle_last_result');
      if (!raw) {
        setMsg('結果データが見つかりません（最初から開始してください）');
        setData(null);
        return;
      }
      const obj = JSON.parse(raw);
      setData(obj);
    } catch {
      setMsg('結果データの読み込みに失敗しました');
      setData(null);
    }
  }, []);

  const headerText = useMemo(() => {
    if (!data) return '';
    if (data.mode === 'all') return `全サブタイトルRTA（1〜${data.maxEpisode || '---'}）`;
    const end = Math.min(data.maxEpisode || 0, Number(data.rangeStart || 1) + 99);
    return `開始話数モード（${data.rangeStart || 1}〜${end}）`;
  }, [data]);

  const bestKey = useMemo(() => {
    if (!data) return '';
    if (data.mode === 'all') return `study_subtitle_best_all`;
    const end = Math.min(data.maxEpisode || 0, Number(data.rangeStart || 1) + 99);
    return `study_subtitle_best_${data.rangeStart || 1}_${end}`;
  }, [data]);

  const best = useMemo(() => {
    if (!bestKey) return null;
    try {
      const raw = window.localStorage.getItem(bestKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj;
    } catch {
      return null;
    }
  }, [bestKey]);

  const startHref = useMemo(() => {
    if (!data) return '/study/subtitle';
    const params = new URLSearchParams();
    params.set('mode', data.mode === 'all' ? 'all' : 'range');
    params.set('rangeStart', String(data.rangeStart || 1));

    const opts = data.opts || {};
    params.set('ignoreSymbols', opts.ignoreSymbols ? '1' : '0');
    params.set('kanaFree', opts.kanaFree ? '1' : '0');
    params.set('ignoreWrongAndGo', opts.ignoreWrongAndGo ? '1' : '0');

    return `/study/subtitle/play?${params.toString()}`;
  }, [data]);

  const mistakes = (data?.mistakes || []).filter(Boolean);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">📘 サブタイ学習：結果</h1>
            <p className="text-[11px] text-slate-700">{headerText}</p>
          </div>
          <Link
            href="/study/subtitle"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            戻る
          </Link>
        </header>

        {msg && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs mb-3">
            {msg}
          </div>
        )}

        {!data ? (
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-800">結果がありません。</p>
            <div className="mt-3">
              <Link
                href="/study/subtitle"
                className="block w-full text-center py-3 rounded-full text-white font-extrabold shadow bg-slate-800 active:bg-slate-900"
              >
                設定画面へ
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* スコア */}
            <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-slate-600">
                  タイム：<b className="text-slate-900">{msToClock(data.timeMs || 0)}</b>
                </p>
                <p className="text-[12px] text-slate-600">
                  正解数：<b className="text-slate-900">{data.correct || 0}</b>
                </p>
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[12px] text-emerald-950 font-bold mb-1">自己ベスト（このモード）</p>
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
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={startHref}
                  className="block w-full text-center py-3 rounded-full text-white font-extrabold shadow bg-emerald-600 active:bg-emerald-700"
                >
                  同じ設定で再挑戦
                </Link>
                <Link
                  href="/study/subtitle"
                  className="block w-full text-center py-3 rounded-full text-white font-extrabold shadow bg-slate-800 active:bg-slate-900"
                >
                  設定を変える
                </Link>
              </div>
            </div>

            {/* 設定表示 */}
            <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <p className="text-[12px] text-indigo-950 font-bold mb-2">今回の設定</p>
              <div className="text-[12px] text-indigo-950 space-y-1">
                <p>① 記号無視：<b>{data.opts?.ignoreSymbols ? 'ON' : 'OFF'}</b></p>
                <p>② ひら/カタ不問：<b>{data.opts?.kanaFree ? 'ON' : 'OFF'}</b></p>
                <p>
                  ③ 間違い後に進む：
                  <b>{data.opts?.ignoreWrongAndGo ? 'ON（自動で次へ）' : 'OFF（正解まで/スキップのみ次へ）'}</b>
                </p>
                <p className="text-[11px] text-indigo-800 mt-2">
                  ※「（）」は常に無視（全角/半角もOK）
                </p>
              </div>
            </div>

            {/* 間違い見返し */}
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-rose-900">間違い見返し</p>
                <p className="text-[12px] text-rose-900">
                  件数：<b>{mistakes.length}</b>
                </p>
              </div>

              {mistakes.length === 0 ? (
                <p className="mt-2 text-[12px] text-rose-900">ノーミス！</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {mistakes.map((m, i) => (
                    <div key={`${m.episode}-${i}`} className="rounded-xl border border-rose-200 bg-white p-3">
                      <p className="text-[12px] text-slate-700">
                        第<b className="text-slate-900">{m.episode}</b>話
                      </p>
                      <p className="text-[12px] text-slate-700 mt-1">
                        正解：<b className="text-slate-900">{m.correctTitle}</b>
                      </p>
                      <p className="text-[12px] text-slate-700 mt-1">
                        あなた：<b className="text-slate-900">{m.userAnswer}</b>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

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
