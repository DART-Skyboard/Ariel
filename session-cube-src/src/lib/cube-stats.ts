import { categoryOf, eventTitle, type CubeModel } from "@/lib/cube-model";
import type { LoadedCube } from "@/lib/cube-load";

export type CubeBrief = {
  id: string;
  name: string;
  signature: string[];
  pathLength: number;
  events: number;
  turns: number;
  uniqueCells: number;
  volume: number;
  stage: number;
  tool: number;
  emotion: number;
};

export function briefOf(cube: LoadedCube): CubeBrief {
  const model: CubeModel = cube.model;
  const signature: string[] = [];
  let stage = 0;
  let tool = 0;
  let emotion = 0;
  for (const node of model.path) {
    for (const event of node.events) {
      const kind = categoryOf(event);
      if (kind === "stage") stage += 1;
      else if (kind === "tool") tool += 1;
      else if (kind === "emotion") emotion += 1;
      signature.push(`${kind}|${eventTitle(event)}`);
    }
  }
  return {
    id: cube.id,
    name: cube.name,
    signature,
    pathLength: Math.max(0, model.path.length - 1),
    events: model.eventCount,
    turns: model.turns,
    uniqueCells: model.uniqueCells,
    volume: model.width * model.height * model.depth,
    stage,
    tool,
    emotion,
  };
}

export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const count = (list: string[]) => {
    const map = new Map<string, number>();
    for (const item of list) map.set(item, (map.get(item) ?? 0) + 1);
    return map;
  };
  const left = count(a);
  const right = count(b);
  let dot = 0;
  let leftSq = 0;
  let rightSq = 0;
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    const x = left.get(key) ?? 0;
    const y = right.get(key) ?? 0;
    dot += x * y;
    leftSq += x * x;
    rightSq += y * y;
  }
  if (leftSq === 0 || rightSq === 0) return 0;
  return dot / Math.sqrt(leftSq * rightSq);
}

export function sliceRange<T>(items: T[], range: { from: number; to: number }): T[] {
  const from = Math.max(1, Math.floor(range.from));
  const to = Math.max(from, Math.floor(range.to));
  return items.slice(from - 1, to);
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
