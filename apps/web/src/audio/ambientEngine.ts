import type { PlaceTheme } from '@bubbles/shared';

/**
 * Web Audio API-based ambient sound engine.
 * Synthesises per-theme soundscapes — no audio files needed.
 */
class AmbientEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimeouts: number[] = [];
  private currentTheme: PlaceTheme | null = null;
  private enabled: boolean = true;
  private volume: number = 0.3;
  private visibilityHandler: (() => void) | null = null;

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

    // Pause when tab is hidden to save CPU
    this.visibilityHandler = () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') {
        this.ctx.suspend();
      } else {
        if (this.enabled) this.ctx.resume();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** Switch to a new theme soundscape. */
  setTheme(theme: PlaceTheme): void {
    if (theme === this.currentTheme) return;
    this.stop();
    this.currentTheme = theme;
    if (!this.enabled || !this.ctx || !this.masterGain) return;

    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    switch (theme) {
      case 'rooftop':
        this.buildRooftop();
        break;
      case 'park':
        this.buildPark();
        break;
      case 'alley':
        this.buildAlley();
        break;
    }
  }

  /** Set master volume (0-1). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  /** Enable or disable ambient sounds. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    } else if (this.currentTheme) {
      // Re-build the current theme
      this.setTheme(this.currentTheme);
    }
  }

  /** Stop all currently playing sounds. */
  stop(): void {
    // Clear scheduled timeouts (bird chirps, crackles, etc.)
    for (const id of this.activeTimeouts) {
      clearTimeout(id);
    }
    this.activeTimeouts = [];

    // Disconnect and stop all active nodes
    for (const node of this.activeNodes) {
      try {
        if (node instanceof AudioBufferSourceNode || node instanceof OscillatorNode) {
          node.stop();
        }
        node.disconnect();
      } catch {
        // already stopped/disconnected
      }
    }
    this.activeNodes = [];
    this.currentTheme = null;
  }

  /** Clean up all audio resources. */
  dispose(): void {
    this.stop();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }

  // ------------------------------------------------------------------
  // Theme builders
  // ------------------------------------------------------------------

  /**
   * Rooftop: city wind + subtle low drone.
   * - Brown noise through lowpass filter (wind)
   * - Low sine drone at ~80Hz
   */
  private buildRooftop(): void {
    const ctx = this.ctx!;

    // --- Wind: brown noise through lowpass ---
    const windBuffer = this.createNoiseBuffer('brown');
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = windBuffer;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 0.7;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.15;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.masterGain!);
    windSrc.start();

    this.activeNodes.push(windSrc, windFilter, windGain);

    // --- Low sine drone at ~80Hz ---
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 80;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.04;

    drone.connect(droneGain);
    droneGain.connect(this.masterGain!);
    drone.start();

    this.activeNodes.push(drone, droneGain);
  }

  /**
   * Park: nature ambience.
   * - Pink noise through bandpass (rustling leaves)
   * - Periodic chirp oscillators (bird-like frequency sweeps)
   */
  private buildPark(): void {
    const ctx = this.ctx!;

    // --- Rustling leaves: pink noise through bandpass ---
    const leavesBuffer = this.createNoiseBuffer('pink');
    const leavesSrc = ctx.createBufferSource();
    leavesSrc.buffer = leavesBuffer;
    leavesSrc.loop = true;

    const leavesFilter = ctx.createBiquadFilter();
    leavesFilter.type = 'bandpass';
    leavesFilter.frequency.value = 1200;
    leavesFilter.Q.value = 0.5;

    const leavesGain = ctx.createGain();
    leavesGain.gain.value = 0.08;

    leavesSrc.connect(leavesFilter);
    leavesFilter.connect(leavesGain);
    leavesGain.connect(this.masterGain!);
    leavesSrc.start();

    this.activeNodes.push(leavesSrc, leavesFilter, leavesGain);

    // --- Bird chirps: random frequency sweeps at intervals ---
    const scheduleChirp = () => {
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      const startFreq = 2000 + Math.random() * 2000; // 2000-4000Hz
      const endFreq = startFreq + (Math.random() > 0.5 ? 400 : -400);
      const duration = 0.08 + Math.random() * 0.12; // 80-200ms

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

      const chirpGain = this.ctx.createGain();
      chirpGain.gain.setValueAtTime(0, now);
      chirpGain.gain.linearRampToValueAtTime(0.03, now + duration * 0.2);
      chirpGain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(chirpGain);
      chirpGain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + duration + 0.01);

      // Sometimes do a double-chirp
      if (Math.random() > 0.5) {
        const gap = 0.1 + Math.random() * 0.05;
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        const f2 = startFreq + 200 + Math.random() * 500;
        osc2.frequency.setValueAtTime(f2, now + gap);
        osc2.frequency.exponentialRampToValueAtTime(f2 * 0.85, now + gap + duration * 0.8);

        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0, now + gap);
        g2.gain.linearRampToValueAtTime(0.025, now + gap + duration * 0.2);
        g2.gain.linearRampToValueAtTime(0, now + gap + duration * 0.8);

        osc2.connect(g2);
        g2.connect(this.masterGain!);
        osc2.start(now + gap);
        osc2.stop(now + gap + duration + 0.01);
      }

      // Schedule next chirp at random interval (2-6 seconds)
      const nextDelay = 2000 + Math.random() * 4000;
      const timeoutId = window.setTimeout(scheduleChirp, nextDelay);
      this.activeTimeouts.push(timeoutId);
    };

    // Start first chirp after a short delay
    const firstTimeout = window.setTimeout(scheduleChirp, 1000 + Math.random() * 2000);
    this.activeTimeouts.push(firstTimeout);
  }

  /**
   * Alley: warm indoor ambience.
   * - Brown noise through aggressive lowpass (muffled ambience)
   * - Gentle crackle (random short noise bursts)
   */
  private buildAlley(): void {
    const ctx = this.ctx!;

    // --- Muffled ambience: brown noise through aggressive lowpass ---
    const ambBuffer = this.createNoiseBuffer('brown');
    const ambSrc = ctx.createBufferSource();
    ambSrc.buffer = ambBuffer;
    ambSrc.loop = true;

    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 200;
    ambFilter.Q.value = 1.0;

    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.12;

    ambSrc.connect(ambFilter);
    ambFilter.connect(ambGain);
    ambGain.connect(this.masterGain!);
    ambSrc.start();

    this.activeNodes.push(ambSrc, ambFilter, ambGain);

    // --- Crackle: random short noise bursts ---
    const scheduleCrackle = () => {
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      const burstDuration = 0.005 + Math.random() * 0.015; // 5-20ms

      const bufferSize = Math.ceil(this.ctx.sampleRate * burstDuration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // decay envelope
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const crackleFilter = this.ctx.createBiquadFilter();
      crackleFilter.type = 'highpass';
      crackleFilter.frequency.value = 800;

      const crackleGain = this.ctx.createGain();
      crackleGain.gain.value = 0.015 + Math.random() * 0.015;

      src.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(this.masterGain!);
      src.start(now);

      // Schedule next crackle (50-200ms apart for a steady crackle)
      const nextDelay = 50 + Math.random() * 150;
      const timeoutId = window.setTimeout(scheduleCrackle, nextDelay);
      this.activeTimeouts.push(timeoutId);
    };

    const firstTimeout = window.setTimeout(scheduleCrackle, 200);
    this.activeTimeouts.push(firstTimeout);
  }

  // ------------------------------------------------------------------
  // Noise generation
  // ------------------------------------------------------------------

  /**
   * Generate a noise AudioBuffer (2 seconds, loopable).
   * - white: uniform random
   * - pink: -3dB/octave roll-off (Voss-McCartney approximation)
   * - brown: integrated white noise (-6dB/octave)
   */
  private createNoiseBuffer(type: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const length = ctx.sampleRate * 2; // 2 seconds
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'pink') {
      // Paul Kellet's refined method
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      // brown: integrate white noise
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5; // boost
      }
    }

    return buffer;
  }
}

export const ambientEngine = new AmbientEngine();
