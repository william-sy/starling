import type { NotifSound } from '$lib/stores/settings';

export function playSound(type: NotifSound | 'peck'): void {
  if (type === 'none') return;
  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') return;

  const ctx = new (AudioContext || (window as any).webkitAudioContext)();

  const note = (freq: number, start: number, dur: number, vol = 0.35, wave: OscillatorType = 'sine') => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(vol, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  };

  if (type === 'ding') {
    note(1174, 0, 0.45);

  } else if (type === 'chime') {
    note(1047, 0,    0.55);
    note(1319, 0.14, 0.55);
    note(1568, 0.28, 0.70);

  } else if (type === 'pop') {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.30, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);

  } else if (type === 'boop') {
    // Soft rounded boop — descending sine with smooth envelope
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.36);

  } else if (type === 'bell') {
    // Clear bell: fundamental + two partials, natural decay
    note(880, 0,    0.80, 0.28);
    note(2217, 0,   0.50, 0.10);
    note(3520, 0,   0.30, 0.04);

  } else if (type === 'peck') {
    [880, 660, 440].forEach((f, i) => note(f, i * 0.09, 0.18, 0.22, 'square'));
  }
}
