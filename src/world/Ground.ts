import Phaser from 'phaser';
import { TEX } from '../config/assets';
import { GEN } from '../config/generatedAssets';

const DEPTH_GROUND = 5;

export interface GroundOptions {
  capLeft?: boolean;
  capRight?: boolean;
  /** put the visuals in this container instead of directly in the scene */
  container?: Phaser.GameObjects.Container;
  /** create a static collision zone (default true) */
  physics?: boolean;
}

/**
 * Draws one solid ground strip from the tileset-derived textures:
 * a grass/dirt top band and purple soil below, with rounded edge caps.
 * Returns the invisible static collision zone (or null when physics is off).
 */
export function buildGround(
  scene: Phaser.Scene,
  x: number,
  w: number,
  surfaceY: number,
  bottomY: number,
  opts: GroundOptions = {},
): Phaser.GameObjects.Zone | null {
  const g = GEN.ground;
  const capL = opts.capLeft !== false;
  const capR = opts.capRight !== false;
  const topY = surfaceY - g.surfaceOffset;
  const fillY = topY + g.topHeight;
  const fillH = Math.max(bottomY - fillY, 0);
  const innerX = x + (capL ? g.capWidth : 0);
  const innerW = w - (capL ? g.capWidth : 0) - (capR ? g.capWidth : 0);
  const parts: Phaser.GameObjects.GameObject[] = [];

  const top = scene.add.tileSprite(innerX, topY, innerW, g.topHeight, TEX.groundTop).setOrigin(0, 0);
  // offset the pattern per segment so neighbouring strips don't look copy-pasted
  top.tilePositionX = Math.abs(Math.round(x * 0.37)) % g.tileWidth;
  const fill = scene.add.tileSprite(innerX, fillY, innerW, fillH, TEX.groundFill).setOrigin(0, 0);
  fill.tilePositionX = top.tilePositionX;
  top.setDepth(DEPTH_GROUND + 0.1);
  fill.setDepth(DEPTH_GROUND);
  parts.push(fill, top);

  const caps: Array<[boolean, number, boolean]> = [
    [capL, x, false],
    [capR, x + w - g.capWidth, true],
  ];
  for (const [on, cx, flip] of caps) {
    if (!on) continue;
    parts.push(
      scene.add
        .tileSprite(cx, fillY, g.capWidth, fillH, TEX.groundCapFill)
        .setOrigin(0, 0)
        .setFlipX(flip)
        .setDepth(DEPTH_GROUND),
      scene.add.image(cx, topY, TEX.groundCapTop).setOrigin(0, 0).setFlipX(flip).setDepth(DEPTH_GROUND + 0.1),
    );
  }
  opts.container?.add(parts);

  if (opts.physics === false) return null;
  const zone = scene.add.zone(x + w / 2, surfaceY + (bottomY - surfaceY) / 2, w - 2, bottomY - surfaceY);
  scene.physics.add.existing(zone, true);
  return zone;
}
