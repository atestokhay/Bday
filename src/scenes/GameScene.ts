import Phaser from 'phaser';
import { ANIM, TEX, tileKey, type FxName, type TileName } from '../config/assets';
import { COLORS, SCENES } from '../config/constants';
import { GEN } from '../config/generatedAssets';
import { Player, PLAYER_EVENTS } from '../entities/Player';
import { Controls, createTouchState } from '../systems/Controls';
import { buildGround } from '../world/Ground';
import { Parallax } from '../world/Parallax';
import {
  GROUND_Y,
  PIPE,
  PLAYER_START,
  WORLD_BOTTOM,
  WORLD_W,
  decorations,
  grounds,
  hearts,
  platforms,
  stars,
} from '../world/levelData';

export type CollectKind = 'heart' | 'star';

export interface Progress {
  hearts: number;
  stars: number;
  totalHearts: number;
  totalStars: number;
}

export interface UISceneData {
  touch: ReturnType<typeof createTouchState>;
  progress: Progress;
}

export const GAME_EVENTS = {
  collect: 'collect', // (kind: CollectKind, progress: Progress)
  enterPipe: 'enter-pipe',
} as const;

interface Collectible {
  kind: CollectKind;
  img: Phaser.GameObjects.Image;
  taken: boolean;
}

interface Surface {
  l: number;
  r: number;
  y: number;
}

const DEPTH = { far: 2, back: 3, platform: 6, pipe: 7, item: 9, front: 12, fx: 14 } as const;

/** Pipe collision/trigger boxes in pipe-image pixels, measured from the sprite. */
const PIPE_TUBE = { l: 32, r: 98, top: 50 };
const PIPE_MOUTH = { l: 46, r: 110, top: 12, bottom: 56 };

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private controls!: Controls;
  private parallax!: Parallax;
  private items: Collectible[] = [];
  private surfaces: Surface[] = [];
  private progress!: Progress;
  private safe = { x: PLAYER_START.x, y: PLAYER_START.y };
  private entering = false;
  private pipeX = 0;
  private pipeTop = 0;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.items = [];
    this.surfaces = [];
    this.entering = false;
    this.safe = { ...PLAYER_START };
    this.progress = { hearts: 0, stars: 0, totalHearts: hearts.length, totalStars: stars.length };

    this.physics.world.setBounds(0, -400, WORLD_W, WORLD_BOTTOM + 800);
    this.physics.world.setBoundsCollision(true, true, false, false);

    this.parallax = new Parallax(this);
    const solids = this.physics.add.staticGroup();
    const oneWays = this.physics.add.staticGroup();

    this.buildGrounds(solids);
    this.buildPlatforms(solids, oneWays);
    this.buildPipe(solids);
    this.buildDecorations();
    this.buildCollectibles();
    this.buildAmbience();

    this.player = new Player(this, PLAYER_START.x, PLAYER_START.y);
    this.physics.add.collider(this.player, solids);
    this.physics.add.collider(this.player, oneWays);
    this.player.on(PLAYER_EVENTS.land, () => this.dust(this.player.x, this.player.feetY));
    this.player.on(PLAYER_EVENTS.jump, () => this.dust(this.player.x, this.player.feetY, 3));

    const touch = createTouchState();
    this.controls = new Controls(this, touch);

    this.setupCamera();
    this.scene.launch(SCENES.ui, { touch, progress: this.progress } satisfies UISceneData);
    this.cameras.main.fadeIn(600, 0x1c, 0x16, 0x26);
  }

  // ---------------------------------------------------------------- building

  private buildGrounds(solids: Phaser.Physics.Arcade.StaticGroup): void {
    grounds.forEach((g, i) => {
      solids.add(buildGround(this, g.x, g.w, g.y, WORLD_BOTTOM, { capLeft: i > 0 })!);
      this.surfaces.push({ l: g.x, r: g.x + g.w, y: g.y });
    });
  }

  private buildPlatforms(
    solids: Phaser.Physics.Arcade.StaticGroup,
    oneWays: Phaser.Physics.Arcade.StaticGroup,
  ): void {
    for (const p of platforms) {
      const [w, h, surf, solidL, solidR] = GEN.tiles[p.tile] as readonly number[];
      const left = Math.round(p.x - w / 2);
      const top = p.y - surf;
      this.add.image(left, top, tileKey(p.tile)).setOrigin(0).setDepth(DEPTH.platform);
      // a few pixels of forgiveness on each side of the walkable top
      const l = left + solidL - 3;
      const r = left + solidR + 3;
      if (p.solid) {
        const z = this.add.zone((l + r) / 2, p.y + (h - surf) / 2, r - l, h - surf - 1);
        this.physics.add.existing(z, true);
        solids.add(z);
      } else {
        const z = this.add.zone((l + r) / 2, p.y + 4, r - l, 8);
        this.physics.add.existing(z, true);
        const body = z.body as Phaser.Physics.Arcade.StaticBody;
        body.checkCollision.down = false;
        body.checkCollision.left = false;
        body.checkCollision.right = false;
        oneWays.add(z);
      }
      this.surfaces.push({ l, r, y: p.y });
    }
  }

  private buildPipe(solids: Phaser.Physics.Arcade.StaticGroup): void {
    const pd = GEN.pipe;
    this.pipeX = PIPE.x;
    this.pipeTop = PIPE.surfaceY - pd.groundY;
    this.add.image(this.pipeX, this.pipeTop, TEX.pipe).setOrigin(0).setDepth(DEPTH.pipe);

    const addSolid = (l: number, r: number, t: number, b: number) => {
      const z = this.add.zone((l + r) / 2, (t + b) / 2, r - l, b - t);
      this.physics.add.existing(z, true);
      solids.add(z);
    };
    // grassy island the pipe stands on, and the pipe body itself
    addSolid(this.pipeX + 8, this.pipeX + pd.width - 8, PIPE.surfaceY, PIPE.surfaceY + 24);
    addSolid(this.pipeX + PIPE_TUBE.l, this.pipeX + PIPE_TUBE.r, this.pipeTop + PIPE_TUBE.top, PIPE.surfaceY);
    this.surfaces.push({ l: this.pipeX + 8, r: this.pipeX + PIPE_TUBE.l, y: PIPE.surfaceY });

    // gentle magic rising from the mouth + a bobbing hint arrow
    const mx = this.pipeX + pd.mouth.x;
    const my = this.pipeTop + pd.mouth.y;
    this.add
      .particles(0, 0, TEX.twinkle, {
        x: { min: mx - 14, max: mx + 14 },
        y: { min: my - 4, max: my + 4 },
        lifespan: 1600,
        speedY: { min: -18, max: -34 },
        speedX: { min: -6, max: 6 },
        alpha: { start: 1, end: 0 },
        tint: [COLORS.goldLight, COLORS.gold, 0xffffff],
        frequency: 260,
        gravityY: 0,
      })
      .setDepth(DEPTH.pipe + 0.5);
    this.makeArrowTexture();
    const arrow = this.add.image(mx, my - 42, 'arrow_down').setDepth(DEPTH.fx);
    this.tweens.add({ targets: arrow, y: my - 35, duration: 600, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
  }

  private makeArrowTexture(): void {
    if (this.textures.exists('arrow_down')) return;
    const g = this.make.graphics({}, false);
    const rows = [
      '..ooooo..',
      '..occco..',
      '..occco..',
      'ooocccooo',
      'occccccco',
      '.occccco.',
      '..occco..',
      '...oco...',
      '....o....',
    ];
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        g.fillStyle(ch === 'o' ? COLORS.outline : COLORS.cream);
        g.fillRect(x, y, 1, 1);
      }),
    );
    g.generateTexture('arrow_down', 9, 9);
    g.destroy();
  }

  private buildDecorations(): void {
    for (const d of decorations) {
      const key = d.key.startsWith('t:') ? tileKey(d.key.slice(2) as TileName) : d.key;
      this.add
        .image(Math.round(d.x), d.y, key)
        .setOrigin(0.5, 1)
        .setFlipX(!!d.flip)
        .setDepth(DEPTH[d.layer ?? 'back']);
    }
  }

  private buildCollectibles(): void {
    const add = (kind: CollectKind, x: number, y: number, i: number) => {
      const img = this.add.image(x, y, kind === 'heart' ? TEX.heartBlue : TEX.star).setDepth(DEPTH.item);
      this.tweens.add({
        targets: img,
        y: y - 4,
        duration: 1000 + (i % 3) * 140,
        delay: i * 170,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
      this.items.push({ kind, img, taken: false });
    };
    hearts.forEach((p, i) => add('heart', p.x, p.y, i));
    stars.forEach((p, i) => add('star', p.x, p.y, i));

    // stars twinkle now and then
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        const live = this.items.filter((it) => it.kind === 'star' && !it.taken);
        if (!live.length) return;
        const s = Phaser.Utils.Array.GetRandom(live);
        const tw = this.add
          .image(s.img.x + Phaser.Math.Between(-7, 7), s.img.y + Phaser.Math.Between(-7, 3), TEX.twinkle)
          .setDepth(DEPTH.item + 0.5)
          .setScale(0);
        this.tweens.add({ targets: tw, scale: 1, duration: 220, yoyo: true, onComplete: () => tw.destroy() });
      },
    });
  }

  private buildAmbience(): void {
    const cam = this.cameras.main;
    this.add
      .particles(0, 0, TEX.dot, {
        x: { onEmit: () => cam.scrollX + Math.random() * cam.width },
        y: { onEmit: () => cam.scrollY + 40 + Math.random() * (cam.height - 120) },
        lifespan: 7000,
        speedX: { min: -5, max: 5 },
        speedY: { min: -4, max: -12 },
        alpha: { start: 0.75, end: 0 },
        tint: [COLORS.goldLight, COLORS.cream, COLORS.pink],
        frequency: 420,
        maxAliveParticles: 22,
      })
      .setDepth(DEPTH.front + 1);
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    const applyBounds = () => {
      // the view is always as tall as the screen; extra height shows more sky
      cam.setBounds(0, GROUND_Y + 64 - cam.height, WORLD_W, cam.height);
    };
    applyBounds();
    cam.startFollow(this.player, true, 0.12, 0.12, 0, 0);
    cam.setDeadzone(40, 200);
    const onResize = () => applyBounds();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.controls.update();
    this.parallax.update(this.cameras.main.scrollX, dt);
    if (this.entering) return;

    this.player.step(this.controls, dt);
    this.checkCollectibles();
    this.trackSafeSpot();
    if (this.player.y > WORLD_BOTTOM + 40) this.recoverFromFall();
    this.checkPipe();
  }

  private checkCollectibles(): void {
    const b = this.player.body;
    for (const it of this.items) {
      if (it.taken) continue;
      const hw = it.img.width / 2 + 2;
      const hh = it.img.height / 2 + 2;
      if (b.right < it.img.x - hw || b.left > it.img.x + hw) continue;
      if (b.bottom < it.img.y - hh || b.top > it.img.y + hh) continue;
      this.collect(it);
    }
  }

  private collect(it: Collectible): void {
    it.taken = true;
    if (it.kind === 'heart') this.progress.hearts++;
    else this.progress.stars++;
    this.tweens.killTweensOf(it.img);
    this.tweens.add({
      targets: it.img,
      y: it.img.y - 14,
      alpha: 0,
      scale: 1.5,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => it.img.destroy(),
    });
    this.burst(it.kind === 'heart' ? 'fx_lav_stars' : 'fx_gold_burst', it.img.x, it.img.y, 0.6);
    this.events.emit(GAME_EVENTS.collect, it.kind, { ...this.progress });
  }

  private burst(fx: FxName, x: number, y: number, scale = 1, duration = 420): void {
    const img = this.add.image(x, y, fx).setDepth(DEPTH.fx).setScale(scale * 0.5);
    this.tweens.add({
      targets: img,
      scale,
      alpha: { from: 1, to: 0 },
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  private dust(x: number, y: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const d = this.add
        .image(x + Phaser.Math.Between(-8, 8), y - 1, TEX.dot)
        .setTint(COLORS.cream)
        .setDepth(DEPTH.front);
      this.tweens.add({
        targets: d,
        x: d.x + Phaser.Math.Between(-10, 10),
        y: y - Phaser.Math.Between(3, 9),
        alpha: 0,
        duration: Phaser.Math.Between(260, 420),
        onComplete: () => d.destroy(),
      });
    }
  }

  /** Remember a comfortable spot to return to if she ever falls. */
  private trackSafeSpot(): void {
    if (!this.player.grounded) return;
    const fx = this.player.x;
    const fy = this.player.feetY;
    for (const s of this.surfaces) {
      if (fx < s.l || fx > s.r || Math.abs(fy - s.y) > 3) continue;
      const margin = Math.min(26, (s.r - s.l) / 2);
      this.safe.x = Phaser.Math.Clamp(fx, s.l + margin, s.r - margin);
      this.safe.y = s.y - 40;
      return;
    }
  }

  /** No damage, no lives lost: she just pops back to the last safe spot. */
  private recoverFromFall(): void {
    this.player.respawn(this.safe.x, this.safe.y);
    this.player.setAlpha(0);
    this.tweens.add({ targets: this.player, alpha: 1, duration: 300 });
    this.burst('fx_pink_stars', this.safe.x, this.safe.y, 0.8, 500);
  }

  private checkPipe(): void {
    const b = this.player.body;
    const l = this.pipeX + PIPE_MOUTH.l;
    const r = this.pipeX + PIPE_MOUTH.r;
    const t = this.pipeTop + PIPE_MOUTH.top;
    const btm = this.pipeTop + PIPE_MOUTH.bottom;
    if (b.right > l && b.left < r && b.bottom > t && b.top < btm && b.bottom <= btm + 1) this.enterPipe();
  }

  // ---------------------------------------------------------------- ending transition

  private enterPipe(): void {
    if (this.entering) return;
    this.entering = true;
    this.controls.enabled = false;
    this.events.emit(GAME_EVENTS.enterPipe);
    const p = this.player;
    p.freeze();
    p.setFlipX(false);
    p.play(ANIM.girlJumpUp, true);

    const mx = this.pipeX + GEN.pipe.mouth.x;
    const my = this.pipeTop + GEN.pipe.mouth.y;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(mx, my, 1200, 'Sine.easeInOut');
    cam.zoomTo(1.4, 1400, 'Sine.easeInOut');

    // hide everything of her that is "inside" the pipe below the rim
    const maskShape = this.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRect(mx - 200, my - 400, 400, 400 + 4);
    const mask = maskShape.createGeometryMask();

    this.tweens.chain({
      targets: p,
      tweens: [
        { x: mx, y: my - 46, duration: 420, ease: 'Quad.easeOut' },
        { duration: 120 },
        {
          x: mx,
          y: my + 34,
          scaleX: 0.7,
          scaleY: 0.85,
          duration: 560,
          ease: 'Quad.easeIn',
          onStart: () => {
            p.play(ANIM.girlJumpDown, true);
            p.setMask(mask);
          },
        },
      ],
      onComplete: () => {
        p.setVisible(false);
        this.burst('fx_gold_ring', mx, my, 1.2, 700);
        this.burst('fx_sparks', mx, my - 6, 0.9, 600);
        this.time.delayedCall(450, () => {
          cam.fadeOut(1100, 0, 0, 0);
          cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            maskShape.destroy();
            this.scene.stop(SCENES.ui);
            this.scene.start(SCENES.ending, { ...this.progress });
          });
        });
      },
    });
  }
}
