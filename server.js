// file: server.js
import http from "http";
import { Server } from "socket.io";
import db from "./lib/db.js";
import { addBerriesByUserId } from "./lib/berries.js";

const PORT = process.env.PORT || 4000;

// ★ 現在接続中のソケット数
let onlineCount = 0;

// socket.ioサーバー
const httpServer = http.createServer((req, res) => {
  // ▼ オンライン人数を返すシンプルなHTTPエンドポイント
  if (req.url === "/online-count") {
    const body = JSON.stringify({ count: onlineCount });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(body);
    return;
  }

  // それ以外のパスは 404
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not Found");
});

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ★ レートから称号を決める（lib/db.js と同じロジック）
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
//
// rateQueue の要素:
// { socketId, name, rating, userId, joinedAt }
const rateQueue = [];

// ========== バトル用ルーム状態 ==========
// rooms: Map<roomId, { players: Map<socketId, player>, answers: Map<qIndex, Map<socketId, {isCorrect,timeMs}>>, ... }>
const rooms = new Map();

function log(...args) {
  console.log("[server]", ...args);
}

function removeFromRateQueue(socketId) {
  const idx = rateQueue.findIndex((p) => p.socketId === socketId);
  if (idx !== -1) {
    const removed = rateQueue.splice(idx, 1)[0];
    log("rateQueue remove:", removed?.name, "size:", rateQueue.length);
  }
}

// ========== DBヘルパー ==========

// id でユーザー取得
function getUserById(id) {
  if (!id) return null;
  try {
    const stmt = db.prepare(
      `
      SELECT id, username, display_name, rating, internal_rating
      FROM users
      WHERE id = ?
    `
    );
    const row = stmt.get(id);
    return row || null;
  } catch (e) {
    log("getUserById error:", e);
    return null;
  }
}

// ★ マッチ用：username か display_name でユーザー取得（フォールバック用）
function getUserForMatch(name) {
  if (!name) return null;
  try {
    const stmt = db.prepare(
      `
      SELECT id, username, display_name, rating, internal_rating
      FROM users
      WHERE username = ? OR display_name = ?
      LIMIT 1
    `
    );
    const row = stmt.get(name, name);
    return row || null;
  } catch (e) {
    log("getUserForMatch error:", e);
    return null;
  }
}

// ★ user_id からマイチーム取得
function getUserTeamByUserId(userId) {
  if (!userId) return [];
  try {
    const stmt = db.prepare(`
      SELECT
        ut.slot,
        ut.character_id,
        uc.stars,
        c.char_no,
        c.name,
        c.base_rarity,
        c.image_url
      FROM user_teams ut
      JOIN user_characters uc
        ON uc.user_id = ut.user_id AND uc.character_id = ut.character_id
      LEFT JOIN characters c
        ON c.id = ut.character_id
      WHERE ut.user_id = ?
      ORDER BY ut.slot ASC
    `);

    const rows = stmt.all(userId);

    return rows.map((row) => ({
      slot: row.slot,
      character_id: row.character_id,
      star: row.stars ?? 1,
      name: row.name || `キャラID:${row.character_id}`,
      rarity: row.base_rarity ?? 1,
      char_no: row.char_no ?? row.character_id,
      image_url: row.image_url || null,
    }));
  } catch (e) {
    log("getUserTeamByUserId error:", e);
    return [];
  }
}

// ========== レートマッチング ==========

function tryRateMatch() {
  log("tryRateMatch, queue size:", rateQueue.length);
  if (rateQueue.length < 2) return;

  const first = rateQueue.shift();
  if (rateQueue.length === 0) {
    rateQueue.unshift(first);
    log("only one in queue, back:", first.name);
    return;
  }

  if (rateQueue.length === 1) {
    const second = rateQueue.shift();
    makeRoomAndNotify(first, second);
    return;
  }

  // 3人以上 → レートが一番近い相手を探す
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < rateQueue.length; i++) {
    const cand = rateQueue[i];
    const diff = Math.abs((cand.rating ?? 1500) - (first.rating ?? 1500));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  const second = rateQueue.splice(bestIndex, 1)[0];
  makeRoomAndNotify(first, second);
}

function makeRoomAndNotify(a, b) {
  const roomId =
    "r-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);

  // ★ まず userId 優先でユーザー取得 → なければ名前でフォールバック
  const userA = a.userId ? getUserById(a.userId) : getUserForMatch(a.name);
  const userB = b.userId ? getUserById(b.userId) : getUserForMatch(b.name);

  // A側ユーザー情報
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
  const titleA = getRankName(ratingForTitleA);
  const displayNameA =
    userA?.display_name || userA?.username || a.name || "プレイヤーA";

  // B側ユーザー情報
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
  const titleB = getRankName(ratingForTitleB);
  const displayNameB =
    userB?.display_name || userB?.username || b.name || "プレイヤーB";

  // ★ マイチーム（最大5体）
  const teamA = userA?.id ? getUserTeamByUserId(userA.id) : [];
  const teamB = userB?.id ? getUserTeamByUserId(userB.id) : [];

  log(
    "rate match:",
    `${displayNameA}(${displayRatingA}) vs ${displayNameB}(${displayRatingB}) -> room ${roomId}`
  );
  log(
    "rate match titles:",
    `${displayNameA}: ${titleA} / ${ratingForTitleA},`,
    `${displayNameB}: ${titleB} / ${ratingForTitleB}`
  );
  log("teamA:", teamA);
  log("teamB:", teamB);

  // A に送る：相手は B
  io.to(a.socketId).emit("rate:matched", {
    roomId,

    // 旧フィールド（後方互換）
    opponentName: displayNameB,
    opponentDisplayName: displayNameB,
    opponentDisplayRating: displayRatingB,
    opponentInternalRating: ratingForTitleB,
    opponentTitle: titleB,

    // 自分側
    selfUserId: userA?.id ?? null,
    selfDisplayName: displayNameA,
    selfDisplayRating: displayRatingA,
    selfInternalRating: ratingForTitleA,
    selfTitle: titleA,
    selfTeam: teamA,

    // 相手マイチーム
    opponentUserId: userB?.id ?? null,
    opponentTeam: teamB,
  });

  // B に送る：相手は A
  io.to(b.socketId).emit("rate:matched", {
    roomId,

    opponentName: displayNameA,
    opponentDisplayName: displayNameA,
    opponentDisplayRating: displayRatingA,
    opponentInternalRating: ratingForTitleA,
    opponentTitle: titleA,

    selfUserId: userB?.id ?? null,
    selfDisplayName: displayNameB,
    selfDisplayRating: displayRatingB,
    selfInternalRating: ratingForTitleB,
    selfTitle: titleB,
    selfTeam: teamB,

    opponentUserId: userA?.id ?? null,
    opponentTeam: teamA,
  });
}

// ========== レート計算周り ==========

// outcome: 'win' | 'lose' | 'draw'
function eloChange(ratingSelf, ratingOpp, outcome, kFactor) {
  const K = kFactor ?? 32;
  const expected = 1 / (1 + Math.pow(10, (ratingOpp - ratingSelf) / 400));
  let score = 0.5;
  if (outcome === "win") score = 1;
  else if (outcome === "lose") score = 0;
  const delta = K * (score - expected);
  return delta;
}

// ───────── ユーザー取得ヘルパー ─────────
function getUserFromPlayer(player) {
  const baseSelect =
    "SELECT id, username, rating, internal_rating, matches_played, wins, losses, current_streak, best_streak FROM users";

  let user = null;

  // ① userId があれば id で探す
  if (player.userId != null) {
    const stmtById = db.prepare(baseSelect + " WHERE id = ?");
    user = stmtById.get(player.userId);
    if (user) {
      log("getUserFromPlayer: found by id", player.userId, "->", user.username);
      return user;
    }
    log("getUserFromPlayer: not found by id", player.userId);
  }

  // ② なければ / 見つからなければ、username(=player.name) で探す
  if (player.name) {
    const stmtByName = db.prepare(baseSelect + " WHERE username = ?");
    user = stmtByName.get(player.name);
    if (user) {
      log(
        "getUserFromPlayer: found by username",
        player.name,
        "-> id",
        user.id
      );
      return user;
    }
    log("getUserFromPlayer: not found by username", player.name);
  }

  return null;
}

// 通常終了（切断以外）のレート更新：点差ボーナス + 連勝ボーナス + 勝利ベリー
function updateRatingsNormalFinish(p0, p1) {
  log("updateRatingsNormalFinish called:", {
    p0UserId: p0.userId,
    p1UserId: p1.userId,
    p0Name: p0.name,
    p1Name: p1.name,
    p0Score: p0.score,
    p1Score: p1.score,
  });

  const user0 = getUserFromPlayer(p0);
  const user1 = getUserFromPlayer(p1);

  if (!user0 || !user1) {
    log(
      "skip rating update: user not found",
      "p0 userId/name:",
      p0.userId,
      p0.name,
      "p1 userId/name:",
      p1.userId,
      p1.name
    );
    return;
  }

  // 勝敗判定（クライアントと同じロジック）
  const decideOutcome = (self, opp) => {
    if (self.score > opp.score) return "win";
    if (self.score < opp.score) return "lose";
    if (self.totalTimeMs < opp.totalTimeMs) return "win";
    if (self.totalTimeMs > opp.totalTimeMs) return "lose";
    return "draw";
  };

  const outcome0 = decideOutcome(p0, p1);
  const outcome1 = decideOutcome(p1, p0);

  const r0 = user0.internal_rating ?? user0.rating ?? 1500;
  const r1 = user1.internal_rating ?? user1.rating ?? 1500;

  let delta0 = eloChange(r0, r1, outcome0);
  let delta1 = eloChange(r1, r0, outcome1);

  // 点差ボーナス：最大10点 → 最大2倍
  const diff = Math.min(10, Math.abs(p0.score - p1.score));
  const pointFactor = 1 + diff / 10;
  delta0 *= pointFactor;
  delta1 *= pointFactor;

  // 勝敗数 & 連勝
  let newStreak0 = user0.current_streak ?? 0;
  let newStreak1 = user1.current_streak ?? 0;
  let wins0 = user0.wins ?? 0;
  let wins1 = user1.wins ?? 0;
  let losses0 = user0.losses ?? 0;
  let losses1 = user1.losses ?? 0;

  if (outcome0 === "win") {
    newStreak0 = (user0.current_streak ?? 0) + 1;
    newStreak1 = 0;
    wins0 += 1;
    losses1 += 1;
  } else if (outcome0 === "lose") {
    newStreak0 = 0;
    newStreak1 = (user1.current_streak ?? 0) + 1;
    wins1 += 1;
    losses0 += 1;
  } else {
    // 引き分け → 連勝リセット
    newStreak0 = 0;
    newStreak1 = 0;
  }

  // 連勝ボーナス（勝者のみ、最大+10）
  if (outcome0 === "win") {
    delta0 += Math.min(newStreak0, 10);
  }
  if (outcome1 === "win") {
    delta1 += Math.min(newStreak1, 10);
  }

  const newInternal0 = r0 + delta0;
  const newInternal1 = r1 + delta1;
  const newRating0 = Math.round(newInternal0);
  const newRating1 = Math.round(newInternal1);

  const newBestStreak0 = Math.max(user0.best_streak ?? 0, newStreak0);
  const newBestStreak1 = Math.max(user1.best_streak ?? 0, newStreak1);

  const matches0 = (user0.matches_played ?? 0) + 1;
  const matches1 = (user1.matches_played ?? 0) + 1;

  const updateStmt = db.prepare(
    "UPDATE users SET rating = ?, internal_rating = ?, matches_played = ?, wins = ?, losses = ?, current_streak = ?, best_streak = ? WHERE id = ?"
  );

  updateStmt.run(
    newRating0,
    newInternal0,
    matches0,
    wins0,
    losses0,
    newStreak0,
    newBestStreak0,
    user0.id
  );
  updateStmt.run(
    newRating1,
    newInternal1,
    matches1,
    wins1,
    losses1,
    newStreak1,
    newBestStreak1,
    user1.id
  );

  log(
    "rating updated (normal):",
    user0.username,
    `${r0} -> ${newRating0}`,
    "|",
    user1.username,
    `${r1} -> ${newRating1}`
  );

  // ★★★ ここでレート戦勝利ベリー付与 ★★★
  try {
    if (outcome0 === "win") {
      addBerriesByUserId(user0.id, 300, "レート戦勝利報酬");
      log("berries: +300 to", user0.username, "(normal finish)");
    } else if (outcome1 === "win") {
      addBerriesByUserId(user1.id, 300, "レート戦勝利報酬");
      log("berries: +300 to", user1.username, "(normal finish)");
    } else {
      log("no berries (draw match)");
    }
  } catch (e) {
    log("addBerriesByUserId error (normal):", e);
  }
}

// 切断による敗北：点差ボーナスなし、連勝ボーナスあり + 勝利ベリー
function updateRatingsDisconnectFinish(winner, loser) {
  log("updateRatingsDisconnectFinish called:", {
    winnerUserId: winner.userId,
    loserUserId: loser.userId,
    winnerName: winner.name,
    loserName: loser.name,
  });

  const userW = getUserFromPlayer(winner);
  const userL = getUserFromPlayer(loser);

  if (!userW || !userL) {
    log(
      "skip rating update (disconnect): user not found",
      "winner userId/name:",
      winner.userId,
      winner.name,
      "loser userId/name:",
      loser.userId,
      loser.name
    );
    return;
  }

  const rW = userW.internal_rating ?? userW.rating ?? 1500;
  const rL = userL.internal_rating ?? userL.rating ?? 1500;

  let deltaW = eloChange(rW, rL, "win");
  let deltaL = eloChange(rL, rW, "lose");

  const newStreakW = (userW.current_streak ?? 0) + 1;
  const newStreakL = 0;
  const winsW = (userW.wins ?? 0) + 1;
  const winsL = userL.wins ?? 0;
  const lossesW = userW.losses ?? 0;
  const lossesL = (userL.losses ?? 0) + 1;

  // 連勝ボーナス（勝者のみ）
  deltaW += Math.min(newStreakW, 10);

  const newInternalW = rW + deltaW;
  const newInternalL = rL + deltaL;
  const newRatingW = Math.round(newInternalW);
  const newRatingL = Math.round(newInternalL);

  const newBestStreakW = Math.max(userW.best_streak ?? 0, newStreakW);
  const newBestStreakL = Math.max(userL.best_streak ?? 0, newStreakL);

  const matchesW = (userW.matches_played ?? 0) + 1;
  const matchesL = (userL.matches_played ?? 0) + 1;

  const updateStmt = db.prepare(
    "UPDATE users SET rating = ?, internal_rating = ?, matches_played = ?, wins = ?, losses = ?, current_streak = ?, best_streak = ? WHERE id = ?"
  );

  updateStmt.run(
    newRatingW,
    newInternalW,
    matchesW,
    winsW,
    lossesW,
    newStreakW,
    newBestStreakW,
    userW.id
  );
  updateStmt.run(
    newRatingL,
    newInternalL,
    matchesL,
    winsL,
    lossesL,
    newStreakL,
    newBestStreakL,
    userL.id
  );

  log(
    "rating updated (disconnect):",
    userW.username,
    `${rW} -> ${newRatingW}`,
    "|",
    userL.username,
    `${rL} -> ${newRatingL}`
  );

  // ★★★ 切断勝利でも 300 ベリー付与 ★★★
  try {
    addBerriesByUserId(userW.id, 300, "レート戦勝利報酬(切断)");
    log("berries: +300 to", userW.username, "(disconnect win)");
  } catch (e) {
    log("addBerriesByUserId error (disconnect):", e);
  }
}

// ========== ソケットイベント ==========

io.on("connection", (socket) => {
  // ★ 接続数カウントアップ
  onlineCount += 1;
  log("socket connected:", socket.id, "onlineCount:", onlineCount);

  // ----- レートマッチ -----

  socket.on("rate:join-queue", ({ name, rating, userId }) => {
    const safeName = name || "プレイヤー";
    const safeRating = typeof rating === "number" ? rating : 1500;
    const safeUserId = typeof userId === "number" ? userId : null;

    removeFromRateQueue(socket.id);

    rateQueue.push({
      socketId: socket.id,
      name: safeName,
      rating: safeRating,
      userId: safeUserId,
      joinedAt: Date.now(),
    });

    log(
      "rate:join-queue:",
      safeName,
      `rating=${safeRating}`,
      "userId=",
      safeUserId,
      "queueSize=",
      rateQueue.length
    );

    socket.emit("rate:queue-updated", {
      size: rateQueue.length,
    });

    tryRateMatch();
  });

  socket.on("rate:leave-queue", () => {
    log("rate:leave-queue:", socket.id);
    removeFromRateQueue(socket.id);
    socket.emit("rate:queue-updated", {
      size: rateQueue.length,
    });
  });

  // ----- バトル -----

  socket.on("battle:join", ({ roomId, playerName, userId }) => {
    if (!roomId) return;
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        players: new Map(),
        answers: new Map(),
        maxQuestions: 30,
        isFinished: false,
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);
      log("room created:", roomId);
    }

    const name = playerName || "プレイヤー";

    log("battle:join payload:", {
      roomId,
      playerName: name,
      userId,
    });

    room.players.set(socket.id, {
      socketId: socket.id,
      name,
      score: 0,
      totalTimeMs: 0,
      userId: userId ?? null,
    });

    socket.join(roomId);
    log("battle:join:", name, "-> room", roomId);

    const playersArr = Array.from(room.players.values());

    if (playersArr.length === 2 && !room.isFinished) {
      const [p0, p1] = playersArr;
      log("battle:start room:", roomId, "players:", p0.name, p1.name);

      io.to(p0.socketId).emit("battle:start", {
        roomId,
        opponentName: p1.name,
        currentQuestionIndex: 0,
      });
      io.to(p1.socketId).emit("battle:start", {
        roomId,
        opponentName: p0.name,
        currentQuestionIndex: 0,
      });
    }
  });

  socket.on("battle:answer", ({ roomId, questionIndex, isCorrect, timeMs }) => {
    const room = rooms.get(roomId);
    if (!room || room.isFinished) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const idx = typeof questionIndex === "number" ? questionIndex : 0;
    const used = typeof timeMs === "number" ? timeMs : 0;

    if (isCorrect) player.score += 1;
    player.totalTimeMs += used;

    log(
      "battle:answer",
      "room:",
      roomId,
      "q:",
      idx,
      "player:",
      player.name,
      "isCorrect:",
      !!isCorrect,
      "timeMs:",
      used,
      "score:",
      player.score
    );

    let ansMap = room.answers.get(idx);
    if (!ansMap) {
      ansMap = new Map();
      room.answers.set(idx, ansMap);
    }
    ansMap.set(socket.id, { isCorrect: !!isCorrect, timeMs: used });

    const playersArr = Array.from(room.players.values());

    // まだ片方しか回答していなければここで終了（相手待ち）
    if (ansMap.size < playersArr.length) {
      log("battle:answer waiting other player, room:", roomId, "q:", idx);
      return;
    }

    const nextIndex = idx + 1;
    const maxQuestions = room.maxQuestions;
    const [p0, p1] = playersArr;

    let finished = false;
    if (p0.score >= 10 || p1.score >= 10) finished = true;
    if (nextIndex >= maxQuestions) finished = true;

    if (finished) {
      room.isFinished = true;
      log("battle:finished room:", roomId);

      // ★ 通常終了 → レート更新 + ベリー付与
      updateRatingsNormalFinish(p0, p1);

      const makePayloadFor = (self, opp) => {
        let outcome = "draw";
        if (self.score > opp.score) outcome = "win";
        if (self.score < opp.score) outcome = "lose";
        else {
          if (self.totalTimeMs < opp.totalTimeMs) outcome = "win";
          else if (self.totalTimeMs > opp.totalTimeMs) outcome = "lose";
        }
        return {
          outcome,
          self: {
            score: self.score,
            totalTimeMs: self.totalTimeMs,
          },
          opponent: {
            score: opp.score,
            totalTimeMs: opp.totalTimeMs,
          },
        };
      };

      io.to(p0.socketId).emit("battle:finished", makePayloadFor(p0, p1));
      io.to(p1.socketId).emit("battle:finished", makePayloadFor(p1, p0));

      rooms.delete(roomId);
    } else {
      const scoresPayload = playersArr.map((p) => ({
        socketId: p.socketId,
        name: p.name,
        score: p.score,
        totalTimeMs: p.totalTimeMs,
      }));

      log("battle:next (wait 2s) room:", roomId, "nextIndex:", nextIndex);

      setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || currentRoom.isFinished) return;

        const currentPlayers = Array.from(currentRoom.players.values());
        currentPlayers.forEach((p) => {
          io.to(p.socketId).emit("battle:next", {
            roomId,
            nextQuestionIndex: nextIndex,
            scores: scoresPayload,
          });
        });
      }, 2000);
    }
  });

  socket.on("disconnect", () => {
    // ★ 接続数カウントダウン
    onlineCount = Math.max(0, onlineCount - 1);
    log("socket disconnected:", socket.id, "onlineCount:", onlineCount);

    removeFromRateQueue(socket.id);

    for (const [roomId, room] of rooms) {
      if (room.players.has(socket.id)) {
        const leaver = room.players.get(socket.id);
        room.players.delete(socket.id);
        log("player removed from room:", roomId);

        const remaining = Array.from(room.players.values());

        if (!room.isFinished && remaining.length === 1) {
          // ★ 切断による敗北
          const winner = remaining[0];
          log(
            "battle:disconnect -> winner:",
            winner.name,
            "loser:",
            leaver.name,
            "room:",
            roomId
          );

          room.isFinished = true;

          // レート更新（切断負け：点差ボーナスなし）+ ベリー付与
          updateRatingsDisconnectFinish(winner, leaver);

          // 勝者にだけ結果を返す
          io.to(winner.socketId).emit("battle:finished", {
            outcome: "win",
            self: {
              score: winner.score,
              totalTimeMs: winner.totalTimeMs,
            },
            opponent: {
              score: leaver.score ?? 0,
              totalTimeMs: leaver.totalTimeMs ?? 0,
            },
          });

          rooms.delete(roomId);
        } else if (room.players.size === 0) {
          rooms.delete(roomId);
          log("room deleted:", roomId);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  log(`Socket.IO server listening on http://localhost:${PORT}`);
});
