import { ActionRegistry } from "./actions/ActionRegistry.js";
import { registerDefaultActions } from "./actions/DefaultActions.js";
import { AssetLoader } from "./core/AssetLoader.js";
import { CinematicDirector } from "./core/CinematicDirector.js";
import { PenSpace } from "./core/PenSpace.js";
import { SoundEngine } from "./core/SoundEngine.js";
import { clamp, randRange } from "./core/math.js";
import { Ambience } from "./entities/Ambience.js";
import { Chicken } from "./entities/Chicken.js";
import { CompanionChick } from "./entities/CompanionChick.js";

const ASSET_MANIFEST = {
  chicken: "./public/assets/sprites/locked/chicken.png?v=locked3",
  chick: "./public/assets/sprites/locked/chick.png?v=locked3",
  feather: "./public/assets/sprites/locked/feather.png?v=feather1",
  egg: "./public/assets/sprites/locked/egg.png?v=locked3",
  potty: "./public/assets/sprites/locked/potty.png?v=locked4",
  pottySit: "./public/assets/sprites/locked/potty-sit.png?v=locked1",
  pottyStrain: "./public/assets/sprites/locked/potty-strain.png?v=locked1",
  jetpack: "./public/assets/sprites/locked/jetpack.png?v=locked3",
  chickenJetpack: "./public/assets/sprites/locked/chicken-jetpack.png?v=locked1",
  jetpackSkyColumn: "./public/assets/sprites/locked/jetpack-sky-column.png?v=locked1",
  parachute: "./public/assets/sprites/locked/parachute.png?v=locked1",
  discoBall: "./public/assets/sprites/locked/disco-ball.png?v=locked3",
  coop: "./public/assets/sprites/locked/coop.png?v=locked1",
  tractor: "./public/assets/sprites/locked/tractor.png?v=locked3",
  hay: "./public/assets/sprites/locked/hay.png?v=locked3",
  butterfly: "./public/assets/sprites/locked/butterfly.png?v=locked3",
  rainCloud: "./public/assets/sprites/locked/rain-cloud.png?v=locked3",
  rainbow: "./public/assets/sprites/locked/rainbow.png?v=locked3",
  barn: "./public/assets/sprites/locked/barn.png?v=locked5",
  outhouseClosed: "./public/assets/sprites/locked/outhouse-closed.png?v=locked1",
  outhouseOpen: "./public/assets/sprites/locked/outhouse-open.png?v=locked1",
  outhouseInteriorOff: "./public/assets/sprites/locked/outhouse-interior-off.png?v=locked1",
  outhouseInteriorOn: "./public/assets/sprites/locked/outhouse-interior-on.png?v=locked1",
};

export class Game {
  constructor({ canvas, loadingEl }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.loadingEl = loadingEl;

    this.world = { width: 1600, height: 900 };
    this.pen = {
      x: 170,
      y: 390,
      w: 1260,
      h: 340,
      skew: 210,
    };
    this.penSpace = new PenSpace(this.pen);

    this.assets = new AssetLoader(ASSET_MANIFEST);
    this.sound = new SoundEngine();
    this.registry = new ActionRegistry();
    registerDefaultActions(this.registry);
    this.cinematic = new CinematicDirector(this.world);

    this.ambience = new Ambience(this.world);
    this.chicken = new Chicken({
      u: 0.5,
      v: 0.76,
      penSpace: this.penSpace,
    });
    this.chicken.setPenSpace(this.penSpace);

    this.companions = [];
    this.activeActions = [];
    this.tapBursts = [];
    this.flowers = this.createFlowerDots();

    this.isRaining = false;

    // Static pen prop (kept simple; actions can temporarily flip door state).
    this.outhouse = { u: 0.3, v: 0.35, doorOpen: false };

    this.view = {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      baseScale: 1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };

    this.time = 0;
    this.lastFrame = 0;
    this.raf = 0;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.loop = this.loop.bind(this);
  }

  createFlowerDots() {
    const dots = [];
    for (let i = 0; i < 64; i += 1) {
      dots.push({
        x: randRange(20, this.world.width - 20),
        y: randRange(360, this.world.height - 120),
        r: randRange(1.7, 4.4),
        hue: Math.random() > 0.5 ? 52 : 40,
      });
    }
    return dots;
  }

  async init() {
    await this.assets.loadAll();

    this.onResize();
    this.bindEvents();

    this.loadingEl?.classList.add("hidden");

    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.sound.stopAllLoops();
  }

  onVisibilityChange() {
    if (document.hidden) {
      this.sound.stopAllLoops();
    }
  }

  onResize() {
    this.view.width = window.innerWidth;
    this.view.height = window.innerHeight;
    this.view.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.max(1, Math.floor(this.view.width * this.view.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.view.height * this.view.dpr));
    this.canvas.style.width = `${this.view.width}px`;
    this.canvas.style.height = `${this.view.height}px`;

    this.view.baseScale = Math.max(this.view.width / this.world.width, this.view.height / this.world.height);
  }

  async onPointerDown(event) {
    await this.sound.unlock();

    const { x, y } = this.screenToWorld(event.clientX, event.clientY);
    this.tapBursts.push({ x, y, life: 0.45, size: 12 + Math.random() * 14 });

    const tapInsidePen = this.isInsidePen(x, y);
    const tapOnChicken = this.chicken.containsPoint(x, y);

    // Allow active actions to consume taps (for interactive beats like peekaboo).
    for (let i = this.activeActions.length - 1; i >= 0; i -= 1) {
      const action = this.activeActions[i];
      if (typeof action.onTap !== "function") continue;
      const consumed = action.onTap(this, { x, y, tapInsidePen, tapOnChicken }) === true;
      if (consumed) return;
    }

    if (tapOnChicken || tapInsidePen) {
      this.sound.cluck();
      this.triggerRandomAction();
      return;
    }

    if (Math.random() < 0.2) {
      this.sound.bubblePop();
    }
  }

  screenToWorld(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = screenX - rect.left;
    const localY = screenY - rect.top;

    return {
      x: (localX - this.view.offsetX) / this.view.scale,
      y: (localY - this.view.offsetY) / this.view.scale,
    };
  }

  isInsidePen(x, y) {
    return this.penSpace.containsPoint(x, y);
  }

  triggerRandomAction(preferredId = null) {
    const action = preferredId ? this.registry.createById(preferredId) || this.registry.next() : this.registry.next();
    if (!action) return;

    if (action.id === "potty" || action.id === "peekaboo-coop" || action.id === "feather-tornado") {
      // Hero cutscenes read best without overlapping scene clutter.
      for (let i = this.activeActions.length - 1; i >= 0; i -= 1) {
        const existing = this.activeActions[i];
        existing.cancel(this);
        this.activeActions.splice(i, 1);
      }
    }

    for (let i = this.activeActions.length - 1; i >= 0; i -= 1) {
      const existing = this.activeActions[i];
      const majorConflict = action.major && existing.major;
      const weatherConflict =
        (action.id === "rainbow-rain" && existing.id === "sun-party") ||
        (action.id === "sun-party" && existing.id === "rainbow-rain") ||
        (action.id === "fireworks" && (existing.id === "sun-party" || existing.id === "rainbow-rain")) ||
        (existing.id === "fireworks" && (action.id === "sun-party" || action.id === "rainbow-rain"));

      if (majorConflict || weatherConflict) {
        existing.cancel(this);
        this.activeActions.splice(i, 1);
      }
    }

    if (!action.major) {
      const minors = this.activeActions.filter((candidate) => !candidate.major);
      if (minors.length >= 2) {
        const oldestMinor = minors.sort((a, b) => b.elapsed - a.elapsed)[0];
        oldestMinor.cancel(this);
        this.activeActions = this.activeActions.filter((candidate) => candidate !== oldestMinor);
      }
    }

    action.start(this);
    this.activeActions.push(action);
  }

  spawnCompanion() {
    if (this.companions.length >= 4) return;

    this.companions.push(
      new CompanionChick({
        u: clamp(this.chicken.u + randRange(-0.08, 0.08), 0.08, 0.92),
        v: clamp(this.chicken.v + randRange(0.02, 0.08), 0.16, 0.92),
        penSpace: this.penSpace,
      }),
    );
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;

    this.update(dt);
    this.render();

    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.time += dt;

    this.ambience.update(dt);
    this.chicken.update(dt, this);

    for (const chick of this.companions) {
      chick.update(dt, this.chicken);
    }

    for (let i = this.activeActions.length - 1; i >= 0; i -= 1) {
      const action = this.activeActions[i];
      action.update(dt, this);
      if (action.finished) {
        this.activeActions.splice(i, 1);
      }
    }

    this.isRaining = this.activeActions.some((action) => action.id === "rainbow-rain");
    this.cinematic.update(dt, this, this.activeActions);
    this.sound.setDuck(this.cinematic.state.ambienceDuck);

    for (const burst of this.tapBursts) {
      burst.life -= dt;
      burst.size += dt * 150;
    }

    for (let i = this.tapBursts.length - 1; i >= 0; i -= 1) {
      if (this.tapBursts[i].life <= 0) {
        this.tapBursts.splice(i, 1);
      }
    }
  }

  updateCameraTransform() {
    const zoom = this.cinematic.state.zoom || 1;
    const scale = this.view.baseScale * zoom;
    this.view.scale = scale;

    const focusX = this.cinematic.state.focusX || this.world.width * 0.5;
    const focusY = this.cinematic.state.focusY || this.world.height * 0.54;

    let offsetX = this.view.width * 0.5 - focusX * scale;
    let offsetY = this.view.height * 0.5 - focusY * scale;

    const minX = this.view.width - this.world.width * scale;
    const minY = this.view.height - this.world.height * scale;

    if (minX >= 0) {
      offsetX = (this.view.width - this.world.width * scale) * 0.5;
    } else {
      offsetX = clamp(offsetX, minX, 0);
    }
    if (minY >= 0) {
      offsetY = (this.view.height - this.world.height * scale) * 0.5;
    } else {
      offsetY = clamp(offsetY, minY, 0);
    }

    this.view.offsetX = offsetX;
    this.view.offsetY = offsetY;
  }

  render() {
    const ctx = this.ctx;
    if (!ctx) return;

    this.updateCameraTransform();

    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
    ctx.clearRect(0, 0, this.view.width, this.view.height);

    ctx.save();
    ctx.translate(this.view.offsetX, this.view.offsetY);
    ctx.scale(this.view.scale, this.view.scale);

    this.drawWorld(ctx);

    ctx.restore();
  }

  terrainBackYAt(x) {
    return 392 + Math.sin(x * 0.0032 + 0.2) * 28 + Math.sin(x * 0.0015 + 1.3) * 16;
  }

  terrainMidYAt(x) {
    return 518 + Math.sin(x * 0.0028 + 1.1) * 30 + Math.sin(x * 0.0049 + 0.35) * 16;
  }

  terrainYAt(x) {
    return 624 + Math.sin(x * 0.0024 + 0.5) * 8 + Math.sin(x * 0.0043 + 2.2) * 4;
  }

  drawWorld(ctx) {
    const weather = {
      raining: this.isRaining,
      nightBlend: this.cinematic.state.nightBlend,
    };

    this.drawBackground(ctx, weather);
    this.ambience.drawBack(ctx, weather);

    const hideBaseChicken = this.activeActions.some(
      (action) => typeof action.shouldHideChicken === "function" && action.shouldHideChicken(this),
    );
    const hideCompanions = this.activeActions.some(
      (action) => typeof action.shouldHideCompanions === "function" && action.shouldHideCompanions(this),
    );

    for (const action of this.activeActions) {
      action.drawBack(ctx, this);
    }

    this.drawPenBack(ctx);

    const actors = [];
    if (!hideCompanions) {
      for (const chick of this.companions) {
        actors.push({
          y: chick.groundY,
          draw: () => chick.draw(ctx, this.assets.get("chick")),
        });
      }
    }
    if (!hideBaseChicken) {
      actors.push({
        y: this.chicken.groundY,
        draw: () => this.chicken.draw(ctx, this.assets.get("chicken")),
      });
    }
    actors.sort((a, b) => a.y - b.y);
    for (const actor of actors) {
      actor.draw();
    }

    for (const action of this.activeActions) {
      action.drawFront(ctx, this);
    }

    this.drawPenFront(ctx);
    this.ambience.drawFront(ctx, weather);
    // Overlays (like rain streaks) should read "in front of everything" in the world.
    // Draw them after ambience so grass doesn't cover them.
    for (const action of this.activeActions) {
      action.drawOverlay(ctx, this);
    }
    this.cinematic.drawOverlay(ctx, this);
    this.drawTapBursts(ctx);
  }

  drawTerrainBand(ctx, yAt, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, yAt(0));
    for (let x = 16; x <= this.world.width; x += 16) {
      ctx.lineTo(x, yAt(x));
    }
    ctx.lineTo(this.world.width, this.world.height);
    ctx.lineTo(0, this.world.height);
    ctx.closePath();
    ctx.fill();
  }

  drawBackground(ctx, weather) {
    const night = weather.nightBlend || 0;
    const skyTop = this.isRaining ? "#b9d3e1" : "#cfefff";
    const skyBottom = this.isRaining ? "#d5e7ef" : "#def5ff";
    const hillBack = this.isRaining ? "#b0cf95" : "#b8e09a";
    const hillMid = this.isRaining ? "#9fc782" : "#a8de80";
    const grass = this.isRaining ? "#84be63" : "#86cf5d";

    const sky = ctx.createLinearGradient(0, 0, 0, this.world.height * 0.62);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.world.width, this.world.height);

    this.drawTerrainBand(ctx, (x) => this.terrainBackYAt(x), hillBack);
    this.drawTerrainBand(ctx, (x) => this.terrainMidYAt(x), hillMid);

    this.drawTerrainBand(ctx, (x) => this.terrainYAt(x), grass);

    const barn = this.assets.get("barn");

    ctx.save();
    ctx.globalAlpha = this.isRaining ? 0.9 : 1;

			    const barnW = 226;
			    const barnH = 210;
			    const barnX = 1310;
		    // Match the terrain band's polyline sampling (16px) so props align to the visible ridge.
		    const terrainBackYRendered = (x) => {
		      const step = 16;
		      const x0 = Math.floor(x / step) * step;
		      const x1 = Math.min(this.world.width, x0 + step);
		      const y0 = this.terrainBackYAt(x0);
		      const y1 = this.terrainBackYAt(x1);
		      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
		      return y0 + (y1 - y0) * t;
		    };

			    // Use the lowest (max Y) point under the barn footprint so it doesn't "float" on sloped terrain.
			    let barnBaseY = -Infinity;
			    for (let x = barnX; x <= barnX + barnW; x += 8) {
			      barnBaseY = Math.max(barnBaseY, terrainBackYRendered(x));
			    }
			    barnBaseY += 0;

				    // Nudge down so the base reads as grounded.
				    const barnY = barnBaseY - barnH + 46;

				    ctx.fillStyle = "rgba(70, 88, 56, 0.14)";
				    // Barn shadow clipped to the hill (so it can't float in the sky).
				    const barnCX = barnX + barnW * 0.5;
				    const shadowY = terrainBackYRendered(barnCX) + 7;
			    const shadowAngle = Math.atan2(
			      terrainBackYRendered(barnCX + 16) - terrainBackYRendered(barnCX - 16),
			      32,
			    );
			    ctx.save();
			    ctx.beginPath();
			    ctx.moveTo(0, terrainBackYRendered(0));
			    for (let x = 16; x <= this.world.width; x += 16) {
			      ctx.lineTo(x, terrainBackYRendered(x));
			    }
			    ctx.lineTo(this.world.width, this.world.height);
			    ctx.lineTo(0, this.world.height);
			    ctx.closePath();
			    ctx.clip();
			    ctx.fillStyle = "rgba(70, 88, 56, 0.12)";
			    ctx.beginPath();
			    ctx.ellipse(barnCX, shadowY, 70, 9, shadowAngle, 0, Math.PI * 2);
				    ctx.fill();
				    ctx.restore();

			    ctx.drawImage(barn, barnX, barnY, barnW, barnH);
			    ctx.restore();

    for (const dot of this.flowers) {
      const twinkle = 0.4 + Math.sin(this.time * 2.1 + dot.x * 0.02 + dot.y * 0.01) * 0.25;
      ctx.fillStyle = `hsla(${dot.hue}, 90%, 72%, ${Math.max(0.1, twinkle - night * 0.25)})`;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.isRaining) {
      ctx.fillStyle = "rgba(108, 126, 138, 0.16)";
      ctx.fillRect(0, 0, this.world.width, this.world.height);
    }
  }

  drawFenceRail(ctx, side, lift, width = 9, alpha = 1) {
    const a = this.penSpace.edgePoint(side, 0);
    const b = this.penSpace.edgePoint(side, 1);
    ctx.strokeStyle = `rgba(173, 112, 56, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - lift);
    ctx.lineTo(b.x, b.y - lift);
    ctx.stroke();
  }

  drawPenBack(ctx) {
    const p = this.penSpace;
    const bl = p.backLeft;
    const br = p.backRight;
    const fr = p.frontRight;
    const fl = p.frontLeft;

    ctx.fillStyle = "#efd399";
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(fr.x, fr.y);
    ctx.lineTo(fl.x, fl.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(184, 137, 80, 0.27)";
    ctx.lineWidth = 8;
    for (let i = 1; i <= 9; i += 1) {
      const v = i / 10;
      const a = p.toScreen(0.04, v);
      const b = p.toScreen(0.96, v);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Allow actions to draw effects that should appear on top of the pen "ground"
    // but underneath fence rails/posts and props.
    for (const action of this.activeActions) {
      if (typeof action.drawPenFx === "function") action.drawPenFx(ctx, this);
    }

    this.drawFenceRail(ctx, "back", 4, 12, 1);
    this.drawFenceRail(ctx, "back", 30, 10, 1);
    this.drawFenceRail(ctx, "left", 4, 10, 0.92);
    this.drawFenceRail(ctx, "left", 26, 8, 0.92);
    this.drawFenceRail(ctx, "right", 4, 10, 0.92);
    this.drawFenceRail(ctx, "right", 26, 8, 0.92);

    ctx.fillStyle = "#c88b50";
    for (let i = 0; i <= 11; i += 1) {
      const t = i / 11;
      const post = p.edgePoint("back", t);
      ctx.fillRect(post.x - 7, post.y - 42, 14, 58);
    }
    for (let i = 1; i <= 4; i += 1) {
      const t = i / 5;
      const leftPost = p.edgePoint("left", t);
      const rightPost = p.edgePoint("right", t);
      ctx.fillRect(leftPost.x - 6, leftPost.y - 34, 12, 52);
      ctx.fillRect(rightPost.x - 6, rightPost.y - 34, 12, 52);
    }

    this.drawOuthouse(ctx);
  }

	  drawOuthouse(ctx) {
	    const outhouse = this.assets.get(this.outhouse?.doorOpen ? "outhouseOpen" : "outhouseClosed");
	    const u = this.outhouse?.u ?? 0.3;
	    const v = this.outhouse?.v ?? 0.35;

	    const p = this.penSpace.toScreen(u, v);
	    const s = this.penSpace.depthScale(v);

	    // Keep sprite proportions correct (no squishing); size scales with pen depth.
	    const spriteW = outhouse?.width || 760;
	    const spriteH = outhouse?.height || 620;
	    const aspect = spriteW / spriteH;
	    // Match the prior vertical footprint, but preserve aspect ratio so it doesn't read squished.
	    const h = 270 * s;
	    const w = h * aspect;
	    const x = p.x;
	    const y = p.y;

	    ctx.save();
	    ctx.drawImage(outhouse, x - w / 2, y - h, w, h);
	    ctx.restore();
	  }

  drawPenFront(ctx) {
    const p = this.penSpace;
    this.drawFenceRail(ctx, "front", 4, 16, 1);
    this.drawFenceRail(ctx, "front", 32, 14, 1);

    ctx.fillStyle = "#be7f43";
    for (let i = 0; i <= 11; i += 1) {
      const t = i / 11;
      const post = p.edgePoint("front", t);
      ctx.fillRect(post.x - 8, post.y - 56, 16, 98);
    }

    ctx.strokeStyle = "rgba(128, 80, 45, 0.33)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.backLeft.x, p.backLeft.y);
    ctx.lineTo(p.backRight.x, p.backRight.y);
    ctx.lineTo(p.frontRight.x, p.frontRight.y);
    ctx.lineTo(p.frontLeft.x, p.frontLeft.y);
    ctx.closePath();
    ctx.stroke();
  }

  drawTapBursts(ctx) {
    const suppress = this.activeActions.some(
      (action) => typeof action.shouldSuppressTapBursts === "function" && action.shouldSuppressTapBursts(this),
    );
    if (suppress) return;

    for (const burst of this.tapBursts) {
      const alpha = Math.max(0, burst.life * 2);

      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, burst.size, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,220,120,${alpha * 0.75})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, burst.size + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
