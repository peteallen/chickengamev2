import { clamp, easeOutCubic, lerp, randInt, randRange } from "../core/math.js";

const easeInCubic = (t) => t * t * t;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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

  // Draw effects that must sit on top of the pen ground fill but below pen props/fences.
  // Called from Game.drawPenBack().
  drawPenFx(_ctx, _game) {}

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
    super({ id: "jetpack", duration: 13.2, major: true });
    this.flames = [];
    this.plasma = [];
    this.stars = [];

    this.baseX = 0;
    this.baseY = 0;
    this.baseU = 0.5;
    this.baseV = 0.76;
    this.baseDir = 1;
    this.prevCluckTimer = 0;

    this.actor = {
      x: 800,
      y: 650,
      groundY: 650,
      dir: 1,
      rotation: 0,
      alpha: 1,
    };

    this.overlayAlpha = 0;
    this.altitude = 0; // 0..1
    this.windOn = false;
    this.parachuteOn = false;

    this.lastCue = {
      takeoff: false,
      windStart: false,
      windStop: false,
      reverse: false,
      reentry: false,
      chute: false,
    };
  }

  start(game) {
    this.elapsed = 0;

    this.baseX = game.chicken.x;
    this.baseY = game.chicken.y;
    this.baseU = game.chicken.u;
    this.baseV = game.chicken.v;
    this.baseDir = game.chicken.dir || 1;

    this.prevCluckTimer = game.chicken.cluckTimer;
    game.chicken.cluckTimer = 999;

    // Freeze the real chicken; we'll render a cinematic actor instead.
    game.chicken.setController("jetpack", () => true);
    game.chicken.jetpackVisible = true;

    this.actor.x = this.baseX;
    this.actor.y = this.baseY;
    this.actor.groundY = game.chicken.groundY;
    this.actor.dir = this.baseDir;
    this.actor.rotation = 0;
    this.actor.alpha = 1;

    this.overlayAlpha = 0;
    this.altitude = 0;
    this.windOn = false;
    this.parachuteOn = false;

    this.flames = [];
    this.plasma = [];
    this.stars = [];
    for (let i = 0; i < 70; i += 1) {
      this.stars.push({
        x: ((i * 179) % game.world.width) + randRange(-8, 8),
        y: ((i * 97) % (game.world.height * 0.7)) + randRange(-8, 8),
        r: 0.7 + ((i * 13) % 4) * 0.35,
        tw: randRange(0, Math.PI * 2),
      });
    }

    // Audio
    game.sound.jetpackStart();
    game.sound.jetpackMusicStart();
    game.sound.jetpackTakeoff();
    this.lastCue = {
      takeoff: true,
      windStart: false,
      windStop: false,
      reverse: false,
      reentry: false,
      chute: false,
    };
  }

  update(dt, game) {
    super.update(dt, game);

    const t = this.elapsed;

    // Phase timestamps (seconds)
    const T1 = 0.9; // startup end
    const T2 = 2.2; // wobble end
    const T3 = 4.2; // liftoff end
    const T4 = 6.4; // clouds end
    const T5 = 7.8; // strato end
    const T6 = 9.2; // space end
    const T7 = 9.9; // flip end
    const T8 = 11.2; // reentry end
    const T9 = 13.2; // end

    const inRange = (a, b) => t >= a && t < b;
    const n01 = (a, b) => clamp((t - a) / Math.max(0.0001, b - a), 0, 1);

    // Altitude 0..1
    if (t < T2) {
      this.altitude = 0;
    } else if (t < T5) {
      this.altitude = easeInOutCubic(n01(T2, T5));
    } else if (t < T7) {
      this.altitude = 1;
    } else if (t < T8) {
      const tt = easeOutCubic(n01(T7, T8));
      this.altitude = 1 + (0.45 - 1) * tt;
    } else {
      const tt = easeInOutCubic(n01(T8, T9));
      this.altitude = 0.45 + (0 - 0.45) * tt;
    }

    // Overlay alpha (when sky/space fully takes over)
    if (t < T2) {
      this.overlayAlpha = 0;
    } else if (t < T3) {
      this.overlayAlpha = easeInOutCubic(n01(T2, T3));
    } else if (t < T8 + 0.3) {
      this.overlayAlpha = 1;
    } else {
      this.overlayAlpha = 1 - easeInOutCubic(n01(T8 + 0.3, T9));
    }

    // Audio cues
    if (!this.lastCue.windStart && t >= T2) {
      this.lastCue.windStart = true;
      game.sound.windStart();
      this.windOn = true;
    }
    if (!this.lastCue.windStop && t >= T5) {
      this.lastCue.windStop = true;
      game.sound.windStop();
      this.windOn = false;
    }
    if (!this.lastCue.reverse && t >= T6) {
      this.lastCue.reverse = true;
      game.sound.reverseThruster();
    }
    if (!this.lastCue.reentry && t >= T7) {
      this.lastCue.reentry = true;
      game.sound.reentryFire();
      game.sound.windStart();
      this.windOn = true;
    }
    if (!this.lastCue.chute && t >= T8) {
      this.lastCue.chute = true;
      this.parachuteOn = true;
      game.sound.parachuteOpen();
      game.sound.jetpackStop();
    }

    // Actor motion
    const baseX = this.baseX;
    const baseY = this.baseY;
    const flightY = 320;
    const spaceY = 260;
    const reentryEndY = 520;

    let x = baseX;
    let y = baseY;
    let rot = this.actor.rotation;
    let dir = this.actor.dir || 1;

    if (t < T1) {
      // Startup: small jitter, bob
      const p = n01(0, T1);
      const jitter = (1 - p) * 2.5;
      x = baseX + Math.sin(t * 18) * jitter;
      y = baseY + Math.sin(t * 11.5) * (2 + p * 3.5);
      rot = Math.sin(t * 10) * 0.02;
      dir = this.baseDir;
    } else if (t < T2) {
      // Wobble: up a bit, bounce, near-crash, stabilize
      const p = n01(T1, T2);
      const wobble = Math.sin(t * 9.2) * (10 + (1 - p) * 14);
      const dip = Math.sin(p * Math.PI * 2) * 32; // quick dip
      const climb = easeOutCubic(p) * -70;
      x = baseX + Math.sin(t * 3.8) * 18;
      y = baseY + climb + wobble + Math.max(0, dip);
      rot = Math.sin(t * 5.7) * 0.06;
      dir = Math.sin(t * 1.7) > 0 ? 1 : -1;
    } else if (t < T5) {
      // Liftoff + climb to space
      const p = n01(T2, T5);
      const eased = easeInOutCubic(p);
      const targetY = flightY + (spaceY - flightY) * Math.max(0, (eased - 0.25) / 0.75);
      x = baseX + Math.sin(t * 1.8) * (22 + eased * 22);
      y = baseY + (targetY - baseY) * eased + Math.sin(t * 6.5) * (2 + eased * 2);
      rot = Math.sin(t * 4.2) * 0.03;
      dir = Math.cos(t * 1.4) >= 0 ? 1 : -1;
    } else if (t < T6) {
      // Space float
      const p = n01(T5, T6);
      x = baseX + Math.sin(t * 0.9) * 38;
      y = spaceY + Math.sin(t * 2.2) * 8 + (1 - p) * 6;
      rot = Math.sin(t * 2.8) * 0.02;
      dir = Math.cos(t * 0.8) >= 0 ? 1 : -1;
    } else if (t < T7) {
      // Flip for reentry
      const p = easeInOutCubic(n01(T6, T7));
      x = baseX + Math.sin(t * 1.1) * 26;
      y = spaceY + Math.sin(t * 2.0) * 6;
      rot = p * Math.PI;
      dir = Math.cos(t * 0.8) >= 0 ? 1 : -1;
    } else if (t < T8) {
      // Reentry drop
      const p = easeInCubic(n01(T7, T8));
      x = baseX + Math.sin(t * 3.6) * 18;
      y = spaceY + (reentryEndY - spaceY) * p;
      rot = Math.PI + Math.sin(t * 5) * 0.03;
      dir = 1;
    } else {
      // Parachute descent
      const p = easeInOutCubic(n01(T8, T9));
      x = baseX + Math.sin(t * 1.2) * 32;
      y = reentryEndY + (baseY - reentryEndY) * p + Math.sin(t * 2.5) * 6;
      // Ease rotation back upright quickly
      const rP = easeOutCubic(n01(T8, Math.min(T9, T8 + 0.25)));
      rot = Math.PI + (0 - Math.PI) * rP + Math.sin(t * 1.8) * 0.01;
      dir = 1;
    }

    this.actor.x = x;
    this.actor.y = y;
    this.actor.dir = dir;
    this.actor.rotation = rot;

    // Flame particles (no flames after chute)
    const jetsOn = t < T8;
    if (jetsOn && (t > 0.35 || t < T1) && Math.random() < dt * 60) {
      // Reverse thrust during flip phase.
      const reverse = inRange(T6, T7);
      const side = reverse ? -dir : dir;
      const flameX = x - side * 64;
      const flameY = y + 56;
      const vy = reverse ? randRange(-210, -120) : randRange(130, 230);
      this.flames.push({
        x: flameX + randRange(-8, 8),
        y: flameY,
        vx: randRange(-22, 22),
        vy,
        life: randRange(0.18, 0.42),
        size: randRange(6, 14),
        color: Math.random() > 0.4 ? "#ff9335" : "#ffe571",
      });
    }

    // Plasma particles during reentry
    if (inRange(T7, T8) && Math.random() < dt * 120) {
      this.plasma.push({
        x: x + randRange(-18, 18),
        y: y + randRange(-18, 18),
        vx: randRange(-40, 40),
        vy: randRange(-30, 60),
        life: randRange(0.18, 0.45),
        size: randRange(10, 26),
        hue: randInt(16, 42),
      });
      if (this.plasma.length > 140) this.plasma.splice(0, this.plasma.length - 140);
    }

    updateParticles(this.flames, dt, 190);
    updateParticles(this.plasma, dt, 30);
  }

  shouldSuppressTapBursts() {
    return true;
  }

  drawJetpackChicken(ctx, game, { alpha = 1, inOverlay = false } = {}) {
    const chickenJetpack = game.assets.get("chickenJetpack");
    const a = this.actor;

    const w = 254;
    const h = 254;
    const drawX = a.x;
    const drawY = a.y - 22;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(drawX, drawY);
    ctx.rotate(a.rotation);
    ctx.scale(a.dir < 0 ? -1 : 1, 1);
    ctx.drawImage(chickenJetpack, -w / 2, -h / 2, w, h);
    ctx.restore();

    // Flames and plasma are additive; render on top.
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

    if (inOverlay) {
      for (const p of this.plasma) {
        const alpha = Math.max(0, Math.min(1, p.life * 2.4));
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.size);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.25, `hsla(${p.hue}, 98%, 62%, 1)`);
        g.addColorStop(1, "rgba(255, 70, 10, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawParachute(ctx, game, alpha = 1) {
    const parachute = game.assets.get("parachute");
    const a = this.actor;
    const sway = Math.sin(this.elapsed * 2.2) * 10;

    const openT = clamp((this.elapsed - 11.2) / 0.25, 0, 1);
    const pop = easeOutCubic(openT);

    const canopyX = a.x + sway * 0.4;
    const canopyY = a.y - 192 - pop * 8;
    const w = 260 * (0.6 + pop * 0.4);
    const h = 260 * (0.6 + pop * 0.4);

    drawSprite(ctx, parachute, canopyX, canopyY, w, h, { alpha });

    // Strings.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(20, 22, 28, 0.62)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const attachY = canopyY + h * 0.28;
    const leftX = canopyX - w * 0.33;
    const rightX = canopyX + w * 0.33;
    const midX = canopyX;
    const targetX = a.x;
    const targetY = a.y - 34;
    for (const sx of [leftX, midX, rightX]) {
      ctx.beginPath();
      ctx.moveTo(sx, attachY);
      ctx.quadraticCurveTo((sx + targetX) * 0.5, (attachY + targetY) * 0.5 + 24, targetX, targetY);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOverlayBackdrop(ctx, game) {
    const col = game.assets.get("jetpackSkyColumn");
    const scale = game.world.width / col.width;
    const srcH = game.world.height / scale;
    const maxSrcY = Math.max(0, col.height - srcH);
    const srcY = (1 - this.altitude) * maxSrcY;

    ctx.drawImage(col, 0, srcY, col.width, srcH, 0, 0, game.world.width, game.world.height);
  }

  drawFront(ctx, game) {
    // Before overlay takes over, draw in-world so the chicken feels in the pen.
    if (this.overlayAlpha > 0.6) return;
    this.drawJetpackChicken(ctx, game, { alpha: 1, inOverlay: false });
  }

  drawOverlay(ctx, game) {
    if (this.overlayAlpha <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = clamp(this.overlayAlpha, 0, 1);
    this.drawOverlayBackdrop(ctx, game);

    // Add a few extra stars in space for sparkle.
    if (this.altitude > 0.72) {
      const starAlpha = clamp((this.altitude - 0.72) / 0.28, 0, 1) * 0.7;
      ctx.fillStyle = `rgba(255,255,230,${starAlpha})`;
      for (const s of this.stars) {
        const tw = (Math.sin(this.elapsed * 2.6 + s.tw) + 1) * 0.5;
        const r = s.r + tw * 0.55;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Reentry plasma ball (core)
    if (this.elapsed >= 9.9 && this.elapsed < 11.2) {
      const a = this.actor;
      const core = ctx.createRadialGradient(a.x, a.y - 18, 6, a.x, a.y - 18, 160);
      core.addColorStop(0, "rgba(255,255,255,0.95)");
      core.addColorStop(0.22, "rgba(255, 245, 210, 0.62)");
      core.addColorStop(0.55, "rgba(255, 120, 40, 0.35)");
      core.addColorStop(1, "rgba(255, 60, 10, 0)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(a.x, a.y - 18, 160, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Chicken + FX
    this.drawJetpackChicken(ctx, game, { alpha: 1, inOverlay: true });

    if (this.parachuteOn) {
      this.drawParachute(ctx, game, 1);
    }

    ctx.restore();
  }

  onFinish(game) {
    game.chicken.jetpackVisible = false;
    game.chicken.clearController("jetpack");
    game.chicken.cluckTimer = this.prevCluckTimer || 0;

    game.sound.jetpackStop();
    game.sound.windStop();
    game.sound.jetpackMusicStop();

    // Keep the chicken where it started (stable, predictable).
    game.chicken.u = this.baseU;
    game.chicken.v = this.baseV;
    game.chicken.projectFromUV();
    game.chicken.y = game.chicken.groundY;
  }

  shouldHideChicken() {
    return true;
  }

  shouldHideCompanions() {
    return true;
  }

  getCinematicCue(game) {
    const reentry = this.elapsed >= 9.9 && this.elapsed < 11.2;
    const space = this.altitude > 0.7;
    const vignette = space ? 0.34 : 0.18 + this.overlayAlpha * 0.1;
    return {
      priority: 8,
      focusX: this.actor.x,
      focusY: this.actor.y - 30,
      zoom: reentry ? 1.16 : 1.1,
      vignette,
      nightBlend: 0,
      ambienceDuck: reentry ? 0.55 : 0.35,
    };
  }
}

class OuthousePottyAction extends GameAction {
  constructor() {
    // Keep it long enough for storyboarding tools to capture the full beat.
    super({ id: "potty", duration: 11.6, major: true });

    this.state = "approach";
    this.stateTime = 0;

    this.stage = "exterior"; // "exterior" | "interior"
    this.fade = 0; // 0..1 black overlay
    this.light = 0; // 0..1 interior light blend

    this.prevCluckTimer = 0;

    this.actor = {
      u: 0.5,
      v: 0.76,
      x: 800,
      y: 650,
      groundY: 650,
      visualScale: 1,
      dir: 1,
      alpha: 1,
      poseScale: 1,
      swing: 0,
    };

    this.outhouse = {
      u: 0.3,
      v: 0.35,
      doorOpen: false,
    };

    // Interior staging coordinates (tuned to a 1600x900 background).
    this.interior = {
      groundY: 740,
      doorX: 420,
      switchX: 500,
      switchY: 520,
      pottyX: 1020,
      pottyY: 720,
      hopEndX: 1200,
    };

    // Potty contents / flush
    this.waterTint = 0;
    this.contentsAlpha = 0.95;
    this.whirlpool = 0;
    this.strainPulse = 0;
    this.lockedDirtyTint = 0;
    this.swirls = [];
    this.faceSteam = [];
    this.blobs = [
      { x: -11, y: 1, r: 3.4 },
      { x: 7, y: 2, r: 4.3 },
      { x: 15, y: -2, r: 2.6 },
      { x: -2, y: -3, r: 2.8 },
    ];

    // Hop arc
    this.hopStartX = 0;
    this.hopStartY = 0;
    this.hopEndX = 0;
    this.hopDuration = 0.9;
  }

  start(game) {
    this.state = "approach";
    this.stateTime = 0;
    this.elapsed = 0;
    this.stage = "exterior";
    this.fade = 0;
    this.light = 0;

    this.prevCluckTimer = game.chicken.cluckTimer;
    game.chicken.cluckTimer = 999;

    // Freeze the real chicken (we'll draw a cinematic actor instead).
    game.chicken.setController("potty", () => true);

    // Initialize actor from current chicken UV.
    this.actor.u = game.chicken.u;
    this.actor.v = game.chicken.v;
    const projected = game.penSpace.toScreen(this.actor.u, this.actor.v);
    this.actor.x = projected.x;
    this.actor.groundY = projected.y;
    this.actor.y = this.actor.groundY;
    this.actor.visualScale = game.penSpace.depthScale(this.actor.v);
    this.actor.alpha = 1;
    this.actor.poseScale = 1;

    // Outhouse anchor (should match Game.js prop).
    this.outhouse.u = game.outhouse?.u ?? 0.3;
    this.outhouse.v = game.outhouse?.v ?? 0.35;
    this.outhouse.doorOpen = false;
    if (game.outhouse) game.outhouse.doorOpen = false;

    // Reset potty contents.
    this.waterTint = 0;
    this.contentsAlpha = 0.95;
    this.whirlpool = 0;
    this.strainPulse = 0;
    this.lockedDirtyTint = 0;
    this.swirls = [];
    this.faceSteam = [];
  }

  shouldHideChicken() {
    return true;
  }

  shouldHideCompanions() {
    return true;
  }

  shouldSuppressTapBursts() {
    return true;
  }

  setState(next, game) {
    this.state = next;
    this.stateTime = 0;

    if (next === "door-open") {
      this.outhouse.doorOpen = true;
      if (game.outhouse) game.outhouse.doorOpen = true;
      game.sound.doorCreakOpen();
    }

    if (next === "light-on") {
      game.sound.lightSwitch();
    }
    if (next === "light-off") {
      game.sound.lightSwitch();
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
      this.hopStartX = this.actor.x;
      this.hopStartY = this.actor.groundY;
      this.hopEndX = this.interior.hopEndX;
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
  }

  exteriorDoorTarget(game) {
    // Target point slightly in front of the outhouse so it feels "inside the pen".
    const u = clamp(this.outhouse.u - 0.02, 0.08, 0.92);
    const v = clamp(this.outhouse.v + 0.12, 0.14, 0.92);
    const p = game.penSpace.toScreen(u, v);
    return { u, v, x: p.x, y: p.y };
  }

  updateExteriorActor(dt, game, targetU, targetV, speed = 4.2) {
    // Move in pen-space so depth scaling stays coherent.
    this.actor.u += (targetU - this.actor.u) * Math.min(1, dt * speed);
    this.actor.v += (targetV - this.actor.v) * Math.min(1, dt * speed);
    const p = game.penSpace.toScreen(this.actor.u, this.actor.v);
    const prevX = this.actor.x;
    this.actor.x = p.x;
    this.actor.groundY = p.y;
    this.actor.visualScale = game.penSpace.depthScale(this.actor.v);
    this.actor.dir = this.actor.x >= prevX ? 1 : -1;
    this.actor.y = this.actor.groundY + Math.sin(this.elapsed * 10.2) * 2.2;
  }

  updateInteriorActor(dt, targetX, groundY, speed = 4.2) {
    const prevX = this.actor.x;
    this.actor.x += (targetX - this.actor.x) * Math.min(1, dt * speed);
    this.actor.groundY += (groundY - this.actor.groundY) * Math.min(1, dt * 6.0);
    this.actor.visualScale += (1.02 - this.actor.visualScale) * Math.min(1, dt * 3.0);
    this.actor.dir = this.actor.x >= prevX ? 1 : -1;
    this.actor.y = this.actor.groundY + Math.sin(this.elapsed * 11.2) * 2.1;
  }

  update(dt, game) {
    this.elapsed += dt;
    this.stateTime += dt;
    this.strainPulse += dt * 10;

    const d = {
      approach: 1.35,
      doorOpen: 0.35,
      enter: 0.25,
      cutIn: 0.2,
      cutInReveal: 0.2,
      lightOn: 0.6,
      walkToPotty: 0.6,
      sit: 0.4,
      strain: 1.35,
      hop: this.hopDuration,
      reveal: 0.6,
      zoomIn: 0.35,
      flush: 1.2,
      zoomOut: 0.45,
      lightOff: 0.6,
      walkToDoor: 0.5,
      cutOut: 0.2,
      cutOutReveal: 0.2,
      exit: 0.85,
      done: 0.45,
    };

    if (this.stage === "exterior") {
      const door = this.exteriorDoorTarget(game);
      if (this.state === "approach") {
        this.updateExteriorActor(dt, game, door.u, door.v, 3.6);
        if (this.stateTime >= d.approach) this.setState("door-open", game);
      } else if (this.state === "door-open") {
        this.updateExteriorActor(dt, game, door.u, door.v, 6.5);
        if (this.stateTime >= d.doorOpen) this.setState("enter", game);
      } else if (this.state === "enter") {
        // Step "into" the outhouse and fade out.
        const t = Math.min(1, this.stateTime / d.enter);
        this.updateExteriorActor(dt, game, door.u + 0.005, clamp(door.v - 0.06, 0.14, 0.92), 7.2);
        const eased = easeOutCubic(t);
        this.actor.alpha = t > 0.75 ? 0 : 1 - eased;
        if (this.stateTime >= d.enter) this.setState("cut-in", game);
      } else if (this.state === "cut-in") {
        this.fade = Math.min(1, this.stateTime / d.cutIn);
        if (this.stateTime >= d.cutIn) {
          // Switch to interior while fully black.
          this.stage = "interior";
          this.actor.alpha = 1;
          this.actor.visualScale = 1.02;
          this.actor.groundY = this.interior.groundY;
          this.actor.y = this.interior.groundY;
          this.actor.x = this.interior.doorX;
          this.actor.dir = 1;
          this.setState("cut-in-reveal", game);
        }
      } else if (this.state === "cut-out-reveal") {
        // Not used on exterior; handled in interior.
      } else if (this.state === "exit") {
        // Not used on exterior; handled in interior.
      }
    }

    if (this.stage === "interior") {
      if (this.state === "cut-in-reveal") {
        this.fade = 1 - Math.min(1, this.stateTime / d.cutInReveal);
        if (this.stateTime >= d.cutInReveal) this.setState("light-on", game);
      } else if (this.state === "light-on") {
        const t = Math.min(1, this.stateTime / d.lightOn);
        this.updateInteriorActor(dt, this.interior.switchX, this.interior.groundY, 6.5);
        this.light = t;
        if (this.stateTime >= d.lightOn) this.setState("walk-to-potty", game);
      } else if (this.state === "walk-to-potty") {
        this.updateInteriorActor(dt, this.interior.pottyX - 10, this.interior.groundY, 4.8);
        if (this.stateTime >= d.walkToPotty) this.setState("sit", game);
      } else if (this.state === "sit") {
        this.updateInteriorActor(dt, this.interior.pottyX - 10, this.interior.groundY, 9.2);
        if (this.stateTime >= d.sit) this.setState("strain", game);
      } else if (this.state === "strain") {
        // Dirty while seated; keep invariant for storyboards.
        this.waterTint = Math.min(1, this.stateTime / 1.15);
        this.updateInteriorActor(dt, this.interior.pottyX - 10, this.interior.groundY, 12);

        if (Math.random() < dt * 9) {
          this.faceSteam.push({
            x: this.interior.pottyX - 6 + randRange(2, 20),
            y: this.interior.pottyY - 92 + randRange(-3, 3),
            vx: randRange(-5, 10),
            vy: randRange(-28, -16),
            life: randRange(0.35, 0.6),
            size: randRange(5, 10),
          });
        }

        if (this.stateTime >= d.strain) this.setState("hop", game);
      } else if (this.state === "hop") {
        const t = Math.min(1, this.stateTime / this.hopDuration);
        const eased = easeOutCubic(t);
        this.actor.poseScale = 1;
        this.actor.dir = 1;
        this.actor.x = this.hopStartX + (this.hopEndX - this.hopStartX) * eased;
        this.actor.groundY = this.interior.groundY;
        this.actor.y = this.hopStartY + 6 - Math.sin(Math.PI * t) * 66;
        if (this.stateTime >= this.hopDuration) this.setState("reveal", game);
      } else if (this.state === "reveal") {
        this.contentsAlpha = 1;
        this.waterTint = this.lockedDirtyTint;
        this.updateInteriorActor(dt, this.interior.hopEndX, this.interior.groundY, 7.5);
        if (this.stateTime >= d.reveal) this.setState("zoom-in", game);
      } else if (this.state === "zoom-in") {
        this.updateInteriorActor(dt, this.interior.hopEndX, this.interior.groundY, 7.5);
        if (this.stateTime >= d.zoomIn) this.setState("flush", game);
      } else if (this.state === "flush") {
        this.whirlpool = Math.min(1, this.stateTime / 1.2);
        this.contentsAlpha = Math.max(0, 1 - this.whirlpool * 1.15);
        if (this.stateTime >= d.flush) this.setState("zoom-out", game);
      } else if (this.state === "zoom-out") {
        if (this.stateTime >= d.zoomOut) this.setState("light-off", game);
      } else if (this.state === "light-off") {
        const t = Math.min(1, this.stateTime / d.lightOff);
        this.updateInteriorActor(dt, this.interior.switchX, this.interior.groundY, 6.5);
        this.light = Math.max(0, 1 - t);
        if (this.stateTime >= d.lightOff) this.setState("walk-to-door", game);
      } else if (this.state === "walk-to-door") {
        this.updateInteriorActor(dt, this.interior.doorX, this.interior.groundY, 5.8);
        if (this.stateTime >= d.walkToDoor) this.setState("cut-out", game);
      } else if (this.state === "cut-out") {
        this.fade = Math.min(1, this.stateTime / d.cutOut);
        if (this.stateTime >= d.cutOut) {
          // Switch to exterior while fully black.
          this.stage = "exterior";
          this.fade = 1;

          const door = this.exteriorDoorTarget(game);
          this.actor.u = door.u + 0.005;
          this.actor.v = clamp(door.v - 0.06, 0.14, 0.92);
          const p = game.penSpace.toScreen(this.actor.u, this.actor.v);
          this.actor.x = p.x;
          this.actor.groundY = p.y;
          this.actor.visualScale = game.penSpace.depthScale(this.actor.v);
          this.actor.y = this.actor.groundY;
          this.actor.dir = 1;
          this.actor.alpha = 0;

          this.setState("cut-out-reveal", game);
        }
      } else if (this.state === "cut-out-reveal") {
        this.fade = 1 - Math.min(1, this.stateTime / d.cutOutReveal);
        if (this.stateTime >= d.cutOutReveal) this.setState("exit", game);
      }
    }

    if (this.stage === "exterior") {
      const door = this.exteriorDoorTarget(game);
      if (this.state === "cut-out-reveal") {
        this.fade = 1 - Math.min(1, this.stateTime / d.cutOutReveal);
        if (this.stateTime >= d.cutOutReveal) this.setState("exit", game);
      } else if (this.state === "exit") {
        // Fade actor back in and step outward.
        // Avoid translucent "ghosting" at the doorway; snap visible once the beat starts.
        this.actor.alpha = this.stateTime < 0.24 ? 0 : 1;
        this.updateExteriorActor(dt, game, door.u, clamp(door.v + 0.05, 0.14, 0.92), 5.8);

        const tDoor = Math.min(1, this.stateTime / d.exit);
        if (tDoor > 0.65 && this.outhouse.doorOpen) {
          this.outhouse.doorOpen = false;
          if (game.outhouse) game.outhouse.doorOpen = false;
          game.sound.doorCreakClose();
        }

        if (this.stateTime >= d.exit) this.setState("done", game);
      } else if (this.state === "done") {
        if (this.stateTime >= 0.12 && this.outhouse.doorOpen) {
          this.outhouse.doorOpen = false;
          if (game.outhouse) game.outhouse.doorOpen = false;
        }
        if (this.stateTime >= d.done) this.finish(game);
      }
    }

    for (const swirl of this.swirls) {
      swirl.angle += dt * swirl.spin;
      swirl.life -= dt;
    }
    for (let i = this.swirls.length - 1; i >= 0; i -= 1) {
      if (this.swirls[i].life <= 0) this.swirls.splice(i, 1);
    }

    updateParticles(this.faceSteam, dt, -8);
  }

  drawChickenActor(ctx, chickenSprite, opts = {}) {
    // Small alpha values can read as a "ghost" during cuts. Snap to fully hidden.
    if ((this.actor.alpha || 0) < 0.08) return;

    const extraScale = typeof opts.scale === "number" ? opts.scale : 1;
    const skipShadow = !!opts.skipShadow;
    const extraYOffset = typeof opts.yOffset === "number" ? opts.yOffset : 0;

    const size = 224 * this.actor.visualScale * this.actor.poseScale * extraScale;
    const drawX = this.actor.x;
    const drawY = this.actor.y - 62 * this.actor.visualScale + extraYOffset * this.actor.visualScale;
    const shadowW = 66 * this.actor.visualScale;
    const shadowH = 17 * this.actor.visualScale;

    ctx.save();
    ctx.globalAlpha = this.actor.alpha;
    ctx.translate(drawX, drawY);

    if (!skipShadow) {
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath();
      ctx.ellipse(0, 106 * this.actor.visualScale, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const swing = Math.sin(this.elapsed * (8.8 + this.actor.visualScale * 2.2)) * 0.05;
    const baseRotation = typeof opts.rotation === "number" ? opts.rotation : 0;
    const swingScale = typeof opts.swingScale === "number" ? opts.swingScale : 1;
    ctx.rotate(baseRotation + swing * swingScale * this.actor.dir);
    ctx.scale(this.actor.dir, 1);
    ctx.drawImage(chickenSprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawPottyContents(ctx, pottyX, pottyY, scale = 1) {
    // Tuned to the open-bowl `potty` sprite so contents sit in the basin.
    const cx = pottyX + (-7) * scale;
    const cy = pottyY + (-11) * scale;
    const rx = 31 * scale;
    const ry = 11 * scale;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    const r = Math.round(132 + (236 - 132) * this.waterTint);
    const g = Math.round(206 + (205 - 206) * this.waterTint);
    const b = Math.round(255 + (86 - 255) * this.waterTint);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.86 * this.contentsAlpha})`;
    ctx.fillRect(cx - rx - 3 * scale, cy - ry - 4 * scale, rx * 2 + 6 * scale, ry * 2 + 8 * scale);

    if (this.waterTint > 0.45) {
      const blobAlpha = Math.min(0.65, ((this.waterTint - 0.45) / 0.55) * this.contentsAlpha);
      ctx.fillStyle = `rgba(150, 106, 72, ${blobAlpha})`;
      for (const blob of this.blobs) {
        ctx.beginPath();
        ctx.ellipse(
          cx + blob.x * scale,
          cy + blob.y * scale,
          blob.r * scale,
          blob.r * 0.75 * scale,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    if (this.whirlpool > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.58 * this.contentsAlpha})`;
      ctx.lineWidth = 1.8 * scale;
      for (let i = 0; i < 3; i += 1) {
        const rr = (4 + i * 5 + this.whirlpool * 2) * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, this.elapsed * 6 + i * 0.8, this.elapsed * 6 + i * 0.8 + Math.PI * 1.35);
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(245, 246, 250, ${0.62 * this.whirlpool * this.contentsAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, (2 + this.whirlpool * 3.5) * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = "rgba(120, 130, 148, 0.68)";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawFront(ctx, game) {
    // Exterior actor only; interior draws in drawOverlay so it can fully cover the world.
    if (this.stage !== "exterior") return;

    const chickenSprite = game.assets.get("chicken");
    if (this.actor.alpha > 0.01) this.drawChickenActor(ctx, chickenSprite);
  }

	  drawOverlay(ctx, game) {
	    if (this.stage === "interior") {
	      const off = game.assets.get("outhouseInteriorOff");
	      const on = game.assets.get("outhouseInteriorOn");

      ctx.drawImage(off, 0, 0, game.world.width, game.world.height);
      if (this.light > 0.001) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.light));
        ctx.drawImage(on, 0, 0, game.world.width, game.world.height);
        ctx.restore();
      }

	      const potty = game.assets.get("potty");
	      const chickenSprite = game.assets.get("chicken");

	      // Slight warm light pool under the potty for readability.
	      if (this.state === "sit" || this.state === "strain" || this.state === "reveal" || this.state === "zoom-in" || this.state === "flush") {
	        ctx.fillStyle = `rgba(255, 243, 189, ${0.18 + this.light * 0.32})`;
	        ctx.beginPath();
        ctx.ellipse(this.interior.pottyX + 4, this.interior.pottyY - 14, 44, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(72, 80, 92, 0.2)";
	      ctx.beginPath();
	      ctx.ellipse(this.interior.pottyX + 2, this.interior.pottyY + 48, 72, 18, 0, 0, Math.PI * 2);
	      ctx.fill();

	      const seatedPose = this.state === "sit";
	      const strainPose = this.state === "strain";
	      const poseSprite = potty;
	      // Keep potty size consistent across all beats; old sit/strain composites caused "shrinking" and palette shifts.
	      const poseW = 224;
	      const poseH = 191;

	      drawSprite(ctx, poseSprite, this.interior.pottyX, this.interior.pottyY, poseW, poseH, {
	        rotation: Math.sin(this.elapsed * 7) * 0.01,
	      });

	      if (!seatedPose && !strainPose) {
	        this.drawPottyContents(ctx, this.interior.pottyX, this.interior.pottyY, poseW / 198);
	      }

      for (const steam of this.faceSteam) {
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, steam.life * 0.5)})`;
        ctx.beginPath();
        ctx.ellipse(steam.x, steam.y, steam.size * 0.9, steam.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }

	      for (const swirl of this.swirls) {
	        const x = this.interior.pottyX + Math.cos(swirl.angle) * swirl.r * 0.6;
	        const y = this.interior.pottyY - 18 + Math.sin(swirl.angle * 1.2) * swirl.r * 0.35;
	        ctx.strokeStyle = `rgba(130, 220, 255, ${Math.max(0, swirl.life * 0.8)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 6 + swirl.r * 0.06, 0, Math.PI * 2);
        ctx.stroke();
	      }

	      // Draw the chicken with posed offsets for sit/strain to keep palette and sizing consistent.
	      if (seatedPose) {
	        this.drawChickenActor(ctx, chickenSprite, {
	          yOffset: 38,
	          scale: 1.0,
	          rotation: 0.01,
	          swingScale: 0.2,
	          skipShadow: true,
	        });
	      } else if (strainPose) {
	        const pulse = 1 + Math.sin(this.strainPulse) * 0.03;
	        this.drawChickenActor(ctx, chickenSprite, {
	          yOffset: 38,
	          scale: 1.0 * pulse,
	          rotation: Math.sin(this.strainPulse * 0.55) * 0.03,
	          swingScale: 0.1,
	          skipShadow: true,
	        });
	      } else {
	        this.drawChickenActor(ctx, chickenSprite);
	      }
	    }

    if (this.fade > 0.001) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, this.fade))})`;
      ctx.fillRect(0, 0, game.world.width, game.world.height);
      ctx.restore();
    }
  }

  onFinish(game) {
    game.chicken.clearController("potty");
    game.chicken.cluckTimer = this.prevCluckTimer || 0;

    if (game.outhouse) game.outhouse.doorOpen = false;

    // Place the real chicken at the actor's last exterior position for a seamless return.
    if (this.stage === "exterior") {
      const uv = game.penSpace.fromScreen(this.actor.x, this.actor.groundY);
      game.chicken.u = clamp(uv.u, 0.08, 0.92);
      game.chicken.v = clamp(uv.v, 0.14, 0.92);
      game.chicken.projectFromUV();
      game.chicken.y = game.chicken.groundY;
    }
  }

	  getCinematicCue(game) {
	    if (this.stage === "interior") {
	      const flushBeat = this.state === "zoom-in" || this.state === "flush";
	      return {
	        priority: 11,
	        focusX: flushBeat ? this.interior.pottyX - 6 : this.actor.x,
	        focusY: flushBeat ? this.interior.pottyY - 18 : this.actor.y - 40,
	        zoom: flushBeat ? 1.28 : 1.06,
	        vignette: flushBeat ? 0.32 : 0.25,
	        nightBlend: 0,
	        ambienceDuck: flushBeat ? 0.48 : 0.38,
	      };
	    }

    const door = this.exteriorDoorTarget(game);
    const focusX = (this.actor.x + door.x) * 0.5;
    const focusY = (this.actor.groundY + door.y) * 0.5 - 20;
    const heroBeat = this.state === "door-open" || this.state === "enter";
    return {
      priority: 11,
      focusX,
      focusY,
      zoom: heroBeat ? 1.08 : 1.06,
      vignette: heroBeat ? 0.26 : 0.22,
      nightBlend: 0,
      ambienceDuck: heroBeat ? 0.3 : 0.26,
    };
  }
}

class PeekabooCoopAction extends GameAction {
  constructor() {
    // Duration is a safeguard only; the action is tap-gated during interior hiding.
    super({ id: "peekaboo-coop", duration: 45, major: true });

    this.stage = "exterior"; // "exterior" | "interior"
    this.fade = 0; // 0..1 black cut overlay

    this.state = "approach";
    this.stateTime = 0;

    this.baseU = 0.5;
    this.baseV = 0.76;
    this.prevCluckTimer = 0;

    this.roundIndex = 0;
    this.rounds = [
      { kind: "hay", x: 520, y: 760, w: 270, h: 170, stick: "right" },
      { kind: "barrel", x: 1080, y: 770, w: 210, h: 250, stick: "left" },
      { kind: "eggs", x: 800, y: 780, w: 190, h: 230, stick: "right" },
    ];

    this.actor = {
      x: 800,
      y: 650,
      groundY: 650,
      visualScale: 1,
      dir: 1,
      alpha: 1,
      poseScale: 1,
    };

    this.sparkles = [];
    this.confetti = [];

    this.surpriseAlpha = 0; // 0..1, drawn on pop-out

    this.exitDoorOpened = false;
    this.exitDoorClosed = false;

    this.prevCoopDoorOpen = false;
    this.hideWiggleDelay = 4.6;
    this.hideWiggleStarted = false;
  }

  shouldHideChicken() {
    return true;
  }

  shouldHideCompanions() {
    return true;
  }

  shouldSuppressTapBursts() {
    return true;
  }

  start(game) {
    this.elapsed = 0;
    this.stage = "exterior";
    this.fade = 0;

    this.state = "approach";
    this.stateTime = 0;

    this.baseU = game.chicken.u;
    this.baseV = game.chicken.v;

    this.prevCluckTimer = game.chicken.cluckTimer;
    game.chicken.cluckTimer = 999;

    // Freeze the real chicken; render a cinematic actor instead.
    game.chicken.setController("peekaboo-coop", () => true);

    this.actor.x = game.chicken.x;
    this.actor.groundY = game.chicken.groundY;
    this.actor.y = this.actor.groundY;
    this.actor.visualScale = game.chicken.visualScale;
    this.actor.dir = game.chicken.dir || 1;
    this.actor.alpha = 1;
    this.actor.poseScale = 1;

    this.prevCoopDoorOpen = !!game.coop?.doorOpen;
    if (game.coop) game.coop.doorOpen = false;

    this.sparkles = [];
    this.confetti = [];

    this.roundIndex = 0;
    // Shuffle the hide order so the kid has to "search" a bit.
    for (let i = this.rounds.length - 1; i > 0; i -= 1) {
      const j = randInt(0, i);
      const tmp = this.rounds[i];
      this.rounds[i] = this.rounds[j];
      this.rounds[j] = tmp;
    }
    this.surpriseAlpha = 0;

    this.exitDoorOpened = false;
    this.exitDoorClosed = false;
    this.hideWiggleStarted = false;
  }

  setState(next, game) {
    this.state = next;
    this.stateTime = 0;
  }

  onTap(game, _tap) {
    // Peekaboo is an interactive mini-scene: taps should advance it, not start new actions.
    if (this.stage === "interior" && this.state === "hide-wait") {
      const tap = _tap || { x: 0, y: 0 };
      const round = this.currentRound();
      // Only the correct prop should reveal the chicken; wrong guesses just "tap".
      const hit = this.propContainsPoint(round, tap.x, tap.y);
      if (hit) {
        this.setState("pop-out", game);
      } else {
        game.sound.tap();
      }
      return true;
    }
    return true;
  }

  coopMetrics(game) {
    const sprite = game.assets.get(game.coop?.doorOpen ? "coopOpen" : "coopClosed");
    const u = game.coop?.u ?? 0.7;
    const v = game.coop?.v ?? 0.64;
    const p = game.penSpace.toScreen(u, v);
    const s = game.penSpace.depthScale(v);
    const spriteW = sprite?.width || 760;
    const spriteH = sprite?.height || 620;
    const aspect = spriteW / Math.max(1, spriteH);
    const h = 290 * s;
    const w = h * aspect;
    const x = p.x;
    const y = p.y;
    return { sprite, x, y, w, h, s };
  }

  spawnSparklesAt(x, y, count, scale = 1) {
    for (let i = 0; i < count; i += 1) {
      this.sparkles.push({
        x: x + randRange(-22, 22) * scale,
        y: y + randRange(-18, 18) * scale,
        vx: randRange(-120, 120),
        vy: randRange(-160, -40),
        life: randRange(0.45, 0.85),
        size: randRange(5, 14) * scale,
        hue: randInt(28, 62),
      });
    }
    if (this.sparkles.length > 180) this.sparkles.splice(0, this.sparkles.length - 180);
  }

  spawnConfettiAt(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      this.confetti.push({
        x: x + randRange(-170, 170),
        y: y + randRange(-8, 14),
        vx: randRange(-190, 190),
        vy: randRange(-260, -120),
        life: randRange(1.2, 2.2),
        angle: randRange(0, Math.PI * 2),
        spin: randRange(-8, 8),
        color: ["#ffd84d", "#ff8ad5", "#6df1ff", "#95ff7f", "#ff9e54"][randInt(0, 4)],
      });
    }
  }

  currentRound() {
    return this.rounds[clamp(this.roundIndex, 0, this.rounds.length - 1)];
  }

  roundChickenHiddenPose(round) {
    const s = 1.02;
    const stickRight = round.stick === "right";
    return {
      // Place the chicken "inside" the prop so the prop can cover most of it.
      x: round.x + (stickRight ? round.w * 0.08 : -round.w * 0.08),
      y: round.y - 24,
      dir: stickRight ? 1 : -1,
      scale: s,
    };
  }

  roundChickenPopPose(round) {
    const s = 1.06;
    const stickRight = round.stick === "right";
    return {
      x: round.x + (stickRight ? round.w * 0.85 : -round.w * 0.85),
      y: round.y - 20,
      dir: stickRight ? 1 : -1,
      scale: s,
    };
  }

  update(dt, game) {
    // Do not call super.update(): this action is tap-gated during hiding.
    this.elapsed += dt;
    this.stateTime += dt;

    const d = {
      approach: 1.1,
      doorOpen: 0.35,
      enter: 0.7,
      cutIn: 0.35,
      interiorReveal: 0.35,
      popOut: 0.85,
      moveHide: 0.55,
      celebrate: 0.9,
      cutOut: 0.35,
      exitReveal: 0.25,
      exit: 0.7,
    };

    const m = this.coopMetrics(game);
    this.surpriseAlpha *= 0.92;

    if (this.state === "approach") {
      // Walk to the coop "door" area.
      const doorX = m.x - m.w * 0.08;
      const tx = doorX;
      this.actor.visualScale = game.penSpace.depthScale(game.coop?.v ?? 0.64);
      this.actor.groundY = m.y;
      this.actor.x += (tx - this.actor.x) * Math.min(1, dt * 5.2);
      this.actor.y = this.actor.groundY + Math.sin(this.elapsed * 11.0) * 2.2;
      this.actor.dir = this.actor.x <= tx ? 1 : -1;
      this.actor.alpha = 1;

      if (this.stateTime >= d.approach) {
        this.setState("door-open", game);
      }
    } else if (this.state === "door-open") {
      if (this.stateTime < dt * 1.2) {
        if (game.coop) game.coop.doorOpen = true;
        game.sound.doorCreakOpen();
      }
      if (this.stateTime >= d.doorOpen) this.setState("enter", game);
    } else if (this.state === "enter") {
      const t = clamp(this.stateTime / d.enter, 0, 1);
      // Slip behind the coop and fade out as if entering.
      const hideX = m.x - m.w * 0.02;
      this.actor.x += (hideX - this.actor.x) * Math.min(1, dt * 7.0);
      this.actor.groundY = m.y;
      this.actor.y = this.actor.groundY + Math.sin(this.elapsed * 10.8) * 2.2;
      this.actor.alpha = 1 - easeInOutCubic(t);
      this.actor.visualScale = game.penSpace.depthScale(game.coop?.v ?? 0.64);
      this.actor.dir = 1;

      if (this.stateTime >= d.enter) {
        if (game.coop) game.coop.doorOpen = false;
        game.sound.doorCreakClose();
        this.setState("cut-in", game);
      }
    } else if (this.state === "cut-in") {
      this.fade = clamp(this.stateTime / d.cutIn, 0, 1);
      if (this.stateTime >= d.cutIn) {
        this.stage = "interior";
        this.fade = 1;
        this.setState("interior-reveal", game);
      }
    } else if (this.state === "interior-reveal") {
      this.fade = 1 - clamp(this.stateTime / d.interiorReveal, 0, 1);
      // Snap to the hidden pose; only a small hint is shown during hide-wait.
      this.actor.alpha = 0;
      this.actor.visualScale = 1.02;
      this.actor.poseScale = 1;
      const round = this.currentRound();
      const hidden = this.roundChickenHiddenPose(round);
      this.actor.x = hidden.x;
      this.actor.y = hidden.y + Math.sin(this.elapsed * 11.2) * 1.8;
      this.actor.dir = hidden.dir;
      if (this.stateTime >= d.interiorReveal) {
        this.fade = 0;
        this.hideWiggleStarted = false;
        this.setState("hide-wait", game);
      }
    } else if (this.state === "hide-wait") {
      // Hold indefinitely until tapped.
      const round = this.currentRound();
      const hidden = this.roundChickenHiddenPose(round);
      this.actor.alpha = 0;
      this.actor.visualScale = 1.02;
      this.actor.poseScale = 1;
      this.actor.dir = hidden.dir;
      this.actor.x = hidden.x + Math.sin(this.elapsed * 0.9) * 1.8;
      this.actor.y = hidden.y + Math.sin(this.elapsed * 11.2) * 2.4;

      if (!this.hideWiggleStarted && this.stateTime >= this.hideWiggleDelay) {
        this.hideWiggleStarted = true;
        game.sound.cluck({ gain: 0.28, rate: 1.12 });
      }
    } else if (this.state === "pop-out") {
      const round = this.currentRound();
      const hidden = this.roundChickenHiddenPose(round);
      const pop = this.roundChickenPopPose(round);
      const t = clamp(this.stateTime / 0.28, 0, 1);
      const tt = easeOutCubic(t);
      this.actor.alpha = 1;
      this.actor.visualScale = lerp(hidden.scale, pop.scale, tt);
      this.actor.poseScale = 1 + Math.sin(this.stateTime * 12) * 0.03;
      this.actor.dir = pop.dir;
      this.actor.x = lerp(hidden.x, pop.x, tt);
      this.actor.y = lerp(hidden.y, pop.y, tt) - Math.sin(tt * Math.PI) * 22;

      if (this.stateTime < dt * 1.2) {
        game.sound.peekabooChorus({ gain: 0.98 });
        // Subtle sparkle burst at the pop point.
        this.spawnSparklesAt(pop.x, pop.y - 70, 12, 1.0);
        this.surpriseAlpha = 1;
      }

      // Keep the surprise face up for a beat.
      this.surpriseAlpha = Math.max(this.surpriseAlpha, 1 - clamp((this.stateTime - 0.55) / 0.25, 0, 1));

      if (this.stateTime >= d.popOut) {
        if (this.roundIndex >= 2) {
          game.sound.confettiSprinkle({ gain: 1.0 });
          this.spawnConfettiAt(800, 420, 46);
          this.setState("celebrate", game);
        } else {
          this.roundIndex += 1;
          game.sound.starTwinkle({ gain: 0.85 });
          this.hideWiggleStarted = false;
          this.setState("move-hide", game);
        }
      }
    } else if (this.state === "move-hide") {
      const round = this.currentRound();
      const hidden = this.roundChickenHiddenPose(round);
      this.actor.alpha = 1;
      this.actor.visualScale += (hidden.scale - this.actor.visualScale) * Math.min(1, dt * 6.0);
      this.actor.poseScale = 1;
      this.actor.dir = hidden.dir;
      this.actor.x += (hidden.x - this.actor.x) * Math.min(1, dt * 5.6);
      this.actor.y += (hidden.y - this.actor.y) * Math.min(1, dt * 5.6);
      this.actor.y += Math.sin(this.elapsed * 11.6) * 1.4;

      if (this.stateTime >= d.moveHide) {
        this.actor.alpha = 0;
        this.setState("hide-wait", game);
      }
    } else if (this.state === "celebrate") {
      this.actor.poseScale = 1 + Math.sin(this.elapsed * 8.0) * 0.05;
      this.actor.y += Math.sin(this.elapsed * 12.4) * 0.8;
      if (this.stateTime >= d.celebrate) this.setState("cut-out", game);
    } else if (this.state === "cut-out") {
      this.fade = clamp(this.stateTime / d.cutOut, 0, 1);
      if (this.stateTime >= d.cutOut) {
        this.stage = "exterior";
        this.fade = 1;
        this.setState("exit-reveal", game);
      }
    } else if (this.state === "exit-reveal") {
      this.fade = 1 - clamp(this.stateTime / d.exitReveal, 0, 1);
      if (!this.exitDoorOpened && this.stateTime < dt * 1.2) {
        this.exitDoorOpened = true;
        if (game.coop) game.coop.doorOpen = true;
        game.sound.doorCreakOpen();
      }
      // Reappear just behind the coop, then step out.
      this.actor.visualScale = game.penSpace.depthScale(game.coop?.v ?? 0.64);
      this.actor.alpha = 1;
      this.actor.dir = 1;
      this.actor.groundY = m.y;
      this.actor.x = m.x - m.w * 0.02;
      this.actor.y = this.actor.groundY + Math.sin(this.elapsed * 10.8) * 2.0;
      if (this.stateTime >= d.exitReveal) {
        this.fade = 0;
        this.setState("exit", game);
      }
    } else if (this.state === "exit") {
      const t = clamp(this.stateTime / d.exit, 0, 1);
      const tx = m.x - m.w * 0.22;
      this.actor.x += (tx - this.actor.x) * Math.min(1, dt * 6.2);
      this.actor.groundY = m.y;
      this.actor.y = this.actor.groundY + Math.sin(this.elapsed * 10.2) * 2.2;
      this.actor.alpha = 1;
      this.actor.visualScale = game.penSpace.depthScale(game.coop?.v ?? 0.64);
      if (!this.exitDoorClosed && this.stateTime >= d.exit * 0.72) {
        this.exitDoorClosed = true;
        if (game.coop) game.coop.doorOpen = false;
        game.sound.doorCreakClose();
      }
      if (this.stateTime >= d.exit) this.finish(game);
    }

    for (const sp of this.sparkles) {
      sp.vx *= 0.992;
      sp.vy += 240 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt;
    }
    for (let i = this.sparkles.length - 1; i >= 0; i -= 1) {
      if (this.sparkles[i].life <= 0) this.sparkles.splice(i, 1);
    }

    for (const bit of this.confetti) {
      bit.vy += 340 * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.life -= dt;
      bit.angle += bit.spin * dt;
    }
    for (let i = this.confetti.length - 1; i >= 0; i -= 1) {
      const b = this.confetti[i];
      if (b.life <= 0 || b.y > game.world.height + 30) this.confetti.splice(i, 1);
    }
  }

  drawChickenActor(ctx, sprite, opts = {}) {
    if ((this.actor.alpha || 0) < 0.08) return;
    const skipShadow = !!opts.skipShadow;
    const size = 224 * this.actor.visualScale * this.actor.poseScale;
    const drawX = this.actor.x;
    const drawY = this.actor.y - 62 * this.actor.visualScale;
    const shadowW = 66 * this.actor.visualScale;
    const shadowH = 17 * this.actor.visualScale;

    ctx.save();
    ctx.globalAlpha = this.actor.alpha;
    ctx.translate(drawX, drawY);

    if (!skipShadow) {
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath();
      ctx.ellipse(0, 106 * this.actor.visualScale, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const swing = Math.sin(this.elapsed * (8.8 + this.actor.visualScale * 2.2)) * 0.05;
    ctx.rotate(swing * this.actor.dir);
    ctx.scale(this.actor.dir, 1);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);

    if (this.surpriseAlpha > 0.02) {
      const a = clamp(this.surpriseAlpha, 0, 1);
      const s = size / 224;
      // Simple "surprised" face overlay: big eyes + open beak.
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(-22 * s, -34 * s, 11.5 * s, 0, Math.PI * 2);
      ctx.arc(16 * s, -36 * s, 11.5 * s, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(20,22,28,0.9)";
      ctx.beginPath();
      ctx.arc(-21 * s, -33 * s, 4.2 * s, 0, Math.PI * 2);
      ctx.arc(17 * s, -35 * s, 4.2 * s, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 168, 68, 0.92)";
      ctx.beginPath();
      ctx.ellipse(-3 * s, -12 * s, 13 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawCoop(ctx, game) {
    // Coop is a permanent pen fixture (drawn by Game); action does not draw it here.
  }

  drawCoopInterior(ctx, game) {
    // Simple painted interior (no sprite dependency): warm wood walls + straw floor.
    const w = game.world.width;
    const h = game.world.height;

    const wall = ctx.createLinearGradient(0, 0, 0, h * 0.72);
    wall.addColorStop(0, "rgba(244, 222, 182, 1)");
    wall.addColorStop(1, "rgba(214, 180, 126, 1)");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    // Planks
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let y = 40; y < h * 0.72; y += 34) {
      const shade = 1 + Math.sin(y * 0.07 + this.elapsed * 0.2) * 0.08;
      ctx.fillStyle = `rgba(${Math.round(120 * shade)}, ${Math.round(86 * shade)}, ${Math.round(54 * shade)}, 1)`;
      ctx.fillRect(0, y, w, 2);
    }
    ctx.restore();

    const floorY = 640;
    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, "rgba(182, 132, 72, 1)");
    floor.addColorStop(1, "rgba(142, 96, 48, 1)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, w, h - floorY);

    // Straw scribbles
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(255, 232, 150, 1)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 137) % w) + 40;
      const y = floorY + 30 + ((i * 91) % 210);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 40, y - 10, x + 90, y + 8);
      ctx.stroke();
    }
    ctx.restore();

    // Subtle vignette so the interior reads like a cutscene.
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, w, h);
  }

  drawInteriorProp(ctx, game, round) {
    // Props are placed in interior coordinates; y is treated as "ground" baseline.
    const x = round.x;
    const y = round.y;
    const w = round.w;
    const h = round.h;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y + 22, w * 0.36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    if (round.kind === "hay") {
      const hay = game.assets.get("hay");
      drawSprite(ctx, hay, x, y - h * 0.55, w, h, { alpha: 1 });
    } else if (round.kind === "eggs") {
      const egg = game.assets.get("egg");
      // A simple stack: 3 eggs with slight offsets.
      drawSprite(ctx, egg, x - 36, y - 78, w * 0.55, h * 0.62, { alpha: 1 });
      drawSprite(ctx, egg, x + 22, y - 70, w * 0.58, h * 0.66, { alpha: 1 });
      drawSprite(ctx, egg, x - 6, y - 30, w * 0.62, h * 0.7, { alpha: 1 });
    } else {
      // Barrel (procedural)
      const gx = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      gx.addColorStop(0, "rgba(146, 62, 40, 1)");
      gx.addColorStop(0.5, "rgba(190, 86, 52, 1)");
      gx.addColorStop(1, "rgba(126, 52, 34, 1)");

      ctx.fillStyle = gx;
      ctx.strokeStyle = "rgba(70, 30, 22, 0.45)";
      ctx.lineWidth = 4;
      // Avoid ctx.roundRect() for broader Safari/iPad compatibility.
      const r = 26;
      const x0 = x - w / 2;
      const x1 = x + w / 2;
      const y0 = y - h;
      const y1 = y;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.lineTo(x1 - r, y0);
      ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
      ctx.lineTo(x1, y1 - r);
      ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
      ctx.lineTo(x0 + r, y1);
      ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
      ctx.lineTo(x0, y0 + r);
      ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 220, 170, 0.18)";
      ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i += 1) {
        const yy = y - h * (0.28 + 0.23 * (i + 1));
        ctx.beginPath();
        ctx.moveTo(x - w * 0.46, yy);
        ctx.lineTo(x + w * 0.46, yy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSparkles(ctx) {
    if (!this.sparkles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const sp of this.sparkles) {
      const a = clamp(sp.life * 2.4, 0, 1);
      if (a <= 0.001) continue;
      ctx.globalAlpha = a;
      const col = `hsla(${sp.hue}, 98%, 72%, 1)`;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawConfetti(ctx) {
    for (const bit of this.confetti) {
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.angle);
      ctx.fillStyle = bit.color;
      ctx.globalAlpha = Math.max(0, bit.life * 0.55);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawFront(ctx, game) {
    const chickenSprite = game.assets.get("chicken");

    if (this.stage !== "exterior") return;

    // Exterior: draw the cinematic chicken actor (the base chicken is frozen/hidden).
    // Some beats need the coop to occlude the chicken (enter/exit-reveal); those are drawn in drawPenFx instead.
    const behindCoop = this.state === "enter" || this.state === "exit-reveal";
    if (!behindCoop) this.drawChickenActor(ctx, chickenSprite, { skipShadow: true });
    this.drawConfetti(ctx);
    this.drawSparkles(ctx);
  }

  drawPenFx(ctx, game) {
    if (this.stage !== "exterior") return;
    const behindCoop = this.state === "enter" || this.state === "exit-reveal";
    if (!behindCoop) return;

    // Draw on top of pen ground, underneath coop + fence rails/posts.
    const chickenSprite = game.assets.get("chicken");
    this.drawChickenActor(ctx, chickenSprite, { skipShadow: false });
  }

  getCinematicCue(game) {
    if (this.stage === "interior") {
      // Keep all 3 props on screen so the kid can search.
      const focusX = 800;
      const focusY = 560;
      return {
        priority: 10,
        focusX,
        focusY,
        zoom: this.state === "pop-out" ? 1.12 : 1.06,
        vignette: 0.42,
        nightBlend: 0,
        ambienceDuck: 0.55,
      };
    }

    const m = this.coopMetrics(game);
    return {
      priority: 9,
      focusX: m.x,
      focusY: m.y - m.h * 0.35,
      zoom: 1.1,
      vignette: 0.34,
      nightBlend: 0,
      ambienceDuck: 0.45,
    };
  }

  drawOverlay(ctx, game) {
    if (this.stage === "interior") {
      this.drawCoopInterior(ctx, game);

      const chickenSprite = game.assets.get("chicken");
      const round = this.currentRound();
      const showFullChicken = this.state === "pop-out" || this.state === "move-hide" || this.state === "celebrate";

      // The kid should always see all 3 hiding objects.
      for (const prop of this.rounds) {
        const isHiddenProp = prop === round;
        if (this.state === "hide-wait" && isHiddenProp) {
          this.drawPeekHint(ctx, game, prop);
        }
        this.drawInteriorProp(ctx, game, prop);
      }
      if (showFullChicken) {
        this.drawChickenActor(ctx, chickenSprite, { skipShadow: true });
      }

      this.drawConfetti(ctx);
      this.drawSparkles(ctx);
    }

    if (this.fade > 0.001) {
      ctx.fillStyle = `rgba(0,0,0,${clamp(this.fade, 0, 1)})`;
      ctx.fillRect(0, 0, game.world.width, game.world.height);
    }
  }

  onFinish(game) {
    game.chicken.clearController("peekaboo-coop");
    game.chicken.cluckTimer = this.prevCluckTimer || 0;

    if (game.coop) game.coop.doorOpen = this.prevCoopDoorOpen;

    game.chicken.u = this.baseU;
    game.chicken.v = this.baseV;
    game.chicken.projectFromUV();
    game.chicken.y = game.chicken.groundY;
  }

  propContainsPoint(round, x, y) {
    // Interior props use pixel coordinates; treat (x,y) as world coords.
    const x0 = round.x - round.w / 2;
    const x1 = round.x + round.w / 2;
    const y0 = round.y - round.h;
    const y1 = round.y;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  drawPeekHint(ctx, game, round) {
    const hint = game.assets.get("chickenPeek");
    if (!hint) return;
    const stickRight = round.stick === "right";
    const wiggle = this.hideWiggleStarted ? clamp((this.stateTime - this.hideWiggleDelay) / 1.6, 0, 1) : 0;
    const wiggleAmp = 1 + wiggle * 3.4;
    const wobX = Math.sin(this.elapsed * (10.2 + wiggle * 2.2)) * wiggleAmp;
    const wobY = Math.cos(this.elapsed * (12.0 + wiggle * 2.8)) * wiggleAmp * 0.55;
    const rot = Math.sin(this.elapsed * (8.5 + wiggle * 2.8)) * 0.08 * wiggle;

    const x = round.x + (stickRight ? round.w * 0.44 : -round.w * 0.44) + wobX;
    const y = round.y - round.h * 0.62 + wobY;
    const w = 120;
    const h = 120;

    // Our hint sprite may include a "prop edge" guide line; crop it off so it reads cleanly next to any prop.
    const srcW = hint.width || 420;
    const srcH = hint.height || 420;
    const cropW = Math.floor(srcW * 0.84);
    const cropX = stickRight ? 0 : srcW - cropW; // keep the chicken side, crop the edge-line side

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(!stickRight ? -1 : 1, 1);
    ctx.drawImage(hint, cropX, 0, cropW, srcH, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}


class DiscoAction extends GameAction {
  constructor() {
    super({ id: "disco", duration: 8.0, major: true });
    this.tiles = [];
  }

  start(game) {
    const cols = 7;
    const rows = 4;
    this.tiles = [];
    const insetU = 0.06;
    const insetV = 0.08;
    const u0 = insetU;
    const u1 = 1 - insetU;
    const v0 = insetV;
    const v1 = 1 - insetV;
    const du = (u1 - u0) / cols;
    const dv = (v1 - v0) / rows;

    for (let ry = 0; ry < rows; ry += 1) {
      for (let rx = 0; rx < cols; rx += 1) {
        this.tiles.push({
          u0: u0 + rx * du,
          u1: u0 + (rx + 1) * du,
          v0: v0 + ry * dv,
          v1: v0 + (ry + 1) * dv,
          phase: randRange(0, Math.PI * 2),
          hueSeed: randRange(0, 360),
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
    // Keep drawBack light; the heavy lifting (floor + beams) is drawn in drawPenFx
    // so it layers above the pen ground.
    // Intentionally empty.
  }

  drawPenFx(ctx, game) {
    const p = game.penSpace;

    // Beat-synced pulses to make the lights feel musical.
    const bpm = 125;
    const beat = (this.elapsed * bpm) / 60;
    const beatPhase = beat % 1;
    const thump = Math.pow(1 - Math.abs(beatPhase * 2 - 1), 3); // 0..1..0

    // Moving beams (drawn without pen clip so they streak across the scene).
    const beamCount = 6;
    const centerX = game.pen.x + game.pen.w / 2;
    const centerY = game.pen.y - 170;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < beamCount; i += 1) {
      const angle = this.elapsed * 1.65 + (i / beamCount) * Math.PI * 2;
      const targetX = centerX + Math.cos(angle) * 650;
      const targetY = centerY + Math.sin(angle) * 280 + 360;

      const gradient = ctx.createLinearGradient(centerX, centerY, targetX, targetY);
      gradient.addColorStop(0, `rgba(255,255,255,${0.22 + thump * 0.16})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 22 + thump * 10;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
    }
    ctx.restore();

    // Pen-clipped dance floor tiles.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.backLeft.x, p.backLeft.y);
    ctx.lineTo(p.backRight.x, p.backRight.y);
    ctx.lineTo(p.frontRight.x, p.frontRight.y);
    ctx.lineTo(p.frontLeft.x, p.frontLeft.y);
    ctx.closePath();
    ctx.clip();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const tile of this.tiles) {
      const a = p.toScreen(tile.u0, tile.v0);
      const b = p.toScreen(tile.u1, tile.v0);
      const c = p.toScreen(tile.u1, tile.v1);
      const d = p.toScreen(tile.u0, tile.v1);

      const glow = (Math.sin(this.elapsed * 6.2 + tile.phase) + 1) * 0.5;
      const hue = (tile.hueSeed + this.elapsed * 160 + tile.phase * 90) % 360;
      const light = 34 + glow * 32 + thump * 18;
      const alpha = 0.62 + glow * 0.18 + thump * 0.12;

      ctx.fillStyle = `hsla(${hue}, 98%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();

      // Tile "edge" highlight to make the grid read even in motion.
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + glow * 0.08 + thump * 0.08})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
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

  drawOverlay(ctx, game) {
    // Extra darkness so disco reads as a club even on bright devices.
    const bpm = 125;
    const beat = (this.elapsed * bpm) / 60;
    const pulse = (Math.sin(beat * Math.PI * 2) + 1) * 0.5; // 0..1
    const alpha = 0.08 + pulse * 0.06;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, game.world.width, game.world.height);
  }

  getCinematicCue(game) {
    return {
      priority: 9,
      focusX: game.penSpace.anchors.center.x,
      focusY: game.penSpace.anchors.center.y - 30,
      zoom: 1.06,
      vignette: 0.42,
      nightBlend: 0.92,
      ambienceDuck: 0.58,
    };
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
    this.impactSoundPlayed = false;
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

        if (!this.impactSoundPlayed && this.bounceTimer <= 0) {
          this.impactSoundPlayed = true;
          this.bounceTimer = 0.12;
          game.sound.hayBaleDrop();
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
    this.sfxTimer = 0;
  }

  start(game) {
    // Audible but gentle: one cue on start, then occasional soft sprinkles while it falls.
    this.sfxTimer = randRange(0.65, 1.05);
    game.sound.confettiSprinkle({ gain: 1.0 });
  }

  update(dt, game) {
    super.update(dt, game);

    this.sfxTimer -= dt;
    if (this.sfxTimer <= 0) {
      this.sfxTimer = randRange(0.75, 1.25);
      game.sound.confettiSprinkle({ gain: 0.75 });
    }

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
    this.twinkleTimer = 0;
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

    this.twinkleTimer -= dt;
    if (this.twinkleTimer <= 0) {
      // Keep it a vibe, not a metronome.
      this.twinkleTimer = randRange(0.7, 1.25);
      game.sound.starTwinkle({ gain: 0.9 });
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
  registry.register({ id: "potty", weight: 2.4, create: () => new OuthousePottyAction() });
  registry.register({ id: "peekaboo-coop", weight: 0.95, create: () => new PeekabooCoopAction() });
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
