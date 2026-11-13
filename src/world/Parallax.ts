import Phaser from 'phaser';
import { CLOUD_COUNT, TEX, cloudKey } from '../config/assets';
import { BASE_H } from '../config/constants';

interface Layer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
  baseY: number; // top edge in the 360px base view
}

interface Cloud {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  speed: number;
  factor: number;
}

const SKY_TOP = 0x96acd6;

/**
 * Screen-anchored background: banded sky, drifting clouds and three hill/forest
 * layers that scroll at different speeds. Shared by the menu and the level.
 */
export class Parallax {
  private readonly skyFill: Phaser.GameObjects.Rectangle;
  private readonly sky: Phaser.GameObjects.TileSprite;
  private readonly layers: Layer[] = [];
  private readonly clouds: Cloud[] = [];
  private width = 0;
  private height = 0;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.skyFill = scene.add.rectangle(0, 0, width, height, SKY_TOP).setOrigin(0).setScrollFactor(0).setDepth(-100);
    this.sky = scene.add.tileSprite(0, 0, width, BASE_H, TEX.sky).setOrigin(0).setScrollFactor(0).setDepth(-99);

    const rng = new Phaser.Math.RandomDataGenerator(['clouds']);
    for (let i = 0; i < 7; i++) {
      const img = scene.add.image(0, 0, cloudKey(i % CLOUD_COUNT)).setScrollFactor(0).setDepth(-90);
      img.setAlpha(0.9);
      this.clouds.push({
        img,
        x: rng.between(0, 900),
        y: rng.between(30, 140),
        speed: rng.realInRange(2, 6),
        factor: rng.realInRange(0.04, 0.1),
      });
    }

    const defs: Array<[string, number, number, number]> = [
      [TEX.hillsFar, 0.12, 128, 150],
      [TEX.hillsMid, 0.25, 156, 150],
      [TEX.forestNear, 0.45, 172, 240],
    ];
    defs.forEach(([key, factor, baseY, h], i) => {
      const sprite = scene.add
        .tileSprite(0, 0, width, h, key)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(-80 + i);
      this.layers.push({ sprite, factor, baseY });
    });

    this.resize(width, height);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.resize(size.width, size.height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const offY = height - BASE_H; // keep everything anchored to the ground line
    this.skyFill.setSize(width, height);
    this.sky.setPosition(0, offY).setSize(width, BASE_H);
    for (const l of this.layers) {
      l.sprite.setPosition(0, l.baseY + offY);
      l.sprite.setSize(width, l.sprite.height);
    }
  }

  /** scrollX: camera scroll; dt in ms. */
  update(scrollX: number, dt: number): void {
    for (const l of this.layers) l.sprite.tilePositionX = Math.round(scrollX * l.factor);
    const span = this.width + 160;
    const offY = this.height - BASE_H;
    for (const c of this.clouds) {
      c.x += (c.speed * dt) / 1000;
      const sx = Phaser.Math.Wrap(c.x - scrollX * c.factor, -80, span - 80);
      c.img.setPosition(Math.round(sx), Math.round(c.y + offY));
    }
  }
}
