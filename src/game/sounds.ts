// Placeholder audio: short WebAudio beeps instead of asset files. The
// environment's `sounds` map picks a beep name per event; the harness can
// re-theme by changing those names.

const BEEPS: Record<string, { freq: number; duration: number; type: OscillatorType }> = {
  boing: { freq: 220, duration: 0.25, type: 'triangle' },
  ding: { freq: 880, duration: 0.15, type: 'sine' },
  tada: { freq: 660, duration: 0.4, type: 'square' },
  zap: { freq: 140, duration: 0.2, type: 'sawtooth' },
  pop: { freq: 520, duration: 0.1, type: 'sine' },
};

let context: AudioContext | null = null;

export function playBeep(name: string): void {
  try {
    context ??= new AudioContext();
    const beep = BEEPS[name] ?? BEEPS.pop;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = beep.type;
    oscillator.frequency.value = beep.freq;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + beep.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + beep.duration);
  } catch {
    // Audio is decoration; a blocked or missing AudioContext must never break play.
  }
}
