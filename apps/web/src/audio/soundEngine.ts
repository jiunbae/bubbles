import type { BubbleSize } from '@bubbles/shared';

/**
 * Web Audio API-based sound engine for bubble sounds.
 * All sounds are synthesised – no audio files needed.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = false;
  private volume: number = 0.5;

  // Active blow nodes (so we can stop them on release)
  private blowNodes: {
    noise: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  } | null = null;

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /** Initialise AudioContext. Must be called from a user gesture. */
  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);
    this.enabled = true;
  }

  /** Enable or disable all sounds. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopBlow();
    }
  }

  /** Set master volume (0-1). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  /** Clean up all audio resources. */
  dispose(): void {
    this.stopBlow();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }

  // ------------------------------------------------------------------
  // Sound: Blow (hold-to-grow)
  // ------------------------------------------------------------------

  /**
   * Start playing the blow sound. Call once when the user begins holding.
   * The sound sustains until stopBlow() is called.
   *
   * Synthesis: white noise -> bandpass filter (800Hz, Q=2)
   * Gain ramps from 0 to 0.1 over 100ms then sustains at 0.08.
   */
  playBlow(size: BubbleSize): void {
    if (!this.canPlay()) return;
    this.stopBlow(); // stop any existing blow sound

    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // White noise buffer (1 second, looping)
    const bufferSize = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Bandpass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    // Slowly ramp frequency upward to simulate pitch rise
    filter.frequency.linearRampToValueAtTime(1200, now + 2.0);
    filter.Q.value = 2;

    // Gain envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    noise.start(now);

    this.blowNodes = { noise, filter, gain };
  }

  /** Stop the blow sound (called on pointer up / release). */
  stopBlow(): void {
    if (!this.blowNodes) return;
    try {
      const ctx = this.ctx;
      if (ctx) {
        const now = ctx.currentTime;
        this.blowNodes.gain.gain.cancelScheduledValues(now);
        this.blowNodes.gain.gain.setValueAtTime(
          this.blowNodes.gain.gain.value,
          now,
        );
        this.blowNodes.gain.gain.linearRampToValueAtTime(0, now + 0.05);
        this.blowNodes.noise.stop(now + 0.06);
      } else {
        this.blowNodes.noise.stop();
      }
    } catch {
      // already stopped
    }
    this.blowNodes = null;
  }

  // ------------------------------------------------------------------
  // Sound: Pop
  // ------------------------------------------------------------------

  /**
   * Play a bubble pop sound.
   *
   * Synthesis:
   * - Short noise burst (20ms) through highpass filter (2000Hz)
   * - Mixed with sine oscillator dropping from startFreq to 200Hz in 50ms
   * - Gain envelope: peak -> 0 over 150ms
   * - Brief delay for reverb (30ms, 0.2 feedback)
   *
   * @param size  Bubble size (affects pitch: S=1200, M=1000, L=800)
   * @param isOwn true = full volume, false = 40% volume
   */
  playPop(size: BubbleSize, isOwn: boolean): void {
    if (!this.canPlay()) return;

    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const startFreq = size === 'S' ? 1200 : size === 'M' ? 1000 : 800;
    const volumeScale = isOwn ? 1.0 : 0.4;

    // --- Noise burst ---
    const noiseLen = 0.02; // 20ms
    const noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) {
      nd[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 2000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3 * volumeScale, now);
    noiseGain.gain.linearRampToValueAtTime(0, now + 0.15);

    noiseSrc.connect(hpFilter);
    hpFilter.connect(noiseGain);

    // --- Sine sweep ---
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.2 * volumeScale, now);
    oscGain.gain.linearRampToValueAtTime(0, now + 0.15);

    osc.connect(oscGain);

    // --- Simple delay "reverb" ---
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.03; // 30ms

    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0.2;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1.0;

    // Mix bus
    const mixGain = ctx.createGain();
    mixGain.gain.value = 1.0;

    noiseGain.connect(mixGain);
    oscGain.connect(mixGain);

    // Delay feedback loop
    mixGain.connect(dryGain);
    mixGain.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay); // feedback loop
    feedbackGain.connect(dryGain); // wet signal

    dryGain.connect(this.masterGain!);

    noiseSrc.start(now);
    osc.start(now);
    osc.stop(now + 0.2);
    noiseSrc.stop(now + noiseLen);

    // Cleanup
    const cleanup = () => {
      try {
        dryGain.disconnect();
        mixGain.disconnect();
        delay.disconnect();
        feedbackGain.disconnect();
      } catch {
        // already disconnected
      }
    };
    setTimeout(cleanup, 500);
  }

  // ------------------------------------------------------------------
  // Sound: Release (bubble detaches)
  // ------------------------------------------------------------------

  /**
   * Brief sine tone at 600Hz for 100ms with gentle fade.
   * Like a soap film closing.
   */
  playRelease(): void {
    if (!this.canPlay()) return;

    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 600;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // ------------------------------------------------------------------
  // Sound: Join notification
  // ------------------------------------------------------------------

  /**
   * Two quick sine tones: 800Hz (50ms) then 1000Hz (50ms).
   * Very quiet (0.05 gain). Soft notification sound.
   */
  playJoin(): void {
    if (!this.canPlay()) return;

    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // First tone
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 800;

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.05, now);
    gain1.gain.linearRampToValueAtTime(0, now + 0.05);

    osc1.connect(gain1);
    gain1.connect(this.masterGain!);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Second tone
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 1000;

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.05, now + 0.05);
    gain2.gain.linearRampToValueAtTime(0, now + 0.1);

    osc2.connect(gain2);
    gain2.connect(this.masterGain!);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.11);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private canPlay(): boolean {
    if (!this.enabled || !this.ctx || !this.masterGain) return false;
    // Resume suspended context (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  }
}
