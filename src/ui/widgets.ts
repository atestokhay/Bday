import Phaser from 'phaser';
import { TEX } from '../config/assets';
import { CSS, FONT } from '../config/constants';

/** Press Start 2P is drawn on an 8px grid, so sizes are kept to multiples of 8. */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: 8 | 16 | 24 | 32 = 8,
  color: string = CSS.cream,
  shadow: string | null = CSS.outline,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    align: 'center',
  });
  if (shadow) {
    const d = Math.max(1, size / 8);
    t.setShadow(d, d, shadow, 0, false, true);
  }
  return t;
}

/** Pink pixel pill button with a label. Fires onClick on release inside the button. */
export function pillButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; height?: number; size?: 8 | 16 } = {},
): Phaser.GameObjects.Container {
  const w = opts.width ?? 112;
  const h = opts.height ?? 32;
  const bg = scene.add.nineslice(0, 0, TEX.buttonPink, undefined, w, h, 6, 6, 6, 6);
  const txt = pixelText(scene, 0, -1, label, opts.size ?? 16, CSS.cream, CSS.pinkDark).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, txt]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  let pressed = false;
  const setPressed = (down: boolean) => {
    pressed = down;
    bg.y = down ? 2 : 0;
    txt.y = down ? 1 : -1;
    if (down) bg.setTint(0xf2d8dc);
    else bg.clearTint();
  };
  const release = (fire: boolean) => {
    if (!pressed) return;
    setPressed(false);
    if (fire) onClick();
  };
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => setPressed(true));
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => release(true));
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => release(false));
  return c;
}

/** Small icon button that toggles fullscreen where the browser supports it. */
export function fullscreenButton(scene: Phaser.Scene): Phaser.GameObjects.Image | null {
  if (!scene.scale.fullscreen.available) return null;
  const img = scene.add.image(0, 0, TEX.btnFullscreen).setScrollFactor(0).setDepth(110).setAlpha(0.85);
  img.setInteractive({ useHandCursor: true });
  // must run inside a pointerup handler for the browser to allow it
  img.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (scene.scale.isFullscreen) {
      scene.scale.stopFullscreen();
    } else {
      scene.scale.startFullscreen();
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      orientation.lock?.('landscape').catch(() => undefined);
    }
  });
  const place = (w: number) => img.setPosition(w - 18, 18);
  place(scene.scale.width);
  const onResize = (size: Phaser.Structs.Size) => place(size.width);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  return img;
}
