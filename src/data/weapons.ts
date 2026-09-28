/** Fiction VFX launchers — inspired by common anti-armor tube designs (not real-use guides). */
export type ProjectileKind = "bazooka" | "rpg7" | "at4" | "javelin";

export type FxProfile = "tubeFire" | "rpg" | "recoilless" | "topAttack";

export interface WeaponDef {
  id: string;
  name: string;
  projectileSpeed: number;
  blastRadius: number;
  damage: number;
  cooldownMs: number;
  coinCost: number;
}

/** How the PNG sits relative to screen: grip pivot + muzzle tip on the plate. */
export interface WeaponViewAim {
  /** Transform origin on the weapon plate (grip / shoulder), 0–1. */
  pivotX: number;
  pivotY: number;
  /** Muzzle tip on the weapon plate (0–1 of plate box). */
  muzzleX: number;
  muzzleY: number;
  /** Optional fine-tune degrees added after auto rest-angle (positive = tip down). */
  aimBiasDeg?: number;
}

export interface ProjectileDef {
  id: ProjectileKind;
  name: string;
  shortName: string;
  blurb: string;
  color: number;
  trailColor: number;
  speed: number;
  radius: number;
  scoreBonus: number;
  unlockCoins: number;
  fx: FxProfile;
  cooldownMs: number;
  gravity: number;
  recoil: number;
  smokeDensity: number;
  blastIntensity: number;
  /** Flight time for screen rocket (ms). */
  flightMs: number;
  view: WeaponViewAim;
}

export const BAZOOKA: WeaponDef = {
  id: "bazooka",
  name: "M1 Bazooka",
  projectileSpeed: 42,
  blastRadius: 2.2,
  damage: 1,
  cooldownMs: 420,
  coinCost: 0,
};

export const PROJECTILES: Record<ProjectileKind, ProjectileDef> = {
  bazooka: {
    id: "bazooka",
    name: "M1 Bazooka",
    shortName: "Bazooka",
    blurb: "WWII tube — loud whoosh, thick backblast smoke",
    color: 0x5a6248,
    trailColor: 0xff8a3d,
    speed: 38,
    radius: 0.28,
    scoreBonus: 0,
    unlockCoins: 0,
    fx: "tubeFire",
    cooldownMs: 420,
    gravity: 6,
    recoil: 1.15,
    smokeDensity: 1.15,
    blastIntensity: 34,
    flightMs: 580,
    view: {
      // Stock/grip bottom-right; tip is left-center of the tube in the PNG
      pivotX: 0.78,
      pivotY: 0.72,
      muzzleX: 0.14,
      muzzleY: 0.42,
      aimBiasDeg: -6,
    },
  },
  rpg7: {
    id: "rpg7",
    name: "RPG-7",
    shortName: "RPG-7",
    blurb: "Rocket grenade — sharp crack, black exhaust plume",
    color: 0x3a3a32,
    trailColor: 0xff3d5a,
    speed: 46,
    radius: 0.32,
    scoreBonus: 10,
    unlockCoins: 0,
    fx: "rpg",
    cooldownMs: 480,
    gravity: 5,
    recoil: 1.35,
    smokeDensity: 1.45,
    blastIntensity: 42,
    flightMs: 520,
    view: {
      pivotX: 0.82,
      pivotY: 0.74,
      muzzleX: 0.1,
      muzzleY: 0.4,
      aimBiasDeg: -4,
    },
  },
  at4: {
    id: "at4",
    name: "AT4",
    shortName: "AT4",
    blurb: "Recoilless shot — hard thump, white-grey smoke wall",
    color: 0x6b7358,
    trailColor: 0xffe066,
    speed: 52,
    radius: 0.26,
    scoreBonus: 15,
    unlockCoins: 0,
    fx: "recoilless",
    cooldownMs: 520,
    gravity: 3.5,
    recoil: 0.85,
    smokeDensity: 1.7,
    blastIntensity: 38,
    flightMs: 480,
    view: {
      pivotX: 0.84,
      pivotY: 0.76,
      muzzleX: 0.08,
      muzzleY: 0.38,
      aimBiasDeg: -5,
    },
  },
  javelin: {
    id: "javelin",
    name: "FGM-148 Javelin",
    shortName: "Javelin",
    blurb: "Soft launch then climb — dual burn, lingering haze",
    color: 0x2c3540,
    trailColor: 0x3ec6ff,
    speed: 34,
    radius: 0.3,
    scoreBonus: 25,
    unlockCoins: 0,
    fx: "topAttack",
    cooldownMs: 600,
    gravity: 2.2,
    recoil: 0.55,
    smokeDensity: 1.3,
    blastIntensity: 46,
    flightMs: 980,
    view: {
      pivotX: 0.8,
      pivotY: 0.7,
      muzzleX: 0.12,
      muzzleY: 0.44,
      aimBiasDeg: -8,
    },
  },
};

export const WEAPON_VIEW: Record<ProjectileKind, string> = {
  bazooka: "/weapons/bazooka.png?v=2",
  rpg7: "/weapons/rpg7.png?v=2",
  at4: "/weapons/at4.png?v=2",
  javelin: "/weapons/javelin.png?v=2",
};

export const AMMO_ORDER: ProjectileKind[] = ["bazooka", "rpg7", "at4", "javelin"];
