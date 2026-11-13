import Phaser from 'phaser';
import '@fontsource/press-start-2p/400.css';
import './style.css';
import { BASE_H, BASE_W, COLORS, PHYSICS } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { EndingScene } from './scenes/EndingScene';

// Block browser gestures that would scroll, zoom or select during play.
const prevent = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', prevent, { passive: false });
document.addEventListener('dblclick', prevent, { passive: false });
document.addEventListener('contextmenu', prevent);
document.addEventListener('touchmove', prevent, { passive: false });

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.night,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: BASE_W,
    height: BASE_H,
  },
  input: {
    activePointers: 4, // two thumbs + spares
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: PHYSICS.gravity },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, GameScene, UIScene, EndingScene],
});

// Handy for manual testing from the console; harmless in production.
(window as unknown as { __game: Phaser.Game }).__game = game;
