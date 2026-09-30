// file: app/solo/punkrecords/page.js

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const MAX_PLAYERS = 7;

const CIVILIAN_ROLES = [
  {
    id: 'sei',
    name: '正',
    character: '正(シャカ)',
    description: '猫',
  },
  {
    id: 'aku',
    name: '悪',
    character: '悪(リリス)',
    description: '猫',
  },
  {
    id: 'sou',
    name: '想',
    character: '想(エジソン)',
    description: '猫',
  },
  {
    id: 'chi',
    name: '知',
    character: '知(ピタゴラス)',
    description: '猫',
  },
  {
    id: 'bou',
    name: '暴',
    character: '暴(アトラス)',
    description: '猫',
  },
];

const YORK_ROLE = {
  id: 'york',
  name: '欲',
  character: '欲(ヨーク)',
  description: '裏切者',
};

const STELLA_ROLE = {
  id: 'stella',
  name: 'ステラ',
  character: 'ベガパンク',
  description: '回答者',
};

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(
      /[〜～~ー‐-‒–—―−]/g,
      'ー'
    )
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
    ...raw.matchAll(
      /(?:（([^（）]*)）|\(([^()]*)\))/g
    ),
  ];

  if (bracketMatches.length > 0) {
    const outside = raw
      .replace(/（[^（）]*）/g, '')
      .replace(/\([^()]*\)/g, '');

    candidates.add(outside);

    bracketMatches.forEach((match) => {
      candidates.add(
        match[1] ??
        match[2] ??
        ''
      );
    });
  }

  return [...candidates]
    .map(normalizeAnswer)
    .filter(Boolean);
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

  return getAnswerCandidates(
    characterName
  ).includes(normalizedAnswer);
}

function isOpenSymbol(char) {
  if (!char) {
    return true;
  }

  return /[\s「」『』（）()［］【】〈〉《》〔〕、。・，．！？!?：:；;／/\\＼〜～—−―…‥“”"']/u.test(
    char
  );
}

function splitDescription(description) {
  return Array.from(
    String(description ?? '')
  );
}

export default function PunkRecordsPage() {
  const [characters, setCharacters] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState('');

  // -------------------------
  // 設定
  // -------------------------

  const [playerCount, setPlayerCount] =
    useState(4);

  const [playerNames, setPlayerNames] =
    useState([
      '1P',
      '2P',
      '3P',
      '4P',
      '5P',
      '6P',
      '7P',
    ]);

  const [stellaMode, setStellaMode] =
    useState('random');

  const [manualStellaIndex, setManualStellaIndex] =
    useState(0);

  const [yorkCount, setYorkCount] =
    useState(1);

  const [yorkStealthCount, setYorkStealthCount] =
    useState(1);

  const [symbolsOpen, setSymbolsOpen] =
    useState(true);

  const [discussionTime, setDiscussionTime] =
    useState(120);

  // -------------------------
  // ゲーム
  // -------------------------

  const [gameStarted, setGameStarted] =
    useState(false);

  const [phase, setPhase] =
    useState('setup');

  const [currentCharacter, setCurrentCharacter] =
    useState(null);

  const [players, setPlayers] =
    useState([]);

  const [stellaIndex, setStellaIndex] =
    useState(null);

  const [inputPlayerIndexes, setInputPlayerIndexes] =
    useState([]);

  const [currentInputTurn, setCurrentInputTurn] =
    useState(0);

  const [currentPlayerRole, setCurrentPlayerRole] =
    useState(null);

  const [inputValues, setInputValues] =
    useState({});

  // ヨークのステルス入力
  const [yorkStealthValues, setYorkStealthValues] =
    useState({});

  // ヨークが使用した特殊入力回数
  const [yorkStealthUsed, setYorkStealthUsed] =
    useState(0);

  // ステルスモード中か
  const [stealthMode, setStealthMode] =
    useState(false);

  // ステルス入力する文字
  const [stealthCharacter, setStealthCharacter] =
    useState('');

  // 現在のステルス使用で選択した場所
  // 1回の使用につき必ず1か所だけ
  const [stealthTargetIndex, setStealthTargetIndex] =
    useState(null);

  // 最後に使用したステルスの場所
  // 「ステルスをやり直す」でここを取り消す
  const [lastStealthTargetIndex, setLastStealthTargetIndex] =
    useState(null);

  const [answer, setAnswer] =
    useState('');

  const [answerResult, setAnswerResult] =
    useState(null);

  const [selectedYorkIndexes, setSelectedYorkIndexes] =
    useState([]);

  const [discussionRemaining, setDiscussionRemaining] =
    useState(0);

  const [discussionFinished, setDiscussionFinished] =
    useState(false);

  const [winner, setWinner] =
    useState(null);

  const [message, setMessage] =
    useState('');

  // -------------------------
  // データ取得
  // -------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response =
          await fetch(
            '/api/extra-character'
          );

        if (!response.ok) {
          throw new Error(
            'キャラクターデータの取得に失敗しました。'
          );
        }

        const data =
          await response.json();

        if (!cancelled) {
          setCharacters(
            data.characters || []
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error.message ||
            '読み込みに失敗しました。'
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

  // -------------------------
  // 説明文の文字
  // -------------------------

  const descriptionChars = useMemo(() => {
    if (!currentCharacter) {
      return [];
    }

    return splitDescription(
      currentCharacter.description
    );
  }, [currentCharacter]);

  // -------------------------
  // 設定変更
  // -------------------------

  function changePlayerCount(value) {
    const next =
      Math.min(
        MAX_PLAYERS,
        Math.max(2, Number(value))
      );

    setPlayerCount(next);

    setYorkCount((prev) =>
      Math.min(
        prev,
        Math.max(0, next - 1)
      )
    );

    if (
      manualStellaIndex >= next
    ) {
      setManualStellaIndex(0);
    }
  }

  function updatePlayerName(
    index,
    value
  ) {
    setPlayerNames((prev) => {
      const next = [...prev];

      next[index] = value;

      return next;
    });
  }

  // -------------------------
  // キャラクター選択
  // -------------------------

  function chooseCharacter() {
    if (
      characters.length === 0
    ) {
      return null;
    }

    return characters[
      Math.floor(
        Math.random() *
          characters.length
      )
    ];
  }

  // -------------------------
  // 役職作成
  // -------------------------

  function createRoles(
    totalPlayers,
    selectedStellaIndex,
    selectedYorkCount
  ) {
    const roles = Array.from(
      { length: totalPlayers },
      () => null
    );

    roles[selectedStellaIndex] =
      STELLA_ROLE;

    const others = Array.from(
      { length: totalPlayers },
      (_, index) => index
    ).filter(
      (index) =>
        index !== selectedStellaIndex
    );

    const shuffledOthers =
      shuffle(others);

    const actualYorkCount =
      Math.min(
        selectedYorkCount,
        shuffledOthers.length
      );

    const yorkIndexes =
      shuffledOthers.slice(
        0,
        actualYorkCount
      );

    yorkIndexes.forEach(
      (index) => {
        roles[index] =
          YORK_ROLE;
      }
    );

    const civilianIndexes =
      shuffledOthers.filter(
        (index) =>
          !yorkIndexes.includes(index)
      );

    civilianIndexes.forEach(
      (index) => {
        const role =
          CIVILIAN_ROLES[
            Math.floor(
              Math.random() *
                CIVILIAN_ROLES.length
            )
          ];

        roles[index] = role;
      }
    );

    return roles;
  }

  // -------------------------
  // ゲーム開始
  // -------------------------

  function startGame() {
    const character =
      chooseCharacter();

    if (!character) {
      return;
    }

    let selectedStellaIndex;

    if (
      stellaMode === 'manual'
    ) {
      selectedStellaIndex =
        Math.min(
          manualStellaIndex,
          playerCount - 1
        );
    } else {
      selectedStellaIndex =
        Math.floor(
          Math.random() *
            playerCount
        );
    }

    const roles =
      createRoles(
        playerCount,
        selectedStellaIndex,
        yorkCount
      );

    const inputIndexes =
      Array.from(
        { length: playerCount },
        (_, index) => index
      ).filter(
        (index) =>
          index !== selectedStellaIndex
      );

    const newPlayers =
      Array.from(
        { length: playerCount },
        (_, index) => ({
          id: index,
          name:
            playerNames[index]?.trim() ||
            `${index + 1}P`,
          role: roles[index],
        })
      );

    const initialInputValues = {};

    splitDescription(
      character.description
    ).forEach(
      (_, index) => {
        initialInputValues[index] =
          '';
      }
    );

    setCurrentCharacter(
      character
    );

    setPlayers(
      newPlayers
    );

    setStellaIndex(
      selectedStellaIndex
    );

    setInputPlayerIndexes(
      inputIndexes
    );

    setCurrentInputTurn(0);

    setInputValues(
      initialInputValues
    );

    setYorkStealthValues({});
    setYorkStealthUsed(0);
    setStealthMode(false);
    setStealthCharacter('');
    setStealthTargetIndex(null);
    setLastStealthTargetIndex(null);

    setAnswer('');

    setAnswerResult(null);

    setSelectedYorkIndexes([]);

    setDiscussionRemaining(
      discussionTime
    );

    setDiscussionFinished(false);

    setWinner(null);

    setMessage('');

    setCurrentPlayerRole(null);

    setGameStarted(true);

    setPhase('stella-intro');
  }

  // -------------------------
  // ステラ確認
  // -------------------------

  function continueFromStellaIntro() {
    if (
      inputPlayerIndexes.length ===
      0
    ) {
      setPhase('answer');
      return;
    }

    setCurrentInputTurn(0);

    setPhase('handoff');
  }

  // -------------------------
  // 現在の入力担当者
  // -------------------------

  const currentInputPlayerIndex =
    inputPlayerIndexes[
      currentInputTurn
    ];

  const currentInputPlayer =
    players[
      currentInputPlayerIndex
    ];

  // -------------------------
  // 入力担当者の役職表示
  // -------------------------

  function showCurrentPlayerRole() {
    if (
      !currentInputPlayer
    ) {
      return;
    }

    setCurrentPlayerRole(
      currentInputPlayer.role
    );

    setPhase('input');
  }

  // -------------------------
  // 自分が担当する文字
  //
  // ①②③①②③...
  // -------------------------

 function getInputCharacterIndexes() {
  return descriptionChars
    .map((char, index) => ({
      char,
      index,
    }))
    .filter(
      ({ char }) =>
        !isOpenSymbol(char)
    )
    .map(
      ({ index }) => index
    );
}

function getOwnerNumber(
  charIndex
) {
  if (
    inputPlayerIndexes.length ===
    0
  ) {
    return null;
  }

  const inputIndexes =
    getInputCharacterIndexes();

  const position =
    inputIndexes.indexOf(
      charIndex
    );

  // 記号の場合は担当者なし
  if (position === -1) {
    return null;
  }

  return (
    position %
      inputPlayerIndexes.length
  ) + 1;
}

function isCurrentPlayersSlot(
  charIndex
) {
  if (
    !currentInputPlayer
  ) {
    return false;
  }

  const ownerNumber =
    getOwnerNumber(charIndex);

  if (!ownerNumber) {
    return false;
  }

  return (
    inputPlayerIndexes[
      ownerNumber - 1
    ] ===
    currentInputPlayerIndex
  );
}

  function isCurrentPlayerYork() {
    return (
      currentInputPlayer?.role?.id ===
      'york'
    );
  }

  // -------------------------
  // 文字入力
  // -------------------------

  function handleCharacterInput(
  charIndex,
  value
) {
  if (
    !isCurrentPlayersSlot(
      charIndex
    )
  ) {
    return;
  }

  setInputValues((prev) => ({
    ...prev,
    [charIndex]:
      String(value ?? ''),
  }));
}

  function handleStealthInput(
    charIndex,
    value
  ) {
    if (!isCurrentPlayerYork()) {
      return;
    }

    if (!stealthMode) {
      return;
    }

    // 自分の担当マスにはステルスを使えない
    if (isCurrentPlayersSlot(charIndex)) {
      return;
    }

    // すでに別の場所を選択している場合、
    // その場所以外は操作できない
    if (
      stealthTargetIndex !== null &&
      stealthTargetIndex !== charIndex
    ) {
      return;
    }

    const nextValue =
      String(value ?? '');

    // --------------------------------
    // 入力を完全に消した場合
    // → ステルス使用を取り消す
    // --------------------------------
    if (!nextValue.trim()) {
      setYorkStealthValues((prev) => {
        const next = {
          ...prev,
        };

        delete next[charIndex];

        return next;
      });

      if (
        stealthTargetIndex === charIndex
      ) {
        setYorkStealthUsed((used) =>
          Math.max(
            0,
            used - 1
          )
        );

        setStealthTargetIndex(null);
        setLastStealthTargetIndex(null);
      }

      return;
    }

    // --------------------------------
    // まだ場所を選んでいない
    // → 今入力した場所を1か所だけ選択
    // --------------------------------
    if (
      stealthTargetIndex === null
    ) {
      setStealthTargetIndex(
        charIndex
      );

      setLastStealthTargetIndex(
        charIndex
      );

      setYorkStealthUsed((used) =>
        Math.min(
          yorkStealthCount,
          used + 1
        )
      );
    }

    // --------------------------------
    // 入力内容は1文字に制限しない
    // 「恐竜」など自由に入力・編集できる
    // 実際の表示では先頭1文字だけ使用する
    // --------------------------------
    setYorkStealthValues((prev) => ({
      ...prev,
      [charIndex]: nextValue,
    }));
  }
  // -------------------------
  // 自分の入力完了
  // -------------------------

function finishCurrentInput() {
  if (!currentInputPlayer) {
    return;
  }

const myIndexes =
  descriptionChars
    .map((char, index) => ({
      char,
      index,
    }))
    .filter(
      ({ char, index }) =>
        !isOpenSymbol(char) &&
        isCurrentPlayersSlot(index)
    )
    .map(
      ({ index }) => index
    );

  const missing =
    myIndexes.some(
      (index) =>
        !String(
          inputValues[index] ?? ''
        ).trim()
    );

  if (missing) {
    setMessage(
      '担当している文字をすべて入力してください。'
    );

    return;
  }

  setMessage('');

  const nextTurn =
    currentInputTurn + 1;

  if (
    nextTurn >=
    inputPlayerIndexes.length
  ) {
    setCurrentPlayerRole(null);

    setPhase('answer');

    return;
  }

  setCurrentInputTurn(
    nextTurn
  );

  setCurrentPlayerRole(null);

  setPhase('handoff');
}

  // -------------------------
  // 回答画面
  // -------------------------

  function submitAnswer() {
    if (
      !currentCharacter
    ) {
      return;
    }

    const correct =
      isAnswerCorrect(
        answer,
        currentCharacter.name
      );

    setAnswerResult(
      correct
    );

    if (correct) {
      setWinner('stella');

      setMessage(
        `正解！「${currentCharacter.name}」でした。`
      );

      setPhase('result');

      return;
    }

    setMessage(
      `不正解！正解は「${currentCharacter.name}」です。`
    );

    if (yorkCount === 0) {
      setWinner('stella');

      setPhase('result');

      return;
    }

    setDiscussionRemaining(
      discussionTime
    );

    setDiscussionFinished(false);

    setSelectedYorkIndexes([]);

    setPhase('discussion');
  }

  // -------------------------
  // 議論タイマー
  // -------------------------

  useEffect(() => {
    if (
      phase !== 'discussion'
    ) {
      return;
    }

    if (
      discussionFinished
    ) {
      return;
    }

    if (
      discussionRemaining <= 0
    ) {
      setDiscussionFinished(
        true
      );

      return;
    }

    const timer =
      setInterval(() => {
        setDiscussionRemaining(
          (prev) => {
            if (prev <= 1) {
              clearInterval(timer);

              setDiscussionFinished(
                true
              );

              return 0;
            }

            return prev - 1;
          }
        );
      }, 1000);

    return () =>
      clearInterval(timer);
  }, [
    phase,
    discussionFinished,
    discussionRemaining,
  ]);

  // -------------------------
  // ヨーク投票
  // -------------------------

  function toggleYork(index) {
    setSelectedYorkIndexes(
      (prev) => {
        if (
          prev.includes(index)
        ) {
          return prev.filter(
            (item) =>
              item !== index
          );
        }

        if (
          prev.length >= yorkCount
        ) {
          return prev;
        }

        return [
          ...prev,
          index,
        ];
      }
    );
  }

  function submitYorkGuess() {
    if (
      selectedYorkIndexes.length !==
      yorkCount
    ) {
      setMessage(
        `欲（ヨーク）を${yorkCount}人選んでください。`
      );

      return;
    }

    const actualYorkIndexes =
      players
        .map(
          (player, index) =>
            player.role?.id ===
            'york'
              ? index
              : null
        )
        .filter(
          (index) =>
            index !== null
        );

    const guessed =
      [...selectedYorkIndexes]
        .sort(
          (a, b) => a - b
        );

    const actual =
      [...actualYorkIndexes]
        .sort(
          (a, b) => a - b
        );

    const correct =
      guessed.length ===
        actual.length &&
      guessed.every(
        (value, index) =>
          value ===
          actual[index]
      );

    if (correct) {
      setWinner('stella');

      setMessage(
        '欲（ヨーク）の正体をすべて見抜いた！'
      );
    } else {
      setWinner('york');

      setMessage(
        '欲（ヨーク）の正体を見抜けなかった……'
      );
    }

    setPhase('result');
  }

  // -------------------------
  // リセット
  // -------------------------

  function resetGame() {
    setGameStarted(false);
    setPhase('setup');

    setCurrentCharacter(null);

    setPlayers([]);

    setStellaIndex(null);

    setInputPlayerIndexes([]);

    setCurrentInputTurn(0);

    setCurrentPlayerRole(null);

    setInputValues({});

    setYorkStealthValues({});
    setYorkStealthUsed(0);
    setStealthMode(false);
    setStealthCharacter('');
    setStealthTargetIndex(null);
    setLastStealthTargetIndex(null);

    setAnswer('');

    setAnswerResult(null);

    setSelectedYorkIndexes([]);

    setDiscussionRemaining(
      discussionTime
    );

    setDiscussionFinished(false);

    setWinner(null);

    setMessage('');
  }

  // -------------------------
  // 説明文表示
  // -------------------------

  function renderDescription(
    revealAll = false,
    viewerIsYork = false
  ) {
    if (
      !currentCharacter
    ) {
      return null;
    }

    return (
      <div className="description-grid">
        {descriptionChars.map(
          (char, index) => {
            const symbol =
              isOpenSymbol(char);

            const owner =
              getOwnerNumber(index);

            const stealthValue =
              yorkStealthValues[index];

            let display =
              '？';

            if (
              symbolsOpen &&
              symbol
            ) {
              display = char;
            } else if (
              revealAll
            ) {
              // ヨークのステルス入力を最優先
 display =
  Array.from(
    stealthValue ||
    inputValues[index] ||
    ''
  )[0] || '？';
            } else if (
              viewerIsYork &&
              stealthValue
            ) {
              // ヨーク本人だけ
              // ステルス入力を確認できる
              display =
                stealthValue;
            } else if (
              isCurrentPlayersSlot(
                index
              )
            ) {
              display =
  Array.from(
    inputValues[index] || ''
  )[0] || '';
            }

            return (
              <div
                key={index}
                className={[
                  'description-cell',
                  symbol &&
                  symbolsOpen
                    ? 'symbol-cell'
                    : '',
                  revealAll
                    ? 'revealed-cell'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {revealAll &&
                  owner && (
                    <span className="owner-number">
                      {String.fromCharCode(
                        0x2460 +
                          owner -
                          1
                      )}
                    </span>
                  )}

                <span className="cell-character">
                  {display}
                </span>
              </div>
            );
          }
        )}
      </div>
    );
  }


function renderCorrectDescription() {
  if (!currentCharacter) {
    return null;
  }

  const correctChars =
    splitDescription(
      currentCharacter.description
    );

  return (
    <div className="description-grid">
      {correctChars.map(
        (char, index) => (
          <div
            key={index}
            className={[
              'description-cell',
              isOpenSymbol(char)
                ? 'symbol-cell'
                : 'revealed-cell',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="cell-character">
              {char}
            </span>
          </div>
        )
      )}
    </div>
  );
}

  // -------------------------
  // ローディング
  // -------------------------

  if (loading) {
    return (
      <>
        <main className="page">
          <div className="container">
            <Link
              href="/solo"
              className="back-link"
            >
              ← ソロゲーム一覧へ
            </Link>

            <div className="loading-card">
              キャラクターデータを読み込んでいます……
            </div>
          </div>
        </main>

        <style jsx global>
          {styles}
        </style>
      </>
    );
  }

  // -------------------------
  // エラー
  // -------------------------

  if (loadError) {
    return (
      <>
        <main className="page">
          <div className="container">
            <Link
              href="/solo"
              className="back-link"
            >
              ← ソロゲーム一覧へ
            </Link>

            <div className="error-card">
              {loadError}
            </div>
          </div>
        </main>

        <style jsx global>
          {styles}
        </style>
      </>
    );
  }

  // =====================================================
  // ゲーム中
  // =====================================================

  if (gameStarted) {
    // -------------------------
    // ステラ決定
    // -------------------------

    if (
      phase === 'stella-intro'
    ) {
      const stellaPlayer =
        players[stellaIndex];

      return (
        <>
          <main className="page">
            <div className="handoff-container">
              <div className="handoff-card">
                <div className="eyebrow">
                  PUNK RECORDS
                </div>

                <div className="role-big">
                  ベガパンク
                  <span>
                    （ステラ）
                  </span>
                </div>

                <h1>
                  {stellaPlayer?.name}
                  さんが
                  <br />
                  ベガパンク（ステラ）です。
                </h1>

                <p>
                  あなたは最後に完成した説明文から
                  <br />
                  キャラクターを回答します。
                </p>

                <button
                  className="start-button"
                  onClick={
                    continueFromStellaIntro
                  }
                >
                  確認しました
                </button>
              </div>
            </div>
          </main>

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    // -------------------------
    // 端末受け渡し
    // -------------------------

    if (
      phase === 'handoff'
    ) {
      const player =
        currentInputPlayer;

      return (
        <>
          <main className="page">
            <div className="handoff-container">
              <div className="handoff-card">
                <div className="handoff-label">
                  PASS THE DEVICE
                </div>

                <div className="handoff-round">
                  {currentInputTurn + 1}
                  {' / '}
                  {inputPlayerIndexes.length}
                </div>

                <h1>
                  端末を
                  <br />
                  {player?.name}
                  さんへ
                </h1>

                <p>
                  他の人に画面を見せずに
                  <br />
                  「このプレイヤーです」を押してください。
                </p>

                <button
                  className="start-button"
                  onClick={
                    showCurrentPlayerRole
                  }
                >
                  このプレイヤーです
                </button>
              </div>
            </div>
          </main>

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    // -------------------------
    // 文字入力
    // -------------------------

    if (
      phase === 'input'
    ) {
      const role =
        currentPlayerRole;

      return (
        <>
          <main className="page">
            <div className="game-container">
              <div className="game-top">
                <div>
                  {currentInputPlayer?.name}
                  さんの入力
                </div>

                <div className="role-mini">
                  {role?.character}
                  <span>
                    （{role?.name}）
                  </span>
                </div>
              </div>

              <section className="game-card">
                <div className="input-role-card">
                  <div className="role-label">
                    あなたの役職
                  </div>

                  <div className="role-name">
                    {role?.character}
                  </div>

                  <div className="role-description">
                    {role?.name}
                    {'：'}
                    {role?.description}
                  </div>
                </div>

                <h2>
                  説明文を完成させよう
                </h2>

                <div className="character-name">
                  キャラクター：
                  <strong>
                    {currentCharacter?.name}
                  </strong>
                </div>

                <p className="instruction">
                  あなたの担当する文字だけ
                  入力できます。
                  <br />
                  他のプレイヤーが入力した文字は
                  見えません。
                </p>

               <div className="description-grid input-grid">
  {descriptionChars.map(
    (char, index) => {
      const symbol =
        isOpenSymbol(char);

      const mine =
        isCurrentPlayersSlot(index);

      const stealthValue =
        yorkStealthValues[index];

      if (
        symbolsOpen &&
        symbol
      ) {
        return (
          <div
            key={index}
            className="description-cell symbol-cell"
          >
            {char}
          </div>
        );
      }

        // -------------------------------
      // ステルスモード中のヨーク
      // -------------------------------
      if (
        isCurrentPlayerYork() &&
        stealthMode &&
        !mine
      ) {
        const isSelectedTarget =
          stealthTargetIndex === index;

        const anotherTargetSelected =
          stealthTargetIndex !== null &&
          stealthTargetIndex !== index;

        return (
          <input
            key={index}
            className="description-input stealth-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={
              yorkStealthValues[index] || ''
            }
            placeholder="＋"
            disabled={
              anotherTargetSelected
            }
            onChange={(event) =>
              handleStealthInput(
                index,
                event.target.value
              )
            }
          />
        );
      }

     // ヨークが以前仕込んだ場所
if (
  isCurrentPlayerYork() &&
  Object.prototype.hasOwnProperty.call(
    yorkStealthValues,
    index
  )
) {
  return (
   <input
  key={index}
  className="description-input stealth-input"
  type="text"
  inputMode="text"
  autoComplete="off"
  maxLength={1}
  value={
    yorkStealthValues[index] || ''
  }
  placeholder="＋"
  onChange={(event) =>
    handleStealthInput(
      index,
      event.target.value
    )
  }
/>
  );
}

      if (!mine) {
        return (
          <div
            key={index}
            className="description-cell hidden-cell"
          >
            ？
          </div>
        );
      }

      return (
        <input
          key={index}
          className="description-input assigned-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={
            inputValues[index] || ''
          }
          
          onChange={(event) =>
            handleCharacterInput(
              index,
              event.target.value
            )
          }
        />
      );
    }
  )}
</div>
            {message && (
              <div className="warning-message">
                {message}
              </div>
            )}

            {isCurrentPlayerYork() && (
              <div className="stealth-control">
                <div className="stealth-status">
                  <strong>
                    欲（ヨーク）の特殊能力
                  </strong>

                  <span>
                    残り{' '}
                    {Math.max(
                      0,
                      yorkStealthCount -
                        yorkStealthUsed
                    )}
                    回
                  </span>
                </div>

                                <button
                  type="button"
                  className={
                    stealthMode
                      ? 'stealth-button active'
                      : 'stealth-button'
                  }
                  disabled={
                    !stealthMode &&
                    yorkStealthUsed >=
                      yorkStealthCount &&
                    lastStealthTargetIndex === null
                  }
                  onClick={() => {
                    // -------------------------
                    // ステルス中
                    // -------------------------
                    if (stealthMode) {
                      setStealthMode(false);
                      setStealthTargetIndex(null);
                      return;
                    }

                    // -------------------------
                    // 直前のステルスをやり直す
                    // -------------------------
                    if (
                      lastStealthTargetIndex !== null
                    ) {
                      const target =
                        lastStealthTargetIndex;

                      setYorkStealthValues(
                        (prev) => {
                          const next = {
                            ...prev,
                          };

                          delete next[target];

                          return next;
                        }
                      );

                      setYorkStealthUsed(
                        (used) =>
                          Math.max(
                            0,
                            used - 1
                          )
                      );

                      setStealthTargetIndex(
                        null
                      );

                      setLastStealthTargetIndex(
                        null
                      );

                      setStealthMode(true);

                      return;
                    }

                    // -------------------------
                    // 新しいステルスを開始
                    // -------------------------
                    setStealthTargetIndex(
                      null
                    );

                    setStealthMode(true);
                  }}
                >
                  {stealthMode
                    ? 'ステルスモード解除'
                    : lastStealthTargetIndex !== null
                      ? 'ステルスモードをやり直す'
                      : 'ステルスモードを使う'}
                </button>

                {stealthMode && (
                  <p className="stealth-help">
                    他のプレイヤーのマスを1つ選んで、
                    好きな文字を入力してください。
                  </p>
                )}
              </div>
            )}

            <button
              className="start-button wide"
              onClick={
                finishCurrentInput
              }
            >
              入力完了
            </button>
              </section>
            </div>
          </main>

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    // -------------------------
    // 回答
    // -------------------------

    if (
      phase === 'answer'
    ) {
      return (
        <>
          <main className="page">
            <div className="game-container">
              <section className="game-card answer-card">
                <div className="eyebrow">
                  VEGA PUNK
                </div>

                <h1>
                  {players[stellaIndex]?.name}
                  さん
                </h1>

                <div className="role-big small">
                  ベガパンク（ステラ）
                </div>

                <p>
                  完成した説明文から
                  キャラクターを当ててください。
                </p>

                <div className="answer-description">
{renderDescription(
  true,
  false
)}
                </div>

                <div className="answer-form">
                  <input
                    type="text"
                    value={answer}
                    onChange={(event) =>
                      setAnswer(
                        event.target.value
                      )
                    }
                    placeholder="キャラクター名を入力"
                    autoComplete="off"
                  />

                  <button
                    className="start-button"
                    onClick={
                      submitAnswer
                    }
                  >
                    回答する
                  </button>
                </div>
              </section>
            </div>
          </main>

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    // -------------------------
    // 議論
    // -------------------------

    if (
      phase === 'discussion'
    ) {
      return (
        <>
          <main className="page">
            <div className="game-container">
              <div className="discussion-top">
                <div>
                  <div className="eyebrow">
                    DISCUSSION
                  </div>

                  <h1>
                    欲（ヨーク）を探せ
                  </h1>
                </div>

                <div
                  className={
                    discussionRemaining <=
                    10
                      ? 'discussion-timer danger'
                      : 'discussion-timer'
                  }
                >
                  {discussionRemaining}
                  秒
                </div>
              </div>

              <section className="game-card">
                <div className="result incorrect">
                  回答不正解
                </div>

                <div className="correct-answer">
                  正しいキャラクター：
                  <strong>
                    {currentCharacter?.name}
                  </strong>
                </div>

<h2>
  作成した説明文
</h2>

<div className="answer-description">
  {renderDescription(true)}
</div>

                <div className="owner-legend">
                  {inputPlayerIndexes.map(
                    (
                      playerIndex,
                      index
                    ) => (
                      <div
                        key={
                          playerIndex
                        }
                        className="legend-item"
                      >
                        <span>
                          {String.fromCharCode(
                            0x2460 +
                              index
                          )}
                        </span>

                        <strong>
                          {
                            players[
                              playerIndex
                            ]?.name
                          }
                        </strong>
                      </div>
                    )
                  )}
                </div>

                {yorkCount > 0 && (
                  <>
                    <h2 className="york-title">
                      欲（ヨーク）だと思う人を
                      {yorkCount}
                      人選んでください
                    </h2>

                    <div className="player-select-grid">
                      {players
                        .filter(
                          (_, index) =>
                            index !==
                            stellaIndex
                        )
                        .map(
                          (player) => {
                            const selected =
                              selectedYorkIndexes.includes(
                                player.id
                              );

                            return (
                              <button
                                key={
                                  player.id
                                }
                                type="button"
                                className={
                                  selected
                                    ? 'player-select selected'
                                    : 'player-select'
                                }
                                onClick={() =>
                                  toggleYork(
                                    player.id
                                  )
                                }
                                disabled={
                                  !selected &&
                                  selectedYorkIndexes.length >=
                                    yorkCount
                                }
                              >
                                <span>
                                  P
                                  {player.id +
                                    1}
                                </span>

                                <strong>
                                  {
                                    player.name
                                  }
                                </strong>
                              </button>
                            );
                          }
                        )}
                    </div>
                  </>
                )}

                {message && (
                  <div className="warning-message">
                    {message}
                  </div>
                )}

               <div className="discussion-action">
  {!discussionFinished && (
    <div className="discussion-wait">
      議論時間残り
      {' '}
      {discussionRemaining}
      秒
    </div>
  )}

  {discussionFinished && (
    <div className="discussion-finished">
      議論時間終了
    </div>
  )}

  <button
    className="start-button wide"
    onClick={
      submitYorkGuess
    }
  >
    ヨークを確定する
  </button>
</div>
               
              </section>
            </div>
          </main>

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }

    // -------------------------
    // 結果
    // -------------------------

    if (
      phase === 'result'
    ) {
      const stellaWin =
        winner === 'stella';

      return (
        <>
          <main className="page">
            <div className="handoff-container">
              <div className="result-card">
                <div className="eyebrow">
                  GAME SET
                </div>

                <div
                  className={
                    stellaWin
                      ? 'result-winner stella'
                      : 'result-winner york'
                  }
                >
                  {stellaWin
                    ? 'ベガパンク側の勝利！'
                    : '欲（ヨーク）側の勝利！'}
                </div>

                <div className="result-character">
                  正解キャラクター
                  <strong>
                    {currentCharacter?.name}
                  </strong>
                </div>

<div className="final-description-section">
  <h2>
    みんなで作った説明文
  </h2>

  <div className="final-description">
    {renderDescription(true)}
  </div>
</div>

<div className="final-description-section correct-final-description">
  <h2>
    正しい説明文
  </h2>

  <div className="final-description">
    {renderCorrectDescription()}
  </div>
</div>

                <div className="final-roles">
                  {players.map(
                    (
                      player
                    ) => (
                      <div
                        key={
                          player.id
                        }
                        className={
                          player.role
                            ?.id ===
                          'york'
                            ? 'final-role york-role'
                            : 'final-role'
                        }
                      >
                        <span>
                          {player.name}
                        </span>

                        <strong>
                          {
                            player.role
                              ?.character
                          }
                          {' '}
                          （
                          {
                            player.role
                              ?.name
                          }
                          ）
                        </strong>
                      </div>
                    )
                  )}
                </div>

                <button
                  className="start-button"
                  onClick={
                    resetGame
                  }
                >
                  もう一度遊ぶ
                </button>
              </div>
            </div>
          </main>

          <style jsx global>
            {styles}
          </style>
        </>
      );
    }
  }

  // =====================================================
  // 設定画面
  // =====================================================

  return (
    <>
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
              PUNK RECORDS
            </div>

            <h1>
              パンクレコード
            </h1>

            <p>
              みんなで説明文を完成させ、
              欲（ヨーク）を見破れ！
            </p>
          </header>

          <section className="setup-card">
            <h2>
              プレイヤー設定
            </h2>

            <div className="setting-block">
              <div className="setting-label">
                プレイヤー人数
              </div>

              <div className="number-control">
                <button
                  type="button"
                  onClick={() =>
                    changePlayerCount(
                      playerCount - 1
                    )
                  }
                  disabled={
                    playerCount <= 2
                  }
                >
                  −
                </button>

                <strong>
                  {playerCount}人
                </strong>

                <button
                  type="button"
                  onClick={() =>
                    changePlayerCount(
                      playerCount + 1
                    )
                  }
                  disabled={
                    playerCount >=
                    MAX_PLAYERS
                  }
                >
                  ＋
                </button>
              </div>
            </div>

            <div className="player-name-grid">
              {Array.from(
                {
                  length:
                    playerCount,
                },
                (_, index) => (
                  <div
                    className="player-name-row"
                    key={index}
                  >
                    <span>
                      P
                      {index + 1}
                    </span>

                    <input
                      type="text"
                      value={
                        playerNames[
                          index
                        ]
                      }
                      onChange={(event) =>
                        updatePlayerName(
                          index,
                          event.target
                            .value
                        )
                      }
                      placeholder={`${index + 1}P`}
                    />
                  </div>
                )
              )}
            </div>
          </section>

          <section className="setup-card">
            <h2>
              ベガパンク（ステラ）設定
            </h2>

            <div className="option-grid">
              <button
                type="button"
                className={
                  stellaMode ===
                  'random'
                    ? 'option-button selected'
                    : 'option-button'
                }
                onClick={() =>
                  setStellaMode(
                    'random'
                  )
                }
              >
                <strong>
                  ランダム
                </strong>

                <span>
                  ベガパンクをランダムで決定
                </span>
              </button>

              <button
                type="button"
                className={
                  stellaMode ===
                  'manual'
                    ? 'option-button selected'
                    : 'option-button'
                }
                onClick={() =>
                  setStellaMode(
                    'manual'
                  )
                }
              >
                <strong>
                  任意
                </strong>

                <span>
                  ベガパンクを自分で選択
                </span>
              </button>
            </div>

            {stellaMode ===
              'manual' && (
              <div className="setting-block">
                <div className="setting-label">
                  ベガパンクにするプレイヤー
                </div>

                <select
                  value={
                    manualStellaIndex
                  }
                  onChange={(event) =>
                    setManualStellaIndex(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                >
                  {Array.from(
                    {
                      length:
                        playerCount,
                    },
                    (_, index) => (
                      <option
                        key={
                          index
                        }
                        value={
                          index
                        }
                      >
                        P
                        {index + 1}
                        {' '}
                        {
                          playerNames[
                            index
                          ] ||
                          `${index + 1}P`
                        }
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
          </section>

          <section className="setup-card">
            <h2>
              欲（ヨーク）設定
            </h2>

            <div className="setting-block">
              <div className="setting-label">
                欲（ヨーク）の人数
              </div>

              <div className="number-control">
                <button
                  type="button"
                  onClick={() =>
                    setYorkCount(
                      (prev) =>
                        Math.max(
                          0,
                          prev - 1
                        )
                    )
                  }
                  disabled={
                    yorkCount <= 0
                  }
                >
                  −
                </button>

                <strong>
                  {yorkCount}人
                </strong>

                <button
                  type="button"
                  onClick={() =>
                    setYorkCount(
                      (prev) =>
                        Math.min(
                          playerCount -
                            1,
                          prev + 1
                        )
                    )
                  }
                  disabled={
                    yorkCount >=
                    playerCount - 1
                  }
                >
                  ＋
                </button>
              </div>

              <p className="setting-help">
                0人にすると完全協力モードになります。
              </p>

<div className="setting-block">
  <div className="setting-label">
    ヨークの特殊入力回数
  </div>

  <div className="number-control">
    <button
      type="button"
      onClick={() =>
        setYorkStealthCount(
          (prev) =>
            Math.max(
              0,
              prev - 1
            )
        )
      }
      disabled={
        yorkStealthCount <= 0
      }
    >
      −
    </button>

    <strong>
      {yorkStealthCount}回
    </strong>

    <button
      type="button"
      onClick={() =>
        setYorkStealthCount(
          (prev) =>
            Math.min(
              10,
              prev + 1
            )
        )
      }
      disabled={
        yorkStealthCount >= 10
      }
    >
      ＋
    </button>
  </div>

  <p className="setting-help">
    他プレイヤーのマスに好きな文字を
    1文字だけ入力できます。
  </p>
</div>
            </div>
          </section>

          <section className="setup-card">
            <h2>
              ゲーム設定
            </h2>

            <div className="setting-row">
              <div>
                <strong>
                  記号のフルオープン
                </strong>

                <span>
                  句読点・括弧などを最初から表示
                </span>
              </div>

              <button
                type="button"
                className={
                  symbolsOpen
                    ? 'toggle on'
                    : 'toggle'
                }
                onClick={() =>
                  setSymbolsOpen(
                    (prev) =>
                      !prev
                  )
                }
              >
                {symbolsOpen
                  ? 'ON'
                  : 'OFF'}
              </button>
            </div>

            <div className="setting-block">
              <div className="setting-label">
                ヨーク探しの議論時間
              </div>

              <select
                value={
                  discussionTime
                }
                onChange={(event) =>
                  setDiscussionTime(
                    Number(
                      event.target
                        .value
                    )
                  )
                }
              >
                <option value={30}>
                  30秒
                </option>

                <option value={60}>
                  60秒
                </option>

                <option value={90}>
                  90秒
                </option>

                <option value={120}>
                  120秒
                </option>

                <option value={180}>
                  180秒
                </option>

                <option value={300}>
                  300秒
                </option>
              </select>
            </div>
          </section>

          <section className="setup-card">
            <div className="game-rule">
              <h2>
                役職
              </h2>

              <div className="role-list">
                <div>
                  <strong>
                    ベガパンク（ステラ）
                  </strong>
                  <span>
                    説明文からキャラクターを回答する
                  </span>
                </div>

                {CIVILIAN_ROLES.map(
                  (role) => (
                    <div
                      key={
                        role.id
                      }
                    >
                      <strong>
                        {role.name}
                        {' '}
                       （
                        {
                          role.character
                        }
                        ）
                      </strong>

                      <span>
                        市民側の役職
                      </span>
                    </div>
                  )
                )}

                <div className="york-rule">
                  <strong>
                    欲（ヨーク）
                  </strong>

                  <span>
                    正しい説明文を惑わせ、
                    最後まで正体を隠す
                  </span>
                </div>
              </div>
            </div>
          </section>

          <button
            className="start-button main-start"
            onClick={
              startGame
            }
            disabled={
              characters.length ===
              0
            }
          >
            ゲーム開始
          </button>

          <div className="data-count">
            登録キャラクター：
            {characters.length}人
          </div>
        </div>
      </main>

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

  html,
  body {
    margin: 0;
    min-height: 100%;
  }

  body {
    background:
      linear-gradient(
        180deg,
        #fafdff 0%,
        #eaf7ff 42%,
        #d7efff 100%
      );
    color: #16283a;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      "Noto Sans JP",
      sans-serif;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    background:
      radial-gradient(
        circle at 15% 8%,
        rgba(255,255,255,0.95) 0%,
        rgba(255,255,255,0.55) 20%,
        transparent 42%
      ),
      radial-gradient(
        circle at 85% 18%,
        rgba(255,255,255,0.8) 0%,
        rgba(255,255,255,0.25) 22%,
        transparent 45%
      );
  }

  body::after {
    content: "";
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 35vh;
    pointer-events: none;
    z-index: -1;
    background:
      linear-gradient(
        180deg,
        transparent 0%,
        rgba(130,205,238,0.08) 100%
      );
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
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
    color: #527086;
    text-decoration: none;
    margin-bottom: 30px;
    font-weight: 700;
  }

  .back-link:hover {
    color: #1679b7;
  }

  /* =========================================
     HERO
  ========================================= */

  .hero {
    position: relative;
    text-align: center;
    margin-bottom: 40px;
    padding: 35px 20px 40px;
    overflow: hidden;
  }

  .hero::before {
    content: "";
    position: absolute;
    width: 180px;
    height: 180px;
    top: -90px;
    left: 8%;
    border-radius: 50%;
    background: rgba(255,255,255,0.75);
    filter: blur(25px);
  }

  .hero::after {
    content: "";
    position: absolute;
    width: 240px;
    height: 100px;
    right: 4%;
    bottom: -45px;
    border-radius: 50%;
    background: rgba(255,255,255,0.75);
    filter: blur(20px);
  }

  .eyebrow {
    position: relative;
    z-index: 1;
    font-size: 12px;
    letter-spacing: 4px;
    color: #377ea7;
    margin-bottom: 10px;
    text-transform: uppercase;
    font-weight: 800;
  }

  .hero h1 {
    position: relative;
    z-index: 1;
    font-size: clamp(32px, 6vw, 58px);
    margin: 0 0 12px;
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #183c55;
  }

  .hero p {
    position: relative;
    z-index: 1;
    color: #557589;
    margin: 0;
    font-size: 15px;
  }

  /* =========================================
     CARDS
  ========================================= */

  .setup-card,
  .game-card {
    position: relative;
    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,0.94),
        rgba(239,249,255,0.88)
      );
    border: 1px solid rgba(86,150,181,0.24);
    border-radius: 18px;
    padding: 25px;
    margin-bottom: 20px;
    box-shadow:
      0 10px 35px rgba(51,108,137,0.10),
      0 2px 7px rgba(51,108,137,0.07);
  }

  .setup-card::before,
  .game-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 18px;
    bottom: 18px;
    width: 3px;
    border-radius: 3px;
    background: #4b9bc5;
    opacity: 0.7;
  }

  .setup-card h2,
  .game-card h2 {
    margin: 0 0 20px;
    color: #193c53;
    letter-spacing: 0.02em;
  }

  .setting-block {
    margin-top: 20px;
  }

  .setting-label {
    color: #294c61;
    font-weight: 800;
    margin-bottom: 10px;
  }

  .setting-help {
    color: #6c8798;
    font-size: 13px;
    margin: 10px 0 0;
  }

  /* =========================================
     NUMBER CONTROL
  ========================================= */

  .number-control {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .number-control button {
    width: 46px;
    height: 46px;
    border-radius: 10px;
    border: 1px solid #9cc6dc;
    background: #f7fcff;
    color: #27769e;
    font-size: 25px;
    box-shadow: 0 2px 7px rgba(45,107,139,0.08);
  }

  .number-control button:hover {
    background: #e8f6fd;
  }

  .number-control strong {
    min-width: 80px;
    text-align: center;
    font-size: 22px;
    color: #24485d;
  }

  /* =========================================
     PLAYER NAMES
  ========================================= */

  .player-name-grid {
    display: grid;
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(180px, 1fr)
      );
    gap: 12px;
    margin-top: 20px;
  }

  .player-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .player-name-row span {
    color: #4f7589;
    min-width: 30px;
    font-weight: 800;
  }

  input,
  select {
    width: 100%;
    border: 1px solid #a9c9da;
    border-radius: 9px;
    background: rgba(255,255,255,0.9);
    color: #18384c;
    padding: 12px 14px;
    outline: none;
  }

  input::placeholder {
    color: #9aafbc;
  }

  input:focus,
  select:focus {
    border-color: #4d9ac3;
    box-shadow:
      0 0 0 3px rgba(77,154,195,0.12);
  }

  /* =========================================
     OPTION BUTTON
  ========================================= */

  .option-grid {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .option-button {
    min-height: 90px;
    border: 1px solid #a9cbdc;
    border-radius: 13px;
    background: rgba(255,255,255,0.7);
    color: #23475c;
    text-align: left;
    padding: 18px;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.15s;
  }

  .option-button:hover {
    background: #f2faff;
    transform: translateY(-1px);
  }

  .option-button.selected {
    border-color: #3988b3;
    background:
      linear-gradient(
        135deg,
        #edfaff,
        #dff3fc
      );
    box-shadow:
      inset 0 0 0 1px rgba(57,136,179,0.08);
  }

  .option-button strong,
  .option-button span {
    display: block;
  }

  .option-button strong {
    font-size: 20px;
    margin-bottom: 7px;
    color: #1d526f;
  }

  .option-button span {
    color: #6b8797;
    font-size: 13px;
  }

  /* =========================================
     SETTING ROW
  ========================================= */

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
  }

  .setting-row strong,
  .setting-row span {
    display: block;
  }

  .setting-row span {
    color: #6d8998;
    font-size: 13px;
    margin-top: 5px;
  }

  .toggle {
    min-width: 72px;
    border: 1px solid #a9c7d7;
    border-radius: 999px;
    background: #edf5f8;
    color: #6b8492;
    padding: 10px 16px;
    font-weight: 900;
  }

  .toggle.on {
    background: #3286b2;
    color: #fff;
    border-color: #3286b2;
  }

  /* =========================================
     ROLE LIST
  ========================================= */

  .game-rule {
    text-align: center;
  }

  .role-list {
    display: grid;
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(180px, 1fr)
      );
    gap: 10px;
    text-align: left;
  }

  .role-list > div {
    border: 1px solid #bdd4df;
    border-radius: 11px;
    padding: 14px;
    background: rgba(255,255,255,0.65);
  }

  .role-list strong,
  .role-list span {
    display: block;
  }

  .role-list strong {
    margin-bottom: 5px;
    color: #2b5065;
  }

  .role-list span {
    color: #718995;
    font-size: 12px;
  }

  .york-rule {
    border-color: rgba(190,70,70,0.38) !important;
    background: rgba(255,247,247,0.75) !important;
  }

  /* =========================================
     BUTTONS
  ========================================= */

  .start-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 0 28px;
    border: 1px solid #287da9;
    border-radius: 10px;
    background:
      linear-gradient(
        180deg,
        #4ba3cc,
        #287da9
      );
    color: #fff;
    font-weight: 900;
    font-size: 17px;
    box-shadow:
      0 5px 14px rgba(38,113,149,0.18);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .start-button:hover {
    transform: translateY(-1px);
    box-shadow:
      0 7px 18px rgba(38,113,149,0.22);
  }

  .start-button.wide {
    width: 100%;
  }

  .main-start {
    width: 100%;
    min-height: 64px;
    font-size: 21px;
  }

  .data-count {
    text-align: center;
    color: #7892a0;
    margin-top: 15px;
    font-size: 12px;
  }

  /* =========================================
     LOADING / ERROR
  ========================================= */

  .loading-card,
  .error-card {
    padding: 50px;
    text-align: center;
    border-radius: 18px;
    background: rgba(255,255,255,0.82);
    border: 1px solid #c0d7e2;
    box-shadow:
      0 8px 25px rgba(52,105,132,0.08);
  }

  .error-card {
    color: #c94e4e;
  }

  /* =========================================
     HANDOFF
  ========================================= */

  .handoff-container {
    min-height: calc(100vh - 90px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .handoff-card,
  .result-card {
    width: min(720px, 100%);
    text-align: center;
    padding: 45px 25px;
    border-radius: 20px;
    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,0.96),
        rgba(239,249,255,0.92)
      );
    border: 1px solid #b9d4e1;
    box-shadow:
      0 14px 40px rgba(50,106,135,0.12);
  }

  .handoff-card h1 {
    font-size: clamp(28px, 6vw, 48px);
    margin: 15px 0;
    color: #183d54;
  }

  .handoff-card p {
    color: #668293;
    line-height: 1.8;
  }

  .role-big {
    font-size: clamp(30px, 7vw, 60px);
    font-weight: 900;
    margin: 20px 0;
    color: #26769e;
  }

  .role-big span {
    font-size: 0.55em;
    color: #547789;
  }

  .role-big.small {
    font-size: 30px;
    margin: 10px 0 25px;
  }

  .handoff-label {
    font-size: 12px;
    letter-spacing: 4px;
    color: #5f879c;
    font-weight: 800;
  }

  .handoff-round {
    color: #7593a2;
    margin-top: 15px;
  }

  /* =========================================
     GAME TOP
  ========================================= */

  .game-top,
  .discussion-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
    color: #294d61;
  }

  .role-mini {
    font-weight: 900;
    color: #26769e;
  }

  .role-mini span {
    color: #708b99;
    font-weight: 500;
  }

  /* =========================================
     INPUT ROLE
  ========================================= */

  .input-role-card {
    border-radius: 13px;
    padding: 18px;
    background:
      linear-gradient(
        135deg,
        #eefaff,
        #e3f4fb
      );
    border: 1px solid #b7d5e2;
    margin-bottom: 25px;
    text-align: center;
  }

  .role-label {
    color: #7290a0;
    font-size: 12px;
    margin-bottom: 5px;
  }

  .role-name {
    font-size: 30px;
    font-weight: 900;
    color: #28769c;
  }

  .role-description {
    color: #6c8998;
    margin-top: 5px;
  }

  .character-name {
    text-align: center;
    color: #698391;
    margin-bottom: 12px;
  }

  .character-name strong {
    color: #244b61;
  }

  .instruction {
    text-align: center;
    color: #718995;
    line-height: 1.7;
    font-size: 13px;
  }

  /* =========================================
     DESCRIPTION
  ========================================= */

  .description-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 7px;
    padding: 18px 0;
  }

  .description-cell {
    position: relative;
    width: 42px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid #b9d1dc;
    background: rgba(255,255,255,0.82);
    color: #254b60;
    font-size: 22px;
    font-weight: 900;
    box-shadow:
      0 2px 5px rgba(55,102,124,0.05);
  }

  .input-grid {
    gap: 6px;
  }

  .hidden-cell {
    color: #9db1bb;
    background: #edf4f7;
  }

  .symbol-cell {
    background: #f1f8fb;
    color: #6b8998;
  }

  .revealed-cell {
    background: #fff;
    border-color: #9dbfd0;
  }

  .description-input {
    width: 42px;
    height: 52px;
    padding: 0;
    text-align: center;
    font-size: 22px;
    font-weight: 900;
    border-radius: 7px;
    border: 2px solid #3c91bd;
    background: #f2fbff;
    color: #23495d;
    box-shadow:
      inset 0 0 0 1px rgba(60,145,189,0.05);
  }

  .description-input:focus {
    border-color: #2479a6;
    background: #fff;
    box-shadow:
      0 0 0 3px rgba(45,130,170,0.14);
  }

  /* =========================================
     WARNING
  ========================================= */

  .warning-message {
    margin: 15px 0;
    padding: 12px;
    border-radius: 9px;
    background: rgba(211,75,75,0.09);
    border: 1px solid rgba(211,75,75,0.18);
    color: #bd4e4e;
    text-align: center;
  }

  /* =========================================
     ANSWER
  ========================================= */

  .answer-card {
    max-width: 1000px;
    margin: 40px auto;
  }

  .answer-card h1 {
    text-align: center;
    margin: 0;
    color: #193e54;
  }

  .answer-card > p {
    text-align: center;
    color: #698493;
  }

  .answer-description {
    margin: 25px 0;
  }

  .answer-form {
    display: flex;
    gap: 10px;
    max-width: 700px;
    margin: 20px auto 0;
  }

  .answer-form input {
    flex: 1;
  }

  /* =========================================
     OWNER NUMBER
  ========================================= */

  .owner-number {
    position: absolute;
    top: -8px;
    right: -5px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #347fa5;
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    z-index: 2;
    border: 2px solid #fff;
  }

  /* =========================================
     DISCUSSION
  ========================================= */

  .discussion-top h1 {
    margin: 0;
    font-size: clamp(25px, 5vw, 40px);
    color: #1d465d;
  }

  .discussion-timer {
    min-width: 100px;
    text-align: center;
    padding: 12px;
    border-radius: 11px;
    background: rgba(255,255,255,0.78);
    border: 1px solid #a9c9d8;
    color: #28647f;
    font-size: 24px;
    font-weight: 900;
  }

  .discussion-timer.danger {
    background: #fff2f2;
    border-color: #e2a4a4;
    color: #c14f4f;
  }

  .result {
    padding: 12px;
    border-radius: 10px;
    text-align: center;
    font-weight: 900;
    margin-bottom: 20px;
  }

  .result.incorrect {
    background: rgba(213,75,75,0.09);
    border: 1px solid rgba(213,75,75,0.18);
    color: #c05252;
  }

  .correct-answer {
    text-align: center;
    color: #708895;
  }

  .correct-answer strong {
    color: #28546a;
    font-size: 20px;
  }

  .owner-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin: 10px 0 30px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    border-radius: 8px;
    background: #f1f7fa;
    border: 1px solid #c1d6df;
  }

  .legend-item span {
    font-size: 20px;
    font-weight: 900;
    color: #337da2;
  }

  .legend-item strong {
    font-size: 13px;
    color: #416275;
  }

  .york-title {
    margin-top: 30px !important;
  }

  .player-select-grid {
    display: grid;
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(140px, 1fr)
      );
    gap: 10px;
  }

  .player-select {
    min-height: 75px;
    border-radius: 11px;
    border: 1px solid #b9d2de;
    background: rgba(255,255,255,0.72);
    color: #315366;
    padding: 10px;
  }

  .player-select span,
  .player-select strong {
    display: block;
  }

  .player-select span {
    color: #8299a5;
    font-size: 12px;
  }

  .player-select.selected {
    border-color: #3988b1;
    background: #e7f6fc;
    box-shadow:
      inset 0 0 0 1px rgba(57,136,177,0.08);
  }

  .discussion-wait {
    text-align: center;
    color: #718995;
    padding: 20px;
  }

  .discussion-action {
    margin-top: 20px;
  }

  .discussion-finished {
    text-align: center;
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 9px;
    background: #eef5f8;
    color: #617e8d;
    font-weight: 800;
  }

  /* =========================================
     RESULT
  ========================================= */

  .result-card {
    max-width: 950px;
  }

  .result-winner {
    font-size: clamp(30px, 7vw, 62px);
    font-weight: 900;
    margin: 20px 0 35px;
  }

  .result-winner.stella {
    color: #287ca5;
  }

  .result-winner.york {
    color: #c35252;
  }

  .result-character {
    color: #718793;
    margin-bottom: 20px;
  }

  .result-character strong {
    display: block;
    color: #1e475d;
    font-size: 28px;
    margin-top: 5px;
  }

  .final-description-section {
    margin-top: 30px;
  }

  .final-description-section h2 {
    text-align: center;
    margin-bottom: 10px;
    color: #2b5268;
  }

  .correct-final-description {
    margin-top: 40px;
    padding-top: 30px;
    border-top: 1px solid #c5d9e2;
  }

  .final-roles {
    display: grid;
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(180px, 1fr)
      );
    gap: 10px;
    margin: 20px 0 30px;
    text-align: left;
  }

  .final-role {
    padding: 13px;
    border-radius: 10px;
    background: #f3f8fa;
    border: 1px solid #c6d9e1;
  }

  .final-role span,
  .final-role strong {
    display: block;
  }

  .final-role span {
    color: #758d99;
    font-size: 12px;
    margin-bottom: 5px;
  }

  .final-role strong {
    color: #35586a;
  }

  .york-role {
    border: 1px solid rgba(195,82,82,0.32);
    background: #fff5f5;
  }

  /* =========================================
     MOBILE
  ========================================= */

  @media (max-width: 700px) {
    .page {
      padding: 20px 10px 40px;
    }

    .setup-card,
    .game-card {
      padding: 18px;
      border-radius: 15px;
    }

    .option-grid {
      grid-template-columns: 1fr;
    }

    .description-cell,
    .description-input {
      width: 35px;
      height: 45px;
      font-size: 19px;
    }

    .answer-form {
      flex-direction: column;
    }

    .game-top,
    .discussion-top {
      align-items: flex-start;
      flex-direction: column;
    }

    .final-description-section {
      margin-top: 25px;
    }

    .correct-final-description {
      margin-top: 30px;
      padding-top: 25px;
    }

    .discussion-action {
      margin-top: 15px;
    }

  /* =========================================
     YORK STEALTH
  ========================================= */

  .stealth-control {
    margin: 20px 0;
    padding: 18px;
    border-radius: 13px;
    background:
      linear-gradient(
        135deg,
        #fff8f8,
        #fff1f1
      );
    border: 1px solid #e2bcbc;
    text-align: center;
  }

  .stealth-status {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .stealth-status strong {
    color: #a84444;
  }

  .stealth-status span {
    color: #c36b6b;
    font-weight: 800;
  }

  .stealth-button {
    min-height: 48px;
    padding: 0 22px;
    border-radius: 10px;
    border: 1px solid #c77777;
    background: #fff;
    color: #a74444;
    font-weight: 900;
  }

  .stealth-button:hover {
    background: #fff4f4;
  }

  .stealth-button.active {
    background:
      linear-gradient(
        180deg,
        #d76b6b,
        #b84d4d
      );
    color: #fff;
    border-color: #b84d4d;
  }

  .stealth-help {
    margin: 10px 0 0;
    color: #a66a6a;
    font-size: 13px;
  }

  .stealth-input {
    border-color: #c65c5c !important;
    background: #fff5f5 !important;
    color: #a13f3f !important;
  }

  .stealth-cell {
    background: #fff3f3;
    border-color: #d69a9a;
    color: #a84444;
  }
  }
`;