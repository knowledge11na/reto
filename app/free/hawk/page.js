// file: app/free/hawk/page.js

'use client';

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useSearchParams,
  useRouter,
} from 'next/navigation';
import io from 'socket.io-client';

let socket;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : 'http://localhost:4000');

function getPlayerName(me) {
  return (
    me?.display_name ||
    me?.username ||
    me?.name ||
    'プレイヤー'
  );
}

function HawkGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomId = searchParams.get('room') || '';

  const [me, setMe] = useState(null);
  const [connected, setConnected] = useState(false);

  const [room, setRoom] = useState(null);

  const [phase, setPhase] = useState('loading');

  const [intervalValue, setIntervalValue] =
    useState(10);

  const [intervalInput, setIntervalInput] =
    useState('10');

  const [round, setRound] = useState(0);
  const [scoreCard, setScoreCard] =
    useState(null);

  const [myCards, setMyCards] = useState([]);
  const [selectedCardId, setSelectedCardId] =
    useState(null);

  const [playedCards, setPlayedCards] =
    useState([]);

  const [scores, setScores] = useState([]);

  const [roundResult, setRoundResult] =
    useState(null);

  const [finalResult, setFinalResult] =
    useState(null);

  const [error, setError] = useState('');

  const joinedRef = useRef(false);

  // ========================================
  // ログイン情報
  // ========================================

  useEffect(() => {
    fetch('/api/me', {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((d) => {
        setMe(
          d?.user ??
            d?.me ??
            d ??
            null
        );
      })
      .catch(() => {
        setMe(null);
      });
  }, []);

  // ========================================
  // Socket.IO
  // ========================================

  useEffect(() => {
    if (!roomId) {
      setError('部屋IDがありません。');
      setPhase('error');
      return;
    }

    if (!socket) {
      socket = io(SOCKET_URL, {
        transports: ['websocket'],
      });
    }

    const s = socket;

    const joinRoom = async () => {
      let currentMe = me;

      if (!currentMe) {
        try {
          const response = await fetch(
            '/api/me',
            {
              cache: 'no-store',
            }
          );

          if (response.ok) {
            const data =
              await response.json();

            currentMe =
              data?.user ??
              data?.me ??
              data ??
              null;

            setMe(currentMe);
          }
        } catch (err) {
          console.error(
            '[hawk] /api/me error',
            err
          );
        }
      }

      const userId =
        currentMe?.id ??
        currentMe?.userId ??
        currentMe?.user_id ??
        null;

      const name =
        getPlayerName(currentMe);

      console.log('[hawk] JOIN', {
        roomId,
        userId,
        name,
        socketId: s.id,
      });

      s.emit('hawk:join', {
        roomId,
        userId,
        name,
      });

      joinedRef.current = true;
    };

    const onConnect = () => {
      console.log(
        '[hawk] Socket.IO connected:',
        s.id
      );

      setConnected(true);
      setError('');

      joinRoom();
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onConnectError = (err) => {
      console.error(
        '[hawk] socket error',
        err
      );

      setConnected(false);

      setError(
        'ゲームサーバーに接続できません。'
      );
    };

    // ========================================
    // 部屋状態
    // ========================================

    const onRoomState = (payload) => {
      console.log(
        '[hawk:room-state]',
        payload
      );

      if (!payload) {
        return;
      }

      if (payload.room) {
        setRoom(payload.room);
      }

      if (payload.phase) {
        setPhase(payload.phase);
      } else {
        setPhase('setup');
      }

      if (
        Array.isArray(payload.scores)
      ) {
        setScores(payload.scores);
      }

      setError('');
    };

    // ========================================
    // ゲーム設定
    // ========================================

    const onSetup = (payload) => {
      console.log(
        '[hawk:setup]',
        payload
      );

      setPhase('setup');

      if (
        typeof payload?.interval ===
        'number'
      ) {
        setIntervalValue(
          payload.interval
        );

        setIntervalInput(
          String(payload.interval)
        );
      }
    };

    // ========================================
    // ゲーム開始
    // ========================================

    const onGameStarted = (payload) => {
      console.log(
        '[hawk:game-started]',
        payload
      );

      setPhase('playing');

      setRound(
        payload?.round ?? 1
      );

      setScoreCard(
        payload?.scoreCard ?? null
      );

      setMyCards(
        Array.isArray(
          payload?.myCards
        )
          ? payload.myCards
          : []
      );

      setSelectedCardId(null);
      setPlayedCards([]);
      setRoundResult(null);
      setFinalResult(null);

      if (
        Array.isArray(payload?.scores)
      ) {
        setScores(payload.scores);
      }
    };

    // ========================================
    // ラウンド開始
    // ========================================

    const onRoundStarted = (payload) => {
      console.log(
        '[hawk:round-started]',
        payload
      );

      setPhase('playing');

      setRound(
        payload?.round ?? 1
      );

      setScoreCard(
        payload?.scoreCard ?? null
      );

      setSelectedCardId(null);
      setPlayedCards([]);
      setRoundResult(null);

      if (
        Array.isArray(payload?.scores)
      ) {
        setScores(payload.scores);
      }
    };

    // ========================================
    // 自分の手札
    // ========================================

    const onMyCards = (payload) => {
      console.log(
        '[hawk:my-cards]',
        payload
      );

      setMyCards(
        Array.isArray(payload?.cards)
          ? payload.cards
          : []
      );
    };

    // ========================================
    // カード公開
    // ========================================

    const onCardsRevealed = (payload) => {
      console.log(
        '[hawk:cards-revealed]',
        payload
      );

      setPlayedCards(
        Array.isArray(
          payload?.playedCards
        )
          ? payload.playedCards
          : []
      );

      setPhase('result');
    };

    // ========================================
    // ラウンド結果
    // ========================================

    const onRoundResult = (payload) => {
      console.log(
        '[hawk:round-result]',
        payload
      );

      setRoundResult(
        payload ?? null
      );

      if (
        Array.isArray(payload?.scores)
      ) {
        setScores(payload.scores);
      }

      setPhase('result');
    };

    // ========================================
    // 次ラウンド
    // ========================================

    const onNextRound = (payload) => {
      console.log(
        '[hawk:next-round]',
        payload
      );

      setRound(
        payload?.round ?? 1
      );

      setScoreCard(
        payload?.scoreCard ?? null
      );

      setSelectedCardId(null);
      setPlayedCards([]);
      setRoundResult(null);

      setPhase('playing');

      if (
        Array.isArray(payload?.scores)
      ) {
        setScores(payload.scores);
      }
    };

    // ========================================
    // 最終結果
    // ========================================

    const onGameFinished = (payload) => {
      console.log(
        '[hawk:game-finished]',
        payload
      );

      setFinalResult(
        payload ?? null
      );

      setScores(
        Array.isArray(payload?.scores)
          ? payload.scores
          : []
      );

      setPhase('finished');
    };

    // ========================================
    // エラー
    // ========================================

    const onHawkError = (payload) => {
      console.error(
        '[hawk:error]',
        payload,
        JSON.stringify(
          payload,
          null,
          2
        )
      );

      setError(
        payload?.message ||
          'ゲーム中にエラーが発生しました。'
      );
    };

    // ========================================
    // イベント登録
    // ========================================

    s.on('connect', onConnect);

    s.on(
      'disconnect',
      onDisconnect
    );

    s.on(
      'connect_error',
      onConnectError
    );

    s.on(
      'hawk:room-state',
      onRoomState
    );

    s.on(
      'hawk:setup',
      onSetup
    );

    s.on(
      'hawk:game-started',
      onGameStarted
    );

    s.on(
      'hawk:round-started',
      onRoundStarted
    );

    s.on(
      'hawk:my-cards',
      onMyCards
    );

    s.on(
      'hawk:cards-revealed',
      onCardsRevealed
    );

    s.on(
      'hawk:round-result',
      onRoundResult
    );

    s.on(
      'hawk:next-round',
      onNextRound
    );

    s.on(
      'hawk:game-finished',
      onGameFinished
    );

    s.on(
      'hawk:error',
      onHawkError
    );

    // すでに接続済みなら参加
    if (s.connected) {
      onConnect();
    }

    return () => {
      s.off(
        'connect',
        onConnect
      );

      s.off(
        'disconnect',
        onDisconnect
      );

      s.off(
        'connect_error',
        onConnectError
      );

      s.off(
        'hawk:room-state',
        onRoomState
      );

      s.off(
        'hawk:setup',
        onSetup
      );

      s.off(
        'hawk:game-started',
        onGameStarted
      );

      s.off(
        'hawk:round-started',
        onRoundStarted
      );

      s.off(
        'hawk:my-cards',
        onMyCards
      );

      s.off(
        'hawk:cards-revealed',
        onCardsRevealed
      );

      s.off(
        'hawk:round-result',
        onRoundResult
      );

      s.off(
        'hawk:next-round',
        onNextRound
      );

      s.off(
        'hawk:game-finished',
        onGameFinished
      );

      s.off(
        'hawk:error',
        onHawkError
      );
    };
  }, [roomId, me]);

  // ========================================
  // 部屋主判定
  // ========================================

  const isHost = useMemo(() => {
    if (!room) {
      return false;
    }

    const myUserId =
      me?.id ??
      me?.userId ??
      me?.user_id ??
      null;

    if (
      myUserId != null &&
      room.hostUserId != null
    ) {
      return (
        String(myUserId) ===
        String(room.hostUserId)
      );
    }

    if (
      socket?.id &&
      room.hostSocketId
    ) {
      return (
        socket.id ===
        room.hostSocketId
      );
    }

    const players =
      Array.isArray(room.players)
        ? room.players
        : [];

    const mePlayer =
      players.find(
        (player) => {
          if (
            socket?.id &&
            player.socketId ===
              socket.id
          ) {
            return true;
          }

          if (
            myUserId != null &&
            player.userId != null &&
            String(
              player.userId
            ) ===
              String(myUserId)
          ) {
            return true;
          }

          return false;
        }
      );

    return Boolean(
      mePlayer?.isHost
    );
  }, [
    room,
    me,
    connected,
  ]);

  // ========================================
  // 自分が既にカードを出したか
  // ========================================

  const hasSubmitted = useMemo(() => {
    if (!socket?.id) {
      return false;
    }

    return playedCards.some(
      (card) =>
        card.socketId === socket.id
    );
  }, [playedCards]);

  // ========================================
  // ゲーム設定
  // ========================================

  const handleStartGame = () => {
    if (!socket || !isHost) {
      return;
    }

    const value = Number(
      intervalInput
    );

    if (
      !Number.isInteger(value) ||
      value <= 0
    ) {
      setError(
        '指定間隔は1以上の整数にしてください。'
      );

      return;
    }

    setIntervalValue(value);
    setError('');

    socket.emit(
      'hawk:start-game',
      {
        roomId,
        interval: value,
      }
    );
  };

  // ========================================
  // 手札を出す
  // ========================================

  const handlePlayCard = (card) => {
    if (!socket) {
      return;
    }

    if (phase !== 'playing') {
      return;
    }

    if (
      selectedCardId !== null ||
      hasSubmitted
    ) {
      return;
    }

    if (!card) {
      return;
    }

    const userId =
      me?.id ??
      me?.userId ??
      me?.user_id ??
      null;

    setSelectedCardId(
      card.id
    );

    socket.emit(
      'hawk:play-card',
      {
        roomId,
        cardId: card.id,
        userId,
      }
    );
  };

  // ========================================
  // 次ラウンド
  // ========================================

  const handleNextRound = () => {
    if (!socket || !isHost) {
      return;
    }

    socket.emit(
      'hawk:next-round',
      {
        roomId,
      }
    );
  };

  // ========================================
  // フリーマッチへ戻る
  // ========================================

  const handleBackToFreeMatch = () => {
    router.push('/rate-match');
  };

  // ========================================
  // ローディング
  // ========================================

  if (phase === 'loading') {
    return (
      <main className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 text-center">
          <p className="font-extrabold text-sky-900">
            ミス・フライデーのえじき
          </p>

          <p className="text-sm text-slate-500 mt-2">
            ゲームサーバーに接続中…
          </p>
        </div>
      </main>
    );
  }

  // ========================================
  // エラー
  // ========================================

  if (phase === 'error') {
    return (
      <main className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 text-center space-y-4">
          <h1 className="text-xl font-extrabold text-sky-900">
            ミス・フライデーのえじき
          </h1>

          <p className="text-sm text-red-600 font-bold">
            {error}
          </p>

          <button
            onClick={
              handleBackToFreeMatch
            }
            className="w-full py-3 rounded-full bg-slate-200 text-slate-700 font-bold"
          >
            フリーマッチへ戻る
          </button>
        </div>
      </main>
    );
  }

  // ========================================
  // セットアップ
  // ========================================

  if (
    phase === 'setup' ||
    phase === 'lobby'
  ) {
    const players =
      Array.isArray(room?.players)
        ? room.players
        : [];

    return (
      <main className="min-h-screen bg-sky-50 flex justify-center px-4 py-6">
        <div className="w-full max-w-md space-y-4">

          <div className="bg-white rounded-2xl shadow p-5 text-center">
            <p className="text-xs text-slate-500">
              ミス・フライデーのえじき
            </p>

            <h1 className="text-2xl font-black text-sky-900 mt-1">
              ゲーム設定
            </h1>

            <p className="text-xs text-slate-500 mt-2">
              部屋ID：{roomId}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-bold">
              {error}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow p-4">
            <p className="font-extrabold text-sky-900 mb-3">
              参加者
            </p>

            <div className="space-y-2">
              {players.map(
                (player, index) => (
                  <div
                    key={
                      player.socketId ||
                      player.userId ||
                      index
                    }
                    className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-black">
                      {index + 1}
                    </div>

                    <div className="flex-1">
                      <p className="font-bold text-sm">
                        {player.name ||
                          'プレイヤー'}
                      </p>

                      {player.isHost && (
                        <p className="text-[10px] text-amber-600 font-bold">
                          部屋主
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-5 space-y-4">
            <div>
              <p className="font-extrabold text-sky-900">
                人気順位の間隔
              </p>

              <p className="text-xs text-slate-500 mt-1">
                例：10なら101、111、121…のように15枚を選びます。
              </p>
            </div>

            <input
              type="number"
              min="1"
              step="1"
              value={intervalInput}
              onChange={(e) => {
                setIntervalInput(
                  e.target.value
                );
                setError('');
              }}
              disabled={!isHost}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-4 text-center text-2xl font-black outline-none focus:border-sky-400 disabled:bg-slate-100"
            />

            {isHost ? (
              <button
                onClick={
                  handleStartGame
                }
                disabled={
                  players.length < 2
                }
                className="w-full py-3 rounded-full bg-emerald-500 text-white font-bold disabled:opacity-40"
              >
                {players.length < 2
                  ? '2人以上必要です'
                  : 'ゲーム開始'}
              </button>
            ) : (
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">
                  部屋主がゲーム設定を決めています
                </p>
              </div>
            )}
          </div>

          <button
            onClick={
              handleBackToFreeMatch
            }
            className="w-full py-3 rounded-full bg-slate-200 text-slate-700 font-bold text-sm"
          >
            フリーマッチへ戻る
          </button>
        </div>
      </main>
    );
  }

  // ========================================
  // ゲーム中
  // ========================================

  if (
    phase === 'playing' ||
    phase === 'result'
  ) {
    const players =
      Array.isArray(room?.players)
        ? room.players
        : [];

    return (
      <main className="min-h-screen bg-sky-50 flex justify-center px-4 py-5">
        <div className="w-full max-w-md space-y-4">

          <div className="bg-white rounded-2xl shadow p-4 text-center">
            <p className="text-xs text-slate-500">
              ミス・フライデーのえじき
            </p>

            <div className="flex items-center justify-between mt-2">
              <p className="text-sm font-bold text-slate-600">
                第{round}/15回戦
              </p>

              <p className="text-xs text-slate-500">
                部屋 {roomId}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-5 text-center">
            <p className="text-xs text-slate-500">
              今回の得点カード
            </p>

            <div
              className={`mt-3 text-6xl font-black ${
                Number(scoreCard) < 0
                  ? 'text-blue-600'
                  : 'text-red-600'
              }`}
            >
              {Number(scoreCard) > 0
                ? `+${scoreCard}`
                : scoreCard}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <p className="font-extrabold text-sky-900 mb-3">
              現在の得点
            </p>

            <div className="space-y-2">
              {players.map(
                (player, index) => {
                  const scoreData =
                    scores.find(
                      (s) =>
                        s.socketId ===
                        player.socketId
                    );

                  return (
                    <div
                      key={
                        player.socketId ||
                        player.userId ||
                        index
                      }
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm font-bold">
                        {player.name ||
                          `P${index + 1}`}
                      </span>

                      <span className="text-lg font-black text-sky-800">
                        {scoreData?.score ??
                          0}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-extrabold text-sky-900">
                あなたの手札
              </p>

              <p className="text-xs text-slate-500">
                残り {myCards.length}枚
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {myCards.map(
                (card) => {
                  const selected =
                    selectedCardId ===
                    card.id;

                  return (
                    <button
                      key={card.id}
                      onClick={() =>
                        handlePlayCard(
                          card
                        )
                      }
                      disabled={
                        phase !==
                          'playing' ||
                        selectedCardId !==
                          null ||
                        hasSubmitted
                      }
                      className={`min-h-20 rounded-xl border-2 p-2 font-extrabold text-sm transition ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-sky-400'
                      } ${
                        phase !==
                          'playing' ||
                        selectedCardId !==
                          null ||
                        hasSubmitted
                          ? 'opacity-60'
                          : ''
                      }`}
                    >
                      {card.name}
                    </button>
                  );
                }
              )}
            </div>

            {selectedCardId !== null && (
              <p className="text-center text-xs text-emerald-600 font-bold mt-3">
                カードを選択しました。全員の選択を待っています。
              </p>
            )}
          </div>

          {playedCards.length > 0 && (
            <div className="bg-white rounded-2xl shadow p-4">
              <p className="font-extrabold text-sky-900 mb-3">
                公開されたカード
              </p>

              <div className="space-y-2">
                {playedCards.map(
                  (card, index) => (
                    <div
                      key={
                        card.socketId ||
                        index
                      }
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"
                    >
                      <span className="text-sm font-bold">
                        {card.playerName}
                      </span>

                      <span className="font-extrabold text-slate-800">
                        {card.name}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {roundResult && (
            <div className="bg-white rounded-2xl shadow p-5 text-center">
              <p className="text-xs text-slate-500">
                ラウンド結果
              </p>

              <p className="text-xl font-black text-sky-900 mt-2">
                {roundResult.winnerName
                  ? `${roundResult.winnerName} が ${roundResult.score > 0 ? '+' : ''}${roundResult.score}点獲得`
                  : 'このラウンドは得点者なし'}
              </p>

              {roundResult.tieInfo && (
                <p className="text-xs text-slate-500 mt-2">
                  {roundResult.tieInfo}
                </p>
              )}

              {isHost &&
                round < 15 && (
                  <button
                    onClick={
                      handleNextRound
                    }
                    className="w-full mt-4 py-3 rounded-full bg-emerald-500 text-white font-bold"
                  >
                    次のラウンドへ
                  </button>
                )}

              {!isHost &&
                round < 15 && (
                  <p className="text-xs text-slate-500 mt-3">
                    部屋主が次のラウンドを開始します。
                  </p>
                )}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ========================================
  // 最終結果
  // ========================================

  if (phase === 'finished') {
    const results =
      Array.isArray(
        finalResult?.results
      )
        ? finalResult.results
        : [];

    return (
      <main className="min-h-screen bg-sky-50 flex justify-center px-4 py-5">
        <div className="w-full max-w-md space-y-4">

          <div className="bg-white rounded-2xl shadow p-5 text-center">
            <p className="text-xs text-slate-500">
              ミス・フライデーのえじき
            </p>

            <h1 className="text-3xl font-black text-sky-900 mt-1">
              最終結果
            </h1>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <p className="font-extrabold text-sky-900 mb-3">
              最終得点
            </p>

            <div className="space-y-2">
              {scores
                .slice()
                .sort(
                  (a, b) =>
                    b.score - a.score
                )
                .map(
                  (player, index) => (
                    <div
                      key={
                        player.socketId ||
                        player.userId ||
                        index
                      }
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-black">
                          {index + 1}
                        </span>

                        <span className="font-bold">
                          {player.name}
                        </span>
                      </div>

                      <span className="text-xl font-black text-sky-800">
                        {player.score}
                      </span>
                    </div>
                  )
                )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <p className="font-extrabold text-sky-900">
              キャラクターの人気順位
            </p>

            <p className="text-xs text-slate-500 mt-1 mb-3">
              ゲーム中は非公開だったカードの強さです。
            </p>

            <div className="space-y-2">
              {results.map(
                (card, index) => (
                  <div
                    key={
                      card.cardId ||
                      index
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">
                        {card.name}
                      </span>

                      <span className="text-sm font-black text-sky-700">
                        人気順位：
                        {card.rank}
                      </span>
                    </div>

                    {card.history && (
                      <div className="mt-2 text-xs text-slate-500">
                        {card.history}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          <button
            onClick={
              handleBackToFreeMatch
            }
            className="w-full py-3 rounded-full bg-sky-500 text-white font-bold"
          >
            フリーマッチへ戻る
          </button>
        </div>
      </main>
    );
  }

  return null;
}

// ========================================
// Next.js の prerender 対策
// useSearchParams() を使うコンポーネントを
// Suspense で包む
// ========================================

export default function HawkPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 text-center">
            <p className="font-extrabold text-sky-900">
              ミス・フライデーのえじき
            </p>

            <p className="text-sm text-slate-500 mt-2">
              読み込み中…
            </p>
          </div>
        </main>
      }
    >
      <HawkGamePage />
    </Suspense>
  );
}

