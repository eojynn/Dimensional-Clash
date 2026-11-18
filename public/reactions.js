export const reactions = {
  tomato: { icon: '🍅', label: '토마토 던지기' },
  fireworks: { icon: '🎆', label: '폭죽 터뜨리기' },
  tongue: { icon: '😛', label: '메롱' },
  thumbsUp: { icon: '👍', label: '따봉' },
  thumbsDown: { icon: '👎', label: '배드' },
};

export function mountReactions(game, board, api, toast) {
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', '이모티콘 아이템');
  picker.innerHTML = Object.entries(reactions).map(([key, {icon, label}]) =>
    `<button type="button" data-reaction="${key}" title="${label}" aria-label="${label}">${icon}</button>`
  ).join('');

  const stage = document.createElement('div');
  stage.className = 'reaction-stage';
  stage.setAttribute('aria-hidden', 'true');
  game.append(stage, picker);

  let latest = 0;
  let nextSend = 0;
  let gesture;
  let suppressClick = false;

  async function send(kind, position) {
    if (Date.now() < nextSend) return;
    nextSend = Date.now() + 650;
    try {
      await api('reaction', { kind, ...position });
    } catch (error) {
      toast(error.message);
    }
  }

  picker.onclick = event => {
    const button = event.target.closest('button[data-reaction]');
    if (!button || (suppressClick && event.detail > 0)) return;
    send(button.dataset.reaction);
  };

  picker.onpointerdown = event => {
    const button = event.target.closest('button[data-reaction]');
    if (!button || gesture || event.button !== 0) return;
    suppressClick = false;
    gesture = {
      pointerId: event.pointerId,
      kind: button.dataset.reaction,
      startX: event.clientX,
      startY: event.clientY,
    };
    button.setPointerCapture(event.pointerId);
  };

  picker.onpointermove = event => {
    if (gesture?.pointerId !== event.pointerId) return;
    if (!gesture.ghost) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 7) return;
      suppressClick = true;
      gesture.ghost = element('span', 'reaction-drag-ghost', {}, reactions[gesture.kind].icon);
      stage.append(gesture.ghost);
    }
    event.preventDefault();
    const field = stage.getBoundingClientRect();
    gesture.ghost.style.left = event.clientX - field.left + 'px';
    gesture.ghost.style.top = event.clientY - field.top + 'px';
  };

  picker.onpointerup = picker.onpointercancel = picker.onlostpointercapture = event => {
    if (gesture?.pointerId !== event.pointerId) return;
    const { kind, ghost } = gesture;
    gesture = null;
    if (!ghost) return;
    ghost.remove();
    if (event.type !== 'pointerup' ||
        document.elementFromPoint(event.clientX, event.clientY)?.closest('.board') !== board) return;
    const bounds = board.getBoundingClientRect();
    send(kind, {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  };

  function show({ kind, name, x, y }) {
    if (!Object.hasOwn(reactions, kind)) return;
    const effect = element('div', 'table-reaction reaction-' + kind);
    const field = stage.getBoundingClientRect();
    let left = field.width / 2;
    let top = field.height / 2;
    if (x !== undefined && y !== undefined) {
      const bounds = board.getBoundingClientRect();
      left = bounds.left - field.left + x * bounds.width;
      top = bounds.top - field.top + y * bounds.height;
      effect.style.left = left + 'px';
      effect.style.top = top + 'px';
    }
    if (kind === 'tomato') {
      const tray = picker.getBoundingClientRect();
      const origin = {
        '--throw-x': (tray.left + tray.width / 2 - field.left - left) + 'px',
        '--throw-y': (tray.top + tray.height / 2 - field.top - top) + 'px',
      };
      addTomato(effect, origin);
    } else if (kind === 'fireworks') {
      addFireworks(effect);
    } else {
      addFloatingIcons(effect, reactions[kind].icon);
    }

    effect.append(element('span', 'reaction-name', {}, name));
    effect.addEventListener('animationend', event => {
      if (event.target === effect) effect.remove();
    });
    stage.append(effect);
  }

  return events => {
    for (const event of events) {
      if (event.id <= latest) continue;
      latest = event.id;
      show(event);
    }
  };
}

function element(tag, className, style = {}, content = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  for (const [property, value] of Object.entries(style)) node.style.setProperty(property, value);
  return node;
}

function addFloatingIcons(effect, icon) {
  const columns = [-2, 1, -1, 2, 0, -3, 3, 0];
  columns.forEach((column, index) => effect.append(element('span', 'reaction-float', {
    '--drift': column * 28 + 'px',
    '--rise': -115 - (index % 4) * 28 + 'px',
    '--tilt': column * 7 + 'deg',
    '--delay': index * 55 + 'ms',
    '--size': 37 + (index % 3) * 11 + 'px',
  }, icon)));
}

function addTomato(effect, origin) {
  effect.append(element('span', 'tomato-projectile', origin, reactions.tomato.icon));
  effect.append(element('i', 'tomato-splat'));
  for (let index = 0; index < 16; index++) {
    effect.append(element('i', 'tomato-drop', {
      '--direction': index * 22.5 + 'deg',
      '--distance': 49 + (index * 37 % 81) + 'px',
      '--size': 5 + (index * 7 % 18) + 'px',
      '--delay': 420 + (index % 4) * 20 + 'ms',
    }));
  }
}

function addFireworks(effect) {
  const palettes = [['#ffcd62', '#fff2ba', '#ff8d51'], ['#8af6ec', '#c0b5ff', '#f7a2df']];
  for (const [index, colors] of palettes.entries()) {
    const burst = element('div', 'firework', {
      '--x': index === 0 ? '-51px' : '62px',
      '--y': index === 0 ? '-25px' : '-88px',
      '--launch-delay': index * 170 + 'ms',
      '--burst-delay': 450 + index * 170 + 'ms',
      '--flash': colors[0],
    });
    burst.append(element('i', 'firework-rocket'), element('i', 'firework-flash'));
    for (let spark = 0; spark < 24; spark++) {
      burst.append(element('i', 'firework-spark', {
        '--direction': spark * 15 + index * 8 + 'deg',
        '--distance': 48 + (spark * 29 % 62) + 'px',
        '--spark': colors[spark % colors.length],
      }));
    }
    effect.append(burst);
  }
}
