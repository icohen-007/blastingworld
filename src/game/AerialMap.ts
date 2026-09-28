import { getMapsApiKey, loadGoogleMaps } from "./StreetView";
import { toJpeg } from "html-to-image";

export type AerialCapturePose = {
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  fov: number;
  zoom: number;
};

const DEFAULT = {
  lat: 40.8017192,
  lng: -73.7358714,
  title: "Dunkin' · 566 Middle Neck Rd",
};

/**
 * Full-screen satellite / hybrid aerial map of the selected address.
 * Lock + capture works the same as Street View for local staging.
 */
export class AerialMapBackdrop {
  private container: HTMLElement;
  private map: google.maps.Map | null = null;
  private marker: google.maps.Marker | null = null;
  private ready = false;
  private lastCenter = { lat: DEFAULT.lat, lng: DEFAULT.lng };
  private frameBuffer: string | null = null;
  private bufferTimer: number | null = null;
  private buffering = false;
  private scoutInteractive = true;
  private zoomInCooldown = false;
  /** Fired when user zooms in past max aerial zoom → drop into Street View. */
  onZoomInToStreet: (() => void) | null = null;
  /** Fired when user left-clicks a new target on the aerial map. */
  onTargetMoved: ((lat: number, lng: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.onWheel = this.onWheel.bind(this);
  }

  get isReady(): boolean {
    return this.ready;
  }

  async init(apiKey?: string): Promise<boolean> {
    const key = apiKey ?? getMapsApiKey();
    if (!key) return false;
    if (this.map) return true;

    await loadGoogleMaps(key);
    this.container.innerHTML = "";
    this.map = new google.maps.Map(this.container, {
      center: { lat: this.lastCenter.lat, lng: this.lastCenter.lng },
      zoom: 19,
      mapTypeId: "hybrid",
      tilt: 45,
      heading: 0,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      keyboardShortcuts: false,
      maxZoom: 21,
    });

    this.marker = new google.maps.Marker({
      position: { lat: this.lastCenter.lat, lng: this.lastCenter.lng },
      map: this.map,
      title: DEFAULT.title,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#ff3d5a",
        fillOpacity: 0.95,
        strokeColor: "#ffe066",
        strokeWeight: 2,
      },
    });

    this.map.addListener("idle", () => {
      const c = this.map?.getCenter();
      if (c) this.lastCenter = { lat: c.lat(), lng: c.lng() };
    });

    // One-click retarget: move pin + center so lock captures that spot
    this.map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!this.scoutInteractive || !e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      this.moveTarget(lat, lng);
      this.onTargetMoved?.(lat, lng);
    });

    this.container.addEventListener("wheel", this.onWheel, { passive: false });

    this.ready = true;
    this.container.classList.add("aerialview-ready");
    window.setTimeout(() => this.resize(), 80);
    return true;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.scoutInteractive || !this.map || this.zoomInCooldown) return;
    // Scroll up = zoom in → at max zoom, drop into Street View
    if (e.deltaY >= 0) return;
    const z = this.map.getZoom() ?? 19;
    if (z < 20.4) return;
    e.preventDefault();
    e.stopPropagation();
    this.zoomInCooldown = true;
    window.setTimeout(() => {
      this.zoomInCooldown = false;
    }, 900);
    this.onZoomInToStreet?.();
  }

  setLocation(
    lat: number,
    lng: number,
    title = DEFAULT.title,
    opts?: { heading?: number; tilt?: number; zoom?: number; mode3d?: boolean },
  ): void {
    this.lastCenter = { lat, lng };
    if (!this.map) return;
    const zoom = opts?.zoom ?? (opts?.mode3d ? 18 : 19);
    const heading = opts?.heading ?? 0;
    const tilt = opts?.tilt ?? (opts?.mode3d ? 45 : 45);
    this.map.setCenter({ lat, lng });
    this.map.setZoom(zoom);
    this.map.setMapTypeId("hybrid");
    try {
      this.map.setHeading(heading);
      this.map.setTilt(tilt);
    } catch {
      /* some locales reject tilt */
    }
    this.marker?.setPosition({ lat, lng });
    this.marker?.setTitle(title);
  }

  /** Move the blast target pin and pan the map so capture uses that point. */
  moveTarget(lat: number, lng: number): void {
    this.lastCenter = { lat, lng };
    this.marker?.setPosition({ lat, lng });
    if (!this.map) return;
    this.map.panTo({ lat, lng });
  }

  /** Pull-up from Street View into tilted 3D aerial over the same pin. */
  enterFromStreet(pose: {
    lat: number;
    lng: number;
    heading: number;
    title?: string;
  }): void {
    this.setLocation(pose.lat, pose.lng, pose.title ?? DEFAULT.title, {
      heading: pose.heading,
      tilt: 45,
      zoom: 18,
      mode3d: true,
    });
  }

  getCapturePose(): AerialCapturePose {
    const c = this.map?.getCenter();
    const zoom = this.map?.getZoom() ?? 19;
    const heading = this.map?.getHeading?.() ?? 0;
    const tilt = this.map?.getTilt?.() ?? 0;
    const fov = Math.max(8, Math.min(90, 360 / Math.pow(2, Math.max(0, zoom - 10))));
    return {
      lat: c?.lat() ?? this.lastCenter.lat,
      lng: c?.lng() ?? this.lastCenter.lng,
      heading,
      pitch: tilt > 0 ? -45 : -90,
      fov,
      zoom,
    };
  }

  setScoutMode(interactive: boolean): void {
    if (!this.map) return;
    this.scoutInteractive = interactive;
    this.map.setOptions({
      gestureHandling: interactive ? "greedy" : "none",
      draggable: interactive,
      scrollwheel: interactive,
      zoomControl: interactive,
      rotateControl: interactive,
    });
    this.container.style.pointerEvents = interactive ? "auto" : "none";
    this.container.classList.toggle("aerialview-locked", !interactive);
    this.resize();
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

  beginExit(): void {
    this.container.classList.add("view-exit");
    this.container.classList.remove("view-enter", "view-active");
  }

  beginEnter(): void {
    this.container.classList.remove("hidden", "view-exit");
    this.container.classList.add("view-layer", "view-enter");
    this.resize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.container.classList.add("view-active");
        this.container.classList.remove("view-enter");
      });
    });
  }

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
    this.bufferTimer = window.setInterval(() => void tick(), 500);
  }

  stopFrameBuffer(): void {
    if (this.bufferTimer != null) {
      window.clearInterval(this.bufferTimer);
      this.bufferTimer = null;
    }
  }

  async getExactLockedFrame(): Promise<string | null> {
    if (this.frameBuffer && !(await this.isMostlyBlackImage(this.frameBuffer))) {
      return this.frameBuffer;
    }
    return this.captureFrameIfVisible();
  }

  async captureFrameIfVisible(): Promise<string | null> {
    const canvases = [...this.container.querySelectorAll("canvas")] as HTMLCanvasElement[];
    const canvas = canvases
      .filter((c) => c.width > 64 && c.height > 64)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];

    if (canvas) {
      const fromStream = await this.captureViaStream(canvas);
      if (fromStream && !(await this.isMostlyBlackImage(fromStream))) return fromStream;
    }

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

  resize(): void {
    if (this.map && window.google?.maps) {
      google.maps.event.trigger(this.map, "resize");
      this.map.setCenter({ lat: this.lastCenter.lat, lng: this.lastCenter.lng });
    }
  }

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
        resolve(sum / (64 * 64 * 3) < 22);
      };
      img.onerror = () => resolve(true);
      img.src = dataUrl;
    });
  }
}
