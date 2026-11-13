import { GEN } from './generatedAssets';

/**
 * Every texture the game uses. All of them live in public/assets/processed and are
 * produced from the original art in public/assets by scripts/process_assets.py.
 */
const P = 'assets/processed/';

export const TEX = {
  girl: 'girl',
  fireSpirit: 'fire_spirit',
  cake: 'cake',
  pipe: 'pipe',
  heartBlue: 'heart_blue',
  heartPink: 'heart_pink',
  star: 'star',
  flame: 'flame',
  glow: 'glow',
  dot: 'px_dot',
  sparkle: 'px_sparkle',
  twinkle: 'px_twinkle',
  sign: 'sign',
  fence: 'fence',
  tulip: 'flower_tulip',
  daisy: 'flower_daisy',
  sky: 'bg_sky',
  hillsFar: 'bg_hills_far',
  hillsMid: 'bg_hills_mid',
  forestNear: 'bg_forest_near',
  groundTop: 'ground_top',
  groundFill: 'ground_fill',
  groundCapTop: 'ground_cap_top',
  groundCapFill: 'ground_cap_fill',
  btnLeft: 'btn_left',
  btnLeftDown: 'btn_left_down',
  btnRight: 'btn_right',
  btnRightDown: 'btn_right_down',
  btnJump: 'btn_jump',
  btnJumpDown: 'btn_jump_down',
  btnFullscreen: 'btn_fullscreen',
  panel: 'panel',
  buttonPink: 'button_pink',
} as const;

export type TileName = keyof typeof GEN.tiles;
export type FxName = keyof typeof GEN.fx;

export const tileKey = (name: TileName): string => `tile_${name}`;
export const fxKey = (name: FxName): string => name;
export const cloudKey = (i: number): string => `cloud_${i}`;
export const CLOUD_COUNT = 3;

export function preloadAll(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(TEX.girl, `${P}girl.png`, {
    frameWidth: GEN.girl.frameWidth,
    frameHeight: GEN.girl.frameHeight,
  });
  load.spritesheet(TEX.fireSpirit, `${P}fire_spirit.png`, {
    frameWidth: GEN.fireSpirit.frameWidth,
    frameHeight: GEN.fireSpirit.frameHeight,
  });
  load.spritesheet(TEX.flame, `${P}flame.png`, {
    frameWidth: GEN.flame.frameWidth,
    frameHeight: GEN.flame.frameHeight,
  });

  const singles: Array<[string, string]> = [
    [TEX.cake, 'cake.png'],
    [TEX.pipe, 'pipe.png'],
    [TEX.heartBlue, 'heart_blue.png'],
    [TEX.heartPink, 'heart_pink.png'],
    [TEX.star, 'star.png'],
    [TEX.glow, 'glow.png'],
    [TEX.dot, 'px_dot.png'],
    [TEX.sparkle, 'px_sparkle.png'],
    [TEX.twinkle, 'px_twinkle.png'],
    [TEX.sign, 'sign.png'],
    [TEX.fence, 'fence.png'],
    [TEX.tulip, 'flower_tulip.png'],
    [TEX.daisy, 'flower_daisy.png'],
    [TEX.sky, 'bg/sky.png'],
    [TEX.hillsFar, 'bg/hills_far.png'],
    [TEX.hillsMid, 'bg/hills_mid.png'],
    [TEX.forestNear, 'bg/forest_near.png'],
    [TEX.groundTop, 'ground/top.png'],
    [TEX.groundFill, 'ground/fill.png'],
    [TEX.groundCapTop, 'ground/cap_top.png'],
    [TEX.groundCapFill, 'ground/cap_fill.png'],
    [TEX.btnLeft, 'ui/btn_left.png'],
    [TEX.btnLeftDown, 'ui/btn_left_down.png'],
    [TEX.btnRight, 'ui/btn_right.png'],
    [TEX.btnRightDown, 'ui/btn_right_down.png'],
    [TEX.btnJump, 'ui/btn_jump.png'],
    [TEX.btnJumpDown, 'ui/btn_jump_down.png'],
    [TEX.btnFullscreen, 'ui/btn_fullscreen.png'],
    [TEX.panel, 'ui/panel.png'],
    [TEX.buttonPink, 'ui/button_pink.png'],
  ];
  for (const [key, file] of singles) load.image(key, `${P}${file}`);
  for (let i = 0; i < CLOUD_COUNT; i++) load.image(cloudKey(i), `${P}bg/cloud_${i}.png`);
  for (const name of Object.keys(GEN.tiles) as TileName[]) {
    load.image(tileKey(name), `${P}tiles/${name}.png`);
  }
  for (const name of Object.keys(GEN.fx) as FxName[]) {
    load.image(fxKey(name), `${P}fx/${name}.png`);
  }
}

export const ANIM = {
  girlIdle: 'girl-idle',
  girlWalk: 'girl-walk',
  girlJumpUp: 'girl-jump-up',
  girlJumpDown: 'girl-jump-down',
  fireIdle: 'fire-idle',
  fireFlame: 'fire-flame',
  candleFlame: 'candle-flame',
} as const;

/** Animations are global to the game, so they are registered exactly once in BootScene. */
export function registerAnimations(anims: Phaser.Animations.AnimationManager): void {
  const g = GEN.girl;
  anims.create({
    key: ANIM.girlIdle,
    frames: anims.generateFrameNumbers(TEX.girl, { start: g.idle[0], end: g.idle[1] }),
    frameRate: 5,
    repeat: -1,
  });
  anims.create({
    key: ANIM.girlWalk,
    frames: anims.generateFrameNumbers(TEX.girl, { start: g.walk[0], end: g.walk[1] }),
    frameRate: 11,
    repeat: -1,
  });
  anims.create({
    key: ANIM.girlJumpUp,
    frames: [{ key: TEX.girl, frame: g.jumpUp }],
  });
  anims.create({
    key: ANIM.girlJumpDown,
    frames: [{ key: TEX.girl, frame: g.jumpDown }],
  });
  const f = GEN.fireSpirit;
  anims.create({
    key: ANIM.fireIdle,
    frames: anims.generateFrameNumbers(TEX.fireSpirit, { start: f.idle[0], end: f.idle[1] }),
    frameRate: 6,
    repeat: -1,
  });
  anims.create({
    key: ANIM.fireFlame,
    frames: anims.generateFrameNumbers(TEX.fireSpirit, { start: f.flame[0], end: f.flame[1] }),
    frameRate: 8,
    repeat: -1,
  });
  anims.create({
    key: ANIM.candleFlame,
    frames: anims.generateFrameNumbers(TEX.flame, { start: 0, end: GEN.flame.frames - 1 }),
    frameRate: 7,
    repeat: -1,
    yoyo: true,
  });
}
