export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const randRange = (min, max) => Math.random() * (max - min) + min;

export const randInt = (min, maxInclusive) =>
  Math.floor(Math.random() * (maxInclusive - min + 1)) + min;

export const pick = (items) => items[Math.floor(Math.random() * items.length)];

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const distance = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
};

export const angleBetween = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
