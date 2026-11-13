import Phaser from 'phaser';
import { ANIM, TEX, tileKey } from '../config/assets';
import { BASE_H, COLORS, CSS, SCENES } from '../config/constants';
import { buildGround } from '../world/Ground';
import { Parallax } from '../world/Parallax';
import { fullscreenButton, pillButton, pixelText } from '../ui/widgets';

/**
 * Title screen. Deliberately gives nothing away: no cake, no fire spirit,
 * no birthday message - just the girl, the forest and a Play button.
 */
export class MenuScene extends Phaser.Scene {
  private parallax!: Parallax;
  private world!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Container;
  private playBtn!: Phaser.GameObjects.Container;
  private drift = 0;
  private starting = false;

  constructor() {
    super(SCENES.menu);
  }

  create(): void {
    this.starting = false;
    this.drift = 0;
    this.parallax = new Parallax(this);

    // A tiny diorama standing on the ground line (y = 296 in base coordinates).
    // Built at x=0 and re-centred by layout().
    const g = 296;
    this.world = this.add.container(0, 0);
    buildGround(this, -900, 1800, g, 420, { capLeft: false, capRight: false, container: this.world, physics: false });
    const deco = (key: string, x: number, flip = false, depth = 3) =>
      this.add.image(x, g + 1, key).setOrigin(0.5, 1).setFlipX(flip).setDepth(depth);
    const props = [
      deco(tileKey('tree_big'), -200),
      deco(tileKey('tree_pink'), 205, true),
      deco(tileKey('bush_small'), -120),
      deco(tileKey('flower_bush'), 150),
      deco(TEX.fence, 92),
      deco(TEX.fence, 116),
      deco(tileKey('pink_flowers'), -60, false, 12),
      deco(TEX.tulip, 40, false, 12),
      deco(tileKey('mush_red'), 64, false, 12),
      deco(tileKey('lavender'), -88, false, 12),
      deco(TEX.daisy, 250, false, 12),
    ];
    const girl = this.add.sprite(-14, g, TEX.girl).setOrigin(0.5, 1).setDepth(10);
    girl.play(ANIM.girlIdle);
    const heart = this.add.image(24, g - 44, TEX.heartBlue).setDepth(9);
    const star = this.add.image(-54, g - 52, TEX.star).setDepth(9);
    this.tweens.add({ targets: heart, y: g - 48, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: star,
      y: g - 56,
      duration: 1300,
      delay: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.world.add([...props, heart, star, girl]);
    this.world.sort('depth');

    // floating motes
    this.add
      .particles(0, 0, TEX.dot, {
        x: { min: 0, max: 2000 },
        y: { min: 40, max: 300 },
        lifespan: 6000,
        speedY: { min: -4, max: -12 },
        speedX: { min: -4, max: 4 },
        alpha: { start: 0.7, end: 0 },
        tint: [COLORS.goldLight, COLORS.cream, COLORS.pink],
        frequency: 380,
      })
      .setDepth(20);

    // Title
    const t1 = pixelText(this, 0, 0, 'Birthday', 32, CSS.cream, CSS.pinkDark).setOrigin(0.5);
    const t2 = pixelText(this, 0, 38, 'Adventure', 24, CSS.pink, CSS.outline).setOrigin(0.5);
    const sparkL = this.add.image(-150, 2, TEX.sparkle);
    const sparkR = this.add.image(146, 36, TEX.twinkle);
    this.title = this.add.container(0, 0, [t1, t2, sparkL, sparkR]).setDepth(30);
    this.tweens.add({ targets: this.title, y: '+=3', duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: [sparkL, sparkR], alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    this.playBtn = pillButton(this, 0, 0, 'PLAY', () => this.startGame()).setDepth(30);
    this.tweens.add({ targets: this.playBtn, scale: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    fullscreenButton(this);

    const keys = this.input.keyboard!;
    const onKey = () => this.startGame();
    keys.once('keydown-ENTER', onKey);
    keys.once('keydown-SPACE', onKey);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
    this.layout();
    this.cameras.main.fadeIn(500, 0x1c, 0x16, 0x26);
  }

  private layout(): void {
    const { width, height } = this.scale;
    const offY = height - BASE_H;
    this.world.setPosition(Math.round(width / 2), offY);
    this.title.setPosition(Math.round(width / 2), Math.round(offY * 0.5 + 64));
    this.playBtn.setPosition(Math.round(width / 2), Math.round(offY * 0.6 + 168));
  }

  private startGame(): void {
    if (this.starting) return;
    this.starting = true;
    const cam = this.cameras.main;
    cam.fadeOut(450, 0x1c, 0x16, 0x26);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.game));
  }

  update(_t: number, delta: number): void {
    // the background slowly drifts by
    this.drift += delta * 0.012;
    this.parallax.update(this.drift, delta);
  }
}
