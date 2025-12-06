// file: app/rate-match/page.js
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';

let socket;

// レートから称号を決める（lib/db.js と同じロジック）
function getRankName(rating) {
  if (rating >= 1800) return '海賊王';
  if (rating >= 1750) return '四皇';
  if (rating >= 1700) return '七武海';
  if (rating >= 1650) return '超新星';
  if (rating >= 1600) return 'Level 新世界';
  if (rating >= 1550) return 'Level 偉大なる航路';
  if (rating >= 1500) return 'Level 東の海';
  return '海賊見習い';
}

// 数値フィールドを安全にパース（未定義/null/空文字→null）
function parseNumberOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ★★ どんな形で来てもレア度・★を拾う ★★
function TeamCardMini({ member }) {
  if (!member) {
    // 空スロット
    return (
      <div className="w-20 h-12 rounded-lg border border-slate-300 bg-slate-50" />
    );
  }

  const rarity =
    member.rarity ??
    member.base_rarity ??
    member.baseRarity ??
    member.rarity_original ??
    1;

  const star =
    member.star ??
    member.stars ??
    member.current_star ??
    member.currentStar ??
    1;

  // 枠色（レア度）
  let borderClass = 'border-slate-400';
  let bgClass = 'bg-white';

  if (rarity === 1) {
    borderClass = 'border-zinc-400';
  } else if (rarity === 2) {
    borderClass = 'border-emerald-500';
  } else if (rarity === 3) {
    borderClass = 'border-red-500';
  } else if (rarity === 4) {
    borderClass = 'border-slate-300';
  } else if (rarity === 5) {
    borderClass = 'border-yellow-400';
  } else if (rarity === 6) {
    borderClass = 'border-indigo-400';
  } else if (rarity >= 7) {
    // 枠は虹固定
    borderClass = 'border-indigo-400';
    // 背景が変わる
    if (rarity === 7) bgClass = 'bg-amber-200';
    else if (rarity === 8) bgClass = 'bg-slate-200';
    else if (rarity === 9) bgClass = 'bg-yellow-200';
    else if (rarity === 10) bgClass = 'bg-slate-100';
    else if (rarity === 11) bgClass = 'bg-cyan-100';
  }

  return (
    <div
      className={`relative w-20 h-12 rounded-lg border-2 ${borderClass} ${bgClass} flex items-center justify-center overflow-hidden`}
    >
      <span className="px-1 text-[9px] font-bold text-slate-900 text-center leading-tight">
        {member.name}
      </span>
      <span className="absolute left-0 top-0 px-1 text-[8px] font-bold text-slate-900 bg-white/80 rounded-br">
        R{rarity}
      </span>
      <span className="absolute right-0 bottom-0 px-1 text-[8px] font-bold text-amber-700 bg-white/80 rounded-tl">
        ★{star}
      </span>
    </div>
  );
}

export default function RateMatchPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [myTeam, setMyTeam] = useState([]); // 自分のマイチーム
  const [queueSize, setQueueSize] = useState(0);
  const [matching, setMatching] = useState(false);
  const [log, setLog] = useState([]);
  const [connected, setConnected] = useState(false);

  // AIなつ用
  const queueStartRef = useRef(null);
  const aiTimerRef = useRef(null);
  const matchFoundRef = useRef(false);

  // マッチ成立後の VS 表示用
  const [matchedInfo, setMatchedInfo] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef(null);

  const addLog = (msg) => setLog((prev) => [...prev, msg]);

  // ログイン情報取得
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // 自分のマイチーム取得（/api/user/team）
  useEffect(() => {
    if (!me?.id) return;

    const userId = me.id;
    fetch(`/api/user/team?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.team)) {
          setMyTeam(d.team);
        } else {
          setMyTeam([]);
        }
      })
      .catch((err) => {
        console.error('fetch myTeam error', err);
        setMyTeam([]);
      });
  }, [me?.id]);

  // socket.io 接続
  useEffect(() => {
    if (!socket) {
      const url =
        process.env.NEXT_PUBLIC_SOCKET_URL ||
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:4000`
          : 'http://localhost:4000');

      console.log('socket connect to:', url);
      socket = io(url, {
        transports: ['websocket'],
      });
    }

    const s = socket;

    const onConnect = () => {
      setConnected(true);
      addLog(`接続: ${s.id}`);
    };

    const onConnectError = (err) => {
      setConnected(false);
      console.error('connect_error', err);
      addLog('socket接続エラー');
    };

    const onQueueUpdated = (payload) => {
      setQueueSize(payload.size ?? 0);
    };

    const onMatched = (payload) => {
      matchFoundRef.current = true;
      setMatching(false);

      console.log('[rate:matched payload]', payload);

      // ====== 自分側 ======
      const myName =
        me?.display_name || me?.username || me?.name || '自分';

      // サーバーから来る「自由称号」
      const myCustomTitle =
        payload.selfCustomTitle ||
        payload.self_custom_title ||
        null;

      // ====== 相手側 ======
      const oppName =
        payload.opponentDisplayName ||
        payload.opponentName ||
        payload.opponent ||
        '相手';

      const oppInternal = parseNumberOrNull(
        payload.opponentInternalRating ?? payload.opponent_internal_rating
      );

      const oppRating = parseNumberOrNull(
        payload.opponentDisplayRating ??
          payload.opponentDisplayRatingInt ??
          payload.opponentRating ??
          payload.opponent_rating ??
          payload.oppRating ??
          payload.opp_rating
      );

      const oppRatingForTitle = oppInternal ?? oppRating ?? 1500;

      const oppTitleFromServer =
        payload.opponentTitle ??
        payload.opponent_rank_name ??
        payload.opponentRankName ??
        null;

      const oppTitle =
        typeof oppTitleFromServer === 'string' &&
        oppTitleFromServer.length > 0
          ? oppTitleFromServer
          : getRankName(oppRatingForTitle);

      // 相手の「自由称号」
      const oppCustomTitle =
        payload.opponentCustomTitle ||
        payload.opponent_custom_title ||
        null;

      const oppTeamPayload = Array.isArray(payload.opponentTeam)
        ? payload.opponentTeam
        : [];
      const oppTeam = oppTeamPayload.slice(0, 5);

      console.log('[rate:matched self name]', myName);
      console.log(
        '[rate:matched opp]',
        oppName,
        'ratingForTitle=',
        oppRatingForTitle,
        'title=',
        oppTitle
      );

      addLog(
        `マッチング成立: room=${payload.roomId} vs ${oppName} (oppRating=${oppRating ?? '---'})`
      );

      setMatchedInfo({
        roomId: payload.roomId,
        myName,
        myCustomTitle,
        oppName,
        oppTitle,
        oppCustomTitle,
        oppRating,
        oppTeam,
      });

      // ===== 5秒カウントダウン → 対戦画面へ =====
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      let current = 5;
      setCountdown(current);
      const roomId = payload.roomId;

      countdownRef.current = setInterval(() => {
        current -= 1;

        if (current <= 0) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          router.push(`/battle?mode=rate&room=${roomId}`);
        } else {
          setCountdown(current);
        }
      }, 1000);
    };

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('rate:queue-updated', onQueueUpdated);
    s.on('rate:matched', onMatched);

    return () => {
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('rate:queue-updated', onQueueUpdated);
      s.off('rate:matched', onMatched);
    };
  }, [router, me]);

  const handleStart = () => {
    if (!socket) return;
    if (!me) {
      alert('レート戦にはログインが必要です');
      return;
    }
    setMatching(true);
    setMatchedInfo(null);
    setCountdown(5);

    const payload = {
      name: me.display_name || me.username || 'プレイヤー',
      rating: me.rating ?? 1500,
      userId: me.id ?? null,
    };
    console.log('emit rate:join-queue', payload);
    socket.emit('rate:join-queue', payload);
  };

  const handleCancel = () => {
    if (!socket) return;
    setMatching(false);
    socket.emit('rate:leave-queue');
    addLog('マッチングをキャンセルしました');
  };

  // matching中30秒で自動AIなつ戦へ切替
  useEffect(() => {
    if (matching) {
      queueStartRef.current = Date.now();
      matchFoundRef.current = false;

      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
        aiTimerRef.current = null;
      }

      aiTimerRef.current = setInterval(() => {
        const start = queueStartRef.current;
        if (!start) return;

        const elapsed = Date.now() - start;

        if (elapsed >= 30000 && !matchFoundRef.current) {
          if (socket) {
            socket.emit('rate:leave-queue');
          }
          setMatching(false);
          addLog('30秒経過したため、AIなつとの対戦に切り替えます');
          clearInterval(aiTimerRef.current);
          aiTimerRef.current = null;
          router.push('/battle?mode=ai&opponent=AIなつ');
        }
      }, 1000);
    } else {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [matching, router]);

  // アンマウント時にカウントダウン停止
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, []);

  // マイチーム表示用の行
  const renderTeamRow = (team) => {
    const slots = Array.isArray(team) ? [...team] : [];
    while (slots.length < 5) {
      slots.push(null);
    }
    return (
      <div className="flex justify-center gap-2 mt-1">
        {slots.map((member, i) => (
          <TeamCardMini key={i} member={member} />
        ))}
      </div>
    );
  };

  const myNameForVs =
    matchedInfo?.myName ||
    me?.display_name ||
    me?.username ||
    me?.name ||
    '自分';

  const myRatingForVs =
    typeof me?.rating === 'number' ? me.rating : null;

  const myTitleForVs =
    typeof me?.internal_rating === 'number'
      ? getRankName(me.internal_rating)
      : typeof me?.rating === 'number'
      ? getRankName(me.rating)
      : null;

  const myCustomTitleForVs = matchedInfo?.myCustomTitle || null;

  return (
    <main className="min-h-screen bg-sky-50 flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-sky-900">
          レートマッチング
        </h1>
        <button
          onClick={() => router.push('/')}
          className="text-xs underline text-sky-700"
        >
          ホームへ戻る
        </button>
      </header>

      <section className="w-full max-w-md px-4 mt-4 space-y-4">
        {/* 自分情報カード */}
        <div className="bg-white rounded-2xl shadow p-4 space-y-2 text-sky-900">
          <p className="text-sm">
            プレイヤー:{' '}
            <span className="font-bold">
              {me ? me.display_name || me.username : '未ログイン'}
            </span>
          </p>
          <p className="text-sm">
            レート:{' '}
            <span className="font-bold">
              {me && typeof me.rating === 'number' ? me.rating : '----'}
            </span>
          </p>
          <p className="text-sm flex flex-wrap items-center gap-1">
            称号:{' '}
            <span className="font-bold">
              {myTitleForVs || '----'}
            </span>
            {myCustomTitleForVs && (
              <span className="ml-1 inline-block px-2 py-0.5 rounded-full bg-purple-100 border border-purple-300 text-[11px] font-bold text-purple-700">
                {myCustomTitleForVs}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-600">
            ソケット接続:{' '}
            <span className="font-bold">
              {connected ? '接続中' : '未接続'}
            </span>
          </p>
          <p className="text-xs text-slate-600">
            キュー内プレイヤー数: {queueSize}人
          </p>

          {!matching && !matchedInfo && (
            <button
              onClick={handleStart}
              className="mt-3 w-full py-3 rounded-full bg-sky-500 text-white font-bold text-sm"
            >
              マッチングを開始する
            </button>
          )}

          {matching && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-bold">マッチング中…</p>
              <p className="text-xs text-slate-600">
                相手が見つかると自動で対戦画面へ移動します。
                <br />
                30秒間相手が見つからない場合は、自動でAIなつとの対戦に切り替わります。
              </p>
              <button
                onClick={handleCancel}
                className="w-full py-2 rounded-full bg-slate-200 text-slate-700 text-xs"
              >
                キャンセル
              </button>
            </div>
          )}
        </div>

        {/* マッチング成立後 VS 表示 */}
        {matchedInfo && (
          <div className="bg-white rounded-2xl shadow p-4 text-center text-sky-900 space-y-4">
            <p className="font-bold">マッチングしました</p>

            {/* 相手側 */}
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-slate-700">相手</p>
              <p className="text-lg font-extrabold">
                {matchedInfo.oppName}
              </p>
              {matchedInfo.oppRating != null && (
                <p className="text-xs text-slate-700">
                  レート: {matchedInfo.oppRating}
                </p>
              )}
              <div className="flex justify-center gap-1 text-xs">
                <span>称号:</span>
                <span className="font-bold">
                  {matchedInfo.oppTitle}
                </span>
                {matchedInfo.oppCustomTitle && (
                  <span className="inline-block px-2 py-0.5 rounded-full bg-purple-100 border border-purple-300 text-[11px] font-bold text-purple-700">
                    {matchedInfo.oppCustomTitle}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">相手のマイチーム</p>
              {renderTeamRow(matchedInfo.oppTeam)}
            </div>

            <p className="font-bold text-slate-600">vs</p>

            {/* 自分側 */}
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-slate-700">自分</p>
              <p className="text-lg font-extrabold">{myNameForVs}</p>
              {myRatingForVs != null && (
                <p className="text-xs text-slate-700">
                  レート: {myRatingForVs}
                </p>
              )}
              <div className="flex justify-center gap-1 text-xs">
                <span>称号:</span>
                <span className="font-bold">
                  {myTitleForVs || '----'}
                </span>
                {myCustomTitleForVs && (
                  <span className="inline-block px-2 py-0.5 rounded-full bg-purple-100 border border-purple-300 text-[11px] font-bold text-purple-700">
                    {myCustomTitleForVs}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">自分のマイチーム</p>
              {renderTeamRow(myTeam)}
            </div>

            <p className="text-xs text-slate-600 mt-2">対戦開始まで…</p>
            <p className="text-2xl font-extrabold text-sky-700">
              {countdown}
            </p>
          </div>
        )}

        {/* ログ */}
        {log.length > 0 && (
          <div className="bg-white rounded-xl shadow p-3 text-sky-900">
            <details className="text-xs text-slate-600" open>
              <summary>ログ</summary>
              <ul className="mt-1 space-y-0.5">
                {log.map((l, i) => (
                  <li key={i}>・{l}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}
