export type WallKey = "left" | "right" | "front" | "back" | "top" | "bottom";

export type RawEvent = {
  label: string;
  ts: string;
  category: string;
  detail?: string;
};

export type RawCell = {
  x: number;
  y: number;
  z: number;
  walls: Record<WallKey, boolean>;
};

export type RawPathNode = {
  order: number;
  x: number;
  y: number;
  z: number;
  events: RawEvent[];
};

export type RawExport = {
  cube: {
    width: number;
    height: number;
    depth: number;
    generatedAt?: string;
    entrance: { face: string; x: number; y: number; z: number };
    exit: { face: string; x: number; y: number; z: number };
    cells: RawCell[];
  };
  totalEvents: number;
  exportedAt: string;
  mode: string;
  pathIndex: { layer: number; path: RawPathNode[] }[];
};

export type WallKind = "shell" | "corridor" | "quiet";

export type WallInstance = {
  x: number;
  y: number;
  z: number;
  face: WallKey;
  kind: WallKind;
};

export type PathNode = {
  order: number;
  x: number;
  y: number;
  z: number;
  turn: number;
  events: RawEvent[];
};

export type CubeModel = {
  width: number;
  height: number;
  depth: number;
  mode: string;
  generatedAt: string;
  exportedAt: string;
  entrance: RawExport["cube"]["entrance"];
  exit: RawExport["cube"]["exit"];
  walls: Record<WallKind, WallInstance[]>;
  path: PathNode[];
  uniqueCells: number;
  eventCount: number;
  turns: number;
};

export const EXPLODE_GAP = 1.45;

export const PALETTE = {
  ink: "#071014",
  panel: "#0e181c",
  brass: "#e4a24a",
  verdigris: "#3ecfb2",
  coral: "#e36b5c",
  bone: "#e7f0ea",
  mist: "#8ea39a",
  quiet: "#16302c",
  shell: "#1c4a44",
} as const;

const FACE_STEP: Record<WallKey, [number, number, number]> = {
  left: [-1, 0, 0],
  right: [1, 0, 0],
  bottom: [0, -1, 0],
  top: [0, 1, 0],
  back: [0, 0, -1],
  front: [0, 0, 1],
};

export function gridToWorld(
  x: number,
  y: number,
  z: number,
  explode: number,
  size: { width: number; height: number; depth: number } = { width: 10, height: 10, depth: 10 },
): [number, number, number] {
  const cx = (size.width - 1) / 2;
  const cy = (size.height - 1) / 2;
  const cz = (size.depth - 1) / 2;
  const lift = (y - cy) * explode * EXPLODE_GAP;
  return [x - cx, y - cy + lift, z - cz];
}

export function cubeSpan(width: number, height: number, depth: number, explode: number): number {
  const ySpan = Math.max(1, height - 1) * (1 + explode * EXPLODE_GAP) + 1;
  return Math.max(width, depth, ySpan);
}

export function eventTitle(event: RawEvent): string {
  const label =
    event.category === "emotion"
      ? event.label.charAt(0).toUpperCase() + event.label.slice(1)
      : event.label;
  return event.detail ? `${label} · ${event.detail}` : label;
}

export function categoryOf(event: RawEvent | undefined): "stage" | "tool" | "emotion" | "none" {
  if (!event) return "none";
  if (event.category === "tool" || event.category === "emotion" || event.category === "stage") {
    return event.category;
  }
  return "stage";
}

export function clock(ts: string): string {
  const match = /T(\d{2}:\d{2}:\d{2})/.exec(ts);
  return match ? `${match[1]} UTC` : ts;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function isShell(x: number, y: number, z: number, face: WallKey, w: number, h: number, d: number): boolean {
  if (face === "left") return x === 0;
  if (face === "right") return x === w - 1;
  if (face === "bottom") return y === 0;
  if (face === "top") return y === h - 1;
  if (face === "back") return z === 0;
  return z === d - 1;
}

export function buildModel(raw: RawExport, withWalls = true): CubeModel {
  const { cube } = raw;
  const pathRaw = [...(raw.pathIndex[0]?.path ?? [])].sort((a, b) => a.order - b.order);
  if (!cube?.cells?.length || pathRaw.length === 0) {
    throw new Error("Export is missing the cube or the walked path.");
  }

  const onPath = new Set<string>();
  let turn = -1;
  let lastTs = "";
  const path: PathNode[] = pathRaw.map((node) => {
    onPath.add(cellKey(node.x, node.y, node.z));
    const ts = node.events[0]?.ts;
    if (ts && ts !== lastTs) {
      turn += 1;
      lastTs = ts;
    }
    return {
      order: node.order,
      x: node.x,
      y: node.y,
      z: node.z,
      turn: Math.max(0, turn),
      events: node.events ?? [],
    };
  });

  const walls: Record<WallKind, WallInstance[]> = { shell: [], corridor: [], quiet: [] };
  const faces: WallKey[] = ["right", "front", "top", "left", "back", "bottom"];

  if (withWalls) {
    for (const cell of cube.cells) {
      for (const face of faces) {
        if (!cell.walls[face]) continue;
        if (face === "left" && cell.x !== 0) continue;
        if (face === "back" && cell.z !== 0) continue;
        if (face === "bottom" && cell.y !== 0) continue;
        const [dx, dy, dz] = FACE_STEP[face];
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const nz = cell.z + dz;
        const touches =
          onPath.has(cellKey(cell.x, cell.y, cell.z)) || onPath.has(cellKey(nx, ny, nz));
        const shell = isShell(cell.x, cell.y, cell.z, face, cube.width, cube.height, cube.depth);
        const kind: WallKind = touches ? "corridor" : shell ? "shell" : "quiet";
        walls[kind].push({ x: cell.x, y: cell.y, z: cell.z, face, kind });
      }
    }
  }

  const eventCount = path.reduce((sum, node) => sum + node.events.length, 0);

  return {
    width: cube.width,
    height: cube.height,
    depth: cube.depth,
    mode: raw.mode,
    generatedAt: cube.generatedAt ?? "",
    exportedAt: raw.exportedAt,
    entrance: cube.entrance,
    exit: cube.exit,
    walls,
    path,
    uniqueCells: onPath.size,
    eventCount,
    turns: turn + 1,
  };
}

export function markerIndexAt(path: PathNode[], step: number): number {
  let found = -1;
  const index = Math.max(0, Math.min(path.length - 1, Math.floor(step)));
  for (let i = 0; i <= index; i += 1) {
    if (path[i].events.length > 0) found = i;
  }
  return found;
}

export function stepToEvent(path: PathNode[], from: number, direction: 1 | -1): number {
  const start = Math.max(0, Math.min(path.length - 1, Math.round(from)));
  for (let i = start + direction; i >= 0 && i < path.length; i += direction) {
    if (path[i].events.length > 0) return i;
  }
  return start;
}
