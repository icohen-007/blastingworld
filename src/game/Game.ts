import * as THREE from "three";
import { ECONOMY } from "../data/economy";
import {
  parseMapsUrl,
  STREET_PRESETS,
  type StreetLocation,
} from "../data/locations";
import { AMMO_ORDER, PROJECTILES } from "../data/weapons";
import type { ProjectileKind } from "../data/weapons";
import { AudioBus } from "./Audio";
import { getWorldCenter, type Destructible } from "./Destructible";
import { Effects } from "./Effects";
import { HUD } from "./HUD";
import { Input } from "./Input";
import { LevelDonutShop } from "./LevelDonutShop";
import { PlayerWeapon } from "./PlayerWeapon";
import { checkKieApi, mediaFileUrl, requestBlastDamage } from "./KieClient";
import { getMapsApiKey, mapsErrorHelp, StreetViewBackdrop } from "./StreetView";

type Phase = "boot" | "playing" | "won";

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 4.2);
  private aimNdc = new THREE.Vector2();
  private aimPoint = new THREE.Vector3();
  private hitCenter = new THREE.Vector3();
  private ndc = new THREE.Vector3();

  private input: Input;
  private hud = new HUD();
  private audio = new AudioBus();
  private level = new LevelDonutShop();
  private weapon = new PlayerWeapon();
  private effects: Effects;
  private streetView: StreetViewBackdrop;
  private appRoot = document.getElementById("app")!;
  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.PointLight;
  private warmLight!: THREE.PointLight;

  private phase: Phase = "boot";
  private score = 0;
  private coins = 0;
  private wave = 1;
  private running = false;
  private streetMode = false;
  private activeLocation: StreetLocation | null = null;
  private camInterior = new THREE.Vector3(0, 2.2, 5.5);
  private camStreet = new THREE.Vector3(0, 1.65, 4.2);
  private camBase = this.camInterior.clone();
  private lookAtTarget = new THREE.Vector3(0, 1.4, -3);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const svEl = document.getElementById("streetview");
    if (!svEl) throw new Error("Missing #streetview");
    this.streetView = new StreetViewBackdrop(svEl);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookAtTarget);

    this.effects = new Effects(this.camera);
    this.effects.setBaseCamera(this.camBase);
    this.input = new Input(canvas);

    this.setupLights();
    this.applyInteriorAtmosphere();
    this.scene.add(this.level.group);
    this.scene.add(this.effects.group);
    this.weapon.attachToCamera(this.camera);
    this.scene.add(this.camera);
    this.weapon.onMuzzleFlash = (pos, dir) => {
      this.effects.muzzleFlash(pos, dir);
    };
    this.weapon.onTrail = (pos, kind) => {
      const color = PROJECTILES[kind].trailColor;
      this.effects.burst(pos, color, 3, false);
    };

    this.hud.onPlay(() => void this.startGame());
    this.hud.onRetry(() => void this.startGame());
    this.hud.onChangePlace(() => this.returnToScout());
    this.hud.onSwitchAmmo(() => this.cycleAmmo());
    this.hud.onPresetChange((id) => void this.loadPreset(id));
    this.hud.onLoadCustom((raw) => void this.loadCustom(raw));
    this.hud.onAiDamage(() => void this.runAiDamage());

    window.addEventListener("resize", () => this.onResize());
    this.hud.showBoot();
    this.level.build(false);
    this.renderer.render(this.scene, this.camera);

    void this.bootstrapStreetView();
  }

  private setAppMode(mode: "interior" | "scout" | "street-play"): void {
    this.appRoot.classList.remove("mode-scout", "mode-street-play", "mode-interior");
    this.appRoot.classList.add(`mode-${mode === "street-play" ? "street-play" : mode}`);
  }

  private applyInteriorAtmosphere(): void {
    this.streetMode = false;
    this.scene.background = new THREE.Color(0x2a1838);
    this.scene.fog = new THREE.Fog(0x2a1838, 14, 28);
    this.renderer.setClearColor(0x2a1838, 1);
    this.renderer.toneMappingExposure = 1.1;
    this.camBase.copy(this.camInterior);
    this.lookAtTarget.set(0, 1.4, -3);
    this.camera.position.copy(this.camBase);
    this.effects.setBaseCamera(this.camBase);
    this.streetView.hide();
    this.streetView.setScoutMode(false);
    this.streetView.setCanvasPassthrough(this.canvas, false);
    this.setLightingProfile("interior");
    this.weapon.group.visible = true;
    this.level.group.visible = true;
    this.setAppMode("interior");
  }

  private applyStreetAtmosphere(): void {
    this.streetMode = true;
    this.scene.background = null;
    this.scene.fog = null;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMappingExposure = 1.45;
    this.camBase.copy(this.camStreet);
    this.lookAtTarget.set(0, 1.5, -4);
    this.camera.position.copy(this.camBase);
    this.effects.setBaseCamera(this.camBase);
    this.streetView.show();
    this.setLightingProfile("street");
  }

  private enterScoutView(): void {
    this.applyStreetAtmosphere();
    this.streetView.setScoutMode(true);
    this.streetView.setCanvasPassthrough(this.canvas, true);
    this.weapon.group.visible = false;
    this.level.group.visible = false;
    this.setAppMode("scout");
    this.renderer.clear(true, true, true);
    // If an AI damage plate is up, keep Street View hidden underneath
    const plate = document.getElementById("damage-plate");
    if (plate && !plate.classList.contains("hidden")) {
      this.streetView.hide();
    }
  }

  private setupLights(): void {
    this.hemiLight = new THREE.HemisphereLight(0xffe8f4, 0x4a3040, 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff2d6, 1.15);
    this.keyLight.position.set(4, 10, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 30;
    this.keyLight.shadow.camera.left = -10;
    this.keyLight.shadow.camera.right = 10;
    this.keyLight.shadow.camera.top = 10;
    this.keyLight.shadow.camera.bottom = -10;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.PointLight(0x3ec6ff, 0.55, 20);
    this.fillLight.position.set(-4, 3, 2);
    this.scene.add(this.fillLight);

    this.warmLight = new THREE.PointLight(0xff8a3d, 0.45, 16);
    this.warmLight.position.set(3, 2.5, -2);
    this.scene.add(this.warmLight);
  }

  private setLightingProfile(profile: "interior" | "street"): void {
    if (!this.hemiLight || !this.keyLight || !this.fillLight || !this.warmLight) {
      return;
    }
    if (profile === "street") {
      this.hemiLight.color.set(0xffffff);
      this.hemiLight.groundColor.set(0x6a7a8a);
      this.hemiLight.intensity = 1.35;
      this.keyLight.color.set(0xfff8e8);
      this.keyLight.intensity = 1.8;
      this.keyLight.castShadow = false;
      this.fillLight.intensity = 1.1;
      this.warmLight.intensity = 0.9;
    } else {
      this.hemiLight.color.set(0xffe8f4);
      this.hemiLight.groundColor.set(0x4a3040);
      this.hemiLight.intensity = 0.85;
      this.keyLight.color.set(0xfff2d6);
      this.keyLight.intensity = 1.15;
      this.keyLight.castShadow = true;
      this.fillLight.intensity = 0.55;
      this.warmLight.intensity = 0.45;
    }
  }

  private async runAiDamage(): Promise<void> {
    const place =
      this.activeLocation?.name ??
      STREET_PRESETS.find((p) => p.id === this.hud.getSelectedPresetId())?.name ??
      "street storefront";
    const loc =
      this.activeLocation ??
      STREET_PRESETS.find((p) => p.id === this.hud.getSelectedPresetId()) ??
      null;

    this.hud.setAiDamageBusy(true, "Calling Isaac'sFLIX Kie API… (30–60s)");
    const up = await checkKieApi();
    if (!up) {
      this.hud.setAiDamageError(
        "Kie API offline. Start AI Social Media Gen Content on port 8101, then retry.",
      );
      return;
    }

    try {
      const pov = this.streetView.isReady ? this.streetView.getPov() : null;
      const result = await requestBlastDamage({
        place_name: place,
        lat: loc?.lat,
        lng: loc?.lng,
        heading: pov?.heading ?? loc?.heading,
        style: "cinematic",
        aspect_ratio: "16:9",
      });
      const url = mediaFileUrl(result.image_url);
      if (!url) throw new Error("Kie returned no image_url");
      this.hud.showDamagePlate(url);
      // Prefer damaged plate over live Street View while scouting / playing
      if (this.streetView.isReady) {
        this.streetView.hide();
      }
      this.hud.setAiDamageBusy(false, "Fictional damage plate ready — Blast This View to play on it.");
      this.hud.showToast("AI damage plate ready (fiction only)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.hud.setAiDamageError(msg);
    }
  }

  private async bootstrapStreetView(): Promise<void> {
    const key = getMapsApiKey();
    if (!key) {
      this.hud.setMapsStatus(
        "Add VITE_GOOGLE_MAPS_API_KEY to a .env file (Maps JavaScript API + Street View) to point at real places. Playing cartoon shop until then.",
        false,
      );
      this.hud.setPlayEnabled(true);
      this.hud.setLocationLabel(null, "Cartoon Donut Shop (no Street View key yet)");
      this.activeLocation = null;
      return;
    }

    this.hud.setMapsStatus("Loading Google Street View…", true);
    this.hud.setPlayEnabled(false);

    try {
      await this.streetView.init(key);
      this.enterScoutView();
      this.level.build(true);
      this.hud.setMapsStatus(
        "Street View ready — drag to point at a place, then Blast This View.",
        true,
      );
      await this.loadPreset(this.hud.getSelectedPresetId());
      this.hud.setPlayEnabled(true);
    } catch (err) {
      console.error(err);
      this.applyInteriorAtmosphere();
      this.hud.setMapsStatus(mapsErrorHelp(err), false);
      this.hud.setPlayEnabled(true);
      this.hud.setLocationLabel(null, "Cartoon Donut Shop (Street View unavailable)");
      this.hud.showToast("Street View blocked — play cartoon shop for now");
    }
  }

  private async loadPreset(id: string): Promise<void> {
    const loc = STREET_PRESETS.find((p) => p.id === id) ?? STREET_PRESETS[0];
    await this.applyLocation(loc);
  }

  private async loadCustom(raw: string): Promise<void> {
    const parsed = parseMapsUrl(raw);
    if (!parsed) {
      this.hud.showToast("Use lat,lng or a Google Maps URL");
      return;
    }
    const loc: StreetLocation = {
      id: "custom",
      name: `Custom · ${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)}`,
      blurb: "Your pointed place on Street View.",
      lat: parsed.lat,
      lng: parsed.lng,
      heading: this.streetView.getPov().heading || 0,
      pitch: 2,
    };
    await this.applyLocation(loc);
  }

  private async applyLocation(loc: StreetLocation): Promise<void> {
    if (!this.streetView.isReady) {
      this.activeLocation = null;
      this.hud.setLocationLabel(null, "Cartoon Donut Shop");
      return;
    }

    this.hud.setMapsStatus("Finding Street View coverage…", true);
    const ok = await this.streetView.setLocation(loc);
    if (!ok) {
      this.hud.setMapsStatus(
        "No Street View near that point. Try another preset or coordinates.",
        false,
      );
      this.hud.showToast("No Street View here — try another spot");
      return;
    }

    this.activeLocation = loc;
    this.enterScoutView();
    this.hud.setLocationLabel(loc);
    this.hud.setMapsStatus(
      "Drag / scroll Street View to point at the storefront you want.",
      true,
    );
  }

  private returnToScout(): void {
    this.phase = "boot";
    this.input.disable();
    this.weapon.clearProjectiles(this.scene);
    this.effects.clear();
    this.hud.showBoot();

    if (this.streetView.isReady) {
      this.enterScoutView();
      this.level.build(true);
      this.hud.setMapsStatus("Point at a place, then Blast This View.", true);
      this.hud.setLocationLabel(this.activeLocation);
    } else {
      this.applyInteriorAtmosphere();
      this.level.build(false);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private async startGame(): Promise<void> {
    this.audio.unlock();
    this.score = 0;
    this.coins = 0;
    this.wave = 1;
    this.weapon.setAmmo("bazooka");
    this.weapon.clearProjectiles(this.scene);
    this.effects.clear();

    const useStreet = this.streetView.isReady && this.activeLocation != null;
    if (useStreet) {
      this.applyStreetAtmosphere();
      this.streetView.setScoutMode(false);
      this.streetView.setCanvasPassthrough(this.canvas, false);
      this.setAppMode("street-play");
      this.weapon.group.visible = true;
      this.level.group.visible = true;
      const pov = this.streetView.getPov();
      if (this.activeLocation) {
        this.activeLocation = {
          ...this.activeLocation,
          heading: pov.heading,
          pitch: pov.pitch,
        };
      }
    } else {
      this.applyInteriorAtmosphere();
      this.streetView.setCanvasPassthrough(this.canvas, false);
    }

    this.camera.position.copy(this.camBase);
    this.effects.setBaseCamera(this.camBase);

    this.level.build(useStreet);
    this.level.spawnWave(this.wave);

    this.phase = "playing";
    this.hud.showPlaying();
    this.input.enable();
    this.hud.moveCrosshair(window.innerWidth / 2, window.innerHeight / 2);
    this.syncHud();
    this.hud.showToast(
      useStreet
        ? `Blasting at ${this.activeLocation!.name} — fiction only!`
        : "Cartoon Donut Shop — add a Maps API key for Street View",
    );

    if (!this.running) {
      this.running = true;
      this.clock.start();
      this.tick();
    }
  }

  private cycleAmmo(): void {
    const unlocked = AMMO_ORDER;
    if (unlocked.length < 2) return;
    const idx = unlocked.indexOf(this.weapon.ammo);
    const next = unlocked[(idx + 1) % unlocked.length];
    this.weapon.setAmmo(next);
    this.syncHud();
  }

  private syncHud(): void {
    this.hud.update({
      score: this.score,
      coins: this.coins,
      wave: this.wave,
      targets: this.level.aliveCount(),
      ammo: this.weapon.ammo,
      canSwitch: true,
      placeName: this.streetMode
        ? (this.activeLocation?.name ?? "Street View")
        : "Donut Shop",
    });
  }

  private updateAimPoint(): void {
    this.aimNdc.set(this.input.aimNdc.x, this.input.aimNdc.y);
    this.raycaster.setFromCamera(this.aimNdc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
      this.aimPoint
        .copy(this.raycaster.ray.origin)
        .addScaledVector(this.raycaster.ray.direction, 12);
    }
  }

  private tryShoot(): void {
    if (!this.input.consumeFire()) return;
    this.updateAimPoint();
    const shot = this.weapon.tryFire(this.aimPoint, this.scene);
    if (!shot) return;
    this.audio.fireLauncher(shot.kind);
    this.hud.pulseCrosshair();
  }

  private checkHits(): void {
    for (const p of this.weapon.projectiles) {
      if (!p.alive) continue;
      for (const d of this.level.destructibles) {
        if (!d.alive) continue;
        getWorldCenter(d, this.hitCenter);
        if (d.kind === "shelf") this.hitCenter.y += 0.3;
        if (d.kind === "sign") this.hitCenter.y += 0.5;
        if (d.kind === "jar") this.hitCenter.y += 0.25;
        if (d.kind === "box") this.hitCenter.y += 0.15;

        const dist = p.mesh.position.distanceTo(this.hitCenter);
        const hitR = d.radius + PROJECTILES[p.kind].radius;
        if (dist <= hitR) {
          this.destroyTarget(d, p.kind, p.mesh.position.clone());
          p.alive = false;
          break;
        }
      }
    }
  }

  private destroyTarget(
    d: Destructible,
    ammo: ProjectileKind,
    impact: THREE.Vector3,
  ): void {
    d.hp -= 1;
    if (d.hp > 0) {
      this.effects.fireBlast(impact, 12);
      this.audio.hit();
      d.mesh.scale.multiplyScalar(0.92);
      return;
    }

    d.alive = false;
    this.level.group.remove(d.mesh);

    const def = PROJECTILES[ammo];
    const points = d.points + def.scoreBonus;
    const coinGain = d.coins + Math.floor(def.scoreBonus / 10);
    this.score += points;
    this.coins += coinGain;

    this.effects.launcherImpact(impact, def.blastIntensity, def.smokeDensity);
    this.audio.impact(ammo);

    this.ndc.copy(impact).project(this.camera);
    this.hud.popupScore(points, this.ndc.x, this.ndc.y);

    this.maybeUnlockAmmo();
    this.syncHud();

    if (this.level.aliveCount() === 0) {
      this.onWaveCleared();
    }
  }

  private maybeUnlockAmmo(): void {
    this.syncHud();
  }

  private onWaveCleared(): void {
    this.score += ECONOMY.scorePerWaveClear;
    this.coins += ECONOMY.coinsPerWaveClear;
    this.syncHud();

    if (this.wave >= ECONOMY.totalWaves) {
      this.phase = "won";
      this.input.disable();
      this.audio.win();
      this.hud.showWin(this.score, this.coins);
      return;
    }

    this.wave += 1;
    this.level.spawnWave(this.wave);
    this.hud.showToast(`Wave ${this.wave} — more chaos!`);
    this.syncHud();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.streetView.resize();
  }

  private tick = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (this.phase === "playing") {
      this.updateAimPoint();
      this.hud.moveCrosshair(this.input.clientAim.x, this.input.clientAim.y);
      this.weapon.update(dt, this.aimPoint, this.camera);
      this.tryShoot();
      this.weapon.updateProjectiles(dt, this.scene);
      this.checkHits();
      this.level.updateIdle(t);
    } else {
      this.weapon.update(dt, this.aimPoint, this.camera);
      this.weapon.updateProjectiles(dt, this.scene);
    }

    this.effects.update(dt);
    this.camera.lookAt(this.lookAtTarget);
    this.renderer.render(this.scene, this.camera);
  };
}
