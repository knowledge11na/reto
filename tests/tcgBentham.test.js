import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTcgMode } from '../tcgMode.js';
import { CARD_DEFS, EXPANSION_1_CARDS } from '../lib/tcgCards.js';
import { makeTagQuestion } from '../lib/tcgTagQuestions.js';

let matchSequence = 0;

function createMatch(t, opponentCard) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0.999999);
  const sockets = new Map();
  const tags = [];
  const roomId = `bentham-${++matchSequence}`;
  let connect;
  setupTcgMode({
    on: (_event, handler) => { connect = handler; },
    to: (id) => ({ emit: (event, data) => {
      if (event === 'tcg:state') sockets.get(id).state = data;
    } }),
  }, {
    questionLoader: async (tag) => {
      tags.push(tag);
      return makeTagQuestion({ type: 'text', question: 'test', correct_answer: 'ok' }, tag);
    },
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
    socket.send('tcg:join', { roomId, clientId: id, name: id, deck: cards });
    return socket;
  }
  const player = join('a', deck('bentham'));
  const opponent = join('b', deck(opponentCard));
  player.send('tcg:mulligan', { redraw: false });
  opponent.send('tcg:mulligan', { redraw: false });
  const chooser = player.state.pending.mine ? player : opponent;
  chooser.send('tcg:order', { first: chooser === player });
  for (let i = 0; i < 4; i++) {
    player.send('tcg:end');
    opponent.send('tcg:end');
  }
  const bentham = player.state.me.hand.find((card) => card.defId === 'bentham');
  player.send('tcg:play', { cardId: bentham.id, slot: 0 });
  player.send('tcg:end');
  const source = opponent.state.me.hand.find((card) => card.defId === opponentCard);
  opponent.send('tcg:play', { cardId: source.id, slot: 0 });
  opponent.send('tcg:end');
  return { player, opponent, bentham, source, tags };
}

test('Bentham and renamed cards appear in the expansion', () => {
  assert.equal(CARD_DEFS.bentham.cost, 4);
  assert.equal(CARD_DEFS.bentham.power, 2);
  assert.ok(EXPANSION_1_CARDS.includes('bentham'));
  assert.equal(CARD_DEFS.kuma.name, 'バーソロミュー・くま');
  assert.equal(CARD_DEFS.orochi.name, '黒炭オロチ');
});

test('Bentham copies an enemy activated effect onto himself before the attack resolves', async (t) => {
  const { player, opponent, bentham, source, tags } = createMatch(t, 'coffeeMonkeys');
  player.send('tcg:attack', { attackerId: bentham.id, target: 'player' });
  await Promise.resolve();
  assert.equal(player.state.pending.genre, 'タグ【インペルダウン】');
  player.send('tcg:answer', { text: 'ok' });
  assert.deepEqual(player.state.pending.options, [source.id]);
  player.send('tcg:choose', { targetId: source.id });
  await Promise.resolve();
  assert.deepEqual(tags, ['インペルダウン', 'シャボンディ諸島']);
  assert.equal(player.state.opp.lifeHp, 10);
  player.send('tcg:answer', { text: 'ok' });
  assert.equal(player.state.me.board[0].rested, false);
  assert.equal(player.state.opp.lifeHp, 8);
  assert.equal(opponent.state.me.board[0].rested, false);
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});

test('Bentham can select an attack effect from a card with both effects and fails on a wrong answer', async (t) => {
  const { player, bentham, source } = createMatch(t, 'shiki');
  player.send('tcg:attack', { attackerId: bentham.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  player.send('tcg:choose', { targetId: source.id });
  assert.equal(player.state.pending.kind, 'effectChoice');
  assert.deepEqual(player.state.pending.options.map((option) => option.id), ['attack', 'active']);
  player.send('tcg:effect-choice', { choice: 'attack' });
  assert.equal(player.state.pending.kind, 'quiz');
  player.send('tcg:answer', { text: 'not correct' });
  player.send('tcg:answer', { text: 'not correct' });
  assert.equal(player.state.pending, null);
  assert.equal(player.state.opp.lifeHp, 10);
  assert.equal(player.state.me.board[0].defId, 'bentham');
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});

test('Bentham ignores a rest cost when copying an activated effect', async (t) => {
  const { player, bentham, source } = createMatch(t, 'sbAntonio');
  player.send('tcg:attack', { attackerId: bentham.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  player.send('tcg:choose', { targetId: source.id });
  assert.equal(player.state.pending.kind, 'quiz');
  assert.equal(player.state.pending.genre, '何年前');
  player.send('tcg:answer', { text: 'wrong' });
  assert.equal(player.state.opp.lifeHp, 8);
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});

test('Bentham can select the activated effect of a card with two effects', async (t) => {
  const { player, bentham, source } = createMatch(t, 'shiki');
  player.send('tcg:attack', { attackerId: bentham.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  player.send('tcg:choose', { targetId: source.id });
  player.send('tcg:effect-choice', { choice: 'active' });
  assert.equal(player.state.pending.genre, '間の技');
  player.send('tcg:answer', { text: 'wrong' });
  assert.equal(player.state.pending, null);
  assert.equal(player.state.opp.lifeHp, 8);
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});

test('Bentham cannot copy a transforming activated effect', async (t) => {
  const { player, bentham } = createMatch(t, 'bellet');
  player.send('tcg:attack', { attackerId: bentham.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  assert.equal(player.state.pending, null);
  assert.equal(player.state.opp.lifeHp, 8);
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});

test('Bentham cannot copy an unrestricted activated effect', async (t) => {
  const { player, bentham } = createMatch(t, 'beloBetty');
  player.send('tcg:attack', { attackerId: bentham.id, target: 'player' });
  await Promise.resolve();
  player.send('tcg:answer', { text: 'ok' });
  assert.equal(player.state.pending, null);
  assert.equal(player.state.opp.lifeHp, 8);
  assert.deepEqual(player.errors, []);
  player.send('tcg:surrender');
});
