import Phaser from 'phaser';
import { ANIM, TEX } from '../config/assets';
import { COLORS } from '../config/constants';
import { GEN } from '../config/generatedAssets';

/**
 * The little flame friend from the ending. The container position is the base of the flame. It carries its own warm glow and
 * bobs gently; `dim()` makes its flame shrink while it lights the candle.
 * Only ever created by EndingScene.
 */
export class FireSpirit extends Phaser.GameObjects.Container {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly glow: Phaser.GameObjects.Image;
  private readonly pixelScale: number;
  private bobTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, pixelScale: number) {
    super(scene, x, y);
    this.pixelScale = pixelScale;
    // origin at the base of the flame: shrinking keeps it "sitting" in place
    const bodyMid = -GEN.fireSpirit.frameHeight * 0.4 * pixelScale;
    this.glow = scene.add
      .image(0, bodyMid, TEX.glow)
      .setTint(COLORS.candle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.45)
      .setScale(pixelScale * 0.9);
    this.sprite = scene.add.sprite(0, 0, TEX.fireSpirit).setOrigin(0.5, 1).setScale(pixelScale);
    this.sprite.play(ANIM.fireIdle);
    this.add([this.glow, this.sprite]);
    scene.add.existing(this);
  }

  startBob(): void {
    this.bobTween?.remove();
    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: { from: 0, to: -3 * this.pixelScale },
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  stopBob(): void {
    this.bobTween?.remove();
    this.bobTween = undefined;
    this.sprite.y = 0;
  }

  /** Flame briefly gets smaller (while giving its fire away), then recovers. */
  dim(holdMs: number): Promise<void> {
    const s = this.pixelScale;
    return new Promise((resolve) => {
      this.scene.tweens.chain({
        targets: this.sprite,
        tweens: [
          { scaleX: s * 0.75, scaleY: s * 0.6, duration: 260, ease: 'Sine.easeOut' },
          { scaleX: s * 0.75, scaleY: s * 0.6, duration: holdMs },
          { scaleX: s, scaleY: s, duration: 520, ease: 'Back.easeOut' },
        ],
        onComplete: () => resolve(),
      });
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 0.2,
        duration: 260,
        yoyo: true,
        hold: holdMs,
      });
    });
  }

  excited(on: boolean): void {
    this.sprite.play(on ? ANIM.fireFlame : ANIM.fireIdle, true);
  }
}
