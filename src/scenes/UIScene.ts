import Phaser from 'phaser';
import { TEX } from '../config/assets';
import { CSS, SCENES } from '../config/constants';
import { TouchControls } from '../systems/Controls';
import { fullscreenButton, pixelText } from '../ui/widgets';
import { GAME_EVENTS, type CollectKind, type Progress, type UISceneData } from './GameScene';

/**
 * HUD + touch controls, drawn by a separate scene on top of the level so the
 * level camera can zoom/pan freely without moving the interface.
 */
export class UIScene extends Phaser.Scene {
  private touchControls!: TouchControls;
  private heartCount!: Phaser.GameObjects.Text;
  private starCount!: Phaser.GameObjects.Text;
  private heartIcon!: Phaser.GameObjects.Image;
  private starIcon!: Phaser.GameObjects.Image;
  private hint?: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Container;

  constructor() {
    super(SCENES.ui);
  }

  create(data: UISceneData): void {
    this.buildHud(data.progress);
    this.touchControls = new TouchControls(this, data.touch);
    fullscreenButton(this);

    if (!this.touchControls.visible) {
      this.hint = pixelText(this, this.scale.width / 2, this.scale.height - 20, 'ARROWS / A D  MOVE     SPACE  JUMP', 8)
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.chain({
        targets: this.hint,
        tweens: [
          { alpha: 1, duration: 500, delay: 600 },
          { alpha: 0, duration: 800, delay: 5000 },
        ],
      });
    }

    const game = this.scene.get(SCENES.game);
    game.events.on(GAME_EVENTS.collect, this.onCollect, this);
    game.events.on(GAME_EVENTS.enterPipe, this.onEnterPipe, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      game.events.off(GAME_EVENTS.collect, this.onCollect, this);
      game.events.off(GAME_EVENTS.enterPipe, this.onEnterPipe, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
    this.layout();
  }

  private buildHud(p: Progress): void {
    const panel = this.add.nineslice(0, 0, TEX.panel, undefined, 214, 26, 4, 4, 4, 4).setOrigin(0);
    const items: Phaser.GameObjects.GameObject[] = [panel];
    // purely decorative "lives": always three, never lost
    for (let i = 0; i < 3; i++) {
      const h = this.add.image(8 + i * 18, 13, TEX.heartPink).setOrigin(0, 0.5);
      items.push(h);
      this.tweens.add({
        targets: h,
        y: 12,
        duration: 260,
        delay: 2400 + i * 140,
        yoyo: true,
        repeat: -1,
        repeatDelay: 3200,
      });
    }
    const sep = this.add.rectangle(66, 6, 1, 14, 0xc8ad90).setOrigin(0);
    this.heartIcon = this.add.image(84, 13, TEX.heartBlue);
    this.heartCount = pixelText(this, 96, 9, '', 8, CSS.outline, null);
    this.starIcon = this.add.image(148, 13, TEX.star);
    this.starCount = pixelText(this, 160, 9, '', 8, CSS.outline, null);
    items.push(sep, this.heartIcon, this.heartCount, this.starIcon, this.starCount);
    this.hud = this.add.container(10, 10, items).setDepth(100);
    this.setCounts(p);
  }

  private setCounts(p: Progress): void {
    this.heartCount.setText(`${p.hearts}/${p.totalHearts}`);
    this.starCount.setText(`${p.stars}/${p.totalStars}`);
  }

  private onCollect(kind: CollectKind, p: Progress): void {
    this.setCounts(p);
    const icon = kind === 'heart' ? this.heartIcon : this.starIcon;
    this.tweens.killTweensOf(icon);
    icon.setScale(1);
    this.tweens.add({ targets: icon, scale: 2, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    const done = kind === 'heart' ? p.hearts === p.totalHearts : p.stars === p.totalStars;
    if (done) (kind === 'heart' ? this.heartCount : this.starCount).setColor(CSS.pinkDark);
  }

  private onEnterPipe(): void {
    this.touchControls.setVisible(false);
    this.tweens.add({ targets: this.hud, alpha: 0, duration: 500 });
    if (this.hint) this.hint.setVisible(false);
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.touchControls.layout(width, height);
    this.hint?.setPosition(Math.round(width / 2), height - 20);
  }

  update(): void {
    this.touchControls.update();
  }
}
