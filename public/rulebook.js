import { playWidth, playHeight, turnDialSize, maxTurns } from './table-layout.js';

const holdDelay = 450;
const dragThreshold = 7;

export function mountRulebook(options) {
  const { container } = options;
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'rulebook-cover';
  cover.textContent = '룰북';
  cover.title = '드래그로 이동 · 길게 눌러 펼치기';
  const preview = document.createElement('div');
  preview.className = 'rulebook-preview';
  preview.setAttribute('aria-hidden', 'true');
  const page = new Image();
  page.src = '/rulebook.png';
  page.alt = '차원대충돌 게임 룰북';
  preview.append(page);
  container.append(preview);

  return mountPiece(options, {
    cover, kind: 'rulebook', width: 96, height: 64,
    paint(book) {
      cover.classList.toggle('is-open', book.open);
      cover.setAttribute('aria-expanded', String(book.open));
      preview.classList.toggle('is-open', book.open);
      preview.setAttribute('aria-hidden', String(!book.open));
    },
  });
}

export function mountTurnDial(options) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'turn-dial';
  cover.title = '드래그로 이동 · 길게 누른 채 휠로 돌리기';
  cover.style.setProperty('--dial-size', turnDialSize + 'px');
  const art = new Image();
  art.src = '/turn-dial.png';
  art.alt = '';
  const arrow = document.createElement('span');
  arrow.className = 'turn-dial-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  cover.append(art, arrow);

  return mountPiece(options, {
    cover, kind: 'turn-dial', width: turnDialSize, height: turnDialSize, wheel: true,
    paint(dial) {
      arrow.style.rotate = ((maxTurns - dial.turn) * 360 / (maxTurns + 1)) + 'deg';
      cover.classList.toggle('is-adjusting', dial.open);
      cover.setAttribute('aria-label', `남은 턴 돌림판 · ${dial.turn}턴`);
    },
  });
}

function mountPiece({ board, point, api, toast, canGrab }, { cover, kind, width, height, wheel, paint }) {
  cover.disabled = true;
  cover.style.visibility = 'hidden';
  board.append(cover);
  let current, me, round, gesture, finishing = false, disposed = false;
  function place({ x, y }) {
    cover.style.left = x + 'px';
    cover.style.top = y + 'px';
  }

  function update(book, player, tableRound) {
    if (!book) return;
    if (round !== tableRound) end(false);
    round = tableRound;
    current = book;
    me = player;
    if (gesture && book.holder === me) gesture.observed = true;
    if (gesture?.observed && book.holder !== me) end(false);
    if (!gesture?.moved) place(book);
    cover.style.visibility = 'visible';
    cover.disabled = !!book.holder && book.holder !== me;
    paint(gesture?.turn === undefined ? book : { ...book, turn: gesture.turn });
  }

  function send(action, gestureRound, position = {}) {
    return api(kind, { action, round: gestureRound, ...position });
  }

  function report(error) {
    if (!disposed) toast(error.message);
  }

  function end(release = true) {
    if (!gesture) return;
    const held = gesture;
    gesture = null;
    clearTimeout(held.timer);
    clearInterval(held.keep);
    if (cover.hasPointerCapture(held.pointerId)) cover.releasePointerCapture(held.pointerId);
    const position = held.moved ? held.position : {};
    const values = held.turn === undefined ? position : { ...position, turn: held.turn };
    if (!release) return;
    finishing = true;
    // Wait for the current request so release always closes the same grab.
    held.request.then(() => {
      if (held.acknowledged) return send('release', held.round, values);
    }).catch(report).finally(() => { finishing = false; });
  }

  cover.onpointerdown = event => {
    if (!current || gesture || finishing || !canGrab() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = point(event);
    const held = {
      pointerId: event.pointerId, round, origin, position: { x: current.x, y: current.y },
      offsetX: current.x - origin.x, offsetY: current.y - origin.y,
    };
    gesture = held;
    cover.setPointerCapture(event.pointerId);

    function command(action, position) {
      if (!held.acknowledged || held.busy) return;
      held.busy = true;
      held.request = send(action, held.round, position).catch(error => {
        if (gesture === held) end();
        report(error);
      }).finally(() => {
        held.busy = false;
        if (gesture === held && held.pendingTurn) {
          held.pendingTurn = false;
          command('rotate', { turn: held.turn });
        }
      });
    }
    held.command = command;
    const open = () => {
      if (gesture !== held || held.moved || !held.elapsed || !held.acknowledged) return;
      held.opening = true;
      command('open');
    };
    held.request = send('grab', held.round).then(() => {
      held.acknowledged = true;
      if (gesture === held) {
        held.keep = setInterval(() => command('keep'), 1800);
        if (held.moved) command('move', held.position);
        else open();
      }
    }).catch(error => {
      if (gesture === held) {
        end(false);
        place(current);
      }
      report(error);
    });
    held.timer = setTimeout(() => { held.elapsed = true; open(); }, holdDelay);
  };

  cover.onpointermove = event => {
    const held = gesture;
    if (!held || held.pointerId !== event.pointerId || held.opening) return;
    const cursor = point(event);
    if (!held.moved && Math.hypot(cursor.x - held.origin.x, cursor.y - held.origin.y) < dragThreshold) return;
    held.moved = true;
    held.position = {
      x: Math.max(width / 2, Math.min(playWidth - width / 2, cursor.x + held.offsetX)),
      y: Math.max(height / 2, Math.min(playHeight - height / 2, cursor.y + held.offsetY)),
    };
    place(held.position);
    held.command('move', held.position);
  };

  cover.onpointerup = cover.onpointercancel = cover.onlostpointercapture = event => {
    if (gesture?.pointerId === event.pointerId) end();
  };
  function rotate(event) {
    const held = gesture;
    if (!held || !held.opening || !current.open || !event.deltaY) return;
    event.preventDefault();
    const now = performance.now();
    if (held.lastWheel !== undefined && now - held.lastWheel < 100) return;
    held.lastWheel = now;
    const before = held.turn ?? current.turn;
    const turn = Math.max(0, Math.min(maxTurns, before - Math.sign(event.deltaY)));
    if (turn === before) return;
    held.turn = turn;
    paint({ ...current, turn });
    if (held.busy) held.pendingTurn = true;
    else held.command('rotate', { turn });
  }
  if (wheel) board.addEventListener('wheel', rotate, { passive: false });

  const blur = () => end();
  window.addEventListener('blur', blur);

  return {
    get active() { return !!gesture; },
    update,
    dispose() {
      disposed = true;
      end();
      window.removeEventListener('blur', blur);
      if (wheel) board.removeEventListener('wheel', rotate);
    },
  };
}
