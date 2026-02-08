export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const randRange = (min, max) => Math.random() * (max - min) + min;

export const randInt = (min, maxInclusive) =>
  Math.floor(Math.random() * (maxInclusive - min + 1)) + min;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
