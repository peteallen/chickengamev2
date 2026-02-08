import { clamp, lerp } from "./math.js";

const pointInTriangle = (p, a, b, c) => {
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = p.x - a.x;
  const v2y = p.y - a.y;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-6) return false;
  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
};

export class PenSpace {
  constructor({ x, y, w, h, skew = 120 }) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.skew = skew;
    this.recompute();
  }

  recompute() {
    this.backLeft = { x: this.x + this.skew, y: this.y };
    this.backRight = { x: this.x + this.w - this.skew, y: this.y };
    this.frontLeft = { x: this.x, y: this.y + this.h };
    this.frontRight = { x: this.x + this.w, y: this.y + this.h };

    this.anchors = {
      center: this.toScreen(0.5, 0.5),
      frontCenter: this.toScreen(0.5, 0.92),
      backCenter: this.toScreen(0.5, 0.1),
      leftCenter: this.toScreen(0.08, 0.56),
      rightCenter: this.toScreen(0.92, 0.56),
    };
  }

  depthScale(v) {
    return lerp(0.84, 1.1, clamp(v, 0, 1));
  }

  toScreen(u, v) {
    const uu = clamp(u, 0, 1);
    const vv = clamp(v, 0, 1);
    const leftX = lerp(this.backLeft.x, this.frontLeft.x, vv);
    const leftY = lerp(this.backLeft.y, this.frontLeft.y, vv);
    const rightX = lerp(this.backRight.x, this.frontRight.x, vv);
    const rightY = lerp(this.backRight.y, this.frontRight.y, vv);
    return {
      x: lerp(leftX, rightX, uu),
      y: lerp(leftY, rightY, uu),
    };
  }

  fromScreen(x, y) {
    // Approximate inverse by solving v from y then u from interpolated edge.
    const avgBackY = (this.backLeft.y + this.backRight.y) * 0.5;
    const avgFrontY = (this.frontLeft.y + this.frontRight.y) * 0.5;
    const v = clamp((y - avgBackY) / Math.max(1, avgFrontY - avgBackY), 0, 1);
    const leftX = lerp(this.backLeft.x, this.frontLeft.x, v);
    const rightX = lerp(this.backRight.x, this.frontRight.x, v);
    const u = clamp((x - leftX) / Math.max(1, rightX - leftX), 0, 1);
    return { u, v };
  }

  containsPoint(x, y) {
    const p = { x, y };
    const c0 = this.backLeft;
    const c1 = this.backRight;
    const c2 = this.frontRight;
    const c3 = this.frontLeft;
    return pointInTriangle(p, c0, c1, c2) || pointInTriangle(p, c0, c2, c3);
  }

  edgePoint(side, t) {
    const tt = clamp(t, 0, 1);
    if (side === "back") return this.toScreen(tt, 0);
    if (side === "front") return this.toScreen(tt, 1);
    if (side === "left") return this.toScreen(0, tt);
    return this.toScreen(1, tt);
  }
}
