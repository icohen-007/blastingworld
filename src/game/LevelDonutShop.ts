import * as THREE from "three";
import {
  createDestructible,
  resetDestructibleIds,
  type Destructible,
} from "./Destructible";

const COLORS = {
  floor: 0xffd6e8,
  wall: 0xfff0f6,
  trim: 0xff8fb8,
  counter: 0xffc4d8,
  wood: 0xc47a4a,
  accent: 0x3ec6ff,
  butter: 0xffe066,
  cherry: 0xff3d5a,
};

export class LevelDonutShop {
  readonly group = new THREE.Group();
  readonly destructibles: Destructible[] = [];
  private staticProps: THREE.Object3D[] = [];
  private streetMode = false;

  build(streetMode = false): void {
    this.clear();
    resetDestructibleIds();
    this.streetMode = streetMode;

    if (streetMode) {
      this.buildStreetOverlay();
      return;
    }
    this.buildInterior();
  }

  private buildStreetOverlay(): void {
    // No ground plane — keeps Street View sharp; props float in open air
  }

  private buildInterior(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 14),
      new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.staticProps.push(floor);

    // Checker tiles hint
    const tileMat = new THREE.MeshStandardMaterial({
      color: 0xffb8d4,
      roughness: 0.9,
    });
    for (let x = -3; x <= 3; x++) {
      for (let z = -2; z <= 2; z++) {
        if ((x + z) % 2 !== 0) continue;
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), tileMat);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(x * 1.05, 0.01, z * 1.05 - 1);
        tile.receiveShadow = true;
        this.group.add(tile);
        this.staticProps.push(tile);
      }
    }

    // Back + side walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: COLORS.wall,
      roughness: 0.75,
    });
    const back = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 0.3), wallMat);
    back.position.set(0, 2.5, -6);
    back.receiveShadow = true;
    this.group.add(back);
    this.staticProps.push(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 12), wallMat);
    left.position.set(-8, 2.5, -1);
    this.group.add(left);
    this.staticProps.push(left);

    const right = left.clone();
    right.position.x = 8;
    this.group.add(right);
    this.staticProps.push(right);

    // Wainscot trim
    const trimMat = new THREE.MeshStandardMaterial({ color: COLORS.trim, roughness: 0.6 });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.9, 0.2), trimMat);
    trim.position.set(0, 0.45, -5.8);
    this.group.add(trim);
    this.staticProps.push(trim);

    // Counter
    const counterMat = new THREE.MeshStandardMaterial({
      color: COLORS.counter,
      roughness: 0.55,
    });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 1.4), counterMat);
    counter.position.set(0, 0.55, -3.2);
    counter.castShadow = true;
    counter.receiveShadow = true;
    this.group.add(counter);
    this.staticProps.push(counter);

    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.12, 1.55),
      new THREE.MeshStandardMaterial({ color: 0xfffaf5, roughness: 0.35, metalness: 0.1 }),
    );
    counterTop.position.set(0, 1.16, -3.2);
    counterTop.castShadow = true;
    this.group.add(counterTop);
    this.staticProps.push(counterTop);

    // Display case glass vibe
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xa8e7ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.15,
      metalness: 0.4,
    });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 0.9), glassMat);
    glass.position.set(-2.2, 1.85, -3.3);
    this.group.add(glass);
    this.staticProps.push(glass);

    // Neon-ish shop sign (decorative, not destructible)
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.0, 0.15),
      new THREE.MeshStandardMaterial({
        color: COLORS.cherry,
        emissive: COLORS.cherry,
        emissiveIntensity: 0.25,
        roughness: 0.4,
      }),
    );
    signBoard.position.set(0, 3.6, -5.75);
    this.group.add(signBoard);
    this.staticProps.push(signBoard);

    const signAccent = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.12, 0.18),
      new THREE.MeshStandardMaterial({
        color: COLORS.butter,
        emissive: COLORS.butter,
        emissiveIntensity: 0.3,
      }),
    );
    signAccent.position.set(0, 4.15, -5.75);
    this.group.add(signAccent);
    this.staticProps.push(signAccent);

    // Ceiling lights
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff6d5,
      emissive: 0xffe066,
      emissiveIntensity: 0.6,
    });
    for (const x of [-3, 0, 3]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.15, 16), lightMat);
      lamp.position.set(x, 4.7, -2);
      this.group.add(lamp);
      this.staticProps.push(lamp);
    }

    // Corner plant (static)
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, 0.4, 10),
      new THREE.MeshStandardMaterial({ color: COLORS.wood }),
    );
    pot.position.set(6.5, 0.2, 2.5);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x4ecf7a }),
    );
    leaf.position.set(6.5, 0.7, 2.5);
    this.group.add(pot, leaf);
    this.staticProps.push(pot, leaf);
  }

  spawnWave(wave: number): void {
    for (const d of this.destructibles) {
      if (d.alive) {
        this.group.remove(d.mesh);
        d.alive = false;
      }
    }
    this.destructibles.length = 0;

    const interiorLayouts: Array<
      Array<{ kind: Destructible["kind"]; x: number; y: number; z: number; scale?: number; color?: number }>
    > = [
      [
        { kind: "box", x: -2.5, y: 1.45, z: -2.6 },
        { kind: "box", x: -1.5, y: 1.45, z: -2.6, color: 0xff3d5a },
        { kind: "box", x: 1.2, y: 1.45, z: -2.6, color: 0x3ec6ff },
        { kind: "jar", x: 2.4, y: 1.22, z: -2.55 },
        { kind: "jar", x: 3.1, y: 1.22, z: -2.55, color: 0xff8fb8 },
        { kind: "donut", x: 0, y: 1.55, z: -2.5 },
        { kind: "donut", x: 0.7, y: 1.55, z: -2.5, color: 0xff8a3d },
        { kind: "sign", x: -5.5, y: 0, z: -4, scale: 0.9 },
      ],
      [
        { kind: "shelf", x: -4.5, y: 1.2, z: -5.2 },
        { kind: "shelf", x: 4.5, y: 1.2, z: -5.2, color: 0xa86b3c },
        { kind: "box", x: -4.2, y: 2.1, z: -5.0, scale: 0.8 },
        { kind: "box", x: -3.5, y: 0.35, z: -2.0, color: 0xffe066 },
        { kind: "box", x: -3.5, y: 0.9, z: -2.0, color: 0xff3d5a },
        { kind: "box", x: 3.2, y: 0.35, z: -1.5 },
        { kind: "box", x: 3.2, y: 0.9, z: -1.5, color: 0x3ec6ff },
        { kind: "donut", x: -1, y: 1.55, z: -2.5, color: 0xff8fb8 },
        { kind: "donut", x: 0, y: 1.55, z: -2.5, color: 0xffe066 },
        { kind: "donut", x: 1, y: 1.55, z: -2.5, color: 0x3ec6ff },
        { kind: "jar", x: 2, y: 1.22, z: -2.55 },
        { kind: "sign", x: 5.8, y: 0, z: -3.5, color: 0x3ec6ff },
      ],
      [
        { kind: "shelf", x: -5, y: 1.2, z: -5.1 },
        { kind: "shelf", x: 0, y: 1.2, z: -5.1, color: 0xb86b45 },
        { kind: "shelf", x: 5, y: 1.2, z: -5.1 },
        { kind: "box", x: -2, y: 0.35, z: -0.5, scale: 1.1 },
        { kind: "box", x: -2, y: 0.95, z: -0.5, color: 0xff3d5a },
        { kind: "box", x: 2.5, y: 0.35, z: 0.2, color: 0xffe066 },
        { kind: "box", x: 2.5, y: 0.95, z: 0.2, color: 0xff8a3d },
        { kind: "box", x: 2.5, y: 1.55, z: 0.2, color: 0x3ec6ff },
        { kind: "donut", x: -1.2, y: 1.55, z: -2.4, scale: 1.15 },
        { kind: "donut", x: 0, y: 1.55, z: -2.4, color: 0xff3d5a, scale: 1.15 },
        { kind: "donut", x: 1.2, y: 1.55, z: -2.4, color: 0xffe066, scale: 1.15 },
        { kind: "jar", x: -3.5, y: 1.22, z: -2.5, color: 0xff8fb8 },
        { kind: "jar", x: 3.5, y: 1.22, z: -2.5 },
        { kind: "sign", x: -6.2, y: 0, z: -2, color: 0xffe066 },
        { kind: "sign", x: 6.2, y: 0, z: -2, color: 0xff3d5a },
      ],
    ];

    // Street overlay — props float in front of the storefront you're pointing at
    const streetLayouts: typeof interiorLayouts = [
      [
        { kind: "box", x: -2.2, y: 1.2, z: -4.5 },
        { kind: "box", x: -0.8, y: 1.5, z: -4.2, color: 0xff3d5a },
        { kind: "box", x: 1.4, y: 1.1, z: -4.6, color: 0x3ec6ff },
        { kind: "donut", x: 0.2, y: 2.0, z: -3.8, scale: 1.2 },
        { kind: "donut", x: 2.4, y: 1.8, z: -4.0, color: 0xffe066 },
        { kind: "jar", x: -3.0, y: 0.9, z: -3.6, color: 0xff8fb8 },
        { kind: "sign", x: 3.2, y: 0.2, z: -5.0, scale: 0.85 },
      ],
      [
        { kind: "shelf", x: -3.5, y: 1.4, z: -5.5 },
        { kind: "shelf", x: 3.2, y: 1.3, z: -5.2, color: 0xa86b3c },
        { kind: "box", x: -1.5, y: 0.8, z: -3.5, color: 0xffe066 },
        { kind: "box", x: -1.5, y: 1.4, z: -3.5, color: 0xff3d5a },
        { kind: "box", x: 1.8, y: 1.0, z: -3.8 },
        { kind: "donut", x: 0, y: 2.2, z: -4.0, color: 0xff8fb8, scale: 1.25 },
        { kind: "donut", x: 0.9, y: 1.9, z: -3.6, color: 0x3ec6ff },
        { kind: "jar", x: 2.6, y: 1.0, z: -3.4 },
        { kind: "sign", x: -4.2, y: 0.15, z: -4.8, color: 0xffe066 },
      ],
      [
        { kind: "shelf", x: -4, y: 1.5, z: -5.8 },
        { kind: "shelf", x: 0, y: 1.6, z: -6.0, color: 0xb86b45 },
        { kind: "shelf", x: 4, y: 1.4, z: -5.6 },
        { kind: "box", x: -2.2, y: 0.7, z: -3.2, scale: 1.1 },
        { kind: "box", x: -2.2, y: 1.3, z: -3.2, color: 0xff3d5a },
        { kind: "box", x: 2.0, y: 0.8, z: -3.0, color: 0xffe066 },
        { kind: "box", x: 2.0, y: 1.4, z: -3.0, color: 0xff8a3d },
        { kind: "donut", x: -0.6, y: 2.3, z: -3.5, scale: 1.3 },
        { kind: "donut", x: 0.6, y: 2.1, z: -3.4, color: 0xff3d5a, scale: 1.3 },
        { kind: "jar", x: 3.4, y: 1.1, z: -3.8, color: 0xff8fb8 },
        { kind: "sign", x: -3.8, y: 0.1, z: -4.2, color: 0x3ec6ff },
        { kind: "sign", x: 3.8, y: 0.1, z: -4.2, color: 0xff3d5a },
      ],
    ];

    const layouts = this.streetMode ? streetLayouts : interiorLayouts;
    const index = Math.max(0, Math.min(layouts.length - 1, wave - 1));
    for (const item of layouts[index]) {
      const d = createDestructible(item.kind, new THREE.Vector3(item.x, item.y, item.z), {
        scale: item.scale,
        color: item.color,
      });
      d.mesh.userData.bobPhase = Math.random() * Math.PI * 2;
      d.mesh.userData.baseY = item.y;
      this.group.add(d.mesh);
      this.destructibles.push(d);
    }
  }

  aliveCount(): number {
    return this.destructibles.filter((d) => d.alive).length;
  }

  updateIdle(time: number): void {
    for (const d of this.destructibles) {
      if (!d.alive) continue;
      if (d.kind === "donut") {
        const phase = (d.mesh.userData.bobPhase as number) ?? 0;
        const baseY = (d.mesh.userData.baseY as number) ?? d.mesh.position.y;
        d.mesh.rotation.y = time * 0.8 + phase;
        d.mesh.position.y = baseY + Math.sin(time * 2 + phase) * 0.08;
      }
    }
  }

  clear(): void {
    for (const d of this.destructibles) {
      this.group.remove(d.mesh);
    }
    this.destructibles.length = 0;
    for (const p of this.staticProps) {
      this.group.remove(p);
      p.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
    }
    this.staticProps = [];
    while (this.group.children.length) {
      this.group.remove(this.group.children[0]);
    }
  }
}
