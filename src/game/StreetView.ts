import type { StreetLocation } from "../data/locations";
import { toJpeg } from "html-to-image";

export type StreetPov = {
  heading: number;
  pitch: number;
  zoom: number;
};

declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsLoadPromise: Promise<typeof google> | null = null;

export type MapsLoadErrorCode =
  | "script_failed"
  | "auth_failure"
  | "no_api"
  | "unknown";

export class MapsLoadError extends Error {
  readonly code: MapsLoadErrorCode;

  constructor(code: MapsLoadErrorCode, message: string) {
    super(message);
    this.name = "MapsLoadError";
    this.code = code;
  }
}

export function getMapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? "";
}

export function mapsErrorHelp(err: unknown): string {
  const code = err instanceof MapsLoadError ? err.code : "unknown";
  if (code === "auth_failure") {
    return "Google rejected the API key. In Google Cloud: (1) enable Billing, (2) enable Maps JavaScript API, (3) allow localhost for this key.";
  }
  if (code === "script_failed") {
    return "Could not download the Maps script. Check your network or API key.";
  }
  return "Could not load Google Maps. Enable Billing + Maps JavaScript API, then restart npm run dev.";
}

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window !== "undefined" && window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    const fail = (code: MapsLoadErrorCode, message: string) => {
      mapsLoadPromise = null;
      reject(new MapsLoadError(code, message));
    };

    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      fail(
        "auth_failure",
        "Google Maps authentication failed (billing, API not enabled, or key restriction).",
      );
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-bw-maps]");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps?.Map) resolve(window.google);
        else fail("no_api", "Google Maps loaded without API");
      });
      existing.addEventListener("error", () => fail("script_failed", "Failed to load Google Maps"));
      return;
    }

    const script = document.createElement("script");
    script.dataset.bwMaps = "1";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    script.onload = () => {
      window.setTimeout(() => {
        if (window.google?.maps?.Map) {
          resolve(window.google);
        } else {
          fail("no_api", "Google Maps loaded without Map API");
        }
      }, 400);
    };
    script.onerror = () => fail("script_failed", "Failed to load Google Maps script");
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

export class StreetViewBackdrop {
  private container: HTMLElement;
  private panorama: google.maps.StreetViewPanorama | null = null;
  private ready = false;
  private lastLocation: StreetLocation | null = null;
  private scoutInteractive = true;
  private atMinZoom = false;
  private zoomOutIntent = 0;
  private zoomOutCooldown = false;
  /** Fired when user zooms out past widest Street View FOV → pull up to aerial. */
  onZoomOutToAerial: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.onWheelCapture = this.onWheelCapture.bind(this);
  }

  get isReady(): boolean {
    return this.ready;
  }

  get location(): StreetLocation | null {
    return this.lastLocation;
  }

  async init(apiKey: string): Promise<void> {
    await loadGoogleMaps(apiKey);
    if (this.panorama) return;

    // Always start at Dunkin target — never Times Square / NYC default
    this.panorama = new google.maps.StreetViewPanorama(this.container, {
      position: { lat: TARGET_HOME.lat, lng: TARGET_HOME.lng },
      pov: {
        heading: TARGET_HOME.heading,
        pitch: TARGET_HOME.pitch,
      },
      zoom: 1,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      showRoadLabels: false,
      enableCloseButton: false,
      linksControl: false,
      panControl: true,
      zoomControl: true,
      clickToGo: true,
      scrollwheel: true,
      disableDefaultUI: true,
      imageDateControl: false,
    });

    this.panorama.addListener("zoom_changed", () => this.syncMinZoomGate());
    // Capture phase so we see wheel before Google Maps consumes it
    this.container.addEventListener("wheel", this.onWheelCapture, {
      passive: false,
      capture: true,
    });

    window.setTimeout(() => {
      google.maps.event.trigger(this.panorama!, "resize");
      this.syncMinZoomGate();
    }, 100);

    this.ready = true;
    this.container.classList.add("streetview-ready");
  }

  /** When fully zoomed out, steal further scroll-out for aerial transition. */
  private syncMinZoomGate(): void {
    if (!this.panorama || !this.scoutInteractive) return;
    const z = this.panorama.getZoom() ?? 1;
    this.atMinZoom = z <= 0.55;
    // Let Google handle zoom-in/out until floor; at floor we own scroll-out
    this.panorama.setOptions({
      scrollwheel: this.scoutInteractive && !this.atMinZoom,
      zoomControl: this.scoutInteractive,
    });
    this.container.classList.toggle("streetview-at-min-zoom", this.atMinZoom);
    if (!this.atMinZoom) this.zoomOutIntent = 0;
  }

  private onWheelCapture(e: WheelEvent): void {
    if (!this.scoutInteractive || !this.panorama || this.zoomOutCooldown) return;

    const z = this.panorama.getZoom() ?? 1;
    const zoomingOut = e.deltaY > 0;

    if (!zoomingOut) {
      this.zoomOutIntent = 0;
      return;
    }

    // Approaching / at floor — accumulate scroll-out and pull to aerial
    if (z > 0.7 && !this.atMinZoom) return;

    this.zoomOutIntent += Math.abs(e.deltaY);
    if (this.zoomOutIntent < 90) {
      // Still let Google try to reach true min zoom on first ticks
      if (z > 0.35) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    this.zoomOutIntent = 0;
    this.zoomOutCooldown = true;
    window.setTimeout(() => {
      this.zoomOutCooldown = false;
    }, 700);
    this.pullToAerial();
  }

  /** Explicit pull-up (button or scroll). */
  pullToAerial(): void {
    this.onZoomOutToAerial?.();
  }

  async setLocation(loc: StreetLocation): Promise<boolean> {
    if (!this.panorama) return false;
    this.lastLocation = loc;

    const tryRadius = async (radius: number): Promise<google.maps.LatLng | null> =>
      new Promise((resolve) => {
        const service = new google.maps.StreetViewService();
        service.getPanorama({ location: { lat: loc.lat, lng: loc.lng }, radius, source: google.maps.StreetViewSource.OUTDOOR }, (data, status) => {
          if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
            resolve(data.location.latLng);
          } else {
            resolve(null);
          }
        });
      });

    // Prefer exact pin; widen search if needed so we never keep a wrong city pano
    let latLng =
      (await tryRadius(50)) ??
      (await tryRadius(120)) ??
      (await tryRadius(250));

    if (!latLng) {
      // Hard-set coordinates anyway so we are not stuck on a previous city
      this.panorama.setPosition({ lat: loc.lat, lng: loc.lng });
      this.panorama.setPov({ heading: loc.heading, pitch: loc.pitch });
      this.panorama.setZoom(1);
      this.panorama.setVisible(true);
      this.syncMinZoomGate();
      return false;
    }

    this.panorama.setPosition(latLng);
    this.panorama.setPov({
      heading: loc.heading,
      pitch: loc.pitch,
    });
    this.panorama.setZoom(1);
    this.panorama.setVisible(true);
    this.syncMinZoomGate();
    google.maps.event.trigger(this.panorama, "resize");
    return true;
  }

  getPov(): StreetPov {
    const pov = this.panorama?.getPov();
    const zoom = this.panorama?.getZoom() ?? 1;
    return {
      heading: pov?.heading ?? 0,
      pitch: pov?.pitch ?? 0,
      zoom,
    };
  }

  /** Exact pose for freezing “this” Street View as the blast plate. */
  getCapturePose(): {
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    fov: number;
  } {
    const pos = this.panorama?.getPosition();
    const pov = this.getPov();
    const fov = Math.max(10, Math.min(120, 180 / Math.pow(2, pov.zoom)));
    return {
      lat: pos?.lat() ?? this.lastLocation?.lat ?? TARGET_HOME.lat,
      lng: pos?.lng() ?? this.lastLocation?.lng ?? TARGET_HOME.lng,
      heading: pov.heading,
      pitch: pov.pitch,
      fov,
    };
  }

  /** Interactive look-around (boot / scout). */
  setScoutMode(interactive: boolean): void {
    if (!this.panorama) return;
    this.scoutInteractive = interactive;
    this.panorama.setOptions({
      linksControl: false,
      panControl: interactive,
      zoomControl: interactive,
      clickToGo: interactive,
      scrollwheel: interactive,
      disableDefaultUI: true,
      imageDateControl: false,
      addressControl: false,
      fullscreenControl: false,
    });
    this.container.style.pointerEvents = interactive ? "auto" : "none";
    this.container.classList.toggle("streetview-locked", !interactive);
    this.syncMinZoomGate();
    google.maps.event.trigger(this.panorama, "resize");
  }

  show(): void {
    this.container.classList.remove("hidden", "view-exit", "view-enter");
    this.container.classList.add("view-layer", "view-active");
    this.resize();
  }

  hide(): void {
    this.container.classList.add("hidden");
    this.container.classList.remove("view-exit", "view-enter", "view-active");
  }

  /** Soft-hide after fade (keeps layout until caller adds .hidden). */
  beginExit(): void {
    this.container.classList.add("view-exit");
    this.container.classList.remove("view-enter", "view-active");
  }

  beginEnter(): void {
    this.container.classList.remove("hidden", "view-exit");
    this.container.classList.add("view-layer", "view-enter");
    this.resize();
    // next frame → active so CSS transition runs
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.container.classList.add("view-active");
        this.container.classList.remove("view-enter");
      });
    });
  }

  /**
   * Grab the live Street View frame that is actually on screen.
   * Prefer MediaStream capture (reads the composited display, not the cleared
   * WebGL backbuffer). Falls back to html-to-image / toDataURL.
   */
  async captureFrameIfVisible(): Promise<string | null> {
    const canvases = [
      ...this.container.querySelectorAll("canvas"),
    ] as HTMLCanvasElement[];
    const canvas = canvases
      .filter((c) => c.width > 64 && c.height > 64)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];

    if (canvas) {
      const fromStream = await this.captureViaStream(canvas);
      if (fromStream && !(await this.isMostlyBlackImage(fromStream))) return fromStream;
    }

    // DOM snapshot of the Street View container (includes composited WebGL in many browsers)
    try {
      const dataUrl = await toJpeg(this.container, {
        quality: 0.92,
        cacheBust: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        skipFonts: true,
      });
      if (dataUrl && !(await this.isMostlyBlackImage(dataUrl))) return dataUrl;
    } catch {
      /* continue */
    }

    if (canvas) {
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        if (dataUrl && dataUrl.length >= 2000 && !(await this.isMostlyBlackImage(dataUrl))) {
          return dataUrl;
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /** Copy the displayed WebGL frame via captureStream (avoids cleared backbuffer). */
  private async captureViaStream(source: HTMLCanvasElement): Promise<string | null> {
    if (typeof source.captureStream !== "function") return null;
    let stream: MediaStream | null = null;
    try {
      stream = source.captureStream(30);
      const track = stream.getVideoTracks()[0];
      if (!track) return null;

      const video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      // Wait for at least one real frame
      await new Promise<void>((resolve) => {
        if ("requestVideoFrameCallback" in video) {
          (
            video as HTMLVideoElement & {
              requestVideoFrameCallback: (cb: () => void) => void;
            }
          ).requestVideoFrameCallback(() => resolve());
        } else {
          window.setTimeout(() => resolve(), 120);
        }
      });
      await new Promise((r) => window.setTimeout(r, 50));

      const w = video.videoWidth || source.width;
      const h = video.videoHeight || source.height;
      if (w < 64 || h < 64) return null;

      const dest = document.createElement("canvas");
      dest.width = w;
      dest.height = h;
      const ctx = dest.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      video.pause();
      video.srcObject = null;
      track.stop();
      stream.getTracks().forEach((t) => t.stop());
      return dest.toDataURL("image/jpeg", 0.92);
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      return null;
    }
  }

  private isMostlyBlackImage(dataUrl: string): Promise<boolean> {
    const approxBytes = Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
    if (approxBytes < 28000) return Promise.resolve(true);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(true);
          return;
        }
        ctx.drawImage(img, 0, 0, 64, 64);
        const { data } = ctx.getImageData(0, 0, 64, 64);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i] + data[i + 1] + data[i + 2];
        }
        const avg = sum / (64 * 64 * 3);
        resolve(avg < 22);
      };
      img.onerror = () => resolve(true);
      img.src = dataUrl;
    });
  }

  /**
   * Keep a recent on-screen SV frame so Lock can freeze exactly what you see.
   * Uses captureStream so we read the composited display, not a cleared buffer.
   */
  private frameBuffer: string | null = null;
  private bufferTimer: number | null = null;
  private buffering = false;

  startFrameBuffer(): void {
    this.stopFrameBuffer();
    const tick = async () => {
      if (this.buffering) return;
      this.buffering = true;
      try {
        const frame = await this.captureFrameIfVisible();
        if (frame) this.frameBuffer = frame;
      } finally {
        this.buffering = false;
      }
    };
    void tick();
    this.bufferTimer = window.setInterval(() => void tick(), 450);
  }

  stopFrameBuffer(): void {
    if (this.bufferTimer != null) {
      window.clearInterval(this.bufferTimer);
      this.bufferTimer = null;
    }
  }

  /** Exact last good on-screen frame, or a fresh capture. */
  async getExactLockedFrame(): Promise<string | null> {
    if (this.frameBuffer && !(await this.isMostlyBlackImage(this.frameBuffer))) {
      return this.frameBuffer;
    }
    return this.captureFrameIfVisible();
  }

  /** @deprecated */
  tryCaptureFrame(): string | null {
    return null;
  }

  resize(): void {
    if (this.panorama && window.google?.maps) {
      google.maps.event.trigger(this.panorama, "resize");
    }
  }

  /** Let Street View receive drag/look input under the HUD. */
  setCanvasPassthrough(canvas: HTMLCanvasElement, passthrough: boolean): void {
    canvas.classList.toggle("canvas-passthrough", passthrough);
  }
}

const TARGET_HOME: StreetLocation = {
  id: "dunkin-middle-neck",
  name: "Dunkin’ · 566 Middle Neck Rd",
  blurb: "Great Neck, NY",
  lat: 40.8017192,
  lng: -73.7358714,
  heading: 215,
  pitch: 0,
};
