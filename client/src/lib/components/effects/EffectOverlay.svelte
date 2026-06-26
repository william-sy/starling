<script lang="ts">
  import { onMount }        from 'svelte';
  import type { EffectType } from '$lib/types/effects';
  import { pendingTrigger } from '$lib/stores/effects';
  export type { EffectType };

  onMount(() => {
    return pendingTrigger.subscribe(t => {
      if (!t) return;
      pendingTrigger.set(null);
      trigger(t);
    });
  });

  // Particle effects (confetti, hearts burst, letsgo burst)
  type ParticleEffect = 'confetti' | 'hearts' | 'letsgo';

  interface Particle {
    id:    number;
    tx:    number;
    ty:    number;
    rot:   number;
    color: string;
    size:  number;
    delay: number;
    shape: 'circle' | 'star' | 'square';
  }

  interface LoveHeart {
    id:    number;
    x:     number;
    size:  number;
    delay: number;
    sway:  number;
    speed: number;
  }

  const PALETTES: Record<ParticleEffect, string[]> = {
    confetti: ['oklch(0.75 0.20 45)',  'oklch(0.68 0.22 155)', 'oklch(0.62 0.18 260)', 'oklch(0.72 0.20 310)', 'oklch(0.78 0.14 70)'],
    hearts:   ['oklch(0.65 0.25 20)',  'oklch(0.70 0.22 0)',   'oklch(0.75 0.18 350)', 'oklch(0.68 0.16 340)'],
    letsgo:   ['oklch(0.88 0.22 70)',  'oklch(0.82 0.20 55)',  'oklch(0.92 0.18 85)',  'oklch(0.75 0.22 45)'],
  };

  let active   = false;
  let current: EffectType = 'peck';

  // Particle state
  let particles: Particle[] = [];
  let flashVisible = false;

  // Special effect state
  let slapVisible    = false;
  let ghostVisible   = false;
  let birdVisible    = false;
  let loveHearts: LoveHeart[] = [];
  let letsgoVisible  = false;
  let thunderVisible = false;

  export function trigger(type: EffectType = 'peck'): void {
    current = type;
    active  = true;

    if (type === 'ghost') {
      ghostVisible = true;
      setTimeout(() => { ghostVisible = false; active = false; }, 2200);
      return;
    }

    if (type === 'slap') {
      slapVisible = true;
      setTimeout(() => { slapVisible = false; active = false; }, 1500);
      return;
    }

    if (type === 'peck') {
      birdVisible = true;
      setTimeout(() => { birdVisible = false; active = false; }, 1800);
      return;
    }

    if (type === 'love') {
      loveHearts = Array.from({ length: 10 }, (_, i) => ({
        id:    i,
        x:     20 + Math.random() * 60,
        size:  24 + Math.random() * 32,
        delay: Math.random() * 0.6,
        sway:  (Math.random() - 0.5) * 60,
        speed: 1.6 + Math.random() * 0.8,
      }));
      flashVisible = true;
      setTimeout(() => { flashVisible = false; }, 350);
      setTimeout(() => { loveHearts = []; active = false; }, 2500);
      return;
    }

    if (type === 'thunder') {
      thunderVisible = true;
      setTimeout(() => { thunderVisible = false; active = false; }, 1200);
      return;
    }

    // Particle burst: confetti, hearts (burst), letsgo
    const pal = PALETTES[type as ParticleEffect];
    const count = type === 'confetti' ? 34 : 16;
    particles = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 360 + (Math.random() - 0.5) * (360 / count);
      const dist  = 18 + Math.random() * 32;
      const rad   = (angle * Math.PI) / 180;
      const shapes: Particle['shape'][] = ['circle', 'star', 'square'];
      return {
        id:    i,
        tx:    Math.cos(rad) * dist,
        ty:    Math.sin(rad) * dist,
        rot:   (Math.random() - 0.5) * 720,
        color: pal[i % pal.length],
        size:  type === 'letsgo' ? 4 + Math.random() * 5 : 5 + Math.random() * 7,
        delay: Math.random() * 0.08,
        shape: type === 'hearts' ? 'circle' : shapes[i % 3],
      };
    });

    if (type === 'letsgo') {
      letsgoVisible = true;
      flashVisible  = true;
      setTimeout(() => { flashVisible = false; }, 300);
      setTimeout(() => { letsgoVisible = false; particles = []; active = false; }, 1800);
      return;
    }

    // confetti / hearts burst
    flashVisible = true;
    setTimeout(() => { flashVisible = false; }, 350);
    setTimeout(() => { active = false; particles = []; }, 1500);
  }
</script>

{#if active}
  <div class="overlay" aria-hidden="true">

    <!-- ── Ghost effect ── -->
    {#if ghostVisible}
      <div class="ghost-flash"></div>
      <div class="ghost">👻</div>
    {/if}

    <!-- ── Slap effect ── -->
    {#if slapVisible}
      <div class="fish">🐟</div>
      <div class="slap-word">SLAP!</div>
    {/if}

    <!-- ── Peck redesign (bird) ── -->
    {#if birdVisible}
      <div class="bird">🐦</div>
    {/if}

    <!-- ── Love (floating hearts) ── -->
    {#if loveHearts.length > 0}
      <div class="flash hearts"></div>
      {#each loveHearts as h (h.id)}
        <div
          class="love-heart"
          style="
            --hx: {h.x}%;
            --hsz: {h.size}px;
            --hd: {h.delay}s;
            --hspeed: {h.speed}s;
            --hsway: {h.sway}px;
          "
        >❤️</div>
      {/each}
    {/if}

    <!-- ── LetsGo ── -->
    {#if letsgoVisible}
      <div class="letsgo-word">LET'S GO!</div>
    {/if}

    <!-- ── Thunder ── -->
    {#if thunderVisible}
      <div class="thunder-flash"></div>
      <svg class="lightning" viewBox="0 0 100 120" aria-hidden="true">
        <defs>
          <filter id="bolt-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path d="M 55,5 L 30,58 L 48,58 L 22,115 L 75,48 L 57,48 Z"
              fill="oklch(0.95 0.20 95)"
              filter="url(#bolt-glow)"/>
      </svg>
    {/if}

    <!-- ── Particle effects (confetti / hearts burst / letsgo) ── -->
    {#if !ghostVisible && !slapVisible && !birdVisible && !thunderVisible && (particles.length > 0 || flashVisible)}
      {#if flashVisible && !loveHearts.length}
        <div
          class="flash"
          class:hearts={current === 'hearts'}
          class:letsgo={current === 'letsgo'}
        ></div>
      {/if}
      {#each particles as p (p.id)}
        <div
          class="p {p.shape}"
          style="
            --tx: {p.tx}vw; --ty: {p.ty}vh;
            --rot: {p.rot}deg; --color: {p.color};
            --sz: {p.size}px; --d: {p.delay}s;
          "
        ></div>
      {/each}
    {/if}

  </div>
{/if}

<style>
.overlay {
  position: fixed; inset: 0;
  z-index: 200;
  pointer-events: none;
  overflow: hidden;
}

/* ── Ghost ── */
.ghost-flash {
  position: absolute; inset: 0;
  background: #fff;
  animation: ghost-flash 1.8s ease-out forwards;
}
.ghost {
  position: absolute;
  left: 50%; top: 50%;
  font-size: 96px;
  line-height: 1;
  animation: ghost-rise 2.0s cubic-bezier(.2, .8, .4, 1) forwards;
  filter: drop-shadow(0 0 32px oklch(1 0 0 / 0.60));
}

@keyframes ghost-flash {
  0%   { opacity: 0; }
  15%  { opacity: 0.95; }
  45%  { opacity: 0.70; }
  70%  { opacity: 0.30; }
  100% { opacity: 0; }
}

@keyframes ghost-rise {
  0%   { transform: translate(-50%, 80%) scale(0.4); opacity: 0; }
  20%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
  40%  { transform: translate(-50%, -53%) scale(0.92) rotate(-6deg); opacity: 1; }
  55%  { transform: translate(-50%, -48%) scale(1.05) rotate(6deg); opacity: 1; }
  70%  { transform: translate(-50%, -52%) scale(1) rotate(-3deg); opacity: 1; }
  85%  { transform: translate(-50%, -55%) scale(1.08); opacity: 0.8; }
  100% { transform: translate(-50%, -130%) scale(0.6); opacity: 0; }
}

/* ── Slap ── */
.fish {
  position: absolute;
  left: 50%; top: 50%;
  font-size: 76px;
  line-height: 1;
  animation: fish-arc 1.4s cubic-bezier(.4, 0, .2, 1) forwards;
  filter: drop-shadow(0 4px 16px oklch(0 0 0 / 0.40));
}

.slap-word {
  position: absolute;
  left: 50%; top: 50%;
  font-family: var(--font-ui);
  font-size: 68px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: oklch(0.88 0.22 70);
  text-shadow:
    3px  3px 0 oklch(0.50 0.18 50),
   -1px -1px 0 oklch(0.30 0.10 50);
  animation: slap-burst 1.4s cubic-bezier(.2, .9, .4, 1) forwards;
  white-space: nowrap;
}

@keyframes fish-arc {
  0%   { transform: translate(calc(-50% - 70vw), -50%) rotate(-60deg) scaleX(-1); opacity: 0; }
  8%   { opacity: 1; }
  35%  { transform: translate(calc(-50% - 15vw), calc(-50% - 18vh)) rotate(-20deg) scaleX(-1); opacity: 1; }
  55%  { transform: translate(calc(-50% + 5vw), -50%) rotate(15deg) scaleX(-1); opacity: 1; }
  75%  { transform: translate(calc(-50% + 30vw), calc(-50% - 8vh)) rotate(35deg) scaleX(-1); opacity: 0.7; }
  100% { transform: translate(calc(-50% + 75vw), -50%) rotate(50deg) scaleX(-1); opacity: 0; }
}

@keyframes slap-burst {
  0%   { transform: translate(-50%, -50%) scale(0.1) rotate(-20deg); opacity: 0; }
  38%  { transform: translate(-50%, -50%) scale(1.25) rotate(-8deg); opacity: 1; }
  58%  { transform: translate(-50%, -50%) scale(1.0) rotate(0deg); opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.4) rotate(4deg); opacity: 0; }
}

/* ── Peck (bird redesign) ── */
.bird {
  position: absolute;
  left: 50%; top: 50%;
  font-size: 58px;
  line-height: 1;
  filter: drop-shadow(0 4px 12px oklch(0 0 0 / 0.35));
  animation: bird-fly 1.8s cubic-bezier(.3, .8, .5, 1) forwards;
  transform-origin: center;
}

@keyframes bird-fly {
  0%   { transform: translate(calc(-50% - 70vw), calc(-50% + 4vh)) scale(0.6); opacity: 0; }
  8%   { opacity: 1; }
  38%  { transform: translate(calc(-50% - 12vw), calc(-50% - 6vh)) scale(1.05); opacity: 1; }
  52%  { transform: translate(calc(-50% + 2vw), -50%) scale(1); opacity: 1; }
  57%  { transform: translate(calc(-50% + 2vw), calc(-50% + 8px)) scale(1.08); opacity: 1; }
  62%  { transform: translate(calc(-50% + 2vw), calc(-50% - 5px)) scale(0.95); opacity: 1; }
  67%  { transform: translate(calc(-50% + 2vw), calc(-50% + 4px)) scale(1.03); opacity: 1; }
  72%  { transform: translate(calc(-50% + 2vw), -50%) scale(1); opacity: 1; }
  87%  { transform: translate(calc(-50% + 28vw), calc(-50% - 10vh)) scale(0.85); opacity: 0.75; }
  100% { transform: translate(calc(-50% + 72vw), calc(-50% - 3vh)) scale(0.55); opacity: 0; }
}

/* ── Love (floating hearts) ── */
.love-heart {
  position: absolute;
  bottom: 10%;
  left: var(--hx);
  font-size: var(--hsz);
  line-height: 1;
  animation: heart-float var(--hspeed) var(--hd) ease-out forwards;
}

@keyframes heart-float {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  10%  { opacity: 1; }
  50%  { transform: translateY(-35vh) translateX(var(--hsway)); opacity: 0.9; }
  80%  { transform: translateY(-65vh) translateX(calc(var(--hsway) * -0.5)); opacity: 0.4; }
  100% { transform: translateY(-90vh) translateX(0); opacity: 0; }
}

/* ── LetsGo ── */
.letsgo-word {
  position: absolute;
  left: 50%; top: 50%;
  font-family: var(--font-ui);
  font-size: clamp(52px, 9vw, 84px);
  font-weight: 900;
  letter-spacing: -0.02em;
  white-space: nowrap;
  color: oklch(0.90 0.22 72);
  text-shadow:
    3px  3px 0 oklch(0.48 0.20 52),
   -1px -1px 0 oklch(0.30 0.12 50);
  animation: letsgo-burst 1.7s cubic-bezier(.2, .9, .4, 1) forwards;
}

@keyframes letsgo-burst {
  0%   { transform: translate(-50%, -50%) scale(0.05) rotate(-8deg); opacity: 0; }
  30%  { transform: translate(-50%, -50%) scale(1.30) rotate(-3deg); opacity: 1; }
  50%  { transform: translate(-50%, -50%) scale(1.0) rotate(0deg); opacity: 1; }
  72%  { transform: translate(-50%, -50%) scale(1.05) rotate(0deg); opacity: 1; }
  88%  { opacity: 0.85; }
  100% { transform: translate(-50%, -50%) scale(1.35) rotate(2deg); opacity: 0; }
}

/* ── Thunder ── */
.thunder-flash {
  position: absolute; inset: 0;
  background: oklch(0.98 0.08 95);
  animation: thunder-flash 0.9s ease-out forwards;
}
.lightning {
  position: absolute;
  left: 50%; top: 50%;
  width: 80px; height: 96px;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 0 18px oklch(0.92 0.22 85)) drop-shadow(0 0 40px oklch(0.80 0.20 80));
  animation: lightning-burst 1.1s cubic-bezier(.2, .9, .4, 1) forwards;
}

@keyframes thunder-flash {
  0%   { opacity: 0.88; }
  18%  { opacity: 0.75; }
  40%  { opacity: 0.35; }
  70%  { opacity: 0.12; }
  100% { opacity: 0; }
}

@keyframes lightning-burst {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  15%  { transform: translate(-50%, -50%) scale(1.25); opacity: 1; }
  35%  { transform: translate(-50%, -50%) scale(0.95); opacity: 1; }
  60%  { opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
}

/* ── Particle flash ── */
.flash {
  position: absolute; inset: 0;
  animation: flash-out 0.35s ease-out forwards;
}
.flash.hearts  { background: oklch(0.65 0.25 20 / 0.20); }
.flash.letsgo  { background: oklch(0.88 0.22 70 / 0.18); }
.flash:not(.hearts):not(.letsgo) { background: oklch(0.68 0.20 155 / 0.18); }

@keyframes flash-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Particles ── */
.p {
  position: absolute;
  left: 50%; top: 50%;
  width: var(--sz); height: var(--sz);
  background: var(--color);
  animation: fly 1.3s var(--d) cubic-bezier(.2, .8, .4, 1) forwards;
}
.p.circle { border-radius: 50%; }
.p.square  { border-radius: 2px; }
.p.star {
  clip-path: polygon(
    50% 0%, 61% 35%, 98% 35%, 68% 57%,
    79% 91%, 50% 70%, 21% 91%, 32% 57%,
    2%  35%, 39% 35%
  );
}

@keyframes fly {
  0% {
    transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1.2);
    opacity: 1;
  }
  65% { opacity: 1; }
  100% {
    transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.15);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .p, .flash, .fish, .slap-word, .ghost, .ghost-flash,
  .bird, .love-heart, .letsgo-word, .thunder-flash, .lightning { animation: none; opacity: 0; }
}
</style>
