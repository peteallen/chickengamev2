import { clamp, randRange } from "../core/math.js";

const createFallbackPenSpace = () => ({
  toScreen(u, v) {
    return {
      x: 800 + (clamp(u, 0, 1) - 0.5) * 780,
      y: 560 + clamp(v, 0, 1) * 180,
    };
  },
  fromScreen(x, y) {
    return {
      u: clamp((x - 410) / 780, 0, 1),
      v: clamp((y - 560) / 180, 0, 1),
    };
  },
  depthScale(v) {
    return 0.9 + clamp(v, 0, 1) * 0.2;
  },
});

export class Chicken {
  constructor({ u, v, penSpace }) {
    this.penSpace = penSpace || createFallbackPenSpace();

    this.u = clamp(u, 0.08, 0.92);
    this.v = clamp(v, 0.14, 0.92);
    this.targetU = this.u;
    this.targetV = this.v;

    this.x = 0;
    this.y = 0;
    this.groundY = 0;
    this.visualScale = 1;

    this.dir = 1;
    this.walkSpeed = 0.3; // Pen-space units/sec.
    this.bob = 0;
    this.time = 0;
    this.swing = 0;
    this.wanderTimer = randRange(0.4, 1.3);

    this.controller = null;
    this.controllerName = "";

    this.cluckTimer = randRange(1.6, 3.8);
    this.poseScale = 1;
    this.jetpackVisible = false;

    this.projectFromUV();
  }

  setPenSpace(penSpace) {
    this.penSpace = penSpace || this.penSpace || createFallbackPenSpace();
    this.projectFromUV();
  }

  setController(name, fn) {
    this.controllerName = name;
    this.controller = fn;
  }

  clearController(name = "") {
    if (!this.controller) return;
    if (!name || this.controllerName === name) {
      this.controller = null;
      this.controllerName = "";
      this.projectFromUV();
      this.y = this.groundY;
    }
  }

  projectFromUV() {
    const p = this.penSpace.toScreen(this.u, this.v);
    this.x = p.x;
    this.groundY = p.y;
    this.visualScale = this.penSpace.depthScale(this.v);
  }

  chooseNewTarget() {
    this.targetU = clamp(randRange(0.1, 0.9), 0.08, 0.92);
    this.targetV = clamp(randRange(0.18, 0.9), 0.14, 0.92);
    this.wanderTimer = randRange(1.4, 3.1);
  }

  update(dt, game) {
    this.time += dt;

    let handled = false;
    if (this.controller) {
      const prevGroundY = this.groundY;
      handled = this.controller(dt, game, this) === true;
      if (handled) {
        // Keep jumps/arcs from controller motion from pulling depth around.
        const uv = this.penSpace.fromScreen(this.x, prevGroundY);
        this.u = uv.u;
        this.v = uv.v;
        const projected = this.penSpace.toScreen(this.u, this.v);
        this.groundY = projected.y;
        this.visualScale = this.penSpace.depthScale(this.v);
      }
    }

    if (!handled) {
      this.updateStrut(dt);
    }

    this.cluckTimer -= dt;
    if (this.cluckTimer <= 0) {
      game.sound.cluck();
      this.cluckTimer = randRange(1.9, 4.9);
    }

    this.swing = Math.sin(this.time * (8.8 + this.visualScale * 2.2)) * 0.05;
  }

  updateStrut(dt) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.chooseNewTarget();
    }

    const du = this.targetU - this.u;
    const dv = this.targetV - this.v;
    const mag = Math.hypot(du, dv);

    if (mag < 0.01) {
      this.chooseNewTarget();
    } else {
      const step = Math.min(mag, this.walkSpeed * dt);
      const prevX = this.x;
      this.u = clamp(this.u + (du / mag) * step, 0.08, 0.92);
      this.v = clamp(this.v + (dv / mag) * step, 0.14, 0.92);
      this.projectFromUV();
      this.dir = this.x >= prevX ? 1 : -1;
    }

    this.bob = Math.sin(this.time * 10 + this.u * 12 + this.v * 5) * (2 + this.visualScale * 2);
    this.y = this.groundY + this.bob;
  }

  containsPoint(worldX, worldY) {
    const width = 120 * this.visualScale * this.poseScale;
    const height = 108 * this.visualScale * this.poseScale;
    const dx = (worldX - this.x) / width;
    const dy = (worldY - (this.y - 20 * this.visualScale)) / height;
    return dx * dx + dy * dy <= 1;
  }

  draw(ctx, sprite) {
    const size = 224 * this.visualScale * this.poseScale;
    const drawX = this.x;
    const drawY = this.y - 62 * this.visualScale;
    const shadowW = 66 * this.visualScale;
    const shadowH = 17 * this.visualScale;

    ctx.save();
    ctx.translate(drawX, drawY);

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 106 * this.visualScale, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(this.swing * this.dir);
    ctx.scale(this.dir, 1);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);

    ctx.restore();
  }
}
