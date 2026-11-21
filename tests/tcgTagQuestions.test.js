import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTagQuestion, selectTagQuestion } from '../lib/tcgTagQuestions.js';
import { ALL_GENRES } from '../lib/tcgQuestions.js';
import { ALL_DECK_CARDS, CARD_DEFS, EXPANSION_1_CARDS, normalizeDeck } from '../lib/tcgCards.js';
import { setupTcgMode } from '../tcgMode.js';

const row = (type, answer, options = [], alts = []) => ({
  type, question: '問題', correct_answer: answer,
  options_json: JSON.stringify(options), alt_answers_json: JSON.stringify(alts),
});

test('tag questions judge all four formats and alternative answers', () => {
  const text = makeTagQuestion(row('text', '正解', [], ['別 解']), '空島');
  assert.equal(text.check(' 別解 '), true);
  assert.equal(text.check('誤答'), false);

  const single = makeTagQuestion(row('single', 'A', ['A', 'B', 'C'], ['B']), '空島');
  assert.equal(single.check('B'), true);
  assert.equal(single.check('C'), false);
  assert.equal(single.check('not an option'), false);

  const multi = makeTagQuestion(row('multi', '["A","C"]', ['A', 'B', 'C']), '空島');
  assert.equal(multi.check(['C', 'A']), true);
  assert.equal(multi.check(['A']), false);
  assert.equal(multi.check(['A', 'A', 'C']), false);

  const order = makeTagQuestion(row('order', '["A","B","C"]', ['C', 'A', 'B']), '空島');
  assert.equal(order.check(['A', 'B', 'C']), true);
  assert.equal(order.check(['C', 'B', 'A']), false);
  assert.equal(order.check('A,B,C'), false);
  assert.equal(makeTagQuestion(row('single', 'missing', ['A']), '空島'), null);
});

test('expansion cards are available to decks but transformed cards are not', () => {
  assert.equal(ALL_GENRES.includes('tag'), true);
  assert.equal(EXPANSION_1_CARDS.length, 12);
  assert.ok(EXPANSION_1_CARDS.every((id) => ALL_DECK_CARDS.includes(id) && CARD_DEFS[id]));
  assert.equal(ALL_DECK_CARDS.includes('hyogoro2'), false);
  assert.equal(normalizeDeck({ hyogoro2: 30 }), null);
});

test('tag selection uses exact tags and cycles through the matching pool', () => {
  const rows = [
    { ...row('text', 'one'), id: 1, question: 'first', tags_json: '["空島"]' },
    { ...row('text', 'two'), id: 2, question: 'second', tags_json: ['空島', '3D2Y'] },
    { ...row('text', 'three'), id: 3, question: 'third', tags_json: '["ワノ国"]' },
    { ...row('text', 'four'), id: 4, question: 'fourth', tags_json: '["W7、エニエス・ロビー"]' },
  ];
  const used = new Map();
  const first = selectTagQuestion(rows, '空島', used);
  const second = selectTagQuestion(rows, '空島', used);
  assert.notEqual(first.lines[0], second.lines[0]);
  assert.ok(['first', 'second'].includes(selectTagQuestion(rows, '空島', used).lines[0]));
  assert.equal(selectTagQuestion(rows, 'ワノ国', used).lines[0], 'third');
  assert.equal(selectTagQuestion(rows, 'W7、エニエス・ロビー', used).lines[0], 'fourth');
  assert.equal(selectTagQuestion(rows, 'W7', used), null);
});

test('Humphrey grants exactly two common actions and tag quizzes last 40 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0.999999);
  const sockets = new Map();
  let connect;
  const asked = [];
  setupTcgMode({
    on: (_event, handler) => { connect = handler; },
    to: (id) => ({ emit: (event, data) => {
      if (event === 'tcg:state') sockets.get(id).state = data;
    } }),
  }, {
    questionLoader: async (tag) => {
      asked.push(tag);
      return makeTagQuestion(row('text', 'ok', [], ['yes']), tag);
    },
  });
  const deck = Object.fromEntries(['humphrey', 'mugicha', 'zori', 'dorobou', 'hanap', 'prince', 'chappy', 'allholiday', 'riesen', 'corobokkle'].map((id) => [id, 3]));
  function join(id) {
    const handlers = {};
    const socket = {
      id, data: {}, errors: [],
      on: (event, handler) => { handlers[event] = handler; },
      emit: (event, data) => { if (event === 'tcg:error') socket.errors.push(data.message); },
      send: (event, data) => handlers[event](data),
    };
    sockets.set(id, socket);
    connect(socket);
    socket.send('tcg:join', { roomId: 'tag-humphrey-test', clientId: id, name: id, deck });
    return socket;
  }
  const a = join('a');
  const b = join('b');
  a.send('tcg:mulligan', { redraw: false });
  b.send('tcg:mulligan', { redraw: false });
  const chooser = a.state.pending.mine ? a : b;
  chooser.send('tcg:order', { first: true });
  const opponent = chooser === a ? b : a;
  const card = chooser.state.me.hand.find((item) => item.defId === 'humphrey');
  chooser.send('tcg:play', { cardId: card.id, slot: 0 });
  chooser.send('tcg:end');
  opponent.send('tcg:end');
  chooser.send('tcg:ability', { charId: card.id });
  await Promise.resolve();
  assert.deepEqual(asked, ['シャボンディ諸島']);
  assert.equal(chooser.state.pending.total, 40000);
  assert.equal(chooser.state.pending.type, 'text');
  chooser.send('tcg:answer', { text: 'yes' });
  chooser.send('tcg:common', { cost: 1 });
  chooser.send('tcg:answer', { text: 'wrong' });
  assert.equal(chooser.state.me.commonUsed, false);
  chooser.send('tcg:common', { cost: 1 });
  chooser.send('tcg:answer', { text: 'wrong' });
  assert.equal(chooser.state.me.commonUsed, true);
  chooser.send('tcg:common', { cost: 1 });
  assert.match(chooser.errors.at(-1), /使用済み/);
  chooser.send('tcg:surrender');
});

test('Hyogoro transforms, applies two quiz results, and reverts after success or failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0.999999);
  const sockets = new Map();
  let connect;
  setupTcgMode({
    on: (_event, handler) => { connect = handler; },
    to: (id) => ({ emit: (event, data) => {
      if (event === 'tcg:state') sockets.get(id).state = data;
    } }),
  }, {
    questionLoader: async (tag) => makeTagQuestion(row('text', 'ok'), tag),
  });
  const deck = Object.fromEntries(['hyogoro', 'mugicha', 'zori', 'dorobou', 'hanap', 'prince', 'chappy', 'allholiday', 'riesen', 'corobokkle'].map((id) => [id, 3]));
  function join(id) {
    const handlers = {};
    const socket = {
      id, data: {}, errors: [],
      on: (event, handler) => { handlers[event] = handler; },
      emit: (event, data) => { if (event === 'tcg:error') socket.errors.push(data.message); },
      send: (event, data) => handlers[event](data),
    };
    sockets.set(id, socket);
    connect(socket);
    socket.send('tcg:join', { roomId: 'tag-hyogoro-test', clientId: id, name: id, deck });
    return socket;
  }
  const a = join('a');
  const b = join('b');
  a.send('tcg:mulligan', { redraw: false });
  b.send('tcg:mulligan', { redraw: false });
  const player = a.state.pending.mine ? a : b;
  const opponent = player === a ? b : a;
  player.send('tcg:order', { first: true });
  for (let i = 0; i < 3; i++) {
    player.send('tcg:end');
    opponent.send('tcg:end');
  }
  const card = player.state.me.hand.find((item) => item.defId === 'hyogoro');
  player.send('tcg:play', { cardId: card.id, slot: 0 });
  player.send('tcg:ability', { charId: card.id });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  assert.equal(player.state.me.board[0].defId, 'hyogoro2');
  player.send('tcg:end');
  opponent.send('tcg:end');
  player.send('tcg:attack', { attackerId: card.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'wrong' });
  assert.equal(player.state.me.board[0].defId, 'hyogoro');
  assert.equal(player.state.me.board[0].power, 4);
  assert.equal(player.state.opp.lifeHp, 3);

  player.send('tcg:end');
  opponent.send('tcg:end');
  player.send('tcg:ability', { charId: card.id });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  player.send('tcg:attack', { attackerId: card.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'wrong' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'wrong' });
  assert.equal(player.state.me.board[0].defId, 'hyogoro');
  assert.equal(player.state.opp.lifeHp, 3);
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});

test('Vergo blocks and permanently reduces an opposing character before battle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0.999999);
  const sockets = new Map();
  let connect;
  setupTcgMode({
    on: (_event, handler) => { connect = handler; },
    to: (id) => ({ emit: (event, data) => {
      if (event === 'tcg:state') sockets.get(id).state = data;
    } }),
  }, {
    questionLoader: async (tag) => makeTagQuestion(row('multi', '["A","C"]', ['A', 'B', 'C']), tag),
  });
  const deck = (first) => Object.fromEntries([first, ...['zori', 'dorobou', 'hanap', 'prince', 'chappy', 'allholiday', 'riesen', 'corobokkle', 'hojiro']].map((id) => [id, 3]));
  function join(id, cards) {
    const handlers = {};
    const socket = {
      id, data: {}, errors: [],
      on: (event, handler) => { handlers[event] = handler; },
      emit: (event, data) => { if (event === 'tcg:error') socket.errors.push(data.message); },
      send: (event, data) => handlers[event](data),
    };
    sockets.set(id, socket);
    connect(socket);
    socket.send('tcg:join', { roomId: 'tag-vergo-test', clientId: id, name: id, deck: cards });
    return socket;
  }
  const a = join('a', deck('mugicha'));
  const b = join('b', deck('vergo'));
  a.send('tcg:mulligan', { redraw: false });
  b.send('tcg:mulligan', { redraw: false });
  const chooser = a.state.pending.mine ? a : b;
  chooser.send('tcg:order', { first: chooser === a });
  for (let i = 0; i < 3; i++) {
    a.send('tcg:end');
    b.send('tcg:end');
  }
  const attacker = a.state.me.hand.find((item) => item.defId === 'mugicha');
  a.send('tcg:play', { cardId: attacker.id, slot: 0 });
  a.send('tcg:end');
  const blocker = b.state.me.hand.find((item) => item.defId === 'vergo');
  b.send('tcg:play', { cardId: blocker.id, slot: 0 });
  b.send('tcg:end');
  a.send('tcg:attack', { attackerId: attacker.id, target: 'player' });
  b.send('tcg:block', { blockerId: blocker.id });
  await Promise.resolve();
  assert.equal(b.state.pending.type, 'multi');
  assert.equal(b.state.pending.genre, 'タグ【パンクハザード】');
  assert.equal(b.state.pending.reveal, undefined);
  b.send('tcg:answer', { text: ['C', 'A'] });
  b.send('tcg:choose', { targetId: attacker.id });
  assert.equal(a.state.me.board[0].power, 4);
  assert.equal(b.state.me.board.length, 0);
  a.send('tcg:end');
  b.send('tcg:end');
  assert.equal(a.state.me.board[0].power, 4);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  a.send('tcg:surrender');
});
