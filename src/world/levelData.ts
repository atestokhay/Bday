import type { TileName } from '../config/assets';

/**
 * The one hand-placed level. Coordinates are world pixels; y grows downwards.
 * The ground line sits at y = 296 inside the 360px-tall base view.
 *
 * Jump reference (see PHYSICS): apex ~84px, flat jump distance ~125px.
 * Every required gap is <= 90px and every required climb <= 70px.
 */
export const GROUND_Y = 296;
export const WORLD_BOTTOM = 470;
export const WORLD_W = 3180;
export const PLAYER_START = { x: 70, y: GROUND_Y - 40 };

export interface GroundSeg {
  x: number;
  w: number;
  y: number; // walkable surface
}

export interface PlatformDef {
  tile: TileName;
  x: number; // centre
  y: number; // walkable surface
  solid?: boolean; // default: one-way (jump up through, land on top)
}

export interface DecoDef {
  key: string; // texture key or tile name prefixed with "t:"
  x: number; // centre
  y: number; // bottom
  layer?: 'far' | 'back' | 'front';
  flip?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export const grounds: GroundSeg[] = [
  { x: -40, w: 800, y: GROUND_Y }, // A: meadow start
  { x: 850, w: 570, y: GROUND_Y }, // B: bridge + rocks
  { x: 1620, w: 380, y: GROUND_Y }, // C1
  { x: 1996, w: 384, y: GROUND_Y - 40 }, // C2: raised plateau
  { x: 2470, w: 450, y: GROUND_Y }, // D: path to the pipe
];

export const platforms: PlatformDef[] = [
  { tile: 'island_med', x: 560, y: 228 },
  { tile: 'bridge', x: 1030, y: GROUND_Y - 23, solid: true },
  { tile: 'rock_long', x: 1185, y: 226 },
  { tile: 'rock_low', x: 1520, y: 272 },
  { tile: 'rock_vines', x: 1815, y: 222 },
  { tile: 'island_tiny', x: 2215, y: 188 },
  { tile: 'rock_long', x: 2690, y: 228 },
];

export const hearts: Point[] = [
  { x: 270, y: 268 },
  { x: 420, y: 268 },
  { x: 1030, y: 240 },
  { x: 1310, y: 268 },
  { x: 1520, y: 244 },
  { x: 1715, y: 268 },
  { x: 2120, y: 226 },
  { x: 2560, y: 268 },
];

export const stars: Point[] = [
  { x: 560, y: 196 },
  { x: 805, y: 222 },
  { x: 1185, y: 192 },
  { x: 1815, y: 190 },
  { x: 2215, y: 158 },
  { x: 2690, y: 196 },
];

/** The magical pipe stands on its own little floating island at the end. */
export const PIPE = { x: 2960, surfaceY: 288 };

const G = GROUND_Y + 1;
const R = GROUND_Y - 40 + 1;

export const decorations: DecoDef[] = [
  // --- A: start meadow ---
  { key: 't:tree_big', x: 190, y: G, layer: 'back' },
  { key: 'sign', x: 92, y: G, layer: 'back' },
  { key: 't:bush_small', x: 330, y: G, layer: 'back' },
  { key: 't:pink_flowers', x: 236, y: G, layer: 'front' },
  { key: 'flower_tulip', x: 352, y: G, layer: 'front' },
  { key: 't:lavender', x: 372, y: G, layer: 'front' },
  { key: 't:tree_round', x: 470, y: G, layer: 'back' },
  { key: 't:mush_red', x: 500, y: G, layer: 'front' },
  { key: 't:plant_a', x: 140, y: G, layer: 'front' },
  { key: 'fence', x: 616, y: G, layer: 'back' },
  { key: 'fence', x: 640, y: G, layer: 'back' },
  { key: 'fence', x: 664, y: G, layer: 'back' },
  { key: 'flower_daisy', x: 700, y: G, layer: 'front' },
  { key: 't:rocks', x: 735, y: G, layer: 'back' },
  // --- B ---
  { key: 't:sprout', x: 870, y: G, layer: 'front' },
  { key: 't:tree_pink', x: 905, y: G, layer: 'back' },
  { key: 't:flower_bush', x: 1112, y: G, layer: 'back' },
  { key: 't:tree_round', x: 1170, y: G, layer: 'back', flip: true },
  { key: 't:mush_pair', x: 1235, y: G, layer: 'front' },
  { key: 't:stump_roots', x: 1360, y: G, layer: 'back' },
  { key: 'flower_tulip', x: 1270, y: G, layer: 'front' },
  { key: 't:plant_b', x: 1400, y: G, layer: 'front' },
  // --- C1 ---
  { key: 't:log', x: 1660, y: G, layer: 'back' },
  { key: 't:tree_big', x: 1790, y: G, layer: 'back', flip: true },
  { key: 't:pink_flowers', x: 1880, y: G, layer: 'front' },
  { key: 't:mush_orange', x: 1940, y: G, layer: 'front' },
  { key: 'flower_daisy', x: 1700, y: G, layer: 'front' },
  // --- C2 plateau ---
  { key: 't:bush_fruit', x: 2050, y: R, layer: 'back' },
  { key: 't:tree_pink', x: 2160, y: R, layer: 'back', flip: true },
  { key: 't:stump_small', x: 2270, y: R, layer: 'back' },
  { key: 't:lavender', x: 2310, y: R, layer: 'front' },
  { key: 'fence', x: 2335, y: R, layer: 'back' },
  { key: 't:slab', x: 2090, y: R, layer: 'front' },
  // --- D: towards the pipe ---
  { key: 't:trunk_tall', x: 2500, y: G, layer: 'back' },
  { key: 't:flower_bush', x: 2600, y: G, layer: 'back' },
  { key: 't:tree_round', x: 2760, y: G, layer: 'back' },
  { key: 'flower_tulip', x: 2640, y: G, layer: 'front' },
  { key: 't:mush_red', x: 2790, y: G, layer: 'front' },
  { key: 'sign', x: 2880, y: G, layer: 'back' },
  { key: 't:plant_a', x: 2905, y: G, layer: 'front' },
];
