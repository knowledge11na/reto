// file: app/rate-match/page.js

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';

let socket;

// レートから称号を決める
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

// 数値フィールドを安全にパース
function parseNumberOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ========================================
// マイチームカード
// ========================================

function TeamCardMini({ member }) {
  if (!member) {
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
    borderClass = 'border-indigo-400';

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

// ========================================
// フリーマッチ用ゲーム一覧
// ========================================
//
// 今はゲーム本体をまだ接続しない。
// 後からここへゲームを追加していく。
// ========================================

const FREE_GAMES = [
{
  id: 'hawk',
  name: 'ハゲタカのえじき',
  description: '同じカードを使って競り合うゲーム',
  minPlayers: 2,
  maxPlayers: 4,
  available: true,
},
  {
    id: 'viver-search',
    name: 'エクストラポーカー',
    description: '知識と判断力で競う対戦ゲーム',
    minPlayers: 2,
    maxPlayers: 4,
    available: true,
  },
];

// ========================================
// メイン
// ========================================

export default function RateMatchPage() {
  const router = useRouter();

  // --------------------------------------
  // ユーザー
  // --------------------------------------

  const [me, setMe] = useState(null);
  const [myTeam, setMyTeam] = useState([]);

  // --------------------------------------
  // レートマッチ
  // --------------------------------------

  const [queueSize, setQueueSize] = useState(0);
  const [matching, setMatching] = useState(false);
  const [log, setLog] = useState([]);
  const [connected, setConnected] = useState(false);

  const queueStartRef = useRef(null);
  const aiTimerRef = useRef(null);
  const matchFoundRef = useRef(false);

  // --------------------------------------
  // レートマッチ成立
  // --------------------------------------

  const [matchedInfo, setMatchedInfo] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef(null);

  // --------------------------------------
  // フリーマッチ
  // --------------------------------------

  const [freeMode, setFreeMode] = useState(false);

  const [freeView, setFreeView] = useState('menu');

  const [freeRoomIdInput, setFreeRoomIdInput] = useState('');

  const [freeRoom, setFreeRoom] = useState(null);

  const [freeError, setFreeError] = useState('');

  const [freeCreating, setFreeCreating] = useState(false);
  const [freeJoining, setFreeJoining] = useState(false);

  const [freeSelectedGame, setFreeSelectedGame] = useState(null);

  // --------------------------------------
  // ログ
  // --------------------------------------

  const addLog = (msg) => {
    setLog((prev) => [...prev, msg]);
  };

  // ========================================
  // ログイン情報取得
  // ========================================

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // ========================================
  // マイチーム取得
  // ========================================

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

  // ========================================
  // Socket.IO
  // ========================================

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

    // --------------------------------------
    // 接続
    // --------------------------------------

    const onConnect = () => {
      setConnected(true);
      addLog(`接続: ${s.id}`);
    };

    const onConnectError = (err) => {
      setConnected(false);
      console.error('connect_error', err);
      addLog('socket接続エラー');
    };

    // --------------------------------------
    // レートキュー
    // --------------------------------------

    const onQueueUpdated = (payload) => {
      setQueueSize(payload?.size ?? 0);
    };

    // --------------------------------------
    // レートマッチ成立
    // --------------------------------------

    const onMatched = (payload) => {
      matchFoundRef.current = true;
      setMatching(false);

      console.log('[rate:matched payload]', payload);

      const myName =
        me?.display_name ||
        me?.username ||
        me?.name ||
        '自分';

      const oppName =
        payload.opponentDisplayName ||
        payload.opponentName ||
        payload.opponent ||
        '相手';

      const oppInternal = parseNumberOrNull(
        payload.opponentInternalRating ??
          payload.opponent_internal_rating
      );

      const oppRating = parseNumberOrNull(
        payload.opponentDisplayRating ??
          payload.opponentDisplayRatingInt ??
          payload.opponentRating ??
          payload.opponent_rating ??
          payload.oppRating ??
          payload.opp_rating
      );

      const oppRatingForTitle =
        oppInternal ?? oppRating ?? 1500;

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

      const oppTeamPayload = Array.isArray(
        payload.opponentTeam
      )
        ? payload.opponentTeam
        : [];

      const oppTeam = oppTeamPayload.slice(0, 5);

      addLog(
        `マッチング成立: room=${payload.roomId} vs ${oppName} (oppRating=${oppRating ?? '---'})`
      );

      setMatchedInfo({
        roomId: payload.roomId,
        myName,
        oppName,
        oppTitle,
        oppRating,
        oppTeam,
      });

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

          router.push(
            `/battle?mode=rate&room=${roomId}`
          );
        } else {
          setCountdown(current);
        }
      }, 1000);
    };

    // ======================================
    // フリーマッチ
    // ======================================

    const onFreeCreated = (payload) => {
      console.log('[free:created]', payload);

      setFreeCreating(false);
      setFreeJoining(false);
      setFreeError('');
      setFreeRoom(payload);
      setFreeView('room');
      setFreeMode(true);

      addLog(
        `フリーマッチ部屋を作成: ${payload.roomId}`
      );
    };

    const onFreeRoomState = (payload) => {
      console.log('[free:room-state]', payload);

      setFreeCreating(false);
      setFreeJoining(false);
      setFreeError('');
      setFreeRoom(payload);
      setFreeMode(true);

      // 部屋に入った状態ならロビー表示
      setFreeView('room');

      if (payload?.selectedGame) {
        setFreeSelectedGame(
          payload.selectedGame
        );
      }
    };

    const onFreeError = (payload) => {
      console.error('[free:error]', payload);

      setFreeCreating(false);
      setFreeJoining(false);

      setFreeError(
        payload?.message ||
          'フリーマッチでエラーが発生しました。'
      );
    };

const onFreeGameStart = (payload) => {
  console.log(
    '[free:game-start]',
    payload
  );

  const gameId = payload?.gameId;
  const roomId = payload?.roomId;

  addLog(
    `ゲーム開始: ${gameId || '不明'}`
  );

  if (gameId === 'hawk') {
    router.push(
      `/free/hawk?room=${encodeURIComponent(roomId || '')}`
    );
    return;
  }

  setFreeView('game');

  setFreeSelectedGame(
    gameId || null
  );
};

    // ======================================
    // イベント登録
    // ======================================

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);

    s.on(
      'rate:queue-updated',
      onQueueUpdated
    );

    s.on(
      'rate:matched',
      onMatched
    );

    s.on(
      'free:created',
      onFreeCreated
    );

    s.on(
      'free:room-state',
      onFreeRoomState
    );

    s.on(
      'free:error',
      onFreeError
    );

    s.on(
      'free:game-start',
      onFreeGameStart
    );

    // ======================================
    // cleanup
    // ======================================

    return () => {
      s.off('connect', onConnect);
      s.off(
        'connect_error',
        onConnectError
      );

      s.off(
        'rate:queue-updated',
        onQueueUpdated
      );

      s.off(
        'rate:matched',
        onMatched
      );

      s.off(
        'free:created',
        onFreeCreated
      );

      s.off(
        'free:room-state',
        onFreeRoomState
      );

      s.off(
        'free:error',
        onFreeError
      );

      s.off(
        'free:game-start',
        onFreeGameStart
      );
    };
  }, [router, me]);

  // ========================================
  // レートマッチ開始
  // ========================================

  const handleStart = () => {
    if (!socket) return;

    if (!me) {
      alert('レート戦にはログインが必要です');
      return;
    }

    // フリーマッチ画面を閉じる
    if (freeRoom) {
      socket.emit('free:leave');
      setFreeRoom(null);
    }

    setFreeMode(false);

    setMatching(true);
    setMatchedInfo(null);
    setCountdown(5);

    const payload = {
      name:
        me.display_name ||
        me.username ||
        'プレイヤー',
      rating:
        me.rating ?? 1500,
      userId:
        me.id ?? null,
    };

    console.log(
      'emit rate:join-queue',
      payload
    );

    socket.emit(
      'rate:join-queue',
      payload
    );
  };

  // ========================================
  // レートマッチキャンセル
  // ========================================

  const handleCancel = () => {
    if (!socket) return;

    setMatching(false);

    socket.emit(
      'rate:leave-queue'
    );

    addLog(
      'マッチングをキャンセルしました'
    );
  };

  // ========================================
  // AI戦
  // ========================================

  const handleStartAiNow = () => {
    if (socket) {
      socket.emit(
        'rate:leave-queue'
      );
    }

    setMatching(false);
    setMatchedInfo(null);

    if (aiTimerRef.current) {
      clearInterval(
        aiTimerRef.current
      );

      aiTimerRef.current = null;
    }

    if (countdownRef.current) {
      clearInterval(
        countdownRef.current
      );

      countdownRef.current = null;
    }

    addLog(
      'AI戦を開始します'
    );

    router.push(
      '/battle?mode=ai'
    );
  };

  // ========================================
  // CPU戦
  // ========================================

  const handleStartCpu = () => {
    if (!me) {
      alert(
        'CPU戦にはログインが必要です'
      );

      return;
    }

    addLog(
      'CPU戦（レート変動あり）を開始します'
    );

    router.push(
      '/battle?mode=cpu'
    );
  };

  // ========================================
  // マッチング30秒 → AIなつ
  // ========================================

  useEffect(() => {
    if (matching) {
      queueStartRef.current =
        Date.now();

      matchFoundRef.current =
        false;

      if (aiTimerRef.current) {
        clearInterval(
          aiTimerRef.current
        );

        aiTimerRef.current = null;
      }

      aiTimerRef.current =
        setInterval(() => {
          const start =
            queueStartRef.current;

          if (!start) return;

          const elapsed =
            Date.now() - start;

          if (
            elapsed >= 30000 &&
            !matchFoundRef.current
          ) {
            if (socket) {
              socket.emit(
                'rate:leave-queue'
              );
            }

            setMatching(false);

            addLog(
              '30秒経過したため、AIなつとの対戦に切り替えます'
            );

            clearInterval(
              aiTimerRef.current
            );

            aiTimerRef.current = null;

            router.push(
              '/battle?mode=ai'
            );
          }
        }, 1000);
    } else {
      if (aiTimerRef.current) {
        clearInterval(
          aiTimerRef.current
        );

        aiTimerRef.current = null;
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearInterval(
          aiTimerRef.current
        );

        aiTimerRef.current = null;
      }
    };
  }, [matching, router]);

  // ========================================
  // フリーマッチ：メニューを開く
  // ========================================

  const openFreeMatch = () => {
    if (!me) {
      alert(
        'フリーマッチにはログインが必要です'
      );

      return;
    }

    // レートキューから抜ける
    if (socket) {
      socket.emit(
        'rate:leave-queue'
      );
    }

    setMatching(false);
    setMatchedInfo(null);

    setFreeError('');
    setFreeRoom(null);
    setFreeRoomIdInput('');
    setFreeSelectedGame(null);
    setFreeView('menu');
    setFreeMode(true);

    addLog(
      'フリーマッチを開きました'
    );
  };

  // ========================================
  // フリーマッチを閉じる
  // ========================================

  const closeFreeMatch = () => {
    if (socket && freeRoom) {
      socket.emit(
        'free:leave'
      );
    }

    setFreeRoom(null);
    setFreeMode(false);
    setFreeView('menu');
    setFreeError('');
    setFreeSelectedGame(null);
  };

  // ========================================
  // 部屋を作る
  // ========================================

  const handleCreateFreeRoom = () => {
    if (!socket) {
      setFreeError(
        'Socketに接続されていません。'
      );

      return;
    }

    if (!me) {
      alert(
        'フリーマッチにはログインが必要です'
      );

      return;
    }

    setFreeError('');
    setFreeCreating(true);

    const name =
      me.display_name ||
      me.username ||
      me.name ||
      'プレイヤー';

    socket.emit(
      'free:create',
      {
        name,
        userId:
          me.id ?? null,
      }
    );
  };

  // ========================================
  // 部屋を探す
  // ========================================

  const openJoinFreeRoom = () => {
    setFreeError('');
    setFreeRoomIdInput('');
    setFreeView('join');
  };

  // ========================================
  // 部屋に参加
  // ========================================

  const handleJoinFreeRoom = () => {
    if (!socket) {
      setFreeError(
        'Socketに接続されていません。'
      );

      return;
    }

    if (!me) {
      alert(
        'フリーマッチにはログインが必要です'
      );

      return;
    }

    const roomId =
      String(
        freeRoomIdInput
      )
        .replace(/\D/g, '')
        .slice(0, 4);

    if (roomId.length !== 4) {
      setFreeError(
        '部屋IDは4桁の数字で入力してください。'
      );

      return;
    }

    setFreeError('');
    setFreeJoining(true);

    const name =
      me.display_name ||
      me.username ||
      me.name ||
      'プレイヤー';

    socket.emit(
      'free:join',
      {
        roomId,
        name,
        userId:
          me.id ?? null,
      }
    );
  };

  // ========================================
  // フリーマッチから退出
  // ========================================

  const handleLeaveFreeRoom = () => {
    if (socket) {
      socket.emit(
        'free:leave'
      );
    }

    setFreeRoom(null);
    setFreeView('menu');
    setFreeSelectedGame(null);
    setFreeError('');

    addLog(
      'フリーマッチ部屋から退出しました'
    );
  };

  // ========================================
  // ゲーム選択
  // ========================================

  const handleSelectFreeGame = (
    game
  ) => {
    if (!socket || !freeRoom) return;

    if (
      freeRoom.hostSocketId !==
      socket.id
    ) {
      setFreeError(
        'ゲームを選択できるのは部屋主です。'
      );

      return;
    }

    const playerCount =
      Array.isArray(
        freeRoom.players
      )
        ? freeRoom.players.length
        : 0;

    if (
      playerCount <
      game.minPlayers
    ) {
      setFreeError(
        `${game.name}は${game.minPlayers}人以上で遊べます。`
      );

      return;
    }

    setFreeError('');

    setFreeSelectedGame(
      game.id
    );

    socket.emit(
      'free:select-game',
      {
        roomId:
          freeRoom.roomId,
        gameId:
          game.id,
      }
    );
  };

  // ========================================
  // ゲーム開始
  // ========================================

  const handleStartFreeGame = () => {
    if (!socket || !freeRoom) {
      return;
    }

    if (
      freeRoom.hostSocketId !==
      socket.id
    ) {
      setFreeError(
        'ゲームを開始できるのは部屋主です。'
      );

      return;
    }

    if (!freeSelectedGame) {
      setFreeError(
        'ゲームを選択してください。'
      );

      return;
    }

    const game =
      FREE_GAMES.find(
        (g) =>
          g.id ===
          freeSelectedGame
      );

    if (!game) {
      setFreeError(
        'ゲーム情報が見つかりません。'
      );

      return;
    }

    const playerCount =
      Array.isArray(
        freeRoom.players
      )
        ? freeRoom.players.length
        : 0;

    if (
      playerCount <
      game.minPlayers
    ) {
      setFreeError(
        `${game.name}は${game.minPlayers}人以上必要です。`
      );

      return;
    }

    socket.emit(
      'free:start-game',
      {
        roomId:
          freeRoom.roomId,
      }
    );
  };

  // ========================================
  // アンマウント時
  // ========================================

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(
          countdownRef.current
        );

        countdownRef.current = null;
      }

      if (aiTimerRef.current) {
        clearInterval(
          aiTimerRef.current
        );

        aiTimerRef.current = null;
      }
    };
  }, []);

  // ========================================
  // チーム表示
  // ========================================

  const renderTeamRow = (
    team
  ) => {
    const slots =
      Array.isArray(team)
        ? [...team]
        : [];

    while (
      slots.length < 5
    ) {
      slots.push(null);
    }

    return (
      <div className="flex justify-center gap-2 mt-1">
        {slots.map(
          (member, i) => (
            <TeamCardMini
              key={i}
              member={member}
            />
          )
        )}
      </div>
    );
  };

  // ========================================
  // VS表示用
  // ========================================

  const myNameForVs =
    matchedInfo?.myName ||
    me?.display_name ||
    me?.username ||
    me?.name ||
    '自分';

  const myRatingForVs =
    typeof me?.rating ===
    'number'
      ? me.rating
      : null;

  const myTitleForVs =
    typeof me?.internal_rating ===
    'number'
      ? getRankName(
          me.internal_rating
        )
      : typeof me?.rating ===
        'number'
      ? getRankName(
          me.rating
        )
      : null;

  // ========================================
  // フリーマッチ画面
  // ========================================

  const renderFreeMatch = () => {
    // --------------------------------------
    // 部屋作成・検索メニュー
    // --------------------------------------

    if (
      freeView === 'menu'
    ) {
      return (
        <div className="bg-white rounded-2xl shadow p-4 text-sky-900 space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-extrabold">
              フリーマッチ
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              同じ部屋に集まったメンバーで
              <br />
              好きなゲームを遊べます。
            </p>
          </div>

          {freeError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-bold">
              {freeError}
            </div>
          )}

          <button
            onClick={
              handleCreateFreeRoom
            }
            disabled={
              freeCreating
            }
            className="w-full py-3 rounded-full bg-sky-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {freeCreating
              ? '部屋を作成中…'
              : '部屋を作る'}
          </button>

          <button
            onClick={
              openJoinFreeRoom
            }
            className="w-full py-3 rounded-full bg-indigo-500 text-white font-bold text-sm"
          >
            部屋を探す
          </button>

          <button
            onClick={
              closeFreeMatch
            }
            className="w-full py-2 rounded-full bg-slate-100 text-slate-700 font-bold text-xs"
          >
            戻る
          </button>
        </div>
      );
    }

    // --------------------------------------
    // 部屋ID入力
    // --------------------------------------

    if (
      freeView === 'join'
    ) {
      return (
        <div className="bg-white rounded-2xl shadow p-4 text-sky-900 space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-extrabold">
              部屋を探す
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              参加したい部屋の
              <br />
              4桁の部屋IDを入力してください。
            </p>
          </div>

          {freeError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-bold">
              {freeError}
            </div>
          )}

          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={
              freeRoomIdInput
            }
            onChange={(e) => {
              const value =
                e.target.value
                  .replace(
                    /\D/g,
                    ''
                  )
                  .slice(
                    0,
                    4
                  );

              setFreeRoomIdInput(
                value
              );

              setFreeError('');
            }}
            placeholder="4桁の部屋ID"
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-4 text-center text-2xl font-extrabold tracking-[0.5em] outline-none focus:border-sky-400"
          />

          <button
            onClick={
              handleJoinFreeRoom
            }
            disabled={
              freeJoining
            }
            className="w-full py-3 rounded-full bg-indigo-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {freeJoining
              ? '参加中…'
              : 'この部屋に参加する'}
          </button>

          <button
            onClick={() => {
              setFreeView(
                'menu'
              );
              setFreeError('');
            }}
            className="w-full py-2 rounded-full bg-slate-100 text-slate-700 font-bold text-xs"
          >
            戻る
          </button>
        </div>
      );
    }

    // --------------------------------------
    // ゲーム開始後
    // --------------------------------------

    if (
      freeView === 'game'
    ) {
      const game =
        FREE_GAMES.find(
          (g) =>
            g.id ===
            freeSelectedGame
        );

      return (
        <div className="bg-white rounded-2xl shadow p-4 text-sky-900 space-y-4 text-center">
          <p className="text-sm text-slate-500">
            ゲーム開始
          </p>

          <h2 className="text-2xl font-extrabold">
            {game?.name ||
              freeSelectedGame ||
              'ゲーム'}
          </h2>

          <p className="text-sm text-slate-600">
            ゲーム本体との接続準備中です。
          </p>

          <p className="text-xs text-slate-500">
            現在はフリーマッチの部屋システムまで実装されています。
          </p>

          <button
            onClick={() => {
              if (
                socket &&
                freeRoom
              ) {
                socket.emit(
                  'free:leave'
                );
              }

              setFreeRoom(null);
              setFreeView(
                'menu'
              );
              setFreeSelectedGame(
                null
              );
            }}
            className="w-full py-3 rounded-full bg-slate-200 text-slate-700 font-bold text-sm"
          >
            フリーマッチへ戻る
          </button>
        </div>
      );
    }

    // --------------------------------------
    // ロビー
    // --------------------------------------

    if (
      freeView === 'room'
    ) {
      if (!freeRoom) {
        return null;
      }

      const players =
        Array.isArray(
          freeRoom.players
        )
          ? freeRoom.players
          : [];

      const isHost =
        socket &&
        freeRoom.hostSocketId ===
          socket.id;

      const selectedGame =
        FREE_GAMES.find(
          (g) =>
            g.id ===
            freeSelectedGame
        );

      return (
        <div className="bg-white rounded-2xl shadow p-4 text-sky-900 space-y-4">
          {/* 部屋情報 */}

          <div className="text-center">
            <p className="text-xs text-slate-500">
              フリーマッチ部屋
            </p>

            <div className="mt-1 text-4xl font-black tracking-[0.25em] text-sky-700">
              {freeRoom.roomId}
            </div>

            <p className="text-[11px] text-slate-500 mt-1">
              この4桁の数字を参加者に伝えてください
            </p>
          </div>

          {/* エラー */}

          {freeError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-bold">
              {freeError}
            </div>
          )}

          {/* メンバー */}

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-extrabold text-sm">
                参加者
              </p>

              <p className="text-xs font-bold text-slate-500">
                {players.length}/
                {freeRoom.maxPlayers ??
                  4}
              </p>
            </div>

            <div className="space-y-2">
              {[0, 1, 2, 3].map(
                (index) => {
                  const player =
                    players[
                      index
                    ];

                  if (!player) {
                    return (
                      <div
                        key={
                          index
                        }
                        className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2"
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
                          {index +
                            1}
                        </div>

                        <span className="text-xs text-slate-400">
                          待機中…
                        </span>
                      </div>
                    );
                  }

                  const playerIsHost =
                    player.isHost;

                  return (
                    <div
                      key={
                        player.socketId ||
                        index
                      }
                      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center text-xs font-extrabold text-sky-700">
                        {index +
                          1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          {player.name ||
                            'プレイヤー'}
                        </p>

                        {playerIsHost && (
                          <p className="text-[10px] text-amber-600 font-bold">
                            部屋主
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* ゲーム選択 */}

          <div className="space-y-2">
            <div>
              <p className="font-extrabold text-sm">
                ゲームを選択
              </p>

              <p className="text-[11px] text-slate-500">
                {isHost
                  ? '部屋主がゲームを選択します。'
                  : '部屋主がゲームを選択しています。'}
              </p>
            </div>

            <div className="space-y-2">
              {FREE_GAMES.map(
                (game) => {
                  const canPlay =
                    players.length >=
                    game.minPlayers;

                  const selected =
                    freeSelectedGame ===
                    game.id;

                  return (
                    <button
                      key={
                        game.id
                      }
                      onClick={() =>
                        handleSelectFreeGame(
                          game
                        )
                      }
                      disabled={
                        !isHost ||
                        !canPlay
                      }
                      className={`w-full text-left rounded-xl border-2 p-3 transition ${
                        selected
                          ? 'border-sky-500 bg-sky-50'
                          : 'border-slate-200 bg-white'
                      } ${
                        !isHost ||
                        !canPlay
                          ? 'opacity-50'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm">
                          {game.name}
                        </span>

                        {selected && (
                          <span className="text-xs font-bold text-sky-600">
                            選択中
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 mt-1">
                        {game.description}
                      </p>

                      <p className="text-[10px] text-slate-400 mt-1">
                        {game.minPlayers}～
                        {game.maxPlayers}人
                        {!canPlay &&
                          `（あと${
                            game.minPlayers -
                            players.length
                          }人必要）`}
                      </p>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* 選択中ゲーム */}

          {selectedGame && (
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-center">
              <p className="text-xs text-slate-500">
                選択中のゲーム
              </p>

              <p className="text-lg font-extrabold text-sky-800 mt-1">
                {selectedGame.name}
              </p>
            </div>
          )}

          {/* 開始ボタン */}

          {isHost && (
            <button
              onClick={
                handleStartFreeGame
              }
              disabled={
                !freeSelectedGame
              }
              className="w-full py-3 rounded-full bg-emerald-500 text-white font-bold text-sm disabled:opacity-40"
            >
              ゲームを開始する
            </button>
          )}

          {!isHost && (
            <div className="text-center rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                部屋主がゲームを選択・開始します
              </p>
            </div>
          )}

          {/* 退出 */}

          <button
            onClick={
              handleLeaveFreeRoom
            }
            className="w-full py-2 rounded-full bg-slate-200 text-slate-700 font-bold text-xs"
          >
            部屋を退出する
          </button>
        </div>
      );
    }

    return null;
  };

  // ========================================
  // JSX
  // ========================================

  return (
    <main className="min-h-screen bg-sky-50 flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-sky-900">
          レートマッチング
        </h1>

        <button
          onClick={() =>
            router.push('/')
          }
          className="text-xs underline text-sky-700"
        >
          ホームへ戻る
        </button>
      </header>

      <section className="w-full max-w-md px-4 mt-4 space-y-4">
        {/* ====================================
            フリーマッチ画面
        ==================================== */}

        {freeMode ? (
          renderFreeMatch()
        ) : (
          <>
            {/* ====================================
                自分情報カード
            ==================================== */}

            <div className="bg-white rounded-2xl shadow p-4 space-y-2 text-sky-900">
              <p className="text-sm">
                プレイヤー:{' '}
                <span className="font-bold">
                  {me
                    ? me.display_name ||
                      me.username
                    : '未ログイン'}
                </span>
              </p>

              <p className="text-sm">
                レート:{' '}
                <span className="font-bold">
                  {me &&
                  typeof me.rating ===
                    'number'
                    ? me.rating
                    : '----'}
                </span>
              </p>

              <p className="text-sm">
                称号:{' '}
                <span className="font-bold">
                  {me &&
                  typeof me.internal_rating ===
                    'number'
                    ? getRankName(
                        me.internal_rating
                      )
                    : me &&
                      typeof me.rating ===
                        'number'
                    ? getRankName(
                        me.rating
                      )
                    : '----'}
                </span>
              </p>

              <p className="text-xs text-slate-600">
                ソケット接続:{' '}
                <span className="font-bold">
                  {connected
                    ? '接続中'
                    : '未接続'}
                </span>
              </p>

              <p className="text-xs text-slate-600">
                キュー内プレイヤー数:{' '}
                {queueSize}人
              </p>

              {/* ==================================
                  通常メニュー
              ================================== */}

              {!matching &&
                !matchedInfo && (
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={
                        handleStart
                      }
                      className="w-full py-3 rounded-full bg-sky-500 text-white font-bold text-sm"
                    >
                      マッチングを開始する
                    </button>

                    <button
                      onClick={
                        handleStartAiNow
                      }
                      className="w-full py-3 rounded-full bg-emerald-500 text-white font-bold text-sm"
                    >
                      AI戦を始める
                    </button>

                    <button
                      onClick={
                        handleStartCpu
                      }
                      className="w-full py-3 rounded-full bg-indigo-600 text-white font-bold text-sm"
                    >
                      CPU戦（レート変動あり）
                    </button>

                    {/* ==================================
                        フリーマッチ
                    ================================== */}

                    <div className="border-t border-slate-200 pt-3 mt-3">
                      <div className="text-center mb-2">
                        <p className="text-sm font-extrabold text-sky-900">
                          フリーマッチ
                        </p>

                        <p className="text-[11px] text-slate-500">
                          部屋を作って最大4人で遊べます
                        </p>
                      </div>

                      <button
                        onClick={
                          openFreeMatch
                        }
                        className="w-full py-3 rounded-full bg-fuchsia-500 text-white font-bold text-sm"
                      >
                        フリーマッチを開く
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-600 text-center">
                      ※ AI戦では、今まで通り低確率でAIナレキンが出現します
                    </p>
                  </div>
                )}

              {/* ==================================
                  レートマッチ中
              ================================== */}

              {matching && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-bold">
                    マッチング中…
                  </p>

                  <p className="text-xs text-slate-600">
                    相手が見つかると自動で対戦画面へ移動します。
                    <br />
                    30秒間相手が見つからない場合は、自動でAIなつとの対戦に切り替わります。
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={
                        handleCancel
                      }
                      className="py-2 rounded-full bg-slate-200 text-slate-700 text-xs font-bold"
                    >
                      キャンセル
                    </button>

                    <button
                      onClick={
                        handleStartAiNow
                      }
                      className="py-2 rounded-full bg-emerald-500 text-white text-xs font-bold"
                    >
                      AI戦へ
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ====================================
                レートマッチ成立後 VS
            ==================================== */}

            {matchedInfo && (
              <div className="bg-white rounded-2xl shadow p-4 text-center text-sky-900 space-y-4">
                <p className="font-bold">
                  マッチングしました
                </p>

                {/* 相手 */}

                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-slate-700">
                    相手
                  </p>

                  <p className="text-lg font-extrabold">
                    {
                      matchedInfo.oppName
                    }
                  </p>

                  {matchedInfo.oppRating !=
                    null && (
                    <p className="text-xs text-slate-700">
                      レート:{' '}
                      {
                        matchedInfo.oppRating
                      }
                    </p>
                  )}

                  {matchedInfo.oppTitle && (
                    <p className="text-xs text-slate-700">
                      称号:{' '}
                      {
                        matchedInfo.oppTitle
                      }
                    </p>
                  )}

                  <p className="text-xs text-slate-600">
                    相手のマイチーム
                  </p>

                  {renderTeamRow(
                    matchedInfo.oppTeam
                  )}
                </div>

                <p className="font-bold text-slate-600">
                  vs
                </p>

                {/* 自分 */}

                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-slate-700">
                    自分
                  </p>

                  <p className="text-lg font-extrabold">
                    {myNameForVs}
                  </p>

                  {myRatingForVs !=
                    null && (
                    <p className="text-xs text-slate-700">
                      レート:{' '}
                      {
                        myRatingForVs
                      }
                    </p>
                  )}

                  {myTitleForVs && (
                    <p className="text-xs text-slate-700">
                      称号:{' '}
                      {
                        myTitleForVs
                      }
                    </p>
                  )}

                  <p className="text-xs text-slate-600">
                    自分のマイチーム
                  </p>

                  {renderTeamRow(
                    myTeam
                  )}
                </div>

                <p className="text-xs text-slate-600 mt-2">
                  対戦開始まで…
                </p>

                <p className="text-2xl font-extrabold text-sky-700">
                  {countdown}
                </p>
              </div>
            )}
          </>
        )}

        {/* ====================================
            ログ
        ==================================== */}

        {log.length > 0 && (
          <div className="bg-white rounded-xl shadow p-3 text-sky-900">
            <details
              className="text-xs text-slate-600"
              open
            >
              <summary>
                ログ
              </summary>

              <ul className="mt-1 space-y-0.5">
                {log.map(
                  (l, i) => (
                    <li key={i}>
                      ・{l}
                    </li>
                  )
                )}
              </ul>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}