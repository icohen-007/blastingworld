import { ECONOMY, loadHighScore, saveHighScore } from "../data/economy";
import { STREET_PRESETS, type StreetLocation } from "../data/locations";
import type { ProjectileKind } from "../data/weapons";
import { PROJECTILES } from "../data/weapons";

export class HUD {
  private scoreEl = document.getElementById("hud-score")!;
  private coinsEl = document.getElementById("hud-coins")!;
  private waveEl = document.getElementById("hud-wave")!;
  private targetsEl = document.getElementById("hud-targets")!;
  private ammoEl = document.getElementById("hud-ammo")!;
  private placeEl = document.getElementById("hud-place")!;
  private switchBtn = document.getElementById("switch-ammo") as HTMLButtonElement;
  private hudRoot = document.getElementById("hud")!;
  private boot = document.getElementById("boot-screen")!;
  private win = document.getElementById("win-screen")!;
  private winScore = document.getElementById("win-score")!;
  private winCoins = document.getElementById("win-coins")!;
  private winHigh = document.getElementById("win-high")!;
  private toast = document.getElementById("unlock-toast")!;
  private popups = document.getElementById("score-popups")!;
  private crosshair = document.getElementById("crosshair")!;
  private mapsStatus = document.getElementById("maps-status")!;
  private presetSelect = document.getElementById("location-presets") as HTMLSelectElement;
  private customInput = document.getElementById("location-custom") as HTMLInputElement;
  private locationName = document.getElementById("location-name")!;
  private playBtn = document.getElementById("play-btn") as HTMLButtonElement;
  private aiDamageBtn = document.getElementById("ai-damage-btn") as HTMLButtonElement;
  private aiDamageStatus = document.getElementById("ai-damage-status")!;
  private damagePlate = document.getElementById("damage-plate")!;
  private damagePlateImg = document.getElementById("damage-plate-img") as HTMLImageElement;
  private toastTimer = 0;

  constructor() {
    this.fillPresets();
  }

  private fillPresets(): void {
    this.presetSelect.innerHTML = "";
    for (const loc of STREET_PRESETS) {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      this.presetSelect.appendChild(opt);
    }
  }

  onPlay(cb: () => void): void {
    this.playBtn.addEventListener("click", cb);
  }

  onRetry(cb: () => void): void {
    document.getElementById("retry-btn")!.addEventListener("click", cb);
  }

  onChangePlace(cb: () => void): void {
    document.getElementById("change-place-btn")!.addEventListener("click", cb);
  }

  onSwitchAmmo(cb: () => void): void {
    this.switchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cb();
    });
  }

  onPresetChange(cb: (id: string) => void): void {
    this.presetSelect.addEventListener("change", () => cb(this.presetSelect.value));
  }

  onLoadCustom(cb: (raw: string) => void): void {
    const go = () => cb(this.customInput.value);
    document.getElementById("load-location-btn")!.addEventListener("click", go);
    this.customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
  }

  getSelectedPresetId(): string {
    return this.presetSelect.value;
  }

  setMapsStatus(message: string, ok = false): void {
    this.mapsStatus.textContent = message;
    this.mapsStatus.classList.toggle("ok", ok);
  }

  setLocationLabel(loc: StreetLocation | null, fallback = ""): void {
    const text = loc ? `${loc.name} — ${loc.blurb}` : fallback;
    this.locationName.textContent = text || "Drag Street View to aim at a storefront.";
    this.placeEl.textContent = loc?.name ?? "Cartoon Shop";
  }

  setPlayEnabled(enabled: boolean): void {
    this.playBtn.disabled = !enabled;
    this.playBtn.style.opacity = enabled ? "1" : "0.5";
  }

  onAiDamage(cb: () => void): void {
    this.aiDamageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cb();
    });
  }

  setAiDamageBusy(busy: boolean, message = ""): void {
    this.aiDamageBtn.disabled = busy;
    this.aiDamageBtn.textContent = busy ? "Generating with Kie…" : "AI Damage This Place (Kie)";
    this.aiDamageStatus.textContent = message;
    this.aiDamageStatus.classList.toggle("err", false);
  }

  setAiDamageError(message: string): void {
    this.aiDamageBtn.disabled = false;
    this.aiDamageBtn.textContent = "AI Damage This Place (Kie)";
    this.aiDamageStatus.textContent = message;
    this.aiDamageStatus.classList.add("err");
  }

  showDamagePlate(url: string): void {
    this.damagePlateImg.src = url;
    this.damagePlate.classList.remove("hidden");
    this.damagePlate.setAttribute("aria-hidden", "false");
  }

  hideDamagePlate(): void {
    this.damagePlate.classList.add("hidden");
    this.damagePlate.setAttribute("aria-hidden", "true");
    this.damagePlateImg.removeAttribute("src");
  }

  showBoot(): void {
    this.boot.classList.remove("hidden");
    this.win.classList.add("hidden");
    this.hudRoot.classList.add("hidden");
  }

  showPlaying(): void {
    this.boot.classList.add("hidden");
    this.win.classList.add("hidden");
    this.hudRoot.classList.remove("hidden");
  }

  showWin(score: number, coins: number): void {
    const high = saveHighScore(score);
    this.winScore.textContent = `Score: ${score}`;
    this.winCoins.textContent = `Coins: ${coins}`;
    this.winHigh.textContent = `High score: ${high}`;
    this.hudRoot.classList.add("hidden");
    this.win.classList.remove("hidden");
  }

  update(stats: {
    score: number;
    coins: number;
    wave: number;
    targets: number;
    ammo: ProjectileKind;
    canSwitch: boolean;
    placeName?: string;
  }): void {
    this.scoreEl.textContent = String(stats.score);
    this.coinsEl.textContent = String(stats.coins);
    this.waveEl.textContent = `${stats.wave}/${ECONOMY.totalWaves}`;
    this.targetsEl.textContent = String(stats.targets);
    this.ammoEl.textContent = PROJECTILES[stats.ammo].name;
    if (stats.placeName) this.placeEl.textContent = stats.placeName;
    this.switchBtn.disabled = !stats.canSwitch;
    this.switchBtn.title = stats.canSwitch
      ? "Switch projectile"
      : `Unlock more ammo at ${ECONOMY.confettiUnlockCoins}+ coins`;
  }

  popupScore(amount: number, ndcX: number, ndcY: number): void {
    const el = document.createElement("div");
    el.className = "score-popup";
    el.textContent = `+${amount}`;
    const x = (ndcX * 0.5 + 0.5) * 100;
    const y = (-ndcY * 0.5 + 0.5) * 100;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    this.popups.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.remove("hidden");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.add("hidden");
    }, 2600);
  }

  pulseCrosshair(): void {
    this.crosshair.style.transform = "translate(-50%, -50%) scale(1.35)";
    window.setTimeout(() => {
      this.crosshair.style.transform = "translate(-50%, -50%)";
    }, 80);
  }

  moveCrosshair(clientX: number, clientY: number): void {
    this.crosshair.style.left = `${clientX}px`;
    this.crosshair.style.top = `${clientY}px`;
  }

  getHighScore(): number {
    return loadHighScore();
  }
}
