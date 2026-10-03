// file: app/free/extra-poker/page.js

'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useSearchParams,
} from 'next/navigation';

import {
  io,
} from 'socket.io-client';


const DEFAULT_SETTINGS = {
  initialChips: 10000,
  rounds: 3,
  minBet: 100,
  maxBet: 2000,
};


/* =========================================================
   SOCKET
========================================================= */

function getSocketUrl() {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }

  if (typeof window !== 'undefined') {
    const protocol =
      window.location.protocol === 'https:'
        ? 'https:'
        : 'http:';

    return `${protocol}//${window.location.hostname}:4000`;
  }

  return '';
}


/* =========================================================
   ANSWER
========================================================= */

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[（）]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[〜～~‐-‒–—―−]/g, 'ー')
    .replace(/ー+/g, 'ー')
    .trim();
}


function getAnswerCandidates(name) {
  const raw =
    String(name ?? '').trim();

  if (!raw) {
    return [];
  }

  const candidates = [];

  candidates.push(raw);

  const parenthesisMatches =
    raw.match(
      /[（(]([^）)]*)[）)]/g
    ) || [];

  parenthesisMatches.forEach(
    (value) => {
      const inside =
        value
          .replace(/^[（(]/, '')
          .replace(/[）)]$/, '')
          .trim();

      if (inside) {
        candidates.push(inside);
      }
    }
  );

  const withoutParentheses =
    raw.replace(
      /[（(][^）)]*[）)]/g,
      ''
    );

  if (withoutParentheses) {
    candidates.push(
      withoutParentheses
    );
  }

  return [
    ...new Set(
      candidates
        .map(normalizeAnswer)
        .filter(Boolean)
    ),
  ];
}


function isAnswerCorrect(
  answer,
  characterName
) {
  const normalizedAnswer =
    normalizeAnswer(answer);

  if (!normalizedAnswer) {
    return false;
  }

  const candidates =
    getAnswerCandidates(
      characterName
    );

  return candidates.includes(
    normalizedAnswer
  );
}


/* =========================================================
   RESULT HELPERS
========================================================= */

function getWinnerFromResult(result) {
  if (!result) {
    return null;
  }

  return (
    result.winner ||
    result.winnerPlayer ||
    result.correctPlayer ||
    result.correctAnswer ||
    null
  );
}


function getWinnerSocketId(result) {
  const winner =
    getWinnerFromResult(result);

  if (
    Array.isArray(
      result?.winnerSocketIds
    ) &&
    result.winnerSocketIds.length > 0
  ) {
    return result.winnerSocketIds[0];
  }

  return (
    result?.winnerSocketId ??
    result?.winnerId ??
    result?.correctSocketId ??
    result?.correctPlayerId ??
    winner?.socketId ??
    winner?.id ??
    null
  );
}


function getWinnerName(result) {
  const winner =
    getWinnerFromResult(result);

  if (
    Array.isArray(
      result?.winnerSocketIds
    ) &&
    result.winnerSocketIds.length > 0
  ) {
    const winnerId =
      result.winnerSocketIds[0];

    const winnerPlayer =
      Array.isArray(result?.players)
        ? result.players.find(
            (player) =>
              player.socketId ===
              winnerId
          )
        : null;

    if (winnerPlayer) {
      return (
        winnerPlayer.name ??
        winnerPlayer.playerName ??
        null
      );
    }
  }

  return (
    result?.winnerName ??
    result?.correctPlayerName ??
    winner?.name ??
    winner?.playerName ??
    null
  );
}


/*
 * 正解時の説明文を取得。
 */
function getCharacterDescription(result) {
  if (!result) {
    return '';
  }

  const descriptionCandidates = [
    result.description,
    result.characterDescription,
    result.answerDescription,
    result.character?.description,
    result.correctDescription,
  ];

  for (
    const value of descriptionCandidates
  ) {
    if (
      value !== null &&
      value !== undefined &&
      String(value) !== ''
    ) {
      return String(value);
    }
  }

  return '';
}


/*
 * 正解時のキャラクター名を取得。
 */
function getCharacterName(result) {
  if (!result) {
    return '';
  }

  return String(
    result.characterName ??
    result.answer ??
    result.correctAnswer ??
    result.character?.name ??
    ''
  );
}


/* =========================================================
   MAIN
========================================================= */

export default function ExtraPokerPage() {
  const searchParams =
    useSearchParams();

  const roomId =
    String(
      searchParams.get('room') || ''
    );

  const socketRef =
    useRef(null);

  const lastActionKeyRef =
    useRef('');

  const actionNoticeTimerRef =
    useRef(null);

  const [connected, setConnected] =
    useState(false);

  const [error, setError] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [me, setMe] =
    useState(null);

  const [settings, setSettings] =
    useState(DEFAULT_SETTINGS);

  const [phase, setPhase] =
    useState('setup');

  const [round, setRound] =
    useState(0);

  const [totalRounds, setTotalRounds] =
    useState(3);

  const [turnNumber, setTurnNumber] =
    useState(0);

  const [players, setPlayers] =
    useState([]);

  const [myHand, setMyHand] =
    useState([]);

  const [pot, setPot] =
    useState(0);

  const [currentBet, setCurrentBet] =
    useState(0);

  const [currentActorId, setCurrentActorId] =
    useState(null);

  const [mySocketId, setMySocketId] =
    useState('');

  const [lastAction, setLastAction] =
    useState(null);

  const [actionHistory, setActionHistory] =
    useState([]);

  const [actionNotice, setActionNotice] =
    useState('');

  const [cardsRemaining, setCardsRemaining] =
    useState(0);

  const [answer, setAnswer] =
    useState('');

  const [bet, setBet] =
    useState(100);

  const [turnResult, setTurnResult] =
    useState(null);

  const [turnDescription, setTurnDescription] =
    useState('');

  const [turnCharacterName, setTurnCharacterName] =
    useState('');

  const [revealedHands, setRevealedHands] =
    useState(null);

  const [revealedAnswers, setRevealedAnswers] =
    useState(null);

  const [lastAnswerResult, setLastAnswerResult] =
    useState(null);

  const [finalResults, setFinalResults] =
    useState(null);


  /* =======================================================
     PLAYER
  ======================================================= */

  const mePlayer =
    useMemo(
      () =>
        players.find(
          (player) =>
            player.socketId ===
            mySocketId
        ) || null,
      [
        players,
        mySocketId,
      ]
    );


  const isMyTurn =
    Boolean(
      mySocketId &&
      currentActorId === mySocketId
    );


  const hasWinner =
    Boolean(
      turnResult &&
      (
        (
          Array.isArray(
            turnResult?.winnerSocketIds
          ) &&
          turnResult.winnerSocketIds.length > 0
        ) ||
        turnResult?.hasWinner === true ||
        getWinnerSocketId(
          turnResult
        ) ||
        getWinnerName(
          turnResult
        ) ||
        turnResult?.correct === true ||
        turnResult?.winner === true
      )
    );


  const revealedCharacterName =
    String(
      turnCharacterName ||
      turnResult?.characterName ||
      getCharacterName(turnResult) ||
      ''
    );


  const revealedDescription =
    String(
      turnResult?.description ??
      turnDescription ??
      turnResult?.characterDescription ??
      turnResult?.answerDescription ??
      turnResult?.correctDescription ??
      turnResult?.character?.description ??
      ''
    );


  const hasRevealedAnswer =
    Boolean(
      revealedCharacterName ||
      revealedDescription
    );


  /* =======================================================
     SOCKET CONNECTION
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const response =
          await fetch(
            '/api/me',
            {
              cache: 'no-store',
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (cancelled) {
          return;
        }

        const user =
          data?.user ??
          data?.me ??
          data ??
          null;

        setMe(user);
      } catch (loadError) {
        console.error(
          '[extra-poker] /api/me error',
          loadError
        );
      }
    }

    loadMe();

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    return () => {
      if (actionNoticeTimerRef.current) {
        clearTimeout(
          actionNoticeTimerRef.current
        );

        actionNoticeTimerRef.current =
          null;
      }
    };
  }, []);


  useEffect(() => {
    if (!roomId) {
      setError(
        '部屋IDがありません。'
      );

      return;
    }

    const url =
      getSocketUrl();

    const socket =
      io(
        url,
        {
          transports: [
            'websocket',
          ],
        }
      );

    socketRef.current =
      socket;


    socket.on(
      'connect',
      async () => {
        setConnected(true);
        setMySocketId(socket.id);

        try {
          const response =
            await fetch(
              '/api/me',
              {
                cache: 'no-store',
              }
            );

          let user = null;

          if (response.ok) {
            const data =
              await response.json();

            user =
              data?.user ??
              data?.me ??
              data ??
              null;
          }

          const name =
            String(
              user?.display_name ??
              user?.username ??
              user?.name ??
              ''
            ).trim();

          const userId =
            String(
              user?.id ??
              user?.userId ??
              user?.user_id ??
              ''
            );

          setMe(user);

          socket.emit(
            'extra-poker:join',
            {
              roomId,
              userId,
              name,
            }
          );
        } catch (joinError) {
          console.error(
            '[extra-poker] join error',
            joinError
          );

          setError(
            'プレイヤー情報の取得に失敗しました。'
          );
        }
      }
    );


    socket.on(
      'disconnect',
      () => {
        setConnected(false);
      }
    );


    socket.on(
      'extra-poker:connected',
      () => {
        setMessage(
          'ゲームに接続しました。'
        );
      }
    );


    socket.on(
      'extra-poker:error',
      (payload) => {
        setError(
          String(
            payload?.message ||
            'エラーが発生しました。'
          )
        );
      }
    );


    socket.on(
      'extra-poker:state',
      (payload) => {
        setPhase(
          payload?.phase ||
          'setup'
        );

        setRound(
          Number(
            payload?.round ?? 0
          )
        );

        setTotalRounds(
          Number(
            payload?.totalRounds ?? 3
          )
        );

        setTurnNumber(
          Number(
            payload?.turnNumber ?? 0
          )
        );

        setPlayers(
          Array.isArray(
            payload?.players
          )
            ? payload.players
            : []
        );

        setPot(
          Number(
            payload?.pot ?? 0
          )
        );

        setCurrentBet(
          Number(
            payload?.currentBet ?? 0
          )
        );

        setCurrentActorId(
          payload?.currentActorId ??
          null
        );

        setLastAction(
          payload?.lastAction ??
          null
        );


        const nextAction =
          payload?.lastAction ??
          null;

        if (nextAction) {
          const actionKey =
            `${Number(
              payload?.turnNumber ?? 0
            )}:${JSON.stringify(
              nextAction
            )}`;

          if (
            actionKey !==
            lastActionKeyRef.current
          ) {
            lastActionKeyRef.current =
              actionKey;

            setActionHistory(
              (prev) =>
                [
                  ...prev,
                  nextAction,
                ].slice(-20)
            );

            const actionText =
              formatAction(
                nextAction
              );

            if (actionText) {
              setActionNotice(
                actionText
              );

              if (
                actionNoticeTimerRef.current
              ) {
                clearTimeout(
                  actionNoticeTimerRef.current
                );
              }

              actionNoticeTimerRef.current =
                setTimeout(
                  () => {
                    setActionNotice('');
                    actionNoticeTimerRef.current =
                      null;
                  },
                  2000
                );
            }
          }
        }


        setCardsRemaining(
          Number(
            payload?.cardsRemaining ?? 0
          )
        );


        if (
          Number(
            payload?.currentBet ?? 0
          ) >= 100
        ) {
          setBet(
            Number(
              payload.currentBet
            )
          );
        }
      }
    );


    socket.on(
      'extra-poker:my-hand',
      (payload) => {
        setMyHand(
          Array.isArray(
            payload?.cards
          )
            ? payload.cards
            : []
        );
      }
    );


    socket.on(
      'extra-poker:turn-started',
      (payload) => {
        setTurnResult(null);
        setTurnDescription('');
        setTurnCharacterName('');
        setRevealedHands(null);
        setRevealedAnswers(null);
        setLastAnswerResult(null);

        setAnswer('');
        setMessage('');
        setActionNotice('');

        if (
          actionNoticeTimerRef.current
        ) {
          clearTimeout(
            actionNoticeTimerRef.current
          );

          actionNoticeTimerRef.current =
            null;
        }

        setRound(
          Number(
            payload?.round ?? 0
          )
        );

        setTurnNumber(
          Number(
            payload?.turnNumber ?? 0
          )
        );

        setPot(
          Number(
            payload?.pot ?? 0
          )
        );

        setCurrentBet(
          Number(
            payload?.currentBet ?? 0
          )
        );
      }
    );


    socket.on(
      'extra-poker:hands-revealed',
      (payload) => {
        setRevealedHands(
          Array.isArray(
            payload?.hands
          )
            ? payload.hands
            : []
        );
      }
    );


    socket.on(
      'extra-poker:answers-revealed',
      (payload) => {
        setRevealedAnswers(
          Array.isArray(
            payload?.answers
          )
            ? payload.answers
            : []
        );
      }
    );


    socket.on(
      'extra-poker:last-answer',
      () => {
        setAnswer('');

        setMessage(
          '残り山札がすべて公開されました。最後の1回を回答してください。'
        );
      }
    );


    socket.on(
      'extra-poker:last-answer-result',
      (payload) => {
        setLastAnswerResult(payload);

        setMessage(
          payload?.correct
            ? '最後の回答は正解！'
            : '最後の回答は不正解でした。'
        );
      }
    );


    socket.on(
      'extra-poker:turn-result',
      (payload) => {
        setTurnResult(
          payload ?? null
        );

        setTurnCharacterName(
          typeof payload?.characterName === 'string'
            ? payload.characterName
            : ''
        );

        setTurnDescription(
          typeof payload?.description === 'string'
            ? payload.description
            : ''
        );

        setRevealedAnswers(
          Array.isArray(
            payload?.answers
          )
            ? payload.answers
            : []
        );
      }
    );


    socket.on(
      'extra-poker:game-finished',
      (payload) => {
        setFinalResults(
          Array.isArray(
            payload?.results
          )
            ? payload.results
            : []
        );

        setPhase('finished');
      }
    );


    return () => {
      if (
        actionNoticeTimerRef.current
      ) {
        clearTimeout(
          actionNoticeTimerRef.current
        );

        actionNoticeTimerRef.current =
          null;
      }

      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);


  /* =======================================================
     ACTION
  ======================================================= */

  function emitAction(action) {
    const socket =
      socketRef.current;

    if (!socket) {
      return;
    }

    setError('');

    socket.emit(
      'extra-poker:action',
      {
        roomId,

        userId:
          me?.id ??
          me?.userId ??
          me?.user_id ??
          '',

        action,

        bet:
          Number(bet),

        answer:
          answer.trim(),
      }
    );
  }


  // file: app/free/extra-poker/page.js

function emitSubmitAnswer() {
  const socket =
    socketRef.current;

  if (!socket) {
    return;
  }

  if (!answer.trim()) {
    return;
  }

  setError('');

  socket.emit(
    'extra-poker:action',
    {
      roomId,

      userId:
        me?.id ??
        me?.userId ??
        me?.user_id ??
        '',

      action:
        'reanswer',

      bet:
        Number(bet),

      answer:
        answer.trim(),
    }
  );
}


  function emitLastAnswer() {
    const socket =
      socketRef.current;

    if (!socket) {
      return;
    }

    socket.emit(
      'extra-poker:last-answer',
      {
        roomId,

        answer:
          answer.trim(),
      }
    );
  }


  function startGame() {
    const socket =
      socketRef.current;

    if (!socket) {
      return;
    }

    socket.emit(
      'extra-poker:start-game',
      {
        roomId,

        initialChips:
          Number(
            settings.initialChips
          ),

        rounds:
          Number(
            settings.rounds
          ),

        minBet:
          Number(
            settings.minBet
          ),

        maxBet:
          Number(
            settings.maxBet
          ),
      }
    );

    setError('');
  }


  function nextTurn() {
    const socket =
      socketRef.current;

    if (!socket) {
      return;
    }

    socket.emit(
      'extra-poker:next-turn',
      {
        roomId,
      }
    );

    setTurnResult(null);
    setTurnDescription('');
    setTurnCharacterName('');
    setRevealedHands(null);
    setRevealedAnswers(null);
    setLastAnswerResult(null);
    setAnswer('');
    setActionNotice('');

    if (
      actionNoticeTimerRef.current
    ) {
      clearTimeout(
        actionNoticeTimerRef.current
      );

      actionNoticeTimerRef.current =
        null;
    }
  }


  /* =======================================================
     DISPLAY HELPERS
  ======================================================= */

  function formatAction(action) {
    if (!action) {
      return '';
    }

    const playerName =
      String(
        action.playerName ??
        action.name ??
        'プレイヤー'
      );

    const rawAmount =
      action.amount ??
      action.bet ??
      null;

    const hasAmount =
      rawAmount !== null &&
      rawAmount !== undefined &&
      rawAmount !== '';

    const amount =
      hasAmount
        ? Number(rawAmount).toLocaleString()
        : '';

    if (action.type === 'raise') {
      return amount
        ? `${playerName}：${amount}でレイズ！`
        : `${playerName}：レイズ！`;
    }

    if (action.type === 'answer') {
      return amount
        ? `${playerName}：${amount}で回答！`
        : `${playerName}：回答！`;
    }

    if (action.type === 'reanswer') {
      return amount
        ? `${playerName}：${amount}で再回答！`
        : `${playerName}：再回答！`;
    }

    if (action.type === 'bet') {
      return amount
        ? `${playerName}：${amount}でベット！`
        : `${playerName}：ベット！`;
    }

    if (action.type === 'call') {
      return `${playerName}：コール！`;
    }

    if (action.type === 'fold') {
      return `${playerName}：フォールド！`;
    }

    return '';
  }


  function getPlayerStatus(player) {
    if (player.eliminated) {
      return '脱落';
    }

    if (player.folded) {
      return 'フォールド';
    }

    if (player.answerLost) {
      return '回答権なし';
    }

    if (player.answerLocked) {
      if (player.answerSubmitted) {
        return '回答済み';
      }

      return '回答権あり';
    }

    return '参加中';
  }


  function getDisplayedAnswerCorrect(item) {
    if (
      revealedCharacterName
    ) {
      return isAnswerCorrect(
        item?.answer,
        revealedCharacterName
      );
    }

    return Boolean(
      item?.correct
    );
  }


  /* =======================================================
     BUTTON CONDITIONS
  ======================================================= */

  const canRaise =
    isMyTurn &&
    !mePlayer?.folded &&
    !mePlayer?.answerLost &&
    Number(bet) >
      Number(currentBet) &&
    Number(bet) <=
      Number(settings.maxBet);


  const canCall =
    isMyTurn &&
    !mePlayer?.folded &&
    !mePlayer?.answerLost &&
    Number(currentBet) <=
      Number(mePlayer?.chips ?? 0) +
      Number(mePlayer?.contribution ?? 0);


  const canNormalAnswer =
    isMyTurn &&
    !mePlayer?.folded &&
    !mePlayer?.answerLost &&
    Number(currentBet) <=
      Number(mePlayer?.chips ?? 0) +
      Number(mePlayer?.contribution ?? 0);


  const canSubmitAnswer =
    phase === 'answering' &&
    Boolean(
      mePlayer?.answerLocked
    ) &&
    !mePlayer?.answerSubmitted &&
    !mePlayer?.folded &&
    !mePlayer?.answerLost &&
    answer.trim().length > 0;


  const canGoNextTurn =
    Boolean(
      turnResult &&
      phase !== 'finished'
    );


  /* =======================================================
     SETUP
  ======================================================= */

  if (phase === 'setup') {
    return (
      <main
        style={pageStyle}
      >
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
          }}
        >
          <header
            style={headerStyle}
          >
            <div>
              <h1
                style={titleStyle}
              >
                エクストラポーカー
              </h1>

              <div
                style={roomStyle}
              >
                ROOM {roomId}
              </div>
            </div>

            <ConnectionBadge
              connected={connected}
            />
          </header>


          {error && (
            <ErrorBox
              message={error}
            />
          )}


          <section
            style={{
              background: '#fff',
              borderRadius: '22px',
              padding: '32px',
              boxShadow:
                '0 15px 50px rgba(0,0,0,.12)',
            }}
          >
            <h2
              style={{
                marginTop: 0,
                fontSize: '26px',
              }}
            >
              エクストラポーカー設定
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(200px,1fr))',
                gap: '16px',
              }}
            >
              <SettingInput
                label="初期チップ数"
                type="number"
                value={
                  settings.initialChips
                }
                onChange={(value) =>
                  setSettings(
                    (prev) => ({
                      ...prev,
                      initialChips:
                        Number(value),
                    })
                  )
                }
              />

              <SettingInput
                label="ラウンド数"
                type="number"
                min="1"
                max="20"
                value={
                  settings.rounds
                }
                onChange={(value) =>
                  setSettings(
                    (prev) => ({
                      ...prev,
                      rounds:
                        Number(value),
                    })
                  )
                }
              />

              <SettingInput
                label="最低チップ数"
                type="number"
                min="100"
                step="100"
                value={
                  settings.minBet
                }
                onChange={(value) =>
                  setSettings(
                    (prev) => ({
                      ...prev,
                      minBet:
                        Number(value),
                    })
                  )
                }
              />

              <SettingInput
                label="ベット上限"
                type="number"
                min="100"
                step="100"
                value={
                  settings.maxBet
                }
                onChange={(value) =>
                  setSettings(
                    (prev) => ({
                      ...prev,
                      maxBet:
                        Number(value),
                    })
                  )
                }
              />
            </div>


            <div
              style={{
                marginTop: '24px',
                padding: '18px',
                borderRadius: '14px',
                background: '#f4f1e8',
                lineHeight: 1.8,
              }}
            >
              <div>
                初期チップ：
                <strong>
                  {settings.initialChips}
                </strong>
              </div>

              <div>
                ラウンド：
                <strong>
                  {settings.rounds}
                </strong>
              </div>

              <div>
                最低ベット：
                <strong>
                  {settings.minBet}
                </strong>
              </div>

              <div>
                ベット上限：
                <strong>
                  {settings.maxBet}
                </strong>
              </div>
            </div>


            <button
              onClick={startGame}
              style={{
                ...primaryButtonStyle,
                width: '100%',
                marginTop: '24px',
                fontSize: '18px',
                padding: '16px',
              }}
            >
              ゲーム開始
            </button>
          </section>
        </div>
      </main>
    );
  }


  /* =======================================================
     FINISHED
  ======================================================= */

  if (phase === 'finished') {
    return (
      <main
        style={pageStyle}
      >
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
          }}
        >
          <header
            style={headerStyle}
          >
            <div>
              <h1
                style={titleStyle}
              >
                エクストラポーカー
              </h1>

              <div
                style={roomStyle}
              >
                ROOM {roomId}
              </div>
            </div>

            <ConnectionBadge
              connected={connected}
            />
          </header>


          <section
            style={{
              background: '#fff',
              borderRadius: '22px',
              padding: '30px',
              boxShadow:
                '0 15px 50px rgba(0,0,0,.12)',
            }}
          >
            <h2
              style={{
                textAlign: 'center',
                marginTop: 0,
              }}
            >
              ゲーム結果
            </h2>

            <div>
              {(
                finalResults || []
              ).map(
                (player) => (
                  <div
                    key={
                      player.socketId
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '18px',
                      marginBottom: '10px',
                      borderRadius: '14px',
                      background:
                        player.rank === 1
                          ? '#fff0b8'
                          : '#f5f3ed',
                    }}
                  >
                    <strong
                      style={{
                        width: '55px',
                        fontSize: '22px',
                      }}
                    >
                      {player.rank}位
                    </strong>

                    <strong
                      style={{
                        flex: 1,
                        fontSize: '18px',
                      }}
                    >
                      {player.name}
                    </strong>

                    <strong>
                      {player.chips}
                    </strong>
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }


  /* =======================================================
     GAME TABLE
  ======================================================= */

  return (
    <main
      style={{
        ...pageStyle,
        padding:
          '12px clamp(10px,2vw,24px) 30px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1800px',
          margin: '0 auto',
        }}
      >

        {/* HEADER */}

        <header
          style={{
            ...headerStyle,
            marginBottom: '10px',
          }}
        >
          <div>
            <h1
              style={{
                ...titleStyle,
                fontSize:
                  'clamp(22px,2.5vw,30px)',
              }}
            >
              エクストラポーカー
            </h1>

            <div
              style={roomStyle}
            >
              ROOM {roomId}
            </div>
          </div>

          <ConnectionBadge
            connected={connected}
          />
        </header>


        {error && (
          <ErrorBox
            message={error}
          />
        )}


        {message && (
          <div
            style={{
              marginBottom: '10px',
              padding: '9px 14px',
              borderRadius: '10px',
              background: '#fff',
              border: '1px solid #ddd',
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        )}


        {/* =================================================
            FULL TABLE
        ================================================= */}

        <section
          style={{
            position: 'relative',
            width: '100%',
            minHeight:
              'clamp(620px,72vh,820px)',
            background:
              'radial-gradient(ellipse at center, #1b7047 0%, #0d5230 55%, #07371f 100%)',
            borderRadius: '28px',
            border:
              '12px solid #5c3a21',
            boxShadow:
              '0 18px 50px rgba(0,0,0,.30), inset 0 0 0 3px rgba(255,255,255,.08)',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >

          {/* TABLE INNER LINE */}

          <div
            style={{
              position: 'absolute',
              inset: '14px',
              border:
                '2px solid rgba(255,255,255,.13)',
              borderRadius: '20px',
              pointerEvents: 'none',
            }}
          />


          {/* =================================================
              TABLE INFORMATION
          ================================================= */}

          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '29%',
              transform:
                'translate(-50%, -50%)',
              width:
                'min(700px,88%)',
              textAlign: 'center',
              color: '#fff',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          >

            {/* POT */}

            <div
              style={{
                fontSize: '12px',
                letterSpacing: '4px',
                opacity: .72,
                fontWeight: 900,
              }}
            >
              POT
            </div>

            <div
              style={{
                fontSize:
                  'clamp(38px,5vw,66px)',
                fontWeight: 900,
                lineHeight: 1.05,
                textShadow:
                  '0 3px 10px rgba(0,0,0,.35)',
              }}
            >
              {pot.toLocaleString()}
            </div>


            {/* TABLE INFO */}

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '28px',
                marginTop: '16px',
                fontSize: '15px',
              }}
            >
              <div>
                最高額
                <strong
                  style={{
                    marginLeft: '6px',
                    fontSize: '20px',
                  }}
                >
                  {currentBet.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  opacity: .45,
                }}
              >
                |
              </div>

              <div>
                残り
                <strong
                  style={{
                    marginLeft: '6px',
                    fontSize: '20px',
                  }}
                >
                  {cardsRemaining}
                </strong>
              </div>
            </div>


            {/* ROUND / TURN */}

            <div
              style={{
                marginTop: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                gap: '14px',
                padding:
                  '10px 20px',
                borderRadius:
                  '999px',
                background:
                  'rgba(0,0,0,.32)',
                fontSize: '14px',
                fontWeight: 900,
              }}
            >
              <span>
                ROUND {round} / {totalRounds}
              </span>

              <span
                style={{
                  opacity: .45,
                }}
              >
                |
              </span>

              <span>
                TURN {turnNumber}
              </span>
            </div>

          </div>


          {/* =================================================
              ACTION NOTICE
          ================================================= */}

          {actionNotice && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '51%',
                transform:
                  'translate(-50%, -50%)',
                width:
                  'min(760px,82%)',
                padding:
                  '16px 26px',
                borderRadius:
                  '16px',
                background:
                  'rgba(0,0,0,.78)',
                border:
                  '2px solid rgba(255,255,255,.38)',
                boxShadow:
                  '0 10px 32px rgba(0,0,0,.40)',
                color: '#fff',
                textAlign: 'center',
                fontSize:
                  'clamp(20px,2.5vw,32px)',
                fontWeight: 900,
                lineHeight: 1.3,
                textShadow:
                  '0 2px 7px rgba(0,0,0,.55)',
                zIndex: 20,
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            >
              {actionNotice}
            </div>
          )}


          {/* =================================================
              PLAYER CARDS
              中央情報の下に横一列
          ================================================= */}

          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '80%',
              transform:
                'translate(-50%, -50%)',
              width:
                'min(1500px,94%)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'stretch',
              gap:
                'clamp(8px,1.2vw,18px)',
              zIndex: 5,
              boxSizing: 'border-box',
            }}
          >

            {players.map(
              (player) => {
                const isActor =
                  player.socketId ===
                  currentActorId;

                const isMe =
                  player.socketId ===
                  mySocketId;

                return (
                  <div
                    key={
                      player.socketId
                    }
                    style={{
                      flex:
                        '1 1 0',
                      minWidth: 0,
                      maxWidth:
                        '270px',
                      padding:
                        '13px 12px',
                      borderRadius:
                        '16px',
                      background:
                        isActor
                          ? 'linear-gradient(180deg,#fff7c9,#ffe78a)'
                          : 'linear-gradient(180deg,#ffffff,#eeeeee)',
                      border:
                        isActor
                          ? '3px solid #e0a800'
                          : isMe
                            ? '3px solid #70a8e8'
                            : '2px solid #ccc',
                      boxShadow:
                        isActor
                          ? '0 0 25px rgba(255,204,0,.55), 0 8px 20px rgba(0,0,0,.3)'
                          : '0 8px 20px rgba(0,0,0,.28)',
                      textAlign: 'center',
                      color: '#222',
                      boxSizing:
                        'border-box',
                    }}
                  >

                    {/* NAME */}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                          'center',
                        gap: '5px',
                        fontWeight: 900,
                        fontSize: '14px',
                        minHeight:
                          '22px',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow:
                            'ellipsis',
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {player.name}
                      </span>

                      {isMe && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '9px',
                            padding: '2px 5px',
                            borderRadius:
                              '999px',
                            background:
                              '#dcecff',
                            color:
                              '#24568f',
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>


                    {/* TURN */}

                    {isActor ? (
                      <div
                        style={{
                          marginTop: '4px',
                          fontSize: '10px',
                          fontWeight: 900,
                          color: '#8a6200',
                        }}
                      >
                        ● 手番
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: '4px',
                          height: '12px',
                        }}
                      />
                    )}


                    {/* CHIPS */}

                    <div
                      style={{
                        marginTop: '4px',
                        fontSize:
                          'clamp(18px,2vw,24px)',
                        fontWeight: 900,
                      }}
                    >
                      {Number(
                        player.chips ?? 0
                      ).toLocaleString()}
                    </div>

                    <div
                      style={{
                        fontSize: '10px',
                        color: '#777',
                      }}
                    >
                      チップ
                    </div>


                    {/* CONTRIBUTION */}

                    <div
                      style={{
                        marginTop: '5px',
                        fontSize: '12px',
                        color: '#555',
                      }}
                    >
                      ベット：
                      <strong>
                        {Number(
                          player.contribution ??
                          0
                        ).toLocaleString()}
                      </strong>
                    </div>


                    {/* STATUS */}

                    <div
                      style={{
                        marginTop: '7px',
                        fontSize: '10px',
                        fontWeight: 800,
                        color:
                          player.answerLocked
                            ? '#b00020'
                            : player.folded
                              ? '#777'
                              : '#555',
                      }}
                    >
                      {
                        getPlayerStatus(
                          player
                        )
                      }
                    </div>

                  </div>
                );
              }
            )}

          </div>


          {/* =================================================
              EMPTY PLAYER MESSAGE
          ================================================= */}

          {players.length === 0 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '70%',
                transform:
                  'translate(-50%, -50%)',
                color:
                  'rgba(255,255,255,.65)',
                fontSize: '14px',
                fontWeight: 700,
              }}
            >
              プレイヤーを待っています……
            </div>
          )}

        </section>


        {/* =================================================
            MY HAND
        ================================================= */}

        <section
          style={{
            marginTop: '12px',
            background:
              'linear-gradient(180deg,#123d29,#0b2d1e)',
            border:
              '8px solid #5c3a21',
            borderRadius:
              '20px',
            padding:
              '14px 16px 16px',
            boxShadow:
              '0 10px 30px rgba(0,0,0,.22)',
            boxSizing:
              'border-box',
            textAlign:
              'center',
          }}
        >

          <div
            style={{
              color: '#d9e9df',
              fontSize: '11px',
              fontWeight: 900,
              letterSpacing: '3px',
              marginBottom: '8px',
            }}
          >
            YOUR HAND
          </div>


          <div
            style={{
              display: 'flex',
              justifyContent:
                'center',
              alignItems:
                'center',
              flexWrap:
                'wrap',
              gap: '8px',
              minHeight:
                '108px',
            }}
          >

            {myHand.length === 0 ? (
              <div
                style={{
                  color:
                    'rgba(255,255,255,.6)',
                  fontSize: '12px',
                }}
              >
                手札なし
              </div>
            ) : (
              myHand.map(
                (
                  card,
                  index
                ) => (
                  <div
                    key={
                      card.id ??
                      index
                    }
                    style={{
                      width:
                        'clamp(58px,7vw,82px)',
                      height:
                        'clamp(76px,9vw,108px)',
                      borderRadius:
                        '9px',
                      background:
                        '#fffdf7',
                      border:
                        '3px solid #ddd',
                      boxShadow:
                        '0 6px 12px rgba(0,0,0,.35)',
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'center',
                      color: '#222',
                      fontWeight: 900,
                      fontSize:
                        'clamp(12px,1.5vw,17px)',
                      padding: '5px',
                      boxSizing:
                        'border-box',
                      wordBreak:
                        'break-word',
                    }}
                  >
                    {card.text}
                  </div>
                )
              )
            )}

          </div>


          {mePlayer && (
            <div
              style={{
                marginTop: '7px',
                color: '#fff',
                fontWeight: 900,
                fontSize: '14px',
              }}
            >
              {Number(
                mePlayer.chips ?? 0
              ).toLocaleString()}
              {' '}
              CHIP
            </div>
          )}

        </section>


        {/* =================================================
            ACTION PANEL
        ================================================= */}

        {isMyTurn &&
          phase === 'playing' && (
          <section
            style={{
              marginTop: '12px',
              background:
                'rgba(255,255,255,.98)',
              borderRadius:
                '18px',
              padding:
                '18px',
              boxShadow:
                '0 10px 35px rgba(0,0,0,.15)',
            }}
          >

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <strong
                style={{
                  fontSize: '18px',
                }}
              >
                あなたの手番
              </strong>

              <span
                style={{
                  padding:
                    '5px 10px',
                  borderRadius:
                    '999px',
                  background:
                    '#fff0b8',
                  color:
                    '#805900',
                  fontSize:
                    '11px',
                  fontWeight:
                    900,
                }}
              >
                YOUR TURN
              </span>
            </div>


            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '180px 1fr',
                gap: '10px',
              }}
            >

              <label>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    marginBottom: '5px',
                  }}
                >
                  ベット額
                </div>

                <input
                  type="number"
                  min={
                    currentBet
                  }
                  max={
                    settings.maxBet
                  }
                  step="100"
                  value={bet}
                  onChange={(event) =>
                    setBet(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  style={
                    inputStyle
                  }
                />
              </label>


              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  paddingBottom: '2px',
                  color: '#777',
                  fontSize: '12px',
                  lineHeight: 1.6,
                }}
              >
                回答はボタンを押したあと、ベットが揃ってから入力します。
              </div>

            </div>


            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(4,1fr)',
                gap: '8px',
                marginTop: '10px',
              }}
            >

              <button
                disabled={
                  !canNormalAnswer
                }
                onClick={() =>
                  emitAction(
                    'answer'
                  )
                }
                style={{
                  ...actionButtonStyle,
                  background:
                    canNormalAnswer
                      ? '#b73535'
                      : '#ccc',
                }}
              >
                回答
              </button>


              <button
                disabled={
                  !canRaise
                }
                onClick={() =>
                  emitAction(
                    'raise'
                  )
                }
                style={{
                  ...actionButtonStyle,
                  background:
                    canRaise
                      ? '#b87916'
                      : '#ccc',
                }}
              >
                レイズ
              </button>


              <button
                disabled={
                  !canCall
                }
                onClick={() =>
                  emitAction(
                    'call'
                  )
                }
                style={{
                  ...actionButtonStyle,
                  background:
                    canCall
                      ? '#3574b7'
                      : '#ccc',
                }}
              >
                コール
              </button>


              <button
                disabled={
                  !isMyTurn
                }
                onClick={() =>
                  emitAction(
                    'fold'
                  )
                }
                style={{
                  ...actionButtonStyle,
                  background:
                    isMyTurn
                      ? '#555'
                      : '#ccc',
                }}
              >
                フォールド
              </button>

            </div>


            <div
              style={{
                marginTop: '8px',
                fontSize: '11px',
                color: '#777',
              }}
            >
              現在の最高額：
              <strong>
                {currentBet}
              </strong>
              {' ／ '}
              上限：
              <strong>
                {settings.maxBet}
              </strong>
            </div>

          </section>
        )}


        {/* =================================================
            ANSWER INPUT
        ================================================= */}

        {phase === 'answering' && (
          <section
            style={{
              marginTop: '12px',
              background: '#fff',
              borderRadius: '18px',
              padding: '22px',
              boxShadow:
                '0 10px 35px rgba(0,0,0,.15)',
              textAlign: 'center',
            }}
          >
            {mePlayer?.answerLocked ? (
              mePlayer?.answerSubmitted ? (
                <strong
                  style={{
                    display: 'block',
                    fontSize: '18px',
                    color: '#555',
                  }}
                >
                  回答を送信しました。ほかのプレイヤーを待っています……
                </strong>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: '22px',
                      fontWeight: 900,
                      color: '#b73535',
                    }}
                  >
                    それでは回答してください
                  </div>

                  <div
                    style={{
                      marginTop: '8px',
                      color: '#777',
                      fontSize: '12px',
                    }}
                  >
                    回答権を獲得したプレイヤーだけが回答できます。
                  </div>

                  <input
                    type="text"
                    value={answer}
                    onChange={(event) =>
                      setAnswer(
                        event.target.value
                      )
                    }
                    placeholder="キャラクター名"
                    style={{
                      ...inputStyle,
                      marginTop: '14px',
                      textAlign: 'left',
                    }}
                  />

                  <button
                    disabled={
                      !canSubmitAnswer
                    }
                    onClick={
                      emitSubmitAnswer
                    }
                    style={{
                      ...primaryButtonStyle,
                      marginTop: '12px',
                      width: '100%',
                      background:
                        canSubmitAnswer
                          ? '#b73535'
                          : '#ccc',
                    }}
                  >
                    回答を送信
                  </button>
                </>
              )
            ) : (
              <strong
                style={{
                  display: 'block',
                  fontSize: '16px',
                  color: '#555',
                }}
              >
                回答権を持つプレイヤーの回答を待っています……
              </strong>
            )}
          </section>
        )}


        {/* =================================================
            LAST ANSWER
        ================================================= */}

        {phase === 'last-answer' && (
          <section
            style={{
              marginTop: '12px',
              background: '#fff2c2',
              border:
                '2px solid #d39a00',
              borderRadius: '18px',
              padding: '22px',
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              最後の回答
            </h2>

            <p>
              残りの山札がすべてあなたに公開されています。
              この1回だけ回答できます。
            </p>

            {isMyTurn ? (
              <>
                <input
                  type="text"
                  value={answer}
                  onChange={(event) =>
                    setAnswer(
                      event.target.value
                    )
                  }
                  placeholder="キャラクター名"
                  style={
                    inputStyle
                  }
                />

                <button
                  disabled={
                    !answer.trim()
                  }
                  onClick={
                    emitLastAnswer
                  }
                  style={{
                    ...primaryButtonStyle,
                    marginTop: '12px',
                    width: '100%',
                  }}
                >
                  最後の回答をする
                </button>
              </>
            ) : (
              <strong>
                最後の回答を待っています……
              </strong>
            )}
          </section>
        )}


        {/* =================================================
            ANSWERS
        ================================================= */}

        {revealedAnswers &&
          revealedAnswers.length > 0 && (
          <section
            style={{
              marginTop: '12px',
              background: '#fff',
              borderRadius: '18px',
              padding: '20px',
              boxShadow:
                '0 8px 30px rgba(0,0,0,.07)',
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              回答公開
            </h2>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {revealedAnswers.map(
                (item, index) => {
                  const correct =
                    getDisplayedAnswerCorrect(
                      item
                    );

                  const winnerSocketId =
                    getWinnerSocketId(
                      turnResult
                    );

                  const isWinner =
                    Boolean(
                      winnerSocketId &&
                      item.socketId ===
                        winnerSocketId
                    );

                  return (
                    <div
                      key={
                        item.socketId ??
                        index
                      }
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                        gap: '12px',
                        padding: '12px',
                        borderRadius:
                          '10px',
                        background:
                          correct
                            ? '#e2f5e5'
                            : '#f9e2e2',
                        border:
                          isWinner
                            ? '2px solid #319447'
                            : '1px solid transparent',
                      }}
                    >
                      <div>
                        <strong>
                          {
                            item.playerName
                          }
                        </strong>

                        <span
                          style={{
                            marginLeft:
                              '12px',
                            fontSize:
                              '18px',
                            fontWeight:
                              900,
                          }}
                        >
                          「
                          {item.answer}
                          」
                        </span>
                      </div>

                      <strong
                        style={{
                          color:
                            correct
                              ? '#237438'
                              : '#a32929',
                        }}
                      >
                        {correct
                          ? '正解'
                          : '不正解'}
                      </strong>
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}


        {/* =================================================
            TURN RESULT
        ================================================= */}

        {turnResult && (
          <section
            style={{
              marginTop: '12px',
              background: '#fff',
              borderRadius: '18px',
              padding: '22px',
              textAlign: 'center',
              boxShadow:
                '0 8px 30px rgba(0,0,0,.07)',
            }}
          >

            <h2
              style={{
                marginTop: 0,
              }}
            >
              ターン終了
            </h2>


            {hasWinner ? (
              <>
                <p
                  style={{
                    fontWeight: 900,
                    fontSize: '20px',
                    color: '#237438',
                    margin:
                      '8px 0 0',
                  }}
                >
                  正解者が出ました。
                </p>

                <div
                  style={{
                    marginTop: '18px',
                    padding: '18px',
                    borderRadius: '14px',
                    background:
                      '#e8f7eb',
                    border:
                      '2px solid #6db77b',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#47734e',
                      fontWeight: 800,
                    }}
                  >
                    正解者
                  </div>

                  <div
                    style={{
                      fontSize: '22px',
                      fontWeight: 900,
                      marginTop: '4px',
                    }}
                  >
                    {
                      getWinnerName(
                        turnResult
                      ) ||
                      '正解者'
                    }
                  </div>
                </div>


                {revealedCharacterName && (
                  <div
                    style={{
                      marginTop: '14px',
                      fontSize: '20px',
                      fontWeight: 900,
                    }}
                  >
                    正解：
                    {revealedCharacterName}
                  </div>
                )}

                <div
                  style={{
                    marginTop: '18px',
                    padding: '18px',
                    background: '#f7f5ef',
                    borderRadius: '12px',
                    textAlign: 'left',
                    lineHeight: 1.9,
                    boxSizing: 'border-box',
                    width: '100%',
                    height: 'auto',
                    minHeight: '80px',
                    overflow: 'visible',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 900,
                      color: '#777',
                      marginBottom: '8px',
                    }}
                  >
                    説明
                  </div>

                  <div
                    style={{
                      fontSize: '15px',
                      color: '#222',
                      lineHeight: 1.9,
                      whiteSpace: 'pre-wrap',
                      overflow: 'visible',
                      overflowWrap: 'anywhere',
                      wordBreak: 'normal',
                      maxWidth: '100%',
                    }}
                  >
                    {revealedDescription || '説明文を取得できませんでした。'}
                  </div>
                </div>


                {revealedHands &&
                  revealedHands.length > 0 && (
                  <div
                    style={{
                      marginTop: '22px',
                      paddingTop: '20px',
                      borderTop:
                        '1px solid #eee',
                      textAlign: 'left',
                    }}
                  >
                    <h3
                      style={{
                        marginTop: 0,
                        textAlign:
                          'center',
                      }}
                    >
                      全員の手札
                    </h3>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection:
                          'column',
                        gap: '12px',
                      }}
                    >
                      {revealedHands.map(
                        (item) => (
                          <div
                            key={
                              item.socketId
                            }
                            style={{
                              padding:
                                '14px',
                              borderRadius:
                                '12px',
                              background:
                                '#f8f7f2',
                              border:
                                '1px solid #e1dfd6',
                            }}
                          >
                            <strong>
                              {item.name}
                            </strong>

                            <div
                              style={{
                                display:
                                  'flex',
                                flexWrap:
                                  'wrap',
                                gap: '6px',
                                marginTop:
                                  '8px',
                              }}
                            >
                              {(
                                item.cards ||
                                []
                              ).map(
                                (
                                  card,
                                  index
                                ) => (
                                  <span
                                    key={
                                      index
                                    }
                                    style={{
                                      padding:
                                        '5px 9px',
                                      borderRadius:
                                        '6px',
                                      background:
                                        '#fff',
                                      border:
                                        '1px solid #ddd',
                                    }}
                                  >
                                    {typeof card ===
                                    'string'
                                      ? card
                                      : card?.text ??
                                        ''}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              </>
            ) : (
              <>
                <p
                  style={{
                    fontWeight: 900,
                    fontSize: '20px',
                    color: '#8d2d2d',
                    margin:
                      '8px 0 0',
                  }}
                >
                  正解者は出ませんでした。
                </p>

                {hasRevealedAnswer ? (
                  <>
                    {revealedCharacterName && (
                      <div
                        style={{
                          marginTop: '18px',
                          padding: '18px',
                          borderRadius: '14px',
                          background: '#e8f7eb',
                          border: '2px solid #6db77b',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#47734e',
                            fontWeight: 800,
                          }}
                        >
                          正解
                        </div>

                        <div
                          style={{
                            fontSize: '24px',
                            fontWeight: 900,
                            marginTop: '4px',
                          }}
                        >
                          {revealedCharacterName}
                        </div>
                      </div>
                    )}

                    {revealedDescription && (
                      <div
                        style={{
                          marginTop: '18px',
                          padding: '18px',
                          background: '#f7f5ef',
                          borderRadius: '12px',
                          textAlign: 'left',
                          lineHeight: 1.9,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          boxSizing: 'border-box',
                          width: '100%',
                          height: 'auto',
                          minHeight: 0,
                          maxHeight: 'none',
                          overflow: 'visible',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            color: '#777',
                            marginBottom: '8px',
                          }}
                        >
                          説明
                        </div>

                        <div
                          style={{
                            fontSize: '15px',
                            color: '#222',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          {revealedDescription}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '16px',
                      borderRadius: '12px',
                      background: '#fff4f4',
                      border: '1px solid #efc5c5',
                      color: '#8d2d2d',
                      fontWeight: 800,
                    }}
                  >
                    正解情報を取得できませんでした。
                  </div>
                )}
              </>
            )}


            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop:
                  '1px solid #eee',
              }}
            >
              <div>
                獲得チップ：
                <strong>
                  {turnResult.pot ?? 0}
                </strong>
              </div>


              {canGoNextTurn && (
                <button
                  onClick={
                    nextTurn
                  }
                  style={{
                    ...primaryButtonStyle,
                    marginTop: '14px',
                    width: '100%',
                  }}
                >
                  次のターンへ
                </button>
              )}
            </div>

          </section>
        )}


        {/* =================================================
            LAST ANSWER RESULT
        ================================================= */}

        {lastAnswerResult && (
          <section
            style={{
              marginTop: '12px',
              background: '#fff',
              borderRadius: '18px',
              padding: '22px',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              最後の回答結果
            </h2>

            <div
              style={{
                fontSize: '24px',
                fontWeight: 900,
                color:
                  lastAnswerResult.correct
                    ? '#237438'
                    : '#a32929',
              }}
            >
              {lastAnswerResult.correct
                ? '正解！'
                : '不正解'}
            </div>

            {lastAnswerResult.correct &&
              (
                lastAnswerResult.characterName ||
                lastAnswerResult.description
              ) && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  background:
                    '#f7f5ef',
                  borderRadius:
                    '12px',
                  textAlign: 'left',
                  lineHeight: 1.9,
                  whiteSpace:
                    'pre-wrap',
                  overflowWrap:
                    'anywhere',
                  wordBreak:
                    'break-word',
                }}
              >
                {lastAnswerResult.characterName && (
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom:
                        '8px',
                    }}
                  >
                    正解：
                    {
                      lastAnswerResult.characterName
                    }
                  </div>
                )}

                {
                  lastAnswerResult.description
                }
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}


/* =========================================================
   SMALL COMPONENTS
========================================================= */

function ConnectionBadge({
  connected,
}) {
  return (
    <div
      style={{
        padding: '8px 14px',
        borderRadius: '999px',
        background:
          connected
            ? '#dff5e4'
            : '#f8dede',
        color:
          connected
            ? '#17652b'
            : '#8b2222',
        fontWeight: 700,
        fontSize: '13px',
        flexShrink: 0,
      }}
    >
      {connected
        ? '接続中'
        : '接続待機中'}
    </div>
  );
}


function ErrorBox({
  message,
}) {
  return (
    <div
      style={{
        marginBottom: '16px',
        padding: '12px 16px',
        borderRadius: '10px',
        background: '#ffe2e2',
        color: '#9b1c1c',
        fontWeight: 700,
      }}
    >
      {message}
    </div>
  );
}


function SettingInput({
  label,
  type,
  value,
  min,
  max,
  step,
  onChange,
}) {
  return (
    <label>
      <div
        style={{
          fontWeight: 700,
          marginBottom: '6px',
        }}
      >
        {label}
      </div>

      <input
        type={type}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        style={inputStyle}
      />
    </label>
  );
}


/* =========================================================
   STYLES
========================================================= */

const pageStyle = {
  minHeight: '100vh',

  background:
    'linear-gradient(180deg,#f7f4ed 0%,#e5dfd2 100%)',

  color: '#222',

  padding: '18px',

  boxSizing: 'border-box',

  fontFamily:
    'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
};


const headerStyle = {
  display: 'flex',

  justifyContent:
    'space-between',

  alignItems: 'center',

  gap: '16px',

  marginBottom: '20px',
};


const titleStyle = {
  margin: 0,

  fontSize:
    'clamp(24px,3vw,32px)',

  fontWeight: 900,
};


const roomStyle = {
  marginTop: '4px',

  color: '#666',

  fontSize: '13px',
};


const inputStyle = {
  width: '100%',

  boxSizing: 'border-box',

  padding: '11px 12px',

  borderRadius: '9px',

  border: '1px solid #ccc',

  background: '#fff',

  color: '#222',

  fontSize: '16px',
};


const primaryButtonStyle = {
  border: 'none',

  borderRadius: '10px',

  padding: '13px 20px',

  background: '#222',

  color: '#fff',

  fontWeight: 800,

  fontSize: '16px',

  cursor: 'pointer',
};


const actionButtonStyle = {
  border: 'none',

  borderRadius: '10px',

  padding: '13px 8px',

  color: '#fff',

  fontWeight: 800,

  fontSize: '14px',

  cursor: 'pointer',
};