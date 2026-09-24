// file: app/solo/character-image-quiz/page.js
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/* =========================================================
   基本設定
========================================================= */

const BEST_KEY = 'characterImageQuizBestScore';

const TOTAL_ROUNDS = 5;
const MAX_SCORE = 100;

/*
 * 通常モード・対戦モード共通
 *
 * 「回答」を押してから回答できる時間
 */
const ANSWER_LIMIT_SECONDS = 15;

/*
 * 対戦モード
 */
const BATTLE_MAX_PLAYERS = 4;
const BATTLE_DEFAULT_POINTS = 300;
const BATTLE_MAX_LOSS_PER_TURN = 100;

/*
 * ゲーム開始後、この時間までは
 * 100点・画像変化なし。
 */
const INITIAL_HOLD_MS = 5000;

/*
 * 点数の減少間隔
 *
 * 500 = 0.5秒ごとに1点減少
 */
const SCORE_DECAY_MS = 500;

/*
 * ドアップの画像変化速度
 */
const ZOOM_PROGRESS_MS = 250;

/*
 * モザイクの画像変化速度
 */
const MOSAIC_PROGRESS_MS = 800;

/*
 * 不正解1回あたりの減点
 */
const WRONG_ANSWER_PENALTY = 10;

/*
 * パズルのピースが1個増える間隔
 */
const PUZZLE_PIECE_MS = 900;

/*
 * バラバラクイズの分割数が
 * 1段階減る間隔
 */
const SHUFFLE_STEP_MS = 800;

/*
 * バラバラクイズ開始時の分割数
 */
const SHUFFLE_START_PIECES = 150;

/*
 * バラバラクイズの最低分割数
 */
const SHUFFLE_MIN_PIECES = 1;

/*
 * アニメーション更新間隔
 */
const MOTION_TICK_MS = 30;

/*
 * スポットライト速度
 */
const SPOTLIGHT_SPEED = 0.085;


/* =========================================================
   ゲーム形式
========================================================= */

const GAME_TYPES = [
  {
    id: 'zoom',
    name: 'ドアップクイズ',
  },
  {
    id: 'mosaic',
    name: 'モザイククイズ',
  },
  {
    id: 'shuffle',
    name: 'バラバラクイズ',
  },
  {
    id: 'puzzle',
    name: 'パズルクイズ',
  },
  {
    id: 'spotlight',
    name: 'スポットライトクイズ',
  },
];


/* =========================================================
   共通関数
========================================================= */

function shuffleArray(source) {
  const array = [...source];

  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[〜～〰〰︎]/g, 'ー')
    .replace(/[-‐-‒–—―ー]/g, 'ー')
    .trim()
    .toLowerCase()
    .replace(
      /[ァ-ン]/g,
      (ch) =>
        String.fromCharCode(
          ch.charCodeAt(0) - 0x60,
        ),
    );
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);

    image.onerror = () =>
      reject(
        new Error(
          `画像を読み込めませんでした: ${url}`,
        ),
      );

    image.src = url;
  });
}

function getImagePath(charNo) {
  return `/character/${String(charNo).padStart(4, '0')}.png`;
}


/* =========================================================
   画像描画
========================================================= */

function drawContain(ctx, image, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;

  if (sourceRatio > targetRatio) {
    drawHeight = width / sourceRatio;
  } else {
    drawWidth = height * sourceRatio;
  }

  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  ctx.drawImage(
    image,
    x,
    y,
    drawWidth,
    drawHeight,
  );
}


/* =========================================================
   ドアップ
========================================================= */

function drawZoom(ctx, image, width, height, progress) {
  const zoom = 16 - progress * 15;

  const sourceW = image.width / zoom;
  const sourceH = image.height / zoom;

  const maxX = Math.max(
    0,
    image.width - sourceW,
  );

  const maxY = Math.max(
    0,
    image.height - sourceH,
  );

  const centerX =
    image._quizCenterX ??
    image.width / 2;

  const centerY =
    image._quizCenterY ??
    image.height / 2;

  const sx = Math.min(
    maxX,
    Math.max(
      0,
      centerX - sourceW / 2,
    ),
  );

  const sy = Math.min(
    maxY,
    Math.max(
      0,
      centerY - sourceH / 2,
    ),
  );

  ctx.fillStyle = '#000';

  ctx.fillRect(
    0,
    0,
    width,
    height,
  );

  ctx.drawImage(
    image,
    sx,
    sy,
    sourceW,
    sourceH,
    0,
    0,
    width,
    height,
  );
}


/* =========================================================
   モザイク
========================================================= */

function drawMosaic(
  ctx,
  image,
  width,
  height,
  progress,
) {
  /*
   * smoothstepで進行を滑らかにする。
   *
   * 単純な progress では序盤から急激に
   * 見えてしまうため、緩急をつける。
   */
  const eased =
    progress *
    progress *
    (3 - 2 * progress);

  const small = Math.max(
    3,
    Math.round(
      3 + eased * 147,
    ),
  );

  const temp = document.createElement(
    'canvas',
  );

  temp.width = small;
  temp.height = small;

  const tempCtx = temp.getContext('2d');

  if (!tempCtx) {
    return;
  }

  tempCtx.imageSmoothingEnabled = true;

  drawContain(
    tempCtx,
    image,
    small,
    small,
  );

  ctx.fillStyle = '#000';

  ctx.fillRect(
    0,
    0,
    width,
    height,
  );

  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    temp,
    0,
    0,
    small,
    small,
    0,
    0,
    width,
    height,
  );

  ctx.imageSmoothingEnabled = true;
}


/* =========================================================
   バラバラ
========================================================= */

function createShuffleSteps() {
  const steps = [];

  let current = SHUFFLE_START_PIECES;

  while (current > 50) {
    steps.push(current);
    current -= 10;
  }

  while (current > 10) {
    steps.push(current);
    current -= 5;
  }

  while (current > SHUFFLE_MIN_PIECES) {
    steps.push(current);
    current -= 1;
  }

  steps.push(SHUFFLE_MIN_PIECES);

  return [...new Set(steps)];
}

const SHUFFLE_STEPS = createShuffleSteps();

function getGridForPieces(pieces) {
  if (pieces <= 1) {
    return {
      rows: 1,
      cols: 1,
    };
  }

  let bestRows = 1;
  let bestCols = pieces;

  let bestDiff = Math.abs(
    bestCols - bestRows,
  );

  for (
    let rows = 1;
    rows <= Math.ceil(Math.sqrt(pieces));
    rows += 1
  ) {
    const cols = Math.ceil(
      pieces / rows,
    );

    const diff = Math.abs(
      cols - rows,
    );

    if (diff < bestDiff) {
      bestRows = rows;
      bestCols = cols;
      bestDiff = diff;
    }
  }

  return {
    rows: bestRows,
    cols: bestCols,
  };
}

function createShufflePieces(pieces) {
  const list = Array.from(
    {
      length: pieces,
    },
    (_, index) => ({
      sourceIndex: index,

      rotation:
        Math.floor(
          Math.random() * 4,
        ) * 90,

      offsetX:
        -0.15 +
        Math.random() * 0.3,

      offsetY:
        -0.15 +
        Math.random() * 0.3,
    }),
  );

  return shuffleArray(list);
}

function drawShuffle(
  ctx,
  image,
  width,
  height,
  shuffleData,
) {
  if (!shuffleData) {
    drawContain(
      ctx,
      image,
      width,
      height,
    );

    return;
  }

  const pieces = shuffleData.pieces;

  const {
    rows,
    cols,
  } = getGridForPieces(
    pieces.length,
  );

  ctx.fillStyle = '#111';

  ctx.fillRect(
    0,
    0,
    width,
    height,
  );

  const tileW = width / cols;
  const tileH = height / rows;

  const sourceW = image.width / cols;
  const sourceH = image.height / rows;

  for (
    let targetIndex = 0;
    targetIndex < pieces.length;
    targetIndex += 1
  ) {
    const piece = pieces[targetIndex];

    const targetRow = Math.floor(
      targetIndex / cols,
    );

    const targetCol =
      targetIndex % cols;

    const sourceIndex =
      piece.sourceIndex;

    const sourceRow = Math.floor(
      sourceIndex / cols,
    );

    const sourceCol =
      sourceIndex % cols;

    const x =
      targetCol * tileW +
      piece.offsetX * tileW;

    const y =
      targetRow * tileH +
      piece.offsetY * tileH;

    const centerX =
      x + tileW / 2;

    const centerY =
      y + tileH / 2;

    ctx.save();

    ctx.translate(
      centerX,
      centerY,
    );

    ctx.rotate(
      (piece.rotation * Math.PI) / 180,
    );

    ctx.drawImage(
      image,
      sourceCol * sourceW,
      sourceRow * sourceH,
      sourceW,
      sourceH,
      -tileW / 2,
      -tileH / 2,
      tileW,
      tileH,
    );

    ctx.restore();
  }
}


/* =========================================================
   ジグソーパズル
========================================================= */

function makeJigsawEdges(rows, cols) {
  const horizontal = Array.from(
    {
      length: rows,
    },
    () =>
      Array.from(
        {
          length: cols - 1,
        },
        () =>
          Math.random() > 0.5
            ? 1
            : -1,
      ),
  );

  const vertical = Array.from(
    {
      length: rows - 1,
    },
    () =>
      Array.from(
        {
          length: cols,
        },
        () =>
          Math.random() > 0.5
            ? 1
            : -1,
      ),
  );

  return {
    horizontal,
    vertical,
  };
}

function addHorizontalJigsawEdge(
  ctx,
  x1,
  y,
  x2,
  outward,
  tabSize,
) {
  const width = x2 - x1;

  if (outward === 0) {
    ctx.lineTo(x2, y);
    return;
  }

  const dir = outward;

  const a = x1 + width * 0.28;
  const c = x1 + width * 0.62;
  const d = x1 + width * 0.72;

  ctx.lineTo(a, y);

  ctx.bezierCurveTo(
    a + width * 0.04,
    y,
    a + width * 0.04,
    y - dir * tabSize,
    x1 + width * 0.5,
    y - dir * tabSize,
  );

  ctx.bezierCurveTo(
    c - width * 0.04,
    y - dir * tabSize,
    c - width * 0.04,
    y,
    c,
    y,
  );

  ctx.lineTo(d, y);
  ctx.lineTo(x2, y);
}

function addVerticalJigsawEdge(
  ctx,
  x,
  y1,
  y2,
  outward,
  tabSize,
) {
  const height = y2 - y1;

  if (outward === 0) {
    ctx.lineTo(x, y2);
    return;
  }

  const dir = outward;

  const a = y1 + height * 0.28;
  const c = y1 + height * 0.62;
  const d = y1 + height * 0.72;

  ctx.lineTo(x, a);

  ctx.bezierCurveTo(
    x,
    a + height * 0.04,
    x + dir * tabSize,
    a + height * 0.04,
    x + dir * tabSize,
    y1 + height * 0.5,
  );

  ctx.bezierCurveTo(
    x + dir * tabSize,
    c - height * 0.04,
    x,
    c - height * 0.04,
    x,
    c,
  );

  ctx.lineTo(x, d);
  ctx.lineTo(x, y2);
}

function createJigsawPath(
  ctx,
  x,
  y,
  width,
  height,
  row,
  col,
  rows,
  cols,
  edges,
  tabSize,
) {
  const top =
    row === 0
      ? 0
      : -edges.vertical[row - 1][col];

  const right =
    col === cols - 1
      ? 0
      : edges.horizontal[row][col];

  const bottom =
    row === rows - 1
      ? 0
      : edges.vertical[row][col];

  const left =
    col === 0
      ? 0
      : -edges.horizontal[row][col - 1];

  ctx.beginPath();

  ctx.moveTo(x, y);

  addHorizontalJigsawEdge(
    ctx,
    x,
    y,
    x + width,
    top,
    tabSize,
  );

  addVerticalJigsawEdge(
    ctx,
    x + width,
    y,
    y + height,
    right,
    tabSize,
  );

  if (bottom === 0) {
    ctx.lineTo(
      x,
      y + height,
    );
  } else {
    const dir = -bottom;

    const start = x + width;

    const a = start - width * 0.28;
    const c = start - width * 0.62;
    const d = start - width * 0.72;

    ctx.lineTo(
      a,
      y + height,
    );

    ctx.bezierCurveTo(
      a - width * 0.04,
      y + height,
      a - width * 0.04,
      y + height - dir * tabSize,
      x + width * 0.5,
      y + height - dir * tabSize,
    );

    ctx.bezierCurveTo(
      c + width * 0.04,
      y + height - dir * tabSize,
      c + width * 0.04,
      y + height,
      c,
      y + height,
    );

    ctx.lineTo(
      d,
      y + height,
    );

    ctx.lineTo(
      x,
      y + height,
    );
  }

  if (left === 0) {
    ctx.lineTo(x, y);
  } else {
    const dir = -left;

    const a = y + height * 0.72;
    const c = y + height * 0.38;
    const d = y + height * 0.28;

    ctx.bezierCurveTo(
      x,
      a,
      x + dir * tabSize,
      a,
      x + dir * tabSize,
      y + height * 0.5,
    );

    ctx.bezierCurveTo(
      x + dir * tabSize,
      c,
      x,
      c,
      x,
      d,
    );

    ctx.lineTo(x, y);
  }

  ctx.closePath();
}

function drawPuzzle(
  ctx,
  image,
  width,
  height,
  revealed,
  size,
  edges,
) {
  ctx.fillStyle = '#111';

  ctx.fillRect(
    0,
    0,
    width,
    height,
  );

  const tileW = width / size;
  const tileH = height / size;

  const sourceW = image.width / size;
  const sourceH = image.height / size;

  const tabSize =
    Math.min(tileW, tileH) * 0.17;

  for (const index of revealed) {
    const row = Math.floor(
      index / size,
    );

    const col = index % size;

    const x = col * tileW;
    const y = row * tileH;

    ctx.save();

    createJigsawPath(
      ctx,
      x,
      y,
      tileW,
      tileH,
      row,
      col,
      size,
      size,
      edges,
      tabSize,
    );

    ctx.clip();

    const overlapX = sourceW * 0.18;
    const overlapY = sourceH * 0.18;

    const sx = Math.max(
      0,
      col * sourceW - overlapX,
    );

    const sy = Math.max(
      0,
      row * sourceH - overlapY,
    );

    const ex = Math.min(
      image.width,
      (col + 1) * sourceW + overlapX,
    );

    const ey = Math.min(
      image.height,
      (row + 1) * sourceH + overlapY,
    );

    const sw = ex - sx;
    const sh = ey - sy;

    const dx =
      (sx / image.width) * width;

    const dy =
      (sy / image.height) * height;

    const dw =
      (sw / image.width) * width;

    const dh =
      (sh / image.height) * height;

    ctx.drawImage(
      image,
      sx,
      sy,
      sw,
      sh,
      dx,
      dy,
      dw,
      dh,
    );

    ctx.restore();
  }
}


/* =========================================================
   スポットライト
========================================================= */

function drawSpotlight(
  ctx,
  image,
  width,
  height,
  progress,
  state,
) {
  ctx.fillStyle = '#000';

  ctx.fillRect(
    0,
    0,
    width,
    height,
  );

  const radius =
    6 +
    progress *
      Math.min(
        width,
        height,
      ) *
      0.48;

  const phase =
    state.spotlightPhase ?? 0;

  const x =
    width / 2 +
    Math.sin(phase) *
      width *
      0.43;

  const y =
    height / 2 +
    Math.sin(phase * 1.35) *
      height *
      0.42;

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI * 2,
  );

  ctx.clip();

  drawContain(
    ctx,
    image,
    width,
    height,
  );

  ctx.restore();
}


/* =========================================================
   Canvas
========================================================= */

function drawGameCanvas(
  canvas,
  image,
  type,
  visualProgress,
  state,
  hidden,
  showSolution,
) {
  if (
    !canvas ||
    !image ||
    !type
  ) {
    return;
  }

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  const width =
    Math.max(
      1,
      Math.round(rect.width * dpr),
    );

  const height =
    Math.max(
      1,
      Math.round(rect.height * dpr),
    );

  if (
    canvas.width !== width ||
    canvas.height !== height
  ) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  ctx.save();

  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(
    0,
    0,
    w,
    h,
  );

  if (hidden) {
    ctx.fillStyle = '#050505';

    ctx.fillRect(
      0,
      0,
      w,
      h,
    );

    ctx.restore();

    return;
  }

  if (showSolution) {
    ctx.fillStyle = '#000';

    ctx.fillRect(
      0,
      0,
      w,
      h,
    );

    drawContain(
      ctx,
      image,
      w,
      h,
    );

    ctx.restore();

    return;
  }

  if (type === 'zoom') {
    drawZoom(
      ctx,
      image,
      w,
      h,
      visualProgress,
    );
  } else if (type === 'mosaic') {
    drawMosaic(
      ctx,
      image,
      w,
      h,
      visualProgress,
    );
  } else if (type === 'shuffle') {
    drawShuffle(
      ctx,
      image,
      w,
      h,
      state.shuffleData,
    );
  } else if (type === 'puzzle') {
    drawPuzzle(
      ctx,
      image,
      w,
      h,
      state.revealedPieces,
      state.puzzleSize,
      state.puzzleEdges,
    );
  } else if (type === 'spotlight') {
    drawSpotlight(
      ctx,
      image,
      w,
      h,
      visualProgress,
      state,
    );
  }

  ctx.restore();
}


/* =========================================================
   メインコンポーネント
========================================================= */

export default function CharacterImageQuizPage() {
  const canvasRef = useRef(null);

  const timerRef = useRef(null);

  const answerTimerRef = useRef(null);

  const transitionTimerRef =
    useRef(null);

  const scoreElapsedRef =
    useRef(0);

  const visualElapsedRef =
    useRef(0);

  const puzzleElapsedRef =
    useRef(0);

  const shuffleElapsedRef =
    useRef(0);

  const visualProgressRef =
    useRef(0);

  const answerSnapshotRef =
    useRef(null);

  /*
   * 画面
   *
   * menu
   * normal
   * normalResult
   * battleSetup
   * battleReady
   * battlePlay
   * battleResult
   */
  const [screen, setScreen] =
    useState('menu');

  /* =======================================================
     通常モード
  ======================================================= */

  const [characters, setCharacters] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadingError, setLoadingError] =
    useState('');

  const [roundIndex, setRoundIndex] =
    useState(0);

  const [gameOrder, setGameOrder] =
    useState([]);

  const [currentCharacter, setCurrentCharacter] =
    useState(null);

  const [currentImage, setCurrentImage] =
    useState(null);

  const [score, setScore] =
    useState(MAX_SCORE);

  const [visualProgress, setVisualProgress] =
    useState(0);

  const [totalScore, setTotalScore] =
    useState(0);

  const [roundFinished, setRoundFinished] =
    useState(false);

  const [finalScore, setFinalScore] =
    useState(null);

  const [roundCharacters, setRoundCharacters] =
    useState([]);

  const [roundResults, setRoundResults] =
    useState([]);

  /* =======================================================
     共通回答状態
  ======================================================= */

  const [answerMode, setAnswerMode] =
    useState(false);

  const [answer, setAnswer] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [solutionVisible, setSolutionVisible] =
    useState(false);

  const [answerTimeLeft, setAnswerTimeLeft] =
    useState(ANSWER_LIMIT_SECONDS);

  /* =======================================================
     ゲーム内部状態
  ======================================================= */

  const [gameState, setGameState] =
    useState({
      shuffleData: null,

      puzzleSize: 10,

      puzzleEdges:
        makeJigsawEdges(10, 10),

      revealedPieces:
        new Set(),

      puzzleRevealOrder: [],

      spotlightPhase: 0,
    });

  const currentType =
    gameOrder[
      roundIndex
    ]?.id ?? null;

  /* =======================================================
     対戦モード設定
  ======================================================= */

  const [battleSetupPlayers, setBattleSetupPlayers] =
    useState(
      Array.from(
        {
          length: BATTLE_MAX_PLAYERS,
        },
        (_, index) => ({
          id: index,
          name: '',
          points: String(
            BATTLE_DEFAULT_POINTS,
          ),
        }),
      ),
    );

  const [battleSelectedTypes, setBattleSelectedTypes] =
    useState(
      GAME_TYPES.map(
        (game) => game.id,
      ),
    );

  const [battleSetupError, setBattleSetupError] =
    useState('');

  /* =======================================================
     対戦モード進行
  ======================================================= */

  const [battlePlayers, setBattlePlayers] =
    useState([]);

  const battlePlayersRef =
    useRef([]);

  const [battleCurrentIndex, setBattleCurrentIndex] =
    useState(0);

  const battleCurrentIndexRef =
    useRef(0);

  const [battleTurnType, setBattleTurnType] =
    useState(null);

const [battleRoundNumber, setBattleRoundNumber] =
  useState(1);

const battleRoundNumberRef =
  useRef(1);

const [battleRoundType, setBattleRoundType] =
  useState(null);

const battleRoundTypeRef =
  useRef(null);

const battleRoundRemainingRef =
  useRef(new Set());

  const [battleTurnLoss, setBattleTurnLoss] =
    useState(0);

  const battleTurnLossRef =
    useRef(0);

  const [battleTurnNumber, setBattleTurnNumber] =
    useState(1);

  const [battleWinner, setBattleWinner] =
    useState(null);

  useEffect(() => {
    battlePlayersRef.current =
      battlePlayers;
  }, [battlePlayers]);

  useEffect(() => {
    battleCurrentIndexRef.current =
      battleCurrentIndex;
  }, [battleCurrentIndex]);


  /* =======================================================
     タイマー停止
  ======================================================= */

  const stopTimers =
    useCallback(() => {
      if (timerRef.current) {
        clearInterval(
          timerRef.current,
        );

        timerRef.current = null;
      }
    }, []);


  /* =======================================================
     回答タイマー停止
  ======================================================= */

  const stopAnswerTimer =
    useCallback(() => {
      if (
        answerTimerRef.current
      ) {
        clearInterval(
          answerTimerRef.current,
        );

        answerTimerRef.current =
          null;
      }
    }, []);


  /* =======================================================
     遷移タイマー停止
  ======================================================= */

  const stopTransitionTimer =
    useCallback(() => {
      if (
        transitionTimerRef.current
      ) {
        clearTimeout(
          transitionTimerRef.current,
        );

        transitionTimerRef.current =
          null;
      }
    }, []);


  /* =======================================================
     Canvas描画
  ======================================================= */

  const draw =
    useCallback(() => {
      if (
        !canvasRef.current ||
        !currentImage
      ) {
        return;
      }

      const activeType =
        screen === 'battlePlay'
          ? battleTurnType
          : currentType;

      if (!activeType) {
        return;
      }

      drawGameCanvas(
        canvasRef.current,
        currentImage,
        activeType,
        visualProgress,
        gameState,
        answerMode,
        solutionVisible,
      );
    }, [
      currentImage,
      currentType,
      battleTurnType,
      screen,
      visualProgress,
      gameState,
      answerMode,
      solutionVisible,
    ]);

  useEffect(() => {
    draw();

    const canvas =
      canvasRef.current;

    if (
      !canvas ||
      typeof ResizeObserver ===
        'undefined'
    ) {
      return undefined;
    }

    const observer =
      new ResizeObserver(
        () => draw(),
      );

    observer.observe(canvas);

    return () =>
      observer.disconnect();
  }, [draw]);


  /* =======================================================
     キャラクター読み込み
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      try {
        setLoading(true);
        setLoadingError('');

        const response =
          await fetch(
            '/api/character-ierukana',
            {
              cache: 'no-store',
            },
          );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error ||
              'キャラクターデータを取得できませんでした。',
          );
        }

        const list =
          Array.isArray(
            data.characters,
          )
            ? data.characters
            : [];

        if (
          list.length <
          TOTAL_ROUNDS
        ) {
          throw new Error(
            'ゲームに必要なキャラクター数が足りません。',
          );
        }

        if (!cancelled) {
          setCharacters(list);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);

          setLoadingError(
            error instanceof Error
              ? error.message
              : '読み込みに失敗しました。',
          );
        }
      }
    }

    loadCharacters();

    return () => {
      cancelled = true;
    };
  }, []);


  /* =======================================================
     ラウンド準備
  ======================================================= */

  const prepareRound =
    useCallback(
      async (
        type,
        character,
      ) => {
        stopTimers();

        scoreElapsedRef.current = 0;
        visualElapsedRef.current = 0;
        puzzleElapsedRef.current = 0;
        shuffleElapsedRef.current = 0;
        visualProgressRef.current = 0;

        const image =
          await loadImage(
            getImagePath(
              character.charNo,
            ),
          );

        /*
         * ドアップの中心。
         */
        image._quizCenterX =
          image.width *
          (0.3 + Math.random() * 0.4);

        image._quizCenterY =
          image.height *
          (0.3 + Math.random() * 0.4);

        /*
         * パズル
         */
        const puzzleSize = 10;

        const puzzleTotal =
          puzzleSize * puzzleSize;

        const puzzleRevealOrder =
          shuffleArray(
            Array.from(
              {
                length: puzzleTotal,
              },
              (_, index) => index,
            ),
          );

        /*
         * 最初の1ピースだけ表示
         */
        const firstPiece =
          puzzleRevealOrder[0];

        /*
         * バラバラ
         */
        const initialShuffle =
          createShufflePieces(
            SHUFFLE_START_PIECES,
          );

        setCurrentImage(image);
        setCurrentCharacter(character);

        setScore(MAX_SCORE);
        setVisualProgress(0);

        setAnswerMode(false);
        setAnswer('');
        setAnswerTimeLeft(
          ANSWER_LIMIT_SECONDS,
        );

        setMessage('');
        setRoundFinished(false);
        setSolutionVisible(false);

        answerSnapshotRef.current =
          null;

        setGameState({
          shuffleData: {
            pieces: initialShuffle,
            stepIndex: 0,
          },

          puzzleSize,

          puzzleEdges:
            makeJigsawEdges(
              puzzleSize,
              puzzleSize,
            ),

          revealedPieces:
            new Set([
              firstPiece,
            ]),

          puzzleRevealOrder,

          spotlightPhase: 0,
        });

        return image;
      },
      [stopTimers],
    );


  /* =======================================================
     対戦ターンを次へ
  ======================================================= */

  
const advanceBattleTurn =
  useCallback(() => {
    stopTimers();
    stopAnswerTimer();

    const players =
      battlePlayersRef.current;

    const activePlayers =
      players.filter(
        (player) =>
          !player.eliminated &&
          player.points > 0,
      );

    /*
     * =====================================================
     * 現在の周で、まだプレイしていない
     * 生存プレイヤーを探す
     *
     * 「1周」は全員が1回ずつプレイするまで。
     * 誰かが脱落しても、その周は終わらない。
     * =====================================================
     */

    const remainingIds =
      battleRoundRemainingRef.current;

    const currentIndex =
      battleCurrentIndexRef.current;

    let nextIndex = -1;

    for (
      let step = 1;
      step <= players.length;
      step += 1
    ) {
      const index =
        (currentIndex + step) %
        players.length;

      const player =
        players[index];

      if (
        player &&
        !player.eliminated &&
        player.points > 0 &&
        remainingIds.has(player.id)
      ) {
        nextIndex = index;
        break;
      }
    }

    /*
     * =====================================================
     * まだ同じ周でプレイしていない人がいる
     *
     * → 同じゲーム形式のまま続行
     * =====================================================
     */

    if (nextIndex >= 0) {
      battleCurrentIndexRef.current =
        nextIndex;

      setBattleCurrentIndex(
        nextIndex,
      );

      battleTurnLossRef.current = 0;

      setBattleTurnLoss(0);

      /*
       * 重要：
       * ここではゲーム形式を変更しない。
       *
       * battleRoundType が、
       * この周で全員共通の形式。
       */
      setBattleTurnType(
        battleRoundTypeRef.current,
      );

      setCurrentImage(null);
      setCurrentCharacter(null);

      setAnswer('');
      setAnswerMode(false);

      setAnswerTimeLeft(
        ANSWER_LIMIT_SECONDS,
      );

      setSolutionVisible(false);
      setRoundFinished(false);

      setMessage(
        `${players[nextIndex].name}さんの番です。`,
      );

      setBattleTurnNumber(
        (previous) =>
          previous + 1,
      );

      setScreen('battleReady');

      return;
    }

    /*
     * =====================================================
     * ここまで来たら現在の周が終了
     *
     * ここで初めて、
     * 「この周の生存者が何人いるか」を確認する。
     * =====================================================
     */

    const aliveAfterRound =
      players.filter(
        (player) =>
          !player.eliminated &&
          player.points > 0,
      );

    /*
     * =====================================================
     * 周終了時点で1人以下ならゲーム終了
     *
     * 途中で1人になっても、
     * その周の最後のプレイヤーが終わるまでは
     * ここには来ない。
     * =====================================================
     */

    if (
      aliveAfterRound.length <= 1
    ) {
      const winner =
        aliveAfterRound[0] || null;

      /*
       * 順位計算
       *
       * winner = 1位
       *
       * それ以外は、
       * 脱落した周が遅いほど上位。
       *
       * 同じ周に脱落した人は同順位。
       */
      const rankedPlayers =
  players.map(
    (player) => {
      /*
       * 最後まで生存したプレイヤー
       * → 1位
       */
      if (
        winner &&
        player.id === winner.id
      ) {
        return {
          ...player,
          rank: 1,
        };
      }

      const eliminationRound =
        player.eliminationRound;

      /*
       * 自分より後の周まで生き残った
       * 脱落者の人数を数える。
       *
       * 例：
       *
       * 1周目脱落：1人
       * 2周目脱落：2人
       * 最後まで生存：1人
       *
       * 2周目脱落者
       * → 後に脱落した人は0人
       * → 2位
       *
       * 1周目脱落者
       * → 2周目に脱落した2人がいる
       * → 4位
       */
      const laterEliminatedCount =
        players.filter(
          (other) =>
            other.eliminationRound !=
              null &&
            other.eliminationRound >
              eliminationRound,
        ).length;

      return {
        ...player,
        rank:
          2 +
          laterEliminatedCount,
      };
    },
  );

      battlePlayersRef.current =
        rankedPlayers;

      setBattlePlayers(
        rankedPlayers,
      );

      setBattleWinner(
        winner
          ? rankedPlayers.find(
              (player) =>
                player.id ===
                winner.id,
            )
          : null,
      );

      setBattleTurnType(null);

      setCurrentImage(null);
      setCurrentCharacter(null);

      setAnswerMode(false);
      setSolutionVisible(false);

      setScreen('battleResult');

      return;
    }

    /*
     * =====================================================
     * 現在の周が終了し、
     * まだ2人以上生きている
     *
     * → 次の周へ
     * → ここでゲーム形式を再抽選
     * =====================================================
     */

    const nextRound =
      battleRoundNumberRef.current + 1;

    battleRoundNumberRef.current =
      nextRound;

    setBattleRoundNumber(
      nextRound,
    );

    /*
     * 選択されている形式だけから
     * 次の周の形式を1回だけ抽選する。
     */
    const availableTypes =
      GAME_TYPES.filter(
        (game) =>
          battleSelectedTypes.includes(
            game.id,
          ),
      );

    const selectedType =
      availableTypes[
        Math.floor(
          Math.random() *
            availableTypes.length,
        )
      ];

    battleRoundTypeRef.current =
      selectedType.id;

    setBattleRoundType(
      selectedType.id,
    );

    /*
     * 次の周は、
     * 現在生存している全員が対象。
     */
    battleRoundRemainingRef.current =
      new Set(
        aliveAfterRound.map(
          (player) =>
            player.id,
        ),
      );

    /*
     * 次の周の最初は、
     * プレイヤー番号が一番小さい生存者。
     *
     * 例：
     * P1脱落 → P2から開始
     * P1・P2脱落 → P3から開始
     */
    const firstAlive =
      aliveAfterRound.reduce(
        (lowest, player) =>
          !lowest ||
          player.id < lowest.id
            ? player
            : lowest,
        null,
      );

    if (!firstAlive) {
      return;
    }

    const firstIndex =
      players.findIndex(
        (player) =>
          player.id ===
          firstAlive.id,
      );

    battleCurrentIndexRef.current =
      firstIndex;

    setBattleCurrentIndex(
      firstIndex,
    );

    battleTurnLossRef.current = 0;

    setBattleTurnLoss(0);

    setBattleTurnType(
      selectedType.id,
    );

    setCurrentImage(null);
    setCurrentCharacter(null);

    setAnswer('');
    setAnswerMode(false);

    setAnswerTimeLeft(
      ANSWER_LIMIT_SECONDS,
    );

    setSolutionVisible(false);
    setRoundFinished(false);

    setMessage(
      `${nextRound}周目開始！ ${firstAlive.name}さんの番です。`,
    );

    setBattleTurnNumber(
      (previous) =>
        previous + 1,
    );

    setScreen('battleReady');
  }, [
    stopTimers,
    stopAnswerTimer,
    battleSelectedTypes,
  ]);

  /* =======================================================
     対戦ターン終了
  ======================================================= */

  const finishBattleTurn =
    useCallback(
      (
        reason,
        customMessage = '',
      ) => {
        stopTimers();
        stopAnswerTimer();

        setAnswerMode(false);
        setRoundFinished(true);

        if (
          reason === 'correct'
        ) {
          setSolutionVisible(false);

          setMessage(
            customMessage ||
              '正解！',
          );
        } else {
          setSolutionVisible(true);

          setMessage(
            customMessage ||
              (
                currentCharacter
                  ? `正解は「${currentCharacter.name}」`
                  : '時間切れ！'
              ),
          );
        }

        const delay =
          reason === 'correct'
            ? 900
            : 1800;

        stopTransitionTimer();

        transitionTimerRef.current =
          setTimeout(() => {
            transitionTimerRef.current =
              null;

            advanceBattleTurn();
          }, delay);
      },
      [
        stopTimers,
        stopAnswerTimer,
        stopTransitionTimer,
        advanceBattleTurn,
        currentCharacter,
      ],
    );


  /* =======================================================
     ゲームタイマー
  ======================================================= */

  const startTimers =
    useCallback(
      (
        type,
        isBattle = false,
      ) => {
        stopTimers();

        const imageProgressMs =
          type === 'zoom'
            ? ZOOM_PROGRESS_MS
            : type === 'mosaic'
              ? MOSAIC_PROGRESS_MS
              : 500;

        timerRef.current =
          setInterval(() => {
            /*
             * ---------------------------------------------
             * 画像の時間
             * ---------------------------------------------
             */

            visualElapsedRef.current +=
              MOTION_TICK_MS;

            if (
              visualElapsedRef.current <=
              INITIAL_HOLD_MS
            ) {
              return;
            }

            const motionTime =
              visualElapsedRef.current -
              INITIAL_HOLD_MS;

            /*
             * ドアップ・モザイク・スポットライト
             */
            if (
              type === 'zoom' ||
              type === 'mosaic' ||
              type === 'spotlight'
            ) {
              const nextProgress =
                Math.min(
                  1,
                  motionTime /
                    Math.max(
                      1,
                      imageProgressMs *
                        MAX_SCORE,
                    ),
                );

              visualProgressRef.current =
                nextProgress;

              setVisualProgress(
                nextProgress,
              );
            }

            /*
             * スポットライト
             */
            if (
              type === 'spotlight'
            ) {
              setGameState(
                (old) => ({
                  ...old,
                  spotlightPhase:
                    old.spotlightPhase +
                    SPOTLIGHT_SPEED,
                }),
              );
            }

            /*
             * ---------------------------------------------
             * バラバラ
             * ---------------------------------------------
             */

            if (
              type === 'shuffle'
            ) {
              shuffleElapsedRef.current +=
                MOTION_TICK_MS;

              if (
                shuffleElapsedRef.current >=
                SHUFFLE_STEP_MS
              ) {
                shuffleElapsedRef.current -=
                  SHUFFLE_STEP_MS;

                setGameState(
                  (old) => {
                    const data =
                      old.shuffleData;

                    if (!data) {
                      return old;
                    }

                    const nextIndex =
                      data.stepIndex + 1;

                    if (
                      nextIndex >=
                      SHUFFLE_STEPS.length
                    ) {
                      return old;
                    }

                    return {
                      ...old,

                      shuffleData: {
                        pieces:
                          createShufflePieces(
                            SHUFFLE_STEPS[
                              nextIndex
                            ],
                          ),

                        stepIndex:
                          nextIndex,
                      },
                    };
                  },
                );

                const nextProgress =
                  Math.min(
                    1,
                    visualProgressRef.current +
                      1 /
                        Math.max(
                          1,
                          SHUFFLE_STEPS.length -
                            1,
                        ),
                  );

                visualProgressRef.current =
                  nextProgress;

                setVisualProgress(
                  nextProgress,
                );
              }
            }

            /*
             * ---------------------------------------------
             * パズル
             * ---------------------------------------------
             */

            if (
              type === 'puzzle'
            ) {
              puzzleElapsedRef.current +=
                MOTION_TICK_MS;

              if (
                puzzleElapsedRef.current >=
                PUZZLE_PIECE_MS
              ) {
                puzzleElapsedRef.current -=
                  PUZZLE_PIECE_MS;

                setGameState(
                  (old) => {
                    const total =
                      old.puzzleSize *
                      old.puzzleSize;

                    const next =
                      new Set(
                        old.revealedPieces,
                      );

                    const nextIndex =
                      next.size;

                    if (
                      nextIndex >=
                      total
                    ) {
                      return old;
                    }

                    const piece =
                      old
                        .puzzleRevealOrder[
                        nextIndex
                      ];

                    if (
                      piece == null
                    ) {
                      return old;
                    }

                    next.add(piece);

                    return {
                      ...old,
                      revealedPieces:
                        next,
                    };
                  },
                );

                const nextProgress =
                  Math.min(
                    1,
                    visualProgressRef.current +
                      1 / 99,
                  );

                visualProgressRef.current =
                  nextProgress;

                setVisualProgress(
                  nextProgress,
                );
              }
            }

            /*
             * ---------------------------------------------
             * 点数
             * ---------------------------------------------
             */

            scoreElapsedRef.current +=
              MOTION_TICK_MS;

            if (
              scoreElapsedRef.current <
              SCORE_DECAY_MS
            ) {
              return;
            }

            scoreElapsedRef.current -=
              SCORE_DECAY_MS;

            /*
             * 対戦モード
             */
            if (isBattle) {
              const index =
                battleCurrentIndexRef.current;

              const players =
                battlePlayersRef.current;

              const current =
                players[index];

              if (
                !current ||
                current.eliminated ||
                current.points <= 0
              ) {
                return;
              }

              const nextPoints =
                Math.max(
                  0,
                  current.points - 1,
                );

              const nextLoss =
                battleTurnLossRef.current +
                1;

              battleTurnLossRef.current =
                nextLoss;

              const nextPlayers =
  players.map(
    (player, playerIndex) =>
      playerIndex === index
        ? {
            ...player,
            points:
              nextPoints,
            eliminated:
              nextPoints <= 0,

            eliminationRound:
              nextPoints <= 0
                ? battleRoundNumberRef.current
                : player.eliminationRound,
          }
        : player,
  );

              battlePlayersRef.current =
                nextPlayers;

              setBattlePlayers(
                nextPlayers,
              );

              /*
               * 0点
               */
              if (
                nextPoints <= 0
              ) {
                finishBattleTurn(
                  'eliminated',
                  `0点！ ${current.name}さんは脱落です。正解は「${
                    currentCharacter?.name || ''
                  }」`,
                );

                return;
              }

              /*
               * 1ターン100点減点
               */
              if (
                nextLoss >=
                BATTLE_MAX_LOSS_PER_TURN
              ) {
                finishBattleTurn(
                  'maxLoss',
                  `このターンの減点上限 -${BATTLE_MAX_LOSS_PER_TURN}点。正解は「${
                    currentCharacter?.name || ''
                  }」`,
                );
              }

              return;
            }

            /*
             * 通常モード
             */
            setScore(
              (previous) =>
                Math.max(
                  0,
                  previous - 1,
                ),
            );
          },
          MOTION_TICK_MS,
        );
      },
      [
        stopTimers,
        finishBattleTurn,
        currentCharacter,
      ],
    );


  /* =======================================================
     通常モードタイマー
  ======================================================= */

  useEffect(() => {
    if (
      screen !== 'normal' ||
      !currentImage ||
      !currentType ||
      answerMode ||
      roundFinished ||
      solutionVisible
    ) {
      return undefined;
    }

    startTimers(
      currentType,
      false,
    );

    return () =>
      stopTimers();
  }, [
    screen,
    currentImage,
    currentType,
    answerMode,
    roundFinished,
    solutionVisible,
    startTimers,
    stopTimers,
  ]);


  /* =======================================================
     対戦モードタイマー
  ======================================================= */

  useEffect(() => {
    if (
      screen !== 'battlePlay' ||
      !currentImage ||
      !battleTurnType ||
      answerMode ||
      roundFinished ||
      solutionVisible
    ) {
      return undefined;
    }

    startTimers(
      battleTurnType,
      true,
    );

    return () =>
      stopTimers();
  }, [
    screen,
    currentImage,
    battleTurnType,
    answerMode,
    roundFinished,
    solutionVisible,
    startTimers,
    stopTimers,
  ]);


  /* =======================================================
     通常モード0点監視
  ======================================================= */

  const finishByZero =
    useCallback(() => {
      stopTimers();

      setScore(0);

      setAnswerMode(false);

      setSolutionVisible(true);

      setRoundFinished(true);

      const result = {
        roundIndex,

        gameId: currentType,

        gameName:
          GAME_TYPES.find(
            (game) =>
              game.id === currentType,
          )?.name || currentType,

        characterName:
          currentCharacter?.name || '',

        score: 0,

        imageSrc:
          answerSnapshotRef.current,
      };

      setRoundResults(
        (previous) => [
          ...previous,
          result,
        ],
      );

      const newTotal =
        totalScore;

      setTotalScore(
        newTotal,
      );

      setMessage(
        `0点！ 正解は「${
          currentCharacter?.name || ''
        }」`,
      );

      stopTransitionTimer();

      transitionTimerRef.current =
        setTimeout(() => {
          transitionTimerRef.current =
            null;

          goToNextRound(
            newTotal,
          );
        }, 2200);
    }, [
      stopTimers,
      roundIndex,
      currentType,
      currentCharacter,
      totalScore,
      stopTransitionTimer,
    ]);


  useEffect(() => {
    if (
      screen !== 'normal' ||
      !currentImage ||
      answerMode ||
      roundFinished ||
      solutionVisible
    ) {
      return;
    }

    if (score <= 0) {
      finishByZero();
    }
  }, [
    screen,
    currentImage,
    score,
    answerMode,
    roundFinished,
    solutionVisible,
    finishByZero,
  ]);


  /* =======================================================
     回答タイマー開始
  ======================================================= */

  const startAnswerTimer =
    useCallback(
      (onTimeout) => {
        stopAnswerTimer();

        setAnswerTimeLeft(
          ANSWER_LIMIT_SECONDS,
        );

        let remaining =
          ANSWER_LIMIT_SECONDS;

        answerTimerRef.current =
          setInterval(() => {
            remaining -= 1;

            setAnswerTimeLeft(
              remaining,
            );

            if (
              remaining <= 0
            ) {
              stopAnswerTimer();

              onTimeout();
            }
          }, 1000);
      },
      [stopAnswerTimer],
    );


  /* =======================================================
     次の通常ラウンド
  ======================================================= */

  const finishGame =
    useCallback(
      (newTotal) => {
        stopTimers();
        stopAnswerTimer();

        setFinalScore(
          newTotal,
        );

        try {
          const oldBest =
            Number(
              window.localStorage.getItem(
                BEST_KEY,
              ) || 0,
            );

          if (
            newTotal >
            oldBest
          ) {
            window.localStorage.setItem(
              BEST_KEY,
              String(newTotal),
            );
          }
        } catch {
          // localStorage unavailable
        }
      },
      [
        stopTimers,
        stopAnswerTimer,
      ],
    );

  const goToNextRound =
    useCallback(
      (nextTotal) => {
        const nextIndex =
          roundIndex + 1;

        if (
          nextIndex >=
          TOTAL_ROUNDS
        ) {
          finishGame(
            nextTotal,
          );

          return;
        }

        const nextCharacter =
          roundCharacters[
            nextIndex
          ];

        setRoundIndex(
          nextIndex,
        );

        prepareRound(
          gameOrder[
            nextIndex
          ].id,
          nextCharacter,
        ).catch((error) => {
          setMessage(
            error instanceof Error
              ? error.message
              : '画像の読み込みに失敗しました。',
          );
        });
      },
      [
        roundIndex,
        roundCharacters,
        gameOrder,
        finishGame,
        prepareRound,
      ],
    );


  /* =======================================================
     通常モード：回答時間切れ
  ======================================================= */

  const handleNormalTimeout =
  useCallback(() => {
    stopAnswerTimer();

    if (!currentCharacter || roundFinished) {
      return;
    }

    const newScore = Math.max(
      0,
      score - WRONG_ANSWER_PENALTY,
    );

    setScore(newScore);

    setAnswerMode(false);

    setAnswer('');

    setAnswerTimeLeft(
      ANSWER_LIMIT_SECONDS,
    );

    if (newScore <= 0) {
      finishByZero();
      return;
    }

    setMessage(
      `時間切れ！ -${WRONG_ANSWER_PENALTY}点。現在 ${newScore}点。ゲーム再開！`,
    );
  }, [
    stopAnswerTimer,
    currentCharacter,
    roundFinished,
    score,
    finishByZero,
  ]);


  /* =======================================================
     対戦モード：回答時間切れ
  ======================================================= */

const handleBattleTimeout =
  useCallback(() => {
    stopAnswerTimer();

    if (!currentCharacter || roundFinished) {
      return;
    }

    const index =
      battleCurrentIndexRef.current;

    const players =
      battlePlayersRef.current;

    const current =
      players[index];

    if (!current) {
      return;
    }

    /*
     * 時間切れも不正解と同じく -10点
     */
    const nextPoints = Math.max(
      0,
      current.points -
        WRONG_ANSWER_PENALTY,
    );

    const nextLoss =
      battleTurnLossRef.current +
      WRONG_ANSWER_PENALTY;

    battleTurnLossRef.current =
      nextLoss;

    setBattleTurnLoss(
      nextLoss,
    );

    const nextPlayers =
  players.map(
    (player, playerIndex) =>
      playerIndex === index
        ? {
            ...player,
            points:
              nextPoints,
            eliminated:
              nextPoints <= 0,

            eliminationRound:
              nextPoints <= 0
                ? battleRoundNumberRef.current
                : player.eliminationRound,
          }
        : player,
  );

    battlePlayersRef.current =
      nextPlayers;

    setBattlePlayers(
      nextPlayers,
    );

    /*
     * 0点になった場合
     */
    if (nextPoints <= 0) {
      finishBattleTurn(
        'eliminated',
        `時間切れ！ -${WRONG_ANSWER_PENALTY}点。${current.name}さんは0点になり脱落です。`,
      );

      return;
    }

    /*
     * このターンで合計100点減った場合
     */
    if (
      nextLoss >=
      BATTLE_MAX_LOSS_PER_TURN
    ) {
      finishBattleTurn(
        'maxLoss',
        `時間切れ！ -${WRONG_ANSWER_PENALTY}点。このターンの減点上限 -${BATTLE_MAX_LOSS_PER_TURN}点です。`,
      );

      return;
    }

    /*
     * まだターン継続
     */
    setAnswerMode(false);

    setAnswer('');

    setAnswerTimeLeft(
      ANSWER_LIMIT_SECONDS,
    );

    setMessage(
      `時間切れ！ -${WRONG_ANSWER_PENALTY}点。${current.name}さんは残り${nextPoints}点。このターンは続行！`,
    );
  }, [
    stopAnswerTimer,
    currentCharacter,
    roundFinished,
    finishBattleTurn,
  ]);


  /* =======================================================
     回答開始
  ======================================================= */

  const beginAnswer =
    () => {
      if (
        !currentCharacter ||
        roundFinished
      ) {
        return;
      }

      stopTimers();

      let snapshot = null;

      try {
        if (
          canvasRef.current
        ) {
          snapshot =
            canvasRef.current.toDataURL(
              'image/png',
            );
        }
      } catch {
        snapshot = null;
      }

      answerSnapshotRef.current =
        snapshot;

      setAnswerMode(true);

      setAnswer('');

      setMessage(
        '15秒以内に回答してください！',
      );

      startAnswerTimer(
        screen === 'battlePlay'
          ? handleBattleTimeout
          : handleNormalTimeout,
      );
    };


  /* =======================================================
     通常モード：回答送信
  ======================================================= */

  const submitNormalAnswer =
    () => {
      if (
        !currentCharacter ||
        roundFinished
      ) {
        return;
      }

      const normalized =
        normalizeAnswer(
          answer,
        );

      if (!normalized) {
        setMessage(
          'キャラクター名を入力してください。',
        );

        return;
      }

      const correct =
        normalized ===
          normalizeAnswer(
            currentCharacter.name,
          ) ||
        normalized ===
          normalizeAnswer(
            currentCharacter.relatedWord,
          );

      stopAnswerTimer();

      /*
       * 不正解
       */
      if (!correct) {
        const newScore =
          Math.max(
            0,
            score -
              WRONG_ANSWER_PENALTY,
          );

        setScore(
          newScore,
        );

        if (
          newScore <= 0
        ) {
          finishByZero();
          return;
        }

        setAnswerMode(false);

        setAnswerTimeLeft(
          ANSWER_LIMIT_SECONDS,
        );

        setMessage(
          `不正解！ -${WRONG_ANSWER_PENALTY}点。現在 ${newScore}点。ゲーム再開！`,
        );

        return;
      }

      /*
       * 正解
       */
      stopTimers();

      setRoundFinished(true);
      setAnswerMode(false);

      const roundScore =
        Math.max(0, score);

      const newTotal =
        totalScore +
        roundScore;

      setTotalScore(
        newTotal,
      );

      const result = {
        roundIndex,

        gameId: currentType,

        gameName:
          GAME_TYPES.find(
            (game) =>
              game.id === currentType,
          )?.name || currentType,

        characterName:
          currentCharacter.name,

        score: roundScore,

        imageSrc:
          answerSnapshotRef.current,
      };

      setRoundResults(
        (previous) => [
          ...previous,
          result,
        ],
      );

      setMessage(
        `正解！ ${roundScore}点`,
      );

      stopTransitionTimer();

      if (
        roundIndex >=
        TOTAL_ROUNDS - 1
      ) {
        transitionTimerRef.current =
          setTimeout(() => {
            transitionTimerRef.current =
              null;

            finishGame(
              newTotal,
            );
          }, 900);

        return;
      }

      transitionTimerRef.current =
        setTimeout(() => {
          transitionTimerRef.current =
            null;

          goToNextRound(
            newTotal,
          );
        }, 900);
    };


  /* =======================================================
     対戦モード：回答送信
  ======================================================= */

  const submitBattleAnswer =
    () => {
      if (
        !currentCharacter ||
        roundFinished
      ) {
        return;
      }

      const normalized =
        normalizeAnswer(
          answer,
        );

      if (!normalized) {
        setMessage(
          'キャラクター名を入力してください。',
        );

        return;
      }

      const correct =
        normalized ===
          normalizeAnswer(
            currentCharacter.name,
          ) ||
        normalized ===
          normalizeAnswer(
            currentCharacter.relatedWord,
          );

      stopAnswerTimer();

      const index =
        battleCurrentIndexRef.current;

      const players =
        battlePlayersRef.current;

      const current =
        players[index];

      if (!current) {
        return;
      }

      /*
       * 正解
       */
      if (correct) {
        finishBattleTurn(
          'correct',
          `正解！ ${current.name}さんの回答です。`,
        );

        return;
      }

      /*
       * 不正解 -10
       */
      const nextPoints =
        Math.max(
          0,
          current.points -
            WRONG_ANSWER_PENALTY,
        );

      const nextLoss =
        battleTurnLossRef.current +
        WRONG_ANSWER_PENALTY;

      battleTurnLossRef.current =
        nextLoss;

      setBattleTurnLoss(
        nextLoss,
      );

      const nextPlayers =
  players.map(
    (player, playerIndex) =>
      playerIndex === index
        ? {
            ...player,
            points:
              nextPoints,
            eliminated:
              nextPoints <= 0,

            eliminationRound:
              nextPoints <= 0
                ? battleRoundNumberRef.current
                : player.eliminationRound,
          }
        : player,
  );

      battlePlayersRef.current =
        nextPlayers;

      setBattlePlayers(
        nextPlayers,
      );

      /*
       * 0点
       */
      if (
        nextPoints <= 0
      ) {
        finishBattleTurn(
          'eliminated',
          `不正解！ -${WRONG_ANSWER_PENALTY}点。${current.name}さんは0点になり脱落です。正解は「${currentCharacter.name}」`,
        );

        return;
      }

      /*
       * このターンの減点が100以上
       */
      if (
        nextLoss >=
        BATTLE_MAX_LOSS_PER_TURN
      ) {
        finishBattleTurn(
          'maxLoss',
          `不正解！ -${WRONG_ANSWER_PENALTY}点。このターンの減点上限 -${BATTLE_MAX_LOSS_PER_TURN}点です。正解は「${currentCharacter.name}」`,
        );

        return;
      }

      /*
       * まだ続行
       */
      setAnswerMode(false);

      setAnswer('');

      setAnswerTimeLeft(
        ANSWER_LIMIT_SECONDS,
      );

      setMessage(
        `不正解！ -${WRONG_ANSWER_PENALTY}点。${current.name}さんは残り${nextPoints}点。このターンは続行！`,
      );
    };


  /* =======================================================
     答え合わせ
  ======================================================= */

  const submitAnswer =
    () => {
      if (
        screen === 'battlePlay'
      ) {
        submitBattleAnswer();
        return;
      }

      submitNormalAnswer();
    };


  /* =======================================================
     通常モード開始
  ======================================================= */

  const startNormalGame =
    async () => {
      if (
        characters.length <
        TOTAL_ROUNDS
      ) {
        return;
      }

      stopTimers();
      stopAnswerTimer();
      stopTransitionTimer();

      const shuffledGames =
        shuffleArray(
          GAME_TYPES,
        );

      const selectedCharacters =
        shuffleArray(
          characters,
        ).slice(
          0,
          TOTAL_ROUNDS,
        );

      setGameOrder(
        shuffledGames,
      );

      setRoundIndex(0);

      setTotalScore(0);

      setFinalScore(null);

      setRoundCharacters(
        selectedCharacters,
      );

      setRoundResults([]);

      setScreen('normal');

      try {
        await prepareRound(
          shuffledGames[0].id,
          selectedCharacters[0],
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : '画像の読み込みに失敗しました。',
        );
      }
    };


  /* =======================================================
     対戦設定画面を開く
  ======================================================= */

  const openBattleSetup =
    () => {
      stopTimers();
      stopAnswerTimer();
      stopTransitionTimer();

      setBattleSetupError('');

      setScreen(
        'battleSetup',
      );
    };


  /* =======================================================
     対戦設定変更
  ======================================================= */

  const updateBattlePlayer =
    (
      playerIndex,
      key,
      value,
    ) => {
      setBattleSetupPlayers(
        (previous) =>
          previous.map(
            (
              player,
              index,
            ) =>
              index ===
              playerIndex
                ? {
                    ...player,
                    [key]:
                      value,
                  }
                : player,
          ),
      );
    };

  const toggleBattleGameType =
    (gameId) => {
      setBattleSelectedTypes(
        (previous) => {
          if (
            previous.includes(
              gameId,
            )
          ) {
            return previous.filter(
              (id) =>
                id !==
                gameId,
            );
          }

          return [
            ...previous,
            gameId,
          ];
        },
      );
    };


  /* =======================================================
     対戦開始
  ======================================================= */

  const startBattle =
    () => {
      setBattleSetupError('');

      const configured =
        battleSetupPlayers
          .map(
            (
              player,
              index,
            ) => ({
              ...player,
              index,
            }),
          )
          .filter(
            (player) =>
              player.name.trim(),
          );

      if (
        configured.length <
        2
      ) {
        setBattleSetupError(
          '対戦モードは2人以上で設定してください。',
        );

        return;
      }

      if (
        configured.length >
        BATTLE_MAX_PLAYERS
      ) {
        setBattleSetupError(
          `参加できるのは${BATTLE_MAX_PLAYERS}人までです。`,
        );

        return;
      }

      if (
        battleSelectedTypes.length <
        1
      ) {
        setBattleSetupError(
          '使用するゲーム形式を1つ以上選択してください。',
        );

        return;
      }

      const players =
        configured.map(
          (player, index) => {
            const points =
              Number(
                player.points,
              );

            return {
  id: index,

  name:
    player.name.trim(),

  points,

  eliminated:
    points <= 0,

  eliminationRound: null,

  rank: null,
};
          },
        );

      const invalid =
        players.some(
          (player) =>
            !Number.isFinite(
              player.points,
            ) ||
            player.points <= 0,
        );

      if (invalid) {
        setBattleSetupError(
          '各プレイヤーの初期点数は1点以上にしてください。',
        );

        return;
      }

     battlePlayersRef.current =
  players;

battleCurrentIndexRef.current =
  0;

battleTurnLossRef.current =
  0;

battleRoundNumberRef.current =
  1;

setBattlePlayers(
  players,
);

setBattleCurrentIndex(0);

setBattleTurnLoss(0);

setBattleTurnNumber(1);

setBattleRoundNumber(1);

/*
 * 1周目は参加者全員がプレイする。
 */
battleRoundRemainingRef.current =
  new Set(
    players.map(
      (player) =>
        player.id,
    ),
  );

/*
 * 1周目のゲーム形式をここで1回だけ抽選。
 *
 * この形式は1周目の全員で共通。
 */
const availableTypes =
  GAME_TYPES.filter(
    (game) =>
      battleSelectedTypes.includes(
        game.id,
      ),
  );

const firstRoundType =
  availableTypes[
    Math.floor(
      Math.random() *
        availableTypes.length,
    )
  ];

battleRoundTypeRef.current =
  firstRoundType.id;

setBattleRoundType(
  firstRoundType.id,
);

setBattleTurnType(
  firstRoundType.id,
);

setBattleWinner(null);

      setCurrentImage(null);
      setCurrentCharacter(null);

      setAnswer('');
      setAnswerMode(false);

      setSolutionVisible(false);
      setRoundFinished(false);

      setMessage(
        `${players[0].name}さんからです！`,
      );

      setScreen(
        'battleReady',
      );
    };


  /* =======================================================
     対戦の1ターン開始
  ======================================================= */

 
const startBattleTurn =
  async () => {
    const players =
      battlePlayersRef.current;

    const currentIndex =
      battleCurrentIndexRef.current;

    const current =
      players[currentIndex];

    if (
      !current ||
      current.eliminated ||
      current.points <= 0
    ) {
      advanceBattleTurn();
      return;
    }

    /*
     * -----------------------------------------------------
     * このプレイヤーは、この周のプレイを開始した。
     *
     * ここで「プレイ済み」にする。
     *
     * 重要：
     * この後このプレイヤーが脱落しても、
     * その周そのものは終了しない。
     * -----------------------------------------------------
     */
    battleRoundRemainingRef.current.delete(
      current.id,
    );

    /*
     * -----------------------------------------------------
     * ゲーム形式は「周の開始時」に決定済み。
     *
     * ここでは絶対に再抽選しない。
     * -----------------------------------------------------
     */
    const selectedType =
      battleRoundTypeRef.current;

    if (!selectedType) {
      return;
    }

    /*
     * -----------------------------------------------------
     * キャラクターをランダム選択。
     *
     * 直前と同じキャラクターは
     * 可能な限り避ける。
     * -----------------------------------------------------
     */
    let pool = characters;

    if (
      currentCharacter?.charNo !=
        null &&
      characters.length > 1
    ) {
      const filtered =
        characters.filter(
          (character) =>
            character.charNo !==
            currentCharacter.charNo,
        );

      if (
        filtered.length
      ) {
        pool = filtered;
      }
    }

    const character =
      pool[
        Math.floor(
          Math.random() *
            pool.length,
        )
      ];

    if (!character) {
      return;
    }

    battleTurnLossRef.current =
      0;

    setBattleTurnLoss(0);

    /*
     * 現在の周の形式を、
     * このターンにも使用する。
     */
    setBattleTurnType(
      selectedType,
    );

    setMessage(
      `${current.name}さんのターン開始！`,
    );

    try {
      await prepareRound(
        selectedType,
        character,
      );

      setScreen(
        'battlePlay',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '画像の読み込みに失敗しました。',
      );
    }
  };

  /* =======================================================
     リスタート
  ======================================================= */

  const restartNormal =
    () => {
      stopTimers();
      stopAnswerTimer();
      stopTransitionTimer();

      setScreen('menu');

      setRoundIndex(0);

      setGameOrder([]);

      setCurrentCharacter(null);
      setCurrentImage(null);

      setScore(MAX_SCORE);
      setVisualProgress(0);

      setTotalScore(0);

      setRoundCharacters([]);
      setRoundResults([]);

      setAnswerMode(false);
      setAnswer('');

      setAnswerTimeLeft(
        ANSWER_LIMIT_SECONDS,
      );

      setMessage('');

      setRoundFinished(false);

      setFinalScore(null);

      setSolutionVisible(false);

      answerSnapshotRef.current =
        null;
    };


  /* =======================================================
     自己ベスト
  ======================================================= */

  const bestScore =
    typeof window !== 'undefined'
      ? Number(
          window.localStorage.getItem(
            BEST_KEY,
          ) || 0,
        )
      : 0;


  /* =======================================================
     クリーンアップ
  ======================================================= */

  useEffect(() => {
    return () => {
      stopTimers();
      stopAnswerTimer();
      stopTransitionTimer();
    };
  }, [
    stopTimers,
    stopAnswerTimer,
    stopTransitionTimer,
  ]);


  /* =========================================================
     Loading
  ========================================================= */

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <p className="font-bold">
          キャラクターを読み込んでいます……
        </p>
      </main>
    );
  }


  /* =========================================================
     Loading Error
  ========================================================= */

  if (loadingError) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-10">
        <div className="max-w-xl mx-auto rounded-2xl bg-white/10 p-6">
          <h1 className="text-xl font-extrabold mb-3">
            画像キャラクタークイズ
          </h1>

          <p className="text-sm text-red-300">
            {loadingError}
          </p>

          <Link
            href="/solo"
            className="inline-block mt-5 underline"
          >
            ソロゲームへ戻る
          </Link>
        </div>
      </main>
    );
  }


  /* =========================================================
     スタート画面
  ========================================================= */

  if (screen === 'menu') {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/solo"
            className="text-sm text-slate-300 underline"
          >
            ← ソロゲームへ戻る
          </Link>

          <div className="mt-5 rounded-3xl border border-violet-400/40 bg-violet-950/40 p-6">
            <p className="text-sm font-bold text-violet-300">
              ONE PIECE キャラクター画像ゲーム
            </p>

            <h1 className="mt-1 text-3xl font-black">
              画像当て5番勝負
            </h1>

            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              5種類のゲームを毎回ランダムな順番で1回ずつプレイ。
              すべて100点満点、合計500点満点です。
            </p>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {GAME_TYPES.map(
                (game, index) => (
                  <div
                    key={game.id}
                    className="rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                  >
                    <span className="text-xs text-slate-400">
                      {index + 1}
                    </span>

                    <p className="font-bold">
                      {game.name}
                    </p>
                  </div>
                ),
              )}
            </div>

            <div className="mt-6 rounded-2xl bg-black/30 p-4 text-sm leading-relaxed">
              <p>
                ・最初の5秒間は100点で停止
              </p>

              <p>
                ・画像の変化速度と点数は別々に管理
              </p>

              <p>
                ・「回答」を押すと画像が隠れる
              </p>

              <p>
                ・回答後は15秒以内に回答
              </p>

              <p>
                ・不正解は-10点
              </p>

              <p>
                ・0点になると正解表示して次へ
              </p>
            </div>

            <button
              type="button"
              onClick={
                startNormalGame
              }
              className="mt-6 w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-black hover:bg-violet-400"
            >
              ゲーム開始
            </button>

            <button
              type="button"
              onClick={
                openBattleSetup
              }
              className="mt-3 w-full rounded-2xl border border-yellow-400/50 bg-yellow-500/10 px-5 py-4 text-lg font-black text-yellow-200 hover:bg-yellow-500/20"
            >
              対戦モードを始める
            </button>

            <p className="mt-3 text-center text-xs text-slate-400">
              自己ベスト：
              {bestScore} / 500
            </p>
          </div>
        </div>
      </main>
    );
  }


  /* =========================================================
     対戦設定
  ========================================================= */

  if (
    screen === 'battleSetup'
  ) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() =>
              setScreen('menu')
            }
            className="text-sm text-slate-300 underline"
          >
            ← 戻る
          </button>

          <div className="mt-5 rounded-3xl border border-yellow-400/40 bg-yellow-950/20 p-6">
            <p className="text-sm font-bold text-yellow-300">
              ONE PIECE キャラクター画像ゲーム
            </p>

            <h1 className="mt-1 text-3xl font-black">
              対戦モード設定
            </h1>

            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              1台の端末を順番に渡してプレイします。
              2〜4人まで参加できます。
            </p>

            <div className="mt-6 space-y-3">
              {battleSetupPlayers.map(
                (
                  player,
                  index,
                ) => (
                  <div
                    key={
                      player.id
                    }
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-xs font-bold text-slate-400 mb-2">
                      プレイヤー
                      {index + 1}
                      {index >= 2
                        ? '（任意）'
                        : ''}
                    </p>

                    <div className="grid grid-cols-[1fr_120px] gap-3">
                      <input
                        value={
                          player.name
                        }
                        onChange={(
                          event,
                        ) =>
                          updateBattlePlayer(
                            index,
                            'name',
                            event
                              .target
                              .value,
                          )
                        }
                        className="min-w-0 rounded-xl bg-white text-slate-900 px-3 py-3 font-bold outline-none focus:ring-2 focus:ring-yellow-400"
                        placeholder={`プレイヤー${index + 1}の名前`}
                      />

                      <div>
                        <input
                          type="number"
                          min="1"
                          value={
                            player.points
                          }
                          onChange={(
                            event,
                          ) =>
                            updateBattlePlayer(
                              index,
                              'points',
                              event
                                .target
                                .value,
                            )
                          }
                          className="w-full rounded-xl bg-white text-slate-900 px-3 py-3 font-bold outline-none focus:ring-2 focus:ring-yellow-400"
                        />

                        <p className="mt-1 text-[10px] text-slate-500">
                          初期点数
                        </p>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="mt-6">
              <h2 className="font-black text-lg">
                使用するゲーム形式
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                チェックした形式だけから毎ターンランダム抽選します。
              </p>

              <div className="mt-3 space-y-2">
                {GAME_TYPES.map(
                  (game) => {
                    const checked =
                      battleSelectedTypes.includes(
                        game.id,
                      );

                    return (
                      <label
                        key={
                          game.id
                        }
                        className={[
                          'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition',
                          checked
                            ? 'border-violet-400 bg-violet-500/15'
                            : 'border-white/10 bg-white/5',
                        ].join(
                          ' ',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={
                            checked
                          }
                          onChange={() =>
                            toggleBattleGameType(
                              game.id,
                            )
                          }
                          className="h-5 w-5"
                        />

                        <span className="font-bold">
                          {
                            game.name
                          }
                        </span>
                      </label>
                    );
                  },
                )}
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-black/30 p-4 text-sm leading-relaxed">
              <p>
                ・1ターン最大減点は100点
              </p>

              <p>
                ・通常の時間経過で減る点数も含めて-100点まで
              </p>

              <p>
                ・不正解は1回-10点
              </p>

              <p>
                ・0点になったプレイヤーは脱落
              </p>

              <p>
                ・「回答」を押した後は15秒以内に回答
              </p>
            </div>

            {battleSetupError && (
              <div className="mt-4 rounded-xl border border-red-400/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {
                  battleSetupError
                }
              </div>
            )}

            <button
              type="button"
              onClick={
                startBattle
              }
              className="mt-5 w-full rounded-2xl bg-yellow-500 px-5 py-4 text-lg font-black text-slate-950 hover:bg-yellow-400"
            >
              対戦開始
            </button>
          </div>
        </div>
      </main>
    );
  }


  /* =========================================================
     対戦：端末受け渡し画面
  ========================================================= */

  if (
    screen === 'battleReady'
  ) {
    const currentPlayer =
      battlePlayers[
        battleCurrentIndex
      ];

    if (!currentPlayer) {
      return null;
    }

    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8 flex items-center">
        <div className="max-w-2xl mx-auto w-full">
          <div className="rounded-3xl border border-yellow-400/40 bg-yellow-950/20 p-6 sm:p-8 text-center">
            <p className="text-sm font-bold text-yellow-300">
              第
              {
                battleTurnNumber
              }
              ターン
            </p>

            <h1 className="mt-3 text-4xl sm:text-5xl font-black">
              {currentPlayer.name}
              さんの番です！
            </h1>

            <p className="mt-5 text-slate-300">
              端末を
              <span className="font-black text-white">
                {currentPlayer.name}
              </span>
              さんに渡してください。
            </p>

            <div className="mt-6 rounded-2xl bg-black/30 p-5">
              <p className="text-xs text-slate-400">
                現在のポイント
              </p>

              <p className="mt-1 text-6xl font-black text-yellow-300 tabular-nums">
                {
                  currentPlayer.points
                }
              </p>

              <p className="mt-1 text-xs text-slate-500">
                1ターン最大 -100点
              </p>
            </div>

            <p className="mt-5 text-sm text-slate-400">
              「ゲーム開始」を押すと、
              選択した形式の中からランダムに1つ抽選されます。
            </p>

            <button
              type="button"
              onClick={
                startBattleTurn
              }
              className="mt-6 w-full rounded-2xl bg-violet-500 px-5 py-5 text-xl font-black hover:bg-violet-400"
            >
              ゲーム開始
            </button>

            <button
              type="button"
              onClick={() =>
                setScreen(
                  'battleSetup',
                )
              }
              className="mt-3 w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold hover:bg-white/10"
            >
              対戦設定に戻る
            </button>
          </div>
        </div>
      </main>
    );
  }


  /* =========================================================
     対戦：結果
  ========================================================= */

  if (
    screen === 'battleResult'
  ) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <p className="text-sm text-yellow-300 font-black">
              GAME SET!
            </p>

            <h1 className="mt-2 text-4xl font-black">
              対戦終了
            </h1>

            {battleWinner && (
              <div className="mt-8 rounded-3xl border border-yellow-400/50 bg-yellow-950/30 p-8">
                <p className="text-sm text-yellow-300">
                  WINNER
                </p>

                <p className="mt-2 text-4xl font-black">
                  {
                    battleWinner.name
                  }
                  さん
                </p>

                <p className="mt-3 text-5xl font-black text-yellow-300 tabular-nums">
                  {
                    battleWinner.points
                  }
                  点
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-black">
              最終ポイント
            </h2>

            <div className="mt-4 space-y-2">
  {[...battlePlayers]
    .sort(
      (a, b) =>
        (a.rank ?? 999) -
        (b.rank ?? 999),
    )
    .map((player) => (
      <div
        key={player.id}
        className={[
          'flex items-center justify-between rounded-xl px-4 py-3',
          player.rank === 1
            ? 'border border-yellow-400/40 bg-yellow-950/30'
            : player.eliminated
              ? 'bg-red-950/30'
              : 'bg-white/10',
        ].join(' ')}
      >
        <div className="flex items-center gap-3">
          <p
            className={[
              'w-16 text-2xl font-black',
              player.rank === 1
                ? 'text-yellow-300'
                : 'text-white',
            ].join(' ')}
          >
            {player.rank}位
          </p>

          <div>
            <p className="font-black">
              {player.name}
            </p>

            {player.eliminated ? (
              <p className="text-[10px] text-red-400">
                {player.eliminationRound}周目脱落
              </p>
            ) : (
              <p className="text-[10px] text-yellow-300">
                最後まで生存
              </p>
            )}
          </div>
        </div>

        <p className="text-2xl font-black tabular-nums">
          {player.points}
          <span className="ml-1 text-xs text-slate-400">
            点
          </span>
        </p>
      </div>
    ))}
</div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setScreen(
                  'battleSetup',
                )
              }
              className="rounded-2xl bg-yellow-500 px-5 py-4 font-black text-slate-950 hover:bg-yellow-400"
            >
              もう一度対戦
            </button>

            <button
              type="button"
              onClick={() =>
                setScreen('menu')
              }
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4 font-bold hover:bg-white/10"
            >
              ゲーム選択へ戻る
            </button>
          </div>
        </div>
      </main>
    );
  }


  /* =========================================================
     通常モード：結果
  ========================================================= */

  if (
    screen === 'normal' &&
    finalScore != null
  ) {
    const best = Math.max(
      bestScore,
      finalScore,
    );

    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <p className="text-sm text-violet-300 font-bold">
              GAME SET!
            </p>

            <h1 className="mt-2 text-4xl font-black">
              結果発表
            </h1>

            <div className="mt-8 rounded-3xl border border-violet-400/40 bg-violet-950/40 p-8">
              <p className="text-sm text-slate-300">
                TOTAL SCORE
              </p>

              <p className="mt-2 text-7xl font-black">
                {finalScore}
              </p>

              <p className="mt-1 text-slate-400">
                / 500
              </p>

              <p className="mt-5 text-sm">
                自己ベスト：
                <span className="font-black">
                  {best}
                </span>
                {' / 500'}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-black">
              各ゲームの結果
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              「回答」を押した瞬間の画像です。
            </p>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {roundResults.map(
                (result) => (
                  <div
                    key={`${result.roundIndex}-${result.gameId}`}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
                  >
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-violet-300 font-bold">
                          {
                            result.roundIndex +
                            1
                          }
                          問目
                        </p>

                        <p className="mt-1 font-black">
                          {
                            result.gameName
                          }
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] text-slate-400">
                          SCORE
                        </p>

                        <p className="text-3xl font-black text-yellow-300">
                          {
                            result.score
                          }
                        </p>

                        <p className="text-[10px] text-slate-500">
                          / 100
                        </p>
                      </div>
                    </div>

                    <div className="aspect-square bg-black">
                      {result.imageSrc ? (
                        <img
                          src={
                            result.imageSrc
                          }
                          alt={`${result.characterName}の回答時画像`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
                          画像を保存できませんでした
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <p className="text-xs text-slate-400">
                        正解
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {
                          result.characterName
                        }
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={
                restartNormal
              }
              className="rounded-2xl bg-violet-500 px-5 py-4 font-black hover:bg-violet-400"
            >
              もう一度挑戦
            </button>

            <Link
              href="/solo"
              className="rounded-2xl border border-white/20 bg-white/5 px-5 py-4 font-bold hover:bg-white/10 text-center"
            >
              ソロゲームへ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }


  /* =========================================================
     通常・対戦 プレイ画面
  ========================================================= */

  const isBattle =
    screen === 'battlePlay';

  const activeType =
    isBattle
      ? battleTurnType
      : currentType;

  const activeGameName =
    GAME_TYPES.find(
      (game) =>
        game.id === activeType,
    )?.name || '';

  const currentBattlePlayer =
    isBattle
      ? battlePlayers[
          battleCurrentIndex
        ]
      : null;

  return (
    <main className="min-h-screen bg-slate-950 text-white px-3 py-5">
      <div className="max-w-3xl mx-auto">
        {isBattle ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-yellow-300 font-black">
                  対戦モード
                </p>

                <p className="text-lg font-black">
                  {
                    currentBattlePlayer?.name
                  }
                  さん
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-slate-400">
                  現在のポイント
                </p>

                <p className="text-4xl font-black text-yellow-300 tabular-nums">
                  {
                    currentBattlePlayer?.points ??
                    0
                  }
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-[10px] text-slate-400">
                  第
                  {
                    battleTurnNumber
                  }
                  ターン
                </p>

                <p className="font-black">
                  {
                    activeGameName
                  }
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-slate-400">
                  このターンの減点
                </p>

                <p className="font-black text-red-300">
                  -{battleTurnLoss}
                  {' / '}
                  {BATTLE_MAX_LOSS_PER_TURN}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/solo"
              className="text-xs text-slate-300 underline"
            >
              ← ソロゲーム
            </Link>

            <div className="text-right">
              <p className="text-[10px] text-slate-400">
                TOTAL
              </p>

              <p className="font-black tabular-nums">
                {totalScore} / 500
              </p>
            </div>
          </div>
        )}

        {!isBattle && (
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-violet-300 font-bold">
                {roundIndex + 1} /{' '}
                {TOTAL_ROUNDS}
              </p>

              <h1 className="text-xl sm:text-2xl font-black">
                {
                  activeGameName
                }
              </h1>
            </div>

            <div className="text-right">
              <p className="text-[10px] text-slate-400">
                残り点
              </p>

              <p className="text-4xl font-black text-yellow-300 tabular-nums">
                {score}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-3xl border border-white/15 bg-black">
          <canvas
            ref={canvasRef}
            className="block w-full aspect-square sm:aspect-[4/3]"
            aria-label="キャラクター画像クイズ"
          />
        </div>

               {/* 回答中の15秒カウントダウン */}
        {answerMode && (
          <div className="mt-3 rounded-2xl border-2 border-red-400/50 bg-red-950/40 px-4 py-4 text-center">
            <p className="text-xs text-red-200 font-bold">
              回答時間
            </p>

            <p className="mt-1 text-4xl font-black text-red-300 tabular-nums">
              残り
              {answerTimeLeft}
              秒
            </p>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-red-400 transition-all duration-1000"
                style={{
                  width: `${
                    Math.max(
                      0,
                      Math.min(
                        100,
                        (answerTimeLeft /
                          ANSWER_LIMIT_SECONDS) *
                          100,
                      ),
                    )
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {solutionVisible &&
          currentCharacter && (
            <div className="mt-3 rounded-2xl border border-yellow-400/40 bg-yellow-950/40 px-4 py-4 text-center">
              <p className="text-xs text-yellow-300">
                正解
              </p>

              <p className="mt-1 text-2xl font-black">
                {
                  currentCharacter.name
                }
              </p>
            </div>
          )}

        <div className="mt-4 min-h-14 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          {message ||
            '画像を見て、分かったら回答を押してください。'}
        </div>

        {!answerMode &&
          !roundFinished &&
          !solutionVisible && (
            <button
              type="button"
              onClick={
                beginAnswer
              }
              className="mt-3 w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-black hover:bg-violet-400"
            >
              回答
            </button>
          )}

        {answerMode &&
          !roundFinished && (
            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault();

                submitAnswer();
              }}
            >
              <label
                className="block text-sm font-bold mb-2"
                htmlFor="character-answer"
              >
                キャラクター名
              </label>

              <input
                id="character-answer"
                autoFocus
                value={answer}
                onChange={(event) =>
                  setAnswer(
                    event.target.value,
                  )
                }
                className="w-full rounded-2xl border border-white/20 bg-white text-slate-900 px-4 py-4 text-lg font-bold outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="キャラクター名を入力"
              />

              <button
                type="submit"
                className="mt-3 w-full rounded-2xl bg-emerald-500 px-5 py-4 text-lg font-black text-white hover:bg-emerald-400"
              >
                答え合わせ
              </button>
            </form>
          )}

        {roundFinished &&
          !solutionVisible &&
          !isBattle && (
            <div className="mt-3 rounded-2xl bg-emerald-950/50 border border-emerald-400/30 px-4 py-4 text-center">
              <p className="font-black text-emerald-300">
                {message}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                次のゲームへ進みます……
              </p>
            </div>
          )}

        {roundFinished &&
          !solutionVisible &&
          isBattle && (
            <div className="mt-3 rounded-2xl bg-emerald-950/50 border border-emerald-400/30 px-4 py-4 text-center">
              <p className="font-black text-emerald-300">
                {message}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                次のプレイヤーへ端末を渡してください……
              </p>
            </div>
          )}

        {solutionVisible && (
          <div className="mt-3 rounded-2xl bg-red-950/40 border border-red-400/30 px-4 py-4 text-center">
            <p className="font-black text-red-300">
              {isBattle
                ? 'このターン終了！'
                : '時間切れ・0点！'}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              次のプレイヤーへ進みます……
            </p>
          </div>
        )}

        {!isBattle && (
          <div className="mt-5 flex flex-wrap gap-2">
            {gameOrder.map(
              (game, index) => (
                <div
                  key={game.id}
                  className={[
                    'rounded-full px-3 py-1 text-[10px] font-bold border',
                    index ===
                    roundIndex
                      ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                      : index <
                          roundIndex
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/10 bg-white/5 text-slate-500',
                  ].join(' ')}
                >
                  {index + 1}.{' '}
                  {game.name}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </main>
  );
}