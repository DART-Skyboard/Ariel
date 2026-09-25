import { memo, useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  PALETTE,
  categoryOf,
  cubeSpan,
  EXPLODE_GAP,
  gridToWorld,
  type CubeModel,
  type PathNode,
  type WallInstance,
  type WallKey,
} from "@/lib/cube-model";

export type FocusRequest = { id: string; x: number; y: number; z: number; age: number };

export type CubeView = {
  explode: number;
  floor: number;
  shell: boolean;
  maze: boolean;
  tunnel: boolean;
  path: boolean;
  lights: number;
};

export type NestCube = {
  id: string;
  name: string;
  model: CubeModel;
  slot?: { stack: number; x: number; y: number; z: number; nx: number; ny: number; nz: number };
};

const FACE: Record<WallKey, { nx: number; ny: number; nz: number; axis: "x" | "y" | "z" }> = {
  left: { nx: -0.5, ny: 0, nz: 0, axis: "x" },
  right: { nx: 0.5, ny: 0, nz: 0, axis: "x" },
  bottom: { nx: 0, ny: -0.5, nz: 0, axis: "y" },
  top: { nx: 0, ny: 0.5, nz: 0, axis: "y" },
  back: { nx: 0, ny: 0, nz: -0.5, axis: "z" },
  front: { nx: 0, ny: 0, nz: 0.5, axis: "z" },
};

const NEST = 0.01;
const dummy = new THREE.Object3D();
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const tint = new THREE.Color();
const turnA = new THREE.Color(PALETTE.verdigris);
const turnB = new THREE.Color(PALETTE.brass);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const PANE_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vec4 mv = viewMatrix * world;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const PANE_FRAG = /* glsl */ `
  uniform vec3 base;
  uniform vec3 rim;
  uniform float alpha;
  uniform float power;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float fres = pow(1.0 - abs(dot(N, V)), power);
    vec3 moon = normalize(vec3(-0.4, 0.92, 0.2));
    float spec = pow(max(dot(reflect(-moon, N), V), 0.0), 42.0);
    vec3 warm = normalize(vec3(0.7, 0.15, 0.65));
    float spec2 = pow(max(dot(reflect(-warm, N), V), 0.0), 16.0);
    vec3 col = base * 0.55;
    col += rim * fres * fres * 0.9;
    col += vec3(0.62, 0.8, 0.95) * spec * 0.55;
    col += rim * spec2 * 0.18;
    gl_FragColor = vec4(col, clamp(alpha + fres * fres * 0.62, 0.02, 0.82));
  }
`;

const GLOW_VERT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vec3 transformed = position;
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(position, 1.0)).xyz;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  varying vec3 vColor;
  uniform float gain;
  void main() {
    gl_FragColor = vec4(vColor * gain, 1.0);
  }
`;

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */ `
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float along = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.35);
    float radial = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.7);
    gl_FragColor = vec4(color, along * radial * 0.28);
  }
`;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(1.05, 0.9);
      float vig = smoothstep(0.92, 0.28, dot(uv, uv));
      vec3 rgb = c.rgb * mix(0.62, 1.0, vig);
      gl_FragColor = vec4(rgb, c.a);
    }
  `,
};

type Rig = {
  id: string;
  model: CubeModel;
  group: THREE.Group;
  ghost: THREE.Mesh;
  pick: THREE.Mesh;
  pathLine: THREE.Line;
  traveler: THREE.Mesh;
  halo: THREE.Mesh;
  detail: THREE.Group | null;
  quiet: THREE.InstancedMesh | null;
  shell: THREE.InstancedMesh | null;
  tunnel: THREE.InstancedMesh | null;
  pathMesh: THREE.InstancedMesh | null;
  markerMesh: THREE.InstancedMesh | null;
  markers: { index: number; node: PathNode }[];
  enter: THREE.Group | null;
  leave: THREE.Group | null;
  travelerMat: THREE.MeshStandardMaterial;
  haloMat: THREE.MeshBasicMaterial;
  flareMat: THREE.SpriteMaterial;
  slot?: NestCube["slot"];
};

function wallCount(model: CubeModel): number {
  return model.walls.quiet.length + model.walls.shell.length + model.walls.corridor.length;
}

function ySpan(model: CubeModel, explode: number): number {
  return Math.max(1, model.height - 1) * (1 + explode * EXPLODE_GAP) + 1;
}

function wallOnFloor(wall: WallInstance, floor: number): boolean {
  if (floor < 0) return true;
  if (wall.y === floor) return true;
  return wall.face === "top" && wall.y === floor - 1;
}

function placeWalls(mesh: THREE.InstancedMesh, walls: WallInstance[], model: CubeModel, explode: number, floor: number) {
  for (let i = 0; i < walls.length; i += 1) {
    const wall = walls[i];
    const face = FACE[wall.face];
    const [cx, cy, cz] = gridToWorld(wall.x, wall.y, wall.z, explode, model);
    const hidden = !wallOnFloor(wall, floor);
    dummy.position.set(cx + face.nx, cy + face.ny, cz + face.nz);
    dummy.quaternion.identity();
    if (hidden) dummy.scale.set(0, 0, 0);
    else if (face.axis === "x") dummy.scale.set(0.04, 0.9, 0.9);
    else if (face.axis === "y") dummy.scale.set(0.9, 0.04, 0.9);
    else dummy.scale.set(0.9, 0.9, 0.04);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function paneMaterial(base: string, rim: string, alpha: number, power: number, simple = false) {
  if (simple) {
    const color = new THREE.Color(rim);
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(0.62, 0.16 + alpha * 3),
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      base: { value: new THREE.Color(base) },
      rim: { value: new THREE.Color(rim) },
      alpha: { value: alpha },
      power: { value: power },
    },
    vertexShader: PANE_VERT,
    fragmentShader: PANE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
}

function makeWalls(walls: WallInstance[], material: THREE.Material) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, walls.length));
  mesh.count = walls.length;
  mesh.frustumCulled = false;
  mesh.raycast = () => undefined;
  return mesh;
}

function glowMaterial(gain: number, simple = false) {
  if (simple) {
    return new THREE.MeshBasicMaterial({ color: "#d7fff4", toneMapped: false, fog: false });
  }
  return new THREE.ShaderMaterial({
    uniforms: { gain: { value: gain } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    toneMapped: true,
  });
}

function shaft(color: string) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 1.8, 9.5, 24, 1, true),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  mesh.position.y = 3.4;
  mesh.frustumCulled = false;
  mesh.raycast = () => undefined;
  return mesh;
}

function categoryHex(node: PathNode): string {
  const kind = categoryOf(node.events[0]);
  if (kind === "tool") return PALETTE.brass;
  if (kind === "emotion") return PALETTE.coral;
  if (kind === "stage") return PALETTE.verdigris;
  return PALETTE.mist;
}

function viewKey(view: CubeView): string {
  return `${view.explode}|${view.floor}|${view.shell ? 1 : 0}|${view.maze ? 1 : 0}|${view.tunnel ? 1 : 0}|${view.path ? 1 : 0}`;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const material = mesh.material;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of list) {
      if (!item.userData.shared) item.dispose();
    }
  });
}

export const CubeCanvas = memo(function CubeCanvas({
  cubes,
  selectedId,
  selectedIds,
  view,
  stepsRef,
  playingRef,
  masterRef,
  rangeRef,
  onHud,
  onPick,
  onSelect,
  focusRef,
  autoRotate,
  onInteract,
  resetToken,
  onReady,
  onGpuLost,
}: {
  cubes: NestCube[];
  selectedId: string;
  selectedIds: string[];
  view: CubeView;
  stepsRef: MutableRefObject<Record<string, number>>;
  playingRef: MutableRefObject<boolean>;
  masterRef: MutableRefObject<boolean>;
  rangeRef: MutableRefObject<{ from: number; to: number }>;
  onHud: (step: number) => void;
  onPick: (id: string, index: number) => void;
  onSelect: (id: string) => void;
  focusRef: MutableRefObject<FocusRequest | null>;
  autoRotate: boolean;
  onInteract: () => void;
  resetToken: number;
  onReady?: () => void;
  onGpuLost?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({
    cubes,
    selectedId,
    selectedIds,
    view,
    onHud,
    onPick,
    onSelect,
    autoRotate,
    onInteract,
    resetToken,
    onReady,
    onGpuLost,
  });
  live.current = {
    cubes,
    selectedId,
    selectedIds,
    view,
    onHud,
    onPick,
    onSelect,
    autoRotate,
    onInteract,
    resetToken,
    onReady,
    onGpuLost,
  };

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const tightGpu =
      /Android/i.test(navigator.userAgent) ||
      ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
    const touchGpu =
      tightGpu ||
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      window.matchMedia("(pointer: coarse)").matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: touchGpu ? "default" : "high-performance",
      alpha: false,
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#02060a", 1);
    if (touchGpu) renderer.debug.checkShaderErrors = false;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.opacity = "0";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#02060a");
    const fog = new THREE.FogExp2("#02060a", 0.012);
    scene.fog = fog;
    const hemi = new THREE.HemisphereLight(0xd7fff6, 0x24180c, 0);
    const ambient = new THREE.AmbientLight(0xb7d5dc, 0);
    const sun = new THREE.DirectionalLight(0xfff1d6, 0);
    sun.position.set(4, 22, 6);
    scene.add(hemi, ambient, sun);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 800);
    camera.position.set(11.4 * NEST, 6.2 * NEST, 13.6 * NEST);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 0.04;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.target.set(0, -0.004, 0);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.userData.shared = true;
    const ghostMat = new THREE.MeshBasicMaterial({
      color: "#8ef3e0",
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    ghostMat.userData.shared = true;
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    pickMat.userData.shared = true;
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    lineMat.userData.shared = true;

    const lampPos = Array.from({ length: 8 }, () => new THREE.Vector2());
    const lampGain = new Float32Array(8);
    let floorShader: THREE.ShaderMaterial | null = null;
    let floorMat: THREE.MeshBasicMaterial | null = null;
    if (tightGpu) {
      floorMat = new THREE.MeshBasicMaterial({ color: "#07110f", transparent: true, opacity: 0.94, depthWrite: false });
      const plain = new THREE.Mesh(new THREE.CircleGeometry(220, 24), floorMat);
      plain.rotation.x = -Math.PI / 2;
      plain.position.y = -0.1;
      scene.add(plain);
    } else {
      floorShader = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          lamps: { value: lampPos },
          gain: { value: lampGain },
          reach: { value: 6 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec2 lamps[8];
          uniform float gain[8];
          uniform float reach;
          varying vec2 vUv;
          varying vec3 vWorld;
          vec3 lamp(vec3 col, vec2 at, float g) {
            vec2 d = vWorld.xz - at;
            float e = exp(-dot(d, d) / max(reach * reach, 0.04)) * g;
            col += vec3(0.09, 0.28, 0.22) * e;
            col += vec3(0.28, 0.14, 0.05) * e * e;
            return min(col, vec3(0.34, 0.46, 0.42));
          }
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float disk = smoothstep(1.0, 0.12, length(p));
            vec3 col = vec3(0.018, 0.028, 0.034);
            col = lamp(col, lamps[0], gain[0]);
            col = lamp(col, lamps[1], gain[1]);
            col = lamp(col, lamps[2], gain[2]);
            col = lamp(col, lamps[3], gain[3]);
            col = lamp(col, lamps[4], gain[4]);
            col = lamp(col, lamps[5], gain[5]);
            col = lamp(col, lamps[6], gain[6]);
            col = lamp(col, lamps[7], gain[7]);
            gl_FragColor = vec4(col, disk * 0.96);
          }
        `,
      });
      const floor = new THREE.Mesh(new THREE.CircleGeometry(220, 72), floorShader);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.1;
      scene.add(floor);
    }
    const cell = NEST;
    const minor = new THREE.GridHelper(cell * 80, 80, 0x1f6f62, 0x12332e);
    const major = new THREE.GridHelper(cell * 1200, 30, 0x2a9a86, 0x143832);
    for (const grid of [minor, major]) {
      grid.position.y = -0.099;
      const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
      for (const mat of mats) {
        mat.transparent = true;
        mat.opacity = grid === major ? 0.42 : 0.4;
        mat.fog = true;
        mat.toneMapped = true;
        mat.depthWrite = false;
      }
      scene.add(grid);
    }

    const spots: THREE.SpotLight[] = [];
    const spotCount = touchGpu ? 0 : 4;
    for (let i = 0; i < spotCount; i += 1) {
      const spot = new THREE.SpotLight("#d7fff4", 0, 40, 1.05, 0.9, 1);
      const target = new THREE.Object3D();
      spot.target = target;
      spot.castShadow = false;
      scene.add(spot, target);
      spots.push(spot);
    }

    const edgeGeo = new THREE.BufferGeometry();
    {
      const s = 0.5;
      const corners: [number, number, number][] = [
        [-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s],
        [-s, s, -s], [s, s, -s], [s, s, s], [-s, s, s],
      ];
      const pairs = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      const pos = new Float32Array(pairs.length * 6);
      let cursor = 0;
      for (const [a, b] of pairs) {
        pos[cursor++] = corners[a][0];
        pos[cursor++] = corners[a][1];
        pos[cursor++] = corners[a][2];
        pos[cursor++] = corners[b][0];
        pos[cursor++] = corners[b][1];
        pos[cursor++] = corners[b][2];
      }
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    }
    edgeGeo.userData.shared = true;
    const outlineMat = new THREE.LineBasicMaterial({
      color: PALETTE.brass,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      fog: false,
    });
    outlineMat.userData.shared = true;
    const outlines: THREE.LineSegments[] = [];
    const placeOutlines = (marked: Rig[]) => {
      while (outlines.length < marked.length) {
        const line = new THREE.LineSegments(edgeGeo, outlineMat);
        line.frustumCulled = false;
        line.raycast = () => undefined;
        scene.add(line);
        outlines.push(line);
      }
      outlines.forEach((line, index) => {
        const rig = marked[index];
        if (!rig) {
          line.visible = false;
          return;
        }
        const span = ySpan(rig.model, live.current.view.explode);
        line.visible = true;
        line.position.copy(rig.group.position);
        line.scale.set((rig.model.width + 0.7) * NEST, (span + 0.55) * NEST, (rig.model.depth + 0.7) * NEST);
      });
    };

    const composer = touchGpu
      ? null
      : new EffectComposer(
          renderer,
          new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }),
        );
    const bloom = composer ? new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.62, 0.78) : null;
    if (composer && bloom) {
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer.addPass(new ShaderPass(VignetteShader));
    }
    const rebuildTargets = () => {
      const rect = el.getBoundingClientRect();
      let w = Math.max(1, Math.round(rect.width || el.clientWidth || 1));
      let h = Math.max(1, Math.round(rect.height || el.clientHeight || 1));
      if (tightGpu || touchGpu) {
        const cap = tightGpu ? 1280 : 1600;
        const long = Math.max(w, h);
        if (long > cap) {
          const scale = cap / long;
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
        }
      }
      const prCap = w * h > 1_200_000 || touchGpu ? 1 : w < 700 ? 1.15 : 1.25;
      const pr = Math.min(window.devicePixelRatio || 1, prCap);
      camera.aspect = (rect.width || w) / Math.max(1, rect.height || h);
      camera.fov = (rect.width || w) < 700 ? 50 : 38;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      if (!composer || !bloom) return;
      composer.setPixelRatio(pr);
      composer.setSize(w + 2, h + 2);
      composer.setSize(w, h);
      bloom.strength = (rect.width || w) < 700 ? 0.3 : 0.42;
    };
    let gpuLost = false;
    let recoverTimer = 0;
    const scheduleRecover = () => {
      window.clearTimeout(recoverTimer);
      recoverTimer = window.setTimeout(() => {
        if (!gpuLost) return;
        if (document.visibilityState !== "visible") {
          scheduleRecover();
          return;
        }
        live.current.onGpuLost?.();
      }, 700);
    };
    const onLost = () => {
      gpuLost = true;
      scheduleRecover();
    };
    const onRestore = () => {
      gpuLost = false;
      window.clearTimeout(recoverTimer);
      rebuildTargets();
      detailStamp = "";
      layoutDirty = true;
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestore);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const gl = renderer.getContext();
      if (!gl || gl.isContextLost() || gpuLost) scheduleRecover();
      else {
        rebuildTargets();
        detailStamp = "";
        layoutDirty = true;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

    let rigs: Rig[] = [];
    let buildQueue: NestCube[] = [];
    let rosterKey = "";
    let seenSel = "";
    let detailStamp = "";
    let applied = "";
    let layoutDirty = true;
    let needsFrame = false;
    let framePick = false;
    let lastCell = 18;
    let lastCols = 1;
    let lastRows = 1;
    let aimX = 0;
    let aimY = 0;
    let aimZ = 0;

    const clearDetail = (rig: Rig) => {
      if (!rig.detail) return;
      disposeTree(rig.detail);
      rig.group.remove(rig.detail);
      rig.detail = null;
      rig.quiet = null;
      rig.shell = null;
      rig.tunnel = null;
      rig.pathMesh = null;
      rig.markerMesh = null;
      rig.markers = [];
      rig.enter = null;
      rig.leave = null;
      rig.ghost.visible = true;
    };

    const addDetail = (rig: Rig) => {
      clearDetail(rig);
      const model = rig.model;
      if (wallCount(model) === 0) return;
      const detail = new THREE.Group();
      const quiet = makeWalls(model.walls.quiet, paneMaterial("#07141a", "#1a4a42", 0.02, 2.8, tightGpu));
      const shell = makeWalls(model.walls.shell, paneMaterial("#0c2420", "#3ecfb2", 0.08, 2.2, tightGpu));
      const tunnel = makeWalls(model.walls.corridor, paneMaterial("#123830", "#7dffe8", 0.22, 1.7, tightGpu));
      detail.add(quiet, shell, tunnel);
      const segments = Math.max(1, model.path.length - 1);
      const pathMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, tightGpu ? 5 : 8, 1, true), glowMaterial(2.15, tightGpu), segments);
      pathMesh.count = Math.max(0, model.path.length - 1);
      pathMesh.frustumCulled = false;
      pathMesh.raycast = () => undefined;
      detail.add(pathMesh);
      const markers = model.path.map((node, index) => ({ node, index })).filter((item) => item.node.events.length > 0);
      const markerMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), glowMaterial(2.7, tightGpu), Math.max(1, markers.length));
      markerMesh.count = markers.length;
      markerMesh.frustumCulled = false;
      markers.forEach((item, i) => markerMesh.setColorAt(i, tint.set(categoryHex(item.node))));
      if (markerMesh.instanceColor) markerMesh.instanceColor.needsUpdate = true;
      detail.add(markerMesh);
      const enterMat = new THREE.MeshStandardMaterial({
        color: PALETTE.verdigris,
        emissive: PALETTE.verdigris,
        emissiveIntensity: 3.2,
        roughness: 0.25,
        metalness: 0.4,
      });
      const exitMat = new THREE.MeshStandardMaterial({
        color: PALETTE.coral,
        emissive: PALETTE.coral,
        emissiveIntensity: 3.2,
        roughness: 0.25,
        metalness: 0.4,
      });
      const ringGeo = new THREE.TorusGeometry(0.46, 0.02, 16, 48);
      const innerGeo = new THREE.TorusGeometry(0.3, 0.01, 12, 40);
      const enter = new THREE.Group();
      const leave = new THREE.Group();
      enter.add(new THREE.Mesh(ringGeo, enterMat));
      enter.add(new THREE.Mesh(innerGeo, new THREE.MeshStandardMaterial({ color: PALETTE.bone, emissive: PALETTE.verdigris, emissiveIntensity: 2.2, transparent: true, opacity: 0.9 })));
      if (!tightGpu) enter.add(shaft(PALETTE.verdigris));
      leave.add(new THREE.Mesh(ringGeo.clone(), exitMat));
      leave.add(new THREE.Mesh(innerGeo.clone(), new THREE.MeshStandardMaterial({ color: PALETTE.bone, emissive: PALETTE.coral, emissiveIntensity: 2.2, transparent: true, opacity: 0.9 })));
      if (!tightGpu) leave.add(shaft(PALETTE.coral));
      for (const ring of [...enter.children, ...leave.children]) ring.raycast = () => undefined;
      detail.add(enter, leave);
      rig.group.add(detail);
      rig.detail = detail;
      rig.quiet = quiet;
      rig.shell = shell;
      rig.tunnel = tunnel;
      rig.pathMesh = pathMesh;
      rig.markerMesh = markerMesh;
      rig.markers = markers;
      rig.enter = enter;
      rig.leave = leave;
      rig.ghost.visible = false;
    };

    const buildRig = (cube: NestCube): Rig => {
      const group = new THREE.Group();
      const ghost = new THREE.Mesh(boxGeo, ghostMat);
      ghost.raycast = () => undefined;
      const pick = new THREE.Mesh(boxGeo, pickMat);
      pick.userData.cubeId = cube.id;
      const count = Math.max(2, cube.model.path.length);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      lineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const pathLine = new THREE.Line(lineGeo, lineMat);
      pathLine.raycast = () => undefined;
      const travelerMat = new THREE.MeshStandardMaterial({
        color: PALETTE.brass,
        emissive: PALETTE.brass,
        emissiveIntensity: 2.4,
        roughness: 0.2,
        metalness: 0.35,
      });
      const traveler = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 20), travelerMat);
      traveler.raycast = () => undefined;
      const haloMat = new THREE.MeshBasicMaterial({
        color: PALETTE.brass,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), haloMat);
      halo.raycast = () => undefined;
      const flareMat = new THREE.SpriteMaterial({
        color: PALETTE.brass,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const flare = new THREE.Sprite(flareMat);
      flare.scale.set(1.1, 1.1, 1);
      flare.raycast = () => undefined;
      traveler.add(flare);
      group.add(ghost, pick, pathLine, traveler, halo);
      scene.add(group);
      return {
        id: cube.id,
        model: cube.model,
        group,
        ghost,
        pick,
        pathLine,
        traveler,
        halo,
        detail: null,
        quiet: null,
        shell: null,
        tunnel: null,
        pathMesh: null,
        markerMesh: null,
        markers: [],
        enter: null,
        leave: null,
        travelerMat,
        haloMat,
        flareMat,
        slot: cube.slot,
      };
    };

    const clearRigs = () => {
      for (const rig of rigs) {
        clearDetail(rig);
        disposeTree(rig.group);
        scene.remove(rig.group);
      }
      rigs = [];
    };

    const frameHome = () => {
      const dist = Math.max(16 * NEST, lastCell * Math.max(lastCols, lastRows) * 0.9);
      camera.position.set(aimX + dist * 0.62, aimY + Math.max(6 * NEST, dist * 0.42), aimZ + dist * 0.78);
      controls.target.set(aimX, aimY, aimZ);
      controls.minDistance = 0.04;
      controls.maxDistance = Math.max(8, dist * 40);
      camera.far = Math.max(80, dist * 80);
      camera.near = Math.max(0.001, dist / 120);
      camera.updateProjectionMatrix();
      fog.density = 0.045;
    };

    const frameRig = (rig: Rig) => {
      const span = cubeSpan(rig.model.width, rig.model.height, rig.model.depth, live.current.view.explode);
      const dist = Math.max(16, span * 0.95) * NEST;
      const p = rig.group.position;
      camera.position.set(p.x + dist * 0.62, p.y + Math.max(6 * NEST, dist * 0.42), p.z + dist * 0.78);
      controls.target.set(p.x, p.y, p.z);
      controls.minDistance = 0.04;
      controls.maxDistance = Math.max(8, dist * 48);
      camera.far = Math.max(80, dist * 90);
      camera.near = Math.max(0.001, dist / 120);
      camera.updateProjectionMatrix();
      fog.density = 0.045;
    };

    const applyLights = (masterIn: number) => {
      const master = Math.min(1, Math.max(0, masterIn || 0));
      hemi.intensity = master * 0.85;
      ambient.intensity = master * 0.42;
      sun.intensity = master * 1.45;
      if (floorMat) floorMat.color.setRGB(0.015 + master * 0.03, 0.03 + master * 0.055, 0.028 + master * 0.04);
      const span = Math.max(lastCell * Math.max(lastCols, lastRows), 0.2);
      const lift = Math.max(span * 0.55, 0.28);
      const ring = Math.max(span * 0.42, 0.16);
      spots.forEach((spot, index) => {
        const ang = (index / spots.length) * Math.PI * 2 + Math.PI / 4;
        spot.position.set(aimX + Math.cos(ang) * ring, aimY + lift, aimZ + Math.sin(ang) * ring);
        spot.target.position.set(aimX, aimY, aimZ);
        spot.intensity = master <= 0.001 ? 0 : master * 1.8;
      });
      if (!floorShader) return;
      floorShader.uniforms.reach.value = Math.max(span * 1.8, 0.9);
      for (let i = 0; i < 8; i += 1) {
        const spot = spots[i];
        if (!spot || master <= 0.001) {
          lampGain[i] = 0;
          continue;
        }
        lampPos[i].set(spot.position.x, spot.position.z);
        lampGain[i] = master * 0.8;
      }
      if (!spots.length && master > 0.001) {
        lampPos[0].set(aimX, aimZ);
        lampGain[0] = master * 0.9;
      }
    };

    const syncLayout = (next: CubeView) => {
      let spanX = 1;
      let spanY = 1;
      let spanZ = 1;
      for (const rig of rigs) {
        spanX = Math.max(spanX, rig.model.width);
        spanZ = Math.max(spanZ, rig.model.depth);
        spanY = Math.max(spanY, ySpan(rig.model, next.explode));
      }
      const gap = 1;
      const stackGap = 5;
      const pitchX = spanX + gap;
      const pitchY = spanY + gap;
      const pitchZ = spanZ + gap;
      const fallback = { stack: 0, x: 0, y: 0, z: 0, nx: 1, ny: 1, nz: 1 };
      const stackIds: number[] = [];
      const footprints = new Map<number, { nx: number; ny: number; nz: number }>();
      for (const rig of rigs) {
        const slot = rig.slot ?? fallback;
        if (footprints.has(slot.stack)) continue;
        footprints.set(slot.stack, {
          nx: Math.max(1, slot.nx || 1),
          ny: Math.max(1, slot.ny || 1),
          nz: Math.max(1, slot.nz || 1),
        });
        stackIds.push(slot.stack);
      }
      stackIds.sort((a, b) => a - b);
      const widths = stackIds.map((id) => {
        const nx = footprints.get(id)!.nx;
        return (nx - 1) * pitchX + spanX + stackGap;
      });
      let cursor = 0;
      const originX = new Map<number, number>();
      stackIds.forEach((id, index) => {
        originX.set(id, cursor);
        cursor += widths[index];
      });
      const shift = stackIds.length ? -(cursor - stackGap) / 2 : 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      rigs.forEach((rig) => {
        const slot = rig.slot ?? fallback;
        const ox = originX.get(slot.stack) ?? 0;
        const x = (shift + ox + slot.x * pitchX) * NEST;
        const y = slot.y * pitchY * NEST;
        const z = slot.z * pitchZ * NEST;
        rig.group.position.set(x, y, z);
        rig.group.scale.setScalar(NEST);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        const span = ySpan(rig.model, next.explode);
        rig.ghost.scale.set(rig.model.width, span, rig.model.depth);
        rig.pick.scale.copy(rig.ghost.scale);
        const attr = rig.pathLine.geometry.getAttribute("position") as THREE.BufferAttribute;
        const colors = rig.pathLine.geometry.getAttribute("color") as THREE.BufferAttribute;
        const total = Math.max(1, rig.model.path.length - 1);
        const pathMax = attr.count;
        rig.model.path.forEach((node, i) => {
          if (i >= pathMax) return;
          const [x, y, z] = gridToWorld(node.x, node.y, node.z, next.explode, rig.model);
          attr.setXYZ(i, x, y, z);
          tint.copy(turnA).lerp(turnB, total <= 1 ? 0 : i / (total - 1)).multiplyScalar(2.6);
          colors.setXYZ(i, tint.r, tint.g, tint.b);
        });
        attr.needsUpdate = true;
        colors.needsUpdate = true;
        rig.pathLine.visible = next.path;
        if (rig.quiet && rig.shell && rig.tunnel && rig.pathMesh && rig.enter && rig.leave) {
          const floor = next.floor >= 0 && next.floor >= rig.model.height ? -1 : next.floor;
          placeWalls(rig.quiet, rig.model.walls.quiet, rig.model, next.explode, floor);
          placeWalls(rig.shell, rig.model.walls.shell, rig.model, next.explode, floor);
          placeWalls(rig.tunnel, rig.model.walls.corridor, rig.model, next.explode, floor);
          rig.quiet.visible = next.maze && rig.model.walls.quiet.length > 0;
          rig.shell.visible = next.shell && rig.model.walls.shell.length > 0;
          rig.tunnel.visible = next.tunnel && rig.model.walls.corridor.length > 0;
          const count = Math.min(rig.model.path.length - 1, rig.pathMesh.count);
          for (let i = 0; i < count; i += 1) {
            const from = rig.model.path[i];
            const to = rig.model.path[i + 1];
            scratchA.set(...gridToWorld(from.x, from.y, from.z, next.explode, rig.model));
            scratchB.set(...gridToWorld(to.x, to.y, to.z, next.explode, rig.model));
            scratchDir.subVectors(scratchB, scratchA);
            const len = scratchDir.length();
            dummy.position.copy(scratchA).addScaledVector(scratchDir, 0.5);
            dummy.quaternion.identity();
            if (!next.path || len < 1e-4) dummy.scale.set(0, 0, 0);
            else {
              scratchDir.multiplyScalar(1 / len);
              dummy.quaternion.setFromUnitVectors(up, scratchDir);
              dummy.scale.set(0.072, len, 0.072);
            }
            dummy.updateMatrix();
            rig.pathMesh.setMatrixAt(i, dummy.matrix);
            tint.copy(turnA).lerp(turnB, count <= 1 ? 0 : i / (count - 1));
            rig.pathMesh.setColorAt(i, tint);
          }
          rig.pathMesh.instanceMatrix.needsUpdate = true;
          if (rig.pathMesh.instanceColor) rig.pathMesh.instanceColor.needsUpdate = true;
          rig.pathMesh.visible = next.path;
          rig.markers.forEach((item, i) => {
            const [x, y, z] = gridToWorld(item.node.x, item.node.y, item.node.z, next.explode, rig.model);
            dummy.position.set(x, y, z);
            dummy.quaternion.identity();
            dummy.scale.setScalar(0.2);
            dummy.updateMatrix();
            rig.markerMesh?.setMatrixAt(i, dummy.matrix);
          });
          if (rig.markerMesh) rig.markerMesh.instanceMatrix.needsUpdate = true;
          const [ex, ey, ez] = gridToWorld(rig.model.entrance.x, rig.model.entrance.y, rig.model.entrance.z, next.explode, rig.model);
          rig.enter.position.set(ex, ey, ez - 0.78);
          const [lx, ly, lz] = gridToWorld(rig.model.exit.x, rig.model.exit.y, rig.model.exit.z, next.explode, rig.model);
          rig.leave.position.set(lx, ly, lz + 0.78);
        }
      });
      const finite = Number.isFinite(minX) && Number.isFinite(maxX);
      const extentX = finite ? maxX - minX + spanX * NEST : pitchX * NEST;
      const extentY = finite ? maxY - minY + spanY * NEST : pitchY * NEST;
      const extentZ = finite ? maxZ - minZ + spanZ * NEST : pitchZ * NEST;
      if (finite) {
        aimX = (minX + maxX) / 2;
        aimY = (minY + maxY) / 2;
        aimZ = (minZ + maxZ) / 2;
      }
      const cellPitch = pitchX * NEST;
      const cols = Math.max(1, extentX / cellPitch);
      const rows = Math.max(1, extentY / cellPitch, extentZ / cellPitch);
      lastCell = cellPitch;
      lastCols = cols;
      lastRows = rows;
      applyLights(next.lights);
      const chosen = new Set(live.current.selectedIds);
      const marked = rigs.filter((rig) => chosen.has(rig.id));
      placeOutlines(marked);
      if (needsFrame) {
        needsFrame = false;
        if (framePick) {
          framePick = false;
          const picked = rigs.find((rig) => rig.id === live.current.selectedId) ?? rigs[rigs.length - 1];
          if (picked) frameRig(picked);
          else frameHome();
        } else frameHome();
      }
    };

    const reconcile = () => {
      const gl = renderer.getContext();
      if (!gl || gl.isContextLost() || gpuLost) return;
      if (document.visibilityState === "hidden") return;
      const cubesNow = live.current.cubes;
      const key = cubesNow.map((cube) => cube.id).join("|");
      if (key !== rosterKey) {
        clearRigs();
        buildQueue = cubesNow.slice();
        rosterKey = key;
        detailStamp = "";
        layoutDirty = true;
        framePick = true;
        needsFrame = false;
      } else if (!buildQueue.length) {
        cubesNow.forEach((cube) => {
          const rig = rigs.find((item) => item.id === cube.id);
          if (rig) {
            rig.model = cube.model;
            rig.slot = cube.slot;
          }
        });
      }
      if (buildQueue.length) {
        const batch = buildQueue.splice(0, tightGpu ? 1 : 3);
        for (const cube of batch) rigs.push(buildRig(cube));
        layoutDirty = true;
        return;
      }
      if (framePick) {
        needsFrame = true;
        layoutDirty = true;
      }
      const showAll = cubesNow.length <= 1;
      const stamp = cubesNow.map((cube) => `${cube.id}:${showAll || cube.id === live.current.selectedId ? wallCount(cube.model) : 0}`).join("|");
      if (stamp !== detailStamp) {
        for (const rig of rigs) {
          const want = showAll || rig.id === live.current.selectedId;
          if (want && wallCount(rig.model) > 0) {
            if (!rig.detail) addDetail(rig);
          } else clearDetail(rig);
        }
        detailStamp = stamp;
        layoutDirty = true;
      }
    };

    let seenReset = live.current.resetToken;
    let hudAcc = 0;
    let clock = 0;
    let lightApplied = -1;
    let lastNow = performance.now();

    const resize = () => rebuildTargets();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const onStart = () => {
      focusRef.current = null;
      live.current.onInteract();
    };
    controls.addEventListener("start", onStart);

    const pickMarker = () => {
      for (const rig of rigs) {
        if (!rig.markerMesh) continue;
        const hit = raycaster.intersectObject(rig.markerMesh, false)[0];
        if (hit?.instanceId == null || !rig.markers[hit.instanceId]) continue;
        return { id: rig.id, index: rig.markers[hit.instanceId].index };
      }
      return null;
    };
    const pickCube = () => {
      const hits = raycaster.intersectObjects(rigs.map((rig) => rig.pick), false);
      const id = hits[0]?.object.userData.cubeId;
      return typeof id === "string" ? id : null;
    };
    let downX = 0;
    let downY = 0;
    const onDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const marker = pickMarker();
      if (marker) {
        live.current.onPick(marker.id, marker.index);
        return;
      }
      live.current.onSelect(pickCube() ?? "");
    };
    const onMove = (event: PointerEvent) => {
      if (touchGpu) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      renderer.domElement.style.cursor = pickCube() ? "pointer" : "";
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    let raf = 0;
    let announced = false;
    let reported = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const delta = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      clock += delta;
      const current = live.current;
      try {
        reconcile();
        const selKey = current.selectedIds.join("|");
        if (selKey !== seenSel) {
          seenSel = selKey;
          layoutDirty = true;
        }
        const key = viewKey(current.view);
        if (key !== applied || layoutDirty) {
          applied = key;
          layoutDirty = false;
          syncLayout(current.view);
          lightApplied = current.view.lights;
        } else if (current.view.lights !== lightApplied) {
          lightApplied = current.view.lights;
          applyLights(lightApplied);
        }
        if (current.resetToken !== seenReset) {
          seenReset = current.resetToken;
          if (seenReset > 0) frameHome();
        }
      } catch (error) {
        if (!reported) {
          reported = true;
          console.error(error);
        }
      }
      controls.autoRotate = current.autoRotate;
      const focus = focusRef.current;
      if (focus) {
        focus.age += delta;
        const rig = rigs.find((item) => item.id === focus.id);
        if (rig) {
          scratchA.set(focus.x, focus.y, focus.z).add(rig.group.position);
          controls.target.lerp(scratchA, 1 - Math.exp(-6 * delta));
        }
        if (focus.age > 0.85) focusRef.current = null;
      }
      const from = Math.max(1, rangeRef.current.from);
      const to = Math.max(from, rangeRef.current.to);
      const master = masterRef.current;
      const playing = playingRef.current;
      const chosen = new Set(current.selectedIds);
      for (let index = 0; index < rigs.length; index += 1) {
        const rig = rigs[index];
        const order = index + 1;
        const inRange = order >= from && order <= to;
        const drive = (master && inRange) || (!master && playing && chosen.has(rig.id));
        const limit = Math.max(1, rig.model.path.length - 1);
        let step = stepsRef.current[rig.id] ?? 0;
        if (drive) {
          step += delta * 28;
          if (step >= limit) step = 0;
          stepsRef.current[rig.id] = step;
          if (rig.id === current.selectedId) {
            hudAcc += delta;
            if (hudAcc >= 0.08) {
              hudAcc = 0;
              current.onHud(step);
            }
          }
        }
        const clamped = Math.max(0, Math.min(limit, step));
        const i = Math.floor(clamped);
        const f = clamped - i;
        const nodeFrom = rig.model.path[i];
        const nodeTo = rig.model.path[Math.min(i + 1, rig.model.path.length - 1)];
        if (!nodeFrom || !nodeTo) continue;
        const fromW = gridToWorld(nodeFrom.x, nodeFrom.y, nodeFrom.z, current.view.explode, rig.model);
        const toW = gridToWorld(nodeTo.x, nodeTo.y, nodeTo.z, current.view.explode, rig.model);
        scratchDir.set(
          fromW[0] + (toW[0] - fromW[0]) * f,
          fromW[1] + (toW[1] - fromW[1]) * f,
          fromW[2] + (toW[2] - fromW[2]) * f,
        );
        rig.traveler.position.copy(scratchDir);
        rig.halo.position.copy(scratchDir);
        rig.halo.scale.setScalar(1.55 + Math.sin(clock * 3.2 + index) * 0.16);
        const shown = nodeFrom.events[0] ? nodeFrom : nodeTo.events[0] && f > 0.65 ? nodeTo : nodeFrom;
        const hex = categoryHex(shown);
        if (rig.travelerMat.userData.hex !== hex) {
          rig.travelerMat.userData.hex = hex;
          rig.travelerMat.color.set(hex);
          rig.travelerMat.emissive.set(hex);
          rig.flareMat.color.set(hex);
          rig.haloMat.color.set(hex);
        }
      }
      outlineMat.opacity = 0.78 + Math.sin(clock * 2.4) * 0.18;
      controls.update();
      const gl = renderer.getContext();
      if (gl && !gl.isContextLost()) {
        try {
          if (composer) composer.render(delta);
          else renderer.render(scene, camera);
        } catch (error) {
          if (!reported) {
            reported = true;
            console.error(error);
          }
        }
      }
      if (!announced) {
        announced = true;
        renderer.domElement.style.opacity = "1";
        live.current.onReady?.();
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(recoverTimer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestore);
      controls.removeEventListener("start", onStart);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      clearRigs();
      disposeTree(scene);
      boxGeo.dispose();
      edgeGeo.dispose();
      ghostMat.dispose();
      pickMat.dispose();
      lineMat.dispose();
      outlineMat.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [focusRef, playingRef, masterRef, rangeRef, stepsRef]);

  return <div ref={host} className="h-full w-full" />;
});
