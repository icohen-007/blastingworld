import * as THREE from "three";
import { AerialMapBackdrop } from "./AerialMap";
import { AudioBus } from "./Audio";
import { Effects } from "./Effects";
import { Input } from "./Input";
import {
  checkKieApi,
  mediaFileUrl,
  requestBlastDamage,
  uploadCapturedPlate,
} from "./KieClient";
import { PlayerWeapon } from "./PlayerWeapon";
import { ScreenFx } from "./ScreenFx";
import { getMapsApiKey, loadGoogleMaps, StreetViewBackdrop } from "./StreetView";
import { VoiceBus } from "./VoiceBus";
import { AMMO_ORDER, PROJECTILES, WEAPON_VIEW } from "../data/weapons";
import type { ProjectileKind } from "../data/weapons";
import { parseLatLng, parseMapsUrl } from "../data/locations";

type Phase = "boot" | "armed" | "firing" | "sending" | "done";
type CameraMode = "street" | "aerial";
type PlateKind = "aerial" | "street";

type PlatePreview = {
  id: string;
  kind: PlateKind;
  frameDataUrl: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  label: string;
  placeName: string;
  createdAt: number;
  weapon?: ProjectileKind;
  weaponName?: string;
  staged?: boolean;
};

type TargetPlace = {
  placeName: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
};

const DEFAULT_PLACE: TargetPlace = {
  placeName: "Dunkin' 566 Middle Neck Rd, Great Neck, NY 11023",
  lat: 40.8017192,
  lng: -73.7358714,
  heading: 215,
  pitch: 0,
};

const SEND_LABEL = "Send Selected to AI Visual Effects";

/**
 * Flow: Set location → Lock Aerial → Lock Street → weapon + fire → multi-select → Kie.
 */
export class PhotoBlast {
  private canvas: HTMLCanvasElement;
  private appRoot = document.getElementById("app")!;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private input: Input;
  private weapon = new PlayerWeapon();
  private effects: Effects;
  private screenFx: ScreenFx;
  private audio = new AudioBus();
  private voice = new VoiceBus();
  private streetView: StreetViewBackdrop;
  private aerial: AerialMapBackdrop;
  private cameraMode: CameraMode = "aerial";
  private transitioning = false;
  private running = false;
  private phase: Phase = "boot";
  private aimPoint = new THREE.Vector3(0, 1.4, -6);
  private camBase = new THREE.Vector3(0, 1.55, 0.2);

  private plateImg = document.getElementById("target-plate-img") as HTMLImageElement;
  private boot = document.getElementById("boot-screen")!;
  private panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;
  private win = document.getElementById("win-screen")!;
  private status = document.getElementById("ai-damage-status")!;
  private mapsStatus = document.getElementById("maps-status")!;
  private targetMeta = document.getElementById("target-meta")!;
  private placeInput = document.getElementById("place-input") as HTMLInputElement;
  private applyPlaceBtn = document.getElementById("apply-place-btn") as HTMLButtonElement;
  private lockAerialBtn = document.getElementById("lock-aerial-btn") as HTMLButtonElement;
  private lockStreetBtn = document.getElementById("lock-street-btn") as HTMLButtonElement;
  private lockHint = document.getElementById("lock-hint")!;
  private crosshair = document.getElementById("crosshair")!;
  private opticBadge = document.getElementById("optic-lock-badge")!;
  private aimHint = document.getElementById("aim-hint")!;
  private toast = document.getElementById("unlock-toast")!;
  private aftermathBeforeImg = document.getElementById("aftermath-before-img") as HTMLImageElement;
  private aftermathAfterImg = document.getElementById("aftermath-after-img") as HTMLImageElement;
  private aftermathCaption = document.getElementById("aftermath-caption")!;
  private aftermathDots = document.getElementById("aftermath-dots")!;
  private aftermathPanel = document.getElementById("aftermath-panel")!;
  private aftermathPanelMeta = document.getElementById("aftermath-panel-meta")!;
  private aftermathSlideList = document.getElementById("aftermath-slide-list")!;
  private baCompare = document.getElementById("ba-compare")!;
  private baScrub = document.getElementById("ba-scrub") as HTMLInputElement;
  private baPrev = document.getElementById("ba-prev") as HTMLButtonElement;
  private baNext = document.getElementById("ba-next") as HTMLButtonElement;
  private launcherPicker = document.getElementById("launcher-picker")!;
  private weaponView = document.getElementById("weapon-view")!;
  private weaponViewImg = document.getElementById("weapon-view-img") as HTMLImageElement;
  private draftList = document.getElementById("draft-list")!;
  private draftCount = document.getElementById("draft-count")!;
  private sendKieBtn = document.getElementById("send-kie-btn") as HTMLButtonElement;
  private viewModeBar = document.getElementById("view-mode-bar")!;
  private viewAerialBtn = document.getElementById("view-aerial-btn") as HTMLButtonElement;
  private viewStreetBtn = document.getElementById("view-street-btn") as HTMLButtonElement;

  private place: TargetPlace = { ...DEFAULT_PLACE };
  private placeReady = false;
  private aerialLocked = false;
  private streetLocked = false;
  private capturing = false;
  private selectedLauncher: ProjectileKind | null = null;
  private plates: PlatePreview[] = [];
  private selectedPlateIds = new Set<string>();
  private kieResults: { label: string; beforeUrl: string; afterUrl: string }[] = [];
  private aftermathIndex = 0;
  private pointerX = window.innerWidth * 0.5;
  private pointerY = window.innerHeight * 0.45;
  private lastAerialRightAt = 0;
  private aerialRightTimer: number | null = null;
  private readonly aerialRightDblMs = 380;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const svEl = document.getElementById("streetview");
    const aerialEl = document.getElementById("aerialview");
    const fxEl = document.getElementById("fx-layer");
    if (!svEl || !aerialEl || !fxEl) throw new Error("Missing map/fx DOM");

    this.streetView = new StreetViewBackdrop(svEl);
    this.aerial = new AerialMapBackdrop(aerialEl);
    this.screenFx = new ScreenFx(fxEl);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      50,
    );
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 1.35, -8);

    this.effects = new Effects(this.camera);
    this.effects.setBaseCamera(this.camBase);
    this.input = new Input(canvas);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffe6c8, 1.6);
    key.position.set(2, 5, 3);
    this.scene.add(key);
    const fill = new THREE.PointLight(0xff8a3d, 0.8, 12);
    fill.position.set(-1, 1.2, 1);
    this.scene.add(fill);
    this.scene.add(this.effects.group);
    this.weapon.attachToCamera(this.camera);
    this.scene.add(this.camera);
    this.weapon.group.visible = false;
    this.weapon.onMuzzleFlash = (pos, dir) => {
      const kind = this.selectedLauncher ?? "bazooka";
      this.effects.launcherMuzzle(pos, dir, PROJECTILES[kind].smokeDensity);
    };
    this.weapon.onTrail = (pos, kind) => {
      this.effects.burst(pos, PROJECTILES[kind].trailColor, 4, false);
    };

    this.applyPlaceBtn.addEventListener("click", () => void this.applyPlaceFromInput());
    this.placeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.applyPlaceFromInput();
    });
    this.lockAerialBtn.addEventListener("click", () => {
      if (this.aerialLocked) void this.unlockAerial();
      else void this.lockAerial({ diveToStreet: false });
    });
    this.lockStreetBtn.addEventListener("click", () => {
      if (this.streetLocked) void this.unlockStreet();
      else void this.lockStreet();
    });
    this.sendKieBtn.addEventListener("click", () => void this.sendSelectedToKie());
    document.getElementById("retry-btn")!.addEventListener("click", () => this.backToStaging());
    document.getElementById("change-place-btn")!.addEventListener("click", () => this.resetToBoot());
    this.panelToggle.addEventListener("click", () => this.toggleSidePanel());
    this.viewAerialBtn.addEventListener("click", () => void this.setCameraMode("aerial"));
    this.viewStreetBtn.addEventListener("click", () => void this.setCameraMode("street"));
    this.baPrev.addEventListener("click", () => this.showAftermathSlide(this.aftermathIndex - 1));
    this.baNext.addEventListener("click", () => this.showAftermathSlide(this.aftermathIndex + 1));
    this.baScrub.addEventListener("input", () => this.setBaReveal(Number(this.baScrub.value)));
    this.aftermathSlideList.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-slide-index]");
      if (!btn) return;
      const idx = Number(btn.dataset.slideIndex);
      if (Number.isFinite(idx)) this.showAftermathSlide(idx);
    });
    this.aftermathDots.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-slide-index]");
      if (!btn) return;
      const idx = Number(btn.dataset.slideIndex);
      if (Number.isFinite(idx)) this.showAftermathSlide(idx);
    });

    this.launcherPicker.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-launcher]");
      if (!btn || btn.disabled || !btn.dataset.launcher) return;
      const id = btn.dataset.launcher as ProjectileKind;
      if (!AMMO_ORDER.includes(id)) return;
      this.selectLauncher(id);
    });
    this.draftList.addEventListener("click", (ev) => {
      const card = (ev.target as HTMLElement).closest<HTMLElement>("[data-plate-id]");
      if (!card?.dataset.plateId) return;
      this.togglePlateSelect(card.dataset.plateId);
    });

    // Disable auto zoom-out stalls — explicit Aerial / Street buttons only
    this.streetView.onZoomOutToAerial = null;
    this.aerial.onZoomInToStreet = null;
    this.aerial.onTargetMoved = (lat, lng) => {
      this.place.lat = lat;
      this.place.lng = lng;
      this.setStatus("Target moved — right-click to lock aerial.");
    };

    this.setOpticState("scout");
    this.syncUi();
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("pointermove", this.onTargetPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onTargetPointerMove, { passive: true });
    window.addEventListener("contextmenu", this.onRightClickLock);
    window.addEventListener("dblclick", this.onScoutDoubleClick);
    void this.bootMaps();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Aerial right-click:
   *  - single → lock (if needed) and dive to Street View
   *  - double → lock (if needed) and Choose Your Weapon in aerial
   * Street right-click still locks / unlocks street.
   */
  private onRightClickLock = (e: MouseEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("#boot-screen, #panel-toggle, input, textarea, button, a, .draft-list")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (this.capturing || this.transitioning) return;
    if (this.phase === "firing" || this.phase === "sending" || this.phase === "done") return;
    if (!this.placeReady) {
      this.setStatus("Set a location first.", true);
      return;
    }

    if (this.cameraMode === "aerial") {
      // Don't steal right-clicks while already armed — unlock via panel
      if (this.phase === "armed") return;
      const now = performance.now();
      if (now - this.lastAerialRightAt < this.aerialRightDblMs) {
        this.lastAerialRightAt = 0;
        if (this.aerialRightTimer != null) {
          window.clearTimeout(this.aerialRightTimer);
          this.aerialRightTimer = null;
        }
        void this.onAerialDoubleRightClick();
        return;
      }
      this.lastAerialRightAt = now;
      if (this.aerialRightTimer != null) window.clearTimeout(this.aerialRightTimer);
      this.aerialRightTimer = window.setTimeout(() => {
        this.aerialRightTimer = null;
        void this.onAerialSingleRightClick();
      }, this.aerialRightDblMs);
      return;
    }

    if (this.streetLocked) void this.unlockStreet();
    else void this.lockStreet();
  };

  /** One right-click on aerial → Street View (locks aerial first if needed). */
  private async onAerialSingleRightClick(): Promise<void> {
    if (this.capturing || this.transitioning) return;
    if (!this.aerialLocked) {
      await this.lockAerial({ diveToStreet: true });
      return;
    }
    await this.setCameraMode("street");
    this.setStatus("Street view — aim facade, right-click to lock street.");
    this.speak("Street view.");
  }

  /** Double right-click on aerial → Choose Your Weapon and fire here. */
  private async onAerialDoubleRightClick(): Promise<void> {
    if (this.capturing || this.transitioning) return;
    if (!this.aerialLocked) {
      await this.lockAerial({ diveToStreet: false });
      if (!this.aerialLocked) return;
    } else if (this.cameraMode !== "aerial") {
      await this.setCameraMode("aerial");
    }
    this.enterAerialWeaponMode();
  }

  /**
   * Left double-click also arms aerial combat (same as double right-click).
   * When already armed, Input handles double-click fire on the canvas.
   */
  private onScoutDoubleClick = (e: MouseEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("#boot-screen, #panel-toggle, input, textarea, button, a, .draft-list")) {
      return;
    }
    if (this.capturing || this.transitioning) return;
    if (this.phase === "armed" || this.phase === "firing" || this.phase === "sending" || this.phase === "done") {
      return;
    }
    if (this.cameraMode !== "aerial") return;
    e.preventDefault();
    e.stopPropagation();
    void this.onAerialDoubleRightClick();
  };

  /** Arm weapons for fire in the locked aerial view. */
  private enterAerialWeaponMode(): void {
    this.appRoot.classList.remove("panel-collapsed");
    this.panelToggle.setAttribute("aria-expanded", "true");
    this.setStatus("Select a weapon — then double-click the target to fire in aerial.");
    this.showToast("Aerial combat · pick launcher");
    this.speak("Aerial locked. Choose your weapon.");
    this.launcherPicker.scrollIntoView({ behavior: "smooth", block: "nearest" });
    this.launcherPicker.classList.add("launcher-pulse");
    window.setTimeout(() => this.launcherPicker.classList.remove("launcher-pulse"), 1200);
    const pick = this.selectedLauncher ?? AMMO_ORDER[0];
    this.selectLauncher(pick);
  }

  /** Reticle IS the pointer — always tracks mouse as a targeting sight. */
  private onTargetPointerMove = (e: PointerEvent): void => {
    if (this.phase === "done" || this.phase === "sending") return;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    // Don't park the target over the side panel chrome
    const panel = this.boot.getBoundingClientRect();
    const overPanel =
      !this.boot.classList.contains("hidden") &&
      !this.appRoot.classList.contains("panel-collapsed") &&
      e.clientX >= panel.left &&
      e.clientX <= panel.right &&
      e.clientY >= panel.top &&
      e.clientY <= panel.bottom;
    if (overPanel) return;

    this.crosshair.classList.remove("hidden");
    this.crosshair.setAttribute("aria-hidden", "false");
    this.crosshair.style.left = `${e.clientX}px`;
    this.crosshair.style.top = `${e.clientY}px`;
    if (this.phase === "armed" || this.phase === "firing") {
      this.aimWeaponAt(e.clientX, e.clientY);
    }
  };

  /** Rotate weapon plate so the barrel (pivot → muzzle) points at the reticle. */
  private aimWeaponAt(clientX: number, clientY: number): void {
    if (!this.selectedLauncher) return;
    const view = PROJECTILES[this.selectedLauncher].view;
    const box = this.weaponView.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return;

    const pivotXPct = `${view.pivotX * 100}%`;
    const pivotYPct = `${view.pivotY * 100}%`;
    this.weaponView.style.setProperty("--pivot-x", pivotXPct);
    this.weaponView.style.setProperty("--pivot-y", pivotYPct);
    this.weaponViewImg.style.setProperty("--pivot-x", pivotXPct);
    this.weaponViewImg.style.setProperty("--pivot-y", pivotYPct);

    const pivotX = box.left + box.width * view.pivotX;
    const pivotY = box.top + box.height * view.pivotY;
    const muzzleX = box.left + box.width * view.muzzleX;
    const muzzleY = box.top + box.height * view.muzzleY;

    // Rest barrel heading from grip → tip (measured on the unrotated plate)
    const restDeg = (Math.atan2(muzzleY - pivotY, muzzleX - pivotX) * 180) / Math.PI;
    // Desired heading from grip → reticle
    const wantDeg = (Math.atan2(clientY - pivotY, clientX - pivotX) * 180) / Math.PI;

    let delta = wantDeg - restDeg + (view.aimBiasDeg ?? 0);
    // Normalize to [-180, 180]
    delta = ((delta + 540) % 360) - 180;
    // Allow enough lift to aim at mid-screen without flipping the plate
    delta = Math.max(-70, Math.min(55, delta));
    this.weaponViewImg.style.setProperty("--aim-rot", `${delta.toFixed(2)}deg`);
  }

  private getMuzzleScreenPct(): { x: number; y: number } {
    if (!this.selectedLauncher) return { x: 78, y: 78 };
    const view = PROJECTILES[this.selectedLauncher].view;
    const box = this.weaponView.getBoundingClientRect();
    if (box.width < 8) return { x: 78, y: 78 };
    // Approximate muzzle after current aim rotation around pivot
    const pivotX = box.left + box.width * view.pivotX;
    const pivotY = box.top + box.height * view.pivotY;
    const localMx = box.left + box.width * view.muzzleX - pivotX;
    const localMy = box.top + box.height * view.muzzleY - pivotY;
    const rot =
      (parseFloat(this.weaponViewImg.style.getPropertyValue("--aim-rot") || "0") * Math.PI) /
      180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const mx = pivotX + localMx * cos - localMy * sin;
    const my = pivotY + localMx * sin + localMy * cos;
    return {
      x: (mx / window.innerWidth) * 100,
      y: (my / window.innerHeight) * 100,
    };
  }

  private syncUi(): void {
    this.lockAerialBtn.disabled = !this.placeReady || this.capturing || this.phase === "sending";
    this.lockAerialBtn.textContent = this.aerialLocked
      ? "Unlock Aerial"
      : "Lock Aerial";

    this.lockStreetBtn.disabled =
      !this.aerialLocked || !this.placeReady || this.capturing || this.phase === "sending";
    this.lockStreetBtn.textContent = this.streetLocked
      ? "Unlock Street (right-click)"
      : "Lock Street (or right-click)";

    this.viewStreetBtn.disabled = !this.aerialLocked;
    this.viewAerialBtn.classList.toggle("is-active", this.cameraMode === "aerial");
    this.viewStreetBtn.classList.toggle("is-active", this.cameraMode === "street");
    this.viewAerialBtn.setAttribute("aria-pressed", this.cameraMode === "aerial" ? "true" : "false");
    this.viewStreetBtn.setAttribute("aria-pressed", this.cameraMode === "street" ? "true" : "false");

    this.setLaunchersEnabled(this.aerialLocked && this.phase !== "sending" && this.phase !== "done");
    this.renderPlates();
    this.updateFlowSteps();

    if (!this.placeReady) {
      this.targetMeta.textContent = "Set a place, then lock Aerial first.";
      this.lockHint.textContent =
        "Right-click once → Street View. Double right-click → Choose Your Weapon in aerial.";
    } else if (!this.aerialLocked) {
      this.targetMeta.textContent = `${this.place.placeName} · click to aim · right-click`;
      this.lockHint.textContent =
        "Right-click once: lock & dive to Street. Double right-click: Choose Your Weapon here.";
    } else if (!this.streetLocked) {
      this.targetMeta.textContent =
        this.cameraMode === "aerial"
          ? "Aerial locked · right-click → Street · double right-click → weapons"
          : "Aerial locked · Street View · right-click to lock facade";
      this.lockHint.textContent =
        this.cameraMode === "aerial"
          ? "Right-click once → Street View. Double right-click → Choose Your Weapon & fire here."
          : "Right-click to Lock Street. Right-click again to unlock and re-aim.";
    } else {
      this.targetMeta.textContent = "Aerial + Street locked · pick launcher · double-click to deploy";
      this.lockHint.textContent =
        "On Street: right-click unlocks. On Aerial: right-click → Street, double right-click → weapons.";
    }
  }

  private updateFlowSteps(): void {
    const set = (id: string, on: boolean, done: boolean) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle("is-active", on);
      el.classList.toggle("is-done", done);
    };
    set("step-location", !this.placeReady, this.placeReady);
    set("step-aerial", this.placeReady && !this.aerialLocked, this.aerialLocked);
    set(
      "step-street",
      this.aerialLocked && !this.streetLocked,
      this.streetLocked,
    );
    set(
      "step-fire",
      this.aerialLocked && !!this.selectedLauncher && this.phase !== "sending",
      this.plates.some((p) => p.staged),
    );
    set("step-ai", this.selectedPlateIds.size > 0, this.phase === "done");
  }

  private async bootMaps(): Promise<void> {
    this.mapsStatus.textContent = "Loading maps…";
    const key = getMapsApiKey();
    if (!key) {
      this.mapsStatus.textContent = "Add VITE_GOOGLE_MAPS_API_KEY to .env";
      return;
    }
    try {
      await loadGoogleMaps(key);
      await this.aerial.init(key);
      await this.streetView.init(key);
      this.aerial.show();
      this.streetView.hide();
      this.cameraMode = "aerial";
      this.appRoot.classList.add("mode-scout");
      this.streetView.setCanvasPassthrough(this.canvas, true);
      this.mapsStatus.textContent = "Maps ready — set location (or use the default Dunkin’ address).";
      this.mapsStatus.classList.add("ok");
      // Auto-apply default so user isn't stuck
      await this.applyPlaceFromInput();
    } catch (err) {
      console.error(err);
      this.mapsStatus.textContent = "Maps failed — enable Maps JavaScript API + billing.";
    }
  }

  private async applyPlaceFromInput(): Promise<void> {
    const raw = this.placeInput.value.trim();
    if (!raw) {
      this.setStatus("Enter an address or lat, lng.", true);
      return;
    }
    this.applyPlaceBtn.disabled = true;
    this.setStatus("Resolving location…");
    try {
      const resolved = await this.resolvePlace(raw);
      this.place = resolved;
      this.placeReady = true;
      this.aerialLocked = false;
      this.streetLocked = false;
      this.plates = [];
      this.selectedPlateIds.clear();
      this.selectedLauncher = null;
      this.hideWeaponView();
      this.phase = "boot";
      this.running = false;
      this.input.disable();
      this.aimHint.classList.add("hidden");

      await this.setCameraMode("aerial", { force: true });
      this.aerial.setLocation(resolved.lat, resolved.lng, resolved.placeName, {
        heading: resolved.heading,
        tilt: 45,
        zoom: 18,
        mode3d: true,
      });
      this.aerial.setScoutMode(true);
      this.aerial.startFrameBuffer();
      await this.streetView.setLocation({
        id: "user-place",
        name: resolved.placeName,
        blurb: "",
        lat: resolved.lat,
        lng: resolved.lng,
        heading: resolved.heading,
        pitch: resolved.pitch,
      });

      this.showToast(`Location set · ${resolved.placeName}`);
      this.setStatus("Location ready — Lock Aerial View next.");
      this.speak("Grid fixed. Lock aerial.");
      this.mapsStatus.textContent = `Pinned · ${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`;
      this.mapsStatus.classList.add("ok");
    } catch (e) {
      this.setStatus(e instanceof Error ? e.message : String(e), true);
      this.speak("Bad grid. Fix it.");
    } finally {
      this.applyPlaceBtn.disabled = false;
      this.syncUi();
    }
  }

  private async resolvePlace(raw: string): Promise<TargetPlace> {
    const coords = parseLatLng(raw) ?? parseMapsUrl(raw);
    if (coords) {
      return {
        placeName: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        lat: coords.lat,
        lng: coords.lng,
        heading: 0,
        pitch: 0,
      };
    }

    await loadGoogleMaps(getMapsApiKey());
    const geocoder = new google.maps.Geocoder();
    const result = await new Promise<google.maps.GeocoderResult>((resolve, reject) => {
      geocoder.geocode({ address: raw }, (results, status) => {
        if (status === "OK" && results?.[0]) resolve(results[0]);
        else reject(new Error(`Could not find that address (${status}). Try coordinates.`));
      });
    });
    const loc = result.geometry.location;
    return {
      placeName: result.formatted_address || raw,
      lat: loc.lat(),
      lng: loc.lng(),
      heading: 0,
      pitch: 0,
    };
  }

  private async setCameraMode(mode: CameraMode, opts?: { force?: boolean }): Promise<void> {
    if (!opts?.force && this.cameraMode === mode) return;
    if (mode === "street" && !this.aerialLocked) {
      this.setStatus("Lock Aerial View first — then Street View unlocks.", true);
      this.speak("Lock aerial first.");
      return;
    }
    if (this.phase === "firing" || this.phase === "sending") return;
    if (this.transitioning) return;

    // Already on this camera — just ensure it's visible (used by lock buttons)
    if (this.cameraMode === mode) {
      if (mode === "aerial") {
        this.aerial.show();
        this.streetView.hide();
      } else {
        this.streetView.show();
        this.aerial.hide();
      }
      this.onResize();
      this.syncUi();
      return;
    }

    this.transitioning = true;

    // Leaving armed when switching cameras
    if (this.phase === "armed") {
      this.phase = "boot";
      this.running = false;
      this.input.disable();
      this.hideWeaponView();
      this.aimHint.classList.add("hidden");
      this.appRoot.classList.remove("mode-armed");
      this.appRoot.classList.add("mode-scout");
    }

    const from = this.cameraMode;
    this.cameraMode = mode;
    this.appRoot.classList.add("view-crossfade");
    this.setStatus(
      mode === "street" ? "Descending to street view…" : "Pulling up to aerial…",
    );

    try {
      if (mode === "street") {
        // Match street pano to current aerial pin before the fade
        const pose = this.aerial.getCapturePose();
        this.place.lat = pose.lat;
        this.place.lng = pose.lng;
        this.place.heading = pose.heading;
        await this.streetView.setLocation({
          id: "user-place",
          name: this.place.placeName,
          blurb: "",
          lat: pose.lat,
          lng: pose.lng,
          heading: pose.heading || this.place.heading,
          pitch: 0,
        });
        this.streetView.beginEnter();
        this.streetView.setScoutMode(true);
        this.streetView.resize();
        await this.wait(90);
        this.aerial.beginExit();
        await this.wait(620);
        this.aerial.hide();
        this.aerial.stopFrameBuffer();
        this.streetView.startFrameBuffer();
        this.setOpticState(this.streetLocked ? "locked" : "scout");
        this.setStatus("Street view — aim the facade, then Lock Street View.");
        this.speak("Street view.");
      } else {
        // Pull-up: sync aerial to last known place / street pose
        if (from === "street") {
          const pose = this.streetView.getCapturePose();
          this.place.lat = pose.lat;
          this.place.lng = pose.lng;
          this.place.heading = pose.heading;
          this.aerial.setLocation(pose.lat, pose.lng, this.place.placeName, {
            heading: pose.heading,
            tilt: 45,
            zoom: 18,
            mode3d: true,
          });
        }
        this.aerial.beginEnter();
        this.aerial.setScoutMode(true);
        this.aerial.resize();
        await this.wait(90);
        this.streetView.beginExit();
        await this.wait(620);
        this.streetView.hide();
        this.streetView.stopFrameBuffer();
        this.aerial.startFrameBuffer();
        this.setOpticState(this.aerialLocked ? "locked" : "scout");
        this.setStatus("Aerial — aim the target, then Lock Aerial View.");
        this.speak("Aerial view.");
      }

      this.canvas.classList.add("canvas-passthrough");
      this.streetView.setCanvasPassthrough(this.canvas, true);
      this.appRoot.classList.add("mode-scout");
      this.appRoot.classList.remove("mode-armed");
      this.onResize();
    } finally {
      window.setTimeout(() => this.appRoot.classList.remove("view-crossfade"), 80);
      this.transitioning = false;
      this.syncUi();
    }
  }

  private async lockAerial(opts?: { diveToStreet?: boolean }): Promise<void> {
    if (!this.placeReady || this.capturing) return;
    await this.setCameraMode("aerial", { force: true });
    await this.wait(200);
    this.aerial.setScoutMode(false);
    const pose = this.aerial.getCapturePose();
    this.capturing = true;
    this.lockAerialBtn.disabled = true;
    this.setStatus("Capturing aerial preview…");
    try {
      const frame = await this.aerial.getExactLockedFrame();
      if (!frame) throw new Error("Aerial snapshot failed — wait for tiles, then try again.");
      this.place.lat = pose.lat;
      this.place.lng = pose.lng;
      this.place.heading = pose.heading;
      this.place.pitch = pose.pitch;
      this.aerialLocked = true;
      const plate = this.addPlate({
        kind: "aerial",
        frameDataUrl: frame,
        lat: pose.lat,
        lng: pose.lng,
        heading: pose.heading,
        pitch: pose.pitch,
        label: `Aerial · ${this.place.placeName}`,
      });
      this.selectedPlateIds.add(plate.id);
      this.showToast(
        opts?.diveToStreet ? "Aerial locked · diving to street…" : "Aerial locked · double right-click for weapons",
      );
      this.setStatus(
        opts?.diveToStreet
          ? "Aerial locked — zooming into street view…"
          : "Aerial locked — double right-click for weapons, or right-click once for Street.",
      );
      this.speak(
        opts?.diveToStreet
          ? "Aerial locked. Move to street. Lock it."
          : "Aerial locked. Choose your weapon.",
      );
      this.viewStreetBtn.disabled = false;
      this.syncUi();

      if (opts?.diveToStreet) {
        this.capturing = false;
        await this.setCameraMode("street");
        this.setStatus("Street view — aim facade, right-click to lock street.");
      } else {
        this.aerial.setScoutMode(true);
        this.setOpticState("locked");
      }
    } catch (e) {
      this.aerial.setScoutMode(true);
      this.setStatus(e instanceof Error ? e.message : String(e), true);
      this.speak("Aerial lock failed.");
    } finally {
      this.capturing = false;
      this.syncUi();
    }
  }

  private async unlockAerial(): Promise<void> {
    if (!this.aerialLocked || this.capturing) return;
    this.aerialLocked = false;
    this.streetLocked = false;
    this.selectedLauncher = null;
    if (this.phase === "armed" || this.phase === "firing") {
      this.phase = "boot";
      this.running = false;
      this.input.disable();
      this.hideWeaponView();
      this.aimHint.classList.add("hidden");
      this.appRoot.classList.remove("mode-armed");
      this.appRoot.classList.add("mode-scout");
    }
    await this.setCameraMode("aerial");
    this.aerial.setScoutMode(true);
    this.setOpticState("scout");
    this.showToast("Aerial unlocked");
    this.setStatus("Aerial unlocked — click to re-aim, right-click to lock again.");
    this.speak("Aerial unlocked. Re-aim.");
    this.syncUi();
  }

  private async lockStreet(): Promise<void> {
    if (!this.aerialLocked || this.capturing) return;
    if (this.cameraMode !== "street") {
      await this.setCameraMode("street");
    } else {
      await this.setCameraMode("street", { force: true });
    }
    await this.wait(250);
    this.streetView.setScoutMode(false);
    const pose = this.streetView.getCapturePose();
    this.capturing = true;
    this.lockStreetBtn.disabled = true;
    this.setStatus("Capturing street preview…");
    try {
      const frame = await this.streetView.getExactLockedFrame();
      if (!frame) throw new Error("Street snapshot failed — wait for imagery, then try again.");
      this.place.lat = pose.lat;
      this.place.lng = pose.lng;
      this.place.heading = pose.heading;
      this.place.pitch = pose.pitch;
      this.streetLocked = true;
      const plate = this.addPlate({
        kind: "street",
        frameDataUrl: frame,
        lat: pose.lat,
        lng: pose.lng,
        heading: pose.heading,
        pitch: pose.pitch,
        label: `Street · heading ${Math.round(pose.heading)}°`,
      });
      this.selectedPlateIds.add(plate.id);
      this.streetView.setScoutMode(true);
      this.showToast("Street locked · preview saved");
      this.setStatus("Street locked. Select weapon — right-click again to unlock.");
      this.speak("Street locked. Choose your weapon.");
    } catch (e) {
      this.streetView.setScoutMode(true);
      this.setStatus(e instanceof Error ? e.message : String(e), true);
      this.speak("Street lock failed.");
    } finally {
      this.capturing = false;
      this.syncUi();
    }
  }

  private async unlockStreet(): Promise<void> {
    if (!this.streetLocked || this.capturing) return;
    this.streetLocked = false;
    if (this.phase === "armed" || this.phase === "firing") {
      this.phase = "boot";
      this.running = false;
      this.input.disable();
      this.hideWeaponView();
      this.aimHint.classList.add("hidden");
      this.appRoot.classList.remove("mode-armed");
      this.appRoot.classList.add("mode-scout");
      this.selectedLauncher = null;
    }
    if (this.cameraMode !== "street") await this.setCameraMode("street");
    this.streetView.setScoutMode(true);
    this.setOpticState(this.aerialLocked ? "locked" : "scout");
    this.showToast("Street unlocked");
    this.setStatus("Street unlocked — pan to re-aim, right-click to lock again.");
    this.speak("Street unlocked. Re-aim.");
    this.syncUi();
  }

  private addPlate(
    partial: Omit<PlatePreview, "id" | "createdAt" | "placeName"> &
      Partial<Pick<PlatePreview, "weapon" | "weaponName" | "staged">>,
  ): PlatePreview {
    const plate: PlatePreview = {
      staged: false,
      ...partial,
      id: `plate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      placeName: this.place.placeName,
    };
    this.plates.unshift(plate);
    return plate;
  }

  private selectLauncher(id: ProjectileKind): void {
    if (!this.aerialLocked) {
      this.setStatus("Lock Aerial first.", true);
      return;
    }
    this.selectedLauncher = id;
    this.weapon.setAmmo(id);
    this.launcherPicker.querySelectorAll<HTMLButtonElement>("[data-launcher]").forEach((el) => {
      const on = el.dataset.launcher === id;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    this.raiseWeapon();
    this.setStatus(`${PROJECTILES[id].name} ready to fire — double-click to confirm deploy.`);
    this.showToast(`${PROJECTILES[id].name} · ready`);
    const readyLine =
      id === "rpg7"
        ? "R P G 7 ready. Double click to deploy."
        : id === "at4"
          ? "A T 4 ready. Double click to deploy."
          : id === "javelin"
            ? "Javelin ready. Double click to deploy."
            : "Bazooka ready. Double click to deploy.";
    this.speak(readyLine);
    this.syncUi();
  }

  private raiseWeapon(): void {
    if (!this.selectedLauncher) return;
    this.phase = "armed";
    this.appRoot.classList.add("mode-armed");
    this.appRoot.classList.remove("mode-scout");
    this.weapon.group.visible = false;
    this.weaponView.dataset.weapon = this.selectedLauncher;
    this.weaponViewImg.src = WEAPON_VIEW[this.selectedLauncher];
    this.weaponViewImg.alt = PROJECTILES[this.selectedLauncher].name;
    const view = PROJECTILES[this.selectedLauncher].view;
    this.weaponView.style.setProperty("--pivot-x", `${view.pivotX * 100}%`);
    this.weaponView.style.setProperty("--pivot-y", `${view.pivotY * 100}%`);
    this.weaponViewImg.style.setProperty("--aim-rot", "0deg");
    this.weaponView.classList.remove("hidden", "weapon-kick");
    void this.weaponView.offsetWidth;
    this.weaponView.classList.add("weapon-in");
    this.setOpticState("armed");
    this.aimHint.textContent = "Double-click to confirm deploy";
    this.aimHint.classList.remove("hidden");
    this.canvas.classList.remove("canvas-passthrough");
    this.streetView.setCanvasPassthrough(this.canvas, false);
    if (this.cameraMode === "aerial") this.aerial.setScoutMode(false);
    else this.streetView.setScoutMode(false);
    this.input.enable();
    requestAnimationFrame(() => this.aimWeaponAt(this.pointerX, this.pointerY));
    if (!this.running) {
      this.running = true;
      this.clock.start();
      this.tick();
    }
  }

  private hideWeaponView(): void {
    this.weaponView.classList.add("hidden");
    this.weaponView.classList.remove("weapon-in", "weapon-kick");
    this.weaponViewImg.style.setProperty("--aim-rot", "0deg");
    this.weapon.group.visible = false;
  }

  private async stageShotLocal(): Promise<void> {
    if (!this.selectedLauncher || !this.aerialLocked) return;
    if (this.phase === "firing" || this.phase === "sending") return;

    const launcher = this.selectedLauncher;
    const def = PROJECTILES[launcher];
    this.phase = "firing";
    this.audio.unlock();
    this.aimHint.classList.add("hidden");
    this.speak("Deploying.");
    this.aimWeaponAt(this.pointerX, this.pointerY);

    const flightMs = def.flightMs;
    const trailHex = `#${def.trailColor.toString(16).padStart(6, "0")}`;
    const muzzle = this.getMuzzleScreenPct();
    const toX = (this.pointerX / window.innerWidth) * 100;
    const toY = (this.pointerY / window.innerHeight) * 100;
    const impact = new THREE.Vector3(0, 1.4, -5);
    this.weapon.group.visible = true;
    this.weapon.group.position.set(0.55, -0.38, -1.05);
    this.weapon.tryFire(impact, this.scene);
    this.weapon.group.visible = false;
    this.weaponView.classList.add("weapon-kick");
    this.audio.fireLauncher(launcher);
    this.screenFx.launchRocket({
      kind: launcher,
      fx: def.fx,
      flightMs,
      smokeDensity: def.smokeDensity,
      blastIntensity: def.blastIntensity,
      trailColor: trailHex,
      fromX: muzzle.x,
      fromY: muzzle.y,
      toX,
      toY,
    });
    this.crosshair.classList.add("optic-firing");

    await this.wait(flightMs);
    this.effects.launcherImpact(impact, def.blastIntensity, def.smokeDensity);
    this.audio.impact(launcher);
    this.screenFx.impact({
      kind: launcher,
      fx: def.fx,
      smokeDensity: def.smokeDensity,
      blastIntensity: def.blastIntensity,
      trailColor: trailHex,
      x: toX,
      y: toY,
    });

    // Stage against the latest plate of the active camera (or newest overall)
    const base =
      this.plates.find((p) => p.kind === this.cameraMode) ?? this.plates[0];
    if (base) {
      const staged = this.addPlate({
        kind: base.kind,
        frameDataUrl: base.frameDataUrl,
        lat: base.lat,
        lng: base.lng,
        heading: base.heading,
        pitch: base.pitch,
        label: `${base.kind === "aerial" ? "Aerial" : "Street"} · ${def.shortName} staged`,
        weapon: launcher,
        weaponName: def.name,
        staged: true,
      });
      this.selectedPlateIds.add(staged.id);
    }

    this.crosshair.classList.remove("optic-firing");
    this.aimHint.textContent = "Double-click to confirm deploy";
    this.aimHint.classList.remove("hidden");
    this.phase = "armed";
    this.weaponView.classList.remove("weapon-kick");
    this.setStatus(
      `Deploy staged · select plates, then send to AI Visual Effects.`,
    );
    this.showToast(`Staged · ${def.shortName}`);
    this.speak("Impact. Select plates for A I.");
    this.syncUi();
  }

  private renderPlates(): void {
    this.draftCount.textContent = `(${this.plates.length})`;
    this.draftList.innerHTML = "";
    if (this.plates.length === 0) {
      this.sendKieBtn.disabled = true;
      this.sendKieBtn.textContent = SEND_LABEL;
      return;
    }
    for (const p of this.plates) {
      const selected = this.selectedPlateIds.has(p.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `draft-card${selected ? " is-selected" : ""}`;
      card.dataset.plateId = p.id;
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", selected ? "true" : "false");
      card.innerHTML = `
        <img class="draft-thumb" src="${p.frameDataUrl}" alt="" />
        <span class="draft-meta">
          <span class="draft-weapon">${p.label}</span>
          <span class="draft-blast">${p.weaponName ? p.weaponName : p.kind === "aerial" ? "Aerial plate" : "Street plate"}</span>
          <span class="draft-badge">${p.kind === "aerial" ? "Aerial" : "Street"}${p.staged ? " · staged" : ""} · free</span>
        </span>
      `;
      this.draftList.appendChild(card);
    }
    const n = this.selectedPlateIds.size;
    this.sendKieBtn.disabled = n === 0 || this.phase === "sending";
    this.sendKieBtn.textContent =
      n === 0 ? SEND_LABEL : `Send ${n} Plate${n === 1 ? "" : "s"} to AI Visual Effects`;
  }

  private togglePlateSelect(id: string): void {
    if (this.selectedPlateIds.has(id)) this.selectedPlateIds.delete(id);
    else this.selectedPlateIds.add(id);
    this.renderPlates();
    this.updateFlowSteps();
  }

  private async sendSelectedToKie(): Promise<void> {
    const selected = this.plates.filter((p) => this.selectedPlateIds.has(p.id));
    if (selected.length === 0) {
      this.setStatus("Select one or more preview plates first.", true);
      return;
    }
    if (this.phase === "sending") return;

    this.phase = "sending";
    this.sendKieBtn.disabled = true;
    this.setLaunchersEnabled(false);
    this.lockAerialBtn.disabled = true;
    this.lockStreetBtn.disabled = true;
    this.kieResults = [];
    this.setStatus(`Sending ${selected.length} plate(s) to AI Visual Effects…`);
    const n = selected.length;
    this.speak(
      n === 1
        ? "Sending to A I."
        : n >= 2 && n <= 6
          ? `Sending ${n} to A I.`
          : "Sending to A I.",
    );

    const up = await checkKieApi();
    if (!up) {
      this.phase = "armed";
      this.setStatus("AI Visual Effects API offline — start Isaac'sFLIX on :8101", true);
      this.speak("A I is down.");
      this.syncUi();
      return;
    }

    try {
      for (let i = 0; i < selected.length; i++) {
        const plate = selected[i];
        this.setStatus(`AI ${i + 1}/${selected.length}: ${plate.label}…`);
        const uploaded = await uploadCapturedPlate(plate.frameDataUrl, plate.placeName);
        const inputRef = uploaded.remote_url || uploaded.image_url;
        if (!inputRef) throw new Error(`Upload failed for ${plate.label}`);

        const weaponTag = plate.weaponName ? ` · ${plate.weaponName}` : "";
        const placeName = `${plate.placeName}${weaponTag} · ${plate.kind}`.slice(0, 200);
        const blown = await requestBlastDamage({
          place_name: placeName,
          lat: plate.lat,
          lng: plate.lng,
          heading: plate.heading,
          input_image: inputRef,
          style: "catastrophic",
        });
        const url = mediaFileUrl(blown.image_url);
        if (!url) throw new Error(`No result for ${plate.label}`);
        this.kieResults.push({
          label: plate.label,
          beforeUrl: plate.frameDataUrl,
          afterUrl: url,
        });
      }

      this.hideWeaponView();
      this.setOpticState("hidden");
      this.aimHint.classList.add("hidden");
      this.viewModeBar.classList.add("hidden");
      this.input.disable();
      this.screenFx.clear();
      this.streetView.hide();
      this.aerial.hide();
      this.phase = "done";
      // Keep the docked side panel — don't recenter into a modal takeover
      this.setPanelVisible(true);
      this.appRoot.classList.remove("panel-collapsed");
      this.panelToggle.setAttribute("aria-expanded", "true");
      this.aftermathPanel.classList.remove("hidden");
      this.win.classList.remove("hidden");
      this.appRoot.classList.add("mode-aftermath");
      this.renderAftermathSlides();
      this.showAftermathSlide(0);
      this.setBaReveal(55);
      this.setStatus(`AI complete · ${this.kieResults.length} before/after slide(s).`);
      this.showToast("AI Visual Effects ready");
      this.speak("A I done. Aftermath up.");
      this.syncUi();
    } catch (e) {
      this.phase = this.selectedLauncher ? "armed" : "boot";
      this.setStatus(e instanceof Error ? e.message : String(e), true);
      this.speak("A I failed.");
      this.syncUi();
    }
  }

  private renderAftermathSlides(): void {
    const n = this.kieResults.length;
    this.aftermathPanelMeta.textContent = `${n} plate${n === 1 ? "" : "s"} · drag scrubber for before / after`;
    this.aftermathSlideList.innerHTML = this.kieResults
      .map(
        (r, i) => `
        <button type="button" class="aftermath-slide-card" data-slide-index="${i}" role="option" aria-selected="false">
          <span class="aftermath-slide-pair">
            <img src="${r.beforeUrl}" alt="" />
            <img src="${r.afterUrl}" alt="" />
          </span>
          <span class="aftermath-slide-label">${r.label}</span>
        </button>`,
      )
      .join("");
    this.aftermathDots.innerHTML = this.kieResults
      .map(
        (_, i) =>
          `<button type="button" class="ba-dot" data-slide-index="${i}" aria-label="Slide ${i + 1}"></button>`,
      )
      .join("");
    this.baPrev.disabled = n <= 1;
    this.baNext.disabled = n <= 1;
  }

  private showAftermathSlide(index: number): void {
    if (this.kieResults.length === 0) return;
    const n = this.kieResults.length;
    this.aftermathIndex = ((index % n) + n) % n;
    const slide = this.kieResults[this.aftermathIndex];
    this.aftermathBeforeImg.src = slide.beforeUrl;
    this.aftermathAfterImg.src = slide.afterUrl;
    this.plateImg.src = slide.afterUrl;
    document.getElementById("target-plate")!.classList.add("has-photo");
    this.aftermathCaption.textContent = `${this.aftermathIndex + 1} / ${n} · ${slide.label}`;
    this.aftermathSlideList.querySelectorAll<HTMLElement>("[data-slide-index]").forEach((el) => {
      const on = Number(el.dataset.slideIndex) === this.aftermathIndex;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    this.aftermathDots.querySelectorAll<HTMLElement>("[data-slide-index]").forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.slideIndex) === this.aftermathIndex);
    });
    this.syncBaAfterWidth();
  }

  private setBaReveal(pct: number): void {
    const p = Math.max(0, Math.min(100, pct));
    this.baScrub.value = String(p);
    this.baCompare.style.setProperty("--ba-reveal", `${p}%`);
    this.syncBaAfterWidth();
  }

  private syncBaAfterWidth(): void {
    // Keep after-image full-width of compare box while clip reveals
    const w = this.baCompare.clientWidth;
    if (w > 0) this.aftermathAfterImg.style.width = `${w}px`;
  }

  private backToStaging(): void {
    this.win.classList.add("hidden");
    this.aftermathPanel.classList.add("hidden");
    this.appRoot.classList.remove("mode-aftermath");
    this.setPanelVisible(true);
    this.viewModeBar.classList.remove("hidden");
    document.getElementById("target-plate")!.classList.remove("has-photo");
    this.phase = this.selectedLauncher ? "armed" : "boot";
    void this.setCameraMode(this.cameraMode, { force: true });
    if (this.selectedLauncher && this.aerialLocked) this.raiseWeapon();
    this.setStatus("Back to staging — lock more angles or send other plates.");
    this.syncUi();
  }

  private resetToBoot(): void {
    this.plates = [];
    this.selectedPlateIds.clear();
    this.kieResults = [];
    this.aftermathIndex = 0;
    this.aerialLocked = false;
    this.streetLocked = false;
    this.selectedLauncher = null;
    this.placeReady = false;
    this.phase = "boot";
    this.running = false;
    this.hideWeaponView();
    this.input.disable();
    this.aimHint.classList.add("hidden");
    this.screenFx.clear();
    this.win.classList.add("hidden");
    this.aftermathPanel.classList.add("hidden");
    this.appRoot.classList.remove("mode-aftermath");
    this.setPanelVisible(true);
    this.viewModeBar.classList.remove("hidden");
    document.getElementById("target-plate")!.classList.remove("has-photo");
    this.setStatus("");
    void this.applyPlaceFromInput();
  }

  private setLaunchersEnabled(enabled: boolean): void {
    this.launcherPicker.classList.toggle("is-disabled", !enabled);
    this.launcherPicker.setAttribute("aria-disabled", enabled ? "false" : "true");
    this.launcherPicker.querySelectorAll<HTMLButtonElement>("[data-launcher]").forEach((el) => {
      el.disabled = !enabled;
    });
  }

  private setOpticState(state: "scout" | "locked" | "armed" | "hidden"): void {
    this.crosshair.classList.remove("hidden", "optic-scout", "optic-locked", "optic-armed");
    if (state === "hidden") {
      this.crosshair.classList.add("hidden");
      this.crosshair.setAttribute("aria-hidden", "true");
      return;
    }
    // Target reticle always on-screen during aim / lock / fire
    this.crosshair.setAttribute("aria-hidden", "false");
    this.crosshair.classList.add(`optic-${state}`);
    this.opticBadge.textContent =
      state === "scout" ? "TARGET" : state === "locked" ? "LOCKED" : "READY";
    // Keep current mouse-tracked position; only center if never moved
    if (!this.crosshair.style.left || this.crosshair.style.left === "50%") {
      this.crosshair.style.left = "50%";
      this.crosshair.style.top = "48%";
    }
  }

  private toggleSidePanel(): void {
    const collapsed = this.appRoot.classList.toggle("panel-collapsed");
    this.panelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const label = this.panelToggle.querySelector(".panel-toggle-label");
    if (label) label.textContent = collapsed ? "Show" : "Controls";
  }

  private setPanelVisible(visible: boolean): void {
    this.boot.classList.toggle("hidden", !visible);
    this.panelToggle.classList.toggle("hidden", !visible);
  }

  private setStatus(msg: string, err = false): void {
    this.status.textContent = msg;
    this.status.classList.toggle("err", err);
  }

  private showToast(msg: string): void {
    this.toast.textContent = msg;
    this.toast.classList.remove("hidden");
    window.setTimeout(() => this.toast.classList.add("hidden"), 2800);
  }

  private speak(line: string): void {
    // Keep lines exact so they hit the ChristopherNeural MP3 bank (same voice everywhere).
    this.voice.say(line.trim());
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.streetView.resize();
    this.aerial.resize();
    if (this.phase === "done") this.syncBaAfterWidth();
  }

  private tick = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.phase === "armed" || this.phase === "firing") {
      this.aimPoint.set(
        this.input.aimNdc.x * 2.2,
        1.35 + this.input.aimNdc.y * 1.2,
        -6,
      );
      this.weapon.update(dt, this.aimPoint, this.camera);
      this.weapon.updateProjectiles(dt, this.scene);
      if (this.phase === "armed" && this.input.consumeFire()) void this.stageShotLocal();
    } else {
      this.weapon.update(dt, this.aimPoint, this.camera);
      this.weapon.updateProjectiles(dt, this.scene);
    }
    this.effects.update(dt);
    this.camera.lookAt(0, 1.35, -8);
    this.renderer.render(this.scene, this.camera);
  };
}
