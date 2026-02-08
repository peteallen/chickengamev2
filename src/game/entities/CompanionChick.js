import { clamp, randRange } from "../core/math.js";

export class CompanionChick {
  constructor({ u, v, penSpace }) {
    this.penSpace = penSpace;
    this.u = clamp(u, 0.08, 0.92);
    this.v = clamp(v, 0.14, 0.93);

    this.x = 0;
    this.y = 0;
    this.groundY = 0;
    this.visualScale = 1;

    this.vu = 0;
    this.vv = 0;
    this.vx = 0;

    this.offsetU = randRange(-0.12, 0.12);
    this.offsetV = randRange(0.02, 0.1);
    this.time = Math.random() * 10;

    this.project();
  }

  project() {
    const p = this.penSpace.toScreen(this.u, this.v);
    this.x = p.x;
    this.groundY = p.y;
    this.visualScale = this.penSpace.depthScale(this.v);
    this.y = this.groundY + Math.sin(this.time * 10 + this.u * 15) * 1.5;
  }

  update(dt, leader) {
    this.time += dt;

    const targetU = clamp(
      leader.u + this.offsetU + Math.sin(this.time * 1.35) * 0.03,
      0.08,
      0.92,
    );
    const targetV = clamp(
      leader.v + this.offsetV + Math.sin(this.time * 1.8 + this.offsetU * 14) * 0.015,
      0.14,
      0.93,
    );

    this.vu += (targetU - this.u) * 8.2 * dt;
    this.vv += (targetV - this.v) * 8.2 * dt;
    this.vu *= 0.88;
    this.vv *= 0.88;

    this.u = clamp(this.u + this.vu, 0.08, 0.92);
    this.v = clamp(this.v + this.vv, 0.14, 0.93);

    const prevX = this.x;
    this.project();
    this.vx = this.x - prevX;
  }

  draw(ctx, sprite) {
    const width = 78 * this.visualScale;
    const height = 86 * this.visualScale;
    const shadowW = 24 * this.visualScale;
    const shadowH = 7 * this.visualScale;

    ctx.save();
    ctx.translate(this.x, this.y - 9 * this.visualScale);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 40 * this.visualScale, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();

    const facing = this.vx >= 0 ? 1 : -1;
    ctx.scale(facing, 1);
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height);

    ctx.restore();
  }
}

