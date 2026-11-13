import Phaser from 'phaser';
import { COLORS, FONT, SCENES } from '../config/constants';
import { preloadAll, registerAnimations } from '../config/assets';

/** Loads every asset and the pixel font, registers animations, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    const { width, height } = this.scale;
    const barW = 160;
    const frame = this.add.rectangle(width / 2, height / 2, barW + 6, 12, COLORS.outline);
    frame.setStrokeStyle(2, COLORS.cream);
    const bar = this.add.rectangle(width / 2 - barW / 2, height / 2, 0, 6, COLORS.pink).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.width = Math.round(barW * p);
    });
    preloadAll(this.load);
  }

  async create(): Promise<void> {
    registerAnimations(this.anims);
    // Canvas text needs the web font to be ready before the first Text object is drawn.
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`16px ${FONT}`, 'Doğum Günün Kutlu Olsun Feyza YÜRÜ BOŞLUK ZIPLA'),
          document.fonts.load(`8px ${FONT}`, '0123456789/'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch {
      /* fall back to monospace */
    }
    this.scene.start(SCENES.menu);
  }
}
