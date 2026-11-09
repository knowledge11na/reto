import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTcgMode } from '../tcgMode.js';
import { STANDARD_DECK } from '../lib/tcgCards.js';

function harness() {
  const sockets = new Map();
  let connect;
  setupTcgMode({
    on: (_event, handler) => { connect = handler; },
    to: (id) => ({
      emit: (event, data) => {
        if (event === 'tcg:state') sockets.get(id).state = data;
      },
    }),
  });
  return (id, roomId, deck, extra = {}) => {
    const handlers = {};
    const socket = {
      id,
      data: {},
      errors: [],
      on: (event, handler) => { handlers[event] = handler; },
      emit: (event, data) => {
        if (event === 'tcg:error') socket.errors.push(data.message);
      },
      send: (event, data) => handlers[event](data),
    };
    sockets.set(id, socket);
    connect(socket);
    socket.send('tcg:join', { roomId, clientId: id, name: id, deck, ...extra });
    return socket;
  };
}

test('mulligan runs once per player before turn order, with handicap hand size preserved', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const join = harness();
  const handicap = { ...STANDARD_DECK, joyboy: 3 };
  for (const id of Object.keys(STANDARD_DECK)) {
    if (handicap[id] >= 3) {
      handicap[id] -= 3;
      break;
    }
  }
  const a = join('a', 'mulligan-test', handicap);
  const b = join('b', 'mulligan-test', STANDARD_DECK);
  assert.equal(a.state.pending.kind, 'mulligan');
  assert.equal(a.state.pending.mine, true);
  assert.equal(b.state.pending.mine, false);
  assert.equal(a.state.first, null);
  assert.equal(a.state.turnNo, 0);
  assert.equal(a.state.me.hand.length, 6);
  assert.equal(a.state.me.hand.some((card) => card.defId === 'joyboy'), false);

  b.send('tcg:mulligan', { redraw: true });
  assert.equal(b.errors.length, 1);
  a.send('tcg:mulligan', { redraw: true });
  assert.equal(a.state.me.hand.length, 6);
  assert.equal(a.state.me.deckCount, 24);
  assert.equal(a.state.me.hand.some((card) => card.defId === 'joyboy'), false);
  assert.equal(b.state.pending.mine, true);
  a.send('tcg:mulligan', { redraw: true });
  assert.equal(a.errors.length, 1);
  const originalHand = b.state.me.hand.map((card) => card.id);
  b.send('tcg:mulligan', { redraw: false });
  assert.deepEqual(b.state.me.hand.map((card) => card.id), originalHand);
  assert.equal(a.state.pending.kind, 'order');
  assert.equal(a.state.turnNo, 0);
  const chooser = a.state.pending.mine ? a : b;
  chooser.send('tcg:order', { first: true });
  assert.equal(a.state.turnNo, 1);
  assert.equal(a.state.current, chooser.state.you);
  a.send('tcg:surrender');
});

test('timeouts keep the hand and allow both players to reach order selection', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const join = harness();
  const a = join('c', 'mulligan-timeout', STANDARD_DECK);
  const b = join('d', 'mulligan-timeout', STANDARD_DECK);
  const aHand = a.state.me.hand.map((card) => card.id);
  const bHand = b.state.me.hand.map((card) => card.id);
  t.mock.timers.tick(31500);
  assert.equal(b.state.pending.mine, true);
  t.mock.timers.tick(31500);
  assert.equal(a.state.pending.kind, 'order');
  assert.deepEqual(a.state.me.hand.map((card) => card.id), aHand);
  assert.deepEqual(b.state.me.hand.map((card) => card.id), bHand);
  a.send('tcg:surrender');
});

test('solo CPU completes its mulligan and reaches order selection', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const join = harness();
  const human = join('human', 'solo-mulligan-test', STANDARD_DECK, { solo: true });
  human.send('tcg:mulligan', { redraw: false });
  assert.equal(human.state.pending.kind, 'mulligan');
  assert.equal(human.state.pending.mine, false);
  t.mock.timers.tick(800);
  assert.equal(human.state.pending.kind, 'order');
  assert.equal(human.state.turnNo, 0);
  human.send('tcg:surrender');
});
