// file: server.js

import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import db from "./lib/db.js";
import { addBerriesByUserId } from "./lib/berries.js";
import { setupMeteorMode } from "./meteorMode.js";

const PORT = process.env.PORT || 4000;

// ------------------------------
// Express アプリ
// ------------------------------
const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "*",
  })
);

// ヘルスチェック
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// 接続数
let onlineCount = 0;

app.get("/online-count", (req, res) => {
  res.json({ count: onlineCount });
});

// 404
app.use((req, res) => {
  res.status(404).send("Not Found");
});

// ------------------------------
// HTTP Server + Socket.IO
// ------------------------------
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupMeteorMode(io);

// ------------------------------
// 共通
// ------------------------------

function log(...args) {
  console.log("[server]", ...args);
}

// レートから称号
function getRankName(rating) {
  if (rating >= 1800) return "海賊王";
  if (rating >= 1750) return "四皇";
  if (rating >= 1700) return "七武海";
  if (rating >= 1650) return "超新星";
  if (rating >= 1600) return "Level 新世界";
  if (rating >= 1550) return "Level 偉大なる航路";
  if (rating >= 1500) return "Level 東の海";
  return "海賊見習い";
}

// ========== レートマッチ用キュー ==========
const rateQueue = [];

// ========== 通常バトル用ルーム状態 ==========
const rooms = new Map();

// ======================================================
// ★ フリーマッチ用ルーム
// ======================================================
//
// roomId:
//   4桁の数字
//
// room:
// {
//   roomId,
//   hostSocketId,
//   players: Map(socketId -> player),
//   selectedGame,
//   createdAt
// }
// ======================================================

const freeRooms = new Map();

const FREE_ROOM_MAX_PLAYERS = 4;

// ------------------------------
// フリーマッチ部屋ID生成
// ------------------------------

function generateFreeRoomId() {
  for (let i = 0; i < 100; i++) {
    const roomId = String(
      Math.floor(1000 + Math.random() * 9000)
    );

    if (!freeRooms.has(roomId)) {
      return roomId;
    }
  }

  return null;
}

// ------------------------------
// フリーマッチ部屋の状態を作る
// ------------------------------

function makeFreeRoomPayload(room) {
  const players = Array.from(room.players.values()).map((player, index) => ({
    socketId: player.socketId,
    userId: player.userId,
    name: player.name,
    isHost: player.socketId === room.hostSocketId,
    playerNumber: index + 1,
  }));

  return {
    roomId: room.roomId,
    players,
    maxPlayers: FREE_ROOM_MAX_PLAYERS,
    selectedGame: room.selectedGame || null,
    hostSocketId: room.hostSocketId,
  };
}

// ------------------------------
// フリーマッチ部屋全員へ状態送信
// ------------------------------

function broadcastFreeRoom(room) {
  if (!room) return;

  const payload = makeFreeRoomPayload(room);

  for (const player of room.players.values()) {
    io.to(player.socketId).emit("free:room-state", payload);
  }
}

// ------------------------------
// フリーマッチ部屋から削除
// ------------------------------

function removeSocketFromFreeRooms(socketId) {
  for (const [roomId, room] of freeRooms.entries()) {
    if (!room.players.has(socketId)) {
      continue;
    }

    const leavingPlayer =
      room.players.get(socketId);

    // ★ Hawkなどゲーム画面へ移動するための
    // Socket切り替え中なら、プレイヤー情報を残す
    if (
      leavingPlayer?.userId &&
      room.selectedGame
    ) {
      log(
        "free room socket preserved for game transfer:",
        roomId,
        leavingPlayer.name,
        socketId
      );

      continue;
    }

    room.players.delete(socketId);

    log(
      "free room player left:",
      roomId,
      leavingPlayer?.name,
      "remaining:",
      room.players.size
    );

    // 誰もいなくなったら部屋削除
    if (room.players.size === 0) {
      freeRooms.delete(roomId);

      log(
        "free room deleted:",
        roomId
      );

      continue;
    }

    // 部屋主が抜けたら次の人を部屋主にする
    if (
      room.hostSocketId ===
      socketId
    ) {
      const nextHost =
        Array.from(
          room.players.values()
        )[0];

      if (nextHost) {
        room.hostSocketId =
          nextHost.socketId;

        log(
          "free room host changed:",
          roomId,
          "->",
          nextHost.name
        );
      }
    }

    broadcastFreeRoom(room);
  }
}

// ======================================================
// DB ヘルパー
// ======================================================

// id でユーザー取得
async function getUserById(id) {
  if (!id) return null;

  try {
    const row = await db.get(
      `
      SELECT
        id,
        username,
        display_name,
        rating,
        internal_rating
      FROM users
      WHERE id = $1
    `,
      [id]
    );

    return row || null;
  } catch (e) {
    log("getUserById error:", e);
    return null;
  }
}

// username / display_name でユーザー取得
async function getUserForMatch(name) {
  if (!name) return null;

  try {
    const row = await db.get(
      `
      SELECT
        id,
        username,
        display_name,
        rating,
        internal_rating
      FROM users
      WHERE username = $1 OR display_name = $1
      LIMIT 1
    `,
      [name]
    );

    return row || null;
  } catch (e) {
    log("getUserForMatch error:", e);
    return null;
  }
}

// user_id からマイチーム
async function getUserTeamByUserId(userId) {
  if (!userId) return [];

  try {
    const rows = await db.query(
      `
      SELECT
        ut.slot,
        ut.character_id,
        uc.stars,
        c.char_no,
        c.name,
        c.base_rarity
      FROM user_teams ut
      JOIN user_characters uc
        ON uc.user_id = ut.user_id
        AND uc.character_id = ut.character_id
      LEFT JOIN characters c
        ON c.id = ut.character_id
      WHERE ut.user_id = $1
      ORDER BY ut.slot ASC
    `,
      [userId]
    );

    return rows.map((row) => ({
      slot: row.slot,
      character_id: row.character_id,
      star: row.stars ?? 1,
      name: row.name || `キャラID:${row.character_id}`,
      rarity: row.base_rarity ?? 1,
      char_no: row.char_no ?? row.character_id,
      image_url: null,
    }));
  } catch (e) {
    log("getUserTeamByUserId error:", e);
    return [];
  }
}

// ユーザー取得ヘルパー
async function getUserFromPlayer(player) {
  const baseSelect = `
    SELECT
      id,
      username,
      display_name,
      rating,
      internal_rating,
      matches_played,
      wins,
      losses,
      current_streak,
      best_streak
    FROM users
  `;

  let user = null;

  if (player.userId != null) {
    try {
      user = await db.get(
        baseSelect + " WHERE id = $1",
        [player.userId]
      );

      if (user) {
        log(
          "getUserFromPlayer: found by id",
          player.userId,
          "->",
          user.username
        );

        return user;
      }
    } catch (e) {
      log("getUserFromPlayer error(by id):", e);
    }
  }

  if (player.name) {
    try {
      user = await db.get(
        baseSelect + " WHERE username = $1",
        [player.name]
      );

      if (user) {
        log(
          "getUserFromPlayer: found by username",
          player.name,
          "-> id",
          user.id
        );

        return user;
      }
    } catch (e) {
      log("getUserFromPlayer error(by name):", e);
    }
  }

  return null;
}

// ======================================================
// レート計算
// ======================================================

function eloChange(
  ratingSelf,
  ratingOpp,
  outcome,
  kFactor
) {
  const K = kFactor ?? 32;

  const expected =
    1 /
    (1 +
      Math.pow(
        10,
        (ratingOpp - ratingSelf) / 400
      ));

  let score = 0.5;

  if (outcome === "win") {
    score = 1;
  } else if (outcome === "lose") {
    score = 0;
  }

  return K * (score - expected);
}

// ======================================================
// 通常終了レート更新
// ======================================================

async function updateRatingsNormalFinish(p0, p1) {
  log("updateRatingsNormalFinish called:", {
    p0UserId: p0.userId,
    p1UserId: p1.userId,
    p0Name: p0.name,
    p1Name: p1.name,
    p0Score: p0.score,
    p1Score: p1.score,
  });

  const user0 = await getUserFromPlayer(p0);
  const user1 = await getUserFromPlayer(p1);

  if (!user0 || !user1) {
    log("skip rating update: user not found");
    return;
  }

  const decideOutcome = (self, opp) => {
    if (self.score > opp.score) return "win";
    if (self.score < opp.score) return "lose";

    if (self.totalTimeMs < opp.totalTimeMs) {
      return "win";
    }

    if (self.totalTimeMs > opp.totalTimeMs) {
      return "lose";
    }

    return "draw";
  };

  const outcome0 = decideOutcome(p0, p1);
  const outcome1 = decideOutcome(p1, p0);

  const r0 =
    user0.internal_rating ??
    user0.rating ??
    1500;

  const r1 =
    user1.internal_rating ??
    user1.rating ??
    1500;

  let delta0 = eloChange(
    r0,
    r1,
    outcome0
  );

  let delta1 = eloChange(
    r1,
    r0,
    outcome1
  );

  const diff = Math.min(
    10,
    Math.abs(p0.score - p1.score)
  );

  const pointFactor = 1 + diff / 10;

  delta0 *= pointFactor;
  delta1 *= pointFactor;

  let newStreak0 =
    user0.current_streak ?? 0;

  let newStreak1 =
    user1.current_streak ?? 0;

  let wins0 =
    user0.wins ?? 0;

  let wins1 =
    user1.wins ?? 0;

  let losses0 =
    user0.losses ?? 0;

  let losses1 =
    user1.losses ?? 0;

  if (outcome0 === "win") {
    newStreak0 =
      (user0.current_streak ?? 0) + 1;

    newStreak1 = 0;

    wins0 += 1;
    losses1 += 1;
  } else if (outcome0 === "lose") {
    newStreak0 = 0;

    newStreak1 =
      (user1.current_streak ?? 0) + 1;

    wins1 += 1;
    losses0 += 1;
  } else {
    newStreak0 = 0;
    newStreak1 = 0;
  }

  if (outcome0 === "win") {
    delta0 += Math.min(
      newStreak0,
      10
    );
  }

  if (outcome1 === "win") {
    delta1 += Math.min(
      newStreak1,
      10
    );
  }

  const newInternal0 = r0 + delta0;
  const newInternal1 = r1 + delta1;

  const newRating0 =
    Math.round(newInternal0);

  const newRating1 =
    Math.round(newInternal1);

  const newBestStreak0 =
    Math.max(
      user0.best_streak ?? 0,
      newStreak0
    );

  const newBestStreak1 =
    Math.max(
      user1.best_streak ?? 0,
      newStreak1
    );

  const matches0 =
    (user0.matches_played ?? 0) + 1;

  const matches1 =
    (user1.matches_played ?? 0) + 1;

  const updateSql = `
    UPDATE users
    SET
      rating = $1,
      internal_rating = $2,
      matches_played = $3,
      wins = $4,
      losses = $5,
      current_streak = $6,
      best_streak = $7
    WHERE id = $8
  `;

  await db.run(updateSql, [
    newRating0,
    newInternal0,
    matches0,
    wins0,
    losses0,
    newStreak0,
    newBestStreak0,
    user0.id,
  ]);

  await db.run(updateSql, [
    newRating1,
    newInternal1,
    matches1,
    wins1,
    losses1,
    newStreak1,
    newBestStreak1,
    user1.id,
  ]);

  try {
    if (outcome0 === "win") {
      await addBerriesByUserId(
        user0.id,
        300,
        "レート戦勝利報酬"
      );
    } else if (outcome1 === "win") {
      await addBerriesByUserId(
        user1.id,
        300,
        "レート戦勝利報酬"
      );
    }
  } catch (e) {
    log(
      "addBerriesByUserId error:",
      e
    );
  }
}

// ======================================================
// 切断敗北
// ======================================================

async function updateRatingsDisconnectFinish(
  winner,
  loser
) {
  const userW =
    await getUserFromPlayer(winner);

  const userL =
    await getUserFromPlayer(loser);

  if (!userW || !userL) {
    log(
      "skip rating update (disconnect): user not found"
    );

    return;
  }

  const rW =
    userW.internal_rating ??
    userW.rating ??
    1500;

  const rL =
    userL.internal_rating ??
    userL.rating ??
    1500;

  let deltaW =
    eloChange(
      rW,
      rL,
      "win"
    );

  let deltaL =
    eloChange(
      rL,
      rW,
      "lose"
    );

  const newStreakW =
    (userW.current_streak ?? 0) + 1;

  const newStreakL = 0;

  const winsW =
    (userW.wins ?? 0) + 1;

  const winsL =
    userL.wins ?? 0;

  const lossesW =
    userW.losses ?? 0;

  const lossesL =
    (userL.losses ?? 0) + 1;

  deltaW += Math.min(
    newStreakW,
    10
  );

  const newInternalW =
    rW + deltaW;

  const newInternalL =
    rL + deltaL;

  const newRatingW =
    Math.round(newInternalW);

  const newRatingL =
    Math.round(newInternalL);

  const newBestStreakW =
    Math.max(
      userW.best_streak ?? 0,
      newStreakW
    );

  const newBestStreakL =
    Math.max(
      userL.best_streak ?? 0,
      newStreakL
    );

  const matchesW =
    (userW.matches_played ?? 0) + 1;

  const matchesL =
    (userL.matches_played ?? 0) + 1;

  const updateSql = `
    UPDATE users
    SET
      rating = $1,
      internal_rating = $2,
      matches_played = $3,
      wins = $4,
      losses = $5,
      current_streak = $6,
      best_streak = $7
    WHERE id = $8
  `;

  await db.run(updateSql, [
    newRatingW,
    newInternalW,
    matchesW,
    winsW,
    lossesW,
    newStreakW,
    newBestStreakW,
    userW.id,
  ]);

  await db.run(updateSql, [
    newRatingL,
    newInternalL,
    matchesL,
    winsL,
    lossesL,
    newStreakL,
    newBestStreakL,
    userL.id,
  ]);

  try {
    await addBerriesByUserId(
      userW.id,
      300,
      "レート戦勝利報酬(切断)"
    );
  } catch (e) {
    log(
      "addBerriesByUserId error:",
      e
    );
  }
}

// ======================================================
// レートマッチング
// ======================================================

async function tryRateMatch() {
  log(
    "tryRateMatch, queue size:",
    rateQueue.length
  );

  if (rateQueue.length < 2) {
    return;
  }

  const first =
    rateQueue.shift();

  if (rateQueue.length === 0) {
    rateQueue.unshift(first);
    return;
  }

  if (rateQueue.length === 1) {
    const second =
      rateQueue.shift();

    await makeRoomAndNotify(
      first,
      second
    );

    return;
  }

  let bestIndex = 0;
  let bestDiff = Infinity;

  for (
    let i = 0;
    i < rateQueue.length;
    i++
  ) {
    const cand = rateQueue[i];

    const diff =
      Math.abs(
        (cand.rating ?? 1500) -
          (first.rating ?? 1500)
      );

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  const second =
    rateQueue.splice(
      bestIndex,
      1
    )[0];

  await makeRoomAndNotify(
    first,
    second
  );
}

async function makeRoomAndNotify(a, b) {
  const roomId =
    "r-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8);

  const userA = a.userId
    ? await getUserById(a.userId)
    : await getUserForMatch(a.name);

  const userB = b.userId
    ? await getUserById(b.userId)
    : await getUserForMatch(b.name);

  const displayRatingA =
    typeof userA?.rating === "number"
      ? userA.rating
      : typeof a.rating === "number"
      ? a.rating
      : 1500;

  const ratingForTitleA =
    typeof userA?.internal_rating === "number"
      ? userA.internal_rating
      : displayRatingA;

  const titleA =
    getRankName(
      ratingForTitleA
    );

  const displayNameA =
    userA?.display_name ||
    userA?.username ||
    a.name ||
    "プレイヤーA";

  const displayRatingB =
    typeof userB?.rating === "number"
      ? userB.rating
      : typeof b.rating === "number"
      ? b.rating
      : 1500;

  const ratingForTitleB =
    typeof userB?.internal_rating === "number"
      ? userB.internal_rating
      : displayRatingB;

  const titleB =
    getRankName(
      ratingForTitleB
    );

  const displayNameB =
    userB?.display_name ||
    userB?.username ||
    b.name ||
    "プレイヤーB";

  const teamA =
    userA?.id
      ? await getUserTeamByUserId(
          userA.id
        )
      : [];

  const teamB =
    userB?.id
      ? await getUserTeamByUserId(
          userB.id
        )
      : [];

  io.to(a.socketId).emit(
    "rate:matched",
    {
      roomId,
      opponentName:
        displayNameB,
      opponentDisplayName:
        displayNameB,
      opponentDisplayRating:
        displayRatingB,
      opponentInternalRating:
        ratingForTitleB,
      opponentTitle:
        titleB,
      selfUserId:
        userA?.id ?? null,
      selfDisplayName:
        displayNameA,
      selfDisplayRating:
        displayRatingA,
      selfInternalRating:
        ratingForTitleA,
      selfTitle:
        titleA,
      selfTeam:
        teamA,
      opponentUserId:
        userB?.id ?? null,
      opponentTeam:
        teamB,
    }
  );

  io.to(b.socketId).emit(
    "rate:matched",
    {
      roomId,
      opponentName:
        displayNameA,
      opponentDisplayName:
        displayNameA,
      opponentDisplayRating:
        displayRatingA,
      opponentInternalRating:
        ratingForTitleA,
      opponentTitle:
        titleA,
      selfUserId:
        userB?.id ?? null,
      selfDisplayName:
        displayNameB,
      selfDisplayRating:
        displayRatingB,
      selfInternalRating:
        ratingForTitleB,
      selfTitle:
        titleB,
      selfTeam:
        teamB,
      opponentUserId:
        userA?.id ?? null,
      opponentTeam:
        teamA,
    }
  );
}

// ======================================================
// Socket.IO
// ======================================================

io.on("connection", (socket) => {
  onlineCount += 1;

  log(
    "socket connected:",
    socket.id,
    "onlineCount:",
    onlineCount
  );

  // ====================================================
  // レートマッチ
  // ====================================================

  socket.on(
    "rate:join-queue",
    async ({
      name,
      rating,
      userId,
    }) => {
      const safeName =
        name || "プレイヤー";

      const safeRating =
        typeof rating === "number"
          ? rating
          : 1500;

      const safeUserId =
        typeof userId === "number" ||
        typeof userId === "string"
          ? userId
          : null;

      const idx =
        rateQueue.findIndex(
          (p) =>
            p.socketId ===
            socket.id
        );

      if (idx !== -1) {
        rateQueue.splice(
          idx,
          1
        );
      }

      rateQueue.push({
        socketId:
          socket.id,
        name: safeName,
        rating:
          safeRating,
        userId:
          safeUserId,
        joinedAt:
          Date.now(),
      });

      socket.emit(
        "rate:queue-updated",
        {
          size:
            rateQueue.length,
        }
      );

      await tryRateMatch();
    }
  );

  socket.on(
    "rate:leave-queue",
    () => {
      const idx =
        rateQueue.findIndex(
          (p) =>
            p.socketId ===
            socket.id
        );

      if (idx !== -1) {
        rateQueue.splice(
          idx,
          1
        );
      }

      socket.emit(
        "rate:queue-updated",
        {
          size:
            rateQueue.length,
        }
      );
    }
  );

  // ====================================================
  // ★ フリーマッチ
  // ====================================================

  // --------------------------------
  // 部屋を作る
  // --------------------------------

  socket.on(
    "free:create",
    ({ name, userId }) => {
      // 既存のフリーマッチ部屋から抜ける
      removeSocketFromFreeRooms(
        socket.id
      );

      const roomId =
        generateFreeRoomId();

      if (!roomId) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋を作成できませんでした。もう一度お試しください。",
          }
        );

        return;
      }

      const playerName =
        name || "プレイヤー";

const room = {
  roomId,
  hostSocketId:
    socket.id,
  hostUserId:
    userId ?? null,
  players:
    new Map(),
  selectedGame:
    null,
  createdAt:
    Date.now(),
};

 room.players.set(
  socket.id,
  {
    socketId:
      socket.id,
    userId:
      userId ?? null,
    name:
      playerName,
    isHost: true,
  }
);

      freeRooms.set(
        roomId,
        room
      );

      socket.join(
        `free:${roomId}`
      );

      log(
        "free room created:",
        roomId,
        playerName
      );

      socket.emit(
        "free:created",
        makeFreeRoomPayload(
          room
        )
      );

      broadcastFreeRoom(
        room
      );
    }
  );

  // --------------------------------
  // 部屋を探す
  // --------------------------------

  socket.on(
    "free:join",
    ({ roomId, name, userId }) => {
      const safeRoomId =
        String(
          roomId ?? ""
        ).replace(
          /\D/g,
          ""
        );

      if (
        safeRoomId.length !== 4
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋IDは4桁の数字で入力してください。",
          }
        );

        return;
      }

      const room =
        freeRooms.get(
          safeRoomId
        );

      if (!room) {
        socket.emit(
          "free:error",
          {
            message:
              "その部屋は見つかりませんでした。",
          }
        );

        return;
      }

      if (
        room.players.size >=
        FREE_ROOM_MAX_PLAYERS
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "この部屋は満員です。",
          }
        );

        return;
      }

      // すでに同じ部屋にいる場合
      if (
        room.players.has(
          socket.id
        )
      ) {
        socket.emit(
          "free:room-state",
          makeFreeRoomPayload(
            room
          )
        );

        return;
      }

      // 他の部屋にいた場合は抜ける
      removeSocketFromFreeRooms(
        socket.id
      );

      const playerName =
        name || "プレイヤー";

room.players.set(
  socket.id,
  {
    socketId:
      socket.id,
    userId:
      userId ?? null,
    name:
      playerName,
    isHost: false,
  }
);

      socket.join(
        `free:${safeRoomId}`
      );

      log(
        "free room joined:",
        safeRoomId,
        playerName,
        `${room.players.size}/${FREE_ROOM_MAX_PLAYERS}`
      );

      broadcastFreeRoom(
        room
      );
    }
  );

  // --------------------------------
  // 部屋から抜ける
  // --------------------------------

  socket.on(
    "free:leave",
    () => {
      removeSocketFromFreeRooms(
        socket.id
      );
    }
  );

  // --------------------------------
  // ゲーム選択
  // --------------------------------

  socket.on(
    "free:select-game",
    ({ roomId, gameId }) => {
      const safeRoomId =
        String(
          roomId ?? ""
        );

      const room =
        freeRooms.get(
          safeRoomId
        );

      if (!room) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋が見つかりません。",
          }
        );

        return;
      }

      // 部屋主だけゲームを選べる
      if (
        room.hostSocketId !==
        socket.id
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを選択できるのは部屋主です。",
          }
        );

        return;
      }

      room.selectedGame =
        gameId || null;

      log(
        "free game selected:",
        safeRoomId,
        room.selectedGame
      );

      broadcastFreeRoom(
        room
      );
    }
  );

  // --------------------------------
  // ゲーム開始
  //
  // 今はゲーム本体未実装なので
  // 選択状態だけ保持する。
  // 後で各ゲームの開始処理を追加。
  // --------------------------------

  socket.on(
    "free:start-game",
    ({ roomId }) => {
      const safeRoomId =
        String(
          roomId ?? ""
        );

      const room =
        freeRooms.get(
          safeRoomId
        );

      if (!room) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋が見つかりません。",
          }
        );

        return;
      }

      if (
        room.hostSocketId !==
        socket.id
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを開始できるのは部屋主です。",
          }
        );

        return;
      }

      if (!room.selectedGame) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを選択してください。",
          }
        );

        return;
      }

      // 現段階ではここまで。
      // 後で gameId ごとに実際のゲームへ移動する。
      io.to(
        `free:${safeRoomId}`
      ).emit(
        "free:game-start",
        {
          roomId:
            safeRoomId,
          gameId:
            room.selectedGame,
        }
      );
    }
  );

  // ====================================================
  // 通常バトル
  // ====================================================

  socket.on(
    "battle:join",
    ({
      roomId,
      playerName,
      userId,
    }) => {
      if (!roomId) return;

      let room =
        rooms.get(roomId);

      if (!room) {
        room = {
          players:
            new Map(),
          answers:
            new Map(),
          maxQuestions:
            30,
          isFinished:
            false,
          createdAt:
            Date.now(),
        };

        rooms.set(
          roomId,
          room
        );

        log(
          "room created:",
          roomId
        );
      }

      const name =
        playerName ||
        "プレイヤー";

      room.players.set(
        socket.id,
        {
          socketId:
            socket.id,
          name,
          score: 0,
          totalTimeMs: 0,
          userId:
            userId ?? null,
        }
      );

      socket.join(
        roomId
      );

      const playersArr =
        Array.from(
          room.players.values()
        );

      if (
        playersArr.length ===
          2 &&
        !room.isFinished
      ) {
        const [
          p0,
          p1,
        ] = playersArr;

        io.to(
          p0.socketId
        ).emit(
          "battle:start",
          {
            roomId,
            opponentName:
              p1.name,
            currentQuestionIndex:
              0,
          }
        );

        io.to(
          p1.socketId
        ).emit(
          "battle:start",
          {
            roomId,
            opponentName:
              p0.name,
            currentQuestionIndex:
              0,
          }
        );
      }
    }
  );

  socket.on(
    "battle:answer",
    async ({
      roomId,
      questionIndex,
      isCorrect,
      timeMs,
    }) => {
      const room =
        rooms.get(roomId);

      if (
        !room ||
        room.isFinished
      ) {
        return;
      }

      const player =
        room.players.get(
          socket.id
        );

      if (!player) return;

      const idx =
        typeof questionIndex ===
        "number"
          ? questionIndex
          : 0;

      const used =
        typeof timeMs ===
        "number"
          ? timeMs
          : 0;

      if (isCorrect) {
        player.score += 1;
      }

      player.totalTimeMs +=
        used;

      let ansMap =
        room.answers.get(
          idx
        );

      if (!ansMap) {
        ansMap = new Map();

        room.answers.set(
          idx,
          ansMap
        );
      }

      ansMap.set(
        socket.id,
        {
          isCorrect:
            !!isCorrect,
          timeMs:
            used,
        }
      );

      const playersArr =
        Array.from(
          room.players.values()
        );

      if (
        ansMap.size <
        playersArr.length
      ) {
        return;
      }

      const nextIndex =
        idx + 1;

      const maxQuestions =
        room.maxQuestions;

      const [
        p0,
        p1,
      ] = playersArr;

      let finished = false;

      if (
        p0.score >= 10 ||
        p1.score >= 10
      ) {
        finished = true;
      }

      if (
        nextIndex >=
        maxQuestions
      ) {
        finished = true;
      }

      if (finished) {
        room.isFinished =
          true;

        try {
          await updateRatingsNormalFinish(
            p0,
            p1
          );
        } catch (e) {
          log(
            "updateRatingsNormalFinish error:",
            e
          );
        }

        const makePayloadFor =
          (
            self,
            opp
          ) => {
            let outcome =
              "draw";

            if (
              self.score >
              opp.score
            ) {
              outcome =
                "win";
            } else if (
              self.score <
              opp.score
            ) {
              outcome =
                "lose";
            } else if (
              self.totalTimeMs <
              opp.totalTimeMs
            ) {
              outcome =
                "win";
            } else if (
              self.totalTimeMs >
              opp.totalTimeMs
            ) {
              outcome =
                "lose";
            }

            return {
              outcome,
              self: {
                score:
                  self.score,
                totalTimeMs:
                  self.totalTimeMs,
              },
              opponent: {
                score:
                  opp.score,
                totalTimeMs:
                  opp.totalTimeMs,
              },
            };
          };

        io.to(
          p0.socketId
        ).emit(
          "battle:finished",
          makePayloadFor(
            p0,
            p1
          )
        );

        io.to(
          p1.socketId
        ).emit(
          "battle:finished",
          makePayloadFor(
            p1,
            p0
          )
        );

        rooms.delete(
          roomId
        );
      } else {
        const scoresPayload =
          playersArr.map(
            (p) => ({
              socketId:
                p.socketId,
              name:
                p.name,
              score:
                p.score,
              totalTimeMs:
                p.totalTimeMs,
            })
          );

        setTimeout(() => {
          const currentRoom =
            rooms.get(
              roomId
            );

          if (
            !currentRoom ||
            currentRoom.isFinished
          ) {
            return;
          }

          const currentPlayers =
            Array.from(
              currentRoom.players.values()
            );

          currentPlayers.forEach(
            (p) => {
              io.to(
                p.socketId
              ).emit(
                "battle:next",
                {
                  roomId,
                  nextQuestionIndex:
                    nextIndex,
                  scores:
                    scoresPayload,
                }
              );
            }
          );
        }, 2000);
      }
    }
  );

  // ====================================================
  // 切断
  // ====================================================

  socket.on(
    "disconnect",
    async () => {
      onlineCount =
        Math.max(
          0,
          onlineCount - 1
        );

      log(
        "socket disconnected:",
        socket.id,
        "onlineCount:",
        onlineCount
      );

      // レートキューから削除
      const rateIndex =
        rateQueue.findIndex(
          (p) =>
            p.socketId ===
            socket.id
        );

      if (
        rateIndex !== -1
      ) {
        rateQueue.splice(
          rateIndex,
          1
        );
      }

      // ★ フリーマッチ部屋から削除
      removeSocketFromFreeRooms(
        socket.id
      );

      // 通常バトルから削除
      for (
        const [
          roomId,
          room,
        ] of rooms
      ) {
        if (
          room.players.has(
            socket.id
          )
        ) {
          const leaver =
            room.players.get(
              socket.id
            );

          room.players.delete(
            socket.id
          );

          const remaining =
            Array.from(
              room.players.values()
            );

          if (
            !room.isFinished &&
            remaining.length === 1
          ) {
            const winner =
              remaining[0];

            room.isFinished =
              true;

            try {
              await updateRatingsDisconnectFinish(
                winner,
                leaver
              );
            } catch (e) {
              log(
                "updateRatingsDisconnectFinish error:",
                e
              );
            }

            io.to(
              winner.socketId
            ).emit(
              "battle:finished",
              {
                outcome:
                  "win",
                self: {
                  score:
                    winner.score,
                  totalTimeMs:
                    winner.totalTimeMs,
                },
                opponent: {
                  score:
                    leaver.score ??
                    0,
                  totalTimeMs:
                    leaver.totalTimeMs ??
                    0,
                },
              }
            );

            rooms.delete(
              roomId
            );
          } else if (
            room.players.size ===
            0
          ) {
            rooms.delete(
              roomId
            );
          }
        }
      }
    }
  );
});

// ======================================================
// 起動
// ======================================================

httpServer.listen(
  PORT,
  () => {
    log(
      `Socket.IO server listening on port ${PORT}`
    );
  }
);

// ============================================================
// ミス・フライデーのえじき
// ============================================================
//
// 既存の rate / free 処理には手を入れない。
// このブロックを server.js の一番下に追加するだけ。
// ============================================================

const hawkGames = new Map();

const HAWK_SCORE_CARDS = [
  -5,
  -4,
  -3,
  -2,
  -1,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
];

const HAWK_TOTAL_ROUNDS = 15;


// ============================================================
// popularity.xlsx を読み込む
// ============================================================

async function loadHawkPopularityData() {
  try {
    const XLSX = await import('xlsx');

    const workbook =
      XLSX.default?.readFile
        ? XLSX.default
        : XLSX;

    const fs =
      await import('node:fs');

    const path =
      await import('node:path');

    const absolutePath =
      path.join(
        process.cwd(),
        'data',
        'popularity.xlsx'
      );

    if (
      !fs.existsSync(
        absolutePath
      )
    ) {
      throw new Error(
        `popularity.xlsx が見つかりません: ${absolutePath}`
      );
    }

    const wb =
      workbook.readFile(
        absolutePath
      );

    const sheetName =
      wb.SheetNames?.[0];

    if (!sheetName) {
      throw new Error(
        'popularity.xlsx にシートがありません。'
      );
    }

    const sheet =
      wb.Sheets[
        sheetName
      ];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          header: 1,
          defval: '',
        }
      );

    const characters = [];

    for (
      let i = 0;
      i < rows.length;
      i += 1
    ) {
      const row =
        rows[i];

      if (
        !Array.isArray(row) ||
        row.length < 2
      ) {
        continue;
      }

      const rawRank =
        row[0];

      const rawName =
        row[1];

      const rank =
        Number(
          String(
            rawRank
          )
            .replace(
              /,/g,
              ''
            )
            .trim()
        );

      const name =
        String(
          rawName ?? ''
        ).trim();

      if (
        !Number.isFinite(rank) ||
        rank <= 0 ||
        !name
      ) {
        continue;
      }

      characters.push({
        rank,
        name,
        sourceIndex: i,
      });
    }

    if (
      characters.length < 15
    ) {
      throw new Error(
        `popularity.xlsx から15人以上のキャラクターを読み込めませんでした。読み込み数: ${characters.length}`
      );
    }

    return characters;
  } catch (error) {
    console.error(
      '[hawk] popularity.xlsx 読み込みエラー:',
      error
    );

    throw error;
  }
}


// ============================================================
// Excelデータのキャッシュ
// ============================================================

let hawkPopularityCache =
  null;

async function getHawkPopularityData() {
  if (
    Array.isArray(
      hawkPopularityCache
    ) &&
    hawkPopularityCache.length > 0
  ) {
    return hawkPopularityCache;
  }

  hawkPopularityCache =
    await loadHawkPopularityData();

  return hawkPopularityCache;
}


// ============================================================
// Fisher-Yatesシャッフル
// ============================================================

function hawkShuffle(
  array
) {
  const result =
    [...array];

  for (
    let i =
      result.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


// ============================================================
// 人気順位から15キャラを選ぶ
// ============================================================
//
// スタート順位は完全ランダム。
// 例えば間隔10なら
//
// 45 → 55 → 65 → ... → 185
//
// のように15人を選ぶ。
// 実際の順位に存在しない場合は一番近い順位を使用。
// 同距離ならランダム。
// 最後にカード表示順もシャッフル。
// ============================================================

function hawkSelectCharacters(
  popularityData,
  interval
) {
  if (
    !Array.isArray(popularityData) ||
    popularityData.length === 0
  ) {
    return [];
  }

  const sorted =
    popularityData
      .filter(
        (item) =>
          Number.isFinite(
            Number(item.rank)
          ) &&
          item.name
      )
      .map(
        (item) => ({
          ...item,
          rank:
            Number(
              item.rank
            ),
        })
      )
      .sort(
        (a, b) =>
          a.rank -
          b.rank
      );

  if (
    sorted.length === 0
  ) {
    return [];
  }

  const step =
    Math.max(
      1,
      Number(interval) || 1
    );

  const maxRank =
    sorted[
      sorted.length - 1
    ].rank;

  const maxStart =
    Math.max(
      1,
      maxRank -
        step * 14
    );

  const startRank =
    1 +
    Math.floor(
      Math.random() *
        maxStart
    );

  const selected = [];

  const usedNames =
    new Set();

  for (
    let i = 0;
    i < 15;
    i += 1
  ) {
    const targetRank =
      startRank +
      step * i;

    const available =
      sorted.filter(
        (item) =>
          !usedNames.has(
            item.name
          )
      );

    if (
      available.length === 0
    ) {
      break;
    }

    let minDistance =
      Infinity;

    for (
      const item of available
    ) {
      const distance =
        Math.abs(
          item.rank -
            targetRank
        );

      if (
        distance <
        minDistance
      ) {
        minDistance =
          distance;
      }
    }

    const candidates =
      available.filter(
        (item) =>
          Math.abs(
            item.rank -
              targetRank
          ) ===
          minDistance
      );

    const selectedItem =
      candidates[
        Math.floor(
          Math.random() *
            candidates.length
        )
      ];

    selected.push({
      ...selectedItem,
      targetRank,
    });

    usedNames.add(
      selectedItem.name
    );
  }

  return hawkShuffle(
    selected
  );
}


// ============================================================
// クライアントに送ってよいカード情報
// ============================================================

function hawkPublicCard(
  card
) {
  if (!card) {
    return null;
  }

  return {
    id:
      card.id,
    name:
      card.name,
  };
}


// ============================================================
// 現在のプレイヤー一覧
// ============================================================

function hawkGetPlayers(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (!room) {
    return [];
  }

  if (
    room.players instanceof Map
  ) {
    return Array.from(
      room.players.values()
    );
  }

  if (
    Array.isArray(
      room.players
    )
  ) {
    return room.players;
  }

  return [];
}


// ============================================================
// 現在の得点
// ============================================================

function hawkGetScores(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  return players.map(
    (player) => ({
      socketId:
        player.socketId,

      name:
        player.name ||
        'プレイヤー',

      score:
        Number(
          game.scores[
            player.socketId
          ] ?? 0
        ),
    })
  );
}


// ============================================================
// 部屋状態を各プレイヤーへ送信
// ============================================================

function hawkBroadcastRoomState(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (!room) {
    return;
  }

  const players =
    hawkGetPlayers(
      game
    );

  const payload = {
    room: {
      roomId:
        room.roomId,

      players:
        players.map(
          (player) => ({
            socketId:
              player.socketId,

            userId:
              player.userId ??
              null,

            name:
              player.name ||
              'プレイヤー',

            isHost:
              player.socketId ===
              room.hostSocketId,

            playerNumber:
              player.playerNumber,
          })
        ),

      maxPlayers:
        FREE_ROOM_MAX_PLAYERS,

      hostSocketId:
        room.hostSocketId,

      hostUserId:
        room.hostUserId ??
        null,
    },

    phase:
      game.phase,

    scores:
      hawkGetScores(
        game
      ),
  };

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'hawk:room-state',
        payload
      );
    }
  }
}


// ============================================================
// 自分の手札を送る
// ============================================================

function hawkSendMyCards(
  game,
  socket
) {
  if (!socket) {
    return;
  }

  const hand =
    game.hands[
      socket.id
    ];

  if (
    !Array.isArray(hand)
  ) {
    return;
  }

  const publicCards =
    hand
      .map(
        (cardId) =>
          hawkPublicCard(
            game.cardMap[
              cardId
            ]
          )
      )
      .filter(Boolean);

  socket.emit(
    'hawk:my-cards',
    {
      cards:
        publicCards,
    }
  );
}


// ============================================================
// 全員へ自分の手札を送る
// ============================================================

function hawkSendAllHands(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      hawkSendMyCards(
        game,
        targetSocket
      );
    }
  }
}


// ============================================================
// ラウンド開始
// ============================================================

function hawkEmitRoundStarted(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  const nextScore =
    game.scoreDeck.shift();

  if (
    nextScore !== undefined
  ) {
    game.currentScore =
      nextScore;

    game.carryCards = [
      ...game.carryCards,
      nextScore,
    ];
  }

  const scoreTotal =
    game.carryCards.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    );

  game.currentScoreTotal =
    scoreTotal;

  game.played =
    {};

  game.phase =
    'playing';

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'hawk:round-started',
      {
        round:
          game.round,

        scoreCard:
          scoreTotal,

        scoreCards:
          [
            ...game.carryCards,
          ],

        scores:
          hawkGetScores(
            game
          ),
      }
    );

    hawkSendMyCards(
      game,
      targetSocket
    );
  }

  console.log(
    `[hawk] round ${game.round} start room=${game.roomId} score=${scoreTotal} cards=${game.carryCards.join(',')}`
  );
}


// ============================================================
// ゲーム開始
// ============================================================

async function hawkStartGame(
  game,
  interval
) {
  const popularityData =
    await getHawkPopularityData();

  const selectedRaw =
    hawkSelectCharacters(
      popularityData,
      interval
    );

  /*
   * 各カードにゲーム内専用IDを付ける。
   */
  const selected =
    selectedRaw.map(
      (card, index) => ({
        ...card,
        id:
          `hawk-card-${index}`,
      })
    );

  if (
    selected.length !==
    15
  ) {
    throw new Error(
      `キャラクターカードを15枚作成できませんでした。作成数: ${selected.length}`
    );
  }

  game.interval =
    interval;

  game.characters =
    selected;

  game.cardMap =
    {};

  for (
    const card of selected
  ) {
    game.cardMap[
      card.id
    ] = card;
  }

  /*
   * 全員同じ15枚を持つ。
   */
  game.hands =
    {};

  const players =
    hawkGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    game.hands[
      player.socketId
    ] =
      selected.map(
        (card) =>
          card.id
      );
  }

  /*
   * 得点カードをシャッフル。
   */
  game.scoreDeck =
    hawkShuffle(
      HAWK_SCORE_CARDS
    );

  game.carryCards =
    [];

  game.currentScore =
    null;

  game.currentScoreTotal =
    null;

  game.round =
    1;

  game.played =
    {};

  game.scores =
    {};

  game.cardHistory =
    [];

  for (
    const player of players
  ) {
    game.scores[
      player.socketId
    ] = 0;
  }

  game.phase =
    'playing';

  /*
   * ゲーム中は名前だけ。
   * rankは絶対に送らない。
   */
  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'hawk:game-started',
      {
        round:
          game.round,

        scoreCard:
          null,

        myCards:
          selected.map(
            hawkPublicCard
          ),

        scores:
          hawkGetScores(
            game
          ),
      }
    );
  }

  /*
   * 1枚目の得点カードを開始。
   */
  hawkEmitRoundStarted(
    game
  );

  hawkBroadcastRoomState(
    game
  );

  console.log(
    `[hawk] game started room=${game.roomId} interval=${interval} characters=${selected.length}`
  );
}


// ============================================================
// ラウンド判定
// ============================================================

function hawkResolveRound(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  const playedCards =
    players
      .map(
        (player) => {
          const cardId =
            game.played[
              player.socketId
            ];

          const card =
            game.cardMap[
              cardId
            ];

          if (!card) {
            return null;
          }

          return {
            socketId:
              player.socketId,

            playerName:
              player.name ||
              'プレイヤー',

            cardId:
              card.id,

            name:
              card.name,

            rank:
              card.rank,
          };
        }
      )
      .filter(Boolean);

  const publicPlayedCards =
    playedCards.map(
      (card) => ({
        socketId:
          card.socketId,

        playerName:
          card.playerName,

        cardId:
          card.cardId,

        name:
          card.name,
      })
    );

  const score =
    game.carryCards.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    );

  /*
   * 同じ人気順位を出した人は全員無効。
   */
  const rankCount =
    new Map();

  for (
    const card of playedCards
  ) {
    const count =
      rankCount.get(
        card.rank
      ) || 0;

    rankCount.set(
      card.rank,
      count + 1
    );
  }

  const eligible =
    playedCards.filter(
      (card) =>
        rankCount.get(
          card.rank
        ) === 1
    );

  let winner =
    null;

  if (
    eligible.length > 0
  ) {
    /*
     * プラス・0：
     * 人気順位の数字が小さい方が強い。
     *
     * マイナス：
     * 人気順位の数字が大きい方が強い。
     */
    if (
      score >= 0
    ) {
      winner =
        [...eligible].sort(
          (a, b) =>
            a.rank -
            b.rank
        )[0];
    } else {
      winner =
        [...eligible].sort(
          (a, b) =>
            b.rank -
            a.rank
        )[0];
    }
  }

  /*
   * 全員バッティング。
   */
  if (!winner) {
    const lastRound =
      game.round >=
      HAWK_TOTAL_ROUNDS;

    const playersNow =
      hawkGetPlayers(
        game
      );

    for (
      const player of playersNow
    ) {
      const targetSocket =
        io.sockets.sockets.get(
          player.socketId
        );

      if (
        targetSocket
      ) {
        targetSocket.emit(
          'hawk:cards-revealed',
          {
            playedCards:
              publicPlayedCards,
          }
        );
      }
    }

    if (
      lastRound
    ) {
      return {
        winner:
          null,

        score,

        winnerName:
          null,

        tieInfo:
          '全員のカードが無効になったため、この得点カードは誰も獲得しません。',

        playedCards:
          publicPlayedCards,

        finished:
          true,
      };
    }

    return {
      winner:
        null,

      score,

      winnerName:
        null,

      tieInfo:
        '全員のカードが無効になりました。得点カードは次のラウンドへ持ち越されます。',

      playedCards:
        publicPlayedCards,

      finished:
        false,
    };
  }

  /*
   * 勝者が得点カードを獲得。
   */
  game.scores[
    winner.socketId
  ] =
    Number(
      game.scores[
        winner.socketId
      ] ?? 0
    ) + score;

  /*
   * キャリーオーバーを空にする。
   */
  game.carryCards =
    [];

  const playersNow =
    hawkGetPlayers(
      game
    );

  for (
    const player of playersNow
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'hawk:cards-revealed',
        {
          playedCards:
            publicPlayedCards,
        }
      );
    }
  }

  return {
    winner:
      winner.socketId,

    score,

    winnerName:
      winner.playerName,

    tieInfo:
      null,

    playedCards:
      publicPlayedCards,

    finished:
      false,
  };
}


// ============================================================
// 最終結果を作成
// ============================================================

function hawkBuildFinalResults(
  game
) {
  return game.characters.map(
    (card) => {
      const history =
        [];

      for (
        const item of
          game.cardHistory ||
          []
      ) {
        const played =
          item.playedCards?.find(
            (playedCard) =>
              playedCard.cardId ===
              card.id
          );

        if (
          played
        ) {
          history.push(
            `第${item.round}回戦：${played.playerName}`
          );
        }
      }

      return {
        cardId:
          card.id,

        name:
          card.name,

        rank:
          card.rank,

        targetRank:
          card.targetRank,

        history:
          history.join(
            ' / '
          ),
      };
    }
  );
}


// ============================================================
// ゲーム終了
// ============================================================

function hawkFinishGame(
  game
) {
  game.phase =
    'finished';

  const players =
    hawkGetPlayers(
      game
    );

  const scores =
    hawkGetScores(
      game
    );

  const results =
    hawkBuildFinalResults(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'hawk:game-finished',
      {
        scores,
        results,
      }
    );
  }

  hawkBroadcastRoomState(
    game
  );

  console.log(
    `[hawk] game finished room=${game.roomId}`
  );
}


// ============================================================
// Hawk専用Socket.IO
// ============================================================

io.on(
  'connection',
  (socket) => {

    // ========================================================
    // Hawk 部屋へ参加
    // ========================================================

    socket.on(
      'hawk:join',
      (payload) => {
        const safeRoomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        if (
          safeRoomId.length !==
          4
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '部屋IDが正しくありません。',
            }
          );

          return;
        }

        const room =
          freeRooms.get(
            safeRoomId
          );

        if (!room) {
          socket.emit(
            'hawk:error',
            {
              message:
                'フリーマッチ部屋が見つかりません。',
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const incomingName =
          String(
            payload?.name ||
              ''
          ).trim();

        const freePlayers =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              )
            : Array.isArray(
                room.players
              )
              ? room.players
              : [];

        let playerIndex =
          freePlayers.findIndex(
            (item) =>
              item.socketId ===
              socket.id
          );

        /*
         * userIdで探す。
         */
        if (
          playerIndex < 0 &&
          incomingUserId
        ) {
          playerIndex =
            freePlayers.findIndex(
              (item) =>
                item.userId != null &&
                String(
                  item.userId
                ) ===
                  incomingUserId
            );
        }

        /*
         * 名前で探す。
         */
        if (
          playerIndex < 0 &&
          incomingName
        ) {
          const sameNamePlayers =
            freePlayers.filter(
              (item) =>
                String(
                  item.name ||
                    ''
                ).trim() ===
                incomingName
            );

          if (
            sameNamePlayers.length ===
            1
          ) {
            playerIndex =
              freePlayers.findIndex(
                (item) =>
                  String(
                    item.name ||
                      ''
                  ).trim() ===
                  incomingName
              );
          }
        }

        if (
          playerIndex < 0
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'この部屋の参加者ではありません。',
            }
          );

          return;
        }

        const player =
          freePlayers[
            playerIndex
          ];

        const oldSocketId =
          player.socketId;

        /*
         * ホスト判定。
         */
        const hostUserId =
          room.hostUserId != null
            ? String(
                room.hostUserId
              )
            : String(
                room.hostSocketId ||
                  ''
              );

        const wasHost =
          (
            player.userId != null &&
            String(
              player.userId
            ) ===
              hostUserId
          ) ||
          oldSocketId ===
            room.hostSocketId;

        /*
         * 古いSocketを部屋から離す。
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const oldSocket =
            io.sockets.sockets.get(
              oldSocketId
            );

          if (oldSocket) {
            oldSocket.leave(
              `free:${safeRoomId}`
            );
          }
        }

        /*
         * Socket IDを更新。
         */
        player.socketId =
          socket.id;

        if (
          wasHost
        ) {
          room.hostSocketId =
            socket.id;
        }

        /*
         * 全員のホスト状態を更新。
         */
        if (
          room.players instanceof Map
        ) {
          for (
            const item of
              room.players.values()
          ) {
            item.isHost =
              item.socketId ===
              room.hostSocketId;
          }
        } else if (
          Array.isArray(
            room.players
          )
        ) {
          for (
            const item of
              room.players
          ) {
            item.isHost =
              item.socketId ===
              room.hostSocketId;
          }
        }

        console.log(
          `[hawk] player transfer room=${safeRoomId} name=${player.name} oldSocket=${oldSocketId} newSocket=${socket.id} isHost=${room.hostSocketId === socket.id}`
        );

        let game =
          hawkGames.get(
            safeRoomId
          );

        if (!game) {
          game = {
            roomId:
              safeRoomId,

            phase:
              'setup',

            interval:
              null,

            characters:
              [],

            cardMap:
              {},

            hands:
              {},

            scoreDeck:
              [],

            carryCards:
              [],

            currentScore:
              null,

            currentScoreTotal:
              null,

            round:
              0,

            played:
              {},

            scores:
              {},

            cardHistory:
              [],
          };

          hawkGames.set(
            safeRoomId,
            game
          );
        }

        /*
         * ゲーム開始後の再接続なら
         * 古いSocketのデータを新しいSocketへ移す。
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          if (
            game.hands[
              oldSocketId
            ]
          ) {
            game.hands[
              socket.id
            ] =
              game.hands[
                oldSocketId
              ];

            delete game.hands[
              oldSocketId
            ];
          }

          if (
            game.played[
              oldSocketId
            ]
          ) {
            game.played[
              socket.id
            ] =
              game.played[
                oldSocketId
              ];

            delete game.played[
              oldSocketId
            ];
          }

          if (
            game.scores[
              oldSocketId
            ] !== undefined
          ) {
            game.scores[
              socket.id
            ] =
              game.scores[
                oldSocketId
              ];

            delete game.scores[
              oldSocketId
            ];
          }
        }

        /*
         * ゲーム開始後に新しく入ってきた場合は
         * 現在のゲームへ参加させない。
         *
         * 再接続で手札が移されていれば許可。
         */
        if (
          game.phase !==
            'setup' &&
          !game.hands[
            socket.id
          ]
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'このゲームはすでに開始されています。',
            }
          );

          return;
        }

        /*
         * スコア初期化。
         */
        if (
          game.scores[
            socket.id
          ] === undefined
        ) {
          game.scores[
            socket.id
          ] = 0;
        }

        socket.join(
          `hawk:${safeRoomId}`
        );

        console.log(
          `[hawk] join room=${safeRoomId} socket=${socket.id}`
        );

        hawkBroadcastRoomState(
          game
        );

        socket.emit(
          'hawk:connected'
        );

        /*
         * ゲーム中なら自分の手札を復元。
         */
        if (
          game.phase ===
            'playing' ||
          game.phase ===
            'result'
        ) {
          hawkSendMyCards(
            game,
            socket
          );

          socket.emit(
            'hawk:round-started',
            {
              round:
                game.round,

              scoreCard:
                game.currentScoreTotal,

              scoreCards:
                [
                  ...game.carryCards,
                ],

              scores:
                hawkGetScores(
                  game
                ),
            }
          );
        }

        /*
         * ゲーム終了後なら最終結果も送る。
         */
        if (
          game.phase ===
          'finished'
        ) {
          socket.emit(
            'hawk:game-finished',
            {
              scores:
                hawkGetScores(
                  game
                ),

              results:
                hawkBuildFinalResults(
                  game
                ),
            }
          );
        }
      }
    );


    // ========================================================
    // ゲーム設定開始
    // ========================================================

    socket.on(
      'hawk:start-setup',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム設定を変更できるのは部屋主だけです。',
            }
          );

          return;
        }

        game.phase =
          'setup';

        socket.emit(
          'hawk:setup',
          {
            interval:
              game.interval ||
              10,
          }
        );

        hawkBroadcastRoomState(
          game
        );
      }
    );


    // ========================================================
    // ゲーム開始
    // ========================================================

    socket.on(
      'hawk:start-game',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const interval =
          Number(
            payload?.interval
          );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲームを開始できるのは部屋主です。',
            }
          );

          return;
        }

        const playerCount =
          room.players instanceof Map
            ? room.players.size
            : Array.isArray(
                room.players
              )
              ? room.players.length
              : 0;

        if (
          playerCount < 2
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ミス・フライデーのえじきは2人以上必要です。',
            }
          );

          return;
        }

        if (
          playerCount > 4
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ミス・フライデーのえじきは4人までです。',
            }
          );

          return;
        }

        if (
          !Number.isInteger(
            interval
          ) ||
          interval <= 0
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '指定間隔は1以上の整数にしてください。',
            }
          );

          return;
        }

        try {
          await hawkStartGame(
            game,
            interval
          );
        } catch (
          error
        ) {
          console.error(
            '[hawk] start error',
            error
          );

          socket.emit(
            'hawk:error',
            {
              message:
                error?.message ||
                'ゲーム開始時にエラーが発生しました。',
            }
          );
        }
      }
    );




    // ========================================================
    // カードを出す
    // ========================================================

    socket.on(
      'hawk:play-card',
      (payload) => {

        console.log(
          '[hawk:play-card] RECEIVED',
          {
            socketId:
              socket.id,

            payload,
          }
        );

        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const cardId =
          String(
            payload?.cardId ||
              ''
          );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        if (
          game.phase !==
          'playing'
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '現在カードを出せる状態ではありません。',
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const player =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              ).find(
                (item) => {
                  if (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) {
                    return true;
                  }

                  return (
                    item.socketId ===
                    socket.id
                  );
                }
              )
            : room.players?.find(
                (item) => {
                  if (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) {
                    return true;
                  }

                  return (
                    item.socketId ===
                    socket.id
                  );
                }
              );

        console.log(
          '[hawk:play-card] lookup:',
          {
            socketId:
              socket.id,

            incomingUserId,

            players:
              room.players instanceof Map
                ? Array.from(
                    room.players.values()
                  ).map(
                    (p) => ({
                      socketId:
                        p.socketId,

                      userId:
                        p.userId,

                      name:
                        p.name,
                    })
                  )
                : room.players,
          }
        );

        if (!player) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム参加者ではありません。',
            }
          );

          return;
        }

        // ======================================================
        // プレイヤー識別
        // ======================================================

        const playerSocketId =
          player.socketId;

        // ======================================================
        // このラウンドですでにカードを出しているか確認
        // ※ Extra Poker の処理は使わない
        // ======================================================

        if (
          game.played &&
          game.played[playerSocketId]
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'このラウンドでは既にカードを出しています。',
            }
          );

          return;
        }

        /*
         * プレイヤー本人のSocket IDで手札を取得。
         */
        const hand =
          game.hands[
            playerSocketId
          ];

        if (
          !Array.isArray(hand)
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '手札が見つかりません。',
            }
          );

          return;
        }

        if (
          !hand.includes(
            cardId
          )
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'そのカードは現在の手札にありません。',
            }
          );

          return;
        }

        /*
         * 手札から削除。
         */
        game.hands[
          playerSocketId
        ] =
          hand.filter(
            (id) =>
              id !==
              cardId
          );

        /*
         * 場に出したカードを記録。
         */
        game.played[
          playerSocketId
        ] =
          cardId;

        console.log(
          '[hawk:play-card] SAVED',
          {
            roomId,
            playerSocketId,
            cardId,
            played:
              game.played,
          }
        );

        /*
         * 自分の残り手札を更新。
         */
        hawkSendMyCards(
          game,
          socket
        );

        /*
         * 全員出したか確認。
         */
        const players =
          hawkGetPlayers(
            game
          );

        const allSubmitted =
          players.length > 0 &&
          players.every(
            (player) =>
              Boolean(
                game.played[
                  player.socketId
                ]
              )
          );

        console.log(
          '[hawk:play-card] SUBMISSION CHECK',
          {
            roomId,
            playerCount:
              players.length,
            playedCount:
              Object.keys(
                game.played || {}
              ).length,
            allSubmitted,
          }
        );

        if (
          !allSubmitted
        ) {
          return;
        }

        console.log(
          '[hawk:play-card] ALL SUBMITTED',
          roomId
        );

        /*
         * 全員公開。
         */
        const result =
          hawkResolveRound(
            game
          );

        /*
         * 履歴を保存。
         */
        const historyPlayed =
          players
            .map(
              (player) => {
                const id =
                  game.played[
                    player.socketId
                  ];

                const card =
                  game.cardMap[
                    id
                  ];

                if (!card) {
                  return null;
                }

                return {
                  socketId:
                    player.socketId,

                  playerName:
                    player.name ||
                    'プレイヤー',

                  cardId:
                    card.id,

                  name:
                    card.name,

                  rank:
                    card.rank,
                };
              }
            )
            .filter(Boolean);

        if (
          !Array.isArray(
            game.cardHistory
          )
        ) {
          game.cardHistory =
            [];
        }

        game.cardHistory.push({
          round:
            game.round,

          playedCards:
            historyPlayed,
        });

        game.phase =
          'result';

        /*
         * ラウンド結果を全員へ。
         */
        for (
          const player of players
        ) {
          const targetSocket =
            io.sockets.sockets.get(
              player.socketId
            );

          if (
            !targetSocket
          ) {
            continue;
          }

          targetSocket.emit(
            'hawk:round-result',
            {
              winnerName:
                result.winnerName,

              score:
                result.score,

              tieInfo:
                result.tieInfo,

              scores:
                hawkGetScores(
                  game
                ),
            }
          );
        }

        console.log(
          `[hawk] round=${game.round} room=${roomId} winner=${result.winnerName || 'none'} score=${result.score}`
        );

        /*
         * 15回戦終了。
         */
        if (
          game.round >=
          HAWK_TOTAL_ROUNDS
        ) {
          hawkFinishGame(
            game
          );
        }
      }
    );


    // ========================================================
    // 次のラウンド
    // ========================================================

    socket.on(
      'hawk:next-round',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '次のラウンドを開始できるのは部屋主です。',
            }
          );

          return;
        }

        if (
          game.phase !==
          'result'
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '現在は次のラウンドへ進めません。',
            }
          );

          return;
        }

        if (
          game.round >=
          HAWK_TOTAL_ROUNDS
        ) {
          hawkFinishGame(
            game
          );

          return;
        }

        game.round +=
          1;

        game.played =
          {};

        hawkEmitRoundStarted(
          game
        );

        hawkBroadcastRoomState(
          game
        );
      }
    );


    // ========================================================
    // 切断
    // ========================================================

    socket.on(
      'disconnect',
      () => {

        /*
         * Hawkゲームを確認。
         */
        for (
          const [
            roomId,
            game,
          ] of hawkGames
        ) {
          const room =
            freeRooms.get(
              roomId
            );

          if (!room) {
            hawkGames.delete(
              roomId
            );

            continue;
          }

          const wasPlayer =
            room.players instanceof Map
              ? Array.from(
                  room.players.values()
                ).some(
                  (player) =>
                    player.socketId ===
                    socket.id
                )
              : Array.isArray(
                  room.players
                )
                ? room.players.some(
                    (player) =>
                      player.socketId ===
                      socket.id
                  )
                : false;

          if (
            !wasPlayer
          ) {
            continue;
          }

          /*
           * まだゲーム開始前なら
           * free room側の処理に任せる。
           */
          if (
            game.phase ===
            'setup'
          ) {
            hawkBroadcastRoomState(
              game
            );

            continue;
          }

          /*
           * ゲーム中に切断した場合。
           */
          delete game.hands[
            socket.id
          ];

          delete game.played[
            socket.id
          ];

          delete game.scores[
            socket.id
          ];

          const remaining =
            hawkGetPlayers(
              game
            );

          /*
           * 残ったプレイヤーが2人未満なら終了。
           */
          if (
            remaining.length <
            2
          ) {
            game.phase =
              'finished';

            for (
              const player of
                remaining
            ) {
              const targetSocket =
                io.sockets.sockets.get(
                  player.socketId
                );

              if (
                targetSocket
              ) {
                targetSocket.emit(
                  'hawk:error',
                  {
                    message:
                      'プレイヤーが退出したため、ゲームを終了しました。',
                  }
                );
              }
            }

            hawkGames.delete(
              roomId
            );

            continue;
          }

          /*
           * 既に全員出していた場合は
           * 残ったメンバーだけで判定。
           */
          if (
            game.phase ===
            'playing'
          ) {
            const allSubmitted =
              remaining.every(
                (player) =>
                  Boolean(
                    game.played[
                      player.socketId
                    ]
                  )
              );

            if (
              allSubmitted
            ) {
              const result =
                hawkResolveRound(
                  game
                );

              game.phase =
                'result';

              for (
                const player of
                  remaining
              ) {
                const targetSocket =
                  io.sockets.sockets.get(
                    player.socketId
                  );

                if (
                  !targetSocket
                ) {
                  continue;
                }

                targetSocket.emit(
                  'hawk:round-result',
                  {
                    winnerName:
                      result.winnerName,

                    score:
                      result.score,

                    tieInfo:
                      result.tieInfo,

                    scores:
                      hawkGetScores(
                        game
                      ),
                  }
                );
              }
            }
          }

          hawkBroadcastRoomState(
            game
          );
        }
      }
    );
  }
);

// ============================================================
// エクストラポーカー
// ============================================================
//
// 既存の rate / free / Hawk 処理には手を入れない。
// このブロックを server.js の一番下に追加する。
// ============================================================

const extraPokerGames = new Map();

const EXTRA_POKER_DEFAULT_CHIPS = 10000;
const EXTRA_POKER_DEFAULT_ROUNDS = 3;
const EXTRA_POKER_DEFAULT_MIN_BET = 100;
const EXTRA_POKER_DEFAULT_MAX_BET = 2000;


// ============================================================
// Excel読み込み
// ============================================================

async function loadExtraPokerData() {
  try {
    const XLSX = await import('xlsx');

    const workbook =
      XLSX.default?.readFile
        ? XLSX.default
        : XLSX;

    const fs =
      await import('node:fs');

    const path =
      await import('node:path');

    const absolutePath =
      path.join(
        process.cwd(),
        'data',
        'extra.xlsx'
      );

    if (
      !fs.existsSync(
        absolutePath
      )
    ) {
      throw new Error(
        `extra.xlsx が見つかりません: ${absolutePath}`
      );
    }

    const wb =
      workbook.readFile(
        absolutePath
      );

    const sheetName =
      wb.SheetNames?.[0];

    if (!sheetName) {
      throw new Error(
        'extra.xlsx にシートがありません。'
      );
    }

    const sheet =
      wb.Sheets[
        sheetName
      ];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          header: 1,
          defval: '',
        }
      );

    const characters = [];

    for (
      let i = 0;
      i < rows.length;
      i += 1
    ) {
      const row =
        rows[i];

      if (
        !Array.isArray(row) ||
        row.length < 2
      ) {
        continue;
      }

      const name =
        String(
          row[0] ?? ''
        ).trim();

      const description =
        String(
          row[1] ?? ''
        ).trim();

      if (
        !name ||
        !description
      ) {
        continue;
      }

      characters.push({
        id:
          `extra-character-${i}`,

        name,

        description,
      });
    }

    if (
      characters.length === 0
    ) {
      throw new Error(
        'extra.xlsx からキャラクターを読み込めませんでした。'
      );
    }

    return characters;
  } catch (error) {
    console.error(
      '[extra-poker] extra.xlsx 読み込みエラー:',
      error
    );

    throw error;
  }
}


// ============================================================
// Excelキャッシュ
// ============================================================

let extraPokerDataCache = null;

async function getExtraPokerData() {
  if (
    Array.isArray(
      extraPokerDataCache
    ) &&
    extraPokerDataCache.length > 0
  ) {
    return extraPokerDataCache;
  }

  extraPokerDataCache =
    await loadExtraPokerData();

  return extraPokerDataCache;
}


// ============================================================
// シャッフル
// ============================================================

function extraPokerShuffle(
  array
) {
  const result =
    [...array];

  for (
    let i =
      result.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


// ============================================================
// 文字種判定
// ============================================================

function extraPokerCharType(char) {
  if (char === 'ー') {
    return 'katakana';
  }

  if (
    /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(
      char
    )
  ) {
    return 'kanji';
  }

  if (
    /[\u3040-\u309F]/u.test(
      char
    )
  ) {
    return 'hiragana';
  }

  if (
    /[\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/u.test(
      char
    )
  ) {
    return 'katakana';
  }

  if (
    /\p{Number}/u.test(
      char
    )
  ) {
    return 'number';
  }

  return 'symbol';
}


// ============================================================
// 説明文をカード化
// ============================================================

function extraPokerBuildCards(description) {
  const chars = Array.from(
    String(description || '')
  );

  const groups = [];

  let currentType = null;
  let currentText = '';

  const flush = () => {
    if (!currentText) {
      return;
    }

    if (
      currentType === 'hiragana' &&
      Array.from(currentText).length === 1
    ) {
      currentText = '';
      return;
    }

    if (
      currentType !== 'symbol'
    ) {
      groups.push(currentText);
    }

    currentText = '';
  };

  for (
    const char of chars
  ) {
    const type =
      extraPokerCharType(char);

    if (
      type === 'symbol'
    ) {
      flush();

      currentType = null;

      continue;
    }

    if (
      currentType === null
    ) {
      currentType = type;
      currentText = char;

      continue;
    }

    if (
      type === currentType
    ) {
      currentText += char;

      continue;
    }

    flush();

    currentType = type;
    currentText = char;
  }

  flush();

  return groups.map(
    (
      text,
      index
    ) => ({
      id:
        `extra-card-${index}-${Math.random().toString(36).slice(2)}`,

      text,

      index,
    })
  );
}


// ============================================================
// プレイヤー取得
// ============================================================

function extraPokerGetPlayers(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (!room) {
    return [];
  }

  if (
    room.players instanceof Map
  ) {
    return Array.from(
      room.players.values()
    );
  }

  if (
    Array.isArray(
      room.players
    )
  ) {
    return room.players;
  }

  return [];
}


// ============================================================
// ゲーム参加者として有効なプレイヤー
// ============================================================

function extraPokerGetActivePlayers(
  game
) {
  return extraPokerGetPlayers(
    game
  ).filter(
    (player) =>
      Number(
        game.chips[
          player.socketId
        ] ?? 0
      ) > 0 &&
      !game.eliminated[
        player.socketId
      ]
  );
}


// ============================================================
// 現在のアクション対象プレイヤー
// ============================================================

function extraPokerGetActionPlayers(
  game
) {
  return extraPokerGetActivePlayers(
    game
  ).filter(
    (player) =>
      !game.folded[
        player.socketId
      ] &&
      !game.answerLost[
        player.socketId
      ]
  );
}


// ============================================================
// 公開用プレイヤー情報
// ============================================================

function extraPokerPublicPlayers(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  return players.map(
    (player) => {
      const socketId =
        player.socketId;

      return {
        socketId,

        name:
          player.name ||
          'プレイヤー',

        playerNumber:
          player.playerNumber,

        chips:
          Number(
            game.chips[
              socketId
            ] ?? 0
          ),

        eliminated:
          Boolean(
            game.eliminated[
              socketId
            ]
          ),

        folded:
          Boolean(
            game.folded[
              socketId
            ]
          ),

        answerLost:
          Boolean(
            game.answerLost[
              socketId
            ]
          ),

        answerLocked:
          Boolean(
            game.answerLocked[
              socketId
            ]
          ),

        answerSubmitted:
          Boolean(
            game.answerSubmitted[
              socketId
            ]
          ),

        contribution:
          Number(
            game.contributions[
              socketId
            ] ?? 0
          ),

        handCount:
          Array.isArray(
            game.hands[
              socketId
            ]
          )
            ? game.hands[
                socketId
              ].length
            : 0,
      };
    }
  );
}


// ============================================================
// 自分の手札送信
// ============================================================

function extraPokerSendMyHand(
  game,
  socket
) {
  if (!socket) {
    return;
  }

  const hand =
    game.hands[
      socket.id
    ];

  const cards =
    Array.isArray(
      hand
    )
      ? hand.map(
          (card) => ({
            id:
              card.id,

            text:
              card.text,

            index:
              card.index,
          })
        )
      : [];

  socket.emit(
    'extra-poker:my-hand',
    {
      cards,
    }
  );
}


// ============================================================
// 全員の状態送信
// ============================================================

function extraPokerBroadcastState(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  const answerCandidates =
    extraPokerGetAnswerCandidates(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (!targetSocket) {
      continue;
    }

    extraPokerSendMyHand(
      game,
      targetSocket
    );

    /*
     * 回答入力を許可するプレイヤー。
     *
     * 「回答権を持っている」
     * かつ
     * 「まだ回答していない」
     * 人だけ。
     *
     * 全員に回答権一覧を送ること自体は
     * ゲーム上問題ないが、
     * UIでは自分が対象かどうかを
     * 明確に判定できるようにする。
     */
    const canSubmitAnswer =
      game.phase === 'answering' &&
      answerCandidates.some(
        (candidate) =>
          candidate.socketId ===
            player.socketId &&
          game.answerSubmitted[
            player.socketId
          ] !== true
      );

    targetSocket.emit(
      'extra-poker:state',
      {
        phase:
          game.phase,

        round:
          game.round,

        totalRounds:
          game.settings.rounds,

        turnNumber:
          game.turnNumber,

        turnStartPlayerId:
          game.turnStartPlayerId,

        currentCharacterName:
          null,

        pot:
          game.pot,

        currentBet:
          game.currentBet,

        minBet:
          game.settings.minBet,

        maxBet:
          game.settings.maxBet,

        currentActorId:
          game.currentActorId,

        cycle:
          game.cycle,

        players:
          extraPokerPublicPlayers(
            game
          ),

        /*
         * 回答権を持っている人。
         */
        answerCandidates:
          answerCandidates.map(
            (candidate) =>
              candidate.socketId
          ),

        /*
         * 自分が回答入力可能か。
         *
         * UI側では基本的に
         * これを使って入力欄を表示する。
         */
        canSubmitAnswer,

        /*
         * 実際に回答を送信済みの人。
         */
        answerers:
          Object.keys(
            game.answers
          ).filter(
            (socketId) =>
              game.answers[
                socketId
              ] != null &&
              game.answerSubmitted[
                socketId
              ] === true &&
              !game.answerLost[
                socketId
              ] &&
              !game.folded[
                socketId
              ]
          ),

        lastAction:
          game.lastAction ??
          null,

        cardsRemaining:
          Array.isArray(
            game.deck
          )
            ? game.deck.length
            : 0,
      }
    );
  }
}


// ============================================================
// 手札を全員公開
// ============================================================

function extraPokerRevealHands(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  const hands =
    players.map(
      (player) => ({
        socketId:
          player.socketId,

        name:
          player.name ||
          'プレイヤー',

        cards:
          (
            game.hands[
              player.socketId
            ] || []
          ).map(
            (card) =>
              card.text
          ),
      })
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'extra-poker:hands-revealed',
        {
          hands,
        }
      );
    }
  }
}


// ============================================================
// 設定作成
// ============================================================

function extraPokerCreateSettings(
  payload
) {
  const initialChips =
    Number(
      payload?.initialChips
    );

  const rounds =
    Number(
      payload?.rounds
    );

  const minBet =
    Number(
      payload?.minBet
    );

  const maxBet =
    Number(
      payload?.maxBet
    );

  const safeInitialChips =
    Number.isInteger(
      initialChips
    ) &&
    initialChips >= 100
      ? initialChips
      : EXTRA_POKER_DEFAULT_CHIPS;

  const safeRounds =
    Number.isInteger(
      rounds
    ) &&
    rounds >= 1 &&
    rounds <= 20
      ? rounds
      : EXTRA_POKER_DEFAULT_ROUNDS;

  const safeMinBet =
    Number.isInteger(
      minBet
    ) &&
    minBet >= 100 &&
    minBet % 100 === 0
      ? minBet
      : EXTRA_POKER_DEFAULT_MIN_BET;

  const safeMaxBet =
    Number.isInteger(
      maxBet
    ) &&
    maxBet >= safeMinBet &&
    maxBet % 100 === 0
      ? maxBet
      : EXTRA_POKER_DEFAULT_MAX_BET;

  return {
    initialChips:
      safeInitialChips,

    rounds:
      safeRounds,

    minBet:
      safeMinBet,

    maxBet:
      safeMaxBet,
  };
}


// ============================================================
// ゲーム状態初期化
// ============================================================

function extraPokerCreateGame(
  roomId
) {
  return {
    roomId,

    phase:
      'setup',

    settings: {
      initialChips:
        EXTRA_POKER_DEFAULT_CHIPS,

      rounds:
        EXTRA_POKER_DEFAULT_ROUNDS,

      minBet:
        EXTRA_POKER_DEFAULT_MIN_BET,

      maxBet:
        EXTRA_POKER_DEFAULT_MAX_BET,
    },

    round:
      0,

    turnNumber:
      0,

    turnStartPlayerId:
      null,

    currentActorId:
      null,

    cycle:
      0,

    cycleActors:
      [],

    cycleActed:
      {},

    character:
      null,

    deck:
      [],

    hands:
      {},

    chips:
      {},

    eliminated:
      {},

    folded:
      {},

    answerLost:
      {},

    answerLocked:
      {},

    answerSubmitted:
      {},

    answers:
      {},

    contributions:
      {},

    pot:
      0,

    currentBet:
      0,

    lastAction:
      null,

    result:
      null,
  };
}


// ============================================================
// スタートプレイヤー決定
// ============================================================

function extraPokerChooseStartPlayer(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    players.length === 0
  ) {
    return null;
  }

  const randomIndex =
    Math.floor(
      Math.random() *
        players.length
    );

  return players[
    randomIndex
  ].socketId;
}


// ============================================================
// 時計回りの次プレイヤー
// ============================================================

function extraPokerNextPlayer(
  game,
  socketId,
  options = {}
) {
  const includeFolded =
    options.includeFolded === true;

  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    players.length === 0
  ) {
    return null;
  }

  /*
   * 座席順は「players」の順番を基準にする。
   *
   * 重要:
   * フォールドした人を先に配列から消してしまうと、
   *
   * A → B → C → D
   *
   * でBがフォールドしたとき、
   * 「Bの次」を探せなくなってAに戻ってしまう。
   *
   * そのため、まず元の座席順から
   * 現在位置を探して、その後ろから
   * 生存しているプレイヤーを探す。
   */

  const currentIndex =
    players.findIndex(
      (player) =>
        player.socketId ===
        socketId
    );

  /*
   * 現在のプレイヤーが
   * playersに存在しない場合。
   *
   * これはゲーム開始時などに起こり得るので、
   * 生存しているプレイヤーの先頭を返す。
   */
  if (
    currentIndex < 0
  ) {
    const usable =
      players.filter(
        (player) =>
          includeFolded ||
          (
            !game.folded[
              player.socketId
            ] &&
            !game.answerLost[
              player.socketId
            ]
          )
      );

    return (
      usable[0]?.socketId ??
      null
    );
  }

  /*
   * 現在プレイヤーの次の座席から
   * 時計回りに探す。
   *
   * 自分自身は返さない。
   */
  for (
    let i = 1;
    i <= players.length;
    i += 1
  ) {
    const player =
      players[
        (
          currentIndex + i
        ) %
          players.length
      ];

    if (
      includeFolded ||
      (
        !game.folded[
          player.socketId
        ] &&
        !game.answerLost[
          player.socketId
        ]
      )
    ) {
      return player.socketId;
    }
  }

  return null;
}

// ============================================================
// 順番を作る
// ============================================================

function extraPokerBuildCycle(
  game,
  firstSocketId
) {
  const players =
    extraPokerGetActivePlayers(
      game
    ).filter(
      (player) =>
        !game.folded[
          player.socketId
        ] &&
        !game.answerLost[
          player.socketId
        ]
    );

  if (
    players.length === 0
  ) {
    return [];
  }

  const index =
    players.findIndex(
      (player) =>
        player.socketId ===
        firstSocketId
    );

  if (
    index < 0
  ) {
    return players.map(
      (player) =>
        player.socketId
    );
  }

  const result = [];

  for (
    let i = 0;
    i < players.length;
    i += 1
  ) {
    result.push(
      players[
        (
          index + i
        ) %
          players.length
      ].socketId
    );
  }

  return result;
}


// ============================================================
// 山札から1枚配る
// ============================================================

function extraPokerDealOne(
  game,
  socketId
) {
  if (
    !Array.isArray(
      game.deck
    ) ||
    game.deck.length === 0
  ) {
    return false;
  }

  const card =
    game.deck.shift();

  if (
    !Array.isArray(
      game.hands[
        socketId
      ]
    )
  ) {
    game.hands[
      socketId
    ] = [];
  }

  game.hands[
    socketId
  ].push(
    card
  );

  return true;
}


// ============================================================
// 全員に初期カードを1枚ずつ配る
// ============================================================

function extraPokerDealInitialCards(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    game.deck.length <
    players.length
  ) {
    return false;
  }

  for (
    const player of players
  ) {
    extraPokerDealOne(
      game,
      player.socketId
    );
  }

  return true;
}


// ============================================================
// 次のカードを全員に1枚ずつ配る
// ============================================================

function extraPokerDealNextCards(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    ).filter(
      (player) =>
        !game.folded[
          player.socketId
        ] &&
        !game.answerLost[
          player.socketId
        ]
    );

  if (
    players.length === 0
  ) {
    return false;
  }

  if (
    game.deck.length <
    players.length
  ) {
    return false;
  }

  for (
    const player of players
  ) {
    extraPokerDealOne(
      game,
      player.socketId
    );
  }

  return true;
}


// ============================================================
// チップをポットへ
// ============================================================

function extraPokerPutToPot(
  game,
  socketId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  const chips =
    Number(
      game.chips[
        socketId
      ] ?? 0
    );

  if (
    safeAmount > chips
  ) {
    return false;
  }

  game.chips[
    socketId
  ] =
    chips -
    safeAmount;

  game.contributions[
    socketId
  ] =
    Number(
      game.contributions[
        socketId
      ] ?? 0
    ) +
    safeAmount;

  game.pot +=
    safeAmount;

  return true;
}


// ============================================================
// 初期ベット
// ============================================================

function extraPokerCollectInitialBet(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    );

  for (
    const player of players
  ) {
    const chips =
      Number(
        game.chips[
          player.socketId
        ] ?? 0
      );

    if (
      chips <
      game.settings.minBet
    ) {
      game.eliminated[
        player.socketId
      ] = true;

      continue;
    }

    const success =
      extraPokerPutToPot(
        game,
        player.socketId,
        game.settings.minBet
      );

    if (
      !success
    ) {
      game.eliminated[
        player.socketId
      ] = true;
    }
  }

  game.currentBet =
    game.settings.minBet;
}


// ============================================================
// 回答者一覧
// ============================================================

function extraPokerGetAnswerers(
  game
) {
  return extraPokerGetActivePlayers(
    game
  ).filter(
    (player) =>
      !game.folded[
        player.socketId
      ] &&
      !game.answerLost[
        player.socketId
      ] &&
      game.answerLocked[
        player.socketId
      ] &&
      game.answerSubmitted[
        player.socketId
      ] &&
      game.answers[
        player.socketId
      ] != null
  );
}


// ============================================================
// 回答を選択したプレイヤー一覧
// ============================================================

function extraPokerGetAnswerCandidates(
  game
) {
  return extraPokerGetActivePlayers(
    game
  ).filter(
    (player) =>
      !game.folded[
        player.socketId
      ] &&
      !game.answerLost[
        player.socketId
      ] &&
      game.answerLocked[
        player.socketId
      ]
  );
}


// ============================================================
// 回答公開
// ============================================================

function extraPokerPublicAnswers(
  game
) {
  const answerers =
    extraPokerGetAnswerers(
      game
    );

  return answerers.map(
    (player) => ({
      socketId:
        player.socketId,

      playerName:
        player.name ||
        'プレイヤー',

      answer:
        String(
          game.answers[
            player.socketId
          ] ?? ''
        ),
    })
  );
}


// ============================================================
// 回答正規化
// ============================================================

function extraPokerNormalizeAnswer(
  value
) {
  return String(
    value ?? ''
  )
    .normalize('NFKC')
    .replace(
      /\s+/g,
      ''
    )
    .toLowerCase()
    .trim();
}


// ============================================================
// 正解判定
// ============================================================

function extraPokerIsCorrectAnswer(
  game,
  answer
) {
  if (
    !game.character
  ) {
    return false;
  }

  const normalized =
    extraPokerNormalizeAnswer(
      answer
    );

  if (
    !normalized
  ) {
    return false;
  }

  const rawName =
    String(
      game.character.name
    );

  const candidates = [];

  // 元の名前そのもの
  candidates.push(
    rawName
  );

  // 「○○（△△）」の場合
  // ・○○（△△）
  // ・○○
  // ・△△
  // のすべてを正解候補にする
  const bracketMatch =
    rawName.match(
      /^(.*?)[（(]([^）)]+)[）)](.*)$/
    );

  if (
    bracketMatch
  ) {
    const before =
      bracketMatch[1];

    const inside =
      bracketMatch[2];

    const after =
      bracketMatch[3];

    // 括弧より前
    if (
      before.trim()
    ) {
      candidates.push(
        before
      );
    }

    // 括弧の中
    if (
      inside.trim()
    ) {
      candidates.push(
        inside
      );
    }

    // 括弧より後ろに文字がある場合
    if (
      after.trim()
    ) {
      candidates.push(
        after
      );
    }
  }

  return candidates.some(
    (candidate) =>
      extraPokerNormalizeAnswer(
        candidate
      ) ===
      normalized
  );
}

// ============================================================
// チップ0以下のプレイヤーを脱落
// ============================================================

function extraPokerUpdateEliminations(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    const chips =
      Number(
        game.chips[
          player.socketId
        ] ?? 0
      );

    if (
      chips <= 0
    ) {
      game.eliminated[
        player.socketId
      ] = true;
    }
  }
}


// ============================================================
// ラウンド終了判定
// ============================================================

function extraPokerCheckRoundEnd(
  game
) {
  extraPokerUpdateEliminations(
    game
  );

  const alive =
    extraPokerGetActivePlayers(
      game
    );

  return (
    alive.length <= 1
  );
}


// ============================================================
// ゲーム最終結果
// ============================================================

function extraPokerBuildFinalResults(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  return players
    .map(
      (player) => ({
        socketId:
          player.socketId,

        name:
          player.name ||
          'プレイヤー',

        chips:
          Number(
            game.chips[
              player.socketId
            ] ?? 0
          ),
      })
    )
    .sort(
      (a, b) =>
        b.chips -
        a.chips
    )
    .map(
      (
        player,
        index
      ) => ({
        ...player,

        rank:
          index + 1,
      })
    );
}


// ============================================================
// ゲーム終了
// ============================================================

function extraPokerFinishGame(
  game
) {
  game.phase =
    'finished';

  const results =
    extraPokerBuildFinalResults(
      game
    );

  const players =
    extraPokerGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'extra-poker:game-finished',
        {
          results,
        }
      );
    }
  }

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// ターン終了
// ============================================================

async function extraPokerEndTurn(
  game,
  reason,
  winnerSocketIds = []
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  const winners =
    new Set(
      winnerSocketIds.filter(
        (socketId) =>
          typeof socketId ===
            'string' &&
          socketId.length > 0
      )
    );

  const potBefore =
    Number(
      game.pot || 0
    );

  if (
    winners.size > 0 &&
    potBefore > 0
  ) {
    const winnerIds =
      [...winners];

    const base =
      Math.floor(
        potBefore /
          winnerIds.length
      );

    let remainder =
      potBefore %
      winnerIds.length;

    for (
      const socketId of
        winnerIds
    ) {
      const add =
        base +
        (
          remainder > 0
            ? 1
            : 0
        );

      if (
        remainder > 0
      ) {
        remainder -= 1;
      }

      game.chips[
        socketId
      ] =
        Number(
          game.chips[
            socketId
          ] ?? 0
        ) +
        add;
    }
  }

  game.pot =
    0;

  const hasWinner =
    winners.size > 0;

  const revealedCharacterName =
  game.character
    ? String(
        game.character.name ?? ''
      )
    : '';

const revealedDescription =
  game.character
    ? String(
        game.character.description ?? ''
      )
    : '';

  console.log(
    '[extra-poker] 正解キャラクター:',
    revealedCharacterName
  );

  console.log(
    '[extra-poker] 正解説明文:',
    revealedDescription
  );

  console.log(
    '[extra-poker] 正解説明文文字数:',
    revealedDescription.length
  );

  const publicAnswers =
    extraPokerPublicAnswers(
      game
    );

 game.result = {
  reason,

  winnerSocketIds:
    [...winners],

  pot:
    potBefore,

  answers:
    publicAnswers,

  /*
   * 正解者がいなくても
   * 正解キャラクターを公開する。
   */
  characterName:
    revealedCharacterName,

  description:
    revealedDescription,

  hasWinner,
};

  if (
    hasWinner
  ) {
    extraPokerRevealHands(
      game
    );
  }

  game.phase =
    'turn-result';

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    const payload = {
  reason,

  /*
   * 正解者が0人でも
   * 正解キャラクターを表示する。
   */
  characterName:
    revealedCharacterName,

  description:
    revealedDescription,

  answers:
    publicAnswers,

  winnerSocketIds:
    [...winners],

  pot:
    potBefore,

  players:
    extraPokerPublicPlayers(
      game
    ),

  round:
    game.round,

  turnNumber:
    game.turnNumber,

  hasWinner,
};

    targetSocket.emit(
      'extra-poker:turn-result',
      payload
    );
  }

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// 次のターンを開始
// ============================================================

async function extraPokerStartTurn(
  game,
  preferredStartSocketId = null
) {
  const data =
    await getExtraPokerData();

  extraPokerUpdateEliminations(
    game
  );

  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    players.length <= 1
  ) {
    extraPokerFinishGame(
      game
    );

    return;
  }

  const character =
    data[
      Math.floor(
        Math.random() *
          data.length
      )
    ];

  const cards =
    extraPokerShuffle(
      extraPokerBuildCards(
        character.description
      )
    );

  game.character =
    character;

  game.deck =
    cards;

  game.hands =
    {};

  game.folded =
    {};

  game.answerLost =
    {};

  game.answerLocked =
    {};

  game.answerSubmitted =
    {};

  game.answers =
    {};

  game.contributions =
    {};

  game.pot =
    0;

  game.currentBet =
    0;

  game.cycle =
    0;

  game.cycleActors =
    [];

  game.cycleActed =
    {};

  game.lastAction =
    null;

  game.result =
    null;

  game.turnNumber +=
    1;

  let startId =
    preferredStartSocketId;

  if (
    !startId ||
    !players.some(
      (player) =>
        player.socketId ===
        startId
    )
  ) {
    const previousStartId =
      game.turnStartPlayerId;

    if (
      previousStartId
    ) {
      const previousIndex =
        players.findIndex(
          (player) =>
            player.socketId ===
            previousStartId
        );

      if (
        previousIndex >= 0
      ) {
        startId =
          players[
            (
              previousIndex +
              1
            ) %
              players.length
          ].socketId;
      }
    }

    if (
      !startId
    ) {
      startId =
        extraPokerChooseStartPlayer(
          game
        );
    }
  }

  game.turnStartPlayerId =
    startId;

  for (
    const player of players
  ) {
    game.hands[
      player.socketId
    ] = [];

    game.folded[
      player.socketId
    ] = false;

    game.answerLost[
      player.socketId
    ] = false;

    game.answerLocked[
      player.socketId
    ] = false;

    game.answerSubmitted[
      player.socketId
    ] = false;

    game.answers[
      player.socketId
    ] = '';

    game.contributions[
      player.socketId
    ] = 0;
  }

  const initialSuccess =
    extraPokerDealInitialCards(
      game
    );

  if (
    !initialSuccess
  ) {
    await extraPokerEndTurn(
      game,
      '山札が足りず、全員に初期カードを配れなかったためターンが流れました。',
      []
    );

    return;
  }

  extraPokerCollectInitialBet(
    game
  );

  extraPokerUpdateEliminations(
    game
  );

  const aliveAfterAnte =
    extraPokerGetActivePlayers(
      game
    );

  if (
    aliveAfterAnte.length <= 1
  ) {
    extraPokerFinishGame(
      game
    );

    return;
  }

  game.currentBet =
    game.settings.minBet;

 game.turnStartPlayerId =
  startId;

game.cycleActors =
  extraPokerBuildCycle(
    game,
    game.turnStartPlayerId
  );

game.cycleActed =
  {};

game.currentActorId =
  game.turnStartPlayerId;

if (
  !game.cycleActors.includes(
    game.currentActorId
  )
) {
  game.currentActorId =
    game.cycleActors[0] ??
    null;
}

  game.phase =
    'playing';

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'extra-poker:turn-started',
        {
          round:
            game.round,

          turnNumber:
            game.turnNumber,

          startPlayerId:
            game.turnStartPlayerId,

          cardsRemaining:
            game.deck.length,

          currentBet:
            game.currentBet,

          pot:
            game.pot,
        }
      );
    }
  }

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// サイクル終了
// ============================================================

async function extraPokerFinishCycle(
  game
) {
  /*
   * ==========================================================
   * 回答フェーズ
   * ==========================================================
   */

  if (
    game.phase ===
    'answering'
  ) {
    const answerCandidates =
      extraPokerGetAnswerCandidates(
        game
      );

    const allSubmitted =
      answerCandidates.every(
        (player) =>
          game.answerSubmitted[
            player.socketId
          ] === true
      );

    if (
      !allSubmitted
    ) {
      extraPokerBroadcastState(
        game
      );

      return;
    }

    const evaluations =
      answerCandidates.map(
        (player) => {
          const answer =
            String(
              game.answers[
                player.socketId
              ] ?? ''
            );

          return {
            socketId:
              player.socketId,

            playerName:
              player.name ||
              'プレイヤー',

            answer,

            correct:
              extraPokerIsCorrectAnswer(
                game,
                answer
              ),
          };
        }
      );

    for (
      const player of
        extraPokerGetPlayers(
          game
        )
    ) {
      const targetSocket =
        io.sockets.sockets.get(
          player.socketId
        );

      if (
        targetSocket
      ) {
        targetSocket.emit(
          'extra-poker:answers-revealed',
          {
            answers:
              evaluations,

            characterName:
              null,

            hasWinner:
              evaluations.some(
                (item) =>
                  item.correct === true
              ),
          }
        );
      }
    }

    const correctAnswers =
      evaluations.filter(
        (item) =>
          item.correct === true
      );

    if (
      correctAnswers.length > 0
    ) {
      await extraPokerEndTurn(
        game,
        '正解者が出ました。',
        correctAnswers.map(
          (item) =>
            item.socketId
        )
      );

      return;
    }

    /*
     * 全員不正解。
     */
    for (
      const item of evaluations
    ) {
      game.answerLost[
        item.socketId
      ] = true;

      game.answerLocked[
        item.socketId
      ] = false;

      game.answerSubmitted[
        item.socketId
      ] = false;

      delete game.answers[
        item.socketId
      ];
    }

    extraPokerUpdateEliminations(
      game
    );

    const remainingPlayers =
      extraPokerGetActionPlayers(
        game
      );

    if (
      remainingPlayers.length ===
      1
    ) {
      const lastPlayer =
        remainingPlayers[0];

      while (
        game.deck.length > 0
      ) {
        extraPokerDealOne(
          game,
          lastPlayer.socketId
        );
      }

      game.currentActorId =
        lastPlayer.socketId;

      game.phase =
        'last-answer';

      game.answerLocked[
        lastPlayer.socketId
      ] = true;

      game.answerSubmitted[
        lastPlayer.socketId
      ] = false;

      game.answers[
        lastPlayer.socketId
      ] = '';

      const targetSocket =
        io.sockets.sockets.get(
          lastPlayer.socketId
        );

      if (
        targetSocket
      ) {
        targetSocket.emit(
          'extra-poker:last-answer',
          {
            characterName:
              null,

            message:
              'あなたに残りの山札がすべて公開されました。最後の1回だけ回答できます。',
          }
        );
      }

      extraPokerBroadcastState(
        game
      );

      return;
    }

    if (
      remainingPlayers.length ===
      0
    ) {
      await extraPokerEndTurn(
        game,
        '全員の回答権がなくなり、正解者が出ませんでした。',
        []
      );

      return;
    }

    const dealSuccess =
      extraPokerDealNextCards(
        game
      );

    if (
      !dealSuccess
    ) {
      await extraPokerEndTurn(
        game,
        '山札がなくなり、正解者が出ませんでした。',
        []
      );

      return;
    }

    game.cycle +=
      1;

    game.cycleActed =
      {};

    for (
      const player of
        extraPokerGetPlayers(
          game
        )
    ) {
      game.answerLocked[
        player.socketId
      ] = false;

      game.answerSubmitted[
        player.socketId
      ] = false;

      game.answers[
        player.socketId
      ] = '';
    }

    const nextStart =
      game.turnStartPlayerId;

    game.cycleActors =
      extraPokerBuildCycle(
        game,
        nextStart
      );

    game.currentActorId =
      game.cycleActors[0] ??
      null;

    game.lastAction =
      null;

    game.phase =
      'playing';

    extraPokerBroadcastState(
      game
    );

    return;
  }


  /*
   * ==========================================================
   * 通常のベッティング終了
   * ==========================================================
   */

  const answerCandidates =
    extraPokerGetAnswerCandidates(
      game
    );

  /*
   * 回答権を持つプレイヤーがいる場合だけ
   * 回答フェーズへ。
   */
  if (
    answerCandidates.length > 0
  ) {
    game.phase =
      'answering';

    game.currentActorId =
      null;

    /*
     * ここで回答入力可能になる。
     *
     * 回答権を持っている人だけが
     * canSubmitAnswer=true になる。
     */
    for (
      const player of
        answerCandidates
    ) {
      game.answerSubmitted[
        player.socketId
      ] = false;

      game.answers[
        player.socketId
      ] = '';
    }

    extraPokerBroadcastState(
      game
    );

    return;
  }

  /*
   * ==========================================================
   * 回答者なし
   * ==========================================================
   */

  const dealSuccess =
    extraPokerDealNextCards(
      game
    );

  if (
    !dealSuccess
  ) {
    await extraPokerEndTurn(
      game,
      '山札がなくなり、正解者が出ませんでした。',
      []
    );

    return;
  }

  game.cycle +=
    1;

  game.cycleActed =
    {};

  for (
    const player of
      extraPokerGetPlayers(
        game
      )
  ) {
    game.answerLocked[
      player.socketId
    ] = false;

    game.answerSubmitted[
      player.socketId
    ] = false;

    game.answers[
      player.socketId
    ] = '';
  }

 const nextStart =
  game.turnStartPlayerId;

game.cycleActors =
  extraPokerBuildCycle(
    game,
    nextStart
  );

  game.currentActorId =
    game.cycleActors[0] ??
    null;

  game.lastAction =
    null;

  game.phase =
    'playing';

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// アクション可能判定
// ============================================================

function extraPokerCanAct(
  game,
  socketId
) {
  if (
    game.phase !==
    'playing'
  ) {
    return false;
  }

  if (
    game.currentActorId !==
    socketId
  ) {
    return false;
  }

  if (
    game.folded[
      socketId
    ] ||
    game.answerLost[
      socketId
    ]
  ) {
    return false;
  }

  return true;
}


// ============================================================
// 次のアクションプレイヤー
// ============================================================
//

function extraPokerAdvanceActor(
  game
) {
  /*
   * cycleActorsは
   * 「このサイクル開始時点での座席順」
   * として使う。
   *
   * フォールドしたプレイヤーを
   * 配列から削除してはいけない。
   *
   * A → B → C → D
   *
   * Bがフォールドしても
   *
   * A → B → C → D
   *
   * の座席順を維持し、
   * Bを飛ばしてCへ進める。
   */

  const actors =
    (
      game.cycleActors ||
      []
    ).filter(
      (socketId) =>
        !game.folded[
          socketId
        ] &&
        !game.answerLost[
          socketId
        ]
    );

  if (
    actors.length === 0
  ) {
    game.currentActorId =
      null;

    return false;
  }

  /*
   * 現在のプレイヤーが
   * 生存プレイヤー一覧から消えている場合。
   *
   * 例えば現在のBがフォールドした直後など。
   *
   * この場合はcycleActors全体から
   * Bの位置を探して、その次から
   * 生存プレイヤーを探す。
   */
  const allCycleActors =
    game.cycleActors || [];

  let currentIndex =
    allCycleActors.indexOf(
      game.currentActorId
    );

  /*
   * 現在のプレイヤーが見つからない場合は、
   * cycleActorsの先頭から探す。
   */
  if (
    currentIndex < 0
  ) {
    currentIndex = 0;
  }

  /*
   * 現在プレイヤーの次から、
   * 時計回りに「まだ行動していない人」を探す。
   */
  for (
    let i = 1;
    i <= allCycleActors.length;
    i += 1
  ) {
    const candidate =
      allCycleActors[
        (
          currentIndex + i
        ) %
          allCycleActors.length
      ];

    /*
     * フォールド・回答権喪失者は飛ばす。
     */
    if (
      game.folded[
        candidate
      ] ||
      game.answerLost[
        candidate
      ]
    ) {
      continue;
    }

    /*
     * まだ今回のサイクルで
     * 行動していない人を優先。
     */
    if (
      !game.cycleActed[
        candidate
      ]
    ) {
      game.currentActorId =
        candidate;

      return true;
    }
  }

  /*
   * 全員が今回一度行動した。
   *
   * それでも現在の最高額に
   * 届いていない人がいる場合は、
   * その人だけもう一度行動させる。
   */
  const needsAction =
    actors.filter(
      (socketId) =>
        Number(
          game.contributions[
            socketId
          ] ?? 0
        ) <
        Number(
          game.currentBet ||
          0
        )
    );

  if (
    needsAction.length === 0
  ) {
    game.currentActorId =
      null;

    return false;
  }

  /*
   * 最高額に届いていない人だけ
   * 次の一周の対象にする。
   */
  for (
    const socketId of
      actors
  ) {
    game.cycleActed[
      socketId
    ] =
      !needsAction.includes(
        socketId
      );
  }

  /*
   * 座席順を維持して
   * 最初に差額が必要なプレイヤーを探す。
   */
  for (
    let i = 1;
    i <= allCycleActors.length;
    i += 1
  ) {
    const candidate =
      allCycleActors[
        (
          currentIndex + i
        ) %
          allCycleActors.length
      ];

    if (
      needsAction.includes(
        candidate
      )
    ) {
      game.currentActorId =
        candidate;

      return true;
    }
  }

  /*
   * 念のため。
   */
  game.currentActorId =
    null;

  return false;
}

// ============================================================
// ベッティングサイクル終了判定
// ============================================================

function extraPokerCycleComplete(
  game
) {
  const actors =
    game.cycleActors.filter(
      (socketId) =>
        !game.folded[
          socketId
        ] &&
        !game.answerLost[
          socketId
        ]
    );

  if (
    actors.length === 0
  ) {
    return true;
  }

  const allActed =
    actors.every(
      (socketId) =>
        Boolean(
          game.cycleActed[
            socketId
          ]
        )
    );

  if (
    !allActed
  ) {
    return false;
  }

  const allMatched =
    actors.every(
      (socketId) =>
        Number(
          game.contributions[
            socketId
          ] ?? 0
        ) >=
        Number(
          game.currentBet ||
          0
        )
    );

  return allMatched;
}


// ============================================================
// Socket.IO
// ============================================================

io.on(
  'connection',
  (socket) => {

    // ========================================================
    // JOIN
    // ========================================================

    socket.on(
      'extra-poker:join',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        if (
          roomId.length !== 4
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                '部屋IDが正しくありません。',
            }
          );

          return;
        }

        const room =
          freeRooms.get(
            roomId
          );

        if (!room) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'フリーマッチ部屋が見つかりません。',
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const incomingName =
          String(
            payload?.name ||
              ''
          ).trim();

        const players =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              )
            : Array.isArray(
                room.players
              )
              ? room.players
              : [];

        let playerIndex =
          players.findIndex(
            (player) =>
              player.socketId ===
              socket.id
          );

        if (
          playerIndex < 0 &&
          incomingUserId
        ) {
          playerIndex =
            players.findIndex(
              (player) =>
                player.userId != null &&
                String(
                  player.userId
                ) ===
                  incomingUserId
            );
        }

        if (
          playerIndex < 0 &&
          incomingName
        ) {
          const sameName =
            players.filter(
              (player) =>
                String(
                  player.name ||
                    ''
                ).trim() ===
                incomingName
            );

          if (
            sameName.length ===
            1
          ) {
            playerIndex =
              players.findIndex(
                (player) =>
                  String(
                    player.name ||
                      ''
                  ).trim() ===
                  incomingName
              );
          }
        }

        if (
          playerIndex < 0
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'この部屋の参加者ではありません。',
            }
          );

          return;
        }

        const player =
          players[
            playerIndex
          ];

        const oldSocketId =
          player.socketId;

        const wasHost =
          oldSocketId ===
            room.hostSocketId ||
          (
            player.userId != null &&
            room.hostUserId != null &&
            String(
              player.userId
            ) ===
              String(
                room.hostUserId
              )
          );

        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const oldSocket =
            io.sockets.sockets.get(
              oldSocketId
            );

          if (
            oldSocket
          ) {
            oldSocket.leave(
              `free:${roomId}`
            );
          }
        }

        player.socketId =
          socket.id;

        if (
          wasHost
        ) {
          room.hostSocketId =
            socket.id;
        }

        let game =
          extraPokerGames.get(
            roomId
          );

        if (!game) {
          game =
            extraPokerCreateGame(
              roomId
            );

          extraPokerGames.set(
            roomId,
            game
          );
        }

        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const keys = [
            'hands',
            'chips',
            'eliminated',
            'folded',
            'answerLost',
            'answerLocked',
            'answerSubmitted',
            'answers',
            'contributions',
          ];

          for (
            const key of keys
          ) {
            if (
              game[key] &&
              game[key][
                oldSocketId
              ] !== undefined
            ) {
              game[key][
                socket.id
              ] =
                game[key][
                  oldSocketId
                ];

              delete game[key][
                oldSocketId
              ];
            }
          }

          if (
            game.currentActorId ===
            oldSocketId
          ) {
            game.currentActorId =
              socket.id;
          }

          if (
            game.turnStartPlayerId ===
            oldSocketId
          ) {
            game.turnStartPlayerId =
              socket.id;
          }

          game.cycleActors =
            (
              game.cycleActors ||
              []
            ).map(
              (id) =>
                id ===
                oldSocketId
                  ? socket.id
                  : id
            );

          if (
            game.cycleActed &&
            game.cycleActed[
              oldSocketId
            ] !== undefined
          ) {
            game.cycleActed[
              socket.id
            ] =
              game.cycleActed[
                oldSocketId
              ];

            delete game.cycleActed[
              oldSocketId
            ];
          }
        }

        if (
          game.phase !==
            'setup' &&
          !game.hands[
            socket.id
          ]
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'このゲームはすでに開始されています。',
            }
          );

          return;
        }

        socket.join(
          `extra-poker:${roomId}`
        );

        socket.emit(
          'extra-poker:connected'
        );

        extraPokerBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // SETUP
    // ========================================================

    socket.on(
      'extra-poker:start-setup',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム設定を変更できるのは部屋主だけです。',
            }
          );

          return;
        }

        game.phase =
          'setup';

        socket.emit(
          'extra-poker:setup',
          {
            ...game.settings,
          }
        );

        extraPokerBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // START GAME
    // ========================================================

    socket.on(
      'extra-poker:start-game',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲームを開始できるのは部屋主です。',
            }
          );

          return;
        }

        const players =
          extraPokerGetPlayers(
            game
          );

        if (
          players.length < 2
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'エクストラポーカーは2人以上必要です。',
            }
          );

          return;
        }

        if (
          players.length > 4
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'エクストラポーカーは4人までです。',
            }
          );

          return;
        }

        const settings =
          extraPokerCreateSettings(
            payload
          );

        game.settings =
          settings;

        game.round =
          1;

        game.turnNumber =
          0;

        game.phase =
          'setup';

        game.chips =
          {};

        game.eliminated =
          {};

        game.folded =
          {};

        game.answerLost =
          {};

        game.answerLocked =
          {};

        game.answerSubmitted =
          {};

        game.answers =
          {};

        game.contributions =
          {};

        game.pot =
          0;

        game.currentBet =
          0;

        game.result =
          null;

        for (
          const player of players
        ) {
          game.chips[
            player.socketId
          ] =
            settings.initialChips;

          game.eliminated[
            player.socketId
          ] = false;
        }

        try {
          await extraPokerStartTurn(
            game,
            extraPokerChooseStartPlayer(
              game
            )
          );
        } catch (
          error
        ) {
          console.error(
            '[extra-poker] start error:',
            error
          );

          socket.emit(
            'extra-poker:error',
            {
              message:
                error?.message ||
                'ゲーム開始時にエラーが発生しました。',
            }
          );
        }
      }
    );


    // ========================================================
    // ACTION
    // ========================================================

    socket.on(
      'extra-poker:action',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム部屋が見つかりません。',
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const player =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              ).find(
                (item) =>
                  (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) ||
                  item.socketId ===
                    socket.id
              )
            : room.players?.find(
                (item) =>
                  (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) ||
                  item.socketId ===
                    socket.id
            );

        if (!player) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム参加者ではありません。',
            }
          );

          return;
        }

        const playerSocketId =
          player.socketId;

        const action =
          String(
            payload?.action ||
              ''
          );

        /*
         * ======================================================
         * RE-ANSWER
         * ======================================================
         *
         * 回答フェーズでは
         * 「現在の手番」という概念を使わない。
         *
         * 回答権を持っているプレイヤーなら
         * 自分のタイミングで回答を送信できる。
         *
         * これが今回の
         * 「解答権を持ったプレイヤーのみに
         * 入力欄が出る」
         * という仕様の本体。
         */

        if (
          action ===
          'reanswer'
        ) {
          if (
            game.phase !==
            'answering'
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在は回答入力の時間ではありません。',
              }
            );

            return;
          }

          if (
            game.folded[
              playerSocketId
            ] ||
            game.answerLost[
              playerSocketId
            ] ||
            !game.answerLocked[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在回答権を持っていません。',
              }
            );

            return;
          }



          const answer =
            String(
              payload?.answer ??
                ''
            ).trim();

          if (
            !answer
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'キャラクター名を入力してください。',
              }
            );

            return;
          }

          /*
           * 回答入力時には
           * 追加ベットを行わない。
           *
           * 「回答」を選択した時点で
           * ベット額は確定済み。
           */
          game.answers[
            playerSocketId
          ] =
            answer;

          game.answerSubmitted[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'answer-submit',

            amount:
              Number(
                game.contributions[
                  playerSocketId
                ] ?? 0
              ),
          };

          /*
           * 全回答者が入力済みなら
           * すぐ判定。
           */
          const answerCandidates =
            extraPokerGetAnswerCandidates(
              game
            );

          const allSubmitted =
            answerCandidates.every(
              (candidate) =>
                game.answerSubmitted[
                  candidate.socketId
                ] === true
            );

          if (
            allSubmitted
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          extraPokerBroadcastState(
            game
          );

          return;
        }


        /*
         * ======================================================
         * 通常ベッティング中の手番チェック
         * ======================================================
         */

        if (
          !extraPokerCanAct(
            game,
            playerSocketId
          )
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                '現在あなたの手番ではありません。',
            }
          );

          return;
        }

        const requestedBet =
          Number(
            payload?.bet
          );

        const answer =
          String(
            payload?.answer ??
              ''
          ).trim();

        const currentContribution =
          Number(
            game.contributions[
              playerSocketId
            ] ?? 0
          );

        const chips =
          Number(
            game.chips[
              playerSocketId
            ] ?? 0
          );

        // ======================================================
        // ANSWER
        // ======================================================

        if (
          action ===
          'answer'
        ) {
          /*
           * ====================================================
           * 回答選択
           * ====================================================
           *
           * 重要ルール
           *
           * 「回答」を新しく選択した場合は、
           * ベット額が変わらなくても必ず
           * その周の残りプレイヤーへ手番を回す。
           *
           * 例：
           *
           * A 100 コール
           * B 100 回答
           *
           * ↓
           *
           * 金額は揃っているが、
           * Bが新たに「回答」を選択したので
           * C → D → A と手番を回す。
           *
           * 一方、
           *
           * A 200 回答済み
           * A 200 回答
           *
           * のように、すでに回答済みのプレイヤーが
           * 同額で再度回答しただけなら、
           * 新しい周回は発生させない。
           */

          if (
            game.answerLost[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'すでに回答権を失っています。',
              }
            );

            return;
          }

          /*
           * ベット額のチェック。
           */
          if (
            !Number.isInteger(
              requestedBet
            ) ||
            requestedBet % 100 !== 0
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'ベットは100刻みです。',
              }
            );

            return;
          }

          /*
           * 現在の最高額より低い金額は不可。
           */
          if (
            requestedBet <
            Number(
              game.currentBet ?? 0
            )
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在の最高額以上で回答してください。',
              }
            );

            return;
          }

          /*
           * 現在の自分のベット額。
           */
          const currentContribution =
            Number(
              game.contributions[
                playerSocketId
              ] ?? 0
            );

          /*
           * 今回追加する金額。
           */
          const need =
            Math.max(
              0,
              requestedBet -
                currentContribution
            );

          /*
           * 自分のチップ。
           */
          const chips =
            Number(
              game.chips[
                playerSocketId
              ] ?? 0
            );

          if (
            need >
            chips
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '持っているチップを超えて回答できません。',
              }
            );

            return;
          }

          /*
           * 回答前の最高額。
           */
          const previousCurrentBet =
            Number(
              game.currentBet ?? 0
            );

          /*
           * 今回の回答で最高額が上がるか。
           */
          const raisesCurrentBet =
            requestedBet >
            previousCurrentBet;

          /*
           * このプレイヤーが、
           * すでにこの周で「回答」を選択していたか。
           */
          const wasAlreadyAnswered =
            game.answerLocked[
              playerSocketId
            ] === true;

          /*
           * ====================================================
           * ベットをポットへ
           * ====================================================
           */
          if (
            need > 0
          ) {
            const success =
              extraPokerPutToPot(
                game,
                playerSocketId,
                need
              );

            if (!success) {
              socket.emit(
                'extra-poker:error',
                {
                  message:
                    'ベット処理に失敗しました。',
                }
              );

              return;
            }
          }

          /*
           * 自分のベット額を更新。
           */
          game.contributions[
            playerSocketId
          ] =
            requestedBet;

          /*
           * 最高額を更新。
           */
          if (
            raisesCurrentBet
          ) {
            game.currentBet =
              requestedBet;
          }

          /*
           * ====================================================
           * 回答を選択したことを記録
           * ====================================================
           */
          game.answerLocked[
            playerSocketId
          ] = true;

          /*
           * 今回の手番を消化。
           */
          game.cycleActed[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'answer',

            amount:
              requestedBet,
          };

          /*
           * ====================================================
           * 「新しい回答」が発生したか
           * ====================================================
           *
           * これが今回の最重要部分。
           *
           * Aが100コール
           * Bが100回答
           *
           * の場合、
           *
           * BはまだanswerLockedではないので
           *
           * wasAlreadyAnswered = false
           *
           * となる。
           *
           * 金額が変わっていなくても、
           * 「回答」という新しい選択が発生したので
           * もう一周する。
           */
          const isNewAnswer =
            !wasAlreadyAnswered;

          /*
           * ====================================================
           * ベット額が上がった場合
           * ====================================================
           *
           * 新しい最高額に届いていないプレイヤーだけ
           * もう一度行動できるようにする。
           */
          if (
            raisesCurrentBet
          ) {
            for (
              const socketId of
                game.cycleActors
            ) {
              if (
                game.folded[
                  socketId
                ] ||
                game.answerLost[
                  socketId
                ]
              ) {
                game.cycleActed[
                  socketId
                ] = true;

                continue;
              }

              const contribution =
                Number(
                  game.contributions[
                    socketId
                  ] ?? 0
                );

              game.cycleActed[
                socketId
              ] =
                contribution >=
                Number(
                  game.currentBet ?? 0
                );
            }

            /*
             * レイズした本人は行動済み。
             */
            game.cycleActed[
              playerSocketId
            ] = true;
          }

           /*
           * ====================================================
           * 新規回答の場合
           * ====================================================
           */

          if (
            isNewAnswer
          ) {

            for (
              const socketId of
                game.cycleActors
            ) {
              if (
                game.folded[
                  socketId
                ] ||
                game.answerLost[
                  socketId
                ]
              ) {
                game.cycleActed[
                  socketId
                ] = true;

                continue;
              }


              game.cycleActed[
                socketId
              ] =
                socketId ===
                playerSocketId;
            }


            game.cycleActed[
              playerSocketId
            ] = true;

            const canAdvance =
              extraPokerAdvanceActor(
                game
              );

            if (
              canAdvance
            ) {
              extraPokerBroadcastState(
                game
              );

              return;
            }
          }

          /*
           * ====================================================
           * レイズの場合
           * ====================================================
           *
           * 新しい最高額に届いていない人がいるなら
           * その人へ手番を回す。
           */
          if (
            raisesCurrentBet
          ) {
            const canAdvance =
              extraPokerAdvanceActor(
                game
              );

            if (
              canAdvance
            ) {
              extraPokerBroadcastState(
                game
              );

              return;
            }
          }

          /*
           * ====================================================
           * ここまで来た場合
           * ====================================================
           *
           * もう追加で回す必要がない。
           *
           * 全員が必要な行動を終えているなら
           * 回答フェーズへ。
           */
          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          /*
           * 念のため、まだ行動していないプレイヤーが
           * 存在する場合は手番を進める。
           */
          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );

            return;
          }

          /*
           * 最終的にサイクルが完了しているなら
           * 回答フェーズへ。
           */
          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          extraPokerBroadcastState(
            game
          );

          return;
        }

        // ======================================================
        // RAISE
        // ======================================================

        if (
          action ===
          'raise'
        ) {
          if (
            game.answerLocked[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '回答を選択した後は、回答かフォールドのみです。',
              }
            );

            return;
          }

          if (
            !Number.isInteger(
              requestedBet
            ) ||
            requestedBet % 100 !== 0
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'ベットは100刻みです。',
              }
            );

            return;
          }

          if (
            requestedBet <=
            game.currentBet
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'レイズは現在の最高額より高くしてください。',
              }
            );

            return;
          }

          if (
            requestedBet >
            game.settings.maxBet
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  `ベット上限は${game.settings.maxBet}です。`,
              }
            );

            return;
          }

          const need =
            requestedBet -
            currentContribution;

          if (
            need >
            chips
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '持っているチップを超えてレイズできません。',
              }
            );

            return;
          }

          const success =
            extraPokerPutToPot(
              game,
              playerSocketId,
              need
            );

          if (!success) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'ベット処理に失敗しました。',
              }
            );

            return;
          }

          /*
           * 最高額を更新。
           */
          game.currentBet =
            requestedBet;

          /*
           * ====================================================
           * ここが通常ポーカー型レイズの重要部分
           * ====================================================
           *
           * レイズした本人だけ行動済み。
           *
           * それ以外の全員は
           * 「新しい最高額に合わせる」
           * 必要があるため未行動に戻す。
           *
           * これによって
           *
           * A レイズ300
           * ↓
           * B
           * ↓
           * C
           * ↓
           * D
           *
           * という新しい一周が発生する。
           */
          for (
            const socketId of
              game.cycleActors
          ) {
            game.cycleActed[
              socketId
            ] =
              socketId ===
              playerSocketId;
          }

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'raise',

            amount:
              requestedBet,
          };

          /*
           * レイズした本人以外の
           * 次のプレイヤーへ。
           */
          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          /*
           * レイズ直後は
           * 他のプレイヤーがまだ
           * 新しい額に対応していないので、
           * 通常ここではfalseにならない。
           *
           * 万一2人以上が脱落して
           * 全員揃った場合だけ終了。
           */
          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );
          }

          return;
        }


        // ======================================================
        // CALL
        // ======================================================

        if (
          action ===
          'call'
        ) {
          if (
            game.answerLocked[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '回答を選択した後は、回答かフォールドのみです。',
              }
            );

            return;
          }

          const target =
            game.currentBet;

          const need =
            Math.max(
              0,
              target -
                currentContribution
            );

          if (
            need >
            chips
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在の最高額までコールするチップがありません。',
              }
            );

            return;
          }

          if (
            need > 0
          ) {
            const success =
              extraPokerPutToPot(
                game,
                playerSocketId,
                need
              );

            if (!success) {
              socket.emit(
                'extra-poker:error',
                {
                  message:
                    'ベット処理に失敗しました。',
                }
              );

              return;
            }
          }

          game.cycleActed[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'call',

            amount:
              target,
          };

          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );
          }

          return;
        }


        // ======================================================
        // FOLD
        // ======================================================

        if (
          action ===
          'fold'
        ) {
          game.folded[
            playerSocketId
          ] = true;

          game.answerLost[
            playerSocketId
          ] = true;

          game.answerLocked[
            playerSocketId
          ] = false;

          game.answerSubmitted[
            playerSocketId
          ] = false;

          delete game.answers[
            playerSocketId
          ];

          game.cycleActed[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'fold',

            amount:
              0,
          };

          const remaining =
            extraPokerGetActionPlayers(
              game
            );

          if (
            remaining.length ===
            1
          ) {
            await extraPokerEndTurn(
              game,
              '他の全員がフォールドしました。',
              [
                remaining[0]
                  .socketId,
              ]
            );

            return;
          }

          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );
          }

          return;
        }


        socket.emit(
          'extra-poker:error',
          {
            message:
              '不正なアクションです。',
          }
        );
      }
    );


    // ========================================================
    // 最後の回答
    // ========================================================

    socket.on(
      'extra-poker:last-answer',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        if (
          game.phase !==
          'last-answer'
        ) {
          return;
        }

        if (
          game.currentActorId !==
          socket.id
        ) {
          return;
        }

        const answer =
          String(
            payload?.answer ??
              ''
          ).trim();

        if (
          !answer
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'キャラクター名を入力してください。',
            }
          );

          return;
        }

        const correct =
          extraPokerIsCorrectAnswer(
            game,
            answer
          );

        const player =
          extraPokerGetPlayers(
            game
          ).find(
            (item) =>
              item.socketId ===
              socket.id
          );

        for (
          const target of
            extraPokerGetPlayers(
              game
            )
        ) {
          const targetSocket =
            io.sockets.sockets.get(
              target.socketId
            );

          if (
            targetSocket
          ) {
            targetSocket.emit(
              'extra-poker:last-answer-result',
              {
                playerName:
                  player?.name ||
                  'プレイヤー',

                answer,

                correct,

                characterName:
                  correct
                    ? game.character.name
                    : null,

                description:
                  correct
                    ? String(
                        game.character?.description ?? ''
                      )
                    : null,
              }
            );
          }
        }

        if (
          correct
        ) {
          await extraPokerEndTurn(
            game,
            '最後の回答で正解しました。',
            [
              socket.id,
            ]
          );

          return;
        }

        await extraPokerEndTurn(
          game,
          '最後の回答も不正解でした。',
          []
        );
      }
    );


    // ========================================================
    // TURN NEXT
    // ========================================================

socket.on(
  'extra-poker:next-turn',
  async (payload) => {
    const roomId =
      String(
        payload?.roomId ||
          ''
      )
        .replace(
          /\D/g,
          ''
        )
        .slice(
          0,
          4
        );

    const game =
      extraPokerGames.get(
        roomId
      );

    const room =
      freeRooms.get(
        roomId
      );

    if (
      !game ||
      !room
    ) {
      return;
    }

    if (
      room.hostSocketId !==
      socket.id
    ) {
      socket.emit(
        'extra-poker:error',
        {
          message:
            '次のターンへ進めるのは部屋主です。',
        }
      );

      return;
    }

    if (
      game.phase !==
      'turn-result'
    ) {
      return;
    }

    const players =
      extraPokerGetActivePlayers(
        game
      );

    if (
      players.length <= 1
    ) {
      extraPokerFinishGame(
        game
      );

      return;
    }

    /*
     * ========================================================
     * 次の「問題」のスタートプレイヤーを決める
     *
     * 同じ問題の途中では変更しない。
     * turn-result → 次の問題、になった瞬間だけ
     * 1人ずつスタート位置を進める。
     * ========================================================
     */

    const currentStartId =
      game.turnStartPlayerId;

    const nextStartId =
      extraPokerNextPlayer(
        game,
        currentStartId
      );

    /*
     * ラウンド判定
     *
     * 2人なら
     * 問題1 A
     * 問題2 B
     * で1ラウンド終了。
     */
    const turnCount =
      game.turnNumber;

    const expectedTurns =
      Math.max(
        2,
        players.length
      );

    if (
      turnCount %
        expectedTurns ===
      0
    ) {
      game.round +=
        1;

      if (
        game.round >
        game.settings.rounds
      ) {
        extraPokerFinishGame(
          game
        );

        return;
      }
    }

    /*
     * 次の問題を開始。
     *
     * ここでだけ nextStartId を渡す。
     */
    await extraPokerStartTurn(
      game,
      nextStartId
    );
  }
);

    // ========================================================
    // DISCONNECT
    // ========================================================

    socket.on(
      'disconnect',
      () => {
        for (
          const [
            roomId,
            game,
          ] of extraPokerGames
        ) {
          const room =
            freeRooms.get(
              roomId
            );

          if (!room) {
            extraPokerGames.delete(
              roomId
            );

            continue;
          }

          const stillPlayer =
            room.players instanceof Map
              ? Array.from(
                  room.players.values()
                ).some(
                  (player) =>
                    player.socketId ===
                    socket.id
                )
              : Array.isArray(
                  room.players
                )
                ? room.players.some(
                    (player) =>
                      player.socketId ===
                      socket.id
                  )
                : false;

          if (
            !stillPlayer
          ) {
            continue;
          }

          if (
            game.phase ===
            'setup'
          ) {
            extraPokerBroadcastState(
              game
            );

            continue;
          }

          extraPokerBroadcastState(
            game
          );
        }
      }
    );
  }
);


// ============================================================
// 看板たぬき
// ============================================================
//
// 既存のHawk / Extra Poker等には触れない。
// 看板たぬき専用のSocket.IO処理。
// ゲーム固有の細かいデータや表示処理はpage.js側へ分離する。
// ============================================================

const saikoroGames =
  new Map();


// ============================================================
// 看板たぬき：基本設定
// ============================================================

const SAIKORO_MAX_PLAYERS =
  4;

const SAIKORO_WIN_COUNT =
  4;


// ============================================================
// 看板たぬき：初期ダイス
// ============================================================

const SAIKORO_INITIAL_DICE_A = [
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'verse1',
    type:
      'verse',
    value:
      1,
  },
];


const SAIKORO_INITIAL_DICE_B = [
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'eternal1',
    type:
      'eternal',
    value:
      1,
  },
];


// ============================================================
// 看板たぬき：初期資源上限
// ============================================================

const SAIKORO_INITIAL_MAX_RESOURCES = {
  berry:
    12,

  verse:
    6,

  eternal:
    6,
};


// ============================================================
// 看板たぬき：初期ベリー
// ============================================================

const SAIKORO_INITIAL_RESOURCES = [
  {
    berry: 3,
    verse: 0,
    eternal: 0,
  },
  {
    berry: 2,
    verse: 0,
    eternal: 0,
  },
  {
    berry: 1,
    verse: 0,
    eternal: 0,
  },
  {
    berry: 0,
    verse: 0,
    eternal: 0,
  },
];

const SAIKORO_CARD_CATALOG = {
  dorudoru: { name: 'ドルドルの実', cost: { verse: 1 } },
  yomiyomi: { name: 'ヨミヨミの実', cost: { verse: 2 } },
  jikijiki: { name: 'ジキジキの実', cost: { verse: 3 } },
  manemane: { name: 'マネマネの実', cost: { verse: 4 } },
  bakubaku: { name: 'バクバクの実', cost: { verse: 5 } },
  barabara: { name: 'バラバラの実', cost: { verse: 6 } },
  daiaru: { name: '衝撃貝', cost: { eternal: 1 } },
  takara: { name: '食糧宝船', cost: { eternal: 2 } },
  smile: { name: 'SMILE', cost: { eternal: 3 } },
  news: { name: 'ニュース・クー', cost: { eternal: 4 } },
  tact: { name: '魔法の天候棒', cost: { eternal: 5 } },
  kuroden: { name: '黒電伝虫', cost: { eternal: 6 } },
};

function saikoroCreateCardStocks() {
  return Object.fromEntries(
    Object.keys(SAIKORO_CARD_CATALOG).map((cardId) => [cardId, 2])
  );
}

const SAIKORO_FORGE_CATALOG = {
  berry2_a: { cost: 2, stock: 4, faces: [{ type: 'berry', value: 3 }] },
  berry2_b: { cost: 2, stock: 4, faces: [{ type: 'eternal', value: 1 }] },
  berry3_a: { cost: 3, stock: 4, faces: [{ type: 'berry', value: 4 }] },
  berry3_b: { cost: 3, stock: 4, faces: [{ type: 'verse', value: 1 }] },
  berry4_a: { cost: 4, stock: 1, faces: [{ type: 'berry', value: 6 }] },
  berry4_b: { cost: 4, stock: 1, faces: [{ type: 'berry', value: 2 }, { type: 'eternal', value: 1 }] },
  berry4_c: { cost: 4, stock: 1, faces: [{ type: 'verse', value: 1 }, { type: 'eternal', value: 1 }] },
  berry4_d: { cost: 4, stock: 1, faces: [{ type: 'berry', value: 2 }, { type: 'verse', value: 1 }] },
  berry5_a: { cost: 5, stock: 2, faces: [{ type: 'berry', value: 4 }, { type: 'verse', value: 1 }] },
  berry5_b: { cost: 5, stock: 2, faces: [{ type: 'berry', value: 4 }, { type: 'eternal', value: 1 }] },
  berry6_a: { cost: 6, stock: 4, faces: [{ type: 'eternal', value: 2 }] },
  berry8_a: { cost: 8, stock: 4, faces: [{ type: 'verse', value: 2 }] },
  berry12_a: { cost: 12, stock: 2, faces: [{ type: 'verse', value: 2 }, { type: 'eternal', value: 2 }] },
  berry12_b: { cost: 12, stock: 2, faces: [{ type: 'eternal', value: 1 }, { type: 'verse', value: 1 }, { type: 'berry', value: 1 }] },
};

function saikoroCreateForgeStocks() {
  return Object.fromEntries(
    Object.entries(SAIKORO_FORGE_CATALOG).map(([offerId, offer]) => [
      offerId,
      offer.stock,
    ])
  );
}

function saikoroInitialResources(playerNumber) {
  const number = Number(playerNumber);
  const resources = SAIKORO_INITIAL_RESOURCES[number - 1];

  return {
    ...(resources || {
      berry: 0,
      verse: 0,
      eternal: 0,
    }),
  };
}


// ============================================================
// 看板たぬき：シャッフル
// ============================================================

function saikoroShuffle(
  array
) {
  const result =
    [
      ...array,
    ];

  for (
    let i =
      result.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


// ============================================================
// 看板たぬき：部屋プレイヤー取得
// ============================================================

function saikoroGetPlayers(game) {
  if (!game) {
    return [];
  }

  const room = freeRooms.get(String(game.roomId));

  if (!room) {
    return [];
  }

  const roomPlayers =
    room.players instanceof Map
      ? Array.from(room.players.values())
      : Array.isArray(room.players)
        ? room.players
        : [];

  return roomPlayers
    .filter((player) => player && player.socketId)
    .map((player, index) => {
      const gamePlayer = game.players?.[player.socketId];

      const savedSeat =
        player.saikoroSeat ??
        gamePlayer?.seat ??
        index;

      const seat = Number(savedSeat);

      return {
        ...player,
        saikoroSeat:
          Number.isInteger(seat) && seat >= 0
            ? seat
            : index,
        playerNumber:
          (Number.isInteger(seat) && seat >= 0
            ? seat
            : index) + 1,
      };
    })
    .sort((a, b) => a.saikoroSeat - b.saikoroSeat);
}

// ============================================================
// 看板たぬき：ゲームプレイヤー情報取得
// ============================================================

function saikoroGetGamePlayer(
  game,
  socketId
) {
  if (
    !game ||
    !socketId
  ) {
    return null;
  }

  return (
    game.players?.[
      socketId
    ] ||
    null
  );
}


// ============================================================
// 看板たぬき：資源を上限内で加算
// ============================================================

function saikoroAddResource(
  player,
  type,
  amount
) {
  if (
    !player ||
    !player.resources ||
    !player.maxResources
  ) {
    return 0;
  }

  if (
    ![
      'berry',
      'verse',
      'eternal',
    ].includes(
      type
    )
  ) {
    return 0;
  }

  const add =
    Math.max(
      0,
      Number(amount) || 0
    );

  const before =
    Number(
      player.resources[
        type
      ] ?? 0
    );

  const max =
    Number(
      player.maxResources[
        type
      ] ?? 0
    );

  const after =
    Math.min(
      max,
      before + add
    );

  player.resources[
    type
  ] = after;

  return (
    after -
    before
  );
}


// ============================================================
// 看板たぬき：ダイス1個を振る
// ============================================================

function saikoroRollOneDie(
  faces
) {
  if (
    !Array.isArray(
      faces
    ) ||
    faces.length === 0
  ) {
    return null;
  }

  const index =
    Math.floor(
      Math.random() *
        faces.length
    );

  const face =
    faces[index];

  return {
    index,

    face: {
      ...face,
    },
  };
}


// ============================================================
// 看板たぬき：1人分のダイスを振る
// ============================================================

function saikoroRollPlayerDice(
  player
) {
  const result = {
    a:
      saikoroRollOneDie(
        player.diceA
      ),

    b:
      saikoroRollOneDie(
        player.diceB
      ),
  };

  return result;
}


// ============================================================
// 看板たぬき：ダイス結果から資源を獲得
// ============================================================

function saikoroApplyDiceResult(
  player,
  result
) {
  if (
    !player ||
    !result
  ) {
    return;
  }

  const applyFace = (face, awards) => {
    if (!face) {
      return;
    }

    if (face.type === 'combo' && Array.isArray(face.faces)) {
      for (const component of face.faces) {
        applyFace(component, awards);
      }
      return;
    }

    if (
      ['berry', 'verse', 'eternal'].includes(face.type)
    ) {
      const gained = saikoroAddResource(
        player,
        face.type,
        Number(face.value) || 0
      );
      awards[face.type] =
        Number(awards[face.type] ?? 0) + gained;
    }
  };

  const awards = {};
  const byDie = {};

  for (const die of ['a', 'b']) {
    byDie[die] = {};
    const item = result[die];
    applyFace(item?.face ?? item, byDie[die]);
    for (const [type, amount] of Object.entries(byDie[die])) {
      awards[type] = Number(awards[type] ?? 0) + amount;
    }
  }

  return byDie;
}

function saikoroHistoryFace(item) {
  const face = item?.face ?? item;
  if (!face) return 'なし';

  if (
    (face.type === 'combo' || face.type === 'choice') &&
    Array.isArray(face.faces)
  ) {
    const separator = face.type === 'choice' ? ' OR ' : ' + ';
    return face.faces
      .map((part) => saikoroHistoryFace(part))
      .join(separator);
  }

  if (face.type === 'manemane') return 'マネマネ';
  if (face.type === 'tact') return '天候棒';

  const name = {
    berry: 'ベリー',
    verse: 'ヴァース',
    eternal: '永久指針',
  }[face.type] || face.type;

  return `${name}${face.value != null ? ` ${face.value}` : ''}`;
}


// ============================================================
// 看板たぬき：公開用プレイヤー情報
// ============================================================

function saikoroPublicPlayer(
  game,
  player
) {
  if (
    !player
  ) {
    return null;
  }

  const gamePlayer =
    game.players?.[
      player.socketId
    ];

  if (
    !gamePlayer
  ) {
    return {
      socketId:
        player.socketId,

      seat:
Number(
player.playerNumber
) - 1,


      id:
        player.userId ??
        null,

      name:
        player.name ||
        'プレイヤー',

      resources: {
        berry:
          0,

        verse:
          0,

        eternal:
          0,
      },

      maxResources: {
        ...SAIKORO_INITIAL_MAX_RESOURCES,
      },

      diceA: [
        ...SAIKORO_INITIAL_DICE_A,
      ],

      diceB: [
        ...SAIKORO_INITIAL_DICE_B,
      ],

      cards: [],

      extraCharacterInfo: [],

      extraCharacterRevealedIndexes: [],

      extraSpecifiedCount: 0,

      extraRandomCount: 0,

      vivreCardInfo: {},

      extraCharacterCount:
        0,

      vivreCardCount:
        0,
    };
  }

  return {
    socketId:
      player.socketId,

    seat:
Number(
player.playerNumber
) - 1,


    id:
      player.userId ??
      null,

    name:
      player.name ||
      'プレイヤー',

    resources: {
      berry:
        Number(
          gamePlayer.resources
            ?.berry ?? 0
        ),

      verse:
        Number(
          gamePlayer.resources
            ?.verse ?? 0
        ),

      eternal:
        Number(
          gamePlayer.resources
            ?.eternal ?? 0
        ),
    },

    maxResources: {
      ...gamePlayer.maxResources,
    },

    diceA:
      gamePlayer.diceA.map(
        (face) => ({
          ...face,
        })
      ),

    diceB:
      gamePlayer.diceB.map(
        (face) => ({
          ...face,
        })
      ),

    cards:
      gamePlayer.cards.map(
        (card) => ({
          ...card,
        })
      ),

    extraCharacterInfo:
      [
        ...gamePlayer.extraCharacterInfo,
      ],

    extraCharacterRevealedIndexes:
      [
        ...(gamePlayer.extraCharacterRevealedIndexes || []),
      ],

    extraSpecifiedCount:
      Number(gamePlayer.extraSpecifiedCount ?? 0),

    extraRandomCount:
      Number(gamePlayer.extraRandomCount ?? 0),

    vivreCardInfo:
      gamePlayer.vivreCardInfo &&
      typeof gamePlayer.vivreCardInfo === 'object'
        ? { ...gamePlayer.vivreCardInfo }
        : {},

    extraCharacterCount:
      Number(
        gamePlayer.extraCharacterCount ??
          0
      ),

    vivreCardCount:
      Number(
        gamePlayer.vivreCardCount ??
          0
      ),
  };
}


// ============================================================
// 看板たぬき：現在の状態を作る
// ============================================================

function saikoroBuildState(
  game
) {
  const players =
    saikoroGetPlayers(
      game
    );

  return {
    roomId:
      game.roomId,

    phase:
      game.phase,

    turnPlayer:
      Number(
        game.turnPlayer ??
          0
      ),

    round:
      Number(
        game.round ??
          1
      ),

    started:
      Boolean(game.started),

    victoryTarget:
      Number(game.victoryTarget ?? 3),

    winnerSeat:
      game.winnerSeat ?? null,

    startingPlayer:
      Number(game.startingPlayer ?? 0),

    resourcesReady:
      game.resourcesReady === true,

    effectsReady:
      game.effectsReady === true,

    effectsFinishedCount:
      game.effectsFinished instanceof Set
        ? game.effectsFinished.size
        : 0,

    effectsRequiredCount:
      players.length,

    smileActivatedSeats:
      Array.isArray(game.smileActivatedSeats)
        ? game.smileActivatedSeats
        : [],

    actionHistory:
      Array.isArray(game.actionHistory)
        ? game.actionHistory
        : [],

    cardStocks:
      game.cardStocks || saikoroCreateCardStocks(),

    forgeStocks:
      game.forgeStocks || saikoroCreateForgeStocks(),

    lastAnswer:
      game.lastAnswer ?? null,

    players:
      players.map(
        (player) =>
          saikoroPublicPlayer(
            game,
            player
          )
      ),


    diceResults: Object.fromEntries(
      players.map((player) => [
        Number(player.playerNumber) - 1,
        game.diceResults?.[player.socketId] || null,
      ])
    ),

    currentVivreProfile:
      game.currentVivreProfile ?? null,

    extraCharacter:
      game.extraCharacter ?? null,

    actionUsed:
      game.actionUsed || {},

    extraActionUsed:
      game.extraActionUsed ||
      {},

    answerTarget:
      game.answerTarget ||
      null,

    message:
      game.message ||
      '',
  };
}


// ============================================================
// 看板たぬき：状態を全員へ送信
// ============================================================

function saikoroBroadcastState(game) {
  const players = saikoroGetPlayers(game);

  console.log('[saikoro] state送信開始', {
    roomId: game?.roomId,
    phase: game?.phase,
    started: game?.started,
    participantCount: players.length,
    participants: players.map((player) => ({
      socketId: String(player.socketId),
      seat: player.seat,
      playerNumber: player.playerNumber,
    })),
  });

  if (!players.length) {
    console.log('[saikoro] state送信中止：参加者なし', {
      roomId: game?.roomId,
    });
    return;
  }

  const state = saikoroBuildState(game);

  for (const player of players) {
    const socketId = String(player.socketId);
    const targetSocket = io.sockets.sockets.get(socketId);

    if (!targetSocket) {
      console.log('[saikoro] state送信スキップ：Socketなし', {
        roomId: game.roomId,
        socketId,
      });
      continue;
    }

    targetSocket.emit('saikoro:state', state);

    console.log('[saikoro] state送信完了', {
      roomId: game.roomId,
      socketId,
      phase: state?.phase,
      started: state?.started,
    });
  }
}

// ============================================================
// 看板たぬき：エラー送信
// ============================================================

function saikoroError(
  socket,
  message
) {
  if (
    !socket
  ) {
    return;
  }

  socket.emit(
    'saikoro:error',
    {
      message,
    }
  );
}


// ============================================================
// 看板たぬき：ゲーム開始
// ============================================================

function saikoroStartGame(game) {
  console.trace('[saikoro] saikoroStartGame呼び出し', {
    roomId: game?.roomId,
    phase: game?.phase,
    started: game?.started,
    startRequested: game?.startRequested,
  });

  if (!game || game.started || game.phase !== 'waiting') {
    return false;
  }

  if (game.startRequested !== true) {
    return false;
  }

  const participants = saikoroGetPlayers(game);

  console.log('[saikoro] start-check', {
    roomId: game.roomId,
    participantCount: participants.length,
    requiredPlayers: SAIKORO_MAX_PLAYERS,
    participants: participants.map((player) => ({
      socketId: String(player.socketId),
      seat: player.saikoroSeat,
      name: player.name,
    })),
    readyPlayers: Array.from(
      game.readyPlayers instanceof Set ? game.readyPlayers : []
    ).map(String),
  });

  if (participants.length !== SAIKORO_MAX_PLAYERS) {
    game.message =
      `ゲーム開始待ち：参加者 ${participants.length}/${SAIKORO_MAX_PLAYERS}人。`;

    saikoroBroadcastState(game);
    return false;
  }

  if (!(game.readyPlayers instanceof Set)) {
    game.readyPlayers = new Set();
  }

  const allReady = participants.every((player) =>
    game.readyPlayers.has(String(player.socketId))
  );

  if (!allReady) {
    game.message = '全員の準備完了を待っています。';
    saikoroBroadcastState(game);
    return false;
  }

  // 席順を確定してからゲームデータを初期化する
  participants.sort(
    (a, b) => a.saikoroSeat - b.saikoroSeat
  );

  game.started = true;
  game.phase = 'dice';
  game.round = 1;
  game.turnPlayer =
    Number.isInteger(Number(game.startingPlayer)) &&
    Number(game.startingPlayer) >= 0 &&
    Number(game.startingPlayer) < SAIKORO_MAX_PLAYERS
      ? Number(game.startingPlayer)
      : 0;
  game.diceResults = {};
  game.actionUsed = {};
  game.extraActionUsed = {};
  game.answerTarget = null;
  game.winnerSeat = null;
  game.lastAnswer = null;
  game.awardedAnswers = new Set();
  game.resourcesReady = false;
  game.effectsReady = false;
  game.effectsFinished = new Set();
  game.rerollResults = {};
  game.actionHistory = [];
  game.cardStocks = saikoroCreateCardStocks();
  game.cardPurchasedThisTurn = {};
  game.forgeStocks = saikoroCreateForgeStocks();
  game.forgeUsedThisTurn = {};
  game.yomiyomiUsed = {};
  game.diceResourceAwards = {};
  game.manemaneCopyUsed = {};
  game.smileActivatedSeats = [];
  game.players = {};

  participants.forEach((player, index) => {
    const seat = player.saikoroSeat;

    game.players[player.socketId] = {
      socketId: player.socketId,
      userId: player.userId ?? null,
      name: player.name || `プレイヤー${seat + 1}`,
      seat,

resources: {
  ...saikoroInitialResources(
    ((seat - game.turnPlayer + SAIKORO_MAX_PLAYERS) % SAIKORO_MAX_PLAYERS) + 1
  ),
},

      maxResources: {
        ...SAIKORO_INITIAL_MAX_RESOURCES,
      },

      diceA: SAIKORO_INITIAL_DICE_A.map((face) => ({
        ...face,
      })),

      diceB: SAIKORO_INITIAL_DICE_B.map((face) => ({
        ...face,
      })),

      cards: [],
      extraCharacterInfo: [],
      extraCharacterRevealedIndexes: [],
      extraSpecifiedCount: 0,
      extraRandomCount: 0,
      vivreCardInfo: {},
      extraCharacterCount: 0,
      vivreCardCount: 0,
    };
  });

  game.message = 'ゲーム開始！ 全員のダイスを振ります。';
  game.actionHistory.push({
    id: `${Date.now()}-${Math.random()}`,
    text: `ゲーム開始。勝利目標 ${game.victoryTarget ?? 3}点`,
  });

  console.log('[saikoro] game started', {
    roomId: game.roomId,
    players: participants.map((player) => ({
      seat: player.saikoroSeat,
      socketId: player.socketId,
      name: player.name,
    })),
  });

  saikoroBroadcastState(game);

  return true;
}

// ============================================================
// 看板たぬき：全員同時ダイス
// ============================================================

function saikoroRollAllPlayers(
game
) {
if (
!game ||
game.phase !== 'dice'
) {
return;
}

const players =
saikoroGetPlayers(game);

if (
players.length !== SAIKORO_MAX_PLAYERS
) {
return;
}

const results = {};

for (const player of players) {
const gamePlayer =
saikoroGetGamePlayer(
game,
player.socketId
);


if (!gamePlayer) {
  console.error(
    '[saikoro] game player missing',
    {
      roomId: game.roomId,
      socketId: player.socketId,
      seat: player.playerNumber - 1,
    }
  );

  return;
}

results[player.socketId] =
  saikoroRollPlayerDice(
    gamePlayer
  );

}

// 全員分の結果を確定してから資源を獲得する
game.diceResults = results;
game.rerollResults = {};
game.diceResourceAwards = {};
game.smileActivatedSeats = [];
game.manemaneCopyUsed = {};
game.yomiyomiUsed ||= {};
game.resourcesReady = false;
game.effectsReady = false;
game.effectsFinished = new Set();

for (const player of players) {
  const result = results[player.socketId];
  game.actionHistory ||= [];
  game.actionHistory.push({
    id: `${Date.now()}-${Math.random()}`,
    text: `${player.name}がダイスを振りました（A: ${saikoroHistoryFace(result.a)} / B: ${saikoroHistoryFace(result.b)}）`,
  });
}
game.actionHistory = game.actionHistory.slice(-100);

game.phase = 'action';

game.actionUsed = {};

game.extraActionUsed = {};

game.answerTarget = null;

game.message =
`プレイヤー${Number(game.turnPlayer) + 1}のアクションです。`;

console.log(
'[saikoro] all players rolled',
{
roomId: game.roomId,
round: game.round,
turnPlayer: game.turnPlayer,
seats: players.map(
(player) => player.playerNumber - 1
),
}
);
saikoroBroadcastState(game);
}


// ============================================================
// 看板たぬき：次のターン
// ============================================================

function saikoroNextTurn(
  game
) {
  const players =
    saikoroGetPlayers(
      game
    );

  if (
    players.length ===
    0
  ) {
    return;
  }

  const currentIndex =
    Number(
      game.turnPlayer ??
        0
    );

  let nextIndex =
    currentIndex + 1;

  if (
    nextIndex >=
    SAIKORO_MAX_PLAYERS
  ) {
    nextIndex =
      0;

    game.round =
      Number(
        game.round ??
          1
      ) + 1;
  }

  game.turnPlayer =
    nextIndex;

  game.phase =
    'dice';

  const nextPlayer = players.find(
    (player) => Number(player.playerNumber) - 1 === nextIndex
  );
  if (nextPlayer) {
    game.actionHistory ||= [];
    game.actionHistory.push({
      id: `${Date.now()}-${Math.random()}`,
      text: `${nextPlayer.name}のターン開始`,
    });
    game.actionHistory = game.actionHistory.slice(-100);
  }

  game.diceResults =
    {};

  game.rerollResults = {};
  game.diceResourceAwards = {};
  game.smileActivatedSeats = [];
  game.resourcesReady = false;
  game.effectsReady = false;
  game.effectsFinished = new Set();

  game.actionUsed =
    {};

  game.cardPurchasedThisTurn = {};
  game.forgeUsedThisTurn = {};
  game.yomiyomiUsed = {};
  game.manemaneCopyUsed = {};

  game.extraActionUsed =
    {};

  game.answerTarget =
    null;

  game.lastAnswer = null;

  game.message =
    `プレイヤー${
      nextIndex + 1
    }のダイスフェーズです。全員でダイスを振ります。`;

  saikoroBroadcastState(game);
}


// ============================================================
// 看板たぬき：Socket.IO
// ============================================================

io.on(
  'connection',
  (socket) => {

    // ========================================================
    // 部屋へ参加
    // ========================================================

    socket.on(
      'saikoro:join',
      (payload) => {
        const safeRoomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        if (
          safeRoomId.length !==
          4
        ) {
          saikoroError(
            socket,
            '部屋IDが正しくありません。'
          );

          return;
        }

        const room =
          freeRooms.get(
            safeRoomId
          );

        if (
          !room
        ) {
          saikoroError(
            socket,
            'フリーマッチ部屋が見つかりません。'
          );

          return;
        }


        const incomingUserId =
          payload?.userId != null
            ? String(payload.userId)
            : '';

        const incomingName =
          String(payload?.name || '').trim();

        const lobbySocketId =
          String(payload?.playerSocketId || '').trim();

        const freePlayers =
          room.players instanceof Map
            ? Array.from(room.players.values())
            : Array.isArray(room.players)
              ? room.players
              : [];

        let playerIndex = -1;

        // ロビーで確定したSocket IDを最優先で使う。
        // 指定されている場合は、別の同一ユーザーの席へ
        // フォールバックしない。
        if (lobbySocketId) {
          playerIndex = freePlayers.findIndex(
            (item) =>
              String(item.socketId) === lobbySocketId
          );
        } else {
          // playerSocketIdがない旧画面・再接続用の処理
          playerIndex = freePlayers.findIndex(
            (item) =>
              String(item.socketId) === String(socket.id)
          );

          if (playerIndex < 0 && incomingUserId) {
            const sameUser = freePlayers
              .map((item, index) => ({ item, index }))
              .filter(
                ({ item }) =>
                  item.userId != null &&
                  String(item.userId) === incomingUserId
              );

            if (sameUser.length === 1) {
              playerIndex = sameUser[0].index;
            }
          }

          if (playerIndex < 0 && incomingName) {
            const sameName = freePlayers
              .map((item, index) => ({ item, index }))
              .filter(
                ({ item }) =>
                  String(item.name || '').trim() === incomingName
              );

            if (sameName.length === 1) {
              playerIndex = sameName[0].index;
            }
          }
        }

        if (playerIndex < 0) {
          saikoroError(
            socket,
            lobbySocketId
              ? 'ロビーの参加者情報を確認できません。ロビーから入り直してください。'
              : '参加者を特定できません。ロビーから入り直してください。'
          );

          return;
        }

       const player = freePlayers[playerIndex];

const oldSocketId = player.socketId;

// 最初に決めた席順を再接続後も維持する
if (
  player.saikoroSeat === undefined ||
  player.saikoroSeat === null ||
  !Number.isInteger(Number(player.saikoroSeat))
) {
  player.saikoroSeat = playerIndex;
}

const savedSeat = Number(player.saikoroSeat);

if (
  savedSeat < 0 ||
  savedSeat >= SAIKORO_MAX_PLAYERS
) {
  saikoroError(
    socket,
    '看板たぬきは4人専用です。'
  );

  return;
}

// 古いSocketが残っている場合は部屋から切り離す
if (oldSocketId && oldSocketId !== socket.id) {
  const oldSocket = io.sockets.sockets.get(oldSocketId);

  if (oldSocket) {
    oldSocket.leave(`free:${safeRoomId}`);
  }
}

// 部屋側の参加者情報を更新
const wasHost =
  String(room.hostSocketId) === String(oldSocketId);

player.socketId = socket.id;
player.saikoroSeat = savedSeat;

// ホストが再接続した場合はホストIDも更新する
if (wasHost) {
  room.hostSocketId = socket.id;
  console.log('[saikoro] host socket updated', {
    roomId: safeRoomId,
    oldSocketId,
    newSocketId: socket.id,
  });
}
        /*
         * ゲーム取得。
         */
        let game =
          saikoroGames.get(
            safeRoomId
          );

        if (
          !game
        ) {
          game = {
            roomId:
              safeRoomId,

            phase:
              'waiting',

            round:
              0,

            turnPlayer:
              0,

            players:
              {},

            diceResults:
              {},

            actionUsed:
              {},

            extraActionUsed:
              {},

            answerTarget:
              null,

started: false,
startRequested: false,
readyPlayers: new Set(),

            message:
              '4人揃うまでお待ちください。',
          };

          saikoroGames.set(
            safeRoomId,
            game
          );
        }

        /*
         * 再接続時にゲーム内データを
         * 新しいSocketへ移す。
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id &&
          game.players[
            oldSocketId
          ]
        ) {
          game.players[
            socket.id
          ] =
            game.players[
              oldSocketId
            ];

          game.players[
            socket.id
          ].socketId =
            socket.id;

          delete game.players[
            oldSocketId
          ];

          if (
            game.diceResults[
              oldSocketId
            ]
          ) {
            game.diceResults[
              socket.id
            ] =
              game.diceResults[
                oldSocketId
              ];

            delete game.diceResults[
              oldSocketId
            ];
          }
        }

// 再接続前の準備完了状態を新しいSocket IDへ引き継ぐ
if (oldSocketId && oldSocketId !== socket.id) {
  if (!(game.readyPlayers instanceof Set)) {
    game.readyPlayers = new Set();
  }

  if (game.readyPlayers.has(String(oldSocketId))) {
    game.readyPlayers.delete(String(oldSocketId));
    game.readyPlayers.add(String(socket.id));
  }
}

        /*
         * ゲーム開始済みで新規参加は不可。
         */
        if (
          game.phase !==
            'waiting' &&
          !game.players[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            'このゲームはすでに開始されています。'
          );

          return;
        }

        socket.join(
          `free:${safeRoomId}`
        );

        console.log(
          `[saikoro] join room=${safeRoomId} socket=${socket.id} name=${player.name}`
        );

  
        /*
         * 参加者が揃っても自動では開始しない。
         * ホストの開始要求と全員の準備完了を待つ。
         */
        if (
          game.phase === 'waiting'
        ) {
          const currentPlayers =
            saikoroGetPlayers(game);

          game.message =
            `ゲーム開始待ち：参加者 ${currentPlayers.length}/${SAIKORO_MAX_PLAYERS}人。全員の準備完了を待っています。`;
        }

        saikoroBroadcastState(game);
      }
    );

    // ========================================================
    // 看板たぬき：画面の準備完了
    // ========================================================

        socket.on(
      'saikoro:ready',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);

        const game = saikoroGames.get(roomId);

        console.log('[saikoro] ready受信', {
          roomId,
          socketId: socket.id,
          gameExists: Boolean(game),
          phase: game?.phase,
          started: game?.started,
        });

        if (
          !game ||
          game.phase !== 'waiting' ||
          game.started
        ) {
          console.log('[saikoro] ready拒否：ゲーム状態', {
            roomId,
            socketId: socket.id,
            gameExists: Boolean(game),
            phase: game?.phase,
            started: game?.started,
          });
          return;
        }

        const players = saikoroGetPlayers(game);

        const isParticipant = players.some(
          (player) =>
            String(player.socketId) === String(socket.id)
        );

        if (!isParticipant) {
          console.log('[saikoro] ready拒否：参加者不一致', {
            roomId,
            socketId: socket.id,
            participantSocketIds: players.map(
              (player) => String(player.socketId)
            ),
          });
          return;
        }

        if (!(game.readyPlayers instanceof Set)) {
          game.readyPlayers = new Set();
        }


        game.readyPlayers.add(String(socket.id));

        console.log('[saikoro] ready登録完了', {
          roomId,
          socketId: socket.id,
          readyCount: game.readyPlayers.size,
          readyPlayers: Array.from(game.readyPlayers),
        });

        // ホストが先に開始要求を送っていた場合、
        // 最後のプレイヤーの準備完了をきっかけに開始を再判定する。
        if (game.startRequested) {
          saikoroStartGame(game);
        }

      }
    );


    // ========================================================
    // 看板たぬき：ホストの開始要求
    // ========================================================

    socket.on(
      'saikoro:start-request',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);

        const game = saikoroGames.get(roomId);
        const room = freeRooms.get(roomId);

        if (
          !game ||
          !room ||
          game.phase !== 'waiting' ||
          game.started
        ) {
          return;
        }

        if (
          String(room.hostSocketId) !== String(socket.id)
        ) {
          saikoroError(
            socket,
            'ゲームを開始できるのはホストだけです。'
          );
          return;
        }

        if (
          payload?.currentVivreProfile &&
          typeof payload.currentVivreProfile === 'object'
        ) {
          const previousId = String(
            game.currentVivreProfile?.id ??
            game.currentVivreProfile?.number ??
            game.currentVivreProfile?.name ??
            ''
          );
          const nextId = String(
            payload.currentVivreProfile.id ??
            payload.currentVivreProfile.number ??
            payload.currentVivreProfile.name ??
            ''
          );

          if (previousId && nextId !== previousId) {
            for (const player of Object.values(game.players || {})) {
              player.vivreCardInfo = {};
            }
          }

          game.currentVivreProfile = payload.currentVivreProfile;
        }

        if (
          payload?.extraCharacter &&
          typeof payload.extraCharacter === 'object'
        ) {
          const previousId = String(
            game.extraCharacter?.id ??
            game.extraCharacter?.number ??
            game.extraCharacter?.name ??
            ''
          );
          const nextId = String(
            payload.extraCharacter.id ??
            payload.extraCharacter.number ??
            payload.extraCharacter.name ??
            ''
          );

          if (previousId && nextId !== previousId) {
            for (const player of Object.values(game.players || {})) {
              player.extraCharacterInfo = [];
              player.extraCharacterRevealedIndexes = [];
              player.extraSpecifiedCount = 0;
              player.extraRandomCount = 0;
            }
          }

          game.extraCharacter = payload.extraCharacter;
        }

        const victoryTarget = Number(payload?.victoryTarget);
        if (Number.isInteger(victoryTarget) && victoryTarget > 0) {
          game.victoryTarget = victoryTarget;
        }

        const startingPlayer = Number(payload?.startingPlayer);
        if (
          Number.isInteger(startingPlayer) &&
          startingPlayer >= 0 &&
          startingPlayer < SAIKORO_MAX_PLAYERS
        ) {
          game.startingPlayer = startingPlayer;
        }

        game.winnerSeat = null;
        game.lastAnswer = null;

console.log('[saikoro] start-request受信', {
  roomId,
  socketId: socket.id,
  hostSocketId: room?.hostSocketId,
  isHost:
    String(room?.hostSocketId) === String(socket.id),
  phase: game?.phase,
  started: game?.started,
  startRequestedBefore: game?.startRequested,
});

        game.startRequested = true;
        game.message = '全員の準備完了を待っています。';

        saikoroBroadcastState(game);
        saikoroStartGame(game);
      }
    );


    // ========================================================
    // ダイスを振る
    // ========================================================

    socket.on(
      'saikoro:roll',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          saikoroError(
            socket,
            '看板たぬきのゲームが見つかりません。'
          );

          return;
        }

        if (
          game.phase !==
          'dice'
        ) {
          saikoroError(
            socket,
            '現在はダイスを振るフェーズではありません。'
          );

          return;
        }

        if (
          Number(
            game.turnPlayer
          ) !==
          Number(
            saikoroGetGamePlayer(
              game,
              socket.id
            )?.seat
          )
        ) {
          saikoroError(
            socket,
            'ダイスを開始できるのは手番プレイヤーです。'
          );

          return;
        }

        saikoroRollAllPlayers(
          game
        );
      }
    );


    // ========================================================
    // ダイス面購入
    // ========================================================

    socket.on(
      'saikoro:buy-dice-face',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          saikoroError(
            socket,
            '看板たぬきのゲームが見つかりません。'
          );

          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自分のターンではありません。'
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません。'
          );

          return;
        }

        if (
          game.actionUsed[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            'このターンのアクションはすでに使用しています。'
          );

          return;
        }

        /*
         * 実際のダイス面情報・価格・
         * ランダム処理は今後別ファイルへ移す。
         *
         * 現段階ではfaceIdを受け取って
         * page.js側と通信できる土台だけ作る。
         */
        const faceId =
          String(
            payload?.faceId ||
              ''
          );

        const die =
          payload?.die ===
          'B'
            ? 'B'
            : 'A';

        const faceIndex =
          Number(
            payload?.faceIndex
          );

        if (
          !faceId
        ) {
          saikoroError(
            socket,
            'ダイスフェイスが指定されていません。'
          );

          return;
        }

        if (
          !Number.isInteger(
            faceIndex
          ) ||
          faceIndex < 0 ||
          faceIndex > 5
        ) {
          saikoroError(
            socket,
            '交換するダイス面が正しくありません。'
          );

          return;
        }

        /*
         * ここではまだ購入価格の確定処理を
         * 実装しない。
         *
         * ダイス面ショップの正式仕様を
         * page.js側のモジュールと合わせて
         * 次の段階で実装する。
         */
        game.actionUsed[
          socket.id
        ] = true;

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }がダイスフェイスを選択しました。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // カード購入
    // ========================================================

    socket.on(
      'saikoro:forge-face',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);
        const offerId = String(payload?.offerId || '');
        const offer = SAIKORO_FORGE_CATALOG[offerId];
        const dieKey = payload?.die === 'B' ? 'diceB' : 'diceA';
        const faceIndex = Number(payload?.faceIndex);

        const fail = (message) => {
          socket.emit('saikoro:forge-result', { ok: false, message });
        };

        if (!game || !player || !offer) {
          fail('鍛造内容を確認できません。');
          return;
        }

        if (
          game.phase !== 'action' ||
          Number(player.seat) !== Number(game.turnPlayer) ||
          game.effectsReady !== true
        ) {
          fail('現在は鍛造できません。');
          return;
        }

        game.forgeStocks ||= saikoroCreateForgeStocks();
        game.forgeUsedThisTurn ||= {};

        if (game.forgeUsedThisTurn[socket.id]) {
          fail('このターンはすでに鍛造しています。');
          return;
        }

        if (Number(game.forgeStocks[offerId] ?? 0) <= 0) {
          fail('この鍛造面は売り切れです。');
          return;
        }

        if (
          !Number.isInteger(faceIndex) ||
          faceIndex < 0 ||
          faceIndex >= 6 ||
          !Array.isArray(player[dieKey])
        ) {
          fail('交換するダイス面が正しくありません。');
          return;
        }

        if (Number(player.resources?.berry ?? 0) < offer.cost) {
          fail('鍛造に必要なベリーが足りません。');
          return;
        }

        player.resources.berry -= offer.cost;
        player[dieKey][faceIndex] = offer.faces.length === 1
          ? { ...offer.faces[0] }
          : {
              type: 'combo',
              faces: offer.faces.map((face) => ({ ...face })),
            };
        game.forgeStocks[offerId] -= 1;
        game.forgeUsedThisTurn[socket.id] = true;

        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text: `${player.name}が鍛造で${offerId}をサイコロ${payload?.die === 'B' ? 'B' : 'A'}の${faceIndex + 1}面に適用`,
        });
        game.actionHistory = game.actionHistory.slice(-100);
        game.message = `${player.name}が鍛造しました。`;

        saikoroBroadcastState(game);
        socket.emit('saikoro:forge-result', { ok: true, offerId });
      }
    );

    socket.on(
      'saikoro:buy-card',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          saikoroError(
            socket,
            '看板たぬきのゲームが見つかりません。'
          );

          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自分のターンではありません。'
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          socket.emit('saikoro:card-purchase-result', {
            ok: false,
            message: '現在はアクションフェーズではありません。',
          });
          return;
        }

        if (game.effectsReady !== true) {
          socket.emit('saikoro:card-purchase-result', {
            ok: false,
            message: '全員のダイス効果処理が終わるまでお待ちください。',
          });
          return;
        }

        const cardId =
          String(
            payload?.cardId ||
              ''
          );
        const card = SAIKORO_CARD_CATALOG[cardId];

        if (!card) {
          socket.emit('saikoro:card-purchase-result', {
            ok: false,
            message: '購入するカードを確認できません。',
          });
          return;
        }

        game.cardStocks ||= saikoroCreateCardStocks();
        game.cardPurchasedThisTurn ||= {};

        if (game.cardPurchasedThisTurn[socket.id]) {
          socket.emit('saikoro:card-purchase-result', {
            ok: false,
            message: 'このターンはすでにカードを購入しています。',
          });
          return;
        }

        if (Number(game.cardStocks[cardId] ?? 0) <= 0) {
          socket.emit('saikoro:card-purchase-result', {
            ok: false,
            message: 'このカードは売り切れです。',
          });
          return;
        }

        const canAfford = Object.entries(card.cost).every(
          ([type, amount]) =>
            Number(gamePlayer.resources?.[type] ?? 0) >= Number(amount)
        );

        if (!canAfford) {
          socket.emit('saikoro:card-purchase-result', {
            ok: false,
            message: 'カード購入に必要な資源が足りません。',
          });
          return;
        }

        for (const [type, amount] of Object.entries(card.cost)) {
          gamePlayer.resources[type] -= Number(amount);
        }

        gamePlayer.cards.push({
          id: cardId,
          name: card.name,
        });

        if (cardId === 'dorudoru') {
          gamePlayer.maxResources.berry += 4;
          gamePlayer.maxResources.verse += 3;
          gamePlayer.maxResources.eternal += 3;
        }

        game.cardStocks[cardId] -= 1;
        game.cardPurchasedThisTurn[socket.id] = true;
        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text: `${gamePlayer.name}が「${card.name}」を購入`,
        });
        game.actionHistory = game.actionHistory.slice(-100);

        game.message =
          `${gamePlayer.name}が「${card.name}」を購入しました。`;

        saikoroBroadcastState(
          game
        );

        socket.emit('saikoro:card-purchase-result', {
          ok: true,
          cardId,
          name: card.name,
        });
      }
    );


    // ========================================================
    // 追加アクション
    // ========================================================

    socket.on(
      'saikoro:extra-action',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自分のターンではありません。'
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません。'
          );

          return;
        }

        if (
          game.extraActionUsed[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            '追加アクションはすでに使用しています。'
          );

          return;
        }

        /*
         * ヴァース2を消費。
         */
        if (
          Number(
            gamePlayer.resources
              ?.verse ?? 0
          ) < 2
        ) {
          saikoroError(
            socket,
            '追加アクションにはヴァースが2個必要です。'
          );

          return;
        }

        gamePlayer.resources.verse -=
          2;

        game.extraActionUsed[
          socket.id
        ] = true;

        game.actionUsed[
          socket.id
        ] = false;

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }が追加アクションを使用しました。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // 購入終了 → 回答フェーズ
    // ========================================================

    socket.on(
      'saikoro:history',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);
        const text = String(payload?.text || '').trim().slice(0, 200);

        if (!game?.started || !player || !text) {
          return;
        }

        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text,
        });
        game.actionHistory = game.actionHistory.slice(-100);

        const historyPayload = {
          actionHistory: game.actionHistory,
        };
        for (const roomPlayer of saikoroGetPlayers(game)) {
          io.to(roomPlayer.socketId).emit(
            'saikoro:history-updated',
            historyPayload
          );
        }
      }
    );

    socket.on(
      'saikoro:player-state',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);
        const state = payload?.playerState;

        if (
          !game?.started ||
          !player ||
          !state ||
          typeof state !== 'object'
        ) {
          return;
        }

        for (const type of ['berry', 'verse', 'eternal']) {
          const value = Number(state.resources?.[type]);
          const max = Number(state.maxResources?.[type]);

          if (Number.isFinite(value)) {
            player.resources[type] = Math.max(0, value);
          }

          if (Number.isFinite(max)) {
            player.maxResources[type] = Math.max(0, max);
          }
        }

        for (const key of ['diceA', 'diceB']) {
          if (Array.isArray(state[key])) {
            player[key] = state[key].slice(0, 6).map((face) => ({ ...face }));
          }
        }

        for (const key of [
          'cards',
          'extraCharacterInfo',
          'extraCharacterRevealedIndexes',
        ]) {
          if (Array.isArray(state[key])) {
            player[key] = state[key].map((item) =>
              item && typeof item === 'object' ? { ...item } : item
            );
          }
        }

        const previousVivreInfo = player.vivreCardInfo || {};
        const nextVivreInfo =
          state.vivreCardInfo && typeof state.vivreCardInfo === 'object'
            ? { ...state.vivreCardInfo }
            : previousVivreInfo;
        const shareableInfoTypes = [
          'nameLength',
          'favoriteFood',
          'height',
          'age',
          'blood',
          'origin',
          'gender',
          'family',
        ];
        const changedInfoType = shareableInfoTypes.find(
          (type) =>
            nextVivreInfo[type] != null &&
            JSON.stringify(nextVivreInfo[type]) !==
              JSON.stringify(previousVivreInfo[type])
        );

        player.vivreCardInfo = nextVivreInfo;

        for (const key of [
          'extraCharacterCount',
          'extraSpecifiedCount',
          'extraRandomCount',
          'vivreCardCount',
        ]) {
          const value = Number(state[key]);
          if (Number.isFinite(value)) {
            player[key] = Math.max(0, Math.floor(value));
          }
        }

        const victoryTarget = Number(game.victoryTarget ?? 3);
        const totalCards =
          Number(player.extraCharacterCount ?? 0) +
          Number(player.vivreCardCount ?? 0);

        if (
          game.phase !== 'result' &&
          Number(player.extraCharacterCount ?? 0) > 0 &&
          Number(player.vivreCardCount ?? 0) > 0 &&
          totalCards >= victoryTarget
        ) {
          game.phase = 'result';
          game.winnerSeat = Number(player.seat);
          game.message = `${player.name}が勝利しました！`;
        }

        const privateNotices = [];

        if (changedInfoType) {
          for (const [socketId, target] of Object.entries(game.players || {})) {
            if (
              socketId === socket.id ||
              !Array.isArray(target.cards)
            ) {
              continue;
            }

            const kurodenCount = target.cards.filter(
              (card) => card?.id === 'kuroden'
            ).length;
            const existingInfo = target.vivreCardInfo || {};

            if (
              kurodenCount === 0 ||
              existingInfo[changedInfoType] != null ||
              Math.random() >= Math.min(kurodenCount * 0.3, 0.6)
            ) {
              continue;
            }

            target.vivreCardInfo = {
              ...existingInfo,
              [changedInfoType]: nextVivreInfo[changedInfoType],
            };

            if (
              changedInfoType === 'height' ||
              changedInfoType === 'age'
            ) {
              const lengthKey = `${changedInfoType}Length`;
              target.vivreCardInfo[lengthKey] =
                nextVivreInfo[lengthKey];
            }

            privateNotices.push({
              socketId,
              infoType: changedInfoType,
            });
          }
        }

        saikoroBroadcastState(game);

        const infoLabels = {
          nameLength: '名前の文字数',
          favoriteFood: '好物',
          height: '身長',
          age: '年齢',
          blood: '血液型',
          origin: '出身',
          gender: '性別',
          family: '家族',
        };

        for (const notice of privateNotices) {
          io.to(notice.socketId).emit('saikoro:kuroden-triggered', {
            message: `黒電伝虫が発動し、「${infoLabels[notice.infoType]}」の情報を入手しました。`,
          });
        }
      }
    );

    socket.on(
      'saikoro:manemane-copy',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);
        const targetSeat = Number(payload?.targetSeat);
        const die = payload?.die === 'B' ? 'b' : 'a';

        if (
          !game ||
          game.phase !== 'action' ||
          !game.resourcesReady ||
          !player ||
          !Number.isInteger(targetSeat) ||
          targetSeat === Number(player.seat)
        ) {
          return;
        }

        const ownResults = game.diceResults?.[socket.id];
        const manemaneCount = [ownResults?.a, ownResults?.b]
          .filter((item) => (item?.face ?? item)?.type === 'manemane')
          .length;
        game.manemaneCopyUsed ||= {};

        if (
          manemaneCount === 0 ||
          Number(game.manemaneCopyUsed[socket.id] ?? 0) >= manemaneCount
        ) {
          return;
        }

        const targetPlayer = saikoroGetPlayers(game).find(
          (item) => Number(item.playerNumber) - 1 === targetSeat
        );
        const selectedResult = targetPlayer
          ? game.diceResults?.[targetPlayer.socketId]?.[die]
          : null;
        const face = selectedResult?.face ?? selectedResult;

        if (!face || face.type === 'manemane') {
          return;
        }

        const applyCopiedFace = (copiedFace) => {
          if (copiedFace?.type === 'combo' && Array.isArray(copiedFace.faces)) {
            for (const component of copiedFace.faces) {
              applyCopiedFace(component);
            }
            return;
          }

          if (['berry', 'verse', 'eternal'].includes(copiedFace?.type)) {
            saikoroAddResource(
              player,
              copiedFace.type,
              Number(copiedFace.value) || 0
            );
          }
        };

        applyCopiedFace(face);
        game.manemaneCopyUsed[socket.id] =
          Number(game.manemaneCopyUsed[socket.id] ?? 0) + 1;

        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text: `${player.name}がマネマネで${targetPlayer.name}のダイス${die.toUpperCase()}をコピー`,
        });
        game.actionHistory = game.actionHistory.slice(-100);
        game.message = `${player.name}がマネマネで出目をコピーしました。`;
        saikoroBroadcastState(game);
      }
    );

    socket.on(
      'saikoro:yomiyomi-reroll',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);
        const die = payload?.die === 'b' ? 'b' : 'a';
        const newResult = payload?.result;

        if (
          !game ||
          game.phase !== 'action' ||
          !game.resourcesReady ||
          !player ||
          Number(player.seat) !== Number(game.turnPlayer) ||
          !newResult ||
          typeof newResult !== 'object'
        ) {
          return;
        }

        const cardCount = (player.cards || []).filter(
          (card) => card?.id === 'yomiyomi'
        ).length;
        game.yomiyomiUsed ||= {};
        if (cardCount === 0 || Number(game.yomiyomiUsed[socket.id] ?? 0) >= cardCount) {
          saikoroError(socket, 'ヨミヨミの実の使用回数を超えています。');
          return;
        }

        const resultFace = { ...newResult };
        const resultIndex = Number(resultFace.index);
        delete resultFace.index;
        const awards = saikoroApplyDiceResult(player, {
          a: {
            index: Number.isInteger(resultIndex) ? resultIndex : null,
            face: resultFace,
          },
          b: null,
        });

        game.diceResourceAwards ||= {};
        game.diceResourceAwards[socket.id] ||= {};
        game.diceResourceAwards[socket.id][die] = awards?.a || {};
        game.diceResults[socket.id][die] = {
          index: Number.isInteger(resultIndex) ? resultIndex : null,
          face: resultFace,
        };
        game.yomiyomiUsed[socket.id] =
          Number(game.yomiyomiUsed[socket.id] ?? 0) + 1;

        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text: `${player.name}がヨミヨミの実でダイス${die.toUpperCase()}を振り直しました（${saikoroHistoryFace(resultFace)}）`,
        });
        game.actionHistory = game.actionHistory.slice(-100);
        saikoroBroadcastState(game);
      }
    );

    socket.on(
      'saikoro:reroll-finished',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);
        const results = payload?.results;

        if (
          !game ||
          game.phase !== 'action' ||
          game.resourcesReady ||
          !player ||
          !results ||
          typeof results !== 'object'
        ) {
          return;
        }

        game.rerollResults[socket.id] = {
          a: results.a ?? null,
          b: results.b ?? null,
        };

        const players = saikoroGetPlayers(game);
        if (!players.every((item) => game.rerollResults[item.socketId])) {
          return;
        }

        game.diceResults = { ...game.rerollResults };
        game.diceResourceAwards = {};
        game.smileActivatedSeats = [];
        for (const item of players) {
          const gamePlayer = saikoroGetGamePlayer(game, item.socketId);
          const awards = saikoroApplyDiceResult(
            gamePlayer,
            game.diceResults[item.socketId]
          );
          game.diceResourceAwards[item.socketId] = awards;

          const smileCount = (gamePlayer.cards || []).filter(
            (card) => card?.id === 'smile'
          ).length;
          if (
            smileCount > 0 &&
            Math.random() < Math.min(smileCount * 0.1, 1)
          ) {
            const totalAwards = {};
            for (const dieAwards of Object.values(awards || {})) {
              for (const [type, amount] of Object.entries(dieAwards || {})) {
                totalAwards[type] =
                  Number(totalAwards[type] ?? 0) + Number(amount || 0);
              }
            }

            for (const [type, amount] of Object.entries(totalAwards)) {
              saikoroAddResource(gamePlayer, type, amount * 2);
            }

            game.smileActivatedSeats.push(Number(gamePlayer.seat));
            game.actionHistory ||= [];
            game.actionHistory.push({
              id: `${Date.now()}-${Math.random()}`,
              text: `${gamePlayer.name}のSMILEが発動し、出目の資源を3倍獲得`,
            });
            game.actionHistory = game.actionHistory.slice(-100);
          }
        }

        game.resourcesReady = true;
        saikoroBroadcastState(game);
      }
    );

    socket.on(
      'saikoro:effects-finished',
      (payload, acknowledge) => {
        const reply = (result) => {
          if (typeof acknowledge === 'function') {
            acknowledge(result);
          }
        };

        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);

        if (
          !game ||
          game.phase !== 'action' ||
          !game.resourcesReady ||
          !player
        ) {
          reply({ ok: false });
          return;
        }

        game.effectsFinished.add(socket.id);
        const players = saikoroGetPlayers(game);
        game.effectsReady = players.every((item) =>
          game.effectsFinished.has(item.socketId)
        );

        saikoroBroadcastState(game);
        reply({
          ok: true,
          effectsReady: game.effectsReady,
          finishedCount: game.effectsFinished.size,
          requiredCount: players.length,
        });
      }
    );

    socket.on(
      'saikoro:finish-action',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません。'
          );

          return;
        }

        if (!game.effectsReady) {
          saikoroError(
            socket,
            '全員のダイス効果処理が終わるまでお待ちください。'
          );
          return;
        }

        game.phase =
          'answer';

        game.answerTarget =
          null;

        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text: `${gamePlayer.name}が回答フェーズへ進みました`,
        });
        game.actionHistory = game.actionHistory.slice(-100);

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }の回答フェーズです。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // 回答
    // ========================================================

    socket.on(
      'saikoro:answer-result',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const player = saikoroGetGamePlayer(game, socket.id);

        if (
          !game ||
          game.phase !== 'answer' ||
          !player ||
          Number(player.seat) !== Number(game.turnPlayer)
        ) {
          return;
        }

        const target = payload?.target === 'vivre' ? 'vivre' : 'extra';
        const targetCard = target === 'vivre'
          ? game.currentVivreProfile
          : game.extraCharacter;
        const targetName = String(targetCard?.name ?? '');
        const answer = String(payload?.answer ?? '').slice(0, 100);
        const normalizeAnswer = (value) => String(value ?? '')
          .normalize('NFKC')
          .trim()
          .toLowerCase()
          .replace(/[\s　]+/g, '')
          .replace(/・/g, '');
        const normalizedAnswer = normalizeAnswer(answer);
        let correct = false;

        if (target === 'vivre' && targetName) {
          const parts = targetName.split(/[-・\s　]+/).filter(Boolean);
          const candidates = [targetName, ...parts];
          if (parts.length > 0) {
            candidates.push(parts[parts.length - 1]);
          }
          correct = candidates.some(
            (candidate) => normalizeAnswer(candidate) === normalizedAnswer
          );
        } else if (targetName) {
          const normalizedTarget = normalizeAnswer(targetName)
            .replace(/（.*?）|\(.*?\)/g, '');
          correct = Boolean(
            normalizedAnswer &&
            normalizedTarget &&
            normalizedAnswer.replace(/（.*?）|\(.*?\)/g, '') === normalizedTarget
          );
        }

        game.lastAnswer = {
          seat: Number(player.seat),
          playerName: player.name,
          target,
          answer,
          correct,
          targetName,
        };

        game.actionHistory ||= [];
        game.actionHistory.push({
          id: `${Date.now()}-${Math.random()}`,
          text: `${player.name}が「${answer}」と回答しました（${correct ? '正解' : '不正解'}）`,
        });
        game.actionHistory = game.actionHistory.slice(-100);

        if (correct) {
          const awardKey = `${socket.id}:${target}:${normalizeAnswer(targetName)}:${normalizedAnswer}`;
          if (!(game.awardedAnswers instanceof Set)) {
            game.awardedAnswers = new Set();
          }

          if (!game.awardedAnswers.has(awardKey)) {
            game.awardedAnswers.add(awardKey);

            if (target === 'vivre') {
              player.vivreCardCount = Number(player.vivreCardCount ?? 0) + 1;
              player.cards.push({
                id: `vivre-${targetCard.id ?? targetCard.number ?? targetName}`,
                type: 'vivre',
                name: targetName,
                profile: targetCard,
              });

              for (const gamePlayer of Object.values(game.players || {})) {
                gamePlayer.vivreCardInfo = {};
              }
            } else {
              player.extraCharacterCount = Number(player.extraCharacterCount ?? 0) + 1;
              player.cards.push({
                id: `extra-${targetCard.id ?? targetCard.number ?? targetName}`,
                type: 'extra',
                name: targetName,
                description: targetCard.description ?? '',
                character: targetCard,
              });
            }

            const victoryTarget = Number(game.victoryTarget ?? 3);
            const totalCards =
              Number(player.extraCharacterCount ?? 0) +
              Number(player.vivreCardCount ?? 0);

            if (
              Number(player.extraCharacterCount ?? 0) > 0 &&
              Number(player.vivreCardCount ?? 0) > 0 &&
              totalCards >= victoryTarget
            ) {
              game.phase = 'result';
              game.winnerSeat = Number(player.seat);
              game.message = `${player.name}が勝利しました！`;
            }
          }
        }

        saikoroBroadcastState(game);
      }
    );

    socket.on(
      'saikoro:targets-updated',
      (payload) => {
        const roomId = String(payload?.roomId || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const game = saikoroGames.get(roomId);
        const gamePlayer = saikoroGetGamePlayer(game, socket.id);

        if (
          !game ||
          game.phase !== 'answer' ||
          !gamePlayer ||
          Number(gamePlayer.seat) !== Number(game.turnPlayer)
        ) {
          return;
        }

        if (
          payload?.currentVivreProfile &&
          typeof payload.currentVivreProfile === 'object'
        ) {
          const previousProfileId = String(
            game.currentVivreProfile?.id ??
            game.currentVivreProfile?.number ??
            game.currentVivreProfile?.name ??
            ''
          );
          const nextProfileId = String(
            payload.currentVivreProfile.id ??
            payload.currentVivreProfile.number ??
            payload.currentVivreProfile.name ??
            ''
          );

          if (
            previousProfileId &&
            nextProfileId !== previousProfileId
          ) {
            for (const player of Object.values(game.players || {})) {
              player.vivreCardInfo = {};
            }
          }

          game.currentVivreProfile = payload.currentVivreProfile;
        }

        if (
          payload?.extraCharacter &&
          typeof payload.extraCharacter === 'object'
        ) {
          const previousCharacterId = String(
            game.extraCharacter?.id ??
            game.extraCharacter?.number ??
            game.extraCharacter?.name ??
            ''
          );
          const nextCharacterId = String(
            payload.extraCharacter.id ??
            payload.extraCharacter.number ??
            payload.extraCharacter.name ??
            ''
          );

          if (
            previousCharacterId &&
            nextCharacterId !== previousCharacterId
          ) {
            for (const player of Object.values(game.players || {})) {
              player.extraCharacterInfo = [];
              player.extraCharacterRevealedIndexes = [];
              player.extraSpecifiedCount = 0;
              player.extraRandomCount = 0;
            }
          }

          game.extraCharacter = payload.extraCharacter;
        }

        saikoroBroadcastState(game);
      }
    );

    socket.on(
      'saikoro:answer',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自分のターンではありません。'
          );

          return;
        }

        if (
          game.phase !==
          'answer'
        ) {
          saikoroError(
            socket,
            '現在は回答フェーズではありません。'
          );

          return;
        }

        const target =
          payload?.target ===
          'vivre'
            ? 'vivre'
            : 'extra';

        const answer =
          String(
            payload?.answer ||
              ''
          ).trim();

        /*
         * 正式な回答判定は
         * extra-character / vivre-search
         * の既存処理を参考に
         * 専用モジュールへ移す。
         *
         * 現段階では回答値を保存して
         * 次の実装につなげる。
         */

        game.answerTarget = {
          socketId: socket.id,
          target,
          answer,
        };

        game.message =
          `プレイヤー${gamePlayer.seat + 1}が回答しました。`;

        saikoroBroadcastState(game);

        // 回答表示後、同じゲームが回答フェーズのままなら
        // 次のプレイヤーへ進める
        setTimeout(() => {
          const currentGame =
            saikoroGames.get(roomId);

          if (
            !currentGame ||
            currentGame !== game ||
            currentGame.phase !== 'answer' ||
            currentGame.answerTarget?.socketId !== socket.id
          ) {
            return;
          }

          saikoroNextTurn(currentGame);
        }, 1500);
      }
    );


    // ========================================================
    // 切断
    // ========================================================

    socket.on(
      'disconnect',
      () => {
        const game =
          Array.from(
            saikoroGames.values()
          ).find(
            (item) =>
              item.players?.[
                socket.id
              ]
          );

        if (
          !game
        ) {
          return;
        }

        /*
         * ゲーム中はゲームデータを消さない。
         * 再接続時にuserId/nameから
         * 新しいSocketへ移せるようにする。
         */
        console.log(
          `[saikoro] disconnect room=${game.roomId} socket=${socket.id}`
        );
      }
    );
  }
);

 // ========================================================
 // ========================================================
 // 多答クイズ
 // ========================================================
 // ========================================================

const hasteVouteGames = new Map();
let hasteVouteQuestionsCache = null;
let hasteVouteHandicapsCache = null;

async function hasteVouteLoadExcelFirstColumn(fileName) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const xlsx = await import("xlsx");

  const filePath = path.join(process.cwd(), "data", fileName);
  const buffer = await fs.readFile(filePath);
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  })
    .map((row) => String(row?.[0] ?? "").trim())
    .filter(Boolean)
    .filter((value, index, list) => index === 0 || value !== list[index - 1]);
}

async function hasteVouteGetQuestions() {
  if (!hasteVouteQuestionsCache) {
    hasteVouteQuestionsCache =
      await hasteVouteLoadExcelFirstColumn("questions.xlsx");
  }
  return hasteVouteQuestionsCache;
}

async function hasteVouteGetHandicaps() {
  if (!hasteVouteHandicapsCache) {
    hasteVouteHandicapsCache =
      await hasteVouteLoadExcelFirstColumn("handicaps.xlsx");
  }
  return hasteVouteHandicapsCache;
}

function hasteVouteShuffle(list) {
  const result = [...list];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function hasteVouteNormalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "");
}

function hasteVouteGetFreeRoom(roomId) {
  return freeRooms.get(String(roomId));
}

function hasteVouteGetLobbyPlayers(room) {
  if (!room?.players) return [];

  return [...room.players.entries()].map(([socketId, player]) => ({
    socketId,
    userId: String(
      player?.userId ??
      player?.id ??
      player?.user_id ??
      socketId
    ),
    name: String(
      player?.name ??
      player?.displayName ??
      player?.username ??
      "プレイヤー"
    ),
  }));
}

function hasteVoutePublicState(game, userId) {
  const me = game.players.find(
    (player) => player.userId === String(userId)
  );

  return {
roomId:
  game.roomId,

phase:
  game.phase,

started:
  Boolean(game.started),
    targetScore: game.targetScore,
    answerSeconds: game.answerSeconds,
    deadline: game.deadline,
    round: game.round,
    turnUserId: game.players[game.turnIndex]?.userId ?? null,
    turnPlayerName: game.players[game.turnIndex]?.name ?? null,
    hostUserId: game.hostUserId,
    players: game.players.map((player) => ({
      userId: player.userId,
      name: player.name,
      score: player.score,
      declaredNumber: player.declaredNumber,
      acceptedCount: player.acceptedCount,
      isConnected: Boolean(player.socketId),
    })),
    topic: game.topic,
    declarations: game.declarationOrder.map((playerId) => {
      const player = game.players.find((item) => item.userId === playerId);
      return player
        ? {
            userId: player.userId,
            name: player.name,
            number: player.declaredNumber,
          }
        : null;
    }).filter(Boolean),
    answererUserId: game.answererUserId,
    answererName:
      game.players.find(
        (player) => player.userId === game.answererUserId
      )?.name ?? null,
    ownAnswers: (me?.answers ?? [])
      .map((answer, index) => ({
        index,
        text: answer.text,
        used: answer.used,
      }))
      .filter((answer) => !answer.used),
    currentReveal: game.currentReveal,
    votes: game.votes,
    voteCount: Object.keys(game.votes).length,
    voterCount: game.players.filter(
      (player) => player.userId !== game.answererUserId
    ).length,
    lastResult: game.lastResult,

    handicapCards: game.handicapCards ?? [],

    winnerUserId: game.winnerUserId,
    error: game.error,
  };
}

function hasteVouteBroadcastState(game) {
  for (const player of game.players) {
    if (!player.socketId) continue;

    io.to(player.socketId).emit(
      "haste-voute:state",
      hasteVoutePublicState(game, player.userId)
    );
  }
}

function hasteVouteClearTimer(game) {
  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }
}

function hasteVouteFinishGame(game, winner) {
  hasteVouteClearTimer(game);
  game.phase = "finished";
  game.winnerUserId = winner.userId;
  game.lastResult = `${winner.name} の勝利！`;
  hasteVouteBroadcastState(game);
}



function hasteVouteDrawHandicap(game) {
  // すでに配布済み、または配布待ちなら何もしない
  if (game.handicapDrawn || game.handicapPending) return;

  const threshold = game.targetScore * 2 / 3;

  // 目標点の2/3以上に到達したか確認
  const crossed = game.players.some(
    (player) => player.score >= threshold
  );

  if (!crossed) return;

  // この時点では配らず、ラウンド終了まで待つ
  game.handicapPending = true;

  console.log("[haste-voute] ハンデカード配布待ち", {
    round: game.round,
    threshold,
    players: game.players.map((player) => ({
      name: player.name,
      score: player.score,
    })),
  });
}

async function hasteVouteAwardHandicapAtRoundEnd(game) {
  if (!game.handicapPending || game.handicapDrawn) return;

  try {
    const cards = await hasteVouteGetHandicaps();

    if (!cards.length) {
      console.error("[haste-voute] ハンデカードがありません。data/handicaps.xlsx を確認してください。");
      return;
    }

    // ラウンド終了時点の最高得点を取得
    const highestScore = Math.max(
      ...game.players.map((player) => player.score)
    );

    // 最高得点が同点なら、その全員を対象にする
    const leaders = game.players.filter(
      (player) => player.score === highestScore
    );

    if (!leaders.length) return;

    if (!game.handicapCards) {
      game.handicapCards = [];
    }

    for (const leader of leaders) {
      const card = cards[
        Math.floor(Math.random() * cards.length)
      ];

      game.handicapCards.push({
        userId: leader.userId,
        name: leader.name,
        card,
      });
    }

    game.handicapPending = false;
    game.handicapDrawn = true;

    console.log("[haste-voute] ハンデカード配布完了", {
      round: game.round,
      highestScore,
      recipients: leaders.map((player) => player.name),
    });

    hasteVouteBroadcastState(game);
  } catch (error) {
    console.error("[haste-voute] ハンデカード配布エラー", error);
  }
}

function hasteVouteStartAnswerPhase(game) {
  hasteVouteClearTimer(game);

  game.phase = "answer";
  game.topic =
    game.questionDeck.shift() ??
    game.allQuestions[
      Math.floor(Math.random() * game.allQuestions.length)
    ];

  if (game.questionDeck.length === 0) {
    game.questionDeck = hasteVouteShuffle(game.allQuestions);
  }

  game.round += 1;
  game.deadline = Date.now() + game.answerSeconds * 1000;
  game.lastResult = null;
  game.currentReveal = null;
  game.votes = {};
  game.answererUserId = null;
  game.declarationOrder = [];
  game.declarationCursor = 0;


  for (const player of game.players) {
    player.answers = [];
    player.declaredNumber = null;
    player.acceptedCount = 0;
    player.revealedCount = 0;
  }

  hasteVouteBroadcastState(game);

  game.timer = setTimeout(() => {
    if (game.phase !== "answer") return;

    game.phase = "declare";
    game.deadline = null;
    hasteVouteBroadcastState(game);
  }, game.answerSeconds * 1000);
}



function hasteVouteStartRevealPhase(game) {
  const turnIndex = game.turnIndex;
  const playerCount = game.players.length;

  console.log("[haste-voute] 公開フェーズ開始前", {
    round: game.round,
    phase: game.phase,
    players: game.players.map((player) => ({
      name: player.name,
      userId: player.userId,
      declaredNumber: player.declaredNumber,
      savedAnswerCount: player.answers.filter(
        (answer) => !answer.used
      ).length,
    })),
  });

  // 全員が宣言していることを確認する
  const undeclaredPlayers = game.players.filter(
    (player) => player.declaredNumber === null
  );

  if (undeclaredPlayers.length > 0) {
    console.error("[haste-voute] 未宣言のプレイヤーがいるため公開を開始できません", {
      players: undeclaredPlayers.map((player) => player.name),
    });

    game.phase = "declare";
    hasteVouteBroadcastState(game);
    return;
  }

  // 全プレイヤーを宣言数の少ない順に並べる
  // 同数の場合は現在の手番から時計回り
  game.declarationOrder = [...game.players]
    .sort((a, b) => {
      if (a.declaredNumber !== b.declaredNumber) {
        return a.declaredNumber - b.declaredNumber;
      }

      const aDistance =
        (game.players.indexOf(a) - turnIndex + playerCount) %
        playerCount;

      const bDistance =
        (game.players.indexOf(b) - turnIndex + playerCount) %
        playerCount;

      return aDistance - bDistance;
    })
    .map((player) => player.userId);

  game.declarationCursor = 0;
  game.answererUserId = null;
  game.currentReveal = null;
  game.votes = {};
  game.phase = "reveal";

  console.log("[haste-voute] 公開順を確定", {
    round: game.round,
    declarationOrder: game.declarationOrder,
  });

  hasteVouteAdvanceAnswerer(game);
}



function hasteVouteAdvanceAnswerer(game) {
  game.currentReveal = null;
  game.votes = {};

  console.log("[haste-voute] 回答者の進行状況", {
    round: game.round,
    phase: game.phase,
    declarationCursor: game.declarationCursor,
    declarationOrder: game.declarationOrder,
    players: game.players.map((player) => ({
      name: player.name,
      userId: player.userId,
      declaredNumber: player.declaredNumber,
      acceptedCount: player.acceptedCount,
      savedAnswerCount: player.answers.filter(
        (answer) => !answer.used
      ).length,
    })),
  });

  // 全プレイヤーの処理が終わった場合だけラウンド終了
  if (game.declarationCursor >= game.declarationOrder.length) {
    const winner = game.players.find(
      (player) => player.score >= game.targetScore
    );

    if (winner) {
      hasteVouteFinishGame(game, winner);
      return;
    }

    game.phase = "round-end";
    game.deadline = null;
    game.answererUserId = null;
    game.lastResult =
      "全プレイヤーの回答公開が終了しました。次のお題へ進めます。";

    void hasteVouteAwardHandicapAtRoundEnd(game);
    hasteVouteBroadcastState(game);
    return;
  }

  // 次の回答者を取得する
  const nextUserId =
    game.declarationOrder[game.declarationCursor];

  const player = game.players.find(
    (item) => item.userId === nextUserId
  );

  console.log("[haste-voute] 次の回答者", {
    round: game.round,
    declarationCursor: game.declarationCursor,
    declarationOrderLength: game.declarationOrder.length,
    nextUserId,
    playerName: player?.name ?? null,
    declaredNumber: player?.declaredNumber ?? null,
    savedAnswerCount: player?.answers.filter(
      (answer) => !answer.used
    ).length ?? 0,
  });

  // 存在しないプレイヤーIDがあればログを残して次へ
  if (!player) {
    console.error("[haste-voute] 宣言順にプレイヤーが見つかりません", {
      nextUserId,
      declarationCursor: game.declarationCursor,
      declarationOrder: game.declarationOrder,
    });

    game.declarationCursor += 1;
    hasteVouteAdvanceAnswerer(game);
    return;
  }

  game.answererUserId = player.userId;
  player.acceptedCount = 0;
  game.phase = "reveal";

  // 0枚宣言なら公開不要。処理済みにして次へ
  if (player.declaredNumber === 0) {
    game.lastResult =
      `${player.name} は0枚を宣言しました。0点です。`;

    game.declarationCursor += 1;
    hasteVouteAdvanceAnswerer(game);
    return;
  }

  // 未公開の回答がなければ失敗扱い
  if (!player.answers.some((answer) => !answer.used)) {
    console.error("[haste-voute] 公開可能な回答が0件", {
      round: game.round,
      playerName: player.name,
      declaredNumber: player.declaredNumber,
      savedAnswerCount: player.answers.length,
      declarationCursor: game.declarationCursor,
    });

    hasteVouteFailAnswerer(game);
    return;
  }

  // ここまで来たら、必ず回答公開画面を配信する
  game.lastResult =
    `${player.name} の回答公開です。`;

  hasteVouteBroadcastState(game);
}

function hasteVouteFailAnswerer(game) {
  const player = game.players.find(
    (item) => item.userId === game.answererUserId
  );

  if (player) {
    player.score += 0;
    game.lastResult =
      `${player.name} は宣言した ${player.declaredNumber} 枚に届かず、0点です。`;
  }

  hasteVouteDrawHandicap(game);
  game.declarationCursor += 1;
  hasteVouteAdvanceAnswerer(game);
}

function hasteVouteRevealNext(game) {
  const player = game.players.find(
    (item) => item.userId === game.answererUserId
  );

  if (!player) return;

  const available = player.answers
    .map((answer, index) => ({ ...answer, index }))
    .filter((answer) => !answer.used);

  if (
    player.acceptedCount >= player.declaredNumber
  ) {
    player.score += player.declaredNumber;

    game.lastResult =
      `${player.name} が ${player.declaredNumber} 点を獲得しました！`;

    hasteVouteDrawHandicap(game);

    if (player.score >= game.targetScore) {
      hasteVouteFinishGame(game, player);
      return;
    }

    game.declarationCursor += 1;
    hasteVouteAdvanceAnswerer(game);
    return;
  }

  if (!available.length) {
    hasteVouteFailAnswerer(game);
    return;
  }

  game.phase = "reveal";
  game.currentReveal = null;
  game.votes = {};
  hasteVouteBroadcastState(game);
}

io.on("connection", (socket) => {
  socket.on("haste-voute:join", async (payload = {}) => {
    try {
      const roomId = String(payload.roomId ?? "").trim();
      const userId = String(payload.userId ?? "").trim();
      const name = String(payload.name ?? "プレイヤー").trim();

      if (!roomId || !userId) {
        socket.emit("haste-voute:error", "部屋番号またはユーザー情報がありません。");
        return;
      }

      const lobby = hasteVouteGetFreeRoom(roomId);

      if (!lobby) {
        socket.emit("haste-voute:error", "フリールームが見つかりません。ロビーから入り直してください。");
        return;
      }

      const lobbyPlayers = hasteVouteGetLobbyPlayers(lobby);
      const lobbyPlayer = lobbyPlayers.find(
        (player) => player.userId === userId
      );

      if (!lobbyPlayer) {
        socket.emit("haste-voute:error", "このフリールームの参加者ではありません。");
        return;
      }

      let game = hasteVouteGames.get(roomId);

      if (!game) {
        const questions = await hasteVouteGetQuestions();

        if (!questions.length) {
          socket.emit("haste-voute:error", "data/questions.xlsx の1列目にお題がありません。");
          return;
        }

        const host = lobbyPlayers.find(
          (player) => player.socketId === lobby.hostSocketId
        );

        game = {
          roomId,
          hostUserId: String(lobby.hostUserId ?? host?.userId ?? userId),
          players: lobbyPlayers.map((player) => ({
            ...player,
            score: 0,
            answers: [],
            declaredNumber: null,
            acceptedCount: 0,
            revealedCount: 0,
          })),
          phase: "setup",
          targetScore: 40,
          answerSeconds: 120,
          deadline: null,
          round: 0,
          turnIndex: 0,
          allQuestions: questions,
          questionDeck: hasteVouteShuffle(questions),
          declarationOrder: [],
          declarationCursor: 0,
          answererUserId: null,
          currentReveal: null,
          votes: {},
          lastResult: null,
 

handicapCards: [],
handicapDrawn: false,
handicapPending: false,


          winnerUserId: null,
          timer: null,
        };

        hasteVouteGames.set(roomId, game);
      }

      const player = game.players.find(
        (item) => item.userId === userId
      );

      if (!player) {
        socket.emit("haste-voute:error", "ゲーム参加者情報を取得できません。");
        return;
      }

      if (player.socketId && player.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(player.socketId);
        if (oldSocket) {
          oldSocket.leave(`haste-voute:${roomId}`);
        }
      }

      player.socketId = socket.id;
      player.name = name || player.name;
      socket.data.hasteVouteRoomId = roomId;
      socket.data.hasteVouteUserId = userId;
      socket.join(`haste-voute:${roomId}`);

      hasteVouteBroadcastState(game);
    } catch (error) {
      console.error("[haste-voute] join error", error);
      socket.emit("haste-voute:error", "ゲームへの参加に失敗しました。");
    }
  });

  socket.on("haste-voute:setup", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);

    if (!game || game.phase !== "setup") return;
    if (socket.data.hasteVouteUserId !== game.hostUserId) return;

    const targetScore = Number(payload.targetScore);
    const answerSeconds = Number(payload.answerSeconds);

    if (
      !Number.isInteger(targetScore) ||
      targetScore < 5 ||
      targetScore > 500 ||
      !Number.isInteger(answerSeconds) ||
      answerSeconds < 30 ||
      answerSeconds > 600
    ) {
      socket.emit("haste-voute:error", "勝利点は5～500点、制限時間は30～600秒で設定してください。");
      return;
    }

    game.targetScore = targetScore;
    game.answerSeconds = answerSeconds;
    hasteVouteBroadcastState(game);
  });

  socket.on("haste-voute:start", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);

    if (!game || game.phase !== "setup") return;
    if (socket.data.hasteVouteUserId !== game.hostUserId) return;

    if (game.players.length < 2) {
      socket.emit("haste-voute:error", "2人以上で開始してください。");
      return;
    }

    hasteVouteStartAnswerPhase(game);
  });


socket.on("haste-voute:submit-answers", (payload = {}) => {
  const roomId = String(payload.roomId ?? "");
  const game = hasteVouteGames.get(roomId);

  console.log("[haste-voute] 回答送信を受信", {
    roomId,
    phase: game?.phase ?? null,
    socketUserId: socket.data.hasteVouteUserId ?? null,
    answerText: String(payload.answers ?? ""),
  });

  if (!game || game.phase !== "answer") {
    console.warn("[haste-voute] 回答を保存できません。ゲームが回答フェーズではありません。", {
      roomId,
      phase: game?.phase ?? null,
    });
    return;
  }

  const player = game.players.find(
    (item) => item.userId === socket.data.hasteVouteUserId
  );

  if (!player || player.socketId !== socket.id) {
    console.warn("[haste-voute] 回答を保存できません。プレイヤーが一致しません。", {
      socketUserId: socket.data.hasteVouteUserId ?? null,
      playerFound: Boolean(player),
      socketMatches: player?.socketId === socket.id,
    });
    return;
  }

  const answers = String(payload.answers ?? "")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean);

  player.answers = answers.map((text) => ({
    text: text.slice(0, 100),
    used: false,
  }));

  console.log("[haste-voute] 回答を保存しました", {
    playerName: player.name,
    answerCount: player.answers.length,
    answers: player.answers.map((answer) => answer.text),
  });

  hasteVouteBroadcastState(game);
});


  socket.on("haste-voute:declare", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);
    const userId = socket.data.hasteVouteUserId;
    const number = Number(payload.number);

    console.log("[haste-voute] 数字の宣言を受信", {
      roomId,
      phase: game?.phase ?? null,
      userId: userId ?? null,
      number,
    });

    if (!game || game.phase !== "declare") {
      console.warn("[haste-voute] 宣言を拒否：フェーズが違います", {
        phase: game?.phase ?? null,
      });
      return;
    }

    const player = game.players.find(
      (item) => item.userId === userId
    );

    if (!player) {
      console.warn("[haste-voute] 宣言を拒否：プレイヤーが見つかりません", {
        userId,
      });
      return;
    }

    if (player.declaredNumber !== null) {
      console.warn("[haste-voute] 宣言を拒否：すでに宣言済み", {
        playerName: player.name,
        declaredNumber: player.declaredNumber,
      });
      return;
    }

    if (
      !Number.isInteger(number) ||
      number < 0 ||
      number > 100
    ) {
      console.warn("[haste-voute] 宣言を拒否：数字が不正です", {
        number: payload.number,
      });
      return;
    }

    player.declaredNumber = number;

    console.log("[haste-voute] 数字の宣言を保存", {
      playerName: player.name,
      number,
    });

    if (
      game.players.every(
        (item) => item.declaredNumber !== null
      )
    ) {
      hasteVouteStartRevealPhase(game);
      return;
    }

    hasteVouteBroadcastState(game);
  });


  socket.on("haste-voute:reveal", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);
    const userId = String(socket.data.hasteVouteUserId ?? "");

    console.log("[haste-voute] カード公開リクエスト", {
      roomId,
      phase: game?.phase ?? null,
      userId,
      answererUserId: game?.answererUserId ?? null,
      index: payload.index,
    });

    if (!game || game.phase !== "reveal") {
      console.warn("[haste-voute] 公開できません：ゲームまたはフェーズが不正です");
      return;
    }

    if (userId !== String(game.answererUserId ?? "")) {
      console.warn("[haste-voute] 公開できません：回答者が一致しません");
      return;
    }

    const player = game.players.find(
      (item) => String(item.userId) === userId
    );

    if (!player || !player.socketId || player.socketId !== socket.id) {
      console.warn("[haste-voute] 公開できません：プレイヤー情報が一致しません");
      return;
    }

    const index = Number(payload.index);
    const answer = player.answers[index];

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      !answer ||
      answer.used
    ) {
      console.warn("[haste-voute] 公開できません：カードが無効です", {
        index,
        answerFound: Boolean(answer),
        used: answer?.used ?? null,
      });
      return;
    }

    answer.used = true;

    game.currentReveal = {
      text: answer.text,
      answererUserId: player.userId,
      answererName: player.name,
    };

    game.phase = "vote";
    game.votes = {};

    console.log("[haste-voute] カード公開成功", {
      playerName: player.name,
      answer: answer.text,
    });

    hasteVouteBroadcastState(game);
  });


  socket.on("haste-voute:remove-duplicate", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);

    if (!game || game.phase !== "vote" || !game.currentReveal) return;

    const userId = socket.data.hasteVouteUserId;

    if (!userId || userId === game.answererUserId) return;

    const player = game.players.find(
      (item) => item.userId === userId
    );

    const index = Number(payload.index);
    const answer = player?.answers[index];

    if (
      !answer ||
      answer.used ||
      hasteVouteNormalizeAnswer(answer.text) !==
        hasteVouteNormalizeAnswer(game.currentReveal.text)
    ) {
      return;
    }

    answer.used = true;
    hasteVouteBroadcastState(game);
  });

  socket.on("haste-voute:vote", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);

    if (!game || game.phase !== "vote" || !game.currentReveal) return;

    const userId = socket.data.hasteVouteUserId;

    if (!userId || userId === game.answererUserId) return;
    if (payload.vote !== "OK" && payload.vote !== "NG") return;
    if (Object.prototype.hasOwnProperty.call(game.votes, userId)) return;

    game.votes[userId] = payload.vote;

    const voters = game.players.filter(
      (player) => player.userId !== game.answererUserId
    );

    if (Object.keys(game.votes).length < voters.length) {
      hasteVouteBroadcastState(game);
      return;
    }

    const okCount = Object.values(game.votes).filter(
      (vote) => vote === "OK"
    ).length;

    const passed = okCount > voters.length / 2;

    if (passed) {
      const answerer = game.players.find(
        (player) => player.userId === game.answererUserId
      );

      if (answerer) {
        answerer.acceptedCount += 1;
        game.lastResult =
          `「${game.currentReveal.text}」はOK！ (${answerer.acceptedCount}/${answerer.declaredNumber})`;
      }

      hasteVouteRevealNext(game);
      return;
    }

    game.lastResult =
      `「${game.currentReveal.text}」はNG。次の回答を公開してください。`;

    game.currentReveal = null;
    game.votes = {};
    game.phase = "reveal";

    const answerer = game.players.find(
      (player) => player.userId === game.answererUserId
    );

    if (
      !answerer?.answers.some((answer) => !answer.used)
    ) {
      hasteVouteFailAnswerer(game);
      return;
    }

    hasteVouteBroadcastState(game);
  });


  socket.on("haste-voute:next-topic", (payload = {}) => {
    const roomId = String(payload.roomId ?? "");
    const game = hasteVouteGames.get(roomId);
    const userId = socket.data.hasteVouteUserId;

    if (!game || game.phase !== "round-end") return;

    const player = game.players.find(
      (item) => item.userId === userId
    );

    if (!player || player.socketId !== socket.id) return;

    // 次のラウンドでは手番を時計回りに交代する
    game.turnIndex =
      (game.turnIndex + 1) % game.players.length;

    hasteVouteStartAnswerPhase(game);
  });



  socket.on("disconnect", () => {
    const roomId = socket.data.hasteVouteRoomId;
    const userId = socket.data.hasteVouteUserId;
    if (!roomId || !userId) return;

    const game = hasteVouteGames.get(roomId);
    if (!game) return;

    const player = game.players.find(
      (item) => item.userId === userId
    );

    if (player?.socketId === socket.id) {
      player.socketId = null;
      hasteVouteBroadcastState(game);
    }
  });
});
