import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, List, Pause, Play, RotateCcw, X } from "lucide-react";
import { sessionExport } from "@/data/session-cube";
import {
  cubeFromRaw,
  loadCubeFiles,
  realizeCube,
  shellCube,
  type LoadedCube,
} from "@/lib/cube-load";
import {
  average,
  briefOf,
  similarity,
  sliceRange,
} from "@/lib/cube-stats";
import {
  categoryOf,
  clock,
  eventTitle,
  gridToWorld,
  markerIndexAt,
  stepToEvent,
  type CubeModel,
  type PathNode,
} from "@/lib/cube-model";
import type { CubeView, FocusRequest } from "@/components/cube-scene";
import type { Bar } from "@/components/nest-charts";
import { cn } from "@/lib/utils";

const scenePromise = typeof window === "undefined" ? null : import("@/components/cube-scene");
const CubeCanvas = lazy(() =>
  (scenePromise ?? import("@/components/cube-scene")).then((mod) => ({ default: mod.CubeCanvas })),
);
const NestCharts = lazy(() => import("@/components/nest-charts").then((mod) => ({ default: mod.NestCharts })));

const PIPELINE = [
  "User Input Prompt",
  "Verification",
  "Inbound",
  "Allocation",
  "Logic Allocation",
  "Tool",
  "Emotion",
  "Outbound",
  "AI Output Prompt",
  "Sentience Journal",
  "Connected Resources",
];

const INITIAL_VIEW: CubeView = {
  explode: 0.46,
  floor: -1,
  shell: true,
  maze: true,
  tunnel: true,
  path: true,
};

function exampleCube(): LoadedCube {
  return cubeFromRaw(sessionExport, "Example session", true, "example");
}

function dotClass(kind: ReturnType<typeof categoryOf>): string {
  if (kind === "tool") return "bg-brass";
  if (kind === "emotion") return "bg-coral";
  return "bg-verdigris";
}

function Chip({
  on,
  children,
  label,
  pressed,
}: {
  on: () => void;
  children: string;
  label: string;
  pressed: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={on}
      className={cn("rounded-full px-3 py-2 text-xs font-medium tracking-wide", pressed ? "bg-verdigris text-ink" : "bg-panel-2 text-mist")}
    >
      {children}
    </button>
  );
}

function EventRow({
  node,
  index,
  active,
  onPick,
}: {
  node: PathNode;
  index: number;
  active: boolean;
  onPick: (index: number) => void;
}) {
  const event = node.events[0];
  return (
    <button
      type="button"
      onClick={() => onPick(index)}
      className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left", active ? "bg-panel-2" : "hover:bg-panel-2/70")}
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dotClass(categoryOf(event)))} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-bone">{eventTitle(event)}</span>
        <span className="font-mono text-xs text-mist">
          {clock(event.ts)} · {node.x},{node.y},{node.z} · turn {node.turn + 1}
        </span>
      </span>
    </button>
  );
}

function Readout({ model }: { model: CubeModel }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-mist">
      <p>
        {model.width}×{model.height}×{model.depth} cells, six walls each. A walk of {model.path.length} steps enters at (
        {model.entrance.x}, {model.entrance.y}, {model.entrance.z}) and leaves at ({model.exit.x}, {model.exit.y}, {model.exit.z}).
      </p>
      <p>
        {model.eventCount} events sit on that walk, across {model.turns} turns. Teal marks a stage, brass a tool, coral an emotion.
      </p>
      <ol className="grid grid-cols-1 gap-1 font-mono text-xs text-bone">
        {PIPELINE.map((step, i) => (
          <li key={step}>
            <span className="text-mist">{String(i + 1).padStart(2, "0")}</span> {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SessionCube() {
  const [cubes, setCubes] = useState<LoadedCube[]>(() => [exampleCube()]);
  const [selectedId, setSelectedId] = useState("example");
  const [view, setView] = useState<CubeView>(INITIAL_VIEW);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [master, setMaster] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [showScene, setShowScene] = useState(false);
  const [sceneLive, setSceneLive] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState({ from: 1, to: 1 });
  const [followAll, setFollowAll] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const stepsRef = useRef<Record<string, number>>({ example: 0 });
  const playingRef = useRef(false);
  const masterRef = useRef(false);
  const rangeRef = useRef(range);
  const focusRef = useRef<FocusRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cubesRef = useRef(cubes);
  cubesRef.current = cubes;
  rangeRef.current = range;

  const selected = cubes.find((cube) => cube.id === selectedId) ?? cubes[0];
  const selectedIndex = Math.max(0, cubes.findIndex((cube) => cube.id === selected?.id));

  useEffect(() => {
    if (followAll) setRange({ from: 1, to: Math.max(1, cubes.length) });
  }, [cubes.length, followAll]);

  useEffect(() => {
    setShowScene(true);
  }, []);

  const events = useMemo(
    () =>
      selected
        ? selected.model.path.map((node, index) => ({ node, index })).filter((item) => item.node.events.length > 0)
        : [],
    [selected],
  );

  const briefs = useMemo(() => sliceRange(cubes, range).map(briefOf), [cubes, range]);
  const selectedBrief = useMemo(() => (selected ? briefOf(selected) : null), [selected]);
  const perfectMatches = selectedBrief
    ? briefs.filter((brief) => brief.id !== selectedBrief.id && similarity(selectedBrief.signature, brief.signature) > 0.999).length
    : 0;

  const matchBars: Bar[] = useMemo(() => {
    if (!selectedBrief) return [];
    if (briefs.length > 16) {
      const buckets = Array.from({ length: 8 }, (_, index) => ({
        label: `${index * 12}`,
        value: 0,
        color: index === 7 ? "#e36b5c" : "#3ecfb2",
      }));
      for (const brief of briefs) {
        const score = similarity(selectedBrief.signature, brief.signature);
        buckets[Math.min(7, Math.floor(score * 8))].value += 1;
      }
      return buckets;
    }
    return briefs.map((brief) => {
      const score = similarity(selectedBrief.signature, brief.signature);
      return {
        label: brief.name.slice(0, 12),
        value: Math.max(0.04, score),
        color: score > 0.999 ? "#e36b5c" : brief.id === selectedBrief.id ? "#e4a24a" : "#3ecfb2",
      };
    });
  }, [briefs, selectedBrief]);

  const categoryBars: Bar[] = useMemo(() => {
    if (!selectedBrief) return [];
    const stage = average(briefs.map((brief) => brief.stage));
    const tool = average(briefs.map((brief) => brief.tool));
    const emotion = average(briefs.map((brief) => brief.emotion));
    return [
      { label: "Stage", value: selectedBrief.stage, color: "#3ecfb2" },
      { label: "Tool", value: selectedBrief.tool, color: "#e4a24a" },
      { label: "Emotion", value: selectedBrief.emotion, color: "#e36b5c" },
      { label: "Stage μ", value: stage, color: "#1f6f62" },
      { label: "Tool μ", value: tool, color: "#8a6230" },
      { label: "Emotion μ", value: emotion, color: "#8a4038" },
    ];
  }, [briefs, selectedBrief]);

  const meanBars: Bar[] = useMemo(() => {
    if (!selectedBrief || briefs.length === 0) return [];
    const meanPath = average(briefs.map((brief) => brief.pathLength));
    const meanEvents = average(briefs.map((brief) => brief.events));
    const meanTurns = average(briefs.map((brief) => brief.turns));
    const meanCover = average(briefs.map((brief) => brief.uniqueCells / Math.max(1, brief.volume)));
    const cover = selectedBrief.uniqueCells / Math.max(1, selectedBrief.volume);
    const maxPath = Math.max(selectedBrief.pathLength, meanPath, 1);
    const maxEvents = Math.max(selectedBrief.events, meanEvents, 1);
    const maxTurns = Math.max(selectedBrief.turns, meanTurns, 1);
    return [
      { label: "Path", value: selectedBrief.pathLength / maxPath, color: "#e4a24a" },
      { label: "Path μ", value: meanPath / maxPath, color: "#8a6230" },
      { label: "Events", value: selectedBrief.events / maxEvents, color: "#3ecfb2" },
      { label: "Events μ", value: meanEvents / maxEvents, color: "#1f6f62" },
      { label: "Turns", value: selectedBrief.turns / maxTurns, color: "#e36b5c" },
      { label: "Turns μ", value: meanTurns / maxTurns, color: "#8a4038" },
      { label: "Cover", value: cover, color: "#e7f0ea" },
      { label: "Cover μ", value: meanCover, color: "#8ea39a" },
    ];
  }, [briefs, selectedBrief]);

  const publish = useCallback((id: string, next: number, length: number) => {
    const clamped = Math.max(0, Math.min(length - 1, next));
    stepsRef.current[id] = clamped;
    setStep(clamped);
  }, []);

  const focusIndex = useCallback(
    (id: string, index: number) => {
      const cube = cubesRef.current.find((item) => item.id === id);
      if (!cube) return;
      const node = cube.model.path[index];
      if (!node) return;
      const [x, y, z] = gridToWorld(node.x, node.y, node.z, view.explode, cube.model);
      focusRef.current = { id, x, y, z, age: 0 };
      playingRef.current = false;
      masterRef.current = false;
      setPlaying(false);
      setMaster(false);
      publish(id, index, cube.model.path.length);
      setAutoRotate(false);
    },
    [publish, view.explode],
  );

  const selectCube = useCallback(
    (id: string, index: number | null = null) => {
      setCubes((prev) => {
        const full = prev.length <= 4;
        return prev.map((cube) => (full || cube.id === id ? realizeCube(cube) : shellCube(cube)));
      });
      setSelectedId(id);
      if (index == null) {
        playingRef.current = false;
        setPlaying(false);
        setStep(stepsRef.current[id] ?? 0);
        return;
      }
      focusIndex(id, index);
    },
    [focusIndex],
  );

  const togglePlay = useCallback(() => {
    masterRef.current = false;
    setMaster(false);
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
    if (playingRef.current) setAutoRotate(false);
  }, []);

  const toggleMaster = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    masterRef.current = !masterRef.current;
    setMaster(masterRef.current);
    if (masterRef.current) setAutoRotate(false);
  }, []);

  const onHud = useCallback((value: number) => setStep(value), []);
  const onInteract = useCallback(() => setAutoRotate(false), []);
  const onReady = useCallback(() => setSceneLive(true), []);

  const onFiles = async (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (!files.length) return;
    setBusy(true);
    setNotice(`Reading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    const { cubes: incoming, errors } = await loadCubeFiles(files);
    if (fileRef.current) fileRef.current.value = "";
    if (!incoming.length) {
      setBusy(false);
      setNotice(errors.join(" · ") || "Nothing to import");
      return;
    }
    const first = incoming[0];
    setCubes((prev) => {
      const next = [...prev, ...incoming];
      const full = next.length <= 4;
      return next.map((cube) => (full || cube.id === first.id ? realizeCube(cube) : shellCube(cube)));
    });
    setSelectedId(first.id);
    setStep(0);
    stepsRef.current[first.id] = 0;
    setFollowAll(true);
    setBusy(false);
    const extra = errors.length ? ` ${errors.length} skipped.` : "";
    setNotice(`Added ${incoming.length} cube${incoming.length === 1 ? "" : "s"}.${extra}`);
  };

  const patch = (partial: Partial<CubeView>) => setView((current) => ({ ...current, ...partial }));
  const model = selected?.model;
  const activeEvent = model ? markerIndexAt(model.path, step) : -1;
  const node = model ? model.path[Math.min(model.path.length - 1, Math.floor(step))] : undefined;
  const heading = node?.events[0] ? eventTitle(node.events[0]) : "Open corridor";
  const meanPath = average(briefs.map((brief) => brief.pathLength));
  const meanEvents = average(briefs.map((brief) => brief.events));

  const setRangeField = (key: "from" | "to", value: number) => {
    setFollowAll(false);
    setRange((current) => {
      const next = { ...current, [key]: value };
      const from = Math.max(1, Math.min(cubes.length, Math.floor(next.from) || 1));
      const to = Math.max(from, Math.min(cubes.length, Math.floor(next.to) || from));
      return { from, to };
    });
  };

  return (
    <main className="cube-shell bg-ink text-bone">
      <section className="cube-stage">
        <div className="absolute inset-0">
          <img
            src={`${import.meta.env.BASE_URL}cube-poster.jpg`}
            alt=""
            width={1280}
            height={800}
            fetchPriority="high"
            decoding="sync"
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full bg-ink object-cover",
              sceneLive && "invisible",
            )}
          />
          {showScene ? (
            <Suspense fallback={null}>
              <CubeCanvas
                cubes={cubes}
                selectedId={selected?.id ?? ""}
                view={view}
                stepsRef={stepsRef}
                playingRef={playingRef}
                masterRef={masterRef}
                rangeRef={rangeRef}
                onHud={onHud}
                onPick={(id, index) => selectCube(id, index)}
                onSelect={(id) => selectCube(id, null)}
                focusRef={focusRef}
                autoRotate={autoRotate && !playing && !master}
                onInteract={onInteract}
                resetToken={resetToken}
                onReady={onReady}
              />
            </Suspense>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
          <header className="flex flex-col gap-2 p-3 sm:p-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="pointer-events-auto glass max-w-xl rounded-2xl px-4 py-3">
              <p className="font-mono text-xs tracking-widest text-verdigris uppercase">This session</p>
              <h1 className="font-display text-3xl leading-none font-extrabold text-bone sm:text-4xl">Session Cube</h1>
              <p className="mt-2 max-w-md text-sm leading-snug text-mist">
                {selected
                  ? `${selected.name} · ${selected.model.width}×${selected.model.height}×${selected.model.depth} · cube ${selectedIndex + 1} of ${cubes.length}`
                  : "Import a cube export"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-full bg-brass px-3 py-2 text-xs font-medium text-ink"
                >
                  {busy ? "Reading…" : "Import JSON or ZIP"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCubes((prev) => (prev.some((cube) => cube.id === "example") ? prev : [exampleCube(), ...prev]));
                    setSelectedId("example");
                    setFollowAll(true);
                  }}
                  className="rounded-full bg-panel-2 px-3 py-2 text-xs text-bone"
                >
                  Example
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sample = exampleCube();
                    setCubes([sample]);
                    setSelectedId(sample.id);
                    setFollowAll(true);
                    setNotice("");
                    stepsRef.current = { example: 0 };
                    setStep(0);
                  }}
                  className="rounded-full bg-panel-2 px-3 py-2 text-xs text-mist"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacyOpen(true)}
                  className="rounded-full bg-panel-2 px-3 py-2 text-xs text-bone"
                >
                  Privacy
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".json,.zip,.gz,application/json,application/zip,application/x-zip-compressed,application/gzip,application/octet-stream"
                  className="hidden"
                  suppressHydrationWarning
                  onChange={(event) => void onFiles(event.target.files)}
                />
              </div>
              {notice ? <p className="mt-2 text-xs text-mist">{notice}</p> : null}
            </div>

            <div className="pointer-events-auto glass flex max-w-full flex-col gap-3 rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={master}
                  aria-label={master ? "Pause every cube in range" : "Play every cube in range"}
                  onClick={toggleMaster}
                  className={cn("rounded-full px-3 py-2 text-xs font-medium", master ? "bg-brass text-ink" : "bg-panel-2 text-bone")}
                >
                  {master ? "Pause all" : "Play all"}
                </button>
                <label className="flex items-center gap-1 font-mono text-xs text-mist">
                  Range
                  <input
                    className="w-14 rounded-lg bg-panel-2 px-2 py-1 text-bone"
                    type="number"
                    min={1}
                    max={cubes.length}
                    value={range.from}
                    aria-label="First cube in the master range"
                    suppressHydrationWarning
                    onChange={(event) => setRangeField("from", Number(event.target.value))}
                  />
                  to
                  <input
                    className="w-14 rounded-lg bg-panel-2 px-2 py-1 text-bone"
                    type="number"
                    min={1}
                    max={cubes.length}
                    value={range.to}
                    aria-label="Last cube in the master range"
                    suppressHydrationWarning
                    onChange={(event) => setRangeField("to", Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip pressed={view.shell} label="Toggle outer shell" on={() => patch({ shell: !view.shell })}>
                  Shell
                </Chip>
                <Chip pressed={view.maze} label="Toggle unused maze" on={() => patch({ maze: !view.maze })}>
                  Maze
                </Chip>
                <Chip pressed={view.tunnel} label="Toggle walked tunnel" on={() => patch({ tunnel: !view.tunnel })}>
                  Tunnel
                </Chip>
                <Chip pressed={view.path} label="Toggle path" on={() => patch({ path: !view.path })}>
                  Path
                </Chip>
              </div>
              <label className="flex items-center gap-3 text-xs text-mist">
                <span className="w-14 font-mono tracking-widest uppercase">Spread</span>
                <input
                  className="scrub"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(view.explode * 100)}
                  aria-label="Spread the floors apart"
                  suppressHydrationWarning
                  onChange={(event) => patch({ explode: Number(event.target.value) / 100 })}
                />
              </label>
              <label className="flex items-center gap-3 text-xs text-mist">
                <span className="w-14 font-mono tracking-widest uppercase">Floor</span>
                <input
                  className="scrub"
                  type="range"
                  min={-1}
                  max={Math.max(0, (model?.height ?? 10) - 1)}
                  step={1}
                  value={Math.min(view.floor, Math.max(0, (model?.height ?? 10) - 1))}
                  aria-label="Solo a floor"
                  suppressHydrationWarning
                  onChange={(event) => patch({ floor: Number(event.target.value) })}
                />
                <span className="w-8 font-mono text-bone">{view.floor < 0 ? "All" : view.floor}</span>
              </label>
            </div>
          </header>

          <div className="min-h-0 flex-1" />

          <div className="flex items-end justify-between gap-3 p-3 sm:p-4">
            <div className="pointer-events-auto glass min-w-0 flex-1 rounded-2xl px-4 py-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-xl leading-tight text-bone sm:text-2xl">{heading}</p>
                  <p className="font-mono text-xs text-mist">
                    {model
                      ? `step ${Math.floor(step)} / ${model.path.length - 1} · cell ${node?.x ?? 0},${node?.y ?? 0},${node?.z ?? 0} · turn ${(node?.turn ?? 0) + 1} of ${model.turns}`
                      : "No cube loaded"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={playing ? "Pause the walk" : "Play the walk"}
                    onClick={togglePlay}
                    className="grid size-11 place-items-center rounded-full bg-brass text-ink"
                  >
                    {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Frame every cube"
                    onClick={() => {
                      setResetToken((n) => n + 1);
                      setAutoRotate(true);
                    }}
                    className="grid size-11 place-items-center rounded-full bg-panel-2 text-bone"
                  >
                    <RotateCcw className="size-5" />
                  </button>
                </div>
              </div>
              <input
                className="scrub"
                type="range"
                min={0}
                max={Math.max(0, (model?.path.length ?? 1) - 1)}
                step={0.01}
                value={Math.min(step, Math.max(0, (model?.path.length ?? 1) - 1))}
                aria-label="Scrub the walk"
                suppressHydrationWarning
                onChange={(event) => {
                  if (!selected) return;
                  playingRef.current = false;
                  masterRef.current = false;
                  setPlaying(false);
                  setMaster(false);
                  publish(selected.id, Number(event.target.value), selected.model.path.length);
                }}
              />
              <p className="mt-2 font-mono text-xs text-mist">
                Drag to orbit · click a cube to select it · green ring enters · coral ring exits
              </p>
            </div>
            <div className="pointer-events-auto flex flex-col gap-2 lg:hidden">
              <button
                type="button"
                aria-label="Show events"
                onClick={() => {
                  setListOpen(true);
                  setReadOpen(false);
                }}
                className="grid size-11 place-items-center rounded-full bg-panel text-bone"
              >
                <List className="size-5" />
              </button>
              <button
                type="button"
                aria-label="How to read the cube"
                onClick={() => {
                  setReadOpen(true);
                  setListOpen(false);
                }}
                className="grid size-11 place-items-center rounded-full bg-panel text-bone"
              >
                <BookOpen className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <aside className="absolute top-36 right-4 z-20 hidden max-h-[46%] w-72 flex-col overflow-hidden lg:flex">
          <section className="glass flex min-h-0 flex-1 flex-col rounded-2xl">
            <header className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-display text-lg text-bone">Events</h2>
              <span className="font-mono text-xs text-mist">{model?.eventCount ?? 0}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {events.map((item) => (
                <EventRow
                  key={item.index}
                  node={item.node}
                  index={item.index}
                  active={item.index === activeEvent}
                  onPick={(index) => selected && focusIndex(selected.id, index)}
                />
              ))}
            </div>
          </section>
        </aside>

        {listOpen || readOpen ? (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70%] overflow-y-auto p-3 lg:hidden">
            <section className="glass rounded-2xl p-3">
              <header className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg text-bone">{listOpen ? "Events" : "How to read it"}</h2>
                <button
                  type="button"
                  aria-label="Close panel"
                  onClick={() => {
                    setListOpen(false);
                    setReadOpen(false);
                  }}
                  className="grid size-11 place-items-center rounded-full bg-panel-2 text-bone"
                >
                  <X className="size-5" />
                </button>
              </header>
              {listOpen ? (
                <div className="max-h-[50dvh] overflow-y-auto">
                  {events.map((item) => (
                    <EventRow
                      key={item.index}
                      node={item.node}
                      index={item.index}
                      active={item.index === activeEvent}
                      onPick={(index) => {
                        if (!selected) return;
                        focusIndex(selected.id, index);
                        setListOpen(false);
                      }}
                    />
                  ))}
                </div>
              ) : model ? (
                <Readout model={model} />
              ) : null}
            </section>
          </div>
        ) : null}
        <KeyBindings
          onToggle={togglePlay}
          onStep={(direction) => selected && focusIndex(selected.id, stepToEvent(selected.model.path, step, direction))}
        />
      </section>

      <section className="cube-graphs gap-3 p-3 sm:p-4">
        <div className="glass rounded-2xl p-4">
          <h2 className="font-display text-2xl text-bone">Nest</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            {cubes.length} cube{cubes.length === 1 ? "" : "s"} loaded. Range {range.from}–{range.to} averages a{" "}
            {meanPath.toFixed(0)}-step walk and {meanEvents.toFixed(1)} events.
            {selectedBrief
              ? ` ${perfectMatches} perfect event match${perfectMatches === 1 ? "" : "es"} with ${selectedBrief.name}.`
              : ""}
          </p>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
            {cubes.map((cube, index) => (
              <button
                key={cube.id}
                type="button"
                aria-pressed={cube.id === selected?.id}
                onClick={() => selectCube(cube.id, null)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm",
                  cube.id === selected?.id ? "bg-panel-2 text-bone" : "text-mist",
                )}
              >
                <span className="truncate">
                  {index + 1}. {cube.name}
                </span>
                <span className="shrink-0 font-mono text-xs">
                  {cube.model.width}×{cube.model.height}×{cube.model.depth}
                </span>
              </button>
            ))}
          </div>
        </div>
        {showScene ? (
          <Suspense fallback={<p className="px-1 text-sm text-mist">Building the comparison graphs…</p>}>
            <NestCharts match={matchBars} categories={categoryBars} mean={meanBars} />
          </Suspense>
        ) : null}
        {model ? (
          <details className="glass rounded-2xl px-4 py-3 lg:hidden">
            <summary className="cursor-pointer font-display text-lg text-bone">How to read it</summary>
            <div className="mt-3">
              <Readout model={model} />
            </div>
          </details>
        ) : null}
      </section>
      {privacyOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={() => setPrivacyOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
            className="glass w-full max-w-lg rounded-2xl p-5 text-left"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="font-mono text-xs tracking-widest text-verdigris uppercase">Privacy</p>
            <h2 id="privacy-title" className="mt-1 font-display text-2xl text-bone">
              What this tool is
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Session Cube is a visual analysis tool. It is pure analytic data of the real-time 3-D scene of the Lead Edge Ash Tree Reflex neural network that operates out of the Autumn repository, the Autumn iOS repository, and related projects. It records that an event occurred over our own project logic — not anybody’s data — only our own parameters being executed.
            </p>
            <button
              type="button"
              className="mt-4 rounded-full bg-brass px-4 py-2 text-xs font-medium text-ink"
              onClick={() => setPrivacyOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function KeyBindings({ onToggle, onStep }: { onToggle: () => void; onStep: (direction: 1 | -1) => void }) {
  const toggleRef = useRef(onToggle);
  const stepRef = useRef(onStep);
  toggleRef.current = onToggle;
  stepRef.current = onStep;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggleRef.current();
      } else if (event.code === "ArrowRight") stepRef.current(1);
      else if (event.code === "ArrowLeft") stepRef.current(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return null;
}
