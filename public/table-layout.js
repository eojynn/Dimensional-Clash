export const boardWidth = 1350;
export const boardHeight = 880;
export const boardBorder = 10;
export const playWidth = boardWidth - 2 * boardBorder;
export const playHeight = boardHeight - 2 * boardBorder;
export const cardWidth = 108;
export const cardHeight = 150;
export const turnDialSize = 148;
export const maxTurns = 10;

const seatPositions = [
  { x: 260, y: 30, w: 260, h: 150 },
  { x: boardWidth - 520, y: 30, w: 260, h: 150 },
  { x: boardWidth - 180, y: (boardHeight - 270) / 2, w: 150, h: 270 },
  { x: boardWidth - 520, y: boardHeight - 180, w: 260, h: 150 },
  { x: 260, y: boardHeight - 180, w: 260, h: 150 },
  { x: 30, y: (boardHeight - 270) / 2, w: 150, h: 270 },
];

const zoneScale = Math.sqrt(1.5);
const edgeInset = 10;

export const zones = seatPositions.map(original => {
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

export function seatAt(x, y) {
  return zones.findIndex(zone =>
    x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h);
}
