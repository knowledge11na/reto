// file: app/solo/extra-character/page.js

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const GAME_TYPES = {
  SOLO: 'solo',
  BATTLE: 'battle',
  COOP: 'coop',
};

const BATTLE_TYPES = {
  LETTER: 'letter',
  AUCTION: 'auction',
};

const REVEAL_TYPES = {
  RANDOM: 'random',
  SELECT: 'select',
  SEQUENTIAL: 'sequential',
};

const SOLO_BEST_KEY = 'extraCharacterSoloBestScore';

const AUCTION_REVEAL_TIME = 15;
const AUCTION_ANSWER_TIME = 60;

const REVEAL_TYPE_LABELS = {
  [REVEAL_TYPES.RANDOM]: 'ランダムでめくる',
  [REVEAL_TYPES.SELECT]: '自分で指定してめくる',
  [REVEAL_TYPES.SEQUENTIAL]: '1文字目から順番にオープン',
};

// 「ー」は記号扱いしない。
// それ以外の句読点・括弧などを記号として最初から公開可能。
const SYMBOL_REGEX =
  /[\s「」『』（）()［］【】〈〉《》〔〕、。・，．！？!?：:；;／/\\＼〜～—−―…‥“”"']/;

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[〜～~ー‐-‒–—―−]/g, 'ー')
    .replace(/ー+/g, 'ー')
    .replace(/ぁ/g, 'あ')
    .replace(/ぃ/g, 'い')
    .replace(/ぅ/g, 'う')
    .replace(/ぇ/g, 'え')
    .replace(/ぉ/g, 'お')
    .replace(/っ/g, 'つ')
    .replace(/ゃ/g, 'や')
    .replace(/ゅ/g, 'ゆ')
    .replace(/ょ/g, 'よ')
    .replace(/ゎ/g, 'わ')
    .replace(/ゔ/g, 'う');
}

function getAnswerCandidates(value) {
  const raw = String(value ?? '');

  const candidates = new Set();

  candidates.add(raw);

  const bracketMatches = [
    ...raw.matchAll(/(?:（([^（）]*)）|\(([^()]*)\))/g),
  ];

  if (bracketMatches.length > 0) {
    const outside = raw
      .replace(/（[^（）]*）/g, '')
      .replace(/\([^()]*\)/g, '');

    candidates.add(outside);

    bracketMatches.forEach((match) => {
      candidates.add(match[1] ?? match[2] ?? '');
    });
  }

  return [...candidates]
    .map(normalizeAnswer)
    .filter(Boolean);
}

function isAnswerCorrect(answer, characterName) {
  const normalizedAnswer = normalizeAnswer(answer);
  const candidates = getAnswerCandidates(characterName);

  console.log('===== 回答判定 =====');
  console.log('入力:', answer);
  console.log('入力を正規化:', normalizedAnswer);
  console.log('キャラクター名:', characterName);
  console.log('候補:', candidates);
  console.log('====================');

  if (!normalizedAnswer) {
    return false;
  }

  return candidates.some(
    (candidate) => candidate === normalizedAnswer
  );
}

function isSymbol(char) {
  return SYMBOL_REGEX.test(char);
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function makeRevealableCharacters(description, symbolsOpen) {
  return Array.from(description).map((char, index) => ({
    index,
    char,
    revealed: symbolsOpen && isSymbol(char),
  }));
}

function getUnrevealedCount(chars) {
  return chars.filter((item) => !item.revealed).length;
}

function getRevealedCount(chars) {
  return chars.filter((item) => item.revealed).length;
}

function revealRandom(chars, amount = 1) {
  const next = chars.map((item) => ({ ...item }));

  const hiddenIndexes = next
    .filter((item) => !item.revealed)
    .map((item) => item.index);

  const selected = shuffle(hiddenIndexes).slice(0, amount);

  selected.forEach((index) => {
    next[index].revealed = true;
  });

  return next;
}

function revealSequential(chars, amount = 1) {
  const next = chars.map((item) => ({ ...item }));

  let remaining = amount;

  for (let i = 0; i < next.length && remaining > 0; i += 1) {
    if (!next[i].revealed) {
      next[i].revealed = true;
      remaining -= 1;
    }
  }

  return next;
}

function revealIndexes(chars, indexes) {
  const next = chars.map((item) => ({ ...item }));

  indexes.forEach((index) => {
    if (next[index]) {
      next[index].revealed = true;
    }
  });

  return next;
}

function createInitialRevealState(description, symbolsOpen) {
  return makeRevealableCharacters(description, symbolsOpen);
}

export default function ExtraCharacterPage() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [gameType, setGameType] = useState(null);
  const [battleType, setBattleType] = useState(null);

  const [roundCount, setRoundCount] = useState(5);

  const [revealType, setRevealType] = useState(
    REVEAL_TYPES.RANDOM
  );
  const [symbolsOpen, setSymbolsOpen] = useState(true);

  const [gameStarted, setGameStarted] = useState(false);

  const [round, setRound] = useState(0);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [revealedChars, setRevealedChars] = useState([]);

  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [answerResult, setAnswerResult] = useState(null);

  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [soloBestScore, setSoloBestScore] = useState(0);

  // 自分で指定
  const [selectedIndexes, setSelectedIndexes] = useState([]);
  const [battleRevealDone, setBattleRevealDone] = useState(false);

  // 対戦プレイヤー
  const [playerCount, setPlayerCount] = useState(2);

  const [playerNames, setPlayerNames] = useState([
    '1P',
    '2P',
    '3P',
    '4P',
    '5P',
    '6P',
    '7P',
    '8P',
  ]);

  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);

  // 通常対戦の端末受け渡し
  const [battleHandoff, setBattleHandoff] = useState(false);

  // オークション
  const [auctionBids, setAuctionBids] = useState([]);
  const [auctionOrder, setAuctionOrder] = useState([]);
  const [auctionTurnIndex, setAuctionTurnIndex] = useState(0);
  const [auctionRoundNumber, setAuctionRoundNumber] = useState(1);
  const [auctionRevealCount, setAuctionRevealCount] = useState(0);

  const [auctionPhase, setAuctionPhase] = useState('input');

  const [auctionBidInputs, setAuctionBidInputs] = useState([]);
  const [auctionInputPlayerIndex, setAuctionInputPlayerIndex] =
    useState(0);

  const [auctionAnswer, setAuctionAnswer] = useState('');
  const [auctionMessage, setAuctionMessage] = useState('');

  // ============================================================
  // 協力モード
  // ============================================================

  // 各文字について
  // -2 = 記号として最初から公開
  // -1 = まだ誰もめくっていない
  // 0以上 = そのプレイヤーがめくった
  const [coopRevealOwners, setCoopRevealOwners] = useState([]);

  // 協力モードの現在プレイヤー
  const [coopCurrentPlayerIndex, setCoopCurrentPlayerIndex] =
    useState(0);

  // 協力モードの端末受け渡し
  const [coopHandoff, setCoopHandoff] = useState(false);

  // 協力モードで現在プレイヤーが選択している文字
  const [coopSelectedIndexes, setCoopSelectedIndexes] =
    useState([]);

  // 協力モードの回答
  const [coopAnswer, setCoopAnswer] = useState('');

  // 協力モードの回答記録
  const [coopResults, setCoopResults] = useState([]);

  // 協力モード終了
  const [coopFinished, setCoopFinished] = useState(false);

  // タイマー
  const [timerMode, setTimerMode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const timerIntervalRef = useRef(null);
  const timerActionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/extra-character');

        if (!response.ok) {
          throw new Error('データの取得に失敗しました。');
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(
            data.error || 'データの取得に失敗しました。'
          );
        }

        if (!cancelled) {
          setCharacters(data.characters || []);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error.message || '読み込みに失敗しました。'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedBest = Number.parseInt(
      window.localStorage.getItem(SOLO_BEST_KEY) || '0',
      10
    );

    if (Number.isFinite(savedBest)) {
      setSoloBestScore(savedBest);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  const maxRounds = Math.max(
    1,
    Math.min(roundCount, 50)
  );

  const availableCharacters = useMemo(() => {
    return characters;
  }, [characters]);

  function stopTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    timerActionRef.current = null;
    setTimerMode(null);
    setTimeLeft(null);
  }

  function startTimer(seconds, mode, onTimeout) {
    stopTimer();

    const deadline = Date.now() + seconds * 1000;

    setTimerMode(mode);
    setTimeLeft(seconds);
    timerActionRef.current = onTimeout;

    timerIntervalRef.current = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      );

      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;

        const action = timerActionRef.current;

        timerActionRef.current = null;
        setTimerMode(null);
        setTimeLeft(null);

        if (action) {
          action();
        }
      }
    }, 200);
  }

  function resetAll() {
    stopTimer();

    setGameType(null);
    setBattleType(null);
    setGameStarted(false);

    setRound(0);
    setCurrentCharacter(null);
    setRevealedChars([]);

    setAnswer('');
    setMessage('');
    setAnswerResult(null);

    setScore(0);
    setFinished(false);

    setSelectedIndexes([]);

    setPlayers([]);
    setCurrentPlayerIndex(0);
    setBattleHandoff(false);

    setAuctionBids([]);
    setAuctionOrder([]);
    setAuctionTurnIndex(0);
    setAuctionRoundNumber(1);
    setAuctionPhase('input');
    setAuctionBidInputs([]);
    setAuctionInputPlayerIndex(0);
    setAuctionAnswer('');
    setAuctionMessage('');

    // 協力モード
    setCoopRevealOwners([]);
    setCoopCurrentPlayerIndex(0);
    setCoopHandoff(false);
    setCoopSelectedIndexes([]);
    setCoopAnswer('');
    setCoopResults([]);
    setCoopFinished(false);
  }

  function chooseCharacter() {
    if (availableCharacters.length === 0) {
      return null;
    }

    return availableCharacters[
      Math.floor(
        Math.random() * availableCharacters.length
      )
    ];
  }

  function buildPlayers() {
    return Array.from(
      { length: playerCount },
      (_, index) => ({
        id: index,
        name:
          playerNames[index]?.trim() ||
          `${index + 1}P`,
        score: 0,
      })
    );
  }

  function startSolo() {
    const character = chooseCharacter();

    if (!character) {
      return;
    }

    stopTimer();

    setGameType(GAME_TYPES.SOLO);
    setBattleType(null);

    setRound(1);
    setCurrentCharacter(character);

    setRevealedChars(
      createInitialRevealState(
        character.description,
        symbolsOpen
      )
    );

    setAnswer('');
    setMessage('');
    setAnswerResult(null);
    setScore(0);
    setFinished(false);
    setSelectedIndexes([]);

    setGameStarted(true);
  }

  function startBattleLetter() {
    const character = chooseCharacter();

    if (!character) {
      return;
    }

    stopTimer();

    const newPlayers = buildPlayers();

    setPlayers(newPlayers);

    setGameType(GAME_TYPES.BATTLE);
    setBattleType(BATTLE_TYPES.LETTER);

    setRound(1);
    setCurrentCharacter(character);

    setRevealedChars(
      createInitialRevealState(
        character.description,
        symbolsOpen
      )
    );

    setAnswer('');
    setMessage('');
    setAnswerResult(null);

    setScore(0);
    setFinished(false);
    setSelectedIndexes([]);

    setCurrentPlayerIndex(0);

    setBattleHandoff(true);

    setGameStarted(true);
  }

  function startBattleAuction() {
    const character = chooseCharacter();

    if (!character) {
      return;
    }

    stopTimer();

    const newPlayers = buildPlayers();

    setPlayers(newPlayers);

    setGameType(GAME_TYPES.BATTLE);
    setBattleType(BATTLE_TYPES.AUCTION);

    setRound(1);
    setCurrentCharacter(character);

    setRevealedChars(
      createInitialRevealState(
        character.description,
        symbolsOpen
      )
    );

    setAnswer('');
    setMessage('');
    setAnswerResult(null);

    setScore(0);
    setFinished(false);
    setSelectedIndexes([]);

    setAuctionBids([]);
    setAuctionOrder([]);
    setAuctionTurnIndex(0);
    setAuctionRoundNumber(1);

    setAuctionPhase('input');

    setAuctionBidInputs(
      Array.from(
        { length: playerCount },
        () => ''
      )
    );

    setAuctionInputPlayerIndex(0);

    setAuctionAnswer('');
    setAuctionMessage('');

    setGameStarted(true);
  }

  // ============================================================
  // 協力モード開始
  // ============================================================

  function createCoopInitialOwners(description) {
    return Array.from(description).map((char) =>
      symbolsOpen && isSymbol(char)
        ? -2
        : -1
    );
  }

  function startCoop() {
    const character = chooseCharacter();

    if (!character) {
      return;
    }

    stopTimer();

    const newPlayers = buildPlayers();

    setPlayers(newPlayers);

    setGameType(GAME_TYPES.COOP);
    setBattleType(null);

    setRound(1);
    setCurrentCharacter(character);

    setCoopRevealOwners(
      createCoopInitialOwners(
        character.description
      )
    );

    setCoopCurrentPlayerIndex(0);
    setCoopHandoff(true);
    setCoopSelectedIndexes([]);
    setCoopAnswer('');
    setCoopResults([]);
    setCoopFinished(false);

    setGameStarted(true);
  }

  /*
   * 通常の文字めくり
   */
  function revealOne() {
    if (!currentCharacter) {
      return false;
    }

    if (getUnrevealedCount(revealedChars) <= 0) {
      return false;
    }

    if (revealType === REVEAL_TYPES.RANDOM) {
      setRevealedChars((prev) =>
        revealRandom(prev, 1)
      );

      setSelectedIndexes([]);

      return true;
    }

    if (revealType === REVEAL_TYPES.SEQUENTIAL) {
      setRevealedChars((prev) =>
        revealSequential(prev, 1)
      );

      setSelectedIndexes([]);

      return true;
    }

    if (revealType === REVEAL_TYPES.SELECT) {
      if (selectedIndexes.length !== 1) {
        setMessage(
          'めくる文字を1つだけ選択してください。'
        );

        return false;
      }

      setRevealedChars((prev) =>
        revealIndexes(
          prev,
          selectedIndexes
        )
      );

      setSelectedIndexes([]);

      return true;
    }

    return false;
  }

  function toggleIndex(index) {
    if (revealedChars[index]?.revealed) {
      return;
    }

    setSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return [];
      }

      return [index];
    });
  }

  // ============================================================
  // 協力モードの文字めくり
  // ============================================================

  function getCoopAvailableIndexes() {
    return coopRevealOwners
      .map((owner, index) =>
        owner === -1
          ? index
          : null
      )
      .filter(
        (index) => index !== null
      );
  }

  function revealCoopOne() {
    if (!currentCharacter) {
      return false;
    }

    const availableIndexes =
      getCoopAvailableIndexes();

    if (availableIndexes.length === 0) {
      return false;
    }

    let selectedIndex = null;

    if (
      revealType ===
      REVEAL_TYPES.SELECT
    ) {
      if (
        coopSelectedIndexes.length !== 1
      ) {
        return false;
      }

      const candidate =
        coopSelectedIndexes[0];

      if (
        coopRevealOwners[candidate] !== -1
      ) {
        return false;
      }

      selectedIndex = candidate;
    }

    if (
      revealType ===
      REVEAL_TYPES.RANDOM
    ) {
      selectedIndex =
        availableIndexes[
          Math.floor(
            Math.random() *
              availableIndexes.length
          )
        ];
    }

    if (
      revealType ===
      REVEAL_TYPES.SEQUENTIAL
    ) {
      selectedIndex =
        availableIndexes[0];
    }

    if (selectedIndex == null) {
      return false;
    }

    setCoopRevealOwners((prev) => {
      const next = [...prev];

      next[selectedIndex] =
        coopCurrentPlayerIndex;

      return next;
    });

    setCoopSelectedIndexes([]);

    return true;
  }

  function toggleCoopIndex(index) {
    if (
      coopRevealOwners[index] !== -1
    ) {
      return;
    }

    setCoopSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return [];
      }

      return [index];
    });
  }

  /*
   * 協力モードの現在プレイヤー用盤面を描画。
   *
   * - 記号 → 常に見える
   * - 自分がめくった文字 → 見える
   * - 過去のプレイヤーがめくった文字 → ×
   * - まだ誰もめくっていない → 付箋
   */
  function displayCoopDescription() {
    if (!currentCharacter) {
      return null;
    }

    const chars =
      Array.from(
        currentCharacter.description
      );

    return chars.map(
      (char, index) => {
        const owner =
          coopRevealOwners[index];

        const selected =
          coopSelectedIndexes.includes(
            index
          ) &&
          owner === -1;

        // 最初から公開される記号
        if (owner === -2) {
          return (
            <span
              key={index}
              className="revealed-char"
            >
              {char}
            </span>
          );
        }

        // 自分がめくった文字
        if (
          owner ===
          coopCurrentPlayerIndex
        ) {
          return (
            <span
              key={index}
              className="revealed-char coop-own-char"
            >
              {char}
            </span>
          );
        }

        // 過去のプレイヤーがめくった場所
        if (
          owner >= 0 &&
          owner !==
            coopCurrentPlayerIndex
        ) {
          return (
            <span
              key={index}
              className="coop-blocked-char"
              title="前のプレイヤーがめくった文字"
            >
              ×
            </span>
          );
        }

        // まだ誰もめくっていない
        return (
          <button
            key={index}
            type="button"
            className={
              selected
                ? 'hidden-char selected'
                : 'hidden-char'
            }
            onClick={() => {
              if (
                revealType ===
                REVEAL_TYPES.SELECT
              ) {
                toggleCoopIndex(index);
              }
            }}
          >
            {String(
              index + 1
            ).padStart(2, '0')}
          </button>
        );
      }
    );
  }

  /*
   * 協力モードの回答時点の盤面を保存する。
   *
   * 結果画面ではゲーム終了後の盤面ではなく、
   * そのプレイヤーが回答した瞬間の盤面を表示する。
   */
  function createCoopBoardSnapshot(
    playerIndex,
    owners
  ) {
    if (!currentCharacter) {
      return [];
    }

    const chars =
      Array.from(
        currentCharacter.description
      );

    return chars.map(
      (char, index) => {
        const owner =
          owners[index];

        if (owner === -2) {
          return {
            index,
            type: 'visible',
            char,
          };
        }

        if (
          owner ===
          playerIndex
        ) {
          return {
            index,
            type: 'visible',
            char,
          };
        }

        if (
          owner >= 0 &&
          owner !== playerIndex
        ) {
          return {
            index,
            type: 'blocked',
            char: '×',
          };
        }

        return {
          index,
          type: 'hidden',
          char: null,
        };
      }
    );
  }

  function submitCoopAnswer() {
    if (
      !currentCharacter ||
      !players[coopCurrentPlayerIndex] ||
      !coopAnswer.trim()
    ) {
      return;
    }

    const playerIndex =
      coopCurrentPlayerIndex;

    const player =
      players[playerIndex];

    const snapshot =
      createCoopBoardSnapshot(
        playerIndex,
        coopRevealOwners
      );

    const result = {
      playerIndex,
      playerName:
        player.name ||
        `${playerIndex + 1}P`,
      answer:
        coopAnswer.trim(),
      correct: isAnswerCorrect(
        coopAnswer,
        currentCharacter.name
      ),
      board: snapshot,
    };

    const nextResults = [
      ...coopResults,
      result,
    ];

    setCoopResults(nextResults);

    setCoopAnswer('');
    setCoopSelectedIndexes([]);

    /*
     * ここでは絶対に正解・不正解を表示しない。
     */
    if (
      playerIndex <
      players.length - 1
    ) {
      const nextPlayer =
        playerIndex + 1;

      setCoopCurrentPlayerIndex(
        nextPlayer
      );

      setCoopHandoff(true);

      return;
    }

    /*
     * 全員の回答が終わった。
     * ここで初めて正誤を公開する。
     */
    setCoopFinished(true);
  }

  function beginCoopTurn() {
    setCoopHandoff(false);
    setCoopAnswer('');
    setCoopSelectedIndexes([]);
  }

  function handleSoloReveal() {
    const revealed = revealOne();

    if (!revealed) {
      return;
    }

    startSoloAnswerTimer();
  }

  function startSoloAnswerTimer() {
    startTimer(
      120,
      'solo-answer',
      () => {
        setMessage(
          '時間切れ！この問題は降参扱いになります。'
        );

        setTimeout(() => {
          surrenderSolo();
        }, 700);
      }
    );
  }

  function startBattleRevealTimer(playerIndex) {
    startTimer(
      30,
      'battle-reveal',
      () => {
        setMessage(
          `${
            players[playerIndex]?.name ||
            `${playerIndex + 1}P`
          }：30秒経過！次のプレイヤーへ。`
        );

        setTimeout(() => {
          nextBattlePlayer();
        }, 700);
      }
    );
  }

  function startBattleAnswerTimer(playerIndex) {
    startTimer(
      60,
      'battle-answer',
      () => {
        setMessage(
          `${
            players[playerIndex]?.name ||
            `${playerIndex + 1}P`
          }：回答時間切れ！次のプレイヤーへ。`
        );

        setTimeout(() => {
          nextBattlePlayer();
        }, 700);
      }
    );
  }

  function startAuctionRevealTimer() {
    startTimer(
      AUCTION_REVEAL_TIME,
      'auction-reveal',
      () => {
        const player =
          auctionOrder[
            auctionTurnIndex
          ];

        setAuctionMessage(
          `${
            players[player?.playerIndex]?.name ||
            `${(player?.playerIndex ?? 0) + 1}P`
          }：15秒以内にめくれなかったため、回答権を失います。`
        );

        setTimeout(() => {
          nextAuctionPlayer();
        }, 700);
      }
    );
  }

  function startAuctionAnswerTimer() {
    startTimer(
      AUCTION_ANSWER_TIME,
      'auction-answer',
      () => {
        const player =
          auctionOrder[
            auctionTurnIndex
          ];

        setAuctionMessage(
          `${
            players[player?.playerIndex]?.name ||
            `${(player?.playerIndex ?? 0) + 1}P`
          }：回答時間切れ！`
        );

        setTimeout(() => {
          nextAuctionPlayer();
        }, 700);
      }
    );
  }

  function nextAuctionPlayer() {
    stopTimer();

    setAuctionAnswer('');
    setSelectedIndexes([]);

    const nextTurn =
      auctionTurnIndex + 1;

    if (
      nextTurn <
      auctionOrder.length
    ) {
      setAuctionTurnIndex(
        nextTurn
      );

      setAuctionPhase('handoff');

      setAuctionMessage(
        '次のプレイヤーへ端末を渡してください。'
      );

      return;
    }

    const currentRevealed =
      getRevealedCount(
        revealedChars
      );

    setAuctionRoundNumber(
      (prev) => prev + 1
    );

    setAuctionRevealCount(0);
    setAuctionPhase('input');

    setAuctionBidInputs(
      Array.from(
        { length: playerCount },
        () => ''
      )
    );

    setAuctionInputPlayerIndex(0);
    setAuctionBids([]);
    setAuctionOrder([]);
    setAuctionTurnIndex(0);
    setAuctionAnswer('');

    setAuctionMessage(
      `全員回答できませんでした。現在${currentRevealed}文字公開された状態で再オークションです。`
    );
  }

  function beginBattleTurn() {
    stopTimer();

    setBattleHandoff(false);
    setAnswer('');
    setMessage('');
    setAnswerResult(null);
    setSelectedIndexes([]);
    setBattleRevealDone(false);

    startBattleRevealTimer(
      currentPlayerIndex
    );
  }

  function nextBattlePlayer() {
    stopTimer();

    setAnswer('');
    setAnswerResult(null);
    setSelectedIndexes([]);
    setMessage('');
    setBattleRevealDone(false);

    const nextPlayer =
      (currentPlayerIndex + 1) %
      players.length;

    setCurrentPlayerIndex(
      nextPlayer
    );

    setBattleHandoff(true);
  }

  function handleBattleReveal() {
    if (battleRevealDone) {
      return;
    }

    const revealed = revealOne();

    if (!revealed) {
      return;
    }

    setBattleRevealDone(true);

    startBattleAnswerTimer(
      currentPlayerIndex
    );
  }

  function handleSoloAnswer() {
    if (
      !currentCharacter ||
      !answer.trim()
    ) {
      return;
    }

    const correct =
      isAnswerCorrect(
        answer,
        currentCharacter.name
      );

    if (!correct) {
      setAnswerResult('wrong');

      setMessage(
        '不正解！もう一度回答できます。'
      );

      setAnswer('');

      return;
    }

    stopTimer();

    const points =
      getUnrevealedCount(
        revealedChars
      );

    setAnswerResult('correct');

    setMessage(
      `正解！ ${points}点獲得！`
    );

    setScore(
      (prev) => prev + points
    );

    setTimeout(() => {
      if (round >= maxRounds) {
        const finalScore =
          score + points;

        setScore(finalScore);

        if (
          finalScore >
          soloBestScore
        ) {
          setSoloBestScore(
            finalScore
          );

          if (
            typeof window !==
            'undefined'
          ) {
            window.localStorage.setItem(
              SOLO_BEST_KEY,
              String(finalScore)
            );
          }
        }

        setFinished(true);

        return;
      }

      const nextCharacter =
        chooseCharacter();

      setRound(
        (prev) => prev + 1
      );

      setCurrentCharacter(
        nextCharacter
      );

      setRevealedChars(
        createInitialRevealState(
          nextCharacter.description,
          symbolsOpen
        )
      );

      setAnswer('');
      setMessage('');
      setAnswerResult(null);
      setSelectedIndexes([]);
    }, 900);
  }

  function handleLetterBattleAnswer() {
    if (
      !currentCharacter ||
      !players[currentPlayerIndex]
    ) {
      return;
    }

    const player =
      players[currentPlayerIndex];

    if (!answer.trim()) {
      setMessage(
        '答えを入力してください。'
      );

      return;
    }

    const isCorrect =
      isAnswerCorrect(
        answer,
        currentCharacter.name
      );

    stopTimer();

    if (!isCorrect) {
      setAnswerResult('wrong');

      setMessage(
        `${player.name || `${currentPlayerIndex + 1}P`}：不正解！`
      );

      setTimeout(() => {
        setAnswer('');
        setAnswerResult(null);
        nextBattlePlayer();
      }, 700);

      return;
    }

    const points =
      getUnrevealedCount(
        revealedChars
      );

    setAnswerResult('correct');

    setMessage(
      `${player.name || `${currentPlayerIndex + 1}P`}：正解！ +${points}点`
    );

    setPlayers((prev) =>
      prev.map(
        (p, index) =>
          index ===
          currentPlayerIndex
            ? {
                ...p,
                score:
                  p.score +
                  points,
              }
            : p
      )
    );

    setTimeout(() => {
      setAnswer('');
      setAnswerResult(null);

      if (round >= maxRounds) {
        stopTimer();
        setFinished(true);

        return;
      }

      const nextCharacter =
        chooseCharacter();

      if (!nextCharacter) {
        setFinished(true);
        return;
      }

      setRound(
        (prev) => prev + 1
      );

      setCurrentCharacter(
        nextCharacter
      );

      setRevealedChars(
        createInitialRevealState(
          nextCharacter.description,
          symbolsOpen
        )
      );

      setAnswer('');
      setMessage('');
      setAnswerResult(null);
      setSelectedIndexes([]);
      setBattleRevealDone(false);

      const nextPlayer =
        (currentPlayerIndex + 1) %
        players.length;

      setCurrentPlayerIndex(
        nextPlayer
      );

      setBattleHandoff(true);
    }, 900);
  }

  function skipSolo() {
    if (!currentCharacter) {
      return;
    }

    const revealed = revealOne();

    if (!revealed) {
      return;
    }

    setMessage(
      '1文字めくりました。'
    );

    startSoloAnswerTimer();
  }

  function surrenderSolo() {
    stopTimer();

    if (!currentCharacter) {
      return;
    }

    setAnswerResult('wrong');

    setMessage(
      `降参！正解は「${currentCharacter.name}」でした。`
    );

    setTimeout(() => {
      if (round >= maxRounds) {
        if (
          score >
          soloBestScore
        ) {
          setSoloBestScore(
            score
          );

          if (
            typeof window !==
            'undefined'
          ) {
            window.localStorage.setItem(
              SOLO_BEST_KEY,
              String(score)
            );
          }
        }

        setFinished(true);

        return;
      }

      const nextCharacter =
        chooseCharacter();

      setRound(
        (prev) => prev + 1
      );

      setCurrentCharacter(
        nextCharacter
      );

      setRevealedChars(
        createInitialRevealState(
          nextCharacter.description,
          symbolsOpen
        )
      );

      setAnswer('');
      setMessage('');
      setAnswerResult(null);
      setSelectedIndexes([]);
    }, 1400);
  }

  function skipBattle() {
    stopTimer();

    setMessage(
      `${
        players[currentPlayerIndex]?.name ||
        `${currentPlayerIndex + 1}P`
      }：スキップ`
    );

    setTimeout(() => {
      nextBattlePlayer();
    }, 500);
  }

  function surrenderBattle() {
    stopTimer();

    if (!currentCharacter) {
      return;
    }

    setAnswerResult('wrong');

    setMessage(
      `降参！正解は「${currentCharacter.name}」でした。`
    );

    setTimeout(() => {
      if (round >= maxRounds) {
        setFinished(true);
        return;
      }

      const nextCharacter =
        chooseCharacter();

      setRound(
        (prev) => prev + 1
      );

      setCurrentCharacter(
        nextCharacter
      );

      setRevealedChars(
        createInitialRevealState(
          nextCharacter.description,
          symbolsOpen
        )
      );

      setAnswer('');
      setMessage('');
      setAnswerResult(null);
      setSelectedIndexes([]);

      const nextPlayer =
        (currentPlayerIndex + 1) %
        players.length;

      setCurrentPlayerIndex(
        nextPlayer
      );

      setBattleHandoff(true);
    }, 1400);
  }

  // ============================================================
  // オークション
  // ============================================================

  function submitOneAuctionBid() {
    if (!currentCharacter) {
      return;
    }

    const raw =
      auctionBidInputs[
        auctionInputPlayerIndex
      ] ?? '';

    const parsed =
      Number.parseInt(
        raw,
        10
      );

    const bid =
      Number.isFinite(parsed)
        ? Math.max(0, parsed)
        : 0;

    const nextInputs = [
      ...auctionBidInputs,
    ];

    nextInputs[
      auctionInputPlayerIndex
    ] = String(bid);

    setAuctionBidInputs(
      nextInputs
    );

    if (
      auctionInputPlayerIndex <
      playerCount - 1
    ) {
      setAuctionInputPlayerIndex(
        (prev) => prev + 1
      );

      setAuctionMessage('');

      return;
    }

    const bids =
      nextInputs.map(
        (value, index) => {
          const parsedValue =
            Number.parseInt(
              value,
              10
            );

          return {
            playerIndex: index,
            bid: Number.isFinite(
              parsedValue
            )
              ? Math.max(
                  0,
                  parsedValue
                )
              : 0,
          };
        }
      );

    setAuctionBids(bids);
    setAuctionPhase(
      'revealBids'
    );

    setAuctionMessage(
      '全員の入札が完了しました。'
    );
  }

  function revealAuctionResults() {
    if (!currentCharacter) {
      return;
    }

    const counts = {};

    auctionBids.forEach(
      (item) => {
        counts[item.bid] =
          (counts[item.bid] || 0) +
          1;
      }
    );

    const eligible =
      auctionBids
        .filter(
          (item) =>
            counts[item.bid] === 1
        )
        .sort((a, b) => {
          if (
            a.bid !== b.bid
          ) {
            return (
              a.bid - b.bid
            );
          }

          return (
            a.playerIndex -
            b.playerIndex
          );
        });

    setAuctionOrder(
      eligible
    );

    setAuctionTurnIndex(0);

    if (
      eligible.length === 0
    ) {
      const currentRevealed =
        getRevealedCount(
          revealedChars
        );

      setAuctionRoundNumber(
        (prev) =>
          prev + 1
      );

      setAuctionRevealCount(0);

      setAuctionPhase(
        'input'
      );

      setAuctionBidInputs(
        Array.from(
          {
            length:
              playerCount,
          },
          () => ''
        )
      );

      setAuctionInputPlayerIndex(
        0
      );

      setAuctionMessage(
        `同額のため全員回答権なし。現在${currentRevealed}文字公開された状態で再オークションです。`
      );

      return;
    }

    setAuctionPhase(
      'handoff'
    );

    setAuctionMessage(
      '入札結果を公開しました。'
    );
  }

  function beginAuctionAnswer() {
    if (
      !auctionOrder[
        auctionTurnIndex
      ]
    ) {
      return;
    }

    stopTimer();

    const player =
      auctionOrder[
        auctionTurnIndex
      ];

    setAuctionAnswer('');
    setSelectedIndexes([]);
    setAuctionRevealCount(0);

    setAuctionPhase(
      'answer'
    );

    setAuctionMessage(
      `${
        players[
          player.playerIndex
        ]?.name ||
        `${player.playerIndex + 1}P`
      }のめくり開始！`
    );

    if (player.bid <= 0) {
      startAuctionAnswerTimer();
      return;
    }

    startAuctionRevealTimer();
  }

  function handleAuctionAnswer() {
    if (
      !currentCharacter ||
      !auctionAnswer.trim()
    ) {
      return;
    }

    const currentAuctionPlayer =
      auctionOrder[
        auctionTurnIndex
      ]?.playerIndex;

    if (
      currentAuctionPlayer ==
      null
    ) {
      return;
    }

    const correct =
      isAnswerCorrect(
        auctionAnswer,
        currentCharacter.name
      );

    if (correct) {
      const points =
        getUnrevealedCount(
          revealedChars
        );

      setPlayers((prev) =>
        prev.map(
          (player, index) =>
            index ===
            currentAuctionPlayer
              ? {
                  ...player,
                  score:
                    player.score +
                    points,
                }
              : player
        )
      );

      setAuctionMessage(
        `${
          players[
            currentAuctionPlayer
          ]?.name ||
          `${currentAuctionPlayer + 1}P`
        } 正解！ ${points}点獲得！`
      );

      setAuctionPhase(
        'correct'
      );

      setTimeout(() => {
        if (
          round >= maxRounds
        ) {
          setFinished(true);
          return;
        }

        const nextCharacter =
          chooseCharacter();

        setRound(
          (prev) =>
            prev + 1
        );

        setCurrentCharacter(
          nextCharacter
        );

        setRevealedChars(
          createInitialRevealState(
            nextCharacter.description,
            symbolsOpen
          )
        );

        setAuctionBids([]);
        setAuctionOrder([]);
        setAuctionTurnIndex(0);
        setAuctionRoundNumber(1);
        setAuctionRevealCount(0);
        setAuctionPhase(
          'input'
        );

        setAuctionBidInputs(
          Array.from(
            {
              length:
                playerCount,
            },
            () => ''
          )
        );

        setAuctionInputPlayerIndex(
          0
        );

        setAuctionAnswer('');
        setAuctionMessage('');
      }, 1000);

      return;
    }

    const nextTurn =
      auctionTurnIndex + 1;

    if (
      nextTurn <
      auctionOrder.length
    ) {
      setAuctionTurnIndex(
        nextTurn
      );

      setAuctionPhase(
        'handoff'
      );

      setAuctionAnswer('');

      setAuctionMessage(
        '次のプレイヤーへ端末を渡してください。'
      );

      return;
    }

    const currentRevealed =
      getRevealedCount(
        revealedChars
      );

    setAuctionRoundNumber(
      (prev) =>
        prev + 1
    );

    setAuctionRevealCount(0);

    setAuctionPhase(
      'input'
    );

    setAuctionBidInputs(
      Array.from(
        {
          length:
            playerCount,
        },
        () => ''
      )
    );

    setAuctionInputPlayerIndex(
      0
    );

    setAuctionBids([]);
    setAuctionOrder([]);
    setAuctionTurnIndex(0);
    setAuctionAnswer('');

    setAuctionMessage(
      `全員不正解！現在${currentRevealed}文字公開された状態で再オークションです。`
    );
  }

  function displayDescription() {
    return revealedChars.map(
      (item) => {
        const selected =
          selectedIndexes.includes(
            item.index
          ) &&
          !item.revealed;

        if (item.revealed) {
          return (
            <span
              key={item.index}
              className="revealed-char"
            >
              {item.char}
            </span>
          );
        }

        return (
          <button
            key={item.index}
            type="button"
            className={
              selected
                ? 'hidden-char selected'
                : 'hidden-char'
            }
            onClick={() =>
              revealType ===
                REVEAL_TYPES.SELECT &&
              (
                gameType ===
                  GAME_TYPES.SOLO ||
                (
                  gameType ===
                    GAME_TYPES.BATTLE &&
                  battleType ===
                    BATTLE_TYPES.LETTER &&
                  !battleRevealDone
                ) ||
                (
                  gameType ===
                    GAME_TYPES.BATTLE &&
                  battleType ===
                    BATTLE_TYPES.AUCTION &&
                  auctionPhase ===
                    'answer' &&
                  auctionRevealCount <
                    (
                      auctionOrder[
                        auctionTurnIndex
                      ]?.bid ?? 0
                    )
                )
              ) &&
              toggleIndex(
                item.index
              )
            }
            disabled={
              revealType !==
                REVEAL_TYPES.SELECT
            }
          >
            {String(
              item.index + 1
            ).padStart(2, '0')}
          </button>
        );
      }
    );
  }

  function renderSetup() {
    return (
      <main className="page">
        <div className="container">
          <Link
            href="/solo"
            className="back-link"
          >
            ← ソロゲーム一覧へ
          </Link>

          <header className="hero">
            <div className="eyebrow">
              EXTRA CHARACTER QUIZ
            </div>

            <h1>
              エクストラキャラクター当て
            </h1>

            <p>
              キャラクターの説明文から、そのキャラクターを当てろ！
            </p>
          </header>

          <section className="setup-card">
            <h2>ゲームモード</h2>

            <div className="mode-grid">
              <button
                className="mode-card"
                onClick={() => {
                  setGameType(
                    GAME_TYPES.SOLO
                  );
                  setBattleType(null);
                }}
              >
                <span className="mode-title">
                  ソロモード
                </span>

                <span className="mode-description">
                  1人で説明文をめくってキャラクターを当てる
                </span>
              </button>

              <button
                className="mode-card"
                onClick={() => {
                  setGameType(
                    GAME_TYPES.BATTLE
                  );
                  setBattleType(null);
                }}
              >
                <span className="mode-title">
                  対戦モード
                </span>

                <span className="mode-description">
                  複数人でキャラクター当て対決
                </span>
              </button>

              {/* 協力モード */}
              <button
                className="mode-card coop-mode-card"
                onClick={() => {
                  setGameType(
                    GAME_TYPES.COOP
                  );
                  setBattleType(null);
                }}
              >
                <span className="mode-title">
                  協力モード
                </span>

                <span className="mode-description">
                  全員で別々の文字をめくり、全員正解を目指す
                </span>
              </button>
            </div>
          </section>

          {gameType ===
            GAME_TYPES.SOLO && (
            <section className="setup-card">
              <h2>ソロ設定</h2>

              <div className="setting-block">
                <div className="setting-label">
                  文字のめくり方
                </div>

                <div className="option-grid">
                  {Object.entries(
                    REVEAL_TYPE_LABELS
                  ).map(
                    ([id, label]) => (
                      <button
                        key={id}
                        className={
                          revealType ===
                          id
                            ? 'option active'
                            : 'option'
                        }
                        onClick={() =>
                          setRevealType(
                            id
                          )
                        }
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="setting-row">
                <label>
                  <input
                    type="checkbox"
                    checked={
                      symbolsOpen
                    }
                    onChange={(event) =>
                      setSymbolsOpen(
                        event.target
                          .checked
                      )
                    }
                  />

                  記号をフルオープン
                </label>

                <span className="setting-help">
                  「ー」は記号ではないため、最初からは公開されません
                </span>
              </div>

              <div className="setting-row">
                <label>
                  ラウンド数

                  <select
                    value={
                      roundCount
                    }
                    onChange={(event) =>
                      setRoundCount(
                        Number(
                          event.target
                            .value
                        )
                      )
                    }
                  >
                    {[1, 3, 5, 10, 20].map(
                      (count) => (
                        <option
                          key={count}
                          value={count}
                        >
                          {count}問
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <button
                className="start-button"
                onClick={
                  startSolo
                }
                disabled={
                  characters.length ===
                  0
                }
              >
                ゲーム開始！
              </button>
            </section>
          )}

          {gameType ===
            GAME_TYPES.BATTLE &&
            !battleType && (
            <section className="setup-card">
              <h2>対戦タイプ</h2>

              <div className="mode-grid">
                <button
                  className="mode-card"
                  onClick={() =>
                    setBattleType(
                      BATTLE_TYPES.LETTER
                    )
                  }
                >
                  <span className="mode-title">
                    文字めくり
                  </span>

                  <span className="mode-description">
                    説明文をめくりながら回答する
                  </span>
                </button>

                <button
                  className="mode-card"
                  onClick={() =>
                    setBattleType(
                      BATTLE_TYPES.AUCTION
                    )
                  }
                >
                  <span className="mode-title">
                    文字数オークション
                  </span>

                  <span className="mode-description">
                    何文字追加で見れば答えられるかを競う
                  </span>
                </button>
              </div>
            </section>
          )}

          {gameType ===
            GAME_TYPES.BATTLE &&
            battleType && (
            <section className="setup-card">
              <h2>
                {battleType ===
                BATTLE_TYPES.AUCTION
                  ? '文字数オークション'
                  : '文字めくり'}
              </h2>

              <div className="setting-row">
                <label>
                  プレイヤー数

                  <select
                    value={
                      playerCount
                    }
                    onChange={(event) => {
                      const count =
                        Number(
                          event.target
                            .value
                        );

                      setPlayerCount(
                        count
                      );
                    }}
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map(
                      (count) => (
                        <option
                          key={count}
                          value={count}
                        >
                          {count}人
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <div className="player-name-settings">
                <div className="setting-label">
                  プレイヤー名
                </div>

                <div className="player-name-grid">
                  {Array.from(
                    {
                      length:
                        playerCount,
                    },
                    (_, index) => (
                      <label
                        key={index}
                        className="player-name-input"
                      >
                        <span>
                          {index + 1}
                          P
                        </span>

                        <input
                          value={
                            playerNames[
                              index
                            ] || ''
                          }
                          onChange={(
                            event
                          ) => {
                            const next =
                              [
                                ...playerNames,
                              ];

                            next[index] =
                              event.target.value;

                            setPlayerNames(
                              next
                            );
                          }}
                          placeholder={`${index + 1}P`}
                          maxLength={20}
                        />
                      </label>
                    )
                  )}
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-label">
                  文字のめくり方
                </div>

                <div className="option-grid">
                  {Object.entries(
                    REVEAL_TYPE_LABELS
                  ).map(
                    ([id, label]) => (
                      <button
                        key={id}
                        className={
                          revealType ===
                          id
                            ? 'option active'
                            : 'option'
                        }
                        onClick={() =>
                          setRevealType(
                            id
                          )
                        }
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="setting-row">
                <label>
                  <input
                    type="checkbox"
                    checked={
                      symbolsOpen
                    }
                    onChange={(event) =>
                      setSymbolsOpen(
                        event.target
                          .checked
                      )
                    }
                  />

                  記号をフルオープン
                </label>
              </div>

              <div className="setting-row">
                <label>
                  ラウンド数

                  <select
                    value={
                      roundCount
                    }
                    onChange={(event) =>
                      setRoundCount(
                        Number(
                          event.target
                            .value
                        )
                      )
                    }
                  >
                    {[1, 3, 5, 10, 20].map(
                      (count) => (
                        <option
                          key={count}
                          value={count}
                        >
                          {count}問
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <div className="battle-rule-note">
                <strong>
                  {battleType ===
                  BATTLE_TYPES.AUCTION
                    ? 'オークション'
                    : '通常対戦'}
                </strong>

                {battleType ===
                BATTLE_TYPES.AUCTION ? (
                  <span>
                    入札は「現在の公開数から追加で何文字めくるか」です。
                    入力中は他プレイヤーの数字は見えません。
                  </span>
                ) : (
                  <span>
                    めくる前30秒、めくった後60秒。
                    時間切れで次のプレイヤーへ移ります。
                  </span>
                )}
              </div>

              <button
                className="start-button"
                onClick={
                  battleType ===
                  BATTLE_TYPES.AUCTION
                    ? startBattleAuction
                    : startBattleLetter
                }
                disabled={
                  characters.length ===
                  0
                }
              >
                ゲーム開始！
              </button>
            </section>
          )}

          {/* ==================================================
              協力モード設定
          ================================================== */}
          {gameType ===
            GAME_TYPES.COOP && (
            <section className="setup-card">
              <h2>協力モード設定</h2>

              <div className="setting-row">
                <label>
                  プレイヤー数

                  <select
                    value={
                      playerCount
                    }
                    onChange={(event) => {
                      const count =
                        Number(
                          event.target
                            .value
                        );

                      setPlayerCount(
                        count
                      );
                    }}
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map(
                      (count) => (
                        <option
                          key={count}
                          value={count}
                        >
                          {count}人
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <div className="player-name-settings">
                <div className="setting-label">
                  プレイヤー名
                </div>

                <div className="player-name-grid">
                  {Array.from(
                    {
                      length:
                        playerCount,
                    },
                    (_, index) => (
                      <label
                        key={index}
                        className="player-name-input"
                      >
                        <span>
                          {index + 1}
                          P
                        </span>

                        <input
                          value={
                            playerNames[
                              index
                            ] || ''
                          }
                          onChange={(
                            event
                          ) => {
                            const next =
                              [
                                ...playerNames,
                              ];

                            next[index] =
                              event.target.value;

                            setPlayerNames(
                              next
                            );
                          }}
                          placeholder={`${index + 1}P`}
                          maxLength={20}
                        />
                      </label>
                    )
                  )}
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-label">
                  文字のめくり方
                </div>

                <div className="option-grid">
                  {Object.entries(
                    REVEAL_TYPE_LABELS
                  ).map(
                    ([id, label]) => (
                      <button
                        key={id}
                        className={
                          revealType ===
                          id
                            ? 'option active'
                            : 'option'
                        }
                        onClick={() =>
                          setRevealType(
                            id
                          )
                        }
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="setting-row">
                <label>
                  <input
                    type="checkbox"
                    checked={
                      symbolsOpen
                    }
                    onChange={(event) =>
                      setSymbolsOpen(
                        event.target
                          .checked
                      )
                    }
                  />

                  記号をフルオープン
                </label>

                <span className="setting-help">
                  「ー」は記号ではないため、最初からは公開されません
                </span>
              </div>

              <div className="coop-rule-note">
                <strong>
                  協力ルール
                </strong>

                <span>
                  P1から順番に、好きな数の文字をめくって回答します。
                </span>

                <span>
                  次のプレイヤーからは、前のプレイヤーがめくった場所が「×」になり、見ることができません。
                </span>

                <span>
                  正解・不正解は最後まで表示されません。
                  全員の回答終了後に一斉判定します。
                </span>
              </div>

              <button
                className="start-button"
                onClick={
                  startCoop
                }
                disabled={
                  characters.length ===
                  0
                }
              >
                協力ゲーム開始！
              </button>
            </section>
          )}

          {loading && (
            <div className="loading">
              キャラクターデータを読み込んでいます……
            </div>
          )}

          {loadError && (
            <div className="error">
              {loadError}
            </div>
          )}

          {!loading &&
            !loadError &&
            characters.length >
              0 && (
              <div className="data-count">
                登録キャラクター：
                {characters.length}人
              </div>
            )}
        </div>
      </main>
    );
  }

  function renderTimer() {
    if (
      timeLeft == null ||
      timerMode == null
    ) {
      return null;
    }

    return (
      <div
        className={
          timeLeft <= 10
            ? 'timer danger'
            : 'timer'
        }
      >
        {timerMode ===
        'battle-reveal'
          ? 'めくるまで '
          : '回答時間 '}

        <strong>
          {timeLeft}
        </strong>
        秒
      </div>
    );
  }

  function renderHandoff({
    playerIndex,
    title = '端末を渡してください',
    description = '次のプレイヤーに端末を渡してください。',
    buttonText = 'このプレイヤーです',
    onStart,
  }) {
    const player =
      players[playerIndex];

    return (
      <main className="page">
        <div className="handoff-container">
          <div className="handoff-card">
            <div className="handoff-label">
              PASS THE DEVICE
            </div>

            <div className="handoff-round">
              {round} / {maxRounds}問
            </div>

            <h1>
              {title}
            </h1>

            <div className="handoff-player">
              {player?.name ||
                `${playerIndex + 1}P`}
            </div>

            <p>
              {description}
            </p>

            <button
              className="start-button handoff-button"
              onClick={onStart}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // 協力モード端末受け渡し
  // ============================================================

  function renderCoopHandoff() {
    const player =
      players[
        coopCurrentPlayerIndex
      ];

    return (
      <main className="page">
        <div className="handoff-container">
          <div className="handoff-card coop-handoff-card">
            <div className="handoff-label">
              COOPERATIVE QUIZ
            </div>

            <div className="handoff-round">
              {coopCurrentPlayerIndex + 1}
              {' / '}
              {players.length}人目
            </div>

            <h1>
              端末を渡してください
            </h1>

            <div className="handoff-player">
              {player?.name ||
                `${coopCurrentPlayerIndex + 1}P`}
            </div>

            <p>
              前のプレイヤーがめくった場所は
              <br />
              「×」になっています。
              <br />
              ×以外の文字を好きな数だけめくってください。
            </p>

            <button
              className="start-button handoff-button"
              onClick={
                beginCoopTurn
              }
            >
              このプレイヤーです
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // 協力モード本編
  // ============================================================

  function renderCoopGame() {
    if (!currentCharacter) {
      return null;
    }

    if (coopHandoff) {
      return renderCoopHandoff();
    }

    const currentPlayer =
      players[
        coopCurrentPlayerIndex
      ];

    const availableCount =
      getCoopAvailableIndexes()
        .length;

    const revealedByCurrent =
      coopRevealOwners.filter(
        (owner) =>
          owner ===
          coopCurrentPlayerIndex
      ).length;

    return (
      <main className="page">
        <div className="game-container">
          <div className="game-top">
            <button
              className="small-button"
              onClick={
                resetAll
              }
            >
              設定に戻る
            </button>

            <div className="coop-turn-top">
              {coopCurrentPlayerIndex + 1}
              {' / '}
              {players.length}人目
            </div>
          </div>

          <div className="coop-player-bar">
            {players.map(
              (player, index) => (
                <div
                  key={
                    player.id
                  }
                  className={
                    index ===
                    coopCurrentPlayerIndex
                      ? 'coop-player active'
                      : index <
                        coopCurrentPlayerIndex
                      ? 'coop-player completed'
                      : 'coop-player'
                  }
                >
                  <span>
                    {player.name}
                  </span>

                  <small>
                    {index <
                    coopCurrentPlayerIndex
                      ? '回答済み'
                      : index ===
                        coopCurrentPlayerIndex
                      ? '回答中'
                      : '待機'}
                  </small>
                </div>
              )
            )}
          </div>

          <div className="coop-turn-title">
            {currentPlayer?.name ||
              `${coopCurrentPlayerIndex + 1}P`}
            のターン
          </div>

          <div className="coop-warning">
            <strong>
              このターンでは正解・不正解は表示されません
            </strong>

            <span>
              好きな数だけ文字をめくってから回答してください。
            </span>
          </div>

          <div className="description-card coop-description-card">
            <div className="description-title">
              このキャラクターは誰？
            </div>

            <div className="description-text">
              {displayCoopDescription()}
            </div>
          </div>

          <div className="coop-counter">
            <div>
              今回自分がめくった文字：
              <strong>
                {revealedByCurrent}
              </strong>
              文字
            </div>

            <div>
              まだ誰もめくっていない：
              <strong>
                {availableCount}
              </strong>
              文字
            </div>
          </div>

          <div className="reveal-controls">
            <button
              className="reveal-button"
              onClick={() => {
                const revealed =
                  revealCoopOne();

                if (!revealed) {
                  return;
                }
              }}
              disabled={
                availableCount === 0
              }
            >
              文字をめくる
            </button>

            {revealType ===
              REVEAL_TYPES.SELECT && (
              <div className="select-help">
                めくりたい付箋を1つクリックしてから
                <br />
                「文字をめくる」を押してください。
                <br />
                選択した付箋は赤く光ります。
              </div>
            )}
          </div>

          <div className="coop-answer-note">
            <strong>
              回答すると、このターンは終了します。
            </strong>

            <span>
              回答後は次のプレイヤーに端末を渡します。
            </span>
          </div>

          <form
            className="answer-area"
            onSubmit={(event) => {
              event.preventDefault();

              submitCoopAnswer();
            }}
          >
            <input
              value={
                coopAnswer
              }
              onChange={(event) =>
                setCoopAnswer(
                  event.target
                    .value
                )
              }
              placeholder="キャラクター名を入力"
              autoComplete="off"
              autoFocus
            />

            <button
              type="submit"
              disabled={
                !coopAnswer.trim()
              }
            >
              回答を確定
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ============================================================
  // 協力モード結果画面
  // ============================================================

  function renderCoopResultBoard(
    board
  ) {
    return (
      <div className="coop-result-board">
        <div className="description-text">
          {board.map(
            (item) => {
              if (
                item.type ===
                'visible'
              ) {
                return (
                  <span
                    key={
                      item.index
                    }
                    className="revealed-char"
                  >
                    {item.char}
                  </span>
                );
              }

              if (
                item.type ===
                'blocked'
              ) {
                return (
                  <span
                    key={
                      item.index
                    }
                    className="coop-blocked-char"
                  >
                    ×
                  </span>
                );
              }

              return (
                <span
                  key={
                    item.index
                  }
                  className="coop-result-hidden"
                >
                  {String(
                    item.index + 1
                  ).padStart(2, '0')}
                </span>
              );
            }
          )}
        </div>
      </div>
    );
  }

  function renderCoopFinished() {
    if (
      !currentCharacter
    ) {
      return null;
    }

    const allCorrect =
      coopResults.length ===
        players.length &&
      coopResults.every(
        (result) =>
          result.correct
      );

    const correctPlayers =
      coopResults.filter(
        (result) =>
          result.correct
      );

    return (
      <main className="page">
        <div className="game-container coop-result-container">
          <div className="coop-result-header">
            <div className="finish-label">
              COOPERATIVE GAME SET
            </div>

            {allCorrect ? (
              <>
                <h1 className="coop-all-correct">
                  全員正解！
                </h1>

                <p>
                  全員でキャラクターを見事に当てました！
                </p>
              </>
            ) : (
              <>
                <h1>
                  協力ゲーム終了
                </h1>

                {correctPlayers.length >
                0 ? (
                  <p className="coop-correct-names">
                    正解者：
                    <strong>
                      {correctPlayers
                        .map(
                          (result) =>
                            result.playerName
                        )
                        .join('、')}
                    </strong>
                  </p>
                ) : (
                  <p className="coop-correct-names">
                    正解者なし
                  </p>
                )}
              </>
            )}

            <div className="coop-answer-correct">
              正解は
              <strong>
                「{currentCharacter.name}」
              </strong>
              でした。
            </div>
          </div>

          <div className="coop-result-list">
            {coopResults.map(
              (result) => (
                <section
                  key={
                    result.playerIndex
                  }
                  className={
                    result.correct
                      ? 'coop-result-card correct'
                      : 'coop-result-card wrong'
                  }
                >
                  <div className="coop-result-player">
                    <div>
                      <span className="coop-result-player-label">
                        {result.playerIndex + 1}
                        P
                      </span>

                      <strong>
                        {result.playerName}
                      </strong>
                    </div>

                    <span
                      className={
                        result.correct
                          ? 'coop-result-status correct'
                          : 'coop-result-status wrong'
                      }
                    >
                      {result.correct
                        ? '正解'
                        : '不正解'}
                    </span>
                  </div>

                  <div className="coop-result-answer">
                    回答：
                    <strong>
                      「{result.answer}」
                    </strong>
                  </div>

                  <div className="coop-result-board-title">
                    回答時の盤面
                  </div>

                  {renderCoopResultBoard(
                    result.board
                  )}
                </section>
              )
            )}
          </div>

          <div className="coop-result-correct-answer">
            正解：
            <strong>
              {currentCharacter.name}
            </strong>
          </div>

          <button
            className="start-button"
            onClick={
              resetAll
            }
          >
            もう一度遊ぶ
          </button>
        </div>
      </main>
    );
  }

  // ============================================================
  // ソロ
  // ============================================================

  function renderSoloGame() {
    if (!currentCharacter) {
      return null;
    }

    const unrevealed =
      getUnrevealedCount(
        revealedChars
      );

    const revealed =
      getRevealedCount(
        revealedChars
      );

    const bestScore =
      Math.max(
        soloBestScore,
        score
      );

    return (
      <main className="page">
        <div className="game-container">
          <div className="game-top">
            <button
              className="small-button"
              onClick={
                resetAll
              }
            >
              設定に戻る
            </button>

            <div>
              {round} / {maxRounds}問
            </div>

            {renderTimer()}

            <div className="score-display">
              SCORE {score}

              <span className="best-score">
                BEST {bestScore}
              </span>
            </div>
          </div>

          {renderTimer()}

          <div className="description-card">
            <div className="description-title">
              このキャラクターは誰？
            </div>

            <div className="description-text">
              {displayDescription()}
            </div>
          </div>

          <div className="counter">
            公開：
            {revealed}文字　

            <strong>
              未公開：
              {unrevealed}文字
            </strong>
          </div>

          <div className="reveal-controls">
            <button
              className="reveal-button"
              onClick={
                handleSoloReveal
              }
              disabled={
                unrevealed === 0
              }
            >
              文字をめくる
            </button>

            {revealType ===
              REVEAL_TYPES.SELECT && (
              <div className="select-help">
                めくりたい付箋を1つクリックしてください。
                <br />
                選択した付箋は赤く光ります。
              </div>
            )}
          </div>

          <div className="game-actions">
            <button
              className="secondary-action"
              onClick={
                skipSolo
              }
              disabled={
                unrevealed === 0
              }
            >
              スキップ
            </button>

            <button
              className="danger-action"
              onClick={
                surrenderSolo
              }
            >
              降参
            </button>
          </div>

          <form
            className="answer-area"
            onSubmit={(event) => {
              event.preventDefault();
              handleSoloAnswer();
            }}
          >
            <input
              value={answer}
              onChange={(event) =>
                setAnswer(
                  event.target
                    .value
                )
              }
              placeholder="キャラクター名を入力"
              autoComplete="off"
            />

            <button type="submit">
              回答する
            </button>
          </form>

          {message && (
            <div
              className={
                answerResult ===
                'correct'
                  ? 'result correct'
                  : answerResult ===
                    'wrong'
                  ? 'result wrong'
                  : 'result'
              }
            >
              {message}
            </div>
          )}

          {finished && (
            <div className="finish-overlay">
              <div className="finish-card">
                <div className="finish-label">
                  GAME SET
                </div>

                <h2>
                  最終スコア
                </h2>

                <div className="final-score">
                  {score}
                </div>

                <div className="final-best-score">
                  自己ベスト：
                  {soloBestScore}
                </div>

                <button
                  className="start-button"
                  onClick={
                    resetAll
                  }
                >
                  もう一度遊ぶ
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ============================================================
  // 通常対戦
  // ============================================================

  function renderBattleLetter() {
    if (!currentCharacter) {
      return null;
    }

    if (battleHandoff) {
      return renderHandoff({
        playerIndex:
          currentPlayerIndex,
        title:
          '端末を渡してください',
        description:
          'このプレイヤーが確認したらゲームを開始してください。',
        buttonText:
          'ゲーム開始',
        onStart:
          beginBattleTurn,
      });
    }

    const unrevealed =
      getUnrevealedCount(
        revealedChars
      );

    const revealed =
      getRevealedCount(
        revealedChars
      );

    return (
      <main className="page">
        <div className="game-container">
          <div className="game-top">
            <button
              className="small-button"
              onClick={
                resetAll
              }
            >
              設定に戻る
            </button>

            <div>
              {round} / {maxRounds}問
            </div>
          </div>

          <div className="battle-scoreboard">
            {players.map(
              (player, index) => (
                <div
                  key={
                    player.id
                  }
                  className={
                    index ===
                    currentPlayerIndex
                      ? 'player-score active'
                      : 'player-score'
                  }
                >
                  <span>
                    {player.name}
                  </span>

                  <strong>
                    {player.score}
                  </strong>
                </div>
              )
            )}
          </div>

          <div className="turn-display">
            {
              players[
                currentPlayerIndex
              ]?.name
            }
            のターン
          </div>

          {renderTimer()}

          <div className="description-card">
            <div className="description-title">
              このキャラクターは誰？
            </div>

            <div className="description-text">
              {displayDescription()}
            </div>
          </div>

          <div className="counter">
            公開：
            {revealed}文字　

            <strong>
              未公開：
              {unrevealed}文字
            </strong>
          </div>

          <div className="reveal-controls">
            <button
              className="reveal-button"
              onClick={
                handleBattleReveal
              }
              disabled={
                unrevealed === 0
              }
            >
              文字をめくる
            </button>

            {revealType ===
              REVEAL_TYPES.SELECT && (
              <div className="select-help">
                めくりたい付箋を1つクリックしてください。
                <br />
                選択した付箋は赤く光ります。
              </div>
            )}
          </div>

          <div className="game-actions">
            <button
              className="secondary-action"
              onClick={
                skipBattle
              }
            >
              スキップ
            </button>

            <button
              className="danger-action"
              onClick={
                surrenderBattle
              }
            >
              降参
            </button>
          </div>

          <form
            className="answer-area"
            onSubmit={(event) => {
              event.preventDefault();
              handleLetterBattleAnswer();
            }}
          >
            <input
              value={answer}
              onChange={(event) =>
                setAnswer(
                  event.target
                    .value
                )
              }
              placeholder="キャラクター名を入力"
              autoComplete="off"
            />

            <button type="submit">
              回答する
            </button>
          </form>

          {message && (
            <div
              className={
                answerResult ===
                'correct'
                  ? 'result correct'
                  : answerResult ===
                    'wrong'
                  ? 'result wrong'
                  : 'result'
              }
            >
              {message}
            </div>
          )}

          {finished && (
            <div className="finish-overlay">
              <div className="finish-card">
                <div className="finish-label">
                  GAME SET
                </div>

                <h2>
                  最終結果
                </h2>

                <div className="battle-final">
                  {players.map(
                    (player) => (
                      <div
                        key={
                          player.id
                        }
                        className="final-player"
                      >
                        <span>
                          {
                            player.name
                          }
                        </span>

                        <strong>
                          {
                            player.score
                          }
                          点
                        </strong>
                      </div>
                    )
                  )}
                </div>

                <button
                  className="start-button"
                  onClick={
                    resetAll
                  }
                >
                  もう一度遊ぶ
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ============================================================
  // オークション
  // ============================================================

  function renderAuctionGame() {
    if (!currentCharacter) {
      return null;
    }

    const revealed =
      getRevealedCount(
        revealedChars
      );

    const unrevealed =
      getUnrevealedCount(
        revealedChars
      );

    const total =
      currentCharacter.description
        .length;

    if (
      auctionPhase ===
      'input'
    ) {
      const inputPlayer =
        players[
          auctionInputPlayerIndex
        ];

      return (
        <main className="page">
          <div className="game-container">
            <div className="game-top">
              <button
                className="small-button"
                onClick={
                  resetAll
                }
              >
                設定に戻る
              </button>

              <div>
                {round} / {maxRounds}問
              </div>
            </div>

            <div className="battle-scoreboard">
              {players.map(
                (player) => (
                  <div
                    key={
                      player.id
                    }
                    className="player-score"
                  >
                    <span>
                      {player.name}
                    </span>

                    <strong>
                      {player.score}
                    </strong>
                  </div>
                )
              )}
            </div>

            <div className="auction-status">
              <div className="auction-round">
                第
                {
                  auctionRoundNumber
                }
                回オークション
              </div>

              <div className="total-count">
                この説明文は
                <strong>
                  {total}
                </strong>
                文字
              </div>

              <div className="revealed-count">
                現在公開：
                <strong>
                  {revealed}
                </strong>
                文字
              </div>
            </div>

            <div className="description-card auction-description auction-bid-description">
              <div className="description-title">
                このキャラクターは誰？
              </div>

              <div className="description-text">
                {displayDescription()}
              </div>
            </div>

            <div className="auction-private-card">
              <div className="private-label">
                端末を渡してください
              </div>

              <div className="private-player">
                {
                  inputPlayer?.name ||
                  `${auctionInputPlayerIndex + 1}P`
                }
              </div>

              <p>
                他のプレイヤーには数字を見せないでください。
              </p>

              <div className="private-rule">
                現在
                <strong>
                  {revealed}
                </strong>
                / {total}文字公開中
                <br />
                盤面を確認して、
                <br />
                <strong>
                  「あと何文字見れば答えられるか」
                </strong>
                を決めてください。
              </div>

              <div className="private-input-row">
                <input
                  type="number"
                  min="0"
                  value={
                    auctionBidInputs[
                      auctionInputPlayerIndex
                    ] ?? ''
                  }
                  onChange={(event) => {
                    const next =
                      [
                        ...auctionBidInputs,
                      ];

                    next[
                      auctionInputPlayerIndex
                    ] =
                      event.target.value;

                    setAuctionBidInputs(
                      next
                    );
                  }}
                  autoFocus
                />

                <span>
                  枚追加
                </span>
              </div>

              <button
                className="start-button"
                onClick={
                  submitOneAuctionBid
                }
              >
                {auctionInputPlayerIndex <
                playerCount - 1
                  ? '入力して次のプレイヤーへ'
                  : '入力を完了する'}
              </button>
            </div>

            {auctionMessage && (
              <div className="result">
                {auctionMessage}
              </div>
            )}
          </div>
        </main>
      );
    }

    if (
      auctionPhase ===
      'revealBids'
    ) {
      return (
        <main className="page">
          <div className="game-container">
            <div className="auction-status">
              <div className="auction-round">
                第
                {
                  auctionRoundNumber
                }
                回オークション
              </div>

              <h1 className="auction-reveal-title">
                入札結果公開
              </h1>

              <p>
                数字の小さい順に回答します。
                <br />
                同じ数字のプレイヤーは今回の回答権を失います。
              </p>
            </div>

            <div className="auction-results">
              {auctionBids
                .slice()
                .sort(
                  (a, b) =>
                    a.bid -
                    b.bid
                )
                .map((bid) => {
                  const sameCount =
                    auctionBids.filter(
                      (item) =>
                        item.bid ===
                        bid.bid
                    ).length;

                  const tied =
                    sameCount >
                    1;

                  return (
                    <div
                      key={
                        bid.playerIndex
                      }
                      className={
                        tied
                          ? 'auction-result tied'
                          : 'auction-result'
                      }
                    >
                      <span>
                        {
                          players[
                            bid.playerIndex
                          ]?.name
                        }
                      </span>

                      <strong>
                        +{bid.bid}
                        枚
                      </strong>

                      {tied && (
                        <small>
                          同額のため回答権なし
                        </small>
                      )}
                    </div>
                  );
                })}
            </div>

            <button
              className="start-button"
              onClick={
                revealAuctionResults
              }
            >
              回答順を確定する
            </button>
          </div>
        </main>
      );
    }

    if (
      auctionPhase ===
      'handoff'
    ) {
      const player =
        auctionOrder[
          auctionTurnIndex
        ];

      if (!player) {
        return null;
      }

      return renderHandoff({
        playerIndex:
          player.playerIndex,
        title:
          '端末を渡してください',
        description:
          `このプレイヤーは「+${player.bid}枚」で挑戦します。`,
        buttonText:
          '回答する',
        onStart:
          beginAuctionAnswer,
      });
    }

    if (
      auctionPhase ===
      'answer'
    ) {
      const player =
        auctionOrder[
          auctionTurnIndex
        ];

      return (
        <main className="page">
          <div className="game-container">
            <div className="game-top">
              <button
                className="small-button"
                onClick={
                  resetAll
                }
              >
                設定に戻る
              </button>

              <div>
                {round} / {maxRounds}問
              </div>
            </div>

            <div className="battle-scoreboard">
              {players.map(
                (item) => (
                  <div
                    key={
                      item.id
                    }
                    className="player-score"
                  >
                    <span>
                      {item.name}
                    </span>

                    <strong>
                      {item.score}
                    </strong>
                  </div>
                )
              )}
            </div>

            <div className="auction-status">
              <div className="auction-round">
                第
                {
                  auctionRoundNumber
                }
                回オークション
              </div>

              <div className="auction-turn">
                {
                  players[
                    player?.playerIndex
                  ]?.name
                }
                の回答
              </div>

              <div className="revealed-count">
                現在公開：
                <strong>
                  {
                    getRevealedCount(
                      revealedChars
                    )
                  }
                </strong>
                文字
              </div>
            </div>

            <div className="description-card auction-description">
              <div className="description-title">
                説明文
              </div>

              <div className="description-text">
                {displayDescription()}
              </div>
            </div>

            <div className="reveal-controls">
              <div className="auction-reveal-progress">
                今回の追加公開：
                {auctionRevealCount}枚
                <br />
                {player.bid}枚まで
              </div>

              {selectedIndexes.length >
                0 &&
                auctionRevealCount <
                  player.bid && (
                  <button
                    className="reveal-button"
                    onClick={() => {
                      if (
                        selectedIndexes.length !==
                        1
                      ) {
                        return;
                      }

                      const remaining =
                        player.bid -
                        auctionRevealCount;

                      if (
                        remaining <=
                        0
                      ) {
                        return;
                      }

                      stopTimer();

                      const selectedIndex =
                        selectedIndexes[0];

                      setRevealedChars(
                        (prev) =>
                          revealIndexes(
                            prev,
                            [
                              selectedIndex,
                            ]
                          )
                      );

                      const nextRevealCount =
                        auctionRevealCount +
                        1;

                      setAuctionRevealCount(
                        nextRevealCount
                      );

                      setSelectedIndexes(
                        []
                      );

                      if (
                        nextRevealCount >=
                        player.bid
                      ) {
                        setAuctionMessage(
                          `${
                            players[
                              player.playerIndex
                            ]?.name ||
                            `${player.playerIndex + 1}P`
                          }の回答時間！`
                        );

                        startAuctionAnswerTimer();
                      } else {
                        setAuctionMessage(
                          `あと${
                            player.bid -
                            nextRevealCount
                          }枚。15秒以内に次の文字をめくってください。`
                        );

                        startAuctionRevealTimer();
                      }
                    }}
                  >
                    選択した文字をめくる
                  </button>
                )}

              {auctionRevealCount >=
                player.bid && (
                <div className="select-help">
                  入札した枚数まで公開しました
                </div>
              )}
            </div>

            <div className="auction-message">
              {auctionMessage}
            </div>

            <form
              className="answer-area"
              onSubmit={(event) => {
                event.preventDefault();
                handleAuctionAnswer();
              }}
            >
              <input
                value={
                  auctionAnswer
                }
                onChange={(event) =>
                  setAuctionAnswer(
                    event.target
                      .value
                  )
                }
                placeholder="キャラクター名を入力"
                autoComplete="off"
                autoFocus
              />

              <button type="submit">
                回答する
              </button>
            </form>

            <button
              className="danger-action wide"
              onClick={() => {
                setAuctionAnswer('');

                const nextTurn =
                  auctionTurnIndex +
                  1;

                if (
                  nextTurn <
                  auctionOrder.length
                ) {
                  setAuctionTurnIndex(
                    nextTurn
                  );

                  setAuctionPhase(
                    'handoff'
                  );

                  return;
                }

                const currentRevealed =
                  getRevealedCount(
                    revealedChars
                  );

                setAuctionRoundNumber(
                  (prev) =>
                    prev + 1
                );

                setAuctionRevealCount(
                  0
                );

                setAuctionPhase(
                  'input'
                );

                setAuctionBidInputs(
                  Array.from(
                    {
                      length:
                        playerCount,
                    },
                    () => ''
                  )
                );

                setAuctionInputPlayerIndex(
                  0
                );

                setAuctionBids([]);
                setAuctionOrder([]);
                setAuctionTurnIndex(
                  0
                );

                setAuctionMessage(
                  `スキップされました。現在${currentRevealed}文字公開された状態で再オークションです。`
                );
              }}
            >
              スキップ
            </button>

            <button
              className="danger-action wide"
              onClick={() => {
                if (
                  !currentCharacter
                ) {
                  return;
                }

                setAuctionMessage(
                  `降参！正解は「${currentCharacter.name}」でした。`
                );

                setAuctionPhase(
                  'correct'
                );

                setTimeout(() => {
                  if (
                    round >=
                    maxRounds
                  ) {
                    setFinished(
                      true
                    );

                    return;
                  }

                  const nextCharacter =
                    chooseCharacter();

                  setRound(
                    (prev) =>
                      prev + 1
                  );

                  setCurrentCharacter(
                    nextCharacter
                  );

                  setRevealedChars(
                    createInitialRevealState(
                      nextCharacter.description,
                      symbolsOpen
                    )
                  );

                  setAuctionBids(
                    []
                  );

                  setAuctionOrder(
                    []
                  );

                  setAuctionTurnIndex(
                    0
                  );

                  setAuctionRoundNumber(
                    (prev) =>
                      prev + 1
                  );

                  setAuctionRevealCount(
                    0
                  );

                  setAuctionPhase(
                    'input'
                  );

                  setAuctionBidInputs(
                    Array.from(
                      {
                        length:
                          playerCount,
                      },
                      () => ''
                    )
                  );

                  setAuctionInputPlayerIndex(
                    0
                  );

                  setAuctionAnswer(
                    ''
                  );

                  setAuctionMessage(
                    ''
                  );
                }, 1400);
              }}
            >
              降参
            </button>
          </div>
        </main>
      );
    }

    if (
      auctionPhase ===
      'correct'
    ) {
      return (
        <main className="page">
          <div className="game-container">
            <div className="result correct auction-correct">
              {auctionMessage}
            </div>

            {finished && (
              <div className="finish-overlay">
                <div className="finish-card">
                  <div className="finish-label">
                    GAME SET
                  </div>

                  <h2>
                    最終結果
                  </h2>

                  <div className="battle-final">
                    {players
                      .slice()
                      .sort(
                        (a, b) =>
                          b.score -
                          a.score
                      )
                      .map(
                        (player) => (
                          <div
                            key={
                              player.id
                            }
                            className="final-player"
                          >
                            <span>
                              {
                                player.name
                              }
                            </span>

                            <strong>
                              {
                                player.score
                              }
                              点
                            </strong>
                          </div>
                        )
                      )}
                  </div>

                  <button
                    className="start-button"
                    onClick={
                      resetAll
                    }
                  >
                    もう一度遊ぶ
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      );
    }

    return null;
  }

  // ============================================================
  // ゲーム表示
  // ============================================================

  if (gameStarted) {
    if (
      gameType ===
      GAME_TYPES.SOLO
    ) {
      return (
        <>
          {renderSoloGame()}

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    if (
      gameType ===
        GAME_TYPES.BATTLE &&
      battleType ===
        BATTLE_TYPES.LETTER
    ) {
      return (
        <>
          {renderBattleLetter()}

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    if (
      gameType ===
        GAME_TYPES.BATTLE &&
      battleType ===
        BATTLE_TYPES.AUCTION
    ) {
      return (
        <>
          {renderAuctionGame()}

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    if (
      gameType ===
      GAME_TYPES.COOP
    ) {
      if (coopFinished) {
        return (
          <>
            {renderCoopFinished()}

            <style jsx global>
              {styles}
            </style>
          </>
        );
      }

      return (
        <>
          {renderCoopGame()}

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }
  }

  return (
    <>
      {renderSetup()}

      <style jsx global>
        {styles}
      </style>
    </>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background:
      radial-gradient(
        circle at top,
        #202020 0%,
        #090909 55%,
        #000 100%
      );
    color: #fff;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      "Noto Sans JP",
      sans-serif;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  .page {
    min-height: 100vh;
    padding: 30px 16px 60px;
  }

  .container,
  .game-container {
    width: min(1100px, 100%);
    margin: 0 auto;
  }

  .back-link {
    display: inline-block;
    color: #aaa;
    text-decoration: none;
    margin-bottom: 30px;
  }

  .back-link:hover {
    color: #fff;
  }

  .hero {
    text-align: center;
    margin-bottom: 35px;
  }

  .eyebrow {
    font-size: 12px;
    letter-spacing: 4px;
    color: #999;
    margin-bottom: 10px;
  }

  .hero h1 {
    font-size: clamp(30px, 6vw, 58px);
    margin: 0 0 12px;
    font-weight: 900;
  }

  .hero p {
    color: #aaa;
    margin: 0;
  }

  .setup-card {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 22px;
    padding: 25px;
    margin-bottom: 20px;
    backdrop-filter: blur(10px);
  }

  .setup-card h2 {
    margin: 0 0 20px;
  }

  .mode-grid {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 15px;
  }

  .mode-card {
    min-height: 150px;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 18px;
    background: rgba(255,255,255,0.05);
    color: white;
    padding: 25px;
    text-align: left;
    transition: 0.2s;
  }

  .mode-card:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.09);
    border-color: rgba(255,255,255,0.3);
  }

  .mode-title {
    display: block;
    font-size: 24px;
    font-weight: 900;
    margin-bottom: 10px;
  }

  .mode-description {
    display: block;
    color: #aaa;
    line-height: 1.6;
  }

  .coop-mode-card {
    grid-column: 1 / -1;
    border-color: rgba(120, 210, 255, 0.25);
    background:
      linear-gradient(
        135deg,
        rgba(60,130,180,0.12),
        rgba(255,255,255,0.04)
      );
  }

  .coop-mode-card:hover {
    border-color: rgba(140,220,255,0.6);
  }

  .setting-block {
    margin-bottom: 25px;
  }

  .setting-label {
    font-weight: 800;
    margin-bottom: 12px;
  }

  .option-grid {
    display: grid;
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .option {
    border: 1px solid #444;
    background: #111;
    color: #ccc;
    border-radius: 12px;
    padding: 14px 10px;
  }

  .option.active {
    background: #fff;
    color: #000;
    border-color: #fff;
    font-weight: 800;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 15px;
    margin: 18px 0;
    flex-wrap: wrap;
  }

  .setting-row label {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 700;
  }

  .setting-row select {
    margin-left: 10px;
    background: #111;
    color: white;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 8px 12px;
  }

  .setting-help {
    color: #888;
    font-size: 13px;
  }

  .player-name-settings {
    margin: 25px 0;
  }

  .player-name-grid {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .player-name-input {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 12px;
  }

  .player-name-input span {
    min-width: 35px;
    font-weight: 900;
  }

  .player-name-input input {
    flex: 1;
    min-width: 0;
    background: #000;
    color: #fff;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 9px 10px;
    outline: none;
  }

  .player-name-input input:focus {
    border-color: #fff;
  }

  .battle-rule-note,
  .coop-rule-note {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 20px;
    padding: 15px;
    border-radius: 12px;
    background: rgba(255,255,255,0.05);
    color: #999;
    line-height: 1.6;
  }

  .battle-rule-note strong,
  .coop-rule-note strong {
    color: #fff;
  }

  .coop-rule-note {
    border-color: rgba(100,190,255,0.15);
    border: 1px solid rgba(100,190,255,0.15);
  }

  .start-button {
    width: 100%;
    border: 0;
    border-radius: 14px;
    background: #fff;
    color: #000;
    padding: 16px;
    font-size: 18px;
    font-weight: 900;
    margin-top: 15px;
  }

  .start-button:hover {
    background: #ddd;
  }

  .start-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .loading,
  .error,
  .data-count {
    text-align: center;
    padding: 15px;
    color: #aaa;
  }

  .error {
    color: #ff7777;
  }

  .game-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
    color: #aaa;
  }

  .small-button {
    background: transparent;
    border: 1px solid #444;
    color: #bbb;
    padding: 8px 12px;
    border-radius: 8px;
  }

  .score-display {
    font-weight: 900;
    color: white;
  }

  .best-score {
    margin-left: 12px;
    color: #777;
    font-size: 12px;
  }

  .timer {
    width: fit-content;
    margin: 0 auto 20px;
    padding: 10px 22px;
    border-radius: 999px;
    background: #111;
    border: 1px solid #444;
    font-size: 18px;
    font-weight: 800;
  }

  .timer strong {
    font-size: 28px;
    margin: 0 5px;
  }

  .timer.danger {
    border-color: #ff5555;
    color: #ff7777;
    animation: timer-pulse 0.8s infinite;
  }

  @keyframes timer-pulse {
    50% {
      transform: scale(1.03);
    }
  }

  .description-card {
    background: #111;
    border: 1px solid #333;
    border-radius: 22px;
    padding: 30px;
    min-height: 300px;
  }

  .description-title {
    text-align: center;
    color: #888;
    font-size: 14px;
    letter-spacing: 2px;
    margin-bottom: 30px;
  }

  .description-text {
    font-size: clamp(20px, 3vw, 32px);
    line-height: 2.5;
    letter-spacing: 2px;
    text-align: left;
    word-break: break-all;
  }

  .revealed-char {
    color: #fff;
  }

  .hidden-char {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.15em;
    height: 1.65em;
    padding: 0;
    margin: 0 3px;
    vertical-align: middle;

    background:
      linear-gradient(
        135deg,
        #fff7b8 0%,
        #fff1a3 100%
      );

    color: #6c5d1b;
    border: 1px solid #d8c66c;
    border-radius: 2px;

    box-shadow:
      1px 2px 4px rgba(0,0,0,0.35);

    font-size: 0.52em;
    font-weight: 900;

    transform: rotate(-1deg);

    transition:
      transform 0.15s,
      box-shadow 0.15s,
      background 0.15s,
      color 0.15s;
  }

  .hidden-char:nth-child(3n) {
    transform: rotate(1deg);
  }

  .hidden-char:nth-child(4n) {
    transform: rotate(-0.5deg);
  }

  .hidden-char:hover {
    transform:
      translateY(-2px)
      rotate(0deg);

    box-shadow:
      2px 4px 8px rgba(0,0,0,0.45);
  }

  .hidden-char.selected {
    background:
      linear-gradient(
        135deg,
        #ff5d5d 0%,
        #ff2222 100%
      );

    color: #fff;
    border-color: #ff7777;

    box-shadow:
      0 0 8px #ff3333,
      0 0 18px rgba(255,0,0,0.75),
      0 3px 8px rgba(0,0,0,0.5);

    transform:
      translateY(-3px)
      rotate(0deg);

    animation:
      selected-pulse 0.9s infinite alternate;
  }

  @keyframes selected-pulse {
    from {
      box-shadow:
        0 0 7px #ff3333,
        0 0 14px rgba(255,0,0,0.55);
    }

    to {
      box-shadow:
        0 0 11px #ff3333,
        0 0 25px rgba(255,0,0,0.9);
    }
  }

  .counter {
    text-align: center;
    margin: 18px 0;
    color: #aaa;
  }

  .counter strong {
    color: white;
  }

  .reveal-controls {
    text-align: center;
    margin: 20px 0;
  }

  .reveal-button {
    border: 0;
    background: #fff;
    color: #000;
    border-radius: 12px;
    padding: 14px 30px;
    font-weight: 900;
  }

  .reveal-button:disabled {
    opacity: 0.3;
  }

  .select-help {
    margin-top: 10px;
    color: #888;
    font-size: 13px;
  }

  .game-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin: 20px auto;
  }

  .secondary-action,
  .danger-action {
    border-radius: 10px;
    padding: 11px 22px;
    font-weight: 900;
  }

  .secondary-action {
    background: #222;
    color: #fff;
    border: 1px solid #555;
  }

  .danger-action {
    background: #3a1111;
    color: #ff9999;
    border: 1px solid #772222;
  }

  .danger-action.wide {
    display: block;
    width: min(700px, 100%);
    margin: 10px auto;
  }

  .answer-area {
    display: flex;
    gap: 10px;
    max-width: 700px;
    margin: 25px auto;
  }

  .answer-area input {
    flex: 1;
    min-width: 0;
    background: #111;
    color: white;
    border: 1px solid #555;
    border-radius: 12px;
    padding: 15px;
    outline: none;
  }

  .answer-area input:focus {
    border-color: #fff;
  }

  .answer-area button {
    background: white;
    color: black;
    border: 0;
    border-radius: 12px;
    padding: 0 25px;
    font-weight: 900;
  }

  .answer-area button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .result {
    text-align: center;
    margin: 20px auto;
    padding: 15px;
    border-radius: 12px;
    background: rgba(255,255,255,0.08);
  }

  .result.correct {
    background: rgba(255,255,255,0.14);
    font-size: 20px;
    font-weight: 900;
  }

  .result.wrong {
    color: #ff7777;
  }

  .battle-scoreboard {
    display: grid;
    grid-template-columns:
      repeat(auto-fit, minmax(130px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }

  .player-score {
    border: 1px solid #333;
    border-radius: 12px;
    padding: 13px;
    background: #111;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .player-score.active {
    border-color: #fff;
    background: #1c1c1c;
  }

  .player-score strong {
    font-size: 22px;
  }

  .turn-display {
    text-align: center;
    font-size: 22px;
    font-weight: 900;
    margin: 20px 0;
  }

  .handoff-container {
    min-height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .handoff-card {
    width: min(650px, 100%);
    background: #151515;
    border: 1px solid #444;
    border-radius: 25px;
    padding: 45px 30px;
    text-align: center;
    box-shadow:
      0 20px 60px rgba(0,0,0,0.5);
  }

  .handoff-label {
    color: #888;
    font-size: 12px;
    letter-spacing: 5px;
    margin-bottom: 15px;
  }

  .handoff-round {
    color: #777;
    margin-bottom: 25px;
  }

  .handoff-card h1 {
    font-size: 28px;
    margin: 0 0 20px;
  }

  .handoff-player {
    font-size: 54px;
    font-weight: 900;
    margin: 20px 0;
  }

  .handoff-card p {
    color: #999;
    line-height: 1.8;
  }

  .handoff-button {
    margin-top: 30px;
  }

  /* =========================================================
     協力モード
     ========================================================= */

  .coop-turn-top {
    font-weight: 900;
    color: #ddd;
  }

  .coop-player-bar {
    display: grid;
    grid-template-columns:
      repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin-bottom: 20px;
  }

  .coop-player {
    padding: 12px;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .coop-player span {
    font-weight: 900;
  }

  .coop-player small {
    color: #666;
  }

  .coop-player.active {
    border-color: #fff;
    background: #1b1b1b;
  }

  .coop-player.active small {
    color: #fff;
  }

  .coop-player.completed {
    opacity: 0.55;
  }

  .coop-turn-title {
    text-align: center;
    font-size: 28px;
    font-weight: 900;
    margin: 20px 0;
  }

  .coop-warning {
    width: min(800px, 100%);
    margin: 0 auto 20px;
    padding: 15px 20px;
    border-radius: 14px;
    background:
      rgba(70,140,190,0.12);
    border: 1px solid
      rgba(100,190,240,0.2);
    text-align: center;
  }

  .coop-warning strong {
    display: block;
    color: #fff;
    margin-bottom: 5px;
  }

  .coop-warning span {
    color: #999;
    font-size: 13px;
  }

  .coop-description-card {
    border-color:
      rgba(100,190,240,0.18);
  }

  .coop-own-char {
    text-shadow:
      0 0 8px rgba(120,210,255,0.45);
  }

  .coop-blocked-char {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5em;
    height: 1.5em;
    margin: 0 4px;
    color: #777;
    font-size: 0.8em;
    font-weight: 900;
    vertical-align: middle;
    border: 2px solid #555;
    border-radius: 50%;
    background: #151515;
  }

  .coop-counter {
    display: flex;
    justify-content: center;
    gap: 30px;
    flex-wrap: wrap;
    margin: 18px 0;
    color: #999;
  }

  .coop-counter strong {
    color: #fff;
    font-size: 20px;
    margin: 0 4px;
  }

  .coop-answer-note {
    width: min(700px, 100%);
    margin: 20px auto;
    text-align: center;
    padding: 14px;
    background: rgba(255,255,255,0.04);
    border-radius: 12px;
    color: #888;
  }

  .coop-answer-note strong {
    display: block;
    color: #ddd;
    margin-bottom: 5px;
  }

  .coop-answer-note span {
    font-size: 13px;
  }

  .coop-result-container {
    padding-bottom: 40px;
  }

  .coop-result-header {
    text-align: center;
    margin: 20px auto 35px;
  }

  .coop-result-header h1 {
    margin: 10px 0;
    font-size: clamp(32px, 6vw, 56px);
    font-weight: 900;
  }

  .coop-result-header p {
    color: #aaa;
  }

  .coop-all-correct {
    text-shadow:
      0 0 25px rgba(255,255,255,0.3);
  }

  .coop-correct-names {
    font-size: 20px;
  }

  .coop-correct-names strong {
    color: #fff;
  }

  .coop-answer-correct {
    margin-top: 20px;
    padding: 15px;
    border-radius: 12px;
    background: #111;
    border: 1px solid #333;
    color: #999;
  }

  .coop-answer-correct strong {
    color: #fff;
    font-size: 20px;
    margin-left: 6px;
  }

  .coop-result-list {
    display: grid;
    gap: 25px;
  }

  .coop-result-card {
    background: #111;
    border: 1px solid #333;
    border-radius: 20px;
    padding: 22px;
  }

  .coop-result-card.correct {
    border-color:
      rgba(150,220,170,0.45);
  }

  .coop-result-card.wrong {
    border-color:
      rgba(255,100,100,0.3);
  }

  .coop-result-player {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
  }

  .coop-result-player > div {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .coop-result-player-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #222;
    color: #aaa;
    font-size: 13px;
    font-weight: 900;
  }

  .coop-result-player strong {
    font-size: 24px;
  }

  .coop-result-status {
    padding: 7px 13px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 900;
  }

  .coop-result-status.correct {
    color: #fff;
    background: #1f422a;
    border: 1px solid #386d47;
  }

  .coop-result-status.wrong {
    color: #ff9999;
    background: #3a1111;
    border: 1px solid #772222;
  }

  .coop-result-answer {
    padding: 13px 15px;
    border-radius: 10px;
    background: #181818;
    color: #888;
    margin-bottom: 20px;
  }

  .coop-result-answer strong {
    color: #fff;
    margin-left: 4px;
  }

  .coop-result-board-title {
    color: #888;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .coop-result-board {
    background: #080808;
    border: 1px solid #292929;
    border-radius: 15px;
    padding: 20px;
    overflow-x: auto;
  }

  .coop-result-board .description-text {
    font-size: clamp(17px, 2.5vw, 27px);
    line-height: 2.2;
  }

  .coop-result-hidden {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.15em;
    height: 1.65em;
    padding: 0;
    margin: 0 3px;
    vertical-align: middle;

    background: #302e1c;
    color: #77734a;
    border: 1px solid #4b482b;
    border-radius: 2px;

    font-size: 0.52em;
    font-weight: 900;
  }

  .coop-result-correct-answer {
    text-align: center;
    margin: 30px auto 10px;
    padding: 18px;
    border-radius: 14px;
    background: #111;
    border: 1px solid #333;
    color: #888;
  }

  .coop-result-correct-answer strong {
    color: #fff;
    font-size: 22px;
    margin-left: 5px;
  }

  /*
   * オークション
   */

  .auction-status {
    text-align: center;
    margin: 25px 0;
  }

  .auction-round {
    color: #888;
    font-size: 14px;
    margin-bottom: 10px;
  }

  .total-count {
    font-size: 24px;
    font-weight: 800;
    margin-bottom: 15px;
  }

  .total-count strong {
    font-size: 44px;
    margin: 0 5px;
  }

  .revealed-count {
    color: #aaa;
    line-height: 1.8;
  }

  .revealed-count strong {
    color: white;
    font-size: 20px;
  }

  .auction-description {
    margin-top: 20px;
  }

  .auction-bid-description {
    margin-bottom: 25px;
  }

  .auction-bid-description .description-text {
    text-align: left;
  }

  .auction-input-area,
  .auction-answer-area {
    text-align: center;
    max-width: 800px;
    margin: 30px auto;
  }

  .auction-input-area h2 {
    margin-bottom: 8px;
  }

  .auction-input-area p {
    color: #888;
  }

  .auction-turn {
    font-size: 28px;
    font-weight: 900;
    margin-bottom: 10px;
    text-align: center;
  }

  .auction-message {
    color: #aaa;
    margin: 15px auto;
    text-align: center;
  }

  .auction-private-card {
    width: min(600px, 100%);
    margin: 30px auto;
    padding: 35px 25px;
    border-radius: 22px;
    background: #111;
    border: 1px solid #333;
    text-align: center;
  }

  .private-label {
    color: #888;
    font-size: 13px;
    letter-spacing: 3px;
    margin-bottom: 15px;
  }

  .private-player {
    font-size: 42px;
    font-weight: 900;
    margin-bottom: 20px;
  }

  .auction-private-card p {
    color: #888;
    line-height: 1.7;
  }

  .private-rule {
    margin: 25px 0;
    padding: 15px;
    background: #181818;
    border-radius: 12px;
    color: #aaa;
    line-height: 1.8;
  }

  .private-rule strong {
    color: #fff;
    font-size: 22px;
    margin: 0 4px;
  }

  .private-input-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin: 25px 0;
  }

  .private-input-row input {
    width: 140px;
    text-align: center;
    background: #000;
    color: white;
    border: 1px solid #555;
    border-radius: 10px;
    padding: 14px;
    font-size: 26px;
    font-weight: 900;
  }

  .private-input-row span {
    color: #aaa;
    font-weight: 800;
  }

  .auction-reveal-title {
    font-size: 36px;
    margin: 10px 0;
  }

  .auction-results {
    width: min(700px, 100%);
    margin: 25px auto;
    display: grid;
    gap: 10px;
  }

  .auction-result {
    display: grid;
    grid-template-columns:
      1fr auto;
    align-items: center;
    gap: 15px;
    padding: 17px 20px;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
  }

  .auction-result span {
    font-weight: 900;
  }

  .auction-result strong {
    font-size: 22px;
  }

  .auction-result small {
    grid-column: 1 / -1;
    color: #ff7777;
  }

  .auction-result.tied {
    border-color: #772222;
    background: #211010;
  }

  .auction-correct {
    width: min(800px, 100%);
    margin: 20vh auto;
  }

  .battle-final {
    display: grid;
    gap: 10px;
    margin: 25px 0;
  }

  .final-player {
    display: flex;
    justify-content: space-between;
    padding: 15px 20px;
    border: 1px solid #333;
    border-radius: 10px;
    background: #111;
  }

  .final-player strong {
    font-size: 22px;
  }

  .finish-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 100;
  }

  .finish-card {
    width: min(600px, 100%);
    background: #151515;
    border: 1px solid #444;
    border-radius: 24px;
    padding: 35px;
    text-align: center;
  }

  .finish-label {
    color: #888;
    letter-spacing: 5px;
    font-size: 13px;
    margin-bottom: 15px;
  }

  .finish-card h2 {
    margin: 0;
  }

  .final-score {
    font-size: 80px;
    font-weight: 900;
    line-height: 1.2;
    margin: 15px 0 25px;
  }

  .final-best-score {
    color: #999;
    margin-bottom: 10px;
  }

  @media (max-width: 700px) {
    .page {
      padding: 18px 10px 40px;
    }

    .mode-grid,
    .option-grid {
      grid-template-columns: 1fr;
    }

    .coop-mode-card {
      grid-column: auto;
    }

    .player-name-grid {
      grid-template-columns: 1fr;
    }

    .description-card {
      padding: 20px 15px;
    }

    .description-text {
      font-size: 19px;
      line-height: 2;
      letter-spacing: 1px;
    }

    .answer-area {
      flex-direction: column;
    }

    .answer-area button {
      padding: 14px;
    }

    .game-top {
      font-size: 13px;
    }

    .handoff-card {
      padding: 35px 20px;
    }

    .handoff-player {
      font-size: 44px;
    }

    .private-input-row input {
      width: 110px;
    }

    .auction-reveal-title {
      font-size: 28px;
    }

    .game-actions {
      flex-wrap: wrap;
    }

    .secondary-action,
    .danger-action {
      flex: 1;
    }

    .coop-player-bar {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .coop-turn-title {
      font-size: 23px;
    }

    .coop-counter {
      gap: 10px;
      flex-direction: column;
      text-align: center;
    }

    .coop-result-card {
      padding: 15px;
    }

    .coop-result-player strong {
      font-size: 20px;
    }

    .coop-result-player-label {
      width: 36px;
      height: 36px;
    }

    .coop-result-board {
      padding: 12px;
    }

    .coop-result-board .description-text {
      font-size: 17px;
    }
  }
`;