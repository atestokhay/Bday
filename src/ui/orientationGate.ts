import type Phaser from 'phaser';
import { GEN } from '../config/generatedAssets';
import { FONT } from '../config/constants';

const BASE = import.meta.env.BASE_URL;
const PX = 2; // CSS pixels per art pixel

type Phase = 'welcome' | 'leaving' | 'hidden' | 'reminder';

/**
 * Touch devices are greeted by a little pixel-art scene before the menu: the
 * girl stands next to a phone that keeps turning sideways. Once the device is
 * in landscape she cheers and the overlay fades into the game. If the phone is
 * turned upright again later, the game pauses behind a short reminder.
 */
export function setupOrientationGate(game: Phaser.Game): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return; // desktop: nothing to rotate

  const portrait = window.matchMedia('(orientation: portrait)');
  const el = buildOverlay();
  document.body.appendChild(el);
  const text = el.querySelector<HTMLElement>('.gate-text')!;
  const sub = el.querySelector<HTMLElement>('.gate-sub')!;
  const skip = el.querySelector<HTMLButtonElement>('.gate-skip')!;

  let phase: Phase = 'welcome';
  let allowPortrait = false;

  const setTexts = (main: string, small: string) => {
    text.textContent = main;
    sub.textContent = small;
  };

  const celebrateAndLeave = () => {
    if (phase !== 'welcome') return;
    phase = 'leaving';
    el.classList.add('ready');
    setTexts("Let's go!", '');
    window.setTimeout(() => el.classList.add('fade'), 1300);
    window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove('fade', 'ready', 'welcome');
      phase = 'hidden';
    }, 1900);
  };

  const showReminder = () => {
    phase = 'reminder';
    el.classList.add('reminder');
    setTexts('Turn your phone', 'sideways to keep playing');
    el.hidden = false;
    game.pause();
  };

  const hideReminder = () => {
    phase = 'hidden';
    el.hidden = true;
    el.classList.remove('reminder');
    game.resume();
  };

  const onOrientation = () => {
    const isPortrait = portrait.matches;
    if (phase === 'welcome' && !isPortrait) celebrateAndLeave();
    else if (phase === 'hidden' && isPortrait && !allowPortrait) showReminder();
    else if (phase === 'reminder' && !isPortrait) hideReminder();
  };
  portrait.addEventListener('change', onOrientation);
  window.addEventListener('resize', onOrientation);

  skip.addEventListener('click', () => {
    allowPortrait = true;
    if (phase === 'reminder') hideReminder();
    else {
      phase = 'welcome';
      celebrateAndLeave();
    }
  });
  window.setTimeout(() => skip.classList.add('show'), 6000);

  // Reveal once the pixel font is ready so the text doesn't pop in a fallback font.
  const reveal = () => el.classList.add('visible');
  Promise.race([document.fonts.load(`16px ${FONT}`, 'Welcome'), new Promise((r) => setTimeout(r, 1200))]).then(
    reveal,
    reveal,
  );

  // Already sideways? Say hello for a moment, then go straight in.
  if (!portrait.matches) window.setTimeout(celebrateAndLeave, 1600);
}

function buildOverlay(): HTMLElement {
  const g = GEN.girl;
  const el = document.createElement('div');
  el.className = 'gate welcome';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Welcome. Turn your phone sideways to play.');
  el.innerHTML = `
    <div class="gate-card">
      <h1 class="gate-title">Welcome!</h1>
      <div class="gate-stage">
        <span class="gate-spark s1"></span><span class="gate-spark s2"></span><span class="gate-spark s3"></span>
        <div class="gate-girl">
          <div class="girl-idle"></div>
          <div class="girl-cheer"></div>
        </div>
        <div class="gate-phone"></div>
      </div>
      <p class="gate-text">Turn your phone sideways</p>
      <p class="gate-sub">to start the adventure</p>
      <button class="gate-skip" type="button">continue anyway</button>
    </div>`;
  const s = el.style;
  s.setProperty('--px', `${PX}px`);
  s.setProperty('--girl-url', `url("${BASE}assets/processed/girl.png")`);
  s.setProperty('--phone-url', `url("${BASE}assets/processed/ui/phone.png")`);
  s.setProperty('--spark-url', `url("${BASE}assets/processed/px_sparkle.png")`);
  s.setProperty('--fw', `${g.frameWidth * PX}px`);
  s.setProperty('--fh', `${g.frameHeight * PX}px`);
  s.setProperty('--sheet-w', `${g.frameWidth * 12 * PX}px`);
  s.setProperty('--idle-end', `${-g.frameWidth * 4 * PX}px`);
  s.setProperty('--cheer-x', `${-g.frameWidth * g.jumpUp * PX}px`);
  el.hidden = false;
  return el;
}
