// file: tcgMode.js
// ONE PIECE TCG（仮）のオンライン対戦サーバー処理
// server.js から setupTcgMode(io) を呼ぶ
import {
  CARD_DEFS,
  ACTIVE_CARDS,
  MUGICHA_GENRES,
  COST_FIRST,
  COST_SECOND,
  INITIAL_LIFE,
  LIFE_HP,
  INITIAL_HAND,
  BOARD_SIZE,
  QUIZ_MS,
  STANDARD_DECK,
  WORLD_CARD_POOL,
  normalizeDeck,
} from './lib/tcgCards.js';
import { makeQuestion, ALL_GENRES } from './lib/tcgQuestions.js';

const games = new Map();
let IO = null;

class GameError extends Error {}

const fail = (msg) => {
  throw new GameError(msg);
};

const rnd = (n) => Math.floor(Math.random() * n);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function askDiscard(game, owner, title, cb, drawAfter = 2) {
  const P = game.players[owner];
  if (!P.hand.length) {
    addLog(game, `${game.seats[owner].name} は手札がなく、捨てるカードを選べなかった。`);
    cb(false);
    return;
  }
  const pending = {
    kind: 'discard',
    owner,
    title,
    options: P.hand.map(({ id, defId }) => ({ id, defId, name: CARD_DEFS[defId].name })),
    deadline: Date.now() + QUIZ_MS,
    drawAfter,
    cb,
  };
  game.pending = pending;
  armTimer(game, pending, () => {
    game.pending = null;
    addLog(game, `${game.seats[owner].name} はカードを捨てなかった。`);
    cb(false);
  });
}

function resolveDiscard(game, pending, cardId) {
  const player = game.players[pending.owner];
  const card = player.hand.find((c) => c.id === cardId);
  if (!card || !pending.options.some((option) => option.id === cardId)) fail('そのカードは捨てられません。');
  clearTimeout(game.timer);
  game.pending = null;
  player.hand = player.hand.filter((c) => c.id !== cardId);
  player.trash.push({ id: card.id, defId: card.defId });
  addLog(game, `${game.seats[pending.owner].name} は ${CARD_DEFS[card.defId].name} を捨てた。`);
  if (pending.drawAfter > 0) {
    const drawn = draw(game, pending.owner, pending.drawAfter);
    addLog(game, `${game.seats[pending.owner].name} はカードを${drawn}枚引いた。`);
  }
  pending.cb(true);
}

// ===== ゲーム生成 =====
function createGame(roomId) {
  return {
    roomId,
    seats: [null, null],
    players: [],
    phase: 'waiting', // waiting | playing | finished
    current: 0,
    first: 0,
    pending: null,
    combat: null,
    timer: null,
    log: [],
    seq: 0,
    winner: null,
    flash: null,
    flashSeq: 0,
    cleanup: null,
  };
}

function modifyTempPower(game, owner, c, amount) {
  c.temp += amount;
  addLog(game, `${CARD_DEFS[c.defId].name} のパワーが${amount > 0 ? '+' : ''}${amount}（現在 ${currentPower(c)}）。`);
  if (currentPower(c) <= 0) destroy(game, owner, c);
}

function newId(game) {
  game.seq += 1;
  return game.seq;
}

function addLog(game, text) {
  game.log.push(text);
  if (game.log.length > 60) game.log.shift();
}

function createPlayerState(game, deckSpec) {
  const cards = [];
  for (const [defId, n] of Object.entries(deckSpec || STANDARD_DECK)) {
    for (let i = 0; i < n; i++) cards.push({ id: newId(game), defId });
  }
  const deck = shuffle(cards);
  return {
    life: INITIAL_LIFE,
    lifeHp: LIFE_HP,
    deck: deck.slice(INITIAL_HAND),
    hand: deck.slice(0, INITIAL_HAND),
    board: [],
    trash: [],
    powerMods: [],
    turns: 0,
    cost: 0,
  };
}

function startGame(game) {
  game.players = game.seats.map((s) => createPlayerState(game, s.deck));
  game.first = rnd(2);
  game.phase = 'playing';
  game.winner = null;
  addLog(game, `対戦開始！ 先攻は ${game.seats[game.first].name} です。`);
  startTurn(game, game.first);
}

// ===== 基本操作 =====
const power = (c) =>
  CARD_DEFS[c.defId].power + c.bonus + c.turnTemp + c.temp
  - (c.powerMods || []).reduce((total, mod) => total + mod.amount, 0)
  + (c.powerBuffs || []).reduce((total, buff) => total + buff.amount, 0);

const currentPower = power;

function applyPowerDebuff(game, sourceOwner, sourceId, targetId, amount, expires = null) {
  const found = findChar(game, targetId);
  if (!found) return;
  found.c.powerMods.push({
    amount,
    sourceOwner,
    sourceId,
    expiresOwner: expires?.owner ?? null,
    expiresTurn: expires?.turn ?? null,
  });
  addLog(
    game,
    `${CARD_DEFS[found.c.defId].name} のパワーが${amount}下がった（現在 ${currentPower(found.c)}）。`
  );
  if (currentPower(found.c) <= 0) destroy(game, found.pi, found.c);
}

function applyPowerBuff(game, sourceOwner, sourceId, targetId, amount, expires) {
  const found = findChar(game, targetId);
  if (!found) return;
  found.c.powerBuffs.push({
    amount,
    sourceOwner,
    sourceId,
    expiresOwner: expires.owner,
    expiresTurn: expires.turn,
  });
  addLog(game, `${CARD_DEFS[found.c.defId].name} のパワーが${amount}上がった（現在 ${currentPower(found.c)}）。`);
}

function recoverRested(game, owner, predicate = () => true) {
  const targets = game.players[owner].board.filter((c) => c.rested && predicate(c));
  for (const c of targets) c.rested = false;
  if (targets.length) addLog(game, `${targets.map((c) => CARD_DEFS[c.defId].name).join('、')} が回復した。`);
}

function chooseRestedAlly(game, owner, defId, title, cb = () => {}) {
  const options = game.players[owner].board
    .filter((c) => c.rested && c.defId === defId)
    .map((c) => c.id);
  askChoose(game, owner, title, options, (id) => {
    const target = id && findChar(game, id);
    if (target) {
      target.c.rested = false;
      addLog(game, `${CARD_DEFS[target.c.defId].name} が回復した。`);
    }
    cb();
  });
}

function findChar(game, id) {
  for (let pi = 0; pi < 2; pi++) {
    const c = game.players[pi].board.find((x) => x.id === id);
    if (c) return { pi, c };
  }
  return null;
}

function newChar(card, slot, P) {
  return {
    id: card.id,
    defId: card.defId,
    slot,
    rested: false,
    bonus: 0,
    temp: 0,
    turnTemp: 0,
    powerMods: [],
    powerBuffs: [],
    haste: false,
    summonedOn: P.turns,
    abilityUsed: false,
    genresUsed: [],
  };
}

function placeFromHand(game, pi, defId) {
  const P = game.players[pi];
  const card = P.hand.find((c) => c.defId === defId);
  if (!card) return;
  const slot = [0, 1, 2, 3, 4].find((s) => !P.board.some((c) => c.slot === s));
  if (slot === undefined) {
    addLog(game, `場が埋まっているため ${CARD_DEFS[defId].name} を出せなかった。`);
    return;
  }
  P.hand = P.hand.filter((c) => c.id !== card.id);
  P.board.push(newChar(card, slot, P));
  addLog(game, `${game.seats[pi].name} は手札の ${CARD_DEFS[defId].name} を場に出した。`);
}

function bounce(game, found) {
  const { pi, c } = found;
  const P = game.players[pi];
  P.board = P.board.filter((x) => x.id !== c.id);
  P.hand.push({ id: c.id, defId: c.defId });
  addLog(game, `${CARD_DEFS[c.defId].name} が手札に戻った。`);
}

function healLife(game, pi, n) {
  const P = game.players[pi];
  P.lifeHp = Math.min(LIFE_HP, P.lifeHp + n);
  addLog(game, `${game.seats[pi].name} のライフ耐久力が${n}回復した（${P.lifeHp}/${LIFE_HP}）。`);
}

function gainCost(game, pi, n) {
  const P = game.players[pi];
  P.cost = Math.min(P.maxCost, P.cost + n);
  addLog(game, `${game.seats[pi].name} のコストが回復した（${P.cost}/${P.maxCost}）。`);
}

function hasOnBoard(game, pi, ...defIds) {
  return game.players[pi].board.some((c) => defIds.includes(c.defId));
}

function chooseOpp(game, owner, title, filter, cb) {
  const options = game.players[1 - owner].board.filter(filter).map((x) => x.id);
  askChoose(game, owner, title, options, (id) => cb(id ? findChar(game, id) : null));
}

function checkWorldWin(game, pi) {
  const kinds = new Set(
    game.players[pi].trash.map((t) => t.defId).filter((id) => WORLD_CARD_POOL.includes(id))
  );
  if (kinds.size >= 20) {
    finishGame(game, pi, `トラッシュに世界の王達が${kinds.size}種類`);
  } else {
    addLog(game, `トラッシュの世界の王達は${kinds.size}種類（20種類で勝利）。`);
  }
}

// お互いのキャラ1体ずつ（片方のみも可）を相手ターン終了時までパワー-1
function pairDebuff(game, pi, source, rounds) {
  if (rounds <= 0 || game.phase !== 'playing') return;
  const opp = 1 - pi;
  const expires = { owner: opp, turn: game.players[opp].turns + 1 };
  const mine = game.players[pi].board.map((x) => x.id);
  askChoose(game, pi, 'パワー-1にする味方キャラを選んでください（スキップ可）', mine, (myId) => {
    if (myId) applyPowerDebuff(game, pi, source.id, myId, 1, expires);
    const theirs = game.players[opp].board.map((x) => x.id);
    askChoose(game, pi, 'パワー-1にする相手キャラを選んでください（スキップ可）', theirs, (oppId) => {
      if (oppId) applyPowerDebuff(game, pi, source.id, oppId, 1, expires);
      pairDebuff(game, pi, source, rounds - 1);
    });
  });
}

function draw(game, pi, n) {
  const P = game.players[pi];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (!P.deck.length) break;
    P.hand.push(P.deck.shift());
    drawn += 1;
  }
  return drawn;
}

function startTurn(game, pi) {
  const P = game.players[pi];
  P.turns += 1;
  const schedule = pi === game.first ? COST_FIRST : COST_SECOND;
  P.maxCost = schedule[Math.min(P.turns - 1, schedule.length - 1)];
  P.cost = P.maxCost;
  for (const c of P.board) {
    if (c.noRecover) c.noRecover = false;
    else c.rested = false;
    c.abilityUsed = false;
  }
  game.current = pi;

  // 先攻の最初のターンは山札から引かない
  const skipDraw = pi === game.first && P.turns === 1;
  if (!skipDraw) draw(game, pi, 1);

  addLog(game, `${game.seats[pi].name} のターン（コスト ${P.maxCost}）${skipDraw ? '※先攻は最初のターンはドローなし' : ''}`);
}

function destroy(game, pi, c) {
  const turnNo = game.players[0].turns + game.players[1].turns;
  if (c.indestructibleThroughTurn >= turnNo) {
    addLog(game, `${CARD_DEFS[c.defId].name} はこのターン破壊されない。`);
    return false;
  }
  const P = game.players[pi];
  P.board = P.board.filter((x) => x.id !== c.id);
  P.trash.push({ id: c.id, defId: c.defId });
  addLog(game, `${CARD_DEFS[c.defId].name} が破壊された。`);
  return true;
}

function checkWin(game) {
  if (game.phase !== 'playing') return true;
  for (let pi = 0; pi < 2; pi++) {
    if (game.players[pi].life <= 0) {
      finishGame(game, 1 - pi, 'ライフが0になった');
      return true;
    }
  }
  return false;
}

function finishGame(game, winner, reason) {
  game.phase = 'finished';
  game.winner = winner;
  game.pending = null;
  game.combat = null;
  clearTimeout(game.timer);
  addLog(game, `${game.seats[winner].name} の勝利！（${reason}）`);
}

// ===== クイズ =====
function armTimer(game, pending, onTimeout) {
  clearTimeout(game.timer);
  game.timer = setTimeout(() => {
    if (game.pending !== pending) return;
    try {
      onTimeout();
    } catch (e) {
      console.error('[tcg] timeout error', e);
    }
    settle(game);
  }, (pending.ms || QUIZ_MS) + 1500);
}

function quizMs(game, owner) {
  const until = game.players[owner].shortUntil;
  return until && game.players[owner].turns <= until ? 20000 : QUIZ_MS;
}

function ask(game, owner, genres, title, cb, step = null) {
  let q = null;
  for (const g of shuffle(genres)) {
    q = makeQuestion(g);
    if (q) break;
  }
  if (!q) {
    addLog(game, '出題できる問題がありませんでした（データ不足）。');
    cb(false);
    return;
  }
  const ms = quizMs(game, owner);
  const pending = {
    kind: 'quiz',
    owner,
    title,
    genre: q.label,
    lines: q.lines,
    ms,
    deadline: Date.now() + ms,
    q,
    cb,
    step,
  };
  game.pending = pending;
  armTimer(game, pending, () => resolveQuiz(game, pending, '', true));
}

function askSeq(game, owner, specs, title, done) {
  const results = [];
  const next = (i) => {
    if (i >= specs.length) {
      done(results);
      return;
    }
    ask(
      game,
      owner,
      specs[i],
      title,
      (ok) => {
        results.push(ok);
        next(i + 1);
      },
      specs.length > 1 ? `${i + 1}/${specs.length}` : null
    );
  };
  next(0);
}

function resolveQuiz(game, pending, text, timeout) {
  const ok = !timeout && pending.q.check(text);
  game.pending = null;
  clearTimeout(game.timer);
  game.flashSeq += 1;
  game.flash = {
    seq: game.flashSeq,
    owner: pending.owner,
    ok,
    timeout: !!timeout,
    genre: pending.genre,
    reveal: pending.q.reveal,
  };
  addLog(
    game,
    `【${pending.genre}】${game.seats[pending.owner].name}：${timeout ? '時間切れ' : ok ? '正解！' : '不正解'}` +
      `（回答：${timeout ? 'なし' : String(text ?? '').trim().slice(0, 40) || 'なし'} ／ 答え：${pending.q.reveal}）`
  );
  pending.cb(ok);
}

function askChoose(game, owner, title, options, cb) {
  if (!options.length) {
    cb(null);
    return;
  }
  const pending = { kind: 'choose', owner, title, options, deadline: Date.now() + QUIZ_MS, cb };
  game.pending = pending;
  armTimer(game, pending, () => {
    game.pending = null;
    cb(null);
  });
}

function loseLife(game, target, n, done = () => {}) {
  const P = game.players[target];
  P.life = Math.max(0, P.life - n);
  P.lifeHp = LIFE_HP;
  addLog(game, `${game.seats[target].name} のライフが${n}減った！（残り${P.life}）`);
  if (checkWin(game)) {
    done();
    return;
  }
  ask(game, target, ALL_GENRES, 'ライフ減少ボーナス：正解でカードを2枚引く', (ok) => {
    if (ok) {
      const n2 = draw(game, target, 2);
      addLog(game, `${game.seats[target].name} はカードを${n2}枚引いた。`);
    }
    done();
  });
}

// ライフ1つにつき耐久力 LIFE_HP。1回の攻撃で減るライフは最大1で、余剰ダメージは次のライフに持ち越さない
function damageLife(game, target, dmg, done = () => {}) {
  const P = game.players[target];
  P.lifeHp -= dmg;
  if (P.lifeHp > 0) {
    addLog(game, `${game.seats[target].name} のライフに${dmg}ダメージ！（耐久力 残り${P.lifeHp}/${LIFE_HP}）`);
    done();
    return;
  }
  loseLife(game, target, 1, done);
}

// ===== 戦闘 =====
function resolveBattle(game, att, attOwner, def, defOwner, noKill = false) {
  if (!findChar(game, att.id) || !findChar(game, def.id)) {
    game.combat = null;
    return;
  }
  const a = currentPower(att);
  const d = currentPower(def);
  const an = CARD_DEFS[att.defId].name;
  const dn = CARD_DEFS[def.defId].name;
  addLog(game, `バトル：${an}(${a}) VS ${dn}(${d})`);

  if (a > d) {
    destroy(game, defOwner, def);
  } else if (a < d) {
    if (!noKill) destroy(game, attOwner, att);
    else addLog(game, `${dn} は相手を破壊できない。`);
  } else {
    destroy(game, defOwner, def);
    if (!noKill) destroy(game, attOwner, att);
  }
  att.temp = 0;
  def.temp = 0;
  game.combat = null;
}

function resolveDirect(game, att, attOwner) {
  game.combat = null;
  const dmg = power(att);
  att.temp = 0;
  damageLife(game, 1 - attOwner, dmg);
}

function afterAttackTriggers(game) {
  const cb = game.combat;
  if (!cb) return;
  const found = findChar(game, cb.attId);
  if (!found) {
    game.combat = null;
    return;
  }
  const att = found.c;
  const attOwner = found.pi;
  const defOwner = 1 - attOwner;

  if (cb.target === 'player') {
    const blockers = cb.unblockable
      ? []
      : game.players[defOwner].board.filter((c) => CARD_DEFS[c.defId].blocker && !c.rested);
    if (!blockers.length) {
      resolveDirect(game, att, attOwner);
      return;
    }
    const pending = {
      kind: 'block',
      owner: defOwner,
      options: blockers.map((c) => c.id),
      attId: att.id,
      deadline: Date.now() + QUIZ_MS,
    };
    game.pending = pending;
    armTimer(game, pending, () => {
      game.pending = null;
      addLog(game, 'ブロックしなかった。');
      resolveDirect(game, att, attOwner);
    });
    return;
  }

  const hit = findChar(game, cb.target);
  if (!hit) {
    game.combat = null;
    return;
  }
  defendTrigger(game, hit.pi, hit.c, 'defend', (noKill) => {
    resolveBattle(game, att, attOwner, hit.c, hit.pi, noKill);
  });
}

// 防御側（攻撃された／ブロックした）のカード効果
function defendTrigger(game, owner, c, role, cont) {
  switch (c.defId) {
    case 'hack':
      ask(game, owner, ['fish'], 'ハック：正解でパワー+1、不正解でパワー-1', (ok) => {
        modifyTempPower(game, owner, c, ok ? 1 : -1);
        if (!findChar(game, c.id)) {
          game.combat = null;
          return;
        }
        cont(false);
      });
      return;
    case 'morley':
      if (role !== 'block') break;
      askSeq(game, owner, [['hint'], ['hint']], 'モーリー：両方正解でこのターン破壊されない', (res) => {
        if (res.every(Boolean)) {
          c.indestructibleThroughTurn = game.players[0].turns + game.players[1].turns;
          addLog(game, 'モーリーはこのターン破壊されない。');
        }
        cont(false);
      });
      return;
    case 'zori':
      ask(game, owner, ['subBetween'], 'ロロノア・ゾロ：正解でパワー+2', (ok) => {
        if (ok) c.temp += 2;
        cont(false);
      });
      return;
    case 'chappy':
      if (role !== 'block') break;
      ask(game, owner, ['before'], 'トニートニー・チョッパー：正解でパワー+3（相手を破壊できない）', (ok) => {
        if (ok) c.temp += 3;
        cont(ok);
      });
      return;
    case 'riesen':
      if (role !== 'block') break;
      ask(game, owner, ['ship'], 'フランキー：正解でパワー+3', (ok) => {
        if (ok) c.temp += 3;
        cont(false);
      });
      return;
    case 'doflamingo':
      if (role !== 'block') break;
      askSeq(game, owner, [['between'], ['hint']], 'ドフラミンゴ：両方正解で相手キャラをダウン', (res) => {
        if (!res.every(Boolean)) {
          cont(false);
          return;
        }
        const options = game.players[1 - owner].board.map((x) => x.id);
        askChoose(game, owner, 'ダウンさせる相手キャラを選んでください', options, (id) => {
          const target = id && findChar(game, id);
          if (target) {
            target.c.rested = true;
            addLog(game, `${CARD_DEFS[target.c.defId].name} がダウンした。`);
          }
          cont(false);
        });
      });
      return;
    case 'creek':
      if (role !== 'block') break;
      ask(game, owner, ['hobby', 'hate', 'season'], 'クリーク：正解で相手のパワー2以下のキャラを破壊', (ok) => {
        if (!ok) {
          cont(false);
          return;
        }
        const options = game.players[1 - owner].board.filter((x) => currentPower(x) <= 2).map((x) => x.id);
        askChoose(game, owner, '破壊する相手キャラ（パワー2以下）を選んでください', options, (id) => {
          const target = id && findChar(game, id);
          if (target) destroy(game, target.pi, target.c);
          cont(false);
        });
      });
      return;
    case 'neptune':
      if (role !== 'block') break;
      ask(game, owner, ['subKanji', 'subBetween'], 'ネプチューン：正解で相手のコスト3以下のキャラ1体を手札に戻す', (ok) => {
        if (!ok) {
          cont(false);
          return;
        }
        chooseOpp(game, owner, '手札に戻す相手キャラ（コスト3以下）を選んでください', (x) => CARD_DEFS[x.defId].cost <= 3, (t) => {
          if (t) bounce(game, t);
          cont(false);
        });
      });
      return;
    case 'dalton':
      if (role !== 'block') break;
      ask(game, owner, ['food'], 'ドルトン：正解でパワー+2', (ok) => {
        if (ok) c.temp += 2;
        cont(false);
      });
      return;
    case 'katakuri':
      if (role !== 'block') break;
      resolveKatakuriQuestions(game, owner, c, cont);
      return;
    default:
      break;
  }
  cont(false);
}

function attackTriggers(game, attOwner, att, cont) {
  const cb = game.combat;
  switch (att.defId) {
    case 'elizabello':
      askSeq(game, attOwner, [['wazaKanji'], ['hint']], 'エリザベローⅡ世：両方正解で相手キャラ1体を破壊', (res) => {
        if (!res.every(Boolean)) {
          cont();
          return;
        }
        chooseOpp(game, attOwner, '破壊する相手キャラを選んでください', () => true, (t) => {
          if (t) destroy(game, t.pi, t.c);
          cont();
        });
      });
      return;
    case 'sabo':
      ask(game, attOwner, ['wazaKanji'], 'サボ：正解で相手のライフ耐久力に2ダメージ', (ok) => {
        if (!ok) {
          cont();
          return;
        }
        damageLife(game, 1 - attOwner, 2, () => {
          if (game.phase === 'playing') cont();
        });
      });
      return;
    case 'hack':
      ask(game, attOwner, ['fish'], 'ハック：正解でパワー+1、不正解でパワー-1', (ok) => {
        modifyTempPower(game, attOwner, att, ok ? 1 : -1);
        cont();
      });
      return;
    case 'lindbergh':
      askSeq(game, attOwner, [['before'], ['before']], 'リンドバーグ：正解数に応じて相手キャラを破壊', (res) => {
        const correct = res.filter(Boolean).length;
        const maxCost = correct >= 2 ? 4 : correct === 1 ? 2 : 0;
        if (!maxCost) {
          cont();
          return;
        }
        const options = game.players[1 - attOwner].board
          .filter((target) => CARD_DEFS[target.defId].cost <= maxCost)
          .map((target) => target.id);
        askChoose(game, attOwner, `破壊する相手キャラ（コスト${maxCost}以下）を選んでください`, options, (id) => {
          const target = id && findChar(game, id);
          if (target) destroy(game, target.pi, target.c);
          cont();
        });
      });
      return;
    case 'karasu':
      ask(game, attOwner, ['between'], 'カラス：正解で自身のパワー以下の相手キャラを破壊', (ok) => {
        if (!ok) {
          cont();
          return;
        }
        const options = game.players[1 - attOwner].board
          .filter((target) => currentPower(target) <= currentPower(att))
          .map((target) => target.id);
        askChoose(game, attOwner, '破壊する相手キャラを選んでください', options, (id) => {
          const target = id && findChar(game, id);
          if (target) destroy(game, target.pi, target.c);
          cont();
        });
      });
      return;
    case 'gambo':
      ask(game, attOwner, ['before'], 'ギャンボ：正解でリンドバーグを1体回復', (ok) => {
        if (ok) chooseRestedAlly(game, attOwner, 'lindbergh', '回復するリンドバーグを選んでください', cont);
        else cont();
      });
      return;
    case 'jiron':
      ask(game, attOwner, ['between'], 'ジロン：正解でカラスを1体回復', (ok) => {
        if (ok) chooseRestedAlly(game, attOwner, 'karasu', '回復するカラスを選んでください', cont);
        else cont();
      });
      return;
    case 'hanap':
      ask(game, attOwner, ['season', 'hobby', 'hate'], 'ウソップ：正解でパワー+2＆ブロックされない', (ok) => {
        if (ok) {
          att.temp += 2;
          cb.unblockable = true;
        }
        cont();
      });
      return;
    case 'hojiro':
      askSeq(game, attOwner, [['fish'], ['fish']], 'ジンベエ：2問正解でパワー+4', (res) => {
        if (res.every(Boolean)) att.temp += 4;
        cont();
      });
      return;
    case 'zori':
      ask(game, attOwner, ['subBetween'], 'ロロノア・ゾロ：正解でパワー+2', (ok) => {
        if (ok) att.temp += 2;
        cont();
      });
      return;
    case 'mugicha5':
      askSeq(
        game,
        attOwner,
        [['hint'], ['between'], ['wazaKanji']],
        'ルフィ（ギア・フィフス）：正解1問ごとにパワー+1（2問以上間違えると攻撃失敗）',
        (res) => {
          const right = res.filter(Boolean).length;
          if (3 - right >= 2) {
            addLog(game, 'ルフィ（ギア・フィフス）の攻撃は失敗した。');
            att.temp = 0;
            game.combat = null;
            return;
          }
          att.temp += right;
          cont();
        }
      );
      return;
    case 'vivi':
      ask(game, attOwner, ['between'], 'ネフェルタリ・ビビ：正解で相手のパワー3以下のキャラを破壊', (ok) => {
        if (!ok) {
          cont();
          return;
        }
        const options = game.players[1 - attOwner].board.filter((x) => power(x) <= 3).map((x) => x.id);
        askChoose(game, attOwner, '破壊する相手キャラ（パワー3以下）を選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) destroy(game, t.pi, t.c);
          cont();
        });
      });
      return;
    case 'crocodile':
      ask(game, attOwner, ['wazaKanji'], 'クロコダイル：正解で相手キャラ1体のパワー-2', (ok) => {
        if (!ok) {
          cont();
          return;
        }
        const options = game.players[1 - attOwner].board.map((x) => x.id);
        askChoose(game, attOwner, 'パワーを下げる相手キャラを選んでください', options, (id) => {
          if (id) applyPowerDebuff(game, attOwner, att.id, id, 2, { owner: attOwner, turn: game.players[attOwner].turns });
          cont();
        });
      });
      return;
    case 'buggy':
      ask(game, attOwner, ['image'], 'バギー：正解で相手のパワー1以下のキャラを破壊', (ok) => {
        if (!ok) {
          cont();
          return;
        }
        const options = game.players[1 - attOwner].board.filter((x) => currentPower(x) <= 1).map((x) => x.id);
        askChoose(game, attOwner, '破壊する相手キャラ（パワー1以下）を選んでください', options, (id) => {
          const target = id && findChar(game, id);
          if (target) destroy(game, target.pi, target.c);
          cont();
        });
      });
      return;
    case 'foxy':
      ask(game, attOwner, ['subBetween'], 'フォクシー：正解で相手キャラのパワー-1（次の相手ターン終了まで）', (ok) => {
        if (!ok) {
          cont();
          return;
        }
        const options = game.players[1 - attOwner].board.map((x) => x.id);
        askChoose(game, attOwner, 'パワーを下げる相手キャラを選んでください', options, (id) => {
          if (id) {
            const targetOwner = 1 - attOwner;
            applyPowerDebuff(game, attOwner, att.id, id, 1, {
              owner: targetOwner,
              turn: game.players[targetOwner].turns + 1,
            });
          }
          cont();
        });
      });
      return;
    case 'katakuri':
      resolveKatakuriQuestions(game, attOwner, att, cont);
      return;
    case 'moria':
      askSeq(game, attOwner, [['subBetween'], ['subBetween']], 'モリア：両方正解でパワー減少量分のライフダメージ', (res) => {
        if (!res.every(Boolean)) {
          cont();
          return;
        }
        const reduced = game.players[1 - attOwner].board.reduce(
          (sum, target) => sum + target.powerMods
            .filter((mod) => mod.sourceOwner === attOwner && mod.sourceId !== att.id)
            .reduce((n, mod) => n + mod.amount, 0),
          0
        );
        if (reduced) {
          damageLife(game, 1 - attOwner, reduced, () => {
            if (game.phase === 'playing') cont();
          });
        } else cont();
      });
      return;
    case 'magellan':
      ask(game, attOwner, ['personality'], 'マゼラン：正解で攻撃続行。不正解で自分のライフに3ダメージ', (ok) => {
        if (!ok) {
          game.combat = null;
          damageLife(game, attOwner, 3);
          return;
        }
        cont();
      });
      return;
    case 'hody':
      askSeq(game, attOwner, [['wazaKanji'], ['wazaKanji'], ['wazaKanji']], 'ホーディ：正解ごとにパワー+1、不正解ごとに自分のライフに1ダメージ', (res) => {
        const correct = res.filter(Boolean).length;
        const wrong = res.length - correct;
        att.temp += correct;
        if (wrong) {
          damageLife(game, attOwner, wrong, () => {
            if (game.phase === 'playing') cont();
          });
        }
        else cont();
      });
      return;
    default:
      cont();
  }
}

function resolveKatakuriQuestions(game, owner, card, cont) {
  askSeq(game, owner, [['subKanji'], ['before']], 'カタクリ：正解1問につき相手キャラのパワー-1（永続）', (res) => {
    const targets = res.map((ok) => ok);
    const applyNext = (i) => {
      if (i >= targets.length) {
        cont(false);
        return;
      }
      if (!targets[i]) {
        applyNext(i + 1);
        return;
      }
      const options = game.players[1 - owner].board.map((x) => x.id);
      askChoose(game, owner, 'パワーを永続で下げる相手キャラを選んでください', options, (id) => {
        if (id) applyPowerDebuff(game, owner, card.id, id, 1);
        applyNext(i + 1);
      });
    };
    applyNext(0);
  });
}

// ===== 起動効果 =====
function useAbility(game, pi, charId, genre) {
  const P = game.players[pi];
  const c = P.board.find((x) => x.id === charId);
  if (!c) fail('そのキャラクターは場にいません。');
  if (!ACTIVE_CARDS.has(c.defId)) fail('このカードに起動効果はありません。');
  if (c.defId !== 'beloBetty' && c.abilityUsed) fail('この効果はこのターンすでに使用しました。');
  const name = CARD_DEFS[c.defId].name;
  if (CARD_DEFS[c.defId].restCost) {
    if (c.rested) fail('ダウン中のため使用できません。');
    c.rested = true;
    c.abilityUsed = true;
  }
  const opp = 1 - pi;
  const turnExpiry = { owner: pi, turn: P.turns };
  const nextOppExpiry = () => ({ owner: opp, turn: game.players[opp].turns + 1 });

  switch (c.defId) {
    case 'taco':
      ask(game, pi, ['personality'], `${name}：正解でカードを1枚引く`, (ok) => {
        if (!ok) return;
        const n = draw(game, pi, hasOnBoard(game, pi, 'morolon') ? 2 : 1);
        addLog(game, `${game.seats[pi].name} はカードを${n}枚引いた。`);
      });
      return;
    case 'morolon':
      ask(game, pi, ['between'], `${name}：正解でライフ耐久力を回復`, (ok) => {
        if (!ok) return;
        healLife(game, pi, hasOnBoard(game, pi, 'fraley', 'taco') ? 4 : 2);
      });
      return;
    case 'fraley':
      ask(game, pi, ['age'], `${name}：正解で相手キャラ1体のパワーを下げる`, (ok) => {
        if (!ok) return;
        const rounds = P.hand.some((x) => x.defId === 'morolon') ? 2 : 1;
        const finish = () => {
          const jeep = P.board.find((x) => x.defId === 'jeep');
          if (jeep) destroy(game, pi, jeep);
        };
        const round = (left) => {
          if (left <= 0) {
            finish();
            return;
          }
          chooseOpp(game, pi, 'パワー-2にする相手キャラを選んでください', () => true, (t) => {
            if (t) applyPowerDebuff(game, pi, c.id, t.c.id, 2, nextOppExpiry());
            round(left - 1);
          });
        };
        round(rounds);
      });
      return;
    case 'stelly':
    case 'mari': {
      const genre = c.defId === 'stelly' ? 'fish' : 'food';
      ask(game, pi, [genre], `${name}：正解でカードを1枚引き、1枚捨てる`, (ok) => {
        if (!ok) return;
        draw(game, pi, 1);
        askDiscard(game, pi, '捨てる手札を1枚選んでください', () => {}, 0);
      });
      return;
    }
    case 'cobra':
      ask(game, pi, ['before'], `${name}：正解で相手のパワー4以下のキャラを手札に戻す`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, '手札に戻す相手キャラ（パワー4以下）を選んでください', (x) => currentPower(x) <= 4, (t) => {
          if (t) bounce(game, t);
        });
      });
      return;
    case 'sauce':
      ask(game, pi, ['image'], `${name}：正解でダウン中の相手キャラを回復不可にする`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, '回復できなくする相手キャラ（ダウン中）を選んでください', (x) => x.rested, (t) => {
          if (t) {
            t.c.noRecover = true;
            addLog(game, `${CARD_DEFS[t.c.defId].name} は次の相手ターン開始時に回復できない。`);
          }
          placeFromHand(game, pi, 'ramen');
        });
      });
      return;
    case 'coulan':
      ask(game, pi, ['between'], `${name}：正解でカードを1枚引く`, (ok) => {
        if (ok) draw(game, pi, 1);
      });
      return;
    case 'hamburger':
    case 'nashi':
    case 'tarassa': {
      c.abilityUsed = true;
      const genre = { hamburger: 'hint', nashi: 'ship', tarassa: 'before' }[c.defId];
      ask(game, pi, [genre], `${name}：正解でトラッシュの世界の王達が20種類以上なら勝利`, (ok) => {
        if (ok) checkWorldWin(game, pi);
      });
      return;
    }
    case 'iwatobi':
    case 'mukkeka': {
      const genre = c.defId === 'iwatobi' ? 'subKanji' : 'wazaKanji';
      ask(game, pi, [genre], `${name}：正解でお互いのキャラ1体ずつのパワー-1`, (ok) => {
        if (!ok) return;
        const partners = c.defId === 'iwatobi' ? ['mukkeka', 'hamburger'] : ['iwatobi', 'beer6'];
        const again = P.board.some((x) => x.id !== c.id && partners.includes(x.defId));
        pairDebuff(game, pi, c, again ? 2 : 1);
      });
      return;
    }
    case 'beer6':
      ask(game, pi, ['subBetween'], `${name}：正解で相手キャラ1体のパワーをこのターン中-3`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, 'パワー-3にする相手キャラを選んでください', () => true, (t) => {
          if (t) applyPowerDebuff(game, pi, c.id, t.c.id, 3, turnExpiry);
          if (hasOnBoard(game, pi, 'mukkeka')) {
            const n = draw(game, pi, 1);
            addLog(game, `${game.seats[pi].name} はカードを${n}枚引いた。`);
          }
        });
      });
      return;
    case 'ramen':
      ask(game, pi, ['hobby', 'hate', 'season'], `${name}：正解で相手のコスト5以下のキャラを手札に戻す`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, '手札に戻す相手キャラ（コスト5以下）を選んでください', (x) => CARD_DEFS[x.defId].cost <= 5, (t) => {
          if (t) bounce(game, t);
        });
      });
      return;
    case 'rikudold':
    case 'bandodecine':
      ask(game, pi, ['subBetween'], `${name}：正解で味方キャラ1体を回復`, (ok) => {
        if (!ok) return;
        const options = P.board.filter((x) => x.rested).map((x) => x.id);
        askChoose(game, pi, '回復させる味方キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) {
            t.c.rested = false;
            addLog(game, `${CARD_DEFS[t.c.defId].name} が回復した。`);
          }
        });
      });
      return;
    case 'tea4':
      ask(game, pi, ['before'], `${name}：正解で相手の問題の制限時間が20秒になる`, (ok) => {
        if (!ok) return;
        game.players[opp].shortUntil = game.players[opp].turns + 1;
        addLog(game, '次の相手ターン終了時まで、相手の問題の制限時間は20秒になる。');
      });
      return;
    case 'chap':
      ask(game, pi, ['ship'], `${name}：正解で相手キャラ1体のパワーをこのターン中-2`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, 'パワー-2にする相手キャラを選んでください', () => true, (t) => {
          if (t) applyPowerDebuff(game, pi, c.id, t.c.id, 2, turnExpiry);
          placeFromHand(game, pi, 'ramen');
        });
      });
      return;
    case 'jeep':
      ask(game, pi, ['fish'], `${name}：正解でコストを2回復`, (ok) => {
        if (!ok) return;
        gainCost(game, pi, 2);
        const fraley = P.board.find((x) => x.defId === 'fraley');
        if (fraley) destroy(game, pi, fraley);
      });
      return;
    case 'negie':
      ask(game, pi, ['between'], `${name}：正解でカードを1枚引く`, (ok) => {
        if (!ok) return;
        const n = draw(game, pi, 1);
        addLog(game, `${game.seats[pi].name} はカードを${n}枚引いた。`);
        if (hasOnBoard(game, pi, 'sauce')) gainCost(game, pi, 2);
      });
      return;
    case 'seza':
      ask(game, pi, ['image'], `${name}：正解で相手キャラ全員のパワー-1`, (ok) => {
        if (!ok) return;
        for (const t of [...game.players[opp].board]) {
          applyPowerDebuff(game, pi, c.id, t.id, 1, nextOppExpiry());
        }
      });
      return;
    case 'lemoncheese':
      ask(game, pi, ['hint'], `${name}：正解で相手キャラ1体のパワー-1（永続）`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, 'パワー-1にする相手キャラを選んでください', () => true, (t) => {
          if (t) applyPowerDebuff(game, pi, c.id, t.c.id, 1);
        });
      });
      return;
    case 'seki':
      ask(game, pi, ['personality'], `${name}：正解で自身以外の味方キャラを全て破壊`, (ok) => {
        if (!ok) return;
        for (const x of [...P.board]) if (x.id !== c.id) destroy(game, pi, x);
      });
      return;
    case 'stroganoff':
      ask(game, pi, ['height'], `${name}：正解で味方キャラ1体を破壊しライフ耐久力を3回復`, (ok) => {
        if (!ok) return;
        const options = P.board.map((x) => x.id);
        askChoose(game, pi, '破壊する味方キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t && destroy(game, pi, t.c)) healLife(game, pi, 3);
        });
      });
      return;
    case 'bulldog':
      ask(game, pi, ALL_GENRES, `${name}：正解で相手キャラ1体を攻撃不可にする`, (ok) => {
        if (!ok) return;
        chooseOpp(game, pi, '攻撃不可にする相手キャラを選んでください', () => true, (t) => {
          if (t) {
            t.c.noAttack = true;
            addLog(game, `${CARD_DEFS[t.c.defId].name} は次の相手ターン中、攻撃できない。`);
          }
        });
      });
      return;
    case 'mugicha': {
      if (!MUGICHA_GENRES.includes(genre)) fail('強化するジャンルを選んでください。');
      if (c.genresUsed.includes(genre)) fail('そのジャンルでは、もうこのカードを強化できません。');
      c.abilityUsed = true;
      c.genresUsed.push(genre);
      ask(game, pi, [genre], `${name}：正解でパワー+1（永続）`, (ok) => {
        if (ok) c.bonus += 1;
      });
      return;
    }
    case 'dragon':
      c.abilityUsed = true;
      askSeq(game, pi, [['wazaKanji'], ['wazaKanji'], ['subKanji'], ['subKanji']], `${name}：4問正解でダウン中の味方全員を回復`, (res) => {
        if (res.every(Boolean)) recoverRested(game, pi);
      });
      return;
    case 'koala':
      c.abilityUsed = true;
      ask(game, pi, ['age', 'height', 'food', 'blood'], `${name}：正解で味方キャラ1体のパワー+1`, (ok) => {
        if (!ok) return;
        const options = P.board.map((ally) => ally.id);
        askChoose(game, pi, 'パワーを上げる味方キャラを選んでください', options, (id) => {
          if (id) {
            const target = findChar(game, id);
            if (target) {
              target.c.turnTemp += 1;
              addLog(game, `${CARD_DEFS[target.c.defId].name} のパワーがこのターン中+1された。`);
            }
          }
        });
      });
      return;
    case 'inazuma':
      c.abilityUsed = true;
      askSeq(game, pi, [['image'], ['image']], `${name}：両方正解で手札を1枚捨てて2枚引く`, (res) => {
        if (!res.every(Boolean)) return;
        askDiscard(game, pi, '捨てる手札を1枚選んでください', () => {});
      });
      return;
    case 'beloBetty':
      if (c.rested) fail('ダウン中のため使用できません。');
      c.rested = true;
      ask(game, pi, ['hobby', 'hate', 'season'], `${name}：正解で自身以外の味方キャラのパワー+1（次の相手ターン終了まで）`, (ok) => {
        if (!ok) return;
        const expiresOwner = 1 - pi;
        const expiresTurn = game.players[expiresOwner].turns + 1;
        for (const ally of P.board) {
          if (ally.id !== c.id) {
            applyPowerBuff(game, pi, c.id, ally.id, 1, { owner: expiresOwner, turn: expiresTurn });
          }
        }
      });
      return;
    case 'ahiru':
      c.abilityUsed = true;
      ask(game, pi, ['hobby', 'hate', 'season'], `${name}：正解でベロ・ベティを1体回復`, (ok) => {
        if (ok) chooseRestedAlly(game, pi, 'beloBetty', '回復するベロ・ベティを選んでください');
      });
      return;
    case 'ushiarno':
      c.abilityUsed = true;
      ask(game, pi, ['hint'], `${name}：正解でモーリーを1体回復`, (ok) => {
        if (ok) chooseRestedAlly(game, pi, 'morley', '回復するモーリーを選んでください');
      });
      return;
    case 'dorobou':
      c.abilityUsed = true;
      ask(game, pi, ['wazaKanji'], `${name}：正解で相手のライフに2ダメージ`, (ok) => {
        if (ok) damageLife(game, 1 - pi, 2);
      });
      return;
    case 'allholiday':
      c.abilityUsed = true;
      ask(game, pi, ['before'], `${name}：正解で山札を1枚引く`, (ok) => {
        if (ok) draw(game, pi, 1);
      });
      return;
    case 'corobokkle':
      c.abilityUsed = true;
      askSeq(game, pi, [['hint'], ['personality']], `${name}：両方正解で相手キャラ1体をダウン`, (res) => {
        if (!res.every(Boolean)) return;
        const options = game.players[1 - pi].board.filter((x) => !x.rested).map((x) => x.id);
        askChoose(game, pi, 'ダウンさせる相手キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) {
            t.c.rested = true;
            addLog(game, `${CARD_DEFS[t.c.defId].name} がダウンした。`);
          }
        });
      });
      return;
    case 'kavell':
      c.abilityUsed = true;
      ask(game, pi, ALL_GENRES, `${name}：正解で味方のダウン中キャラを1体回復`, (ok) => {
        if (!ok) return;
        const options = P.board.filter((x) => x.rested).map((x) => x.id);
        askChoose(game, pi, '回復させる味方キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) {
            t.c.rested = false;
            addLog(game, `${CARD_DEFS[t.c.defId].name} が回復した。`);
          }
        });
      });
      return;
    case 'karoo':
      if (c.rested) fail('ダウン中のため使用できません。');
      c.abilityUsed = true;
      c.rested = true;
      ask(game, pi, ['image'], `${name}：正解で味方1体が出たターンでも攻撃でき、ダウンしていない相手にも攻撃できる`, (ok) => {
        if (!ok) return;
        const options = P.board.map((x) => x.id);
        askChoose(game, pi, '効果を与える味方キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) {
            t.c.haste = true;
            t.c.hitActive = true;
            addLog(game, `${CARD_DEFS[t.c.defId].name} はこのターン、出たターンでも攻撃でき、ダウンしていない相手にも攻撃できる。`);
          }
        });
      });
      return;
    case 'enel':
      c.abilityUsed = true;
      ask(game, pi, ['between'], `${name}：正解で相手キャラ2体のパワー-2`, (ok) => {
        if (!ok) return;
        const applyNext = (remaining, excluded = []) => {
          const options = game.players[1 - pi].board
            .filter((x) => !excluded.includes(x.id))
            .map((x) => x.id);
          if (!options.length || remaining <= 0) return;
          askChoose(game, pi, 'パワーを下げる相手キャラを選んでください', options, (id) => {
            if (!id) return;
            applyPowerDebuff(game, pi, c.id, id, 2, { owner: pi, turn: P.turns });
            applyNext(remaining - 1, [...excluded, id]);
          });
        };
        applyNext(2);
      });
      return;
    case 'arlong':
      c.abilityUsed = true;
      ask(game, pi, ['fish'], `${name}：正解で相手のダウン中キャラのパワー-2`, (ok) => {
        if (!ok) return;
        const options = game.players[1 - pi].board.filter((x) => x.rested).map((x) => x.id);
        askChoose(game, pi, 'パワーを下げるダウン中の相手キャラを選んでください', options, (id) => {
          if (id) applyPowerDebuff(game, pi, c.id, id, 2, { owner: pi, turn: P.turns });
        });
      });
      return;
    case 'wapol':
      c.abilityUsed = true;
      ask(game, pi, ['food'], `${name}：正解で他の味方の効果による相手のパワー減少量分、自身のパワー+`, (ok) => {
        if (!ok) return;
        const reduced = game.players[1 - pi].board.reduce(
          (sum, target) => sum + target.powerMods
            .filter((mod) => mod.sourceOwner === pi && mod.sourceId !== c.id)
            .reduce((n, mod) => n + mod.amount, 0),
          0
        );
        c.turnTemp += reduced;
        if (reduced) addLog(game, `${name} のパワーが+${reduced}された。`);
        else addLog(game, `${name} のパワーは変化しなかった。`);
      });
      return;
    case 'sloop':
      c.abilityUsed = true;
      ask(game, pi, ALL_GENRES, `${name}：正解でサニー号以外の味方全員のパワー+1（永続）`, (ok) => {
        if (!ok) return;
        for (const x of P.board) if (x.id !== c.id) x.bonus += 1;
        addLog(game, 'サニー号以外の味方キャラ全員のパワーが+1された。');
      });
      return;
    default:
      fail('未対応の効果です。');
  }
}

// ===== アクション =====
function actPlay(game, pi, cardId, slot) {
  const P = game.players[pi];
  const card = P.hand.find((c) => c.id === cardId);
  if (!card) fail('そのカードは手札にありません。');
  const def = CARD_DEFS[card.defId];
  if (!Number.isInteger(slot) || slot < 0 || slot >= BOARD_SIZE) fail('枠が正しくありません。');
  const occupant = P.board.find((c) => c.slot === slot);
  if (occupant && P.board.length < BOARD_SIZE) fail('空いている枠があるときは交換できません。');
  if (def.cost > P.cost) fail('コストが足りません。');

  if (occupant) {
    P.board = P.board.filter((x) => x.id !== occupant.id);
    P.trash.push({ id: occupant.id, defId: occupant.defId });
    addLog(game, `${game.seats[pi].name} は ${CARD_DEFS[occupant.defId].name} をトラッシュへ送った。`);
  }
  P.cost -= def.cost;
  P.hand = P.hand.filter((c) => c.id !== cardId);
  const c = newChar(card, slot, P);
  P.board.push(c);
  addLog(game, `${game.seats[pi].name} が ${def.name} を出した。`);

  if (card.defId === 'prince') {
    ask(game, pi, ['subKanji'], 'サンジ：正解でこのターン攻撃でき、パワー+2', (ok) => {
      if (ok) {
        c.haste = true;
        c.turnTemp += 2;
      }
    });
  }
  if (card.defId === 'sabo') {
    ask(game, pi, ['subKanji'], 'サボ：正解でパワー+1（永続）', (ok) => {
      if (ok) {
        c.bonus += 1;
        addLog(game, 'サボのパワーが永続で+1された。');
      }
    });
  }
  if (card.defId === 'ivankov') {
    askSeq(game, pi, [['image'], ['image']], 'イワンコフ：両方正解で山札から2枚引く', (res) => {
      if (!res.every(Boolean)) return;
      const drawn = draw(game, pi, 2);
      addLog(game, `${game.seats[pi].name} はカードを${drawn}枚引いた。`);
    });
  }
  if (card.defId === 'bunnyJoe') {
    ask(game, pi, ['subKanji'], 'バニー・ジョー：正解で山札から1枚引く', (ok) => {
      if (ok) {
        const drawn = draw(game, pi, 1);
        addLog(game, `${game.seats[pi].name} はカードを${drawn}枚引いた。`);
      }
    });
  }
  if (card.defId === 'terryGilteo') {
    ask(game, pi, ['wazaKanji'], 'テリー・ギルテオ：正解で相手キャラ1体をダウン', (ok) => {
      if (!ok) return;
      const options = game.players[1 - pi].board.filter((target) => !target.rested).map((target) => target.id);
      askChoose(game, pi, 'ダウンさせる相手キャラを選んでください', options, (id) => {
        const target = id && findChar(game, id);
        if (target) {
          target.c.rested = true;
          addLog(game, `${CARD_DEFS[target.c.defId].name} がダウンした。`);
        }
      });
    });
  }
  if (card.defId === 'lucci') {
    ask(game, pi, ['subKanji'], 'ルッチ：正解で出たターンに攻撃可能、相手キャラのパワー-2', (ok) => {
      if (!ok) return;
      c.haste = true;
      const options = game.players[1 - pi].board.map((x) => x.id);
      askChoose(game, pi, 'パワーを下げる相手キャラを選んでください', options, (id) => {
        if (id) applyPowerDebuff(game, pi, c.id, id, 2, { owner: pi, turn: P.turns });
      });
    });
  }
  if (card.defId === 'caesar') {
    askSeq(game, pi, [['ship'], ['ship']], 'シーザー：両方正解で相手キャラ全員のパワー-1', (res) => {
      if (!res.every(Boolean)) return;
      for (const target of [...game.players[1 - pi].board]) {
        applyPowerDebuff(game, pi, c.id, target.id, 1, { owner: pi, turn: P.turns });
      }
    });
  }
  if (card.defId === 'kaido') {
    askSeq(game, pi, [['before'], ['subKanji'], ['wazaKanji']], 'カイドウ：3問正解で相手のパワー3以下を全て破壊。不正解で自身を破壊', (res) => {
      if (!res.every(Boolean)) {
        destroy(game, pi, c);
        return;
      }
      for (const target of [...game.players[1 - pi].board]) {
        if (currentPower(target) <= 3) destroy(game, 1 - pi, target);
      }
    });
  }
}

function canAttackNow(P, c) {
  return c.haste || P.turns - c.summonedOn >= (CARD_DEFS[c.defId].attackDelay || 1);
}

function actAttack(game, pi, attackerId, target) {
  const P = game.players[pi];
  const att = P.board.find((c) => c.id === attackerId);
  if (!att) fail('攻撃するキャラクターが場にいません。');
  if (att.rested) fail('そのキャラクターはダウン中です。');
  if (att.noAttack) fail('そのキャラクターはこのターン攻撃できません。');
  if (!canAttackNow(P, att)) fail('場に出たばかりのため攻撃できません。');

  if (target === 'player') {
    // 直接攻撃
  } else {
    const t = game.players[1 - pi].board.find((c) => c.id === target);
    if (!t) fail('攻撃対象が場にいません。');
    if (!t.rested && !att.hitActive) fail('ダウンしている相手キャラにしか攻撃できません。');
  }

  att.rested = true;
  game.combat = { attId: att.id, target, unblockable: false };
  game.attackSeq = (game.attackSeq || 0) + 1;
  game.lastAttack = { seq: game.attackSeq, attackerId: att.id, attackerOwner: pi, target };
  addLog(
    game,
    `${CARD_DEFS[att.defId].name} が${target === 'player' ? 'プレイヤー' : CARD_DEFS[findChar(game, target).c.defId].name}に攻撃！`
  );
  attackTriggers(game, pi, att, () => afterAttackTriggers(game));
}

function actBlock(game, pi, blockerId) {
  const p = game.pending;
  if (!p || p.kind !== 'block' || p.owner !== pi) fail('今はブロックできません。');
  const cb = game.combat;
  const found = findChar(game, cb.attId);
  if (!found) {
    game.pending = null;
    game.combat = null;
    return;
  }
  const att = found.c;
  const attOwner = found.pi;

  clearTimeout(game.timer);
  game.pending = null;

  if (!blockerId) {
    addLog(game, 'ブロックしなかった。');
    resolveDirect(game, att, attOwner);
    return;
  }
  if (!p.options.includes(blockerId)) fail('そのキャラクターではブロックできません。');
  const blocker = game.players[pi].board.find((c) => c.id === blockerId);
  blocker.rested = true;
  addLog(game, `${CARD_DEFS[blocker.defId].name} がブロック！`);
  defendTrigger(game, pi, blocker, 'block', (noKill) => {
    resolveBattle(game, att, attOwner, blocker, pi, noKill);
  });
}

function actEnd(game, pi) {
  const endingPlayer = game.players[pi];
  if (endingPlayer.shortUntil && endingPlayer.turns >= endingPlayer.shortUntil) endingPlayer.shortUntil = 0;
  for (const c of endingPlayer.board) c.noAttack = false;
  for (const c of game.players[pi].board) {
    c.temp = 0;
    c.turnTemp = 0;
    c.haste = false;
    c.hitActive = false;
  }
  for (const player of game.players) {
    for (const c of player.board) {
      c.powerMods = (c.powerMods || []).filter(
        (mod) => mod.expiresOwner !== pi || mod.expiresTurn > game.players[pi].turns
      );
      c.powerBuffs = (c.powerBuffs || []).filter(
        (buff) => buff.expiresOwner !== pi || buff.expiresTurn > game.players[pi].turns
      );
    }
  }
  startTurn(game, 1 - pi);
  const turnNo = game.players[0].turns + game.players[1].turns;
  for (let owner = 0; owner < game.players.length; owner++) {
    for (const c of [...game.players[owner].board]) {
      if (c.indestructibleThroughTurn < turnNo && currentPower(c) <= 0) destroy(game, owner, c);
    }
  }
}

// ===== 状態送信 =====
function charView(game, pi, c) {
  const def = CARD_DEFS[c.defId];
  const P = game.players[pi];
  const mine = pi === game.current && game.phase === 'playing';
  return {
    id: c.id,
    defId: c.defId,
    name: def.name,
    slot: c.slot,
    rested: c.rested,
    power: power(c),
    cost: def.cost,
    blocker: def.blocker,
    text: def.text,
    canAttack: mine && !c.rested && !c.noAttack && canAttackNow(P, c),
    hitActive: !!c.hitActive,
    needsRest: !!def.restCost,
    noAttack: !!c.noAttack,
    summonedOn: c.summonedOn,
    attackDelay: def.attackDelay || 1,
    turnsOnBoard: P.turns - c.summonedOn,
    hasAbility: ACTIVE_CARDS.has(c.defId),
    abilityUsed: c.abilityUsed,
    genresUsed: c.genresUsed,
  };
}

function pendingView(game, viewer) {
  const p = game.pending;
  if (!p) return null;
  const base = {
    kind: p.kind,
    mine: p.owner === viewer,
    deadline: p.deadline,
    total: p.ms || QUIZ_MS,
  };
  if (p.kind === 'quiz') {
    return { ...base, title: p.title, genre: p.genre, lines: p.lines, step: p.step };
  }
  if (p.kind === 'choose') {
    return { ...base, title: p.title, options: p.options };
  }
  if (p.kind === 'discard') {
    return { ...base, title: p.title, options: p.owner === viewer ? p.options : undefined };
  }
  if (p.kind === 'block') {
    const att = findChar(game, p.attId);
    return {
      ...base,
      options: p.options,
      attackerName: att ? CARD_DEFS[att.c.defId].name : '',
      attackerPower: att ? power(att.c) : 0,
    };
  }
  return base;
}

function viewFor(game, viewer) {
  const base = {
    roomId: game.roomId,
    phase: game.phase,
    you: viewer,
    seats: game.seats.map((s) => (s ? { name: s.name, connected: s.connected } : null)),
    log: game.log.slice(-30),
    flash: game.flash,
    lastAttack: game.lastAttack
      ? {
          seq: game.lastAttack.seq,
          attackerId: game.lastAttack.attackerId,
          attackerMine: game.lastAttack.attackerOwner === viewer,
          target: game.lastAttack.target,
        }
      : null,
  };
  if (game.phase === 'waiting') return base;

  const make = (pi, own) => {
    const P = game.players[pi];
    return {
      name: game.seats[pi].name,
      connected: game.seats[pi].connected,
      life: P.life,
      lifeHp: P.lifeHp,
      lifeMaxHp: LIFE_HP,
      deckCount: P.deck.length,
      trash: P.trash.map((t) => ({ id: t.id, defId: t.defId, name: CARD_DEFS[t.defId].name })),
      handCount: P.hand.length,
      cost: P.cost,
      maxCost: P.maxCost,
      board: P.board.map((c) => charView(game, pi, c)),
      hand: own
        ? P.hand.map((c) => {
            const def = CARD_DEFS[c.defId];
            return {
              id: c.id,
              defId: c.defId,
              name: def.name,
              cost: def.cost,
              power: def.power,
              blocker: def.blocker,
              text: def.text,
            };
          })
        : undefined,
    };
  };

  return {
    ...base,
    current: game.current,
    first: game.first,
    turnNo: game.players[0].turns + game.players[1].turns,
    me: make(viewer, true),
    opp: make(1 - viewer, false),
    pending: pendingView(game, viewer),
    winner: game.winner,
  };
}

function broadcast(game) {
  game.seats.forEach((s, i) => {
    if (s?.socketId) IO.to(s.socketId).emit('tcg:state', viewFor(game, i));
  });
}

function settle(game) {
  checkWin(game);
  broadcast(game);
}

// ===== Socket =====
export function setupTcgMode(io) {
  IO = io;

  io.on('connection', (socket) => {
    const withGame = (fn) => {
      const roomId = socket.data.tcgRoom;
      const seat = socket.data.tcgSeat;
      const game = games.get(roomId);
      if (!game || seat === undefined) return;
      try {
        fn(game, seat);
        settle(game);
      } catch (e) {
        if (e instanceof GameError) socket.emit('tcg:error', { message: e.message });
        else {
          console.error('[tcg] error', e);
          socket.emit('tcg:error', { message: 'サーバーエラーが発生しました。' });
        }
      }
    };

    const needPlaying = (game, seat) => {
      if (game.phase !== 'playing') fail('対戦中ではありません。');
      return seat;
    };

    const needMyFreeTurn = (game, seat) => {
      needPlaying(game, seat);
      if (game.current !== seat) fail('相手のターンです。');
      if (game.pending) fail('解決中の処理があります。');
    };

    socket.on('tcg:join', (payload = {}) => {
      const roomId = String(payload.roomId || '').slice(0, 32);
      const clientId = String(payload.clientId || '').slice(0, 64);
      const name = String(payload.name || 'プレイヤー').slice(0, 20);
      if (!roomId || !clientId) return;

      let game = games.get(roomId);
      if (!game) {
        game = createGame(roomId);
        games.set(roomId, game);
      }
      clearTimeout(game.cleanup);

      let seat = game.seats.findIndex((s) => s && s.clientId === clientId);
      if (seat === -1) {
        seat = game.seats.findIndex((s) => !s);
        if (seat === -1 || game.phase !== 'waiting') {
          socket.emit('tcg:error', { message: 'この部屋はすでに満員です。', fatal: true });
          return;
        }
        const deck = normalizeDeck(payload.deck);
        if (!deck) {
          socket.emit('tcg:error', { message: 'デッキが不正です（30枚・同名カードは3枚まで）。', fatal: true });
          return;
        }
        game.seats[seat] = { clientId, name, socketId: socket.id, connected: true, deck };
      } else {
        Object.assign(game.seats[seat], { socketId: socket.id, connected: true, name });
      }

      socket.data.tcgRoom = roomId;
      socket.data.tcgSeat = seat;

      if (game.phase === 'waiting' && game.seats[0] && game.seats[1]) startGame(game);
      settle(game);
    });

    socket.on('tcg:play', ({ cardId, slot } = {}) =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        actPlay(game, seat, Number(cardId), Number(slot));
      })
    );

    socket.on('tcg:discard', ({ cardId } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        const pending = game.pending;
        if (!pending || pending.kind !== 'discard' || pending.owner !== seat) fail('今はカードを捨てられません。');
        resolveDiscard(game, pending, Number(cardId));
      })
    );

    socket.on('tcg:attack', ({ attackerId, target } = {}) =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        actAttack(game, seat, Number(attackerId), target === 'player' ? 'player' : Number(target));
      })
    );

    socket.on('tcg:ability', ({ charId, genre } = {}) =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        useAbility(game, seat, Number(charId), String(genre || ''));
      })
    );

    socket.on('tcg:answer', ({ text } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        const p = game.pending;
        if (!p || p.kind !== 'quiz' || p.owner !== seat) fail('今は回答できません。');
        resolveQuiz(game, p, String(text ?? '').slice(0, 200), false);
      })
    );

    socket.on('tcg:block', ({ blockerId } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        actBlock(game, seat, blockerId ? Number(blockerId) : null);
      })
    );

    socket.on('tcg:choose', ({ targetId } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        const p = game.pending;
        if (!p || p.kind !== 'choose' || p.owner !== seat) fail('今は選択できません。');
        const id = targetId ? Number(targetId) : null;
        if (id !== null && !p.options.includes(id)) fail('その対象は選べません。');
        clearTimeout(game.timer);
        game.pending = null;
        p.cb(id);
      })
    );

    socket.on('tcg:end', () =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        actEnd(game, seat);
      })
    );

    socket.on('tcg:surrender', () =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        finishGame(game, 1 - seat, `${game.seats[seat].name} が降参した`);
      })
    );

    socket.on('disconnect', () => {
      const game = games.get(socket.data.tcgRoom);
      const seat = socket.data.tcgSeat;
      if (!game || seat === undefined) return;
      const s = game.seats[seat];
      if (!s || s.socketId !== socket.id) return;
      s.connected = false;
      s.socketId = null;
      broadcast(game);
      if (game.seats.every((x) => !x || !x.connected)) {
        clearTimeout(game.cleanup);
        game.cleanup = setTimeout(() => {
          clearTimeout(game.timer);
          games.delete(game.roomId);
        }, 10 * 60 * 1000);
      }
    });
  });
}
