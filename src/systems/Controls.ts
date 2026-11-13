import Phaser from 'phaser';
import { TEX } from '../config/assets';

/** Shared, mutable touch state written by TouchControls and read by Controls. */
export interface TouchState {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export const createTouchState = (): TouchState => ({ left: false, right: false, jump: false });

/**
 * Merges keyboard and touch input into one per-frame state.
 * Call update() exactly once per frame before reading jumpPressed.
 */
export class Controls {
  readonly touch: TouchState;
  left = false;
  right = false;
  jumpHeld = false;
  /** true only on the frame the jump input went down */
  jumpPressed = false;
  enabled = true;

  private readonly keys: Record<'left' | 'right' | 'a' | 'd' | 'up' | 'w' | 'space', Phaser.Input.Keyboard.Key>;
  private prevJump = false;

  constructor(scene: Phaser.Scene, touch: TouchState) {
    this.touch = touch;
    const K = Phaser.Input.Keyboard.KeyCodes;
    // addKeys enables key capture, so arrows/space never scroll the page
    this.keys = scene.input.keyboard!.addKeys({
      left: K.LEFT,
      right: K.RIGHT,
      a: K.A,
      d: K.D,
      up: K.UP,
      w: K.W,
      space: K.SPACE,
    }) as Controls['keys'];
  }

  update(): void {
    const k = this.keys;
    const t = this.touch;
    if (!this.enabled) {
      this.left = this.right = this.jumpHeld = this.jumpPressed = false;
      this.prevJump = true; // require a fresh press once re-enabled
      return;
    }
    this.left = k.left.isDown || k.a.isDown || t.left;
    this.right = k.right.isDown || k.d.isDown || t.right;
    this.jumpHeld = k.space.isDown || k.up.isDown || k.w.isDown || t.jump;
    this.jumpPressed = this.jumpHeld && !this.prevJump;
    this.prevJump = this.jumpHeld;
  }
}

interface TouchButton {
  key: keyof TouchState;
  img: Phaser.GameObjects.Image;
  up: string;
  down: string;
  pad: number;
}

/**
 * On-screen buttons for touch devices. Instead of per-button pointer events, every
 * frame each active pointer is hit-tested against the buttons. That makes holding
 * work reliably, supports two thumbs at once and lets a thumb slide from one
 * arrow to the other without lifting.
 */
export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly state: TouchState;
  private readonly buttons: TouchButton[];
  visible: boolean;

  constructor(scene: Phaser.Scene, state: TouchState) {
    this.scene = scene;
    this.state = state;
    const mk = (key: keyof TouchState, up: string, down: string, pad: number): TouchButton => ({
      key,
      up,
      down,
      pad,
      img: scene.add.image(0, 0, up).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0.88),
    });
    this.buttons = [
      mk('left', TEX.btnLeft, TEX.btnLeftDown, 10),
      mk('right', TEX.btnRight, TEX.btnRightDown, 10),
      mk('jump', TEX.btnJump, TEX.btnJumpDown, 16),
    ];
    const dev = scene.sys.game.device;
    this.visible = dev.input.touch && !dev.os.desktop;
    // a touch on a hybrid laptop reveals the buttons too
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.wasTouch && !this.visible) this.setVisible(true);
    });
    this.setVisible(this.visible);
    this.layout(scene.scale.width, scene.scale.height);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const b of this.buttons) b.img.setVisible(v);
  }

  layout(width: number, height: number): void {
    const m = 14;
    const [l, r, j] = this.buttons;
    const by = height - m - 24;
    l.img.setPosition(m + 22, by);
    r.img.setPosition(m + 22 + 44 + 14, by);
    j.img.setPosition(width - m - 28, by - 2);
  }

  update(): void {
    const s = this.state;
    s.left = s.right = s.jump = false;
    if (!this.visible) return;
    // each finger drives the nearest button whose (padded) area it is in
    for (const p of this.scene.input.manager.pointers) {
      if (!p.isDown) continue;
      let best: TouchButton | null = null;
      let bestD = Infinity;
      for (const b of this.buttons) {
        const dx = Math.abs(p.x - b.img.x);
        const dy = Math.abs(p.y - b.img.y);
        if (dx > b.img.width / 2 + b.pad || dy > b.img.height / 2 + b.pad) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) s[best.key] = true;
    }
    for (const b of this.buttons) b.img.setTexture(s[b.key] ? b.down : b.up);
  }
}
