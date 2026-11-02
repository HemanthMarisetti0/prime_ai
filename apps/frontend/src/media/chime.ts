let context: AudioContext | null = null;

/** A short rising two-tone chime to acknowledge the wake word. */
export function playWakeChime() {
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    [660, 990].forEach((frequency, i) => {
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(context!.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // Audio unavailable; the visual cue is enough.
  }
}
