import { gunzipSync, unzipSync, Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { buildModel, type CubeModel, type RawExport } from "@/lib/cube-model";

export type CubeSlot = {
  stack: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
};

export type LoadedCube = {
  id: string;
  name: string;
  raw: RawExport;
  model: CubeModel;
  realized: boolean;
  slot: CubeSlot;
};

let seq = 0;

function nextId(prefix: string): string {
  return `${prefix}-${++seq}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function collectExports(value: unknown): RawExport[] {
  if (Array.isArray(value)) return value.flatMap(collectExports);
  if (!isRecord(value)) return [];
  if (isRecord(value.cube) && Array.isArray((value.cube as { cells?: unknown }).cells)) {
    return [value as RawExport];
  }
  for (const key of ["cubes", "sessions", "exports", "files", "data"]) {
    if (Array.isArray(value[key])) return collectExports(value[key]);
  }
  return [];
}

export function cubeFromRaw(raw: RawExport, name: string, withWalls: boolean, id?: string): LoadedCube {
  return {
    id: id ?? nextId("cube"),
    name,
    raw,
    model: buildModel(raw, withWalls),
    realized: withWalls,
    slot: { stack: 0, x: 0, y: 0, z: 0, nx: 1, ny: 1, nz: 1 },
  };
}

export function realizeCube(cube: LoadedCube): LoadedCube {
  if (cube.realized) return cube;
  return { ...cube, realized: true, model: buildModel(cube.raw, true) };
}

export function shellCube(cube: LoadedCube): LoadedCube {
  if (!cube.realized) return cube;
  return { ...cube, realized: false, model: buildModel(cube.raw, false) };
}

function clampDim(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(10000, Math.max(1, n));
}

/** Fill order is x (across), then z (deep), then y (layers up). Existing cubes are not mutated. */
export function assignStacks(
  existing: LoadedCube[],
  incoming: LoadedCube[],
  dims: { x: number; y: number; z: number },
  startNew: boolean,
): LoadedCube[] {
  const nxReq = clampDim(dims.x);
  const nyReq = clampDim(dims.y);
  const nzReq = clampDim(dims.z);
  let maxStack = -1;
  for (const cube of existing) maxStack = Math.max(maxStack, cube.slot.stack);

  let stack: number;
  let nx: number;
  let ny: number;
  let nz: number;
  let next: number;

  if (existing.length === 0) {
    stack = 0;
    nx = nxReq;
    ny = nyReq;
    nz = nzReq;
    next = 0;
    maxStack = 0;
  } else if (startNew) {
    stack = maxStack + 1;
    nx = nxReq;
    ny = nyReq;
    nz = nzReq;
    next = 0;
    maxStack = stack;
  } else {
    const last = existing[existing.length - 1].slot;
    nx = clampDim(last.nx);
    ny = clampDim(last.ny);
    nz = clampDim(last.nz);
    stack = last.stack;
    next = last.x + nx * (last.z + nz * last.y) + 1;
    if (next >= nx * ny * nz) {
      stack = maxStack + 1;
      nx = nxReq;
      ny = nyReq;
      nz = nzReq;
      next = 0;
      maxStack = stack;
    }
  }

  return incoming.map((cube) => {
    if (next >= nx * ny * nz) {
      stack = maxStack + 1;
      nx = nxReq;
      ny = nyReq;
      nz = nzReq;
      next = 0;
      maxStack = stack;
    }
    const layer = nx * nz;
    const y = Math.floor(next / layer);
    const rem = next - y * layer;
    const z = Math.floor(rem / nx);
    const x = rem - z * nx;
    next += 1;
    return { ...cube, slot: { stack, x, y, z, nx, ny, nz } };
  });
}

function baseName(path: string): string {
  const file = path.split(/[/\\]/).pop() ?? path;
  return file.replace(/\.(json|zip|gz)$/gi, "") || "cube";
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function isJunk(path: string): boolean {
  const leaf = path.split(/[/\\]/).pop() ?? path;
  return !leaf || path.endsWith("/") || path.includes("__MACOSX") || leaf.startsWith(".");
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes).replace(/^\uFEFF/, "");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes).replace(/^\uFEFF/, "");
  }
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function unzipReliable(bytes: Uint8Array): { name: string; bytes: Uint8Array }[] {
  try {
    return Object.entries(unzipSync(bytes))
      .filter(([path]) => !isJunk(path))
      .map(([name, data]) => ({ name, bytes: data }));
  } catch {
    const out: { name: string; bytes: Uint8Array }[] = [];
    const unzipper = new Unzip((file) => {
      if (isJunk(file.name)) return;
      if (file.compression !== 0 && file.compression !== 8) return;
      const chunks: Uint8Array[] = [];
      file.ondata = (err, data, final) => {
        if (err || !data) return;
        chunks.push(data);
        if (!final) return;
        const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        out.push({ name: file.name, bytes: merged });
      };
      try {
        file.start();
      } catch {
        /* skip entries this browser cannot inflate */
      }
    });
    unzipper.register(UnzipPassThrough);
    unzipper.register(UnzipInflate);
    unzipper.push(bytes, true);
    return out;
  }
}

function harvest(name: string, bytes: Uint8Array, into: { name: string; text: string }[], depth: number): void {
  if (depth > 8 || bytes.length === 0) return;
  if (isZip(bytes)) {
    const entries = unzipReliable(bytes);
    if (!entries.length) throw new Error("could not read that zip");
    for (const entry of entries) {
      const leaf = entry.name.split(/[/\\]/).pop() ?? entry.name;
      harvest(baseName(leaf), entry.bytes, into, depth + 1);
    }
    return;
  }
  if (isGzip(bytes)) {
    harvest(name, gunzipSync(bytes), into, depth + 1);
    return;
  }
  const text = decodeText(bytes).trim();
  if (text.startsWith("{") || text.startsWith("[")) into.push({ name: name || "cube", text });
}

async function textsFromFile(file: File): Promise<{ name: string; text: string }[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error("file was empty");
  const found: { name: string; text: string }[] = [];
  harvest(baseName(file.name), bytes, found, 0);
  if (!found.length) throw new Error("no cube JSON inside");
  return found;
}

export async function loadCubeFiles(files: File[]): Promise<{ cubes: LoadedCube[]; errors: string[] }> {
  const cubes: LoadedCube[] = [];
  const errors: string[] = [];
  const texts: { name: string; text: string }[] = [];
  for (const file of files) {
    try {
      texts.push(...(await textsFromFile(file)));
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "could not read"}`);
    }
  }
  for (const item of texts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(item.text);
    } catch {
      errors.push(`${item.name}: invalid JSON`);
      continue;
    }
    const exports = collectExports(parsed);
    if (!exports.length) {
      errors.push(`${item.name}: not a cube export`);
      continue;
    }
    exports.forEach((raw, index) => {
      const name = exports.length > 1 ? `${item.name} ${index + 1}` : item.name;
      try {
        cubes.push(cubeFromRaw(raw, name, false));
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : "invalid cube"}`);
      }
    });
    if (cubes.length > 0 && cubes.length % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { cubes, errors };
}
