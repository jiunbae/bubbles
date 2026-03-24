import { useUIStore } from '@/stores/ui-store';

let audioCtx: AudioContext | null = null;
let initialized = false;

/**
 * Lazy-initialize AudioContext on first user interaction (Chrome autoplay policy).
 */
export function initAudio(): void {
  if (initialized) return;
  initialized = true;

  try {
    audioCtx = new AudioContext();
    // Resume in case it was created in a suspended state
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch {
    // Web Audio API not available
    audioCtx = null;
  }
}

function getCtx(): AudioContext | null {
  if (!audioCtx) return null;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function isSoundEnabled(): boolean {
  return useUIStore.getState().isSoundEnabled;
}

/**
 * Blow sound — soft breathy "fwoop" using filtered white noise with quick fade in/out (~200ms).
 */
export function playBlow(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const duration = 0.2;
  const now = ctx.currentTime;

  // White noise buffer
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Bandpass filter for breathy quality
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 800;
  bandpass.Q.value = 0.8;

  // Gain envelope — quick fade in/out
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
  gain.gain.setValueAtTime(0.15, now + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(ctx.destination);

  source.start(now);
  source.stop(now + duration);
}

/**
 * Pop sound — satisfying "pop" with a short click + resonant tone, quick decay (~150ms).
 */
export function playPop(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Click — very short noise burst
  const clickDuration = 0.008;
  const clickBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * clickDuration), ctx.sampleRate);
  const clickData = clickBuf.getChannelData(0);
  for (let i = 0; i < clickData.length; i++) {
    clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickData.length);
  }
  const clickSrc = ctx.createBufferSource();
  clickSrc.buffer = clickBuf;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.3, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + clickDuration);
  clickSrc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickSrc.start(now);
  clickSrc.stop(now + clickDuration);

  // Resonant tone
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  // Randomize pitch slightly for variety
  osc.frequency.setValueAtTime(600 + Math.random() * 200, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.2, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

/**
 * Join sound — gentle chime with two sine tones in sequence (~300ms).
 */
export function playJoin(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First tone — C5
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 523;
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.15, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.15);

  // Second tone — E5, slightly delayed
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 659;
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, now + 0.12);
  gain2.gain.linearRampToValueAtTime(0.15, now + 0.14);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.3);
}
