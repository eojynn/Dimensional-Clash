import { playWidth, playHeight } from './table-layout.js';

const holdDelay = 450;
const dragThreshold = 7;

export function mountRulebook({ board, container, point, api, toast, canGrab }) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'rulebook-cover';
  cover.textContent = '룰북';
  cover.title = '드래그로 이동 · 길게 눌러 펼치기';
  cover.disabled = true;
  cover.style.visibility = 'hidden';
  board.append(cover);

  const preview = document.createElement('div');
  preview.className = 'rulebook-preview';
  preview.setAttribute('aria-hidden', 'true');
  const page = new Image();
  page.src = '/rulebook.png';
  page.alt = '차원대충돌 게임 룰북';
  preview.append(page);
  container.append(preview);

  let current, me, gesture, finishing = false, disposed = false;
  function place({ x, y }) {
    cover.style.left = x + 'px';
    cover.style.top = y + 'px';
  }

  function update(book, player) {
    if (!book) return;
    current = book;
    me = player;
    if (gesture && book.holder === me) gesture.observed = true;
    if (gesture?.observed && book.holder !== me) end(false);
    if (!gesture?.moved) place(book);
    cover.style.visibility = 'visible';
    cover.disabled = !!book.holder && book.holder !== me;
    cover.classList.toggle('is-open', book.open);
    cover.setAttribute('aria-expanded', String(book.open));
    preview.classList.toggle('is-open', book.open);
    preview.setAttribute('aria-hidden', String(!book.open));
  }

  function send(action, position = {}) {
    return api('rulebook', { action, ...position });
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
    if (!release) return;
    finishing = true;
    // Wait for the current request so release always closes the same grab.
    held.request.then(() => {
      if (held.acknowledged) return send('release', position);
    }).catch(report).finally(() => { finishing = false; });
  }

  cover.onpointerdown = event => {
    if (!current || gesture || finishing || !canGrab() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = point(event);
    const held = {
      pointerId: event.pointerId, origin, position: { x: current.x, y: current.y },
      offsetX: current.x - origin.x, offsetY: current.y - origin.y,
    };
    gesture = held;
    cover.setPointerCapture(event.pointerId);

    function command(action, position) {
      if (!held.acknowledged || held.busy) return;
      held.busy = true;
      held.request = send(action, position).catch(error => {
        if (gesture === held) end();
        report(error);
      }).finally(() => { held.busy = false; });
    }
    held.command = command;
    const open = () => {
      if (gesture !== held || held.moved || !held.elapsed || !held.acknowledged) return;
      held.opening = true;
      command('open');
    };
    held.request = send('grab').then(() => {
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
      x: Math.max(48, Math.min(playWidth - 48, cursor.x + held.offsetX)),
      y: Math.max(32, Math.min(playHeight - 32, cursor.y + held.offsetY)),
    };
    place(held.position);
    held.command('move', held.position);
  };

  cover.onpointerup = cover.onpointercancel = cover.onlostpointercapture = event => {
    if (gesture?.pointerId === event.pointerId) end();
  };
  const blur = () => end();
  window.addEventListener('blur', blur);

  return {
    get active() { return !!gesture; },
    update,
    dispose() {
      disposed = true;
      end();
      window.removeEventListener('blur', blur);
    },
  };
}
