import * as THREE from "three";

type VfxKind = "ember" | "smoke" | "spark" | "flash" | "shell" | "star";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
  kind: VfxKind;
  drag: number;
  grow: number;
  gravity: number;
}

interface DebrisPiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
  life: number;
}

interface FlashLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peak: number;
}

const FIRE = [0xfff5c0, 0xffe066, 0xff8a3d, 0xff3d5a, 0xff2200, 0xff6a00];
const SMOKE = [0x4a4a55, 0x6a6a75, 0x2e2e38, 0x8a8a95];
const SPARK = [0xffffff, 0xffe066, 0xff8a3d, 0xffcc66];
const FIREWORK = [0xff3d5a, 0x3ec6ff, 0xffe066, 0xff8fb8, 0x7dffb3, 0xff8a3d, 0xffffff, 0xb388ff];

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private debris: DebrisPiece[] = [];
  private flashes: FlashLight[] = [];
  private shakeTime = 0;
  private shakeMag = 0;
  private camera: THREE.PerspectiveCamera;
  private baseCamPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.baseCamPos.copy(camera.position);
  }

  setBaseCamera(pos: THREE.Vector3): void {
    this.baseCamPos.copy(pos);
  }

  shake(magnitude = 0.18, duration = 0.28): void {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  /** Legacy API — routes to fire blast or confetti/fireworks. */
  burst(
    position: THREE.Vector3,
    color: number,
    count = 18,
    confetti = false,
  ): void {
    if (confetti) {
      this.fireworks(position, count);
    } else {
      this.fireBlast(position, count);
      // tint a few core sparks with target color
      this.spawnCloud(position, [color, 0xff8a3d], Math.floor(count * 0.25), "ember", {
        speed: 7,
        life: 0.45,
        size: 0.12,
        gravity: -2,
      });
    }
  }

  /** Bazooka hit — fireball + smoke + sparks + muzzle flash light. */
  fireBlast(position: THREE.Vector3, intensity = 22): void {
    this.launcherImpact(position, intensity, 1);
  }

  /** Full cinematic tube launch: muzzle spit + backblast smoke. */
  launcherMuzzle(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    smokeDensity = 1,
  ): void {
    const dir = direction.clone().normalize();
    const back = dir.clone().multiplyScalar(-1);

    // Forward muzzle fire
    this.spawnCloud(position, FIRE, Math.floor(14 * smokeDensity), "ember", {
      speed: 7,
      up: 1.2,
      life: 0.28,
      size: 0.12,
      gravity: -1,
      bias: dir.clone().multiplyScalar(5),
    });
    this.spawnCloud(position, SPARK, Math.floor(12 * smokeDensity), "spark", {
      speed: 12,
      up: 0.6,
      life: 0.22,
      size: 0.045,
      gravity: 8,
      bias: dir.clone().multiplyScalar(9),
    });

    // Rear backblast — grey/black smoke cone
    const rear = position.clone().addScaledVector(back, 0.35);
    this.spawnCloud(rear, SMOKE, Math.floor(18 * smokeDensity), "smoke", {
      speed: 5,
      up: 2.5,
      life: 1.8,
      size: 0.42,
      gravity: -2.5,
      drag: 1.6,
      grow: 2.4,
      bias: back.clone().multiplyScalar(4),
    });
    this.spawnCloud(rear, [0x8a8a95, 0xc8c8d0, 0x4a4a55], Math.floor(10 * smokeDensity), "smoke", {
      speed: 3.5,
      up: 4,
      life: 2.2,
      size: 0.5,
      gravity: -2,
      drag: 1.8,
      grow: 2.8,
      bias: back.clone().multiplyScalar(2.5),
    });

    this.addFlashLight(position, 0xffe066, 5.5, 0.14);
    this.shake(0.14, 0.16);
  }

  /** Impact on target — fire + heavy smoke + debris (scaled by launcher). */
  launcherImpact(
    position: THREE.Vector3,
    intensity = 36,
    smokeDensity = 1.2,
  ): void {
    this.spawnOne(
      position,
      0xfff5c0,
      "flash",
      new THREE.Vector3(0, 0.2, 0),
      0.2,
      0.2,
      0.65,
      3.2,
      0,
    );

    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.35 + i * 0.18, 14, 14),
        new THREE.MeshBasicMaterial({
          color: FIRE[Math.min(i + 1, FIRE.length - 1)],
          transparent: true,
          opacity: 0.58 - i * 0.1,
          depthWrite: false,
        }),
      );
      shell.position.copy(position);
      this.group.add(shell);
      this.particles.push({
        mesh: shell,
        velocity: new THREE.Vector3(0, 0.45, 0),
        life: 0.3 + i * 0.09,
        maxLife: 0.3 + i * 0.09,
        spin: new THREE.Vector3(0, 4, 0),
        kind: "shell",
        drag: 0.5,
        grow: 7 + i * 2.2,
        gravity: 0,
      });
    }

    this.spawnCloud(position, FIRE, intensity, "ember", {
      speed: 10,
      up: 9,
      life: 0.85,
      size: 0.2,
      gravity: -4,
      drag: 1.6,
    });

    this.spawnCloud(position, SPARK, Math.floor(intensity * 0.85), "spark", {
      speed: 18,
      up: 7,
      life: 0.65,
      size: 0.055,
      gravity: 14,
      drag: 0.55,
    });

    // Thick rolling smoke column
    this.spawnCloud(position, SMOKE, Math.floor(intensity * 0.75 * smokeDensity), "smoke", {
      speed: 4.5,
      up: 6,
      life: 2.1,
      size: 0.42,
      gravity: -3.2,
      drag: 1.9,
      grow: 2.4,
    });
    this.spawnCloud(
      position.clone().add(new THREE.Vector3(0, 0.6, 0)),
      [0x6a6a75, 0x9a9aa8, 0x3a3a42],
      Math.floor(intensity * 0.45 * smokeDensity),
      "smoke",
      {
        speed: 3,
        up: 5,
        life: 2.6,
        size: 0.55,
        gravity: -2.4,
        drag: 2,
        grow: 3,
      },
    );

    this.spawnDebris(position, 0x3a3a42, Math.floor(10 + intensity * 0.15));
    this.addFlashLight(position, 0xff8a3d, 9, 0.42);
    this.shake(0.4, 0.55);
  }

  /** Muzzle spit when bazooka fires. */
  muzzleFlash(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.launcherMuzzle(position, direction, 1);
  }

  /** C4 / fireworks — delayed bursts of colored stars. */
  fireworks(position: THREE.Vector3, count = 40): void {
    // Initial C4 pop
    this.fireBlast(position.clone().add(new THREE.Vector3(0, 0.2, 0)), 14);
    this.addFlashLight(position, 0xffffff, 10, 0.25);

    // Primary star burst
    this.spawnRadialStars(position, FIREWORK, count, 14, 0.9);

    // Secondary delayed rings (staggered via short/long life starts at origin with delay simulated by low initial speed then...)
    // Simulate delay by spawning elevated secondary bursts with upward bias
    const up = position.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.spawnRadialStars(up, [0x3ec6ff, 0xffe066, 0xff3d5a, 0xffffff], Math.floor(count * 0.6), 11, 0.75);

    const up2 = position.clone().add(new THREE.Vector3(0.4, 2.1, -0.3));
    this.spawnRadialStars(up2, [0xb388ff, 0x7dffb3, 0xff8fb8, 0xffe066], Math.floor(count * 0.45), 9, 0.65);

    // Golden trails falling
    this.spawnCloud(up, [0xffe066, 0xff8a3d, 0xffffff], 18, "spark", {
      speed: 3,
      up: -1,
      life: 1.4,
      size: 0.06,
      gravity: 6,
      drag: 0.4,
    });

    this.shake(0.4, 0.55);
  }

  /** Dedicated C4 charge detonation (bigger + multi-stage fireworks). */
  c4Detonation(position: THREE.Vector3): void {
    this.fireBlast(position, 28);
    this.fireworks(position, 55);
    this.spawnDebris(position, 0x3a3a42, 14);
    this.addFlashLight(position, 0xfff5c0, 14, 0.45);
    this.shake(0.48, 0.65);
  }

  spawnDebris(position: THREE.Vector3, color: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const size = 0.12 + Math.random() * 0.28;
      const geo = new THREE.BoxGeometry(size, size * 0.6, size * 0.8);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.05,
        emissive: color,
        emissiveIntensity: 0.15,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.castShadow = true;
      this.group.add(mesh);

      this.debris.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          5 + Math.random() * 9,
          (Math.random() - 0.5) * 12,
        ),
        angular: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
        ),
        life: 1.2 + Math.random() * 0.7,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= p.gravity * dt;
      p.velocity.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;

      const t = Math.max(0, p.life / p.maxLife);
      const mat = p.mesh.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

      if (p.kind === "shell" || p.kind === "flash") {
        const s = 1 + (1 - t) * p.grow;
        p.mesh.scale.setScalar(s);
        if ("opacity" in mat) mat.opacity = t * 0.7;
      } else if (p.kind === "smoke") {
        p.mesh.scale.setScalar((0.6 + (1 - t) * p.grow) * (0.8 + Math.random() * 0.05));
        if ("opacity" in mat) mat.opacity = t * 0.45;
      } else if (p.kind === "ember") {
        p.mesh.scale.setScalar(0.35 + t * 1.1);
        if ("opacity" in mat) mat.opacity = 0.3 + t * 0.7;
      } else if (p.kind === "star") {
        p.mesh.scale.setScalar(0.4 + t * 1.2);
        if ("opacity" in mat) mat.opacity = t;
      } else {
        p.mesh.scale.setScalar(0.3 + t * 0.9);
      }

      if (p.life <= 0) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.velocity.y -= 18 * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);
      d.mesh.rotation.x += d.angular.x * dt;
      d.mesh.rotation.y += d.angular.y * dt;
      d.mesh.rotation.z += d.angular.z * dt;
      if (d.mesh.position.y < 0.05) {
        d.mesh.position.y = 0.05;
        d.velocity.y *= -0.35;
        d.velocity.x *= 0.7;
        d.velocity.z *= 0.7;
      }
      if (d.life <= 0) {
        this.group.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.debris.splice(i, 1);
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = Math.max(0, f.life / f.maxLife);
      f.light.intensity = f.peak * t * t;
      if (f.life <= 0) {
        this.group.remove(f.light);
        this.flashes.splice(i, 1);
      }
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const damp = Math.max(0, this.shakeTime);
      const m = this.shakeMag * damp;
      this.tmp.set(
        this.baseCamPos.x + (Math.random() - 0.5) * m * 2,
        this.baseCamPos.y + (Math.random() - 0.5) * m * 1.2,
        this.baseCamPos.z + (Math.random() - 0.5) * m * 2,
      );
      this.camera.position.copy(this.tmp);
      if (this.shakeTime <= 0) {
        this.camera.position.copy(this.baseCamPos);
        this.shakeMag = 0;
      }
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    for (const d of this.debris) {
      this.group.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    for (const f of this.flashes) {
      this.group.remove(f.light);
    }
    this.particles = [];
    this.debris = [];
    this.flashes = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.camera.position.copy(this.baseCamPos);
  }

  private addFlashLight(position: THREE.Vector3, color: number, peak: number, duration: number): void {
    const light = new THREE.PointLight(color, peak, 18, 2);
    light.position.copy(position);
    light.position.y += 0.4;
    this.group.add(light);
    this.flashes.push({ light, life: duration, maxLife: duration, peak });
  }

  private spawnRadialStars(
    position: THREE.Vector3,
    colors: number[],
    count: number,
    speed: number,
    life: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      );
      const color = colors[i % colors.length];
      const size = 0.06 + Math.random() * 0.1;
      this.spawnOne(
        position,
        color,
        "star",
        dir.multiplyScalar(speed * (0.6 + Math.random() * 0.6)),
        life * (0.7 + Math.random() * 0.5),
        life,
        size,
        0.4,
        5 + Math.random() * 4,
      );
    }
  }

  private spawnCloud(
    position: THREE.Vector3,
    colors: number[],
    count: number,
    kind: VfxKind,
    opts: {
      speed: number;
      up?: number;
      life: number;
      size: number;
      gravity: number;
      drag?: number;
      grow?: number;
      bias?: THREE.Vector3;
    },
  ): void {
    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * opts.speed,
        (opts.up ?? 3) * (0.4 + Math.random()),
        (Math.random() - 0.5) * opts.speed,
      );
      if (opts.bias) velocity.add(opts.bias);
      const life = opts.life * (0.55 + Math.random() * 0.55);
      this.spawnOne(
        position,
        colors[i % colors.length],
        kind,
        velocity,
        life,
        life,
        opts.size * (0.7 + Math.random() * 0.6),
        opts.grow ?? 1,
        opts.gravity,
        opts.drag ?? 1.2,
      );
    }
  }

  private spawnOne(
    position: THREE.Vector3,
    color: number,
    kind: VfxKind,
    velocity: THREE.Vector3,
    life: number,
    maxLife: number,
    size: number,
    grow: number,
    gravity: number,
    drag = 1.2,
  ): void {
    let geo: THREE.BufferGeometry;
    if (kind === "smoke" || kind === "flash" || kind === "shell") {
      geo = new THREE.SphereGeometry(size, 10, 10);
    } else if (kind === "star") {
      geo = new THREE.OctahedronGeometry(size, 0);
    } else if (kind === "spark") {
      geo = new THREE.SphereGeometry(size, 6, 6);
    } else {
      geo = new THREE.SphereGeometry(size, 8, 8);
    }

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: kind === "smoke" ? 0.4 : 0.95,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.x += (Math.random() - 0.5) * 0.15;
    mesh.position.y += (Math.random() - 0.5) * 0.15;
    mesh.position.z += (Math.random() - 0.5) * 0.15;
    this.group.add(mesh);

    this.particles.push({
      mesh,
      velocity,
      life,
      maxLife,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      ),
      kind,
      drag,
      grow,
      gravity,
    });
  }
}
