export const boardWidth = 1100;
export const boardHeight = 750;
export const boardBorder = 10;
export const playWidth = boardWidth - 2 * boardBorder;
export const playHeight = boardHeight - 2 * boardBorder;
export const cardWidth = 108;
export const cardHeight = 150;
export const turnDialSize = 148;
export const maxTurns = 10;

const originalZones = [
  { x: 260, y: 30, w: 260, h: 150 },
  { x: 580, y: 30, w: 260, h: 150 },
  { x: 920, y: 240, w: 150, h: 270 },
  { x: 580, y: 570, w: 260, h: 150 },
  { x: 260, y: 570, w: 260, h: 150 },
  { x: 30, y: 240, w: 150, h: 270 },
];

const zoneScale = Math.sqrt(1.5);
const edgeInset = 10;

export const zones = originalZones.map(original => {
  const w = Math.round(original.w * zoneScale);
  const h = Math.round(original.h * zoneScale);
  const x = Math.round(original.x - (w - original.w) / 2);
  const y = Math.round(original.y - (h - original.h) / 2);
  return {
    x: Math.max(edgeInset, Math.min(x, playWidth - w - edgeInset)),
    y: Math.max(edgeInset, Math.min(y, playHeight - h - edgeInset)),
    w,
    h,
  };
});
