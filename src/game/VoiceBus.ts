/**
 * Natural mid-30s US male voice — pre-rendered ChristopherNeural MP3s only.
 * Exact / case-insensitive line match → play clip. No OS synth fallback (keeps one voice).
 */

type Manifest = Record<string, string>;

export class VoiceBus {
  private enabled = true;
  private lastText = "";
  private lastAt = 0;
  private audio: HTMLAudioElement | null = null;
  private manifest: Manifest | null = null;
  private manifestPromise: Promise<Manifest> | null = null;
  private byNorm: Map<string, string> | null = null;

  constructor() {
    void this.loadManifest();
  }

  private normalize(line: string): string {
    return line
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.…]+$/g, ".")
      .replace(/\bai\b/g, "a i");
  }

  private loadManifest(): Promise<Manifest> {
    if (this.manifest) return Promise.resolve(this.manifest);
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = fetch("/voice/lines.json")
      .then(async (r) => {
        if (r.ok) return (await r.json()) as Manifest;
        // legacy shape: { voice, lines }
        const legacy = await fetch("/voice/manifest.json");
        if (!legacy.ok) return {};
        const data = await legacy.json();
        return (data.lines ?? data) as Manifest;
      })
      .then((data) => {
        this.manifest = data;
        this.byNorm = new Map();
        for (const [key, url] of Object.entries(data)) {
          this.byNorm.set(this.normalize(key), url);
        }
        return data;
      })
      .catch(() => {
        this.manifest = {};
        this.byNorm = new Map();
        return {};
      });
    return this.manifestPromise;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.cancel();
  }

  cancel(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  say(text: string, opts?: { interrupt?: boolean }): void {
    if (!this.enabled || !text.trim()) return;
    const line = text.trim();
    const now = performance.now();
    if (line === this.lastText && now - this.lastAt < 1400) return;
    this.lastText = line;
    this.lastAt = now;
    if (opts?.interrupt !== false) this.cancel();
    void this.speak(line);
  }

  private async speak(line: string): Promise<void> {
    await this.loadManifest();
    const url =
      this.manifest?.[line] ??
      this.byNorm?.get(this.normalize(line)) ??
      null;
    if (!url) {
      console.warn("[VoiceBus] missing clip for:", line);
      return;
    }
    try {
      await this.playUrl(url);
    } catch {
      console.warn("[VoiceBus] play failed:", line);
    }
  }

  private playUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.audio = audio;
      audio.preload = "auto";
      audio.playbackRate = 1; // natural speed — do not slow/chipmunk
      audio.src = url;
      const fail = () => reject(new Error("audio failed"));
      audio.addEventListener("error", fail, { once: true });
      audio.addEventListener("ended", () => resolve(), { once: true });
      void audio.play().then(() => undefined, fail);
    });
  }
}
