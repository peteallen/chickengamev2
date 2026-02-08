import { clamp, lerp } from "./math.js";

const DEFAULT_STATE = {
  focusX: 800,
  focusY: 450,
  zoom: 1,
  vignette: 0,
  nightBlend: 0,
  ambienceDuck: 0,
};

export class CinematicDirector {
  constructor(world) {
    this.world = world;
    this.state = { ...DEFAULT_STATE };
  }

  update(dt, game, actions) {
    let target = {
      ...DEFAULT_STATE,
      focusX: this.world.width * 0.5,
      focusY: this.world.height * 0.54,
    };

    let bestPriority = -Infinity;
    for (const action of actions) {
      if (typeof action.getCinematicCue !== "function") continue;
      const cue = action.getCinematicCue(game);
      if (!cue) continue;
      const priority = cue.priority ?? 0;
      if (priority >= bestPriority) {
        bestPriority = priority;
        target = {
          ...target,
          ...cue,
          focusX: cue.focusX ?? target.focusX,
          focusY: cue.focusY ?? target.focusY,
          zoom: cue.zoom ?? target.zoom,
          vignette: cue.vignette ?? target.vignette,
          nightBlend: cue.nightBlend ?? target.nightBlend,
          ambienceDuck: cue.ambienceDuck ?? target.ambienceDuck,
        };
      }
    }

    const smooth = clamp(dt * 4.6, 0, 1);
    this.state.focusX = lerp(this.state.focusX, clamp(target.focusX, 0, this.world.width), smooth);
    this.state.focusY = lerp(this.state.focusY, clamp(target.focusY, 0, this.world.height), smooth);
    // Allow hero beats to punch in further (e.g. potty flush zoom) while keeping bounds tight.
    this.state.zoom = lerp(this.state.zoom, clamp(target.zoom, 1, 1.32), smooth);
    this.state.vignette = lerp(this.state.vignette, clamp(target.vignette, 0, 0.55), smooth);
    this.state.nightBlend = lerp(this.state.nightBlend, clamp(target.nightBlend, 0, 1), smooth);
    this.state.ambienceDuck = lerp(this.state.ambienceDuck, clamp(target.ambienceDuck, 0, 0.75), smooth);
  }

  drawOverlay(ctx, game) {
    const { nightBlend, vignette } = this.state;

    if (nightBlend > 0.01) {
      const sky = ctx.createLinearGradient(0, 0, 0, game.world.height * 0.62);
      sky.addColorStop(0, `rgba(15, 22, 44, ${0.62 * nightBlend})`);
      sky.addColorStop(1, `rgba(36, 45, 75, ${0.35 * nightBlend})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, game.world.width, game.world.height);

      ctx.fillStyle = `rgba(255, 255, 210, ${0.32 * nightBlend})`;
      for (let i = 0; i < 56; i += 1) {
        const x = ((i * 179) % game.world.width) + Math.sin(game.time * 0.3 + i) * 7;
        const y = ((i * 97) % (game.world.height * 0.48)) + 16;
        const r = 0.8 + ((i * 13) % 4) * 0.45;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Darken the whole world a bit more so night reads as "night", not just a tinted sky.
      ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * nightBlend})`;
      ctx.fillRect(0, 0, game.world.width, game.world.height);
    }

    if (vignette > 0.01) {
      const focusR = 300 + (1 - vignette) * 120;
      const g = ctx.createRadialGradient(
        this.state.focusX,
        this.state.focusY,
        focusR * 0.35,
        this.state.focusX,
        this.state.focusY,
        focusR * 1.8,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(12, 14, 20, ${vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, game.world.width, game.world.height);
    }
  }
}
