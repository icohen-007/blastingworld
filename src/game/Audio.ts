import type { ProjectileKind } from "../data/weapons";

/**
 * Procedural cinematic launcher SFX (Web Audio) — fiction VFX only.
 * Each tube has a distinct launch + impact signature.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  unlock(): void {
    if (this.unlocked) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.unlocked = true;
    void this.ctx.resume();
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain = 0.08,
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + duration);
    }
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(
    duration: number,
    gain = 0.1,
    filterFreq = 800,
    filterType: BiquadFilterType = "lowpass",
    delay = 0,
  ): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(
      filterType === "highpass" ? filterFreq * 0.4 : 120,
      t0 + duration,
    );
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  private smokeHiss(duration = 1.4, gain = 0.035, delay = 0, band = 900): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = band;
    filter.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** Launch by tube type — backblast + rocket flight. */
  fireLauncher(kind: ProjectileKind): void {
    switch (kind) {
      case "bazooka":
        // Thick WWII whoosh + heavy backblast
        this.noiseBurst(0.14, 0.2, 2400, "highpass");
        this.noiseBurst(0.32, 0.18, 620);
        this.tone(130, 0.28, "sawtooth", 0.1, 42);
        this.tone(62, 0.42, "square", 0.09, 24);
        this.tone(380, 0.55, "sawtooth", 0.028, 140);
        this.smokeHiss(1.8, 0.045, 0.08, 700);
        break;
      case "rpg7":
        // Sharp crack + black exhaust roar
        this.noiseBurst(0.06, 0.28, 4200, "highpass");
        this.tone(210, 0.12, "square", 0.14, 70);
        this.noiseBurst(0.4, 0.2, 950);
        this.tone(100, 0.45, "sawtooth", 0.09, 28);
        this.tone(560, 0.6, "sawtooth", 0.04, 150);
        this.noiseBurst(0.22, 0.12, 480, "lowpass", 0.07);
        this.smokeHiss(2.0, 0.055, 0.06, 550);
        break;
      case "at4":
        // Hard chest thump + white smoke wall (less scream, more pressure)
        this.noiseBurst(0.09, 0.16, 1600, "highpass");
        this.noiseBurst(0.5, 0.24, 380);
        this.tone(48, 0.55, "square", 0.16, 20);
        this.tone(95, 0.35, "triangle", 0.09, 36);
        this.tone(240, 0.22, "sawtooth", 0.03, 80);
        this.smokeHiss(2.4, 0.065, 0.04, 1100);
        break;
      case "javelin":
        // Soft eject, pause, then main motor scream
        this.noiseBurst(0.16, 0.08, 1000);
        this.tone(240, 0.22, "sine", 0.045, 170);
        this.noiseBurst(0.2, 0.18, 2800, "highpass", 0.24);
        this.noiseBurst(0.4, 0.15, 700, "lowpass", 0.24);
        this.tone(165, 0.4, "sawtooth", 0.09, 48, 0.24);
        this.tone(78, 0.55, "triangle", 0.08, 28, 0.24);
        this.tone(640, 0.7, "sawtooth", 0.03, 220, 0.28);
        this.smokeHiss(2.5, 0.04, 0.3, 1400);
        break;
    }
  }

  /** Impact / detonation on the plate — unique per tube. */
  impact(kind: ProjectileKind = "bazooka"): void {
    switch (kind) {
      case "bazooka":
        this.noiseBurst(0.38, 0.22, 750);
        this.tone(52, 0.5, "square", 0.15, 18);
        this.tone(130, 0.28, "sawtooth", 0.08, 40);
        this.smokeHiss(2.2, 0.05, 0.05, 800);
        break;
      case "rpg7":
        // Punchy double crack
        this.noiseBurst(0.22, 0.26, 1100);
        this.tone(70, 0.35, "square", 0.16, 22);
        this.noiseBurst(0.28, 0.16, 900, "lowpass", 0.09);
        this.tone(110, 0.32, "sawtooth", 0.09, 38, 0.09);
        this.smokeHiss(2.5, 0.055, 0.05, 500);
        break;
      case "at4":
        // Wide pressure wave, less sparkle
        this.noiseBurst(0.55, 0.26, 420);
        this.tone(40, 0.65, "square", 0.18, 16);
        this.tone(85, 0.4, "triangle", 0.1, 30);
        this.smokeHiss(2.8, 0.07, 0.04, 1000);
        break;
      case "javelin":
        // Dual-stage top-attack detonation
        this.noiseBurst(0.2, 0.18, 1400, "highpass");
        this.tone(90, 0.25, "sawtooth", 0.1, 40);
        this.noiseBurst(0.4, 0.24, 700, "lowpass", 0.12);
        this.tone(48, 0.55, "square", 0.16, 18, 0.12);
        this.tone(200, 0.3, "sine", 0.06, 60, 0.14);
        this.smokeHiss(3.0, 0.05, 0.1, 1300);
        break;
    }
  }

  fire(): void {
    this.fireLauncher("bazooka");
  }

  hit(): void {
    this.impact("bazooka");
  }

  c4(): void {
    this.noiseBurst(0.45, 0.2, 600);
    this.tone(55, 0.4, "square", 0.12, 22);
    this.tone(220, 0.12, "sawtooth", 0.06, 80);
    window.setTimeout(() => {
      this.tone(660, 0.08, "sine", 0.05);
      this.tone(990, 0.1, "sine", 0.04);
      this.tone(1320, 0.14, "sine", 0.035);
    }, 120);
    window.setTimeout(() => {
      this.noiseBurst(0.2, 0.1, 2000);
      this.tone(880, 0.1, "triangle", 0.04);
    }, 280);
  }

  unlockAmmo(): void {
    this.tone(440, 0.1, "sine", 0.06);
    this.tone(660, 0.14, "sine", 0.05);
    this.tone(880, 0.18, "sine", 0.04);
  }

  win(): void {
    this.tone(523, 0.12, "sine", 0.06);
    this.tone(659, 0.14, "sine", 0.06);
    this.tone(784, 0.22, "sine", 0.07);
  }
}
