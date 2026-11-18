export const boardWidth = 1600;
export const boardHeight = 750;
export const boardBorder = 10;
export const playWidth = boardWidth - 2 * boardBorder;
export const playHeight = boardHeight - 2 * boardBorder;
export const cardWidth = 108;
export const cardHeight = 150;

const zoneWidth = 688;
const zoneHeight = 190;
const left = 28;
const right = playWidth - left - zoneWidth;
const top = 26;
const middle = (playHeight - zoneHeight) / 2;
const bottom = playHeight - top - zoneHeight;

export const zones = [
  { x: left, y: top },
  { x: right, y: top },
  { x: right, y: middle },
  { x: right, y: bottom },
  { x: left, y: bottom },
  { x: left, y: middle },
].map(position => ({ ...position, w: zoneWidth, h: zoneHeight }));
