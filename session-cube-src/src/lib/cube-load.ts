import { strFromU8, unzipSync } from "fflate";
import { buildModel, type CubeModel, type RawExport } from "@/lib/cube-model";

export type LoadedCube = {
  id: string;
  name: string;
  raw: RawExport;
  model: CubeModel;
  realized: boolean;
};

let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
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

function baseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.json$/i, "") || "cube";
}

async function textsFromFile(file: File): Promise<{ name: string; text: string }[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const found: { name: string; text: string }[] = [];
    for (const [path, bytes] of Object.entries(entries)) {
      const leaf = path.split("/").pop() ?? "";
      if (!leaf.toLowerCase().endsWith(".json")) continue;
      if (path.includes("__MACOSX") || leaf.startsWith(".")) continue;
      found.push({ name: baseName(leaf), text: strFromU8(bytes) });
    }
    if (!found.length) throw new Error("no JSON in the zip");
    return found;
  }
  return [{ name: baseName(file.name), text: await file.text() }];
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
  }
  return { cubes, errors };
}
