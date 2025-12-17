// file: app/multi/meteor/battle/MultiMeteorBattleClient.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io from 'socket.io-client';

let socket;

function formatMs(ms) {
  const s = Math.max(0, Math.ceil((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function Ship({ label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[11px] sm:text-xs text-slate-200 font-bold">{label}</div>
      <div className="relative w-24 h-14 sm:w-28 sm:h-16">
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-10 h-10 bg-slate-200 rounded-t-full rounded-b-[8px] shadow-[0_0_18px_rgba(148,163,184,0.8)]">
          <div className="absolute inset-1 bg-slate-900 rounded-t-full rounded-b-[6px]" />
        </div>
        <div className="absolute left-1/2 bottom-1 -translate-x-1/2 flex w-16 justify-between">
          <div className="w-4 h-4 bg-slate-500 rounded-bl-2xl rounded-tr-lg shadow-[0_0_12px_rgba(148,163,184,0.7)]" />
          <div className="w-4 h-4 bg-slate-500 rounded-br-2xl rounded-tl-lg shadow-[0_0_12px_rgba(148,163,184,0.7)]" />
        </div>
        <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-6 h-6 bg-gradient-to-b from-sky-300 via-sky-500 to-transparent blur-md opacity-80" />
      </div>
    </div>
  );
}

function reconcileLaneIds(prevIds, meteors, laneCount = 3) {
  const ids = Array.isArray(prevIds) ? [...prevIds] : [];
  while (ids.length < laneCount) ids.push(null);
  if (ids.length > laneCount) ids.length = laneCount;

  const exists = new Set(meteors.map((m) => m.id));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] && !exists.has(ids[i])) ids[i] = null;
  }

  const used = new Set(ids.filter(Boolean));
  const unassigned = meteors.filter((m) => !used.has(m.id));

  let ui = 0;
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i] && unassigned[ui]) {
      ids[i] = unassigned[ui].id;
      ui += 1;
    }
  }
  return ids;
}

export default function MultiMeteorBattleClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const roomId = sp.get('room') || '';

  const [me, setMe] = useState(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);

  const [answerInput, setAnswerInput] = useState('');
  const inputRef = useRef(null);

  const [laneIds, setLaneIds] = useState([null, null, null]);

  const youSide = state?.youSide || null;
  const oppSide = youSide === 'A' ? 'B' : youSide === 'B' ? 'A' : null;

  const myName = useMemo(() => {
    if (!me) return '自分';
    return me.display_name || me.username || '自分';
  }, [me]);

  const oppName = useMemo(() => {
    if (!state?.players || !oppSide) return '相手';
    return state.players?.[oppSide]?.name || '相手';
  }, [state, oppSide]);

  const myHpMs = state?.players?.[youSide]?.hpMs ?? null;
  const oppHpMs = state?.players?.[oppSide]?.hpMs ?? null;

  const baseMaxHpMs = useMemo(() => {
    const a = state?.players?.A?.maxHpMs;
    const b = state?.players?.B?.maxHpMs;
    const m = state?.maxHpMs;
    const nums = [a, b, m].filter((v) => typeof v === 'number' && v > 0);
    if (!nums.length) return 420000;
    return Math.max(...nums);
  }, [state]);

  const myIncoming = useMemo(() => {
    if (!state?.meteors || !youSide) return [];
    return state.meteors.filter((m) => m.target === youSide);
  }, [state, youSide]);

  const oppIncoming = useMemo(() => {
    if (!state?.meteors || !oppSide) return [];
    return state.meteors.filter((m) => m.target === oppSide);
  }, [state, oppSide]);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!roomId) return;

    if (!socket) {
      const url =
        process.env.NEXT_PUBLIC_SOCKET_URL ||
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:4000`
          : 'http://localhost:4000');

      socket = io(url, { transports: ['websocket'] });
    }

    const s = socket;

    const onConnect = () => setConnected(true);
    const onConnectError = () => setConnected(false);

    const onState = (payload) => {
      const meteors = Array.isArray(payload?.meteors) ? payload.meteors : [];
      setLaneIds((prev) => reconcileLaneIds(prev, meteors, 3));
      setState(payload);
    };

    const onEnded = (payload) => {
      const meteors = Array.isArray(payload?.meteors) ? payload.meteors : [];
      setLaneIds((prev) => reconcileLaneIds(prev, meteors, 3));
      setState(payload);
    };

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('meteor:state', onState);
    s.on('meteor:ended', onEnded);

    s.emit('meteor:join-room', {
      roomId,
      userId: me?.id ?? null,
      name: myName,
    });

    setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('meteor:state', onState);
      s.off('meteor:ended', onEnded);
    };
  }, [roomId, me?.id, myName]);

  const canShoot = state?.phase === 'playing' && myIncoming.length > 0;
  const ended = state?.phase === 'ended' || !!state?.winnerSide;
  const winnerSide = state?.winnerSide || null;

  const handleShoot = () => {
    if (!socket) return;
    if (!roomId) return;

    const input = answerInput.trim();
    if (!input) {
      inputRef.current?.focus();
      return;
    }

    socket.emit('meteor:answer', { roomId, text: input });

    setAnswerInput('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const leave = () => router.push('/');

  const HpBar = ({ label, ms, maxMs, tone = 'me' }) => {
    const ratio =
      typeof ms === 'number' && typeof maxMs === 'number' && maxMs > 0
        ? Math.max(0, Math.min(1, ms / maxMs))
        : 0;

    const fillClass = tone === 'me' ? 'bg-emerald-400' : 'bg-rose-400';

    return (
      <div className="w-full">
        <div className="flex items-end justify-between">
          <span className="text-[11px] sm:text-xs text-slate-200 font-bold">{label}</span>
          <span className="text-[11px] sm:text-xs text-slate-100">
            {typeof ms === 'number' ? formatMs(ms) : '--:--'}
          </span>
        </div>

        <div className="mt-1 w-full h-3 rounded-full bg-slate-800 border border-slate-600 overflow-hidden">
          <div
            className={`h-full ${fillClass} transition-[width] duration-200`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
    );
  };

  const meteorsById = useMemo(() => {
    const map = new Map();
    (state?.meteors || []).forEach((m) => map.set(m.id, m));
    return map;
  }, [state?.meteors]);

  return (
    <main className="meteor-nozoom min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50 relative overflow-hidden">
      <style jsx global>{`
        @media (max-width: 640px) {
          .meteor-nozoom input,
          .meteor-nozoom textarea,
          .meteor-nozoom select {
            font-size: 16px !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.25),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(129,140,248,0.35),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(248,250,252,0.22),transparent_55%)]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-3 pt-3 pb-6">
        <header className="flex items-center justify-between mb-3">
          <div className="space-y-0.5">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide">
              マルチ：隕石クラッシュ（打ち返し）
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-300">
              room: <span className="font-mono">{roomId || '----'}</span> / socket:{' '}
              {connected ? '接続中' : '未接続'}
            </p>
          </div>

          <button
            onClick={leave}
            className="text-[11px] sm:text-xs font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
          >
            退出してホームへ
          </button>
        </header>

        {!state && (
          <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 text-sm text-slate-200">
            対戦情報を取得中...
          </div>
        )}

        {state && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-3">
                <HpBar label={`相手：${oppName}`} ms={oppHpMs} maxMs={baseMaxHpMs} tone="opp" />
              </div>
              <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-3">
                <HpBar label={`自分：${myName}`} ms={myHpMs} maxMs={baseMaxHpMs} tone="me" />
              </div>
            </div>

            {ended && (
              <div className="mb-3 bg-slate-900/80 border border-slate-600 rounded-2xl p-4 text-center">
                <p className="text-sm sm:text-base font-extrabold">
                  {winnerSide === youSide ? '勝利！' : '敗北…'}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-300 mt-1">レート変動なし</p>
              </div>
            )}

            <div className="relative w-full h-[62vh] border border-slate-700/60 rounded-2xl overflow-hidden bg-slate-950/30">
              <div className="absolute top-2 inset-x-0 flex justify-center">
                <Ship label={`相手：${oppName}`} />
              </div>

              <div className="absolute bottom-20 inset-x-0 flex justify-center">
                <Ship label={`自分：${myName}`} />
              </div>

              <div className="absolute inset-x-0 top-24 flex justify-center">
                <div className="px-3 py-1 rounded-full bg-slate-900/70 border border-slate-700 text-[7px] sm:text-xs text-slate-100">
                  {myIncoming.length > 0
                    ? `⚠ あなたに隕石が向かっている！ (${myIncoming.length}個)`
                    : `↗ 相手に隕石が向かっている (${oppIncoming.length}個)`}
                </div>
              </div>

              <div className="absolute inset-0 flex">
                {[0, 1, 2].map((lane) => {
                  const id = laneIds[lane];
                  const meteor = id ? meteorsById.get(id) : null;
                  if (!meteor) return <div key={lane} className="flex-1 relative" />;

                  const targetIsMe = meteor.target === youSide;

                  // ★隕石バーは不要なので ratio は削除

                  const topStart = 18;
                  const topEnd = 70;

                  const ratioForMove =
                    meteor.limitMs > 0
                      ? Math.max(0, Math.min(1, meteor.remainingMs / meteor.limitMs))
                      : 0;

                  const topPercent = targetIsMe
                    ? topStart + (1 - ratioForMove) * (topEnd - topStart)
                    : topEnd - (1 - ratioForMove) * (topEnd - topStart);

                  return (
                    <div key={lane} className="flex-1 relative">
                      <div
                        className="absolute left-1/2 -translate-x-1/2 transition-[top] duration-200"
                        style={{ top: `${topPercent}%` }}
                      >
                        {/* 隕石サイズ（ここで編集） */}
                        <div className="relative w-40 h-40 sm:w-52 sm:h-52 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_20%_20%,#e5e7eb_0,#64748b_40%,#020617_80%)] shadow-[0_0_25px_rgba(15,23,42,0.95)] border border-slate-700" />
                          <div className="absolute left-4 top-5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800/80 shadow-inner" />
                          <div className="absolute right-5 top-4 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900/80 shadow-inner" />
                          <div className="absolute left-10 bottom-5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900/80 shadow-inner" />

                          {/* カード（長文スクロール） */}
                          <div className="relative z-10 w-[84%] h-[70%] bg-slate-950/90 rounded-xl border border-slate-500/80 px-3 py-2 flex flex-col">
                            <div className="flex items-center justify-between mb-1 shrink-0">
                              <span className="text-[7px] text-amber-200 font-bold">
                                {targetIsMe ? '→ 自分' : '→ 相手'}
                              </span>
                              <span className="text-[7px] text-slate-100 font-extrabold">
                                {formatMs(meteor.remainingMs)}
                              </span>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-1">
                              {/* 問題文の文字サイズ（ここで編集） */}
                              <p className="text-[7px] sm:text-sm font-semibold text-slate-50 whitespace-pre-wrap leading-snug">
                                {meteor.text}
                              </p>
                            </div>

                            <div className="mt-1 text-[6px] text-slate-400 text-right shrink-0">
                              長文はスクロール
                            </div>
                          </div>

                          <div
                            className={`absolute -z-10 inset-x-4 h-7 blur-lg opacity-80 ${
                              targetIsMe ? 'top-[-6px]' : 'bottom-[-6px]'
                            } bg-gradient-to-b from-amber-400/70 via-orange-500/40 to-transparent`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="absolute inset-x-0 bottom-0 pb-4">
                <div className="w-full max-w-md mx-auto px-3">
                  <label className="block text-[11px] sm:text-xs text-slate-100 mb-1 text-center">
                    回答欄：{canShoot ? '正解で打ち返せ！' : '今は相手側。待機！'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={answerInput}
                      disabled={!canShoot || ended}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleShoot();
                        }
                      }}
                      className="flex-1 rounded-full border border-slate-500 bg-slate-950/80 px-3 py-1.5 text-[11px] sm:text-xs text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 disabled:opacity-50"
                      placeholder={ended ? '試合終了' : 'ここに回答を入力（Enterで発射）'}
                    />
                    <button
                      type="button"
                      disabled={!canShoot || ended}
                      onClick={handleShoot}
                      className="px-3 sm:px-4 py-1.5 rounded-full bg-sky-500 text-white text-[11px] sm:text-xs font-semibold hover:bg-sky-400 whitespace-nowrap disabled:opacity-50"
                    >
                      発射
                    </button>
                  </div>

                  {state?.message && (
                    <div className="mt-2 text-[11px] sm:text-xs text-slate-200 text-center">
                      {state.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 text-[11px] sm:text-xs text-slate-300">
              HPバーは最大7:00基準。隕石の時間バーは非表示。
            </div>
          </>
        )}
      </div>
    </main>
  );
}
