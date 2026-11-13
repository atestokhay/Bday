import Phaser from 'phaser';
import { ANIM, TEX } from '../config/assets';
import { GEN } from '../config/generatedAssets';
import { PHYSICS } from '../config/constants';
import type { Controls } from '../systems/Controls';

const BODY_W = 18;
const BODY_H = 48;

export const PLAYER_EVENTS = {
  jump: 'player-jump',
  land: 'player-land',
} as const;

/** The girl. Movement is acceleration based with coyote time, jump buffering and variable jump height. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  private coyoteMs = 0;
  private bufferMs = 0;
  private rising = false;
  private wasGrounded = false;
  private lastVy = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.girl, GEN.girl.idle[0]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const fw = GEN.girl.frameWidth;
    const fh = GEN.girl.frameHeight;
    // feet are drawn on the last row of the frame; the body ends one row above it
    this.body.setSize(BODY_W, BODY_H).setOffset(Math.round((fw - BODY_W) / 2), fh - 1 - BODY_H);
    this.body.setMaxVelocity(PHYSICS.runSpeed * 2, PHYSICS.maxFall);
    this.setDepth(10);
    this.play(ANIM.girlIdle);
  }

  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  /** Bottom of the feet in world space. */
  get feetY(): number {
    return this.body.bottom;
  }

  step(controls: Controls, dtMs: number): void {
    const body = this.body;
    const dt = dtMs / 1000;
    const grounded = this.grounded;

    if (grounded) {
      this.coyoteMs = PHYSICS.coyoteMs;
      this.rising = false;
    } else {
      this.coyoteMs -= dtMs;
    }
    this.bufferMs = controls.jumpPressed ? PHYSICS.jumpBufferMs : this.bufferMs - dtMs;

    if (this.bufferMs > 0 && this.coyoteMs > 0) {
      body.setVelocityY(-PHYSICS.jumpVelocity);
      this.bufferMs = 0;
      this.coyoteMs = 0;
      this.rising = true;
      this.emit(PLAYER_EVENTS.jump);
    }
    // releasing jump early gives a short hop
    if (this.rising && !controls.jumpHeld && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * PHYSICS.jumpCutMultiplier);
      this.rising = false;
    }
    if (body.velocity.y >= 0) this.rising = false;

    const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const target = dir * PHYSICS.runSpeed;
    const accel = grounded ? (dir !== 0 ? PHYSICS.groundAccel : PHYSICS.groundDecel) : PHYSICS.airAccel;
    const vx = body.velocity.x;
    const next = vx < target ? Math.min(vx + accel * dt, target) : Math.max(vx - accel * dt, target);
    body.setVelocityX(next);
    if (dir !== 0) this.setFlipX(dir < 0);

    if (grounded && !this.wasGrounded && this.lastVy > 160) this.emit(PLAYER_EVENTS.land);
    this.wasGrounded = grounded;
    this.lastVy = body.velocity.y;

    this.updateAnimation(grounded);
  }

  private updateAnimation(grounded: boolean): void {
    let key: string;
    if (grounded) key = Math.abs(this.body.velocity.x) > 12 ? ANIM.girlWalk : ANIM.girlIdle;
    else key = this.body.velocity.y < 0 ? ANIM.girlJumpUp : ANIM.girlJumpDown;
    if (this.anims.currentAnim?.key !== key) this.play(key, true);
  }

  /** Stop all motion and physics, e.g. before a scripted sequence. */
  freeze(): void {
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    this.body.enable = false;
  }

  respawn(x: number, y: number): void {
    this.body.reset(x, y);
    this.coyoteMs = 0;
    this.bufferMs = 0;
    this.rising = false;
  }
}
