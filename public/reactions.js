export const reactions = {
  tomato: { icon: '🍅', label: '토마토 던지기' },
  fireworks: { icon: '🎆', label: '폭죽 터뜨리기' },
  tongue: { icon: '😛', label: '메롱' },
  thumbsUp: { icon: '👍', label: '따봉' },
  thumbsDown: { icon: '👎', label: '배드' },
};

export function mountReactions(game, api, toast) {
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
  picker.onclick = async event => {
    const button = event.target.closest('button[data-reaction]');
    if (!button || Date.now() < nextSend) return;
    nextSend = Date.now() + 650;
    try {
      await api('reaction', { kind: button.dataset.reaction });
    } catch (error) {
      toast(error.message);
    }
  };

  function show({ kind, name }) {
    if (!Object.hasOwn(reactions, kind)) return;
    const effect = element('div', 'table-reaction reaction-' + kind);
    if (kind === 'tomato') {
      const tray = picker.getBoundingClientRect();
      const field = stage.getBoundingClientRect();
      const origin = {
        '--throw-x': (tray.left + tray.width / 2 - field.left - field.width / 2) + 'px',
        '--throw-y': (tray.top + tray.height / 2 - field.top - field.height / 2) + 'px',
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
