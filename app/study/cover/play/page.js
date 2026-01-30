// file: app/study/cover/play/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function toHalfWidthAscii(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}

function normalizeBasic(s) {
  return toHalfWidthAscii(String(s ?? '').trim())
    .toLowerCase()
    .replace(/\s+/g, '');
}

// （）と中身を除去（全角/半角）
function stripParensAll(s) {
  let x = String(s ?? '');
  x = x.replace(/（[^）]*）/g, '');
  x = x.replace(/\([^)]*\)/g, '');
  return x;
}

// 巻タイトル用：記号と空白をガッツリ無視
function normalizeTitleLoose(s) {
  let x = toHalfWidthAscii(String(s ?? '').trim()).toLowerCase();
  x = stripParensAll(x); // 必要なければ消してOK（サブタイ同様に無視したいなら残す）
  x = x.replace(/\s+/g, '');

  // ★「!」「-」など、だいたいの記号を消す（半角/全角）
  x = x
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '')
    .replace(/[、。・「」『』【】〔〕［］｛｝〈〉《》“”‘’＂＇…‥〜～ー−―–—・]/g, '')
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, '')
    .replace(/[！-～]/g, ''); // 全角ASCII帯も削る

  return x;
}


function splitAlts(cellStr) {
  const s = String(cellStr ?? '').trim();
  if (!s) return [];
  return s
    .split(/[\/／]/g)
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
}

function buildSaveKey(mode) {
  return `study_cover_save_${mode || 'chars'}`;
}

export default function StudyCoverPlayPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeRaw = sp.get('mode') || 'chars';
  const mode = modeRaw === 'title' ? 'title' : modeRaw === 'both' ? 'both' : 'chars';
  const ignoreWrongAndGo = sp.get('ignoreWrongAndGo') === '1';
  const resume = sp.get('resume') === '1';

  const saveKey = useMemo(() => buildSaveKey(mode), [mode]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('playing'); // playing / reveal
  const [lastJudge, setLastJudge] = useState(null);

  const [titleInput, setTitleInput] = useState('');
  const [charInputs, setCharInputs] = useState([]);

  const titleRef = useRef(null);
  const firstCharRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/cover', { cache: 'no-store' });
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

  const total = useMemo(() => rows?.length || 0, [rows]);
  const current = useMemo(() => (total ? rows[idx] : null), [rows, idx, total]);

  function initInputsForRow(r) {
    setTitleInput('');
    setCharInputs(new Array((r?.characters || []).length).fill(''));
  }

  function focusMain() {
    setTimeout(() => {
      if (mode === 'chars') firstCharRef.current?.focus?.();
      else titleRef.current?.focus?.();
    }, 50);
  }

  // 初期化：resume=1 の時だけ復元、resume=0 は新規開始
  useEffect(() => {
    if (loading) return;
    if (!rows.length) return;

    if (typeof window !== 'undefined' && resume) {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj.idx === 'number') {
            const nextIdx = Math.min(Math.max(0, obj.idx), rows.length - 1);
            setIdx(nextIdx);
            setPhase('playing');
            setLastJudge(null);
            initInputsForRow(rows[nextIdx]);
            focusMain();
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    // 新規
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(saveKey);
    } catch {
      // ignore
    }
    setIdx(0);
    setPhase('playing');
    setLastJudge(null);
    initInputsForRow(rows[0]);
    focusMain();
  }, [loading, rows.length, saveKey, resume]);

  // idx変化で入力欄リセット
  useEffect(() => {
    if (!current) return;
    initInputsForRow(current);
    focusMain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // 自動セーブ（idxだけでOK）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!rows.length) return;
    try {
      window.localStorage.setItem(
        saveKey,
        JSON.stringify({
          v: 1,
          mode,
          idx,
          total: rows.length,
        })
      );
    } catch {
      // ignore
    }
  }, [saveKey, mode, idx, rows.length]);

  function goNext() {
    const next = idx + 1;
    if (next >= total) {
      // 終了：セーブ消す
      try {
        if (typeof window !== 'undefined') window.localStorage.removeItem(saveKey);
      } catch {
        // ignore
      }
      router.push('/study/cover');
      return;
    }
    setIdx(next);
    setPhase('playing');
    setLastJudge(null);
  }

 function judgeTitle(userText, correctTitle) {
  const user = normalizeTitleLoose(userText);
  const correct = normalizeTitleLoose(correctTitle);
  return !!user && user === correct;
}

  function judgeCharAt(userText, correctCell) {
    const user = normalizeBasic(userText);
    if (!user) return false;
    const alts = splitAlts(correctCell).map(normalizeBasic);
    if (!alts.length) return false;
    return alts.includes(user);
  }

  function judgeAll(isSkip = false) {
    if (!current) return;

    const correctTitle = current.title || '';
    const correctChars = current.characters || [];

    let ok = true;

    if (!isSkip) {
      if (mode === 'title' || mode === 'both') {
        if (!judgeTitle(titleInput, correctTitle)) ok = false;
      }
      if (mode === 'chars' || mode === 'both') {
        for (let i = 0; i < correctChars.length; i++) {
          const u = charInputs[i] ?? '';
          if (!judgeCharAt(u, correctChars[i])) {
            ok = false;
            break;
          }
        }
      }
    } else {
      ok = false;
    }

    const judge = {
      ok: !isSkip && ok,
      isSkip,
      volume: current.volume,
      correctTitle,
      correctChars,
      userTitle: titleInput,
      userChars: charInputs,
    };

    setPhase('reveal');
    setLastJudge(judge);

    setTimeout(() => {
      if (ignoreWrongAndGo || judge.ok || judge.isSkip) {
        goNext();
      } else {
        setPhase('playing');
        setLastJudge(null);
        focusMain();
      }
    }, 1200);
  }

  function onSubmit(e) {
    e?.preventDefault?.();
    if (phase !== 'playing') return;
    judgeAll(false);
  }

  function onSkip() {
    if (phase !== 'playing') return;
    judgeAll(true);
  }

  function onQuit() {
    if (!confirm('中断してメニューに戻りますか？（続きから再開できます）')) return;
    router.push('/study/cover');
  }

  const coverImgSrc = useMemo(() => {
    if (!current?.volume) return '';
    return `/cover/${current.volume}.png`;
  }, [current?.volume]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">📘 表紙学習</h1>
            <p className="text-[11px] text-slate-700">
              モード：{mode === 'chars' ? 'キャラのみ' : mode === 'title' ? '巻タイトル' : '両方'} / 全巻
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onQuit}
              className="px-3 py-1 rounded-full text-[12px] font-bold bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              中断
            </button>

            <Link
              href="/study/cover"
              className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
            >
              戻る
            </Link>
          </div>
        </header>

        {msg && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs mb-3">
            {msg}
          </div>
        )}

        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-slate-600">
              進捗：<b className="text-slate-900">{total ? idx + 1 : 0}</b> / {total || 0}
            </p>
            <p className="text-[12px] text-slate-600">
              第<b className="text-slate-900">{current?.volume ?? '---'}</b>巻
            </p>
          </div>

          {(mode === 'chars' || mode === 'both') && current?.volume ? (
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImgSrc}
                alt={`cover ${current.volume}`}
                className="w-full rounded-xl border border-amber-200 bg-white"
              />
              <p className="mt-2 text-[11px] text-amber-900">
                ※画像：/public/cover/{current.volume}.png を置く
              </p>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-3 space-y-3">
            {(mode === 'title' || mode === 'both') && (
              <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
                <p className="text-[12px] text-cyan-900 font-bold mb-1">
                  第{current?.volume ?? '---'}巻：巻タイトルを入力
                </p>
                <input
                  ref={titleRef}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  disabled={loading || !current || phase !== 'playing'}
                  placeholder="巻タイトル"
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>
            )}

            {(mode === 'chars' || mode === 'both') && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
                <p className="text-[12px] text-emerald-900 font-bold mb-2">
                  キャラを順番どおりに入力（{current?.characters?.length || 0}人）
                </p>

                <div className="space-y-2">
                  {(current?.characters || []).map((_, i) => (
                    <input
                      key={i}
                      ref={i === 0 ? firstCharRef : null}
                      value={charInputs[i] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCharInputs((arr) => {
                          const next = [...arr];
                          next[i] = v;
                          return next;
                        });
                      }}
                      disabled={loading || !current || phase !== 'playing'}
                      placeholder={`character${i + 1}`}
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-300"
                    />
                  ))}
                </div>

                <p className="mt-2 text-[11px] text-emerald-800">
                  ※セルが「ルフィ/モンキー・D・ルフィ」なら、どちらでも正解
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading || !current || phase !== 'playing'}
                className="flex-1 py-3 rounded-full bg-emerald-600 text-white font-extrabold shadow active:bg-emerald-700 disabled:bg-gray-400"
              >
                決定
              </button>

              <button
                type="button"
                onClick={onSkip}
                disabled={loading || !current || phase !== 'playing'}
                className="px-4 py-3 rounded-full bg-slate-700 text-white font-extrabold shadow active:bg-slate-800 disabled:bg-gray-400"
              >
                スキップ
              </button>
            </div>
          </form>

          {lastJudge && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p
                className={`text-sm font-extrabold ${
                  lastJudge.ok ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {lastJudge.ok ? '正解！' : lastJudge.isSkip ? 'スキップ' : '不正解'}
              </p>

              {(ignoreWrongAndGo || lastJudge.ok || lastJudge.isSkip) && (
                <div className="mt-2 text-[12px] text-slate-700 space-y-1">
                  {(mode === 'title' || mode === 'both') && (
                    <p>
                      正解（巻タイトル）：<b className="text-slate-900">{lastJudge.correctTitle}</b>
                    </p>
                  )}
                  {(mode === 'chars' || mode === 'both') && (
                    <p>
                      正解（キャラ）：<b className="text-slate-900">{(lastJudge.correctChars || []).join(' / ')}</b>
                    </p>
                  )}
                </div>
              )}

              {!lastJudge.ok && !ignoreWrongAndGo && (
                <p className="text-[11px] text-slate-600 mt-2">
                  この設定では、正解するまで次に進めません（<b>スキップ</b>のみ次へ）。
                </p>
              )}
            </div>
          )}

          <div className="mt-3 text-[11px] text-slate-500">
            ※プレイ中は自動セーブされます（中断しても「続きから再開」できます）
          </div>
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
