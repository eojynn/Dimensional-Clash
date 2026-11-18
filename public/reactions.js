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

  function show({ id, kind, name }) {
    if (!Object.hasOwn(reactions, kind)) return;
    const { icon } = reactions[kind];
    const effect = document.createElement('div');
    effect.className = 'table-reaction reaction-' + kind;
    effect.style.setProperty('--lane', ((id % 3) - 1) * 72 + 'px');
    const symbol = document.createElement('span');
    symbol.className = 'reaction-symbol';
    symbol.textContent = icon;
    const label = document.createElement('span');
    label.className = 'reaction-name';
    label.textContent = name;
    effect.append(symbol, label);

    if (kind === 'tomato') {
      const tray = picker.getBoundingClientRect();
      const field = stage.getBoundingClientRect();
      effect.style.setProperty('--throw-x', (tray.left + tray.width / 2 - field.left - field.width / 2) + 'px');
      effect.style.setProperty('--throw-y', (tray.top + tray.height / 2 - field.top - field.height / 2) + 'px');
    }
    if (kind === 'tomato' || kind === 'fireworks') {
      for (let index = 0; index < 8; index++) {
        const spark = document.createElement('i');
        spark.className = 'reaction-particle';
        spark.style.setProperty('--direction', index * 45 + 'deg');
        spark.style.setProperty('--particle-color', kind === 'tomato' ? '#ff594b' :
          ['#ffc96c', '#a7f7cf', '#ed93e4', '#a4b8ff'][index % 4]);
        effect.append(spark);
      }
    }
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
