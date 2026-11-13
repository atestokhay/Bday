import Phaser from 'phaser';
import { ANIM, TEX } from '../config/assets';
import { COLORS, CSS, SCENES } from '../config/constants';
import { GEN } from '../config/generatedAssets';
import { FireSpirit } from '../entities/FireSpirit';
import { pillButton, pixelText } from '../ui/widgets';

/** Everything in this scene is drawn at 2x so the cake can be the hero of the frame. */
const S = 2;
const BG = 0x0d0a12;
const SILHOUETTE = 0x2a2134;
const UNLIT = 0x3a2c40;

/**
 * The birthday surprise: darkness, a cake silhouette, a tiny fire spirit that
 * lights the candle, warm light spreading, and finally the message.
 */
export class EndingScene extends Phaser.Scene {
  private alive = false;
  private stage!: Phaser.GameObjects.Container;
  private replay?: Phaser.GameObjects.Container;

  constructor() {
    super(SCENES.ending);
  }

  create(): void {
    this.alive = true;
    this.replay = undefined;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.setRoundPixels(true);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    void this.play();
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.stage?.setPosition(Math.round(width / 2), height);
    this.replay?.setPosition(Math.round(width - 116), height - 26);
  }

  // ---------------------------------------------------------------- helpers

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  /** Tween a multiply-tint between two colours. */
  private tintTo(img: Phaser.GameObjects.Image, from: number, to: number, duration: number, ease = 'Sine.easeInOut') {
    const a = Phaser.Display.Color.ValueToColor(from);
    const b = Phaser.Display.Color.ValueToColor(to);
    return this.tween({
      targets: { t: 0 },
      t: 100,
      duration,
      ease,
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, tw.getValue() ?? 0);
        img.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    } as Phaser.Types.Tweens.TweenBuilderConfig);
  }

  // ---------------------------------------------------------------- the sequence

  private async play(): Promise<void> {
    const { width, height } = this.scale;
    const cam = this.cameras.main;

    this.addNightSky(width, height);

    // stage origin = bottom centre of the screen; everything below is relative to it
    this.stage = this.add.container(Math.round(width / 2), height);
    const cakeW = GEN.cake.width * S;
    const cakeH = GEN.cake.height * S;
    const cakeBottom = -8;
    const cakeTop = cakeBottom - cakeH;
    const cakeLeft = -Math.round(cakeW / 2);
    const wickX = cakeLeft + GEN.cake.wick.x * S + S / 2;
    const wickY = cakeTop + GEN.cake.wick.y * S;

    // soft pool of light on the "table" and the big warm room glow (both start dark)
    const floorGlow = this.add
      .image(0, cakeBottom - 4, TEX.glow)
      .setScale(4.2, 0.7)
      .setTint(COLORS.candle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    const roomGlow = this.add
      .image(wickX, wickY + 40, TEX.glow)
      .setScale(5.5)
      .setTint(0xff9a52)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    const silhouette = this.add
      .image(cakeLeft, cakeBottom, TEX.cake)
      .setOrigin(0, 1)
      .setScale(S)
      .setTintFill(SILHOUETTE)
      .setAlpha(0);
    const cake = this.add
      .image(cakeLeft, cakeBottom, TEX.cake)
      .setOrigin(0, 1)
      .setScale(S)
      .setTint(UNLIT)
      .setAlpha(0);

    // spirit starts hidden behind the cake (lower in the display list)
    const spirit = new FireSpirit(this, cakeLeft + cakeW - 40, cakeTop + 110, S);
    spirit.setAlpha(0);
    this.stage.add([roomGlow, floorGlow, spirit, silhouette, cake]);

    // 1. fade into near darkness
    cam.fadeIn(1200, 0, 0, 0);
    await this.wait(700);
    if (!this.alive) return;

    // 2. slowly reveal the cake silhouette
    await this.tween({ targets: silhouette, alpha: 1, duration: 1900, ease: 'Sine.easeInOut' });
    if (!this.alive) return;
    await this.wait(200);

    // 3. the fire spirit peeks out from behind the cake
    spirit.setAlpha(1);
    spirit.startBob();
    const sideX = cakeLeft + cakeW + 34;
    await this.tween({
      targets: spirit,
      x: sideX,
      y: cakeTop + 46,
      duration: 1150,
      ease: 'Sine.easeOut',
    });
    if (!this.alive) return;
    this.stage.bringToTop(spirit); // now in front of the cake
    await this.wait(150);

    // 4. drift over to the unlit candle
    spirit.excited(true);
    await this.tween({
      targets: spirit,
      x: wickX + 34,
      y: wickY - 2,
      duration: 1350,
      ease: 'Sine.easeInOut',
    });
    if (!this.alive) return;
    await this.wait(300);

    // 5. lean in until its flame touches the wick
    spirit.stopBob();
    await this.tween({ targets: spirit, x: wickX + 21, y: wickY + 8, duration: 650, ease: 'Sine.easeInOut' });
    if (!this.alive) return;

    // 6. the flame shrinks for a moment as it gives a little of its fire away...
    const dimDone = spirit.dim(700);
    await this.wait(320);
    if (!this.alive) return;

    // ... and the candle lights up
    const flame = this.add.sprite(wickX, wickY + S, TEX.flame).setOrigin(0.5, 1).setScale(0);
    flame.play(ANIM.candleFlame);
    const candleGlow = this.add
      .image(wickX, wickY - 6, TEX.glow)
      .setTint(COLORS.candle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.3)
      .setAlpha(0);
    const spark = this.add.image(wickX, wickY - 6, 'fx_sparks').setScale(0.4).setAlpha(1);
    this.stage.add([candleGlow, flame, spark]);
    this.stage.bringToTop(spirit);
    this.tweens.add({ targets: flame, scale: S, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: candleGlow, alpha: 0.85, scale: 1.1, duration: 700, ease: 'Sine.easeOut' });
    this.tweens.add({
      targets: spark,
      scale: 1.1,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });
    // candle glow breathes like a real flame
    this.time.delayedCall(700, () => {
      this.tweens.add({
        targets: candleGlow,
        scale: { from: 1.1, to: 1.2 },
        alpha: { from: 0.85, to: 0.7 },
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // 7. warm candlelight gradually fills the scene
    this.tweens.add({ targets: cake, alpha: 1, duration: 700, ease: 'Sine.easeOut' });
    void this.tintTo(cake, UNLIT, 0xffffff, 2800);
    this.tweens.add({ targets: roomGlow, alpha: 0.32, duration: 2800, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: floorGlow, alpha: 0.4, duration: 2400, ease: 'Sine.easeInOut' });
    this.time.delayedCall(800, () => silhouette.setVisible(false));
    this.startGoldenMotes(wickX, wickY, cakeW);

    await dimDone;
    if (!this.alive) return;

    // 8. the spirit floats back to rest beside the cake
    spirit.excited(false);
    spirit.startBob();
    await this.tween({
      targets: spirit,
      x: sideX - 4,
      y: cakeTop + 58,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });
    if (!this.alive) return;

    // 9. let it breathe
    await this.wait(500);
    if (!this.alive) return;

    // 10. the message
    await this.showMessage(cakeTop);
    if (!this.alive) return;
    await this.wait(500);
    if (!this.alive) return;
    this.showReplay();
  }

  private addNightSky(width: number, height: number): void {
    const rng = new Phaser.Math.RandomDataGenerator(['night']);
    for (let i = 0; i < 34; i++) {
      const dot = this.add
        .image(rng.between(0, width), rng.between(0, Math.round(height * 0.62)), TEX.dot)
        .setTint(rng.pick([COLORS.cream, COLORS.lavender, COLORS.pink]))
        .setScale(rng.pick([0.5, 1]))
        .setAlpha(0);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0, to: rng.realInRange(0.25, 0.6) },
        duration: rng.between(1400, 2600),
        delay: rng.between(0, 3000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private startGoldenMotes(wickX: number, wickY: number, cakeW: number): void {
    const motes = this.add.particles(0, 0, TEX.dot, {
      x: { min: wickX - cakeW * 0.7, max: wickX + cakeW * 0.7 },
      y: { min: wickY - 10, max: wickY + 200 },
      lifespan: 4200,
      speedY: { min: -8, max: -20 },
      speedX: { min: -5, max: 5 },
      scale: { min: 1, max: 2 },
      alpha: { start: 0.9, end: 0 },
      tint: [COLORS.gold, COLORS.goldLight, COLORS.candle],
      frequency: 260,
      blendMode: Phaser.BlendModes.ADD,
    });
    const twinkles = this.add.particles(0, 0, TEX.sparkle, {
      x: { min: wickX - cakeW * 0.8, max: wickX + cakeW * 0.8 },
      y: { min: wickY - 60, max: wickY + 160 },
      lifespan: 1100,
      scale: { start: 0, end: 1, ease: 'Sine.easeOut' },
      alpha: { start: 1, end: 0 },
      tint: [COLORS.goldLight, 0xffffff],
      frequency: 650,
    });
    this.stage.addAt([motes, twinkles], 2);
  }

  private async showMessage(cakeTop: number): Promise<void> {
    // line 1: letters drop in one by one, then sway gently
    const line1 = 'Doğum Günün Kutlu Olsun!';
    const size = 24;
    const y1 = cakeTop - 90;
    const startX = -((line1.length - 1) * size) / 2;
    [...line1].forEach((ch, i) => {
      if (ch === ' ') return;
      const t = pixelText(this, startX + i * size, y1 + 10, ch, size, CSS.cream, CSS.pinkDark)
        .setOrigin(0.5)
        .setAlpha(0);
      this.stage.add(t);
      this.tweens.add({
        targets: t,
        y: y1,
        alpha: 1,
        duration: 520,
        delay: i * 60,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: t,
            y: y1 - 2,
            duration: 900,
            delay: (i % 5) * 90,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        },
      });
    });
    await this.wait(line1.length * 60 + 500);
    if (!this.alive) return;

    // line 2: her name pops in, framed by two beating hearts
    const y2 = cakeTop - 46;
    const name = pixelText(this, 0, y2, 'Feyza!', 32, CSS.gold, CSS.outline).setOrigin(0.5).setScale(0);
    const gap = name.width / 2 + 30;
    const hearts = [-1, 1].map((side) =>
      this.add.image(side * gap, y2 - 2, TEX.heartPink).setScale(0),
    );
    const ring = this.add.image(0, y2, 'fx_pink_ring').setScale(0.8).setAlpha(0);
    this.stage.add([ring, name, ...hearts]);
    this.tweens.add({ targets: ring, scale: 2.2, alpha: { from: 0.9, to: 0 }, duration: 900, ease: 'Quad.easeOut' });
    await this.tween({ targets: name, scale: 1, duration: 650, ease: 'Back.easeOut' });
    if (!this.alive) return;
    hearts.forEach((h, i) => {
      this.tweens.add({ targets: h, scale: S, duration: 380, delay: i * 140, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: h,
        scale: S * 1.25,
        duration: 260,
        delay: 900 + i * 300,
        yoyo: true,
        repeat: -1,
        repeatDelay: 900,
        ease: 'Quad.easeOut',
      });
    });
    this.tweens.add({ targets: name, y: y2 - 3, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    await this.wait(500);
  }

  private showReplay(): void {
    const btn = pillButton(this, 0, 0, 'TEKRAR OYNA', () => this.restart(), { width: 208, height: 32, size: 16 });
    btn.setAlpha(0);
    this.replay = btn;
    this.layout();
    this.tweens.add({ targets: btn, alpha: 1, duration: 700 });
  }

  private restart(): void {
    this.replay?.disableInteractive();
    const cam = this.cameras.main;
    cam.fadeOut(600, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.game));
  }
}
