/** Base design resolution. The Scale.EXPAND mode grows one axis to fill the screen. */
export const BASE_W = 640;
export const BASE_H = 360;

export const FONT = '"Press Start 2P", monospace';

/** Warm, soft palette shared by UI and generated effects. */
export const COLORS = {
  outline: 0x3a2430,
  night: 0x1c1626,
  cream: 0xf7ecd2,
  pink: 0xf0a8b2,
  pinkDark: 0xcc788c,
  lavender: 0xb09cd6,
  gold: 0xffd05c,
  goldLight: 0xfff2b0,
  candle: 0xffb35c,
} as const;

export const CSS = {
  cream: '#f7ecd2',
  pink: '#f0a8b2',
  pinkDark: '#cc788c',
  outline: '#3a2430',
  gold: '#ffd05c',
} as const;

export const PHYSICS = {
  gravity: 1100,
  runSpeed: 165,
  groundAccel: 1500,
  groundDecel: 2000,
  airAccel: 1100,
  jumpVelocity: 430,
  jumpCutMultiplier: 0.45,
  maxFall: 620,
  coyoteMs: 110,
  jumpBufferMs: 130,
} as const;

export const SCENES = {
  boot: 'BootScene',
  menu: 'MenuScene',
  game: 'GameScene',
  ui: 'UIScene',
  ending: 'EndingScene',
} as const;
