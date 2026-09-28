import * as THREE from "three";

export type DestructibleKind = "box" | "donut" | "shelf" | "sign" | "jar";

export interface Destructible {
  id: number;
  mesh: THREE.Object3D;
  kind: DestructibleKind;
  hp: number;
  points: number;
  coins: number;
  color: number;
  alive: boolean;
  /** World-space radius for sphere hit tests */
  radius: number;
}

let nextId = 1;

export function resetDestructibleIds(): void {
  nextId = 1;
}

function makeBoxMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.04,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.28,
  });
}

export function createDestructible(
  kind: DestructibleKind,
  position: THREE.Vector3,
  extras?: { scale?: number; color?: number },
): Destructible {
  const scale = extras?.scale ?? 1;
  let mesh: THREE.Object3D;
  let color: number;
  let radius: number;
  let points: number;
  let coins: number;
  let hp = 1;

  switch (kind) {
    case "donut": {
      color = extras?.color ?? 0xff8fb8;
      const group = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(0.35 * scale, 0.16 * scale, 16, 32),
        makeBoxMat(color),
      );
      const icing = new THREE.Mesh(
        new THREE.TorusGeometry(0.35 * scale, 0.08 * scale, 12, 24),
        makeBoxMat(0xffe066),
      );
      icing.position.y = 0.06 * scale;
      torus.rotation.x = Math.PI / 2;
      icing.rotation.x = Math.PI / 2;
      group.add(torus, icing);
      mesh = group;
      radius = 0.45 * scale;
      points = 120;
      coins = 6;
      break;
    }
    case "shelf": {
      color = extras?.color ?? 0xc47a4a;
      const group = new THREE.Group();
      const wood = makeBoxMat(color);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 1.4 * scale, 0.35 * scale), wood);
      const plank1 = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 0.08 * scale, 0.32 * scale), wood);
      const plank2 = plank1.clone();
      plank1.position.y = 0.2 * scale;
      plank2.position.y = -0.25 * scale;
      group.add(frame, plank1, plank2);
      mesh = group;
      radius = 0.95 * scale;
      points = 200;
      coins = 10;
      hp = 2;
      break;
    }
    case "sign": {
      color = extras?.color ?? 0xff3d5a;
      const group = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.2 * scale, 0.7 * scale, 0.12 * scale),
        makeBoxMat(color),
      );
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 1.1 * scale, 8),
        makeBoxMat(0x5c4033),
      );
      board.position.y = 0.85 * scale;
      pole.position.y = 0.35 * scale;
      group.add(board, pole);
      mesh = group;
      radius = 0.7 * scale;
      points = 150;
      coins = 8;
      break;
    }
    case "jar": {
      color = extras?.color ?? 0x3ec6ff;
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * scale, 0.25 * scale, 0.55 * scale, 16),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.2,
          metalness: 0.15,
          transparent: true,
          opacity: 0.9,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.2,
        }),
      );
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 * scale, 0.24 * scale, 0.08 * scale, 16),
        makeBoxMat(0xffe066),
      );
      lid.position.y = 0.3 * scale;
      body.position.y = 0.28 * scale;
      group.add(body, lid);
      mesh = group;
      radius = 0.35 * scale;
      points = 80;
      coins = 4;
      break;
    }
    case "box":
    default: {
      color = extras?.color ?? 0xff8a3d;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7 * scale, 0.55 * scale, 0.55 * scale),
        makeBoxMat(color),
      );
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.72 * scale, 0.1 * scale, 0.56 * scale),
        makeBoxMat(0xffe066),
      );
      stripe.position.y = 0.05;
      const group = new THREE.Group();
      group.add(box, stripe);
      mesh = group;
      radius = 0.5 * scale;
      points = 100;
      coins = 5;
      break;
    }
  }

  mesh.position.copy(position);
  mesh.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  return {
    id: nextId++,
    mesh,
    kind,
    hp,
    points,
    coins,
    color,
    alive: true,
    radius,
  };
}

export function getWorldCenter(d: Destructible, out: THREE.Vector3): THREE.Vector3 {
  return out.setFromMatrixPosition(d.mesh.matrixWorld);
}
