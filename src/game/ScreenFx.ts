/** Full-screen DOM VFX — per-weapon rockets, fire, smoke over map views. */

import type { FxProfile, ProjectileKind } from "../data/weapons";

export type ScreenLaunchOpts = {
  kind: ProjectileKind;
  fx: FxProfile;
  flightMs: number;
  smokeDensity: number;
  blastIntensity: number;
  trailColor: string;
  /** Muzzle start as % of viewport */
  fromX: number;
  fromY: number;
  /** Impact / reticle as % of viewport */
  toX: number;
  toY: number;
};

export type ScreenImpactOpts = {
  kind: ProjectileKind;
  fx: FxProfile;
  smokeDensity: number;
  blastIntensity: number;
  trailColor: string;
  x: number;
  y: number;
};

export class ScreenFx {
  private layer: HTMLElement;
  private clearTimers: number[] = [];

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  clear(): void {
    for (const t of this.clearTimers) window.clearTimeout(t);
    this.clearTimers = [];
    this.layer.innerHTML = "";
    this.layer.classList.remove("active");
    this.layer.removeAttribute("data-fx");
  }

  /** Muzzle spit + rocket streak to aim point — profiled per launcher. */
  launchRocket(opts: ScreenLaunchOpts): void {
    this.layer.classList.add("active");
    this.layer.setAttribute("data-fx", opts.fx);
    const density = opts.smokeDensity;
    const { fromX, fromY, toX, toY } = opts;
    const ang =
      (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;

    // Muzzle flash at weapon tip
    this.spawn(`fx-muzzle fx-muzzle-${opts.fx}`, {
      left: `${fromX}%`,
      top: `${fromY}%`,
      "--dur": opts.fx === "recoilless" ? "0.45s" : "0.32s",
    });

    const flameN =
      opts.fx === "recoilless"
        ? Math.floor(4 * density)
        : opts.fx === "topAttack"
          ? Math.floor(5 * density)
          : Math.floor(8 * density);
    for (let i = 0; i < flameN; i++) {
      this.spawn(`fx-flame fx-flame-${opts.fx}`, {
        left: `${fromX + (Math.random() - 0.5) * 6}%`,
        top: `${fromY + (Math.random() - 0.5) * 5}%`,
        "--s": `${0.5 + Math.random() * (opts.fx === "rpg" ? 1.2 : 0.85)}`,
        "--rot": `${ang - 90 + (Math.random() - 0.5) * 40}deg`,
        "--dur": `${0.4 + Math.random() * 0.35}s`,
        animationDelay: `${Math.random() * 0.08}s`,
      });
    }

    // Backblast / exhaust behind the tube
    const backN =
      opts.fx === "recoilless"
        ? Math.floor(16 * density)
        : opts.fx === "rpg"
          ? Math.floor(12 * density)
          : opts.fx === "topAttack"
            ? Math.floor(6 * density)
            : Math.floor(10 * density);
    for (let i = 0; i < backN; i++) {
      const back = i / Math.max(1, backN);
      this.spawn(`fx-smoke fx-smoke-${opts.fx}`, {
        left: `${fromX + 6 + back * 10 + (Math.random() - 0.5) * 4}%`,
        top: `${fromY + 4 + back * 8 + (Math.random() - 0.5) * 4}%`,
        "--s": `${0.9 + Math.random() * 1.6}`,
        "--drift": `${20 + Math.random() * 50}px`,
        "--dur": `${1.3 + Math.random() * 1.4}s`,
        animationDelay: `${Math.random() * 0.12}s`,
      });
    }

    // Projectile body
    const rocketClass =
      opts.fx === "rpg"
        ? "fx-rocket fx-rocket-rpg"
        : opts.fx === "topAttack"
          ? "fx-rocket fx-rocket-javelin"
          : opts.fx === "recoilless"
            ? "fx-rocket fx-rocket-at4"
            : "fx-rocket fx-rocket-bazooka";

    const rocket = this.spawn(rocketClass, {
      "--flight": `${opts.flightMs}ms`,
      "--trail": opts.trailColor,
      "--x0": `${fromX}%`,
      "--y0": `${fromY}%`,
      "--x1": `${toX}%`,
      "--y1": `${toY}%`,
      "--ang": `${ang}deg`,
      "--arc": opts.fx === "topAttack" ? "-18%" : "0%",
    });

    const trailN =
      opts.fx === "topAttack"
        ? Math.floor(14 * density)
        : opts.fx === "recoilless"
          ? Math.floor(7 * density)
          : Math.floor(11 * density);
    for (let i = 0; i < trailN; i++) {
      const t = (i + 1) / (trailN + 1);
      const lx = fromX + (toX - fromX) * t;
      const ly =
        fromY +
        (toY - fromY) * t +
        (opts.fx === "topAttack" ? -18 * Math.sin(Math.PI * t) : 0);
      this.spawn(`fx-smoke fx-smoke-trail fx-smoke-${opts.fx}`, {
        left: `${lx}%`,
        top: `${ly}%`,
        "--s": `${0.65 + Math.random() * 1.1}`,
        "--dur": `${1.0 + Math.random() * 0.9}s`,
        animationDelay: `${opts.flightMs * t * 0.85}ms`,
      });
      if (opts.fx !== "recoilless") {
        this.spawn(`fx-ember fx-ember-${opts.fx}`, {
          left: `${lx + (Math.random() - 0.5) * 3}%`,
          top: `${ly + (Math.random() - 0.5) * 3}%`,
          "--s": `${0.35 + Math.random() * 0.7}`,
          "--dur": `${0.35 + Math.random() * 0.4}s`,
          animationDelay: `${opts.flightMs * t * 0.85}ms`,
        });
      }
    }

    this.scheduleRemove(rocket, opts.flightMs + 40);
  }

  /** Impact fireball — scaled and colored per launcher. */
  impact(opts: ScreenImpactOpts): void {
    this.layer.classList.add("active");
    this.layer.setAttribute("data-fx", opts.fx);
    const density = opts.smokeDensity;
    const power = opts.blastIntensity / 36;
    const cx = opts.x;
    const cy = opts.y;
    const big = opts.blastIntensity >= 38;

    this.spawn(`fx-shockwave fx-shock-${opts.fx}`, {
      left: `${cx}%`,
      top: `${cy}%`,
      "--dur": opts.fx === "recoilless" ? "0.85s" : "0.65s",
      "--scale": `${12 + power * 4}`,
    });
    this.spawn(`fx-impact-core fx-core-${opts.fx}`, {
      left: `${cx}%`,
      top: `${cy}%`,
      "--dur": "0.55s",
      "--c": opts.trailColor,
    });

    // Javelin: second delayed pop (top-attack feel)
    if (opts.fx === "topAttack") {
      this.clearTimers.push(
        window.setTimeout(() => {
          this.spawn("fx-impact-core fx-core-topAttack", {
            left: `${cx}%`,
            top: `${cy - 2}%`,
            "--dur": "0.5s",
            "--c": opts.trailColor,
          });
          this.spawn("fx-shockwave fx-shock-topAttack", {
            left: `${cx}%`,
            top: `${cy}%`,
            "--dur": "0.7s",
            "--scale": "16",
          });
        }, 120),
      );
    }

    const flames = Math.floor((big ? 20 : 12) * density * (opts.fx === "recoilless" ? 0.55 : 1));
    for (let i = 0; i < flames; i++) {
      const a = (Math.PI * 2 * i) / Math.max(1, flames) + Math.random() * 0.4;
      const dist = (2 + Math.random() * 14) * power;
      this.spawn(`fx-flame fx-flame-${opts.fx}`, {
        left: `${cx + Math.cos(a) * dist}%`,
        top: `${cy + Math.sin(a) * dist * 0.65}%`,
        "--s": `${0.75 + Math.random() * (big ? 2.2 : 1.3)}`,
        "--rot": `${(a * 180) / Math.PI - 90}deg`,
        "--dur": `${0.65 + Math.random() * 0.7}s`,
        animationDelay: `${Math.random() * 0.2}s`,
      });
    }

    const smokes = Math.floor((big ? 24 : 14) * density);
    for (let i = 0; i < smokes; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * 16 * power;
      this.spawn(`fx-smoke fx-smoke-${opts.fx}`, {
        left: `${cx + Math.cos(a) * dist}%`,
        top: `${cy + Math.sin(a) * dist * 0.5 - Math.random() * 4}%`,
        "--s": `${1.1 + Math.random() * (big ? 2.8 : 1.7)}`,
        "--drift": `${-30 + Math.random() * 60}px`,
        "--dur": `${2.0 + Math.random() * 2.4}s`,
        animationDelay: `${Math.random() * 0.35}s`,
      });
    }

    const embers =
      opts.fx === "recoilless" ? Math.floor(8 * density) : Math.floor(18 * density);
    for (let i = 0; i < embers; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = (4 + Math.random() * 22) * power;
      this.spawn(`fx-ember fx-ember-${opts.fx}`, {
        left: `${cx + Math.cos(a) * dist}%`,
        top: `${cy + Math.sin(a) * dist * 0.55}%`,
        "--s": `${0.35 + Math.random() * 0.85}`,
        "--dur": `${0.5 + Math.random() * 0.7}s`,
        animationDelay: `${Math.random() * 0.15}s`,
      });
    }

    const hold = big ? 5200 : 2800;
    this.clearTimers.push(
      window.setTimeout(() => {
        if (!this.layer.querySelector(".fx-rocket")) {
          this.layer.classList.remove("active");
        }
      }, hold),
    );
  }

  private spawn(className: string, style: Record<string, string>): HTMLElement {
    const el = document.createElement("span");
    el.className = className;
    el.setAttribute("aria-hidden", "true");
    for (const [k, v] of Object.entries(style)) {
      if (k.startsWith("--")) el.style.setProperty(k, v);
      else if (k === "animationDelay") el.style.animationDelay = v;
      else if (k === "left") el.style.left = v;
      else if (k === "top") el.style.top = v;
      else if (k === "bottom") el.style.bottom = v;
      else if (k === "right") el.style.right = v;
    }
    this.layer.appendChild(el);
    return el;
  }

  private scheduleRemove(el: HTMLElement, ms: number): void {
    this.clearTimers.push(
      window.setTimeout(() => {
        el.remove();
      }, ms),
    );
  }
}
