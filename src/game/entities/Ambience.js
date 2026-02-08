import { randRange } from "../core/math.js";

export class Ambience {
  constructor(world) {
    this.world = world;
    this.time = 0;

    this.clouds = Array.from({ length: 6 }, () => ({
      x: randRange(0, world.width),
      y: randRange(50, 260),
      scale: randRange(0.8, 1.25),
      speed: randRange(6, 17),
      puff: randRange(0, Math.PI * 2),
    }));

    this.insects = Array.from({ length: 9 }, () => ({
      x: randRange(80, world.width - 80),
      y: randRange(world.height * 0.45, world.height - 140),
      vx: randRange(-22, 22),
      phase: randRange(0, Math.PI * 2),
      hue: randRange(42, 80),
      size: randRange(2.6, 4.1),
    }));

    this.sparkles = Array.from({ length: 14 }, () => ({
      x: randRange(30, world.width - 30),
      y: randRange(world.height * 0.56, world.height - 24),
      twinkle: randRange(0, Math.PI * 2),
      hue: randRange(30, 52),
    }));
  }

  update(dt) {
    this.time += dt;

    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > this.world.width + 220) {
        cloud.x = -220;
        cloud.y = randRange(50, 250);
      }
    }

    for (const insect of this.insects) {
      insect.phase += dt * randRange(0.8, 1.3);
      insect.x += insect.vx * dt;
      insect.y += Math.sin(this.time * 4 + insect.phase) * 16 * dt;

      if (insect.x < 20 || insect.x > this.world.width - 20) {
        insect.vx *= -1;
      }
      if (Math.random() < dt * 0.4) {
        insect.vx += randRange(-15, 15);
      }
      insect.vx = Math.max(-45, Math.min(45, insect.vx));
      insect.y = Math.max(this.world.height * 0.44, Math.min(this.world.height - 120, insect.y));
    }
  }

  drawBack(ctx, weather = { raining: false, nightBlend: 0 }) {
    const nightBlend = weather.nightBlend || 0;
    if (!weather.raining && nightBlend < 0.2) {
      this.drawSun(ctx, 1 - nightBlend * 1.5);
    } else {
      this.drawRainShade(ctx, weather);
    }
    this.drawClouds(ctx, weather);
  }

  drawFront(ctx, weather = { raining: false, nightBlend: 0 }) {
    if (!weather.raining && (weather.nightBlend || 0) < 0.32) {
      this.drawSparkles(ctx);
    }
    this.drawInsects(ctx, weather);
    this.drawGrass(ctx, weather);
  }

  drawSun(ctx, alpha = 1) {
    const x = this.world.width - 160;
    const y = 110;
    const pulse = 1 + Math.sin(this.time * 1.7) * 0.025;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.time * 0.14);
    for (let i = 0; i < 12; i += 1) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.strokeStyle = "rgba(245, 203, 96, 0.52)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(46, 0);
      ctx.lineTo(70, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#f7da72";
    ctx.beginPath();
    ctx.arc(x, y, 45 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(224, 168, 74, 0.6)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 45 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawRainShade(ctx, weather = { raining: false, nightBlend: 0 }) {
    const night = weather.nightBlend || 0;
    ctx.fillStyle = `rgba(115, 135, 148, ${0.15 + night * 0.16})`;
    ctx.fillRect(0, 0, this.world.width, this.world.height * 0.64);
  }

  drawClouds(ctx, weather) {
    const night = weather.nightBlend || 0;
    const opacity = weather.raining ? 0.7 : 0.58;
    for (const cloud of this.clouds) {
      const x = cloud.x;
      const y = cloud.y + Math.sin(this.time * 0.7 + cloud.puff) * 6;
      const s = cloud.scale;

      if (weather.raining) {
        ctx.fillStyle = `rgba(230,236,241,${Math.max(0.2, opacity - night * 0.2)})`;
      } else {
        const c = Math.round(255 - night * 120);
        ctx.fillStyle = `rgba(${c},${c},${c + 5},${Math.max(0.2, opacity - night * 0.12)})`;
      }
      ctx.beginPath();
      ctx.ellipse(x - 48 * s, y + 4 * s, 56 * s, 32 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x, y - 12 * s, 70 * s, 42 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 58 * s, y + 7 * s, 54 * s, 30 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawInsects(ctx, weather) {
    if (weather.raining || (weather.nightBlend || 0) > 0.35) return;

    for (const bug of this.insects) {
      const flap = Math.sin(this.time * 23 + bug.phase) * 2;
      ctx.save();
      ctx.translate(bug.x, bug.y + Math.sin(this.time * 5 + bug.phase) * 5);

      ctx.fillStyle = `hsla(${bug.hue}, 84%, 58%, 0.84)`;
      ctx.beginPath();
      ctx.arc(0, 0, bug.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.beginPath();
      ctx.ellipse(-bug.size, -bug.size, bug.size, 1.6 + Math.abs(flap), -0.6, 0, Math.PI * 2);
      ctx.ellipse(bug.size, -bug.size, bug.size, 1.6 + Math.abs(flap), 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  drawSparkles(ctx) {
    for (const sparkle of this.sparkles) {
      const twinkle = (Math.sin(this.time * 2.6 + sparkle.twinkle) + 1) * 0.5;
      const radius = 1.3 + twinkle * 1.5;
      ctx.fillStyle = `hsla(${sparkle.hue}, 88%, 69%, ${0.14 + twinkle * 0.34})`;
      ctx.beginPath();
      ctx.arc(sparkle.x, sparkle.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGrass(ctx, weather) {
    const baseY = this.world.height - 8;
    const night = weather.nightBlend || 0;
    const bladeColor = weather.raining
      ? `rgba(78, 147, 90, ${0.5 - night * 0.2})`
      : `rgba(64, 154, 75, ${0.48 - night * 0.2})`;
    for (let x = -40; x < this.world.width + 40; x += 30) {
      const sway = Math.sin(this.time * 2 + x * 0.04) * 4;
      ctx.strokeStyle = bladeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + sway * 0.5, baseY - 14, x + sway, baseY - 28);
      ctx.stroke();
    }
  }
}
