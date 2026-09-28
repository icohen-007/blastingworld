import * as THREE from "three";
import type { ProjectileKind } from "../data/weapons";
import { PROJECTILES } from "../data/weapons";

export interface Projectile {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  kind: ProjectileKind;
  alive: boolean;
  age: number;
  trailTimer: number;
}

export class PlayerWeapon {
  readonly group = new THREE.Group();
  readonly projectiles: Projectile[] = [];
  ammo: ProjectileKind = "bazooka";
  private body: THREE.Group;
  private cooldown = 0;
  private recoil = 0;
  private muzzleLocal = new THREE.Vector3(0, 0.1, -1.7);
  private tmp = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private lastMuzzle = new THREE.Vector3();
  private lastDir = new THREE.Vector3(0, 0, -1);
  onMuzzleFlash: ((pos: THREE.Vector3, dir: THREE.Vector3) => void) | null = null;
  onTrail: ((pos: THREE.Vector3, kind: ProjectileKind) => void) | null = null;

  constructor() {
    this.body = new THREE.Group();
    this.rebuildTube("bazooka");
    this.group.add(this.body);
    this.group.position.set(0.55, -0.35, -1.1);
  }

  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.group);
  }

  setAmmo(kind: ProjectileKind): void {
    if (this.ammo === kind) return;
    this.ammo = kind;
    this.rebuildTube(kind);
  }

  private rebuildTube(kind: ProjectileKind): void {
    while (this.body.children.length) {
      const c = this.body.children[0];
      this.body.remove(c);
      c.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
    }

    const tubeMat = new THREE.MeshStandardMaterial({
      color: kind === "javelin" ? 0x2c3540 : kind === "rpg7" ? 0x3a3a32 : 0x4a5240,
      roughness: 0.55,
      metalness: 0.65,
      emissive: 0x1a1f14,
      emissiveIntensity: 0.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1c,
      roughness: 0.5,
      metalness: 0.7,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: kind === "at4" ? 0x6b7358 : 0x2f3528,
      roughness: 0.6,
      metalness: 0.4,
    });
    const heatMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      emissive: 0xff4a00,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.5,
    });

    const len = kind === "javelin" ? 1.55 : kind === "at4" ? 1.7 : 1.85;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(
        kind === "rpg7" ? 0.14 : 0.16,
        kind === "rpg7" ? 0.22 : 0.2,
        len,
        24,
      ),
      tubeMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -0.75);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.2, 0.28, 20),
      heatMat,
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.1, -1.65);

    const breech = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.7), darkMat);
    breech.position.set(0, 0.02, 0.35);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.65), accent);
    stock.position.set(0, -0.08, 0.85);
    stock.rotation.x = 0.4;

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), darkMat);
    sight.position.set(0, 0.32, -0.2);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.4, 10),
      darkMat,
    );
    handle.position.set(0, -0.3, 0.15);

    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.35, 0.06),
      tubeMat,
    );
    shield.position.set(0, 0.22, -0.15);

    this.body.add(barrel, muzzle, breech, stock, sight, handle, shield);

    if (kind === "rpg7") {
      const warhead = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.45, 12),
        new THREE.MeshStandardMaterial({
          color: 0x5a4030,
          roughness: 0.55,
          metalness: 0.35,
        }),
      );
      warhead.rotation.x = -Math.PI / 2;
      warhead.position.set(0, 0.1, -1.95);
      this.body.add(warhead);
    }

    if (kind === "javelin") {
      const clu = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.28, 0.55),
        darkMat,
      );
      clu.position.set(0.28, 0.2, 0.1);
      this.body.add(clu);
    }

    for (const z of [-0.4, -0.7, -1.0]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.21, 0.025, 8, 20),
        darkMat,
      );
      band.rotation.y = Math.PI / 2;
      band.position.set(0, 0.1, z);
      this.body.add(band);
    }

    this.muzzleLocal.set(0, 0.1, kind === "rpg7" ? -2.05 : -1.7);
  }

  update(dt: number, aimPoint: THREE.Vector3, camera: THREE.Camera): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 3.2);

    this.group.position.z = -1.1 + this.recoil * 0.32;
    this.group.rotation.x = -this.recoil * 0.42;

    this.tmp.copy(aimPoint).sub(camera.position).normalize();
    const yaw = Math.atan2(this.tmp.x, -this.tmp.z);
    const pitch = Math.asin(Math.max(-0.5, Math.min(0.5, this.tmp.y)));
    this.body.rotation.y = yaw * 0.15;
    this.body.rotation.x = -pitch * 0.2;
  }

  tryFire(aimPoint: THREE.Vector3, scene: THREE.Scene): Projectile | null {
    if (this.cooldown > 0) return null;

    const def = PROJECTILES[this.ammo];
    this.cooldown = def.cooldownMs / 1000;
    this.recoil = def.recoil;

    this.group.updateWorldMatrix(true, false);
    const origin = this.tmp.copy(this.muzzleLocal);
    this.group.localToWorld(origin);
    this.lastMuzzle.copy(origin);

    this.tmpDir.copy(aimPoint).sub(origin).normalize();
    // Soft-launch climb for Javelin fiction look
    if (this.ammo === "javelin") {
      this.tmpDir.y += 0.28;
      this.tmpDir.normalize();
    }
    this.lastDir.copy(this.tmpDir);

    const mesh = this.createProjectileMesh(this.ammo);
    mesh.position.copy(origin);
    scene.add(mesh);

    this.onMuzzleFlash?.(origin.clone(), this.tmpDir.clone());

    const projectile: Projectile = {
      mesh,
      velocity: this.tmpDir.clone().multiplyScalar(def.speed),
      kind: this.ammo,
      alive: true,
      age: 0,
      trailTimer: 0,
    };
    this.projectiles.push(projectile);
    return projectile;
  }

  getLastMuzzle(): THREE.Vector3 {
    return this.lastMuzzle;
  }

  getLastDir(): THREE.Vector3 {
    return this.lastDir;
  }

  updateProjectiles(dt: number, scene: THREE.Scene): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.disposeProjectile(p, scene);
        this.projectiles.splice(i, 1);
        continue;
      }
      const def = PROJECTILES[p.kind];
      p.age += dt;
      p.velocity.y -= def.gravity * dt;
      if (p.kind === "javelin" && p.age > 0.25 && p.age < 0.9) {
        p.velocity.y += 18 * dt;
      }
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
      p.mesh.rotation.z += dt * 4;

      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = 0.028;
        this.onTrail?.(p.mesh.position.clone(), p.kind);
      }

      if (p.age > 3.5 || p.mesh.position.y < -1) {
        p.alive = false;
      }
    }
  }

  clearProjectiles(scene: THREE.Scene): void {
    for (const p of this.projectiles) {
      this.disposeProjectile(p, scene);
    }
    this.projectiles.length = 0;
  }

  private createProjectileMesh(kind: ProjectileKind): THREE.Object3D {
    const def = PROJECTILES[kind];
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius * 0.55, def.radius * 0.7, def.radius * 3.2, 12),
      new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: def.trailColor,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.4,
      }),
    );
    body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(def.radius * 0.7, def.radius * 1.6, 12),
      new THREE.MeshStandardMaterial({
        color: 0xc8b090,
        emissive: def.trailColor,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.3,
      }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -def.radius * 1.9;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 1.1, 10, 10),
      new THREE.MeshBasicMaterial({
        color: def.trailColor,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    glow.position.z = def.radius * 1.4;
    group.add(glow, body, nose);
    return group;
  }

  private disposeProjectile(p: Projectile, scene: THREE.Scene): void {
    scene.remove(p.mesh);
    p.mesh.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      }
    });
  }
}
