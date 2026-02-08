import { clamp, easeOutCubic, randInt, randRange } from "../core/math.js";

class GameAction {
  constructor({ id, duration = 5, major = false }) {
    this.id = id;
    this.duration = duration;
    this.major = major;
    this.elapsed = 0;
    this.finished = false;
  }

  start(_game) {}

  update(dt, game) {
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.finish(game);
    }
  }

  drawBack(_ctx, _game) {}

  drawFront(_ctx, _game) {}

  drawOverlay(_ctx, _game) {}

  onFinish(_game) {}

  finish(game) {
    if (this.finished) return;
    this.finished = true;
    this.onFinish(game);
  }

  cancel(game) {
    this.finish(game);
  }
}

const drawSprite = (ctx, sprite, x, y, width, height, { flipX = false, rotation = 0, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(flipX ? -1 : 1, 1);
  ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
  ctx.restore();
};

const updateParticles = (particles, dt, gravity = 0) => {
  // In-place update + compaction (avoids O(n^2) splice cost when arrays get large).
  let write = 0;
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    particle.vx *= 0.995;
    particle.vy += gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.life > 0) {
      particles[write] = particle;
      write += 1;
    }
  }
  particles.length = write;
};

class FireworksAction extends GameAction {
  constructor() {
    super({ id: "fireworks", duration: 5.2, major: false });
    this.rockets = [];
    this.stars = [];
    this.sparks = [];
    this.flashes = [];
    this.spawnTimer = 0;
    this.focusX = 800;
    this.focusY = 240;
    this.lastBurstX = this.focusX;
    this.lastBurstY = this.focusY;

    this.quality = 1;
    this.sizeBoost = 1;
    this.maxSparks = 700;
    this.maxStars = 220;
    this.maxRockets = 3;
    this.maxFlashes = 6;

    this.skyGradient = null;
    this.skyGradientH = 0;
  }

  start(game) {
    const dpr = game.view?.dpr || 1;
    const pxW = game.view?.width || game.world.width;
    const pxH = game.view?.height || game.world.height;
    const pixels = pxW * pxH * dpr * dpr;
    const baseline = game.world.width * game.world.height;

    this.quality = clamp(Math.sqrt(baseline / Math.max(baseline, pixels)), 0.45, 1);
    this.sizeBoost = clamp(1 / Math.sqrt(this.quality), 1, 1.25);
    this.maxSparks = Math.round(700 * this.quality);
    this.maxStars = Math.round(220 * this.quality);
    this.maxRockets = Math.max(1, Math.round(3 * this.quality));
    this.maxFlashes = Math.max(2, Math.round(6 * this.quality));

    this.launchRocket(game);
  }

  duskT() {
    const duskIn = Math.min(1, this.elapsed / 0.6);
    const duskOut = this.elapsed > this.duration - 0.6 ? Math.max(0, (this.duration - this.elapsed) / 0.6) : 1;
    return Math.min(duskIn, duskOut);
  }

  launchRocket(game) {
    if (this.rockets.length >= this.maxRockets) return;

    const x = randRange(220, game.world.width - 220);
    const groundY = game.terrainYAt(x);
    const startY = clamp(groundY + 8, game.world.height * 0.56, game.world.height - 8);

    const targetY = randRange(90, game.world.height * 0.46);
    const g = 520;
    const flightT = randRange(0.9, 1.25);
    const vy = (targetY - startY - 0.5 * g * flightT * flightT) / flightT;

    const hue = randInt(0, 359);
    const core = `hsla(${hue}, 100%, 82%, 1)`;
    this.rockets.push({
      x,
      y: startY,
      vx: randRange(-40, 40),
      vy,
      life: flightT + 0.4,
      fuse: flightT,
      hue,
      core,
      sparkTimer: 0,
    });
    this.focusX = x;
    this.focusY = targetY;
  }

  explode(game, rocket) {
    const x = rocket.x;
    const y = rocket.y;
    const baseHue = rocket.hue;

    this.lastBurstX = x;
    this.lastBurstY = y;
    this.focusX = x;
    this.focusY = y;

    if (this.flashes.length < this.maxFlashes) {
      this.flashes.push({
        x,
        y,
        life: 0.22,
        size: randRange(26, 44),
      });
    }

    const baseCount = randInt(56, 78);
    let count = Math.max(28, Math.round(baseCount * this.quality));
    const availableStars = this.maxStars - this.stars.length;
    if (availableStars <= 0) {
      count = 0;
    } else {
      count = Math.min(count, availableStars);
    }
    for (let i = 0; i < count; i += 1) {
      const angle = randRange(0, Math.PI * 2);
      const spread = Math.pow(Math.random(), 0.55);
      const speed = (170 + spread * 430) * randRange(0.9, 1.08);
      const hue = (baseHue + randRange(-28, 28) + (Math.random() < 0.22 ? 180 : 0) + 360) % 360;
      const color = `hsla(${hue}, 100%, 70%, 1)`;
      this.stars.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: randRange(1.0, 1.75),
        size: randRange(1.6, 3.2) * this.sizeBoost,
        hue,
        color,
        sparkleTimer: randRange(0, 0.12) / this.quality,
      });
    }

    // Warm, quick glitter at the burst origin for a more "real" pop.
    for (let i = 0; i < 24; i += 1) {
      if (this.sparks.length >= this.maxSparks) break;
      const angle = randRange(0, Math.PI * 2);
      const speed = randRange(40, 210);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: randRange(0.18, 0.42),
        size: randRange(1.2, 2.6) * this.sizeBoost,
        color: `hsla(${baseHue}, 100%, 86%, 1)`,
      });
    }

    game.sound.fireworkBurst();
  }

  update(dt, game) {
    this.elapsed += dt;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.elapsed < this.duration - 1.25) {
      if (this.rockets.length < this.maxRockets) {
        this.spawnTimer = randRange(0.55, 0.9);
        this.launchRocket(game);
      } else {
        // Recheck soon without spamming new rockets.
        this.spawnTimer = 0.08;
      }
    }

    const rocketGravity = 520;
    const starGravity = 240;

    for (const rocket of this.rockets) {
      rocket.vx *= 0.996;
      rocket.vy += rocketGravity * dt;
      rocket.x += rocket.vx * dt;
      rocket.y += rocket.vy * dt;
      rocket.life -= dt;
      rocket.fuse -= dt;

      rocket.sparkTimer -= dt;
      if (rocket.sparkTimer <= 0) {
        rocket.sparkTimer = randRange(0.02, 0.06) / this.quality;
        if (this.sparks.length < this.maxSparks) {
          this.sparks.push({
            x: rocket.x + randRange(-1.6, 1.6),
            y: rocket.y + randRange(-1.6, 1.6),
            vx: randRange(-40, 40),
            vy: randRange(80, 220),
            life: randRange(0.12, 0.28),
            size: randRange(1.1, 2.2) * this.sizeBoost,
            color: "rgba(255, 243, 210, 1)",
          });
        }
      }
    }

    for (let i = this.rockets.length - 1; i >= 0; i -= 1) {
      const rocket = this.rockets[i];
      if (rocket.fuse <= 0 || rocket.life <= 0 || rocket.y <= 60) {
        this.rockets.splice(i, 1);
        if (rocket.y > 70 && rocket.y < game.world.height * 0.62) {
          this.explode(game, rocket);
        }
      }
    }

    for (const star of this.stars) {
      star.vx *= 0.993;
      star.vy *= 0.993;
      star.vy += starGravity * dt;
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      star.life -= dt;

      // Emit a tiny sparkle trail so the burst reads as "stars" instead of confetti dots.
      star.sparkleTimer -= dt;
      if (star.sparkleTimer <= 0 && star.life > 0.15) {
        star.sparkleTimer = randRange(0.06, 0.16) / this.quality;
        if (this.sparks.length < this.maxSparks) {
          this.sparks.push({
            x: star.x + randRange(-1, 1),
            y: star.y + randRange(-1, 1),
            vx: star.vx * 0.12 + randRange(-40, 40),
            vy: star.vy * 0.12 + randRange(-10, 60),
            life: randRange(0.12, 0.32),
            size: randRange(1.0, 2.0) * this.sizeBoost,
            color: `hsla(${star.hue}, 100%, 82%, 1)`,
          });
        }
      }
    }

    let starWrite = 0;
    for (let i = 0; i < this.stars.length; i += 1) {
      const star = this.stars[i];
      if (star.life > 0) {
        this.stars[starWrite] = star;
        starWrite += 1;
      }
    }
    this.stars.length = starWrite;

    updateParticles(this.sparks, dt, 260);

    for (const flash of this.flashes) {
      flash.life -= dt;
      flash.size += dt * 220;
    }
    let flashWrite = 0;
    for (let i = 0; i < this.flashes.length; i += 1) {
      const flash = this.flashes[i];
      if (flash.life > 0) {
        this.flashes[flashWrite] = flash;
        flashWrite += 1;
      }
    }
    this.flashes.length = flashWrite;

    if (this.elapsed >= this.duration && this.rockets.length === 0 && this.stars.length === 0 && this.sparks.length === 0) {
      this.finish(game);
      return;
    }

    // Failsafe so the action can't linger forever if a particle ever misbehaves.
    if (this.elapsed >= this.duration + 1.6) {
      this.finish(game);
    }
  }

  drawBack(ctx, game) {
    const t = this.duskT();

    // Make the sky go properly dark before drawing bright fireworks.
    if (t > 0.01) {
      const skyH = game.world.height * 0.66;
      if (!this.skyGradient || this.skyGradientH !== skyH) {
        this.skyGradient = ctx.createLinearGradient(0, 0, 0, skyH);
        this.skyGradient.addColorStop(0, "rgba(1, 2, 8, 0.88)");
        this.skyGradient.addColorStop(0.55, "rgba(3, 8, 24, 0.74)");
        this.skyGradient.addColorStop(1, "rgba(0, 0, 0, 0.34)");
        this.skyGradientH = skyH;
      }

      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = this.skyGradient;
      ctx.fillRect(0, 0, game.world.width, skyH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // Burst flash.
    ctx.fillStyle = "rgba(255, 255, 235, 1)";
    ctx.shadowColor = "rgba(255, 255, 235, 1)";
    ctx.shadowBlur = 28;
    for (const flash of this.flashes) {
      const a = clamp(flash.life / 0.22, 0, 1);
      ctx.globalAlpha = 0.85 * a;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, flash.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars (colored).
    ctx.shadowBlur = 18;
    for (const star of this.stars) {
      const a = clamp(star.life / 1.1, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = star.color;
      ctx.shadowColor = star.color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sparks (rocket glitter + twinkle).
    ctx.shadowBlur = 12;
    for (const spark of this.sparks) {
      const a = clamp(spark.life * 3.2, 0, 1);
      if (a <= 0.001) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = spark.color;
      ctx.shadowColor = spark.color;
      const r = spark.size;
      ctx.fillRect(spark.x - r, spark.y - r, r * 2, r * 2);
    }

    // Rocket heads (sparkling balls) last so they read cleanly on top of their trails.
    for (const rocket of this.rockets) {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 26;
      ctx.fillStyle = rocket.core;
      ctx.shadowColor = rocket.core;
      ctx.beginPath();
      ctx.arc(rocket.x, rocket.y, 4.6, 0, Math.PI * 2);
      ctx.fill();

      // Tiny flicker sparkle around the rocket head.
      const n = 6;
      for (let i = 0; i < n; i += 1) {
        const ang = (i / n) * Math.PI * 2 + this.elapsed * 14.0;
        const r = 7 + Math.sin(this.elapsed * 22 + i) * 2;
        ctx.globalAlpha = 0.55;
        ctx.shadowBlur = 18;
        ctx.fillStyle = "rgba(255, 252, 235, 1)";
        ctx.shadowColor = "rgba(255, 252, 235, 1)";
        ctx.beginPath();
        ctx.arc(rocket.x + Math.cos(ang) * r, rocket.y + Math.sin(ang) * r, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  getCinematicCue() {
    const t = this.duskT();
    return {
      priority: 10,
      focusX: this.focusX,
      focusY: this.focusY,
      zoom: 1.06,
      vignette: 0.46 * t,
      nightBlend: t,
      ambienceDuck: 0.32 * t,
    };
  }
}

class JetpackAction extends GameAction {
  constructor() {
    super({ id: "jetpack", duration: 8.2, major: true });
    this.flames = [];
    this.phase = randRange(0, Math.PI * 2);
    this.baseX = 0;
    this.baseY = 0;
    this.centerX = 0;
    this.centerY = 0;
  }

  start(game) {
    game.sound.jetpackStart();
    this.baseX = game.chicken.x;
    this.baseY = game.chicken.y;
    this.centerX = game.penSpace.anchors.center.x;
    this.centerY = game.penSpace.anchors.center.y - 42;

    game.chicken.jetpackVisible = true;
    game.chicken.setController("jetpack", (dt, g, chicken) => {
      const intro = 0.75;
      const outro = 1;

      if (this.elapsed < intro) {
        const t = this.elapsed / intro;
        chicken.x += (this.baseX - chicken.x) * Math.min(1, dt * 8);
        chicken.y = this.baseY + Math.sin(this.elapsed * 11.5) * (2 + t * 2);
        chicken.dir = 1;
      } else if (this.elapsed < this.duration - outro) {
        this.phase += dt * 1.5;
        chicken.x = this.centerX + Math.cos(this.phase * 1.24) * (g.pen.w * 0.31);
        chicken.y = this.centerY + Math.sin(this.phase * 1.72) * 86;
        chicken.dir = Math.cos(this.phase * 1.24) >= 0 ? 1 : -1;
      } else {
        const settleX = this.baseX;
        const settleY = this.baseY + Math.sin(this.elapsed * 7) * 1.6;
        chicken.x += (settleX - chicken.x) * Math.min(1, dt * 4.8);
        chicken.y += (settleY - chicken.y) * Math.min(1, dt * 5.4);
        chicken.dir = settleX >= chicken.x ? 1 : -1;
      }

      if (this.elapsed >= intro - 0.15 && this.elapsed < this.duration - 0.2) {
        const flameX = chicken.x - chicken.dir * 64;
        const flameY = chicken.y + 56;
        this.flames.push({
          x: flameX + randRange(-8, 8),
          y: flameY,
          vx: randRange(-18, 18),
          vy: randRange(130, 230),
          life: randRange(0.22, 0.45),
          size: randRange(6, 14),
          color: Math.random() > 0.4 ? "#ff9335" : "#ffe571",
        });
      }

      return true;
    });
  }

  update(dt, game) {
    super.update(dt, game);
    updateParticles(this.flames, dt, 190);
  }

  drawFront(ctx, game) {
    const chickenJetpack = game.assets.get("chickenJetpack");
    const chicken = game.chicken;

    drawSprite(ctx, chickenJetpack, chicken.x, chicken.y - 22, 254, 254, {
      flipX: chicken.dir < 0,
      rotation: Math.sin(this.elapsed * 8) * 0.025,
    });

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const flame of this.flames) {
      const alpha = Math.max(0, flame.life * 2.2);
      ctx.fillStyle = flame.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(flame.x, flame.y, flame.size * 0.65, flame.size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  onFinish(game) {
    game.chicken.jetpackVisible = false;
    game.chicken.clearController("jetpack");
    game.sound.jetpackStop();
  }

  shouldHideChicken() {
    return true;
  }

  shouldHideCompanions() {
    return true;
  }

  getCinematicCue(game) {
    return {
      priority: 8,
      focusX: game.chicken.x,
      focusY: game.chicken.y - 22,
      zoom: 1.08,
      vignette: 0.2,
      nightBlend: 0.08,
      ambienceDuck: 0.24,
    };
  }
}

class PottyDropAction extends GameAction {
  constructor() {
    super({ id: "potty", duration: 10, major: true });
    this.state = "roll-in";
    this.stateTime = 0;
    this.entrySide = 1;
    this.pottyX = 0;
    this.pottyTargetX = 0;
    this.pottyY = 0;
    this.landY = 0;
    this.dropVY = 0;

    this.waterTint = 0;
    this.contentsAlpha = 0.95;
    this.whirlpool = 0;
    this.strainPulse = 0;
    this.lockedDirtyTint = 0;

    this.swirls = [];
    this.rewards = [];
    this.faceSteam = [];

    this.hopDuration = 0.95;
    this.hopStartX = 0;
    this.hopEndX = 0;
    this.hopGroundY = 0;

    this.blobs = [
      { x: -11, y: 1, r: 3.4 },
      { x: 7, y: 2, r: 4.3 },
      { x: 15, y: -2, r: 2.6 },
      { x: -2, y: -3, r: 2.8 },
    ];
  }

  start(game) {
    const center = game.pen.x + game.pen.w / 2;
    this.entrySide = game.chicken.x < center ? -1 : 1;

    // Keep the potty hero beat in the middle of the paddock instead of near the front fence.
    const targetPoint = game.penSpace.toScreen(0.5 + randRange(-0.04, 0.04), 0.5 + randRange(-0.04, 0.04));
    this.pottyTargetX = clamp(targetPoint.x, game.pen.x + 230, game.pen.x + game.pen.w - 230);
    this.landY = targetPoint.y - 48;
    this.pottyY = game.pen.y - 250;
    this.pottyX = this.pottyTargetX;
    this.dropVY = 0;

    this.waterTint = 0;
    this.contentsAlpha = 0.95;
    this.whirlpool = 0;
    this.strainPulse = 0;
    this.lockedDirtyTint = 0;
    this.swirls = [];
    this.rewards = [];
    this.faceSteam = [];
    game.chicken.poseScale = 1;

    game.chicken.setController("potty", (dt, g, chicken) => {
      if (this.state === "roll-in") {
        const watchX = clamp(this.pottyTargetX - this.entrySide * 76, g.pen.x + 98, g.pen.x + g.pen.w - 98);
        chicken.x += (watchX - chicken.x) * Math.min(1, dt * 2.2);
        chicken.dir = this.pottyX > chicken.x ? 1 : -1;
        chicken.poseScale = 1;
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 8.5) * 2;
      } else if (this.state === "walk") {
        const delta = this.pottyTargetX + 8 - chicken.x;
        chicken.x += Math.sign(delta) * Math.min(Math.abs(delta), dt * 185);
        chicken.dir = delta >= 0 ? 1 : -1;
        chicken.poseScale = 1;
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 11.2) * 2.1;
      } else if (this.state === "sit" || this.state === "strain") {
        const seatX = this.pottyTargetX + 6;
        chicken.x += (seatX - chicken.x) * Math.min(1, dt * 9.2);
        chicken.dir = 1;
        chicken.poseScale = 0.96;
        const tension = this.state === "strain" ? Math.sin(this.strainPulse) * 2.4 : Math.sin(this.elapsed * 10.7) * 1;
        chicken.y = this.pottyY - 26 + tension;
      } else if (this.state === "hop") {
        const t = Math.min(1, this.stateTime / this.hopDuration);
        const eased = easeOutCubic(t);
        chicken.poseScale = 1;
        chicken.dir = 1;
        chicken.x = this.hopStartX + (this.hopEndX - this.hopStartX) * eased;
        chicken.y = this.hopGroundY + 6 - Math.sin(Math.PI * t) * 66;
      } else if (this.state === "reveal" || this.state === "flush" || this.state === "done") {
        chicken.poseScale = 1;
        chicken.dir = -1;
        chicken.x += (this.hopEndX - chicken.x) * Math.min(1, dt * 7.5);
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 10) * 2;
      } else {
        chicken.poseScale = 1;
        chicken.x += (this.pottyTargetX - chicken.x) * Math.min(1, dt * 1.8);
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 8) * 3;
      }
      return true;
    });
  }

  setState(next, game) {
    this.state = next;
    this.stateTime = 0;

    if (next === "walk") {
      game.sound.boing();
    }
    if (next === "sit") {
      game.sound.sparkle();
    }
    if (next === "strain") {
      game.sound.squawk();
    }
    if (next === "hop") {
      game.sound.boing();
      this.waterTint = Math.max(this.waterTint, 0.96);
      this.lockedDirtyTint = this.waterTint;
      this.contentsAlpha = 1;
      this.hopStartX = game.chicken.x;
      this.hopGroundY = game.chicken.groundY;
      this.hopEndX = clamp(this.pottyTargetX + 156, game.pen.x + 106, game.pen.x + game.pen.w - 94);
    }
    if (next === "reveal") {
      game.sound.bubblePop();
    }
    if (next === "flush") {
      game.sound.flush();
      for (let i = 0; i < 14; i += 1) {
        this.swirls.push({
          r: randRange(8, 26),
          angle: randRange(0, Math.PI * 2),
          spin: randRange(5.4, 8.6),
          life: randRange(0.65, 1.2),
        });
      }
    }
    if (next === "done") {
      game.sound.sparkle();
      for (let i = 0; i < 18; i += 1) {
        this.rewards.push({
          x: this.pottyTargetX + randRange(-28, 28),
          y: this.landY - randRange(24, 56),
          vx: randRange(-120, 120),
          vy: randRange(-250, -120),
          life: randRange(0.7, 1.3),
          size: randRange(8, 15),
          shape: Math.random() > 0.42 ? "heart" : "star",
          color: Math.random() > 0.5 ? "#ff9abf" : "#ffd86b",
        });
      }
    }
  }

  update(dt, game) {
    this.elapsed += dt;
    this.stateTime += dt;
    this.strainPulse += dt * 10;

    if (this.state === "roll-in") {
      this.dropVY += 1240 * dt;
      this.pottyY += this.dropVY * dt;
      if (this.pottyY >= this.landY) {
        this.pottyY = this.landY;
        if (this.dropVY > 220) {
          this.dropVY *= -0.28;
          game.sound.boing();
        } else {
          this.dropVY = 0;
          this.setState("walk", game);
        }
      }
      if (this.stateTime > 1.7) {
        this.pottyY = this.landY;
        this.setState("walk", game);
      }
    }

    if (this.state === "walk") {
      if (Math.abs(game.chicken.x - (this.pottyTargetX + 8)) < 10 || this.stateTime > 1.2) {
        this.setState("sit", game);
      }
    }

    if (this.state === "sit" && this.stateTime >= 0.5) {
      this.setState("strain", game);
    }

    if (this.state === "strain") {
      // The potty gets dirty while seated, so it is already dirty the instant the chicken hops off.
      this.waterTint = Math.min(1, this.stateTime / 1.15);

      if (Math.random() < dt * 9) {
        this.faceSteam.push({
          x: game.chicken.x + randRange(2, 20),
          y: game.chicken.y - 60 + randRange(-3, 3),
          vx: randRange(-5, 10),
          vy: randRange(-28, -16),
          life: randRange(0.35, 0.6),
          size: randRange(5, 10),
        });
      }

      if (this.stateTime >= 1.35) {
        this.setState("hop", game);
      }
    }

    if (this.state === "hop" && this.stateTime >= this.hopDuration) {
      this.setState("reveal", game);
    }

    if (this.state === "reveal") {
      this.contentsAlpha = 1;
      this.waterTint = this.lockedDirtyTint;
      if (this.stateTime >= 0.95) {
        this.setState("flush", game);
      }
    }

    if (this.state === "flush") {
      this.whirlpool = Math.min(1, this.stateTime / 1.2);
      this.contentsAlpha = Math.max(0, 1 - this.whirlpool * 1.15);
      if (this.stateTime >= 1.2) {
        this.setState("done", game);
      }
    }

    if (this.state === "done" && this.stateTime >= 0.6) {
      this.finish(game);
    }

    for (const swirl of this.swirls) {
      swirl.angle += dt * swirl.spin;
      swirl.life -= dt;
    }
    for (let i = this.swirls.length - 1; i >= 0; i -= 1) {
      if (this.swirls[i].life <= 0) {
        this.swirls.splice(i, 1);
      }
    }

    updateParticles(this.faceSteam, dt, -8);
    updateParticles(this.rewards, dt, 320);

    if (this.elapsed > this.duration) {
      this.finish(game);
    }
  }

  drawPottyContents(ctx) {
    // Tuned to the open-bowl `potty` sprite so contents sit in the basin.
    const cx = this.pottyX - 7;
    const cy = this.pottyY - 11;
    const rx = 31;
    const ry = 11;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    const r = Math.round(132 + (236 - 132) * this.waterTint);
    const g = Math.round(206 + (205 - 206) * this.waterTint);
    const b = Math.round(255 + (86 - 255) * this.waterTint);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.86 * this.contentsAlpha})`;
    ctx.fillRect(cx - rx - 3, cy - ry - 4, rx * 2 + 6, ry * 2 + 8);

    if (this.waterTint > 0.45) {
      const blobAlpha = Math.min(0.65, ((this.waterTint - 0.45) / 0.55) * this.contentsAlpha);
      ctx.fillStyle = `rgba(150, 106, 72, ${blobAlpha})`;
      for (const blob of this.blobs) {
        ctx.beginPath();
        ctx.ellipse(cx + blob.x, cy + blob.y, blob.r, blob.r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.whirlpool > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.58 * this.contentsAlpha})`;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i += 1) {
        const rr = 4 + i * 5 + this.whirlpool * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, this.elapsed * 6 + i * 0.8, this.elapsed * 6 + i * 0.8 + Math.PI * 1.35);
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(245, 246, 250, ${0.62 * this.whirlpool * this.contentsAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2 + this.whirlpool * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = "rgba(120, 130, 148, 0.68)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawFront(ctx, game) {
    const potty = game.assets.get("potty");
    const pottySit = game.assets.get("pottySit");
    const pottyStrain = game.assets.get("pottyStrain");

    if (this.state === "roll-in") {
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i += 1) {
        const x = this.pottyX + i * 26;
        ctx.beginPath();
        ctx.moveTo(x, this.pottyY - 56);
        ctx.lineTo(x, this.pottyY - 18);
        ctx.stroke();
      }
    }

    if (this.state === "sit" || this.state === "strain" || this.state === "reveal" || this.state === "flush") {
      ctx.fillStyle = "rgba(255, 243, 189, 0.45)";
      ctx.beginPath();
      ctx.ellipse(this.pottyX + 4, this.pottyY - 14, 44, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(72, 80, 92, 0.22)";
    ctx.beginPath();
    ctx.ellipse(this.pottyX + 2, this.pottyY + 48, 72, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const seatedPose = this.state === "sit";
    const strainPose = this.state === "strain";
    const poseSprite = strainPose ? pottyStrain : seatedPose ? pottySit : potty;
    const poseW = seatedPose || strainPose ? 224 : 198;
    const poseH = seatedPose || strainPose ? 216 : 178;

    drawSprite(ctx, poseSprite, this.pottyX, this.pottyY, poseW, poseH, {
      rotation: this.state === "roll-in" || this.state === "walk" ? Math.sin(this.elapsed * 7) * 0.02 : 0,
    });

    if (!seatedPose && !strainPose) {
      this.drawPottyContents(ctx);
    }

    for (const steam of this.faceSteam) {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, steam.life * 0.5)})`;
      ctx.beginPath();
      ctx.ellipse(steam.x, steam.y, steam.size * 0.9, steam.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const swirl of this.swirls) {
      const x = this.pottyX + Math.cos(swirl.angle) * swirl.r * 0.6;
      const y = this.pottyY - 18 + Math.sin(swirl.angle * 1.2) * swirl.r * 0.35;
      ctx.strokeStyle = `rgba(130, 220, 255, ${Math.max(0, swirl.life * 0.8)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 6 + swirl.r * 0.06, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const reward of this.rewards) {
      ctx.save();
      ctx.translate(reward.x, reward.y);
      ctx.globalAlpha = Math.max(0, reward.life * 0.85);
      ctx.fillStyle = reward.color;

      if (reward.shape === "heart") {
        const s = reward.size * 0.08;
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, 3.5);
        ctx.bezierCurveTo(0, 1.4, -3, -0.2, -5, 1.6);
        ctx.bezierCurveTo(-7, 3.4, -6.5, 6.4, -4.3, 8.2);
        ctx.lineTo(0, 11.2);
        ctx.lineTo(4.3, 8.2);
        ctx.bezierCurveTo(6.5, 6.4, 7, 3.4, 5, 1.6);
        ctx.bezierCurveTo(3, -0.2, 0, 1.4, 0, 3.5);
        ctx.closePath();
        ctx.fill();
      } else {
        const spikes = 5;
        const outer = reward.size;
        const inner = reward.size * 0.45;
        const rot = this.elapsed * 3.6;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i += 1) {
          const angle = rot + (Math.PI * i) / spikes;
          const radius = i % 2 === 0 ? outer : inner;
          const sx = Math.cos(angle) * radius;
          const sy = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  onFinish(game) {
    game.chicken.poseScale = 1;
    game.chicken.clearController("potty");
  }

  shouldHideChicken() {
    return this.state === "sit" || this.state === "strain";
  }

  shouldHideCompanions() {
    return true;
  }

  getCinematicCue(game) {
    const focusX = this.state === "roll-in" || this.state === "walk" ? (game.chicken.x + this.pottyX) * 0.5 : this.pottyX + 10;
    const focusY = this.pottyY - 8;
    const heroBeat = this.state === "sit" || this.state === "strain" || this.state === "hop" || this.state === "reveal" || this.state === "flush";
    return {
      priority: 11,
      focusX,
      focusY,
      zoom: heroBeat ? 1.1 : 1.06,
      vignette: heroBeat ? 0.28 : 0.2,
      nightBlend: 0,
      ambienceDuck: heroBeat ? 0.34 : 0.2,
    };
  }
}


class DiscoAction extends GameAction {
  constructor() {
    super({ id: "disco", duration: 8.5, major: true });
    this.tiles = [];
  }

  start(game) {
    const cols = 7;
    const rows = 4;
    const tileW = game.pen.w / cols;
    const tileH = game.pen.h / rows;

    this.tiles = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        this.tiles.push({
          x: game.pen.x + x * tileW,
          y: game.pen.y + y * tileH,
          w: tileW,
          h: tileH,
          phase: randRange(0, Math.PI * 2),
        });
      }
    }

    game.sound.discoStart();
    game.chicken.setController("disco", (dt, g, chicken) => {
      const cx = g.pen.x + g.pen.w / 2;
      chicken.x = cx + Math.sin(this.elapsed * 3.8) * 120;
      chicken.y = chicken.groundY + Math.abs(Math.sin(this.elapsed * 14)) * 14;
      chicken.dir = Math.cos(this.elapsed * 3.8) >= 0 ? 1 : -1;
      return true;
    });
  }

  drawBack(ctx, game) {
    const dark = 0.16 + Math.sin(this.elapsed * 8) * 0.05;
    ctx.fillStyle = `rgba(20, 5, 34, ${dark})`;
    ctx.fillRect(0, 0, game.world.width, game.world.height);

    for (const tile of this.tiles) {
      const glow = (Math.sin(this.elapsed * 5 + tile.phase) + 1) * 0.5;
      const hue = (this.elapsed * 180 + tile.phase * 60) % 360;
      ctx.fillStyle = `hsla(${hue}, 95%, ${36 + glow * 30}%, 0.72)`;
      ctx.fillRect(tile.x + 4, tile.y + 4, tile.w - 8, tile.h - 8);
    }

    const beamCount = 6;
    const centerX = game.pen.x + game.pen.w / 2;
    const centerY = game.pen.y - 170;

    for (let i = 0; i < beamCount; i += 1) {
      const angle = this.elapsed * 1.7 + (i / beamCount) * Math.PI * 2;
      const targetX = centerX + Math.cos(angle) * 600;
      const targetY = centerY + Math.sin(angle) * 260 + 320;

      const gradient = ctx.createLinearGradient(centerX, centerY, targetX, targetY);
      gradient.addColorStop(0, "rgba(255,255,255,0.42)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
    }
  }

  drawFront(ctx, game) {
    const discoBall = game.assets.get("discoBall");
    const x = game.pen.x + game.pen.w / 2;
    const y = game.pen.y - 170;

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, y - 20);
    ctx.stroke();

    drawSprite(ctx, discoBall, x, y, 152, 152, {
      rotation: Math.sin(this.elapsed * 2.4) * 0.2,
    });

    for (let i = 0; i < 26; i += 1) {
      const angle = randRange(0, Math.PI * 2);
      const r = randRange(24, 84);
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      ctx.fillStyle = `hsla(${(this.elapsed * 300 + i * 18) % 360}, 100%, 70%, 0.6)`;
      ctx.beginPath();
      ctx.arc(px, py, randRange(1.5, 4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  onFinish(game) {
    game.chicken.clearController("disco");
    game.sound.discoStop();
  }
}

class EggHatchAction extends GameAction {
  constructor() {
    super({ id: "egg-hatch", duration: 8.2, major: true });
    this.state = "approach";
    this.stateTime = 0;
    this.layX = 0;
    this.layGroundY = 0;
    this.eggX = 0;
    this.eggY = 0;
    this.eggGroundY = 0;
    this.eggVY = 0;
    this.eggVisible = false;
    this.eggAttached = false;
    // 0..1: the egg visibly "emerges" before it drops so it doesn't feel like a pop-in.
    this.eggEmergence = 0;
    this.hatched = false;
    this.bounces = 0;
  }

  start(game) {
    this.layX = clamp(game.chicken.x + randRange(-18, 18), game.pen.x + 120, game.pen.x + game.pen.w - 120);
    this.layGroundY = game.chicken.groundY;
    this.eggGroundY = this.layGroundY + 53;
    this.eggX = this.layX - 10;
    this.eggY = this.eggGroundY;
    this.state = "approach";
    this.stateTime = 0;
    this.eggVisible = false;
    this.eggAttached = false;
    this.hatched = false;
    this.bounces = 0;
    this.eggVY = 0;
    this.eggEmergence = 0;

    game.chicken.setController("egg", (dt, _g, chicken) => {
      if (this.state === "approach") {
        chicken.x += (this.layX + 32 - chicken.x) * Math.min(1, dt * 4.8);
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 9) * 2.2;
        chicken.dir = 1;
      } else if (this.state === "squat") {
        chicken.x += (this.layX + 22 - chicken.x) * Math.min(1, dt * 6.2);
        chicken.y = chicken.groundY - 13 + Math.sin(this.stateTime * 10) * 1.2;
        chicken.dir = 1;
      } else if (this.state === "lay") {
        chicken.x += (this.layX + 20 - chicken.x) * Math.min(1, dt * 7.2);
        chicken.y = chicken.groundY - 18 + Math.sin(this.stateTime * 13) * 1.6;
        chicken.dir = 1;
      } else if (this.state === "drop") {
        chicken.x += (this.layX + 34 - chicken.x) * Math.min(1, dt * 5.4);
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 11.5) * 2;
        chicken.dir = 1;
      } else if (this.state === "wobble" || this.state === "hatch" || this.state === "done") {
        chicken.x += (this.layX + 58 - chicken.x) * Math.min(1, dt * 4.2);
        chicken.y = chicken.groundY + Math.sin(this.elapsed * 10.2) * 2;
        chicken.dir = 1;
      }
      return true;
    });
  }

  setState(next, game) {
    this.state = next;
    this.stateTime = 0;

    if (next === "squat") {
      game.sound.squawk();
    }
    if (next === "lay") {
      this.eggAttached = true;
      this.eggVisible = false;
      this.eggEmergence = 0;
    }
    if (next === "drop") {
      this.eggAttached = false;
      this.eggVY = 28;
      game.sound.eggSong();
    }
    if (next === "wobble") {
      this.eggAttached = false;
    }
    if (next === "hatch") {
      if (!this.hatched) {
        this.hatched = true;
        game.spawnCompanion();
        game.sound.hatch();
      }
    }
  }

  update(dt, game) {
    this.elapsed += dt;
    this.stateTime += dt;

    if (this.state === "approach" && this.stateTime >= 0.72) {
      this.setState("squat", game);
    }
    if (this.state === "squat" && this.stateTime >= 0.56) {
      this.setState("lay", game);
    }
    if (this.state === "lay") {
      // Let the egg "peek" out first (alpha/scale ramps) so it reads as being laid.
      const t = clamp((this.stateTime - 0.08) / 0.22, 0, 1);
      this.eggEmergence = t;
      if (t > 0.001) this.eggVisible = true;

      this.eggX = game.chicken.x - 16;
      // Start slightly higher, then settle lower as it emerges.
      this.eggY = game.chicken.y + (44 + t * 12);

      if (this.stateTime >= 0.52) {
        this.setState("drop", game);
      }
    }
    if (this.state === "drop") {
      this.eggVY += 920 * dt;
      this.eggY += this.eggVY * dt;
      if (this.eggY >= this.eggGroundY) {
        this.eggY = this.eggGroundY;
        this.eggVY *= -0.32;
        this.bounces += 1;
        game.sound.eggDrop();
        if (this.bounces >= 1 && Math.abs(this.eggVY) < 90) {
          this.eggVY = 0;
          this.setState("wobble", game);
        }
      }
    }
    if (this.state === "wobble" && this.stateTime >= 1.04) {
      this.setState("hatch", game);
    }
    if (this.state === "hatch" && this.stateTime >= 0.95) {
      this.setState("done", game);
    }
    if (this.state === "done" && this.stateTime >= 0.65) {
      this.finish(game);
    }

    if (this.elapsed > this.duration + 0.6) {
      this.finish(game);
    }
  }

  drawFront(ctx, game) {
    const egg = game.assets.get("egg");
    const baseChicken = game.assets.get("chicken");

    const chicken = game.chicken;
    const isPose = (this.state === "squat" || this.state === "lay") && baseChicken;
    if (isPose) {
      const size = 224 * chicken.visualScale * chicken.poseScale;
      const drawX = chicken.x;
      const drawY = chicken.y - (this.state === "squat" ? 52 : 56) * chicken.visualScale;
      const shadowW = 66 * chicken.visualScale;
      const shadowH = 17 * chicken.visualScale;

      // Draw the egg first during "lay" so it's visually behind the chicken (reads as "coming out").
      if (this.state === "lay" && this.eggAttached && this.eggVisible) {
        const t = this.eggEmergence || 0;
        const w = 88 * (0.55 + t * 0.45);
        const h = 116 * (0.55 + t * 0.45);
        const alpha = 0.15 + t * 0.85;
        drawSprite(ctx, egg, this.eggX, this.eggY - (8 - t * 8), w, h, {
          rotation: (1 - t) * 0.25,
          alpha,
        });
      }

      ctx.save();
      ctx.translate(drawX, drawY);

      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath();
      ctx.ellipse(0, 106 * chicken.visualScale, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();

      const wobble = this.state === "squat" ? Math.sin(this.elapsed * 8) * 0.02 : Math.sin(this.elapsed * 10) * 0.015;
      ctx.rotate(wobble * chicken.dir);
      const squatScaleX = this.state === "lay" ? 1.07 : 1.04;
      const squatScaleY = this.state === "lay" ? 0.84 : 0.89;
      ctx.scale(chicken.dir * squatScaleX, squatScaleY);
      ctx.drawImage(baseChicken, -size / 2, -size / 2, size, size);
      ctx.restore();

      if (this.state === "lay" && this.eggAttached) {
        // Egg already drawn behind the chicken in this pose.
        return;
      }
    }

    if (!this.eggVisible) return;

    const hatchSpread = this.state === "hatch" || this.state === "done" ? easeOutCubic(Math.min(1, this.stateTime / 0.75)) : 0;
    const shouldCrack = this.state === "wobble" || this.state === "hatch" || this.state === "done";
    const wobbleStrength = this.state === "wobble" ? Math.sin(this.elapsed * 24) * 0.22 : Math.sin(this.elapsed * 18) * 0.04;

    if (!this.hatched) {
      drawSprite(ctx, egg, this.eggX, this.eggY, 88, 116, { rotation: wobbleStrength });

      if (shouldCrack) {
        ctx.strokeStyle = "rgba(70,70,70,0.45)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.eggX - 17, this.eggY - 10);
        ctx.lineTo(this.eggX - 6, this.eggY - 20);
        ctx.lineTo(this.eggX + 4, this.eggY - 8);
        ctx.lineTo(this.eggX + 16, this.eggY - 17);
        ctx.stroke();
      }
    } else {
      drawSprite(ctx, egg, this.eggX - 20 - hatchSpread * 15, this.eggY + 8, 50, 46, { rotation: -0.42 });
      drawSprite(ctx, egg, this.eggX + 20 + hatchSpread * 15, this.eggY + 9, 50, 46, { rotation: 0.46 });

      ctx.fillStyle = "rgba(255,255,255,0.52)";
      ctx.beginPath();
      ctx.arc(this.eggX, this.eggY - 18, 14 + Math.sin(this.elapsed * 18) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  onFinish(game) {
    game.chicken.clearController("egg");
  }

  shouldHideCompanions() {
    return true;
  }

  shouldHideChicken() {
    return this.state === "squat" || this.state === "lay";
  }

  getCinematicCue(game) {
    return {
      priority: 9,
      focusX: this.eggVisible ? this.eggX : game.chicken.x,
      focusY: this.eggVisible ? this.eggY - 24 : game.chicken.y,
      zoom: 1.07,
      vignette: 0.22,
      nightBlend: 0,
      ambienceDuck: 0.22,
    };
  }
}

class RainRainbowAction extends GameAction {
  constructor() {
    super({ id: "rainbow-rain", duration: 9.6, major: false });
    this.drops = [];
    this.spawnTimer = 0;
    this.rainbowVisible = 0;
    this.skyBandMaxY = 0;
  }

  start(game) {
    this.skyBandMaxY = Math.floor(game.world.height * 0.34);
    this.rainbowVisible = 0;
    game.sound.rainStart();
  }

  update(dt, game) {
    super.update(dt, game);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.018;
      for (let i = 0; i < 12; i += 1) {
        const layer = randInt(0, 2);
        const originY = randRange(-120, this.skyBandMaxY);
        this.drops.push({
          x: randRange(-80, game.world.width + 80),
          y: originY,
          originY,
          vy: randRange(460, 740) * (0.8 + layer * 0.18),
          vx: randRange(-28, 28) * (0.8 + layer * 0.15),
          life: randRange(0.95, 1.55),
          size: randRange(7, 18) * (0.82 + layer * 0.18),
          layer,
        });
      }
    }

    for (const drop of this.drops) {
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.life -= dt;
    }

    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      if (this.drops[i].life <= 0 || this.drops[i].y > game.world.height + 40) {
        this.drops.splice(i, 1);
      }
    }

    if (this.elapsed > 4.1) {
      this.rainbowVisible = Math.min(1, (this.elapsed - 4.1) / 1.2);
    } else {
      this.rainbowVisible = 0;
    }
  }

  drawBack(ctx, game) {
    ctx.fillStyle = "rgba(67, 92, 130, 0.18)";
    ctx.fillRect(0, 0, game.world.width, game.world.height);

    const topShade = ctx.createLinearGradient(0, 0, 0, game.world.height * 0.45);
    topShade.addColorStop(0, "rgba(54, 76, 108, 0.28)");
    topShade.addColorStop(1, "rgba(54, 76, 108, 0)");
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, game.world.width, game.world.height * 0.55);

    if (this.rainbowVisible > 0.01) {
      const rainbow = game.assets.get("rainbow");
      const t = this.rainbowVisible;
      drawSprite(
        ctx,
        rainbow,
        game.pen.x + game.pen.w / 2,
        game.pen.y - 42,
        460 * (0.7 + t * 0.3),
        250 * (0.7 + t * 0.3),
        { alpha: t * 0.9 },
      );
    }
  }

  drawOverlay(ctx) {
    for (const drop of this.drops) {
      const alpha = Math.max(0, drop.life * (0.45 + drop.layer * 0.2));
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = drop.layer === 0 ? "rgba(150, 212, 255, 0.65)" : drop.layer === 1 ? "rgba(132, 202, 252, 0.82)" : "rgba(176, 224, 255, 0.94)";
      ctx.lineWidth = drop.layer === 0 ? 2 : drop.layer === 1 ? 2.8 : 3.6;
      ctx.beginPath();
      ctx.moveTo(drop.x + 4, drop.y - drop.size);
      ctx.lineTo(drop.x - 5, drop.y + drop.size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  onFinish(game) {
    game.sound.rainStop();
  }
}

class ButterflyParadeAction extends GameAction {
  constructor() {
    super({ id: "butterflies", duration: 8.2, major: false });
    this.butterflies = [];
  }

  start(game) {
    for (let i = 0; i < 18; i += 1) {
      this.butterflies.push({
        x: randRange(-260, -20),
        y: randRange(game.pen.y - 30, game.pen.y + game.pen.h + 100),
        speed: randRange(80, 180),
        phase: randRange(0, Math.PI * 2),
        size: randRange(48, 88),
      });
    }
    game.sound.sparkle();
  }

  update(dt, game) {
    super.update(dt, game);

    for (const b of this.butterflies) {
      b.x += b.speed * dt;
      b.y += Math.sin(this.elapsed * 4 + b.phase) * 52 * dt;
      if (b.x > game.world.width + 180) {
        b.x = -220;
      }
    }
  }

  drawFront(ctx, game) {
    const butterfly = game.assets.get("butterfly");

    for (const b of this.butterflies) {
      const flap = 1 + Math.sin(this.elapsed * 18 + b.phase) * 0.14;
      drawSprite(ctx, butterfly, b.x, b.y, b.size * flap, b.size * 0.72, {
        rotation: Math.sin(this.elapsed * 3 + b.phase) * 0.2,
      });
    }
  }
}

class TractorZoomAction extends GameAction {
  constructor() {
    super({ id: "tractor", duration: 6, major: false });
    this.x = -260;
    this.y = 0;
    this.dust = [];
    this.honkTimer = 0;
  }

  start(game) {
    this.y = game.pen.y + game.pen.h + 96;
    game.sound.tractorHorn();
  }

  update(dt, game) {
    this.elapsed += dt;
    this.x += 420 * dt;

    if (Math.random() < 0.45) {
      this.dust.push({
        x: this.x - 70,
        y: this.y + 24,
        vx: randRange(-120, -40),
        vy: randRange(-30, 20),
        life: randRange(0.5, 0.9),
        size: randRange(14, 30),
      });
    }

    updateParticles(this.dust, dt, 60);

    this.honkTimer -= dt;
    if (this.honkTimer <= 0 && this.elapsed < this.duration - 0.8 && Math.random() < 0.18) {
      this.honkTimer = randRange(1.1, 1.8);
      game.sound.tractorHorn();
    }

    if (this.elapsed >= this.duration || this.x > game.world.width + 260) {
      this.finish(game);
    }
  }

  drawFront(ctx, game) {
    const tractor = game.assets.get("tractor");

    for (const puff of this.dust) {
      ctx.fillStyle = `rgba(211, 184, 132, ${Math.max(0, puff.life) * 0.36})`;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size, 0, Math.PI * 2);
      ctx.fill();
    }

    drawSprite(ctx, tractor, this.x, this.y + Math.sin(this.elapsed * 14) * 3, 226, 166);
  }
}

class HayBounceAction extends GameAction {
  constructor() {
    super({ id: "hay-bounce", duration: 7.2, major: false });
    this.hay = [];
    this.bounceTimer = 0;
  }

  start(game) {
    for (let i = 0; i < 7; i += 1) {
      this.hay.push({
        x: randRange(game.pen.x + 30, game.pen.x + game.pen.w - 30),
        y: randRange(-300, -40),
        vx: randRange(-120, 120),
        vy: randRange(20, 120),
        spin: randRange(-1.2, 1.2),
        angle: randRange(0, Math.PI * 2),
        scale: randRange(0.72, 1.1),
      });
    }
  }

  update(dt, game) {
    super.update(dt, game);

    for (const bale of this.hay) {
      bale.vy += 860 * dt;
      bale.x += bale.vx * dt;
      bale.y += bale.vy * dt;
      bale.angle += bale.spin * dt;

      const ground = game.pen.y + game.pen.h - 4;
      if (bale.y > ground) {
        bale.y = ground;
        bale.vy *= -0.58;
        bale.vx *= 0.93;
        if (Math.abs(bale.vy) < 80) bale.vy = randRange(-180, -120);
        if (Math.abs(bale.vx) < 20) bale.vx = randRange(-70, 70);

        if (this.bounceTimer <= 0) {
          this.bounceTimer = 0.12;
          game.sound.boing();
        }
      }

      if (bale.x < game.pen.x + 12 || bale.x > game.pen.x + game.pen.w - 12) {
        bale.vx *= -1;
      }
    }

    this.bounceTimer -= dt;
  }

  drawFront(ctx, game) {
    const hay = game.assets.get("hay");

    for (const bale of this.hay) {
      drawSprite(ctx, hay, bale.x, bale.y, 124 * bale.scale, 88 * bale.scale, {
        rotation: bale.angle,
      });
    }
  }
}

class BubblePartyAction extends GameAction {
  constructor() {
    super({ id: "bubbles", duration: 6.6, major: false });
    this.bubbles = [];
    this.spawnTimer = 0;
  }

  update(dt, game) {
    super.update(dt, game);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.03;
      this.bubbles.push({
        x: randRange(game.pen.x + 20, game.pen.x + game.pen.w - 20),
        y: game.pen.y + game.pen.h - randRange(0, 30),
        vx: randRange(-36, 36),
        vy: randRange(-220, -130),
        life: randRange(1.1, 2.6),
        size: randRange(8, 26),
      });
    }

    for (const bubble of this.bubbles) {
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      bubble.vx += Math.sin(this.elapsed * 4 + bubble.y * 0.02) * 8 * dt;
      bubble.life -= dt;
    }

    for (let i = this.bubbles.length - 1; i >= 0; i -= 1) {
      const b = this.bubbles[i];
      if (b.life <= 0 || b.y < -40) {
        if (Math.random() < 0.25) game.sound.bubblePop();
        this.bubbles.splice(i, 1);
      }
    }
  }

  drawFront(ctx) {
    for (const bubble of this.bubbles) {
      const alpha = Math.min(0.9, bubble.life * 0.6);
      const gradient = ctx.createRadialGradient(
        bubble.x - bubble.size * 0.25,
        bubble.y - bubble.size * 0.28,
        1,
        bubble.x,
        bubble.y,
        bubble.size,
      );
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.5, `rgba(160,220,255,${alpha * 0.55})`);
      gradient.addColorStop(1, `rgba(130,180,255,${alpha * 0.2})`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

class CornConfettiAction extends GameAction {
  constructor() {
    super({ id: "corn-confetti", duration: 5.6, major: false });
    this.bits = [];
  }

  update(dt, game) {
    super.update(dt, game);

    for (let i = 0; i < 18; i += 1) {
      this.bits.push({
        x: randRange(30, game.world.width - 30),
        y: randRange(-120, -10),
        vx: randRange(-70, 70),
        vy: randRange(140, 320),
        life: randRange(1.5, 2.8),
        angle: randRange(0, Math.PI * 2),
        spin: randRange(-6, 6),
        color: ["#ffd84d", "#ff8ad5", "#6df1ff", "#95ff7f", "#ff9e54"][randInt(0, 4)],
      });
    }

    for (const bit of this.bits) {
      bit.vy += 260 * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.life -= dt;
      bit.angle += bit.spin * dt;
    }

    for (let i = this.bits.length - 1; i >= 0; i -= 1) {
      const b = this.bits[i];
      if (b.life <= 0 || b.y > game.world.height + 30) {
        this.bits.splice(i, 1);
      }
    }
  }

  drawFront(ctx) {
    for (const bit of this.bits) {
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.angle);
      ctx.fillStyle = bit.color;
      ctx.globalAlpha = Math.max(0, bit.life * 0.5);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

class StarShowerAction extends GameAction {
  constructor() {
    super({ id: "star-shower", duration: 6.4, major: false });
    this.stars = [];
    this.spawnTimer = 0;
    this.sparkTimer = 0;
  }

  update(dt, game) {
    super.update(dt, game);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.045;
      this.stars.push({
        x: randRange(60, game.world.width - 60),
        y: randRange(-120, -20),
        vx: randRange(-26, 26),
        vy: randRange(110, 260),
        spin: randRange(-4.2, 4.2),
        angle: randRange(0, Math.PI * 2),
        life: randRange(1.5, 2.4),
        size: randRange(7, 14),
        color: ["#ffe46f", "#ff9fca", "#85f2ff", "#94ff88"][randInt(0, 3)],
      });
    }

    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = randRange(0.35, 0.75);
      game.sound.sparkle();
    }

    for (const star of this.stars) {
      star.vy += 180 * dt;
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      star.angle += star.spin * dt;
      star.life -= dt;
    }

    for (let i = this.stars.length - 1; i >= 0; i -= 1) {
      if (this.stars[i].life <= 0 || this.stars[i].y > game.world.height + 30) {
        this.stars.splice(i, 1);
      }
    }
  }

  drawFront(ctx) {
    for (const star of this.stars) {
      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.rotate(star.angle);
      ctx.globalAlpha = Math.max(0, Math.min(1, star.life * 0.6));
      ctx.fillStyle = star.color;

      const spikes = 5;
      const outer = star.size;
      const inner = star.size * 0.45;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i += 1) {
        const a = (Math.PI * i) / spikes;
        const r = i % 2 === 0 ? outer : inner;
        const sx = Math.cos(a) * r;
        const sy = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

class ChickParadeAction extends GameAction {
  constructor() {
    super({ id: "chick-parade", duration: 6.9, major: true });
    this.parade = [];
  }

  start(game) {
    for (let i = 0; i < 8; i += 1) {
      this.parade.push({
        x: game.pen.x - 240 - i * 120,
        y: game.pen.y + game.pen.h - randRange(56, 92),
        speed: randRange(120, 190),
        bobPhase: randRange(0, Math.PI * 2),
        scale: randRange(0.82, 1.12),
      });
    }

    game.chicken.setController("chick-parade", (_dt, g, chicken) => {
      const targetX = g.pen.x + g.pen.w * 0.52;
      chicken.x += (targetX - chicken.x) * 0.14;
      chicken.y = chicken.groundY + Math.sin(this.elapsed * 13) * 5;
      chicken.dir = -1;
      return true;
    });

    game.sound.sparkle();
  }

  update(dt, game) {
    super.update(dt, game);

    for (const chick of this.parade) {
      chick.x += chick.speed * dt;
      chick.y += Math.sin(this.elapsed * 9 + chick.bobPhase) * 0.8;
      if (chick.x > game.world.width + 220) {
        chick.x = game.pen.x - 220;
      }
    }
  }

  drawFront(ctx, game) {
    const chickSprite = game.assets.get("chick");
    for (const chick of this.parade) {
      const w = 78 * chick.scale;
      const h = 88 * chick.scale;

      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.beginPath();
      ctx.ellipse(chick.x, chick.y + 34, 24 * chick.scale, 7 * chick.scale, 0, 0, Math.PI * 2);
      ctx.fill();

      drawSprite(ctx, chickSprite, chick.x, chick.y, w, h);
    }
  }

  onFinish(game) {
    game.chicken.clearController("chick-parade");
  }
}

class SunDanceAction extends GameAction {
  constructor() {
    super({ id: "sun-party", duration: 6.2, major: false });
    this.sparkleTimer = 0;
  }

  update(dt, game) {
    super.update(dt, game);
    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = randRange(0.45, 0.95);
      game.sound.sparkle();
    }
  }

  drawBack(ctx, game) {
    const t = (Math.sin(this.elapsed * 3.6) + 1) * 0.5;
    const sunX = game.world.width - 160;
    const sunY = 110;

    const overlay = ctx.createRadialGradient(sunX, sunY, 40, sunX, sunY, 560);
    overlay.addColorStop(0, `rgba(255, 230, 120, ${0.24 + t * 0.18})`);
    overlay.addColorStop(1, "rgba(255, 180, 80, 0)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, game.world.width, game.world.height);

    ctx.save();
    ctx.translate(sunX, sunY);
    ctx.rotate(this.elapsed * 0.7);
    for (let i = 0; i < 14; i += 1) {
      const angle = (Math.PI * 2 * i) / 14;
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(255, 214, 80, 0.45)";
      ctx.beginPath();
      ctx.moveTo(44, 0);
      ctx.lineTo(92, 9);
      ctx.lineTo(92, -9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

export function registerDefaultActions(registry) {
  registry.register({ id: "fireworks", weight: 1.2, create: () => new FireworksAction() });
  registry.register({ id: "jetpack", weight: 1, create: () => new JetpackAction() });
  registry.register({ id: "potty", weight: 2.4, create: () => new PottyDropAction() });
  registry.register({ id: "disco", weight: 1, create: () => new DiscoAction() });
  registry.register({ id: "egg-hatch", weight: 1.1, create: () => new EggHatchAction() });
  registry.register({ id: "chick-parade", weight: 0.95, create: () => new ChickParadeAction() });
  registry.register({ id: "rainbow-rain", weight: 1, create: () => new RainRainbowAction() });
  registry.register({ id: "butterflies", weight: 0.95, create: () => new ButterflyParadeAction() });
  registry.register({ id: "tractor", weight: 0.85, create: () => new TractorZoomAction() });
  registry.register({ id: "hay-bounce", weight: 0.9, create: () => new HayBounceAction() });
  registry.register({ id: "bubbles", weight: 1, create: () => new BubblePartyAction() });
  registry.register({ id: "corn-confetti", weight: 0.9, create: () => new CornConfettiAction() });
  registry.register({ id: "star-shower", weight: 0.95, create: () => new StarShowerAction() });
  registry.register({ id: "sun-party", weight: 0.8, create: () => new SunDanceAction() });
}
