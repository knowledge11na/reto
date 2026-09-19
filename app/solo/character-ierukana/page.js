// file: app/solo/character-ierukana/page.js

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'characterIerukanaSession';
const RECORDS_STORAGE_KEY = 'characterIerukanaRecords';
const AUTO_SCROLL_STORAGE_KEY = 'characterIerukanaAutoScroll';

const ARC_OPTIONS = [
  {
    id: 'east',
    label: '麦わらの一味＆東の海',
    range: '001～125',
    min: 1,
    max: 125,
  },
  {
    id: 'alabasta',
    label: 'アラバスタ',
    range: '126～233',
    min: 126,
    max: 233,
  },
  {
    id: 'skypiea',
    label: '空島',
    range: '234～333',
    min: 234,
    max: 333,
  },
  {
    id: 'water7',
    label: 'DBF～エニエス・ロビー',
    range: '334～457',
    min: 334,
    max: 457,
  },
  {
    id: 'thriller',
    label: 'スリラーバーク～シャボンディ諸島',
    range: '458～541',
    min: 458,
    max: 541,
  },
  {
    id: 'amazon',
    label: '女ヶ島～3D2Y',
    range: '542～711',
    min: 542,
    max: 711,
  },
  {
    id: 'fishman',
    label: '魚人島～パンクハザード',
    range: '712～814',
    min: 712,
    max: 814,
  },
  {
    id: 'dressrosa',
    label: 'ドレスローザ',
    range: '815～948',
    min: 815,
    max: 948,
  },
  {
    id: 'wholecake',
    label: 'ホールケーキアイランド',
    range: '949～1181',
    min: 949,
    max: 1181,
  },
  {
    id: 'wano',
    label: 'ワノ国',
    range: '1182～1678',
    min: 1182,
    max: 1678,
  },
  {
    id: 'egghead',
    label: 'エッグヘッド～エルバフ',
    range: '1679～最後',
    min: 1679,
    max: Infinity,
  },
];

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
    // 長音・波ダッシュ・チルダをすべて「ー」に統一
    .replace(/[〜～~ーｰ\-－−‐-‒–—―]/g, 'ー')
    .replace(/[\u30a1-\u30f6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
}

function formatNumber(number) {
  return String(number).padStart(3, '0');
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(secs).padStart(2, '0')}`;
}

function getImagePath(charNo) {
  return `/character/${String(charNo).padStart(4, '0')}.png`;
}

// ========================================
// ゲーム中断データ
// ========================================

function saveSession(session) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('ゲーム状態の保存に失敗しました:', error);
  }
}

function loadSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object') {
      return null;
    }

    return data;
  } catch (error) {
    console.error('保存されたゲーム状態の読み込みに失敗しました:', error);
    return null;
  }
}

function deleteSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('保存されたゲーム状態の削除に失敗しました:', error);
  }
}

// ========================================
// 最高記録
// ========================================

function loadRecords() {
  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object') {
      return {};
    }

    return data;
  } catch (error) {
    console.error('最高記録の読み込みに失敗しました:', error);
    return {};
  }
}

function saveRecords(records) {
  try {
    window.localStorage.setItem(
      RECORDS_STORAGE_KEY,
      JSON.stringify(records)
    );
  } catch (error) {
    console.error('最高記録の保存に失敗しました:', error);
  }
}

function getRecordKey(arcs) {
  if (!Array.isArray(arcs) || arcs.length === 0) {
    return 'all';
  }

  return [...arcs].sort().join(',');
}

function loadAutoScrollSetting() {
  try {
    const raw = window.localStorage.getItem(AUTO_SCROLL_STORAGE_KEY);

    if (raw === null) {
      return true;
    }

    return raw === 'true';
  } catch (error) {
    console.error('自動スクロール設定の読み込みに失敗しました:', error);
    return true;
  }
}

function saveAutoScrollSetting(value) {
  try {
    window.localStorage.setItem(AUTO_SCROLL_STORAGE_KEY, String(value));
  } catch (error) {
    console.error('自動スクロール設定の保存に失敗しました:', error);
  }
}

export default function CharacterIerukanaPage() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ----------------------------------------
  // 範囲選択
  // ----------------------------------------
  const [selectedArcs, setSelectedArcs] = useState([]);

  // ----------------------------------------
  // ゲーム状態
  // ----------------------------------------
  const [gameStarted, setGameStarted] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  // ----------------------------------------
  // 正解済みキャラクター
  // charNoを使って個体を識別する
  // ----------------------------------------
  const [answeredIds, setAnsweredIds] = useState([]);

  // ----------------------------------------
  // 画像が存在しないキャラ
  // ----------------------------------------
  const [missingImages, setMissingImages] = useState({});

  // ----------------------------------------
  // 入力
  // ----------------------------------------
  const [answerInput, setAnswerInput] = useState('');
  const [message, setMessage] = useState('');

  // ----------------------------------------
  // タイマー
  // ----------------------------------------
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  // ----------------------------------------
  // 入力欄
  // ----------------------------------------
  const inputRef = useRef(null);

  // ----------------------------------------
  // キャラクターカードの参照
  // ----------------------------------------
  const characterRefs = useRef({});

  // ----------------------------------------
  // 保存データ
  // ----------------------------------------
  const [savedSession, setSavedSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // ----------------------------------------
  // 最高記録
  // ----------------------------------------
  const [records, setRecords] = useState({});

  // ----------------------------------------
  // 自動スクロール
  // ----------------------------------------
  const [autoScroll, setAutoScroll] = useState(true);

  // ----------------------------------------
  // CSV読み込み
  // ----------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      try {
        setLoading(true);
        setLoadError('');

        const response = await fetch('/api/character-ierukana', {
          cache: 'no-store',
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || 'キャラクターデータを取得できませんでした。'
          );
        }

        if (!cancelled) {
          setCharacters(
            Array.isArray(data.characters) ? data.characters : []
          );
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setLoadError(
            error?.message ||
              'キャラクターデータの読み込みに失敗しました。'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCharacters();

    return () => {
      cancelled = true;
    };
  }, []);

  // ----------------------------------------
  // 保存されたゲーム・最高記録・設定の確認
  // ----------------------------------------
  useEffect(() => {
    const session = loadSession();

    if (session) {
      setSavedSession(session);
    } else {
      setSavedSession(null);
    }

    setRecords(loadRecords());
    setAutoScroll(loadAutoScrollSetting());

    setSessionChecked(true);
  }, []);

  // ----------------------------------------
  // タイマー
  // ----------------------------------------
  useEffect(() => {
    if (
      !gameStarted ||
      gamePaused ||
      gameFinished ||
      gaveUp
    ) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return;
    }

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    gameStarted,
    gamePaused,
    gameFinished,
    gaveUp,
  ]);

  // ----------------------------------------
  // 範囲に応じたキャラクター
  // ----------------------------------------
  const gameCharacters = useMemo(() => {
    if (!characters.length) {
      return [];
    }

    // 全部
    if (selectedArcs.length === 0) {
      return characters;
    }

    const selected = ARC_OPTIONS.filter((arc) =>
      selectedArcs.includes(arc.id)
    );

    return characters.filter((character) => {
      return selected.some(
        (arc) =>
          character.charNo >= arc.min &&
          character.charNo <= arc.max
      );
    });
  }, [characters, selectedArcs]);

  // ----------------------------------------
  // 正解済みセット
  // charNo単位で管理するため、
  // 同じ名前のキャラがいても別々に扱える
  // ----------------------------------------
  const answeredSet = useMemo(
    () => new Set(answeredIds),
    [answeredIds]
  );

  const currentCount = answeredIds.length;

  const totalCount = gameCharacters.length;

  const remainingCount = Math.max(
    0,
    totalCount - currentCount
  );

  const progressPercent =
    totalCount > 0
      ? Math.min(
          100,
          Math.round((currentCount / totalCount) * 100)
        )
      : 0;

  // ----------------------------------------
  // 現在選択している範囲の記録キー
  // ----------------------------------------
  const currentRecordKey = getRecordKey(selectedArcs);

  const currentRecord =
    records[currentRecordKey] || null;

  // ----------------------------------------
  // 選択中の範囲名
  // ----------------------------------------
  const selectedArcLabels =
    selectedArcs.length === 0
      ? ['全部']
      : ARC_OPTIONS.filter((arc) =>
          selectedArcs.includes(arc.id)
        ).map((arc) => arc.label);

  // ----------------------------------------
  // 最高記録を更新
  // ----------------------------------------
  function updateRecord(
    answeredCount,
    elapsed,
    finished = false
  ) {
    const key = getRecordKey(selectedArcs);

    setRecords((prev) => {
      const previous = prev[key] || {};

      const previousMaxAnswered =
        Number.isFinite(
          Number(previous.maxAnswered)
        )
          ? Number(previous.maxAnswered)
          : 0;

      const previousMaxAnsweredTime =
        Number.isFinite(
          Number(previous.maxAnsweredTime)
        )
          ? Number(previous.maxAnsweredTime)
          : null;

      const previousClearTime =
        Number.isFinite(
          Number(previous.clearTime)
        )
          ? Number(previous.clearTime)
          : null;

      let maxAnswered = previousMaxAnswered;
      let maxAnsweredTime =
        previousMaxAnsweredTime;

      // 今までより多く答えられた
      if (answeredCount > previousMaxAnswered) {
        maxAnswered = answeredCount;
        maxAnsweredTime = elapsed;
      }

      // 同じ人数なら、より速いタイムを記録
      else if (
        answeredCount === previousMaxAnswered &&
        answeredCount > 0 &&
        (
          maxAnsweredTime === null ||
          elapsed < maxAnsweredTime
        )
      ) {
        maxAnsweredTime = elapsed;
      }

      let clearTime = previousClearTime;

      // 全問正解なら完全クリアタイムを更新
      if (
        finished &&
        answeredCount === totalCount &&
        totalCount > 0 &&
        (
          clearTime === null ||
          elapsed < clearTime
        )
      ) {
        clearTime = elapsed;
      }

      const nextRecord = {
        maxAnswered,
        maxAnsweredTime,
        clearTime,
        updatedAt: Date.now(),
      };

      const nextRecords = {
        ...prev,
        [key]: nextRecord,
      };

      saveRecords(nextRecords);

      return nextRecords;
    });
  }

  // ----------------------------------------
  // 自動スクロール切り替え
  // ----------------------------------------
  function toggleAutoScroll() {
    setAutoScroll((prev) => {
      const next = !prev;

      saveAutoScrollSetting(next);

      return next;
    });
  }

  // ----------------------------------------
  // 保存データの作成
  // ----------------------------------------
  function createSessionData(overrides = {}) {
    return {
      version: 1,

      selectedArcs: [...selectedArcs],

      answeredIds: [...answeredIds],

      elapsedSeconds,

      gameStarted: true,

      gamePaused,

      gameFinished,

      gaveUp,

      savedAt: Date.now(),

      ...overrides,
    };
  }

  // ----------------------------------------
  // 現在の状態を保存
  // ----------------------------------------
  function saveCurrentSession(overrides = {}) {
    const session = createSessionData(overrides);

    saveSession(session);
    setSavedSession(session);
  }

  // ----------------------------------------
  // 範囲選択
  // ----------------------------------------
  function toggleArc(id) {
    setSelectedArcs((prev) => {
      if (prev.includes(id)) {
        return prev.filter(
          (item) => item !== id
        );
      }

      return [...prev, id];
    });
  }

  function selectAllMode() {
    setSelectedArcs([]);
  }

  // ----------------------------------------
  // 新しいゲーム開始
  // ----------------------------------------
  function startGame() {
    if (gameCharacters.length === 0) {
      setMessage(
        '出題できるキャラクターがありません。'
      );
      return;
    }

    const newSession = {
      version: 1,

      selectedArcs: [...selectedArcs],

      answeredIds: [],

      elapsedSeconds: 0,

      gameStarted: true,

      gamePaused: false,

      gameFinished: false,

      gaveUp: false,

      savedAt: Date.now(),
    };

    // 以前のセッションを上書き
    saveSession(newSession);
    setSavedSession(newSession);

    setAnsweredIds([]);
    setAnswerInput('');
    setMessage('');
    setElapsedSeconds(0);
    setGamePaused(false);
    setGameFinished(false);
    setGaveUp(false);
    setMissingImages({});
    setGameStarted(true);

    // キャラクター参照をリセット
    characterRefs.current = {};

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }

  // ----------------------------------------
  // 保存されたゲームを再開
  // ----------------------------------------
  function resumeSavedGame() {
    const session = loadSession();

    if (!session) {
      setSavedSession(null);
      return;
    }

    const restoredArcs = Array.isArray(
      session.selectedArcs
    )
      ? session.selectedArcs
      : [];

    const restoredAnswered = Array.isArray(
      session.answeredIds
    )
      ? session.answeredIds
      : [];

    const restoredElapsed =
      Number.isFinite(
        Number(session.elapsedSeconds)
      )
        ? Number(session.elapsedSeconds)
        : 0;

    setSelectedArcs(restoredArcs);

    setAnsweredIds(restoredAnswered);

    setElapsedSeconds(restoredElapsed);

    setAnswerInput('');
    setMessage('');

    setGameFinished(
      session.gameFinished === true
    );

    setGaveUp(
      session.gaveUp === true
    );

    // 再開した時点では必ずゲーム画面へ
    // 「中断中」として保存されていた場合でも、
    // 再開ボタンを押したらタイマーを動かす。
    setGamePaused(false);
    setGameStarted(true);

    setSavedSession(session);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  }

  // ----------------------------------------
  // 保存を削除して新しく始める
  // ----------------------------------------
  function discardSavedGame() {
    const confirmed = window.confirm(
      '保存されているゲームを削除しますか？\nこのゲームの回答状況とタイムは失われます。'
    );

    if (!confirmed) {
      return;
    }

    deleteSession();
    setSavedSession(null);
  }

  // ----------------------------------------
  // 設定画面へ戻る
  // ----------------------------------------
  function backToSettings() {
    // プレイ中の状態を保存してから戻す
    if (
      gameStarted &&
      !gameFinished &&
      !gaveUp
    ) {
      saveCurrentSession({
        gamePaused: true,
      });
    }

    setGameStarted(false);
    setGamePaused(false);
    setGameFinished(false);
    setGaveUp(false);
    setAnsweredIds([]);
    setAnswerInput('');
    setMessage('');
    setElapsedSeconds(0);
    setMissingImages({});

    characterRefs.current = {};
  }

  // ========================================
  // 回答
  // ========================================

  function submitAnswer(event) {
    event?.preventDefault();

    if (
      !gameStarted ||
      gamePaused ||
      gameFinished ||
      gaveUp
    ) {
      return;
    }

    const input = normalizeAnswer(answerInput);

    if (!input) {
      return;
    }

    // ----------------------------------------
    // 未回答のキャラクターから検索
    //
    // ここが重要！
    //
    // 「同じ名前がすでに回答済みか」は確認しない。
    // 未回答のキャラクターの中から一致するものを探す。
    //
    // そのため、
    //
    // 001 名前：○○
    // 050 名前：○○
    //
    // の場合、
    //
    // 1回目「○○」→001
    // 2回目「○○」→050
    //
    // と回答できる。
    // ----------------------------------------
    const candidate = gameCharacters.find(
      (character) => {
        if (
          answeredSet.has(character.charNo)
        ) {
          return false;
        }

        return (
          normalizeAnswer(character.name) ===
            input ||
          normalizeAnswer(
            character.relatedWord
          ) === input
        );
      }
    );

    // ----------------------------------------
    // 該当するキャラクターがいない
    // ----------------------------------------
    if (!candidate) {
      setMessage(
        'その名前はありません。'
      );

      setAnswerInput('');

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);

      return;
    }

    // ----------------------------------------
    // 正解
    // ----------------------------------------
    //
    // charNoを追加する。
    // 名前ではなくcharNoで管理しているので、
    // 同名キャラも別々に正解済みにできる。
    // ----------------------------------------
    const nextAnswered = [
      ...answeredIds,
      candidate.charNo,
    ];

    const isFinished =
      nextAnswered.length >=
      gameCharacters.length;

    setAnsweredIds(nextAnswered);
    setAnswerInput('');
    setMessage(
      `正解！ ${candidate.name}`
    );

    // ----------------------------------------
    // 最高記録更新
    // ----------------------------------------
    updateRecord(
      nextAnswered.length,
      elapsedSeconds,
      isFinished
    );

    // ----------------------------------------
    // 全問正解
    // ----------------------------------------
    if (isFinished) {
      setGameFinished(true);

      setMessage(
        '全問正解！ COMPLETE！'
      );

      // 完全クリアしたら保存データを削除
      deleteSession();
      setSavedSession(null);
    } else {
      // ----------------------------------------
      // 回答するたびに保存
      // ----------------------------------------
      const nextSession = {
        version: 1,

        selectedArcs: [...selectedArcs],

        answeredIds: nextAnswered,

        elapsedSeconds,

        gameStarted: true,

        gamePaused: false,

        gameFinished: false,

        gaveUp: false,

        savedAt: Date.now(),
      };

      saveSession(nextSession);
      setSavedSession(nextSession);
    }

    // ----------------------------------------
    // 回答後
    // 自動スクロールONなら正解キャラへ移動
    // その後、必ず入力欄へフォーカス
    // ----------------------------------------
    setTimeout(() => {
      if (autoScroll) {
        const target =
          characterRefs.current[
            candidate.charNo
          ];

        target?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }

      inputRef.current?.focus();
    }, 50);
  }

  // ----------------------------------------
  // 降参
  // ----------------------------------------
  function giveUp() {
    if (
      !gameStarted ||
      gameFinished ||
      gaveUp
    ) {
      return;
    }

    const shouldGiveUp = window.confirm(
      '降参しますか？\n未回答のキャラクターは赤くなり、答えが表示されます。'
    );

    if (!shouldGiveUp) {
      return;
    }

    setGaveUp(true);
    setMessage('降参しました。');
    setAnswerInput('');

    // 降参状態も保存
    const session = {
      version: 1,

      selectedArcs: [...selectedArcs],

      answeredIds: [...answeredIds],

      elapsedSeconds,

      gameStarted: true,

      gamePaused: false,

      gameFinished: false,

      gaveUp: true,

      savedAt: Date.now(),
    };

    saveSession(session);
    setSavedSession(session);
  }

  // ----------------------------------------
  // 中断
  // ----------------------------------------
  function pauseGame() {
    if (
      !gameStarted ||
      gameFinished ||
      gaveUp
    ) {
      return;
    }

    // 中断した瞬間にlocalStorageへ保存
    const session = {
      version: 1,

      selectedArcs: [...selectedArcs],

      answeredIds: [...answeredIds],

      elapsedSeconds,

      gameStarted: true,

      gamePaused: true,

      gameFinished: false,

      gaveUp: false,

      savedAt: Date.now(),
    };

    saveSession(session);
    setSavedSession(session);

    setGamePaused(true);
    setMessage('');
  }

  // ----------------------------------------
  // 再開
  // ----------------------------------------
  function resumeGame() {
    if (
      !gameStarted ||
      !gamePaused
    ) {
      return;
    }

    setGamePaused(false);

    // 再開した状態も保存
    const session = {
      version: 1,

      selectedArcs: [...selectedArcs],

      answeredIds: [...answeredIds],

      elapsedSeconds,

      gameStarted: true,

      gamePaused: false,

      gameFinished: false,

      gaveUp: false,

      savedAt: Date.now(),
    };

    saveSession(session);
    setSavedSession(session);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }

  // ----------------------------------------
  // 画像エラー
  // ----------------------------------------
  function handleImageError(charNo) {
    setMissingImages((prev) => ({
      ...prev,
      [charNo]: true,
    }));
  }

  // ========================================
  // ローディング
  // ========================================
  if (loading || !sessionChecked) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl border border-sky-200 bg-white p-8 text-center shadow-sm">
            <p className="font-bold">
              キャラクターデータを読み込み中...
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // エラー
  // ========================================
  if (loadError) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl border border-red-300 bg-red-50 p-6 shadow-sm">
            <h1 className="text-xl font-extrabold text-red-900">
              キャラクターデータを読み込めませんでした
            </h1>

            <p className="mt-3 text-sm text-red-800">
              {loadError}
            </p>

            <Link
              href="/solo"
              className="inline-block mt-5 rounded-lg bg-white border border-red-300 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
            >
              ソロメニューへ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // 設定画面
  // ========================================
  if (!gameStarted) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <header className="flex items-center justify-between mb-5">
            <h1 className="text-xl sm:text-2xl font-extrabold">
              ONE PIECE キャラクター
              <br className="sm:hidden" />
              脳内読みチャレンジ
            </h1>

            <Link
              href="/solo"
              className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
            >
              ソロメニュー
            </Link>
          </header>

          <div className="rounded-2xl border border-sky-300 bg-white shadow-sm overflow-hidden">
            <div className="bg-sky-100 px-4 py-4 border-b border-sky-200">
              <p className="text-sm font-extrabold">
                出題範囲を選択
              </p>

              <p className="text-xs text-sky-800 mt-1">
                複数の編を選択できます。
              </p>
            </div>

            <div className="p-4">
              {/* ====================================
                  全部
              ==================================== */}
              <button
                type="button"
                onClick={selectAllMode}
                className={`w-full text-left rounded-xl border-2 px-4 py-3 mb-3 transition ${
                  selectedArcs.length === 0
                    ? 'border-sky-500 bg-sky-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-black ${
                      selectedArcs.length === 0
                        ? 'border-sky-500 bg-sky-500 text-white'
                        : 'border-slate-400 bg-white'
                    }`}
                  >
                    {selectedArcs.length === 0
                      ? '✓'
                      : ''}
                  </span>

                  <div>
                    <p className="font-extrabold text-sm">
                      全部
                    </p>

                    <p className="text-[11px] text-slate-600">
                      全キャラクター（主にビブカ基準）
                    </p>
                  </div>
                </div>
              </button>

              {/* ====================================
                  編一覧
              ==================================== */}
              <div className="space-y-2">
                {ARC_OPTIONS.map((arc) => {
                  const checked =
                    selectedArcs.includes(
                      arc.id
                    );

                  return (
                    <button
                      key={arc.id}
                      type="button"
                      onClick={() =>
                        toggleArc(arc.id)
                      }
                      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition ${
                        checked
                          ? 'border-sky-500 bg-sky-100'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-black ${
                            checked
                              ? 'border-sky-500 bg-sky-500 text-white'
                              : 'border-slate-400 bg-white'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </span>

                        <div className="min-w-0">
                          <p className="font-extrabold text-sm">
                            {arc.label}
                          </p>

                          <p className="text-[11px] text-slate-600">
                            {arc.range}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ====================================
                  出題対象数
              ==================================== */}
              <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    出題対象
                  </span>

                  <span className="text-lg font-black text-sky-700">
                    {gameCharacters.length}
                    <span className="text-xs ml-1">
                      人
                    </span>
                  </span>
                </div>

                {selectedArcs.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    選択した編に含まれる、キャラクターのみ出題されます。
                  </p>
                )}
              </div>

              {/* ====================================
                  ゲーム開始
              ==================================== */}
              <button
                type="button"
                onClick={startGame}
                disabled={
                  gameCharacters.length === 0
                }
                className="w-full mt-4 rounded-xl bg-sky-500 px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                ゲーム開始
              </button>

              {/* ====================================
                  最高記録
              ==================================== */}
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-emerald-900">
                      最高記録
                    </p>

                    <p className="text-[11px] text-emerald-800 mt-1">
                      {selectedArcLabels.join(' ＋ ')}
                    </p>
                  </div>

                  <span className="text-2xl">
                    🏆
                  </span>
                </div>

                {currentRecord &&
                Number(
                  currentRecord.maxAnswered || 0
                ) > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          最大回答数
                        </span>

                        <span className="text-lg font-black text-emerald-700">
                          {currentRecord.maxAnswered}
                          <span className="text-xs ml-1">
                            人
                          </span>
                        </span>
                      </div>

                      {currentRecord.maxAnsweredTime !==
                        null &&
                        currentRecord.maxAnsweredTime !==
                          undefined && (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-bold text-slate-600">
                              その時のタイム
                            </span>

                            <span className="font-mono text-sm font-black">
                              {formatTime(
                                currentRecord.maxAnsweredTime
                              )}
                            </span>
                          </div>
                        )}
                    </div>

                    {currentRecord.clearTime !==
                      null &&
                      currentRecord.clearTime !==
                        undefined && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-800">
                              完全クリア
                            </span>

                            <span className="font-mono text-sm font-black text-amber-900">
                              {formatTime(
                                currentRecord.clearTime
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-3 text-center">
                    <p className="text-xs font-bold text-slate-500">
                      まだ記録がありません
                    </p>

                    <p className="text-[10px] text-slate-400 mt-1">
                      ゲームをプレイすると最高記録が保存されます。
                    </p>
                  </div>
                )}
              </div>

              {/* ====================================
                  保存されたゲーム
              ==================================== */}
              {savedSession &&
                savedSession.gameStarted &&
                !savedSession.gameFinished &&
                !savedSession.gaveUp && (
                  <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-amber-900">
                          保存されたゲームがあります
                        </p>

                        <p className="text-[11px] text-amber-800 mt-1">
                          中断したゲームを続きから再開できます。
                        </p>
                      </div>

                      <span className="text-2xl">
                        ▶
                      </span>
                    </div>

                    <div className="mt-3 rounded-lg bg-white/70 border border-amber-200 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          進捗
                        </span>

                        <span className="text-sm font-black text-amber-700">
                          {Array.isArray(
                            savedSession.answeredIds
                          )
                            ? savedSession.answeredIds.length
                            : 0}
                          {' / '}
                          {(() => {
                            const savedArcs =
                              Array.isArray(
                                savedSession.selectedArcs
                              )
                                ? savedSession.selectedArcs
                                : [];

                            if (
                              savedArcs.length ===
                              0
                            ) {
                              return characters.length;
                            }

                            const selected =
                              ARC_OPTIONS.filter(
                                (arc) =>
                                  savedArcs.includes(
                                    arc.id
                                  )
                              );

                            return characters.filter(
                              (character) =>
                                selected.some(
                                  (arc) =>
                                    character.charNo >=
                                      arc.min &&
                                    character.charNo <=
                                      arc.max
                                )
                            ).length;
                          })()}
                          人
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-bold text-slate-600">
                          タイム
                        </span>

                        <span className="font-mono text-sm font-black">
                          {formatTime(
                            Number(
                              savedSession.elapsedSeconds ||
                                0
                            )
                          )}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={
                        resumeSavedGame
                      }
                      className="w-full mt-3 rounded-lg bg-amber-500 px-4 py-3 text-sm font-extrabold text-white hover:bg-amber-600"
                    >
                      保存データから再開する
                    </button>

                    <button
                      type="button"
                      onClick={
                        discardSavedGame
                      }
                      className="w-full mt-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                    >
                      保存データを削除
                    </button>
                  </div>
                )}
            </div>
          </div>

          {/* ====================================
              ルール説明
          ==================================== */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-800 mb-1">
              ルール
            </p>

            <p>
              キャラクター名または関連ワードを入力して回答します。
            </p>

            <p>
              例：「モンキー・D・ルフィ」なら「ルフィ」でも正解になります。
            </p>

            <p className="mt-1">
              「降参」を押すと未回答のキャラクターが赤く表示され、答えが表示されます。
            </p>

            <p>
              「中断」を押すとゲーム状態が保存され、サイトを閉じても続きから再開できます。
            </p>

            <p>
              同じ名前のキャラクターが複数いる場合も、それぞれ別キャラクターとして回答できます。
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // 中断画面
  // ========================================
  if (gamePaused) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl border border-sky-300 bg-white shadow-sm p-8 text-center">
            <p className="text-sm font-bold text-sky-600">
              ONE PIECE キャラクター
            </p>

            <h1 className="mt-2 text-2xl font-black">
              ゲーム中断中
            </h1>

            <div className="mt-6 text-4xl font-mono font-black tracking-wider">
              {formatTime(elapsedSeconds)}
            </div>

            <p className="mt-4 text-sm text-slate-600">
              {currentCount} / {totalCount} 人
            </p>

            <p className="mt-2 text-xs text-slate-500">
              このゲームは保存されています。
              <br />
              サイトを閉じても再開できます。
            </p>

            <button
              type="button"
              onClick={resumeGame}
              className="mt-7 w-full max-w-xs rounded-xl bg-sky-500 px-6 py-4 text-base font-extrabold text-white hover:bg-sky-600"
            >
              再開する
            </button>

            <button
              type="button"
              onClick={backToSettings}
              className="mt-3 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              設定画面に戻る
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // ゲーム画面
  // ========================================
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* ======================================
          上部
      ====================================== */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs sm:text-sm font-extrabold truncate">
              ONE PIECE キャラクター
              <span className="hidden sm:inline">
                脳内読みチャレンジ
              </span>
            </div>

            <div className="font-mono text-lg sm:text-2xl font-black tracking-wide whitespace-nowrap">
              {formatTime(elapsedSeconds)}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-6 mt-1 text-xs sm:text-sm font-bold">
            <span>
              現在
              <span className="text-sky-600 text-base sm:text-lg ml-1">
                {currentCount}
              </span>
              人
            </span>

            <span>
              残り
              <span className="text-sky-600 text-base sm:text-lg ml-1">
                {remainingCount}
              </span>
              人
            </span>
          </div>

          {/* 進捗バー */}
          <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-200"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* ======================================
          回答エリア
      ====================================== */}
      <div className="max-w-6xl mx-auto px-3 py-3">
        <form
          onSubmit={submitAnswer}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={answerInput}
            onChange={(event) =>
              setAnswerInput(
                event.target.value
              )
            }
            disabled={
              gameFinished || gaveUp
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="キャラクター名を入力"
            className="h-10 w-52 sm:w-72 rounded-md border-2 border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-sky-500"
          />

          <button
            type="submit"
            disabled={
              gameFinished || gaveUp
            }
            className="h-10 rounded-md bg-sky-500 px-4 text-sm font-extrabold text-white hover:bg-sky-600 disabled:bg-slate-300"
          >
            回答
          </button>

          <button
            type="button"
            onClick={giveUp}
            disabled={
              gameFinished || gaveUp
            }
            className="h-10 rounded-md bg-red-500 px-4 text-sm font-extrabold text-white hover:bg-red-600 disabled:bg-slate-300"
          >
            降参
          </button>

          <button
            type="button"
            onClick={pauseGame}
            disabled={
              gameFinished || gaveUp
            }
            className="h-10 rounded-md bg-slate-500 px-4 text-sm font-extrabold text-white hover:bg-slate-600 disabled:bg-slate-300"
          >
            中断
          </button>

          {/* 自動スクロール */}
          <button
            type="button"
            onClick={toggleAutoScroll}
            className={`h-10 rounded-md px-3 text-xs font-extrabold ${
              autoScroll
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
          >
            自動スクロール
            {autoScroll ? ' ON' : ' OFF'}
          </button>
        </form>

        {/* メッセージ */}
        <div className="h-7 flex items-center justify-center text-xs font-bold">
          {message &&
            !gameFinished &&
            !gaveUp && (
              <span className="text-sky-600">
                {message}
              </span>
            )}

          {gameFinished && (
            <span className="text-emerald-600">
              全問正解！{' '}
              {formatTime(
                elapsedSeconds
              )}
            </span>
          )}

          {gaveUp && (
            <span className="text-red-600">
              降参しました
            </span>
          )}
        </div>
      </div>

      {/* ======================================
          キャラクター一覧
          この部分だけスクロール
      ====================================== */}
      <div className="max-w-6xl mx-auto px-2 sm:px-3">
        <div className="h-[calc(100vh-205px)] overflow-y-auto pb-8">
          <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
            {gameCharacters.map(
              (character) => {
                const answered =
                  answeredSet.has(
                    character.charNo
                  );

                const showAnswer =
                  gaveUp && !answered;

                const imageMissing =
                  missingImages[
                    character.charNo
                  ];

                return (
                  <div
                    key={character.charNo}
                    ref={(element) => {
                      characterRefs.current[
                        character.charNo
                      ] = element;
                    }}
                    className={`
                      relative
                      aspect-square
                      rounded-md
                      border
                      overflow-hidden
                      flex
                      flex-col
                      items-center
                      justify-center
                      select-none
                      ${
                        showAnswer
                          ? 'border-red-400 bg-red-100'
                          : answered
                            ? 'border-sky-200 bg-white'
                            : 'border-slate-200 bg-slate-100'
                      }
                    `}
                  >
                    {/* ====================================
                        番号
                    ==================================== */}
                    <div
                      className={`
                        absolute
                        top-0.5
                        left-0.5
                        z-10
                        font-mono
                        leading-none
                        ${
                          answered
                            ? 'text-[6px] sm:text-[7px] bg-white/70 px-0.5 rounded'
                            : 'text-[9px] sm:text-[10px]'
                        }
                        ${
                          showAnswer
                            ? 'text-red-700'
                            : answered
                              ? 'text-slate-700'
                              : 'text-slate-500'
                        }
                      `}
                    >
                      {formatNumber(
                        character.charNo
                      )}
                    </div>

                    {/* ====================================
                        未回答
                    ==================================== */}
                    {!answered &&
                      !showAnswer && (
                        <div className="flex-1 w-full flex items-center justify-center pt-2">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full border border-slate-200 bg-slate-200/70" />
                        </div>
                      )}

                    {/* ====================================
                        回答済み画像
                    ==================================== */}
                    {answered &&
                      !imageMissing && (
                        <div className="absolute inset-0">
                          <img
                            src={getImagePath(
                              character.charNo
                            )}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={() =>
                              handleImageError(
                                character.charNo
                              )
                            }
                          />
                        </div>
                      )}

                    {/* ====================================
                        画像なし
                    ==================================== */}
                    {answered &&
                      imageMissing && (
                        <div className="flex-1 w-full flex items-center justify-center pt-3">
                          <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold">
                            画像準備中
                          </span>
                        </div>
                      )}

                    {/* ====================================
                        降参時の答え
                    ==================================== */}
                    {showAnswer && (
                      <div className="flex-1 w-full flex flex-col items-center justify-center pt-3 px-1">
                        <span className="text-[10px] sm:text-xs font-black text-red-800 text-center leading-tight break-words">
                          {character.name}
                        </span>

                        {character.relatedWord &&
                          normalizeAnswer(
                            character.relatedWord
                          ) !==
                            normalizeAnswer(
                              character.name
                            ) && (
                            <span className="mt-0.5 text-[8px] sm:text-[9px] text-red-600 text-center leading-tight">
                              {
                                character.relatedWord
                              }
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* ====================================
            終了
        ==================================== */}
        {(gameFinished ||
          gaveUp) && (
          <div className="mt-6 mb-8 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-center">
            <p className="text-xs font-bold text-sky-700">
              {gameFinished
                ? 'COMPLETE!'
                : 'GAME SET!'}
            </p>

            <p className="mt-1 text-3xl font-mono font-black">
              {formatTime(
                elapsedSeconds
              )}
            </p>

            <p className="mt-2 text-sm font-bold">
              {currentCount} / {totalCount}{' '}
              人
            </p>

            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={startGame}
                className="rounded-lg bg-sky-500 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-600"
              >
                もう一度挑戦
              </button>

              <button
                type="button"
                onClick={backToSettings}
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
              >
                範囲を変更
              </button>

              <Link
                href="/solo"
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
              >
                ソロメニュー
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
