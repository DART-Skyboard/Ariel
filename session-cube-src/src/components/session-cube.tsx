import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BookOpen, Eye, Pause, Play, RotateCcw, X } from "lucide-react";
import { sessionExport } from "@/data/session-cube";
import {
  assignStacks,
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
  type RawExport,
} from "@/lib/cube-model";
import type { CubeView, FocusRequest } from "@/components/cube-scene";
import type { Bar } from "@/components/nest-charts";
import { cn } from "@/lib/utils";

const LIVE_ID = "live-feed";

function waitingLiveRaw(): RawExport {
  const walls = { left: true, right: true, front: true, back: true, top: true, bottom: true };
  return {
    exportedAt: new Date().toISOString(),
    mode: "LIVE FEED",
    totalEvents: 0,
    cube: {
      width: 10,
      height: 10,
      depth: 10,
      entrance: { face: "front", x: 0, y: 0, z: 0 },
      exit: { face: "back", x: 9, y: 9, z: 9 },
      cells: [{ x: 0, y: 0, z: 0, walls }],
    },
    pathIndex: [{ layer: 0, path: [{ order: 0, x: 0, y: 0, z: 0, events: [] }] }],
  };
}

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
  lights: 0.4,
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
  const [selectedIds, setSelectedIds] = useState<string[]>(["example"]);
  const [multi, setMulti] = useState(false);
  const [view, setView] = useState<CubeView>(INITIAL_VIEW);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [master, setMaster] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [readOpen, setReadOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [showScene, setShowScene] = useState(false);
  const [sceneLive, setSceneLive] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stackDims, setStackDims] = useState({ x: 10, y: 10, z: 10 });
  const [newStack, setNewStack] = useState(true);
  const [range, setRange] = useState({ from: 1, to: 1 });
  const [followAll, setFollowAll] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [hud, setHud] = useState({ session: true, master: true, events: true, walk: true });
  const [gpuEpoch, setGpuEpoch] = useState(0);
  // TF163: live feed state — off by default, per direct instruction.
  // Polls the same shared config the iOS admin console writes
  // (ashtree/analytics-live/config.json in leatr-ash) so starting/stopping
  // from either side reflects on both, and fetches the ready-to-load
  // export iOS already writes rather than reimplementing any nesting here.
  const [liveOn, setLiveOn] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [liveCubeId, setLiveCubeId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const liveSlotRef = useRef<LoadedCube["slot"] | null>(null);
  const liveMazeRef = useRef("");
  const liveSeenRef = useRef<string | null>(null);
  const gpuStamp = useRef(0);
  const remounting = useRef(false);
  const onGpuLost = useCallback(() => {
    if (remounting.current) return;
    const now = Date.now();
    if (now - gpuStamp.current < 2500) return;
    gpuStamp.current = now;
    remounting.current = true;
    setSceneLive(false);
    setGpuEpoch((n) => n + 1);
    window.setTimeout(() => {
      remounting.current = false;
    }, 1200);
  }, []);
  const toggleHud = (key: keyof typeof hud) => setHud((current) => ({ ...current, [key]: !current[key] }));
  const stepsRef = useRef<Record<string, number>>({ example: 0 });
  const playingRef = useRef(false);
  const masterRef = useRef(false);
  const rangeRef = useRef(range);
  const focusRef = useRef<FocusRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cubesRef = useRef(cubes);
  const selectedIdsRef = useRef(selectedIds);
  const multiRef = useRef(multi);
  cubesRef.current = cubes;
  selectedIdsRef.current = selectedIds;
  multiRef.current = multi;
  rangeRef.current = range;

  const primaryId = selectedIds[selectedIds.length - 1] ?? "";
  const selected = cubes.find((cube) => cube.id === primaryId);
  const selectedIndex = Math.max(0, cubes.findIndex((cube) => cube.id === selected?.id));

  useEffect(() => {
    if (followAll) setRange({ from: 1, to: Math.max(1, cubes.length) });
  }, [cubes.length, followAll]);

  useEffect(() => {
    setShowScene(true);
  }, []);

  // Live feed stays off until this viewer turns it on. Turning it on
  // puts one green edge-box into the scene and into the current
  // selection immediately, then keeps replacing that same cube's path
  // as the journal publishes new events. The slot and the walk step
  // stay put across polls.
  useEffect(() => {
    if (!liveOn) {
      setLiveActive(false);
      setLiveCubeId(null);
      setLiveStatus("");
      liveSlotRef.current = null;
      liveMazeRef.current = "";
      liveSeenRef.current = null;
      setCubes((prev) => (prev.some((cube) => cube.id.startsWith("live-")) ? prev.filter((cube) => !cube.id.startsWith("live-")) : prev));
      setSelectedIds((prev) => {
        if (!prev.some((id) => id.startsWith("live-"))) return prev;
        const next = prev.filter((id) => !id.startsWith("live-"));
        selectedIdsRef.current = next;
        return next;
      });
      return;
    }
    let cancelled = false;
    const gas = "https://script.google.com/macros/s/AKfycbyzkQxLR5miUXP6oDw-1AR1GIjgpzlw9iLw0gO_ZTeLfL849LWbNX7WVz_kf7yLWBKA_w/exec";
    const readLive = async (path: string) => {
      const res = await fetch(`${gas}?action=ashread&path=${encodeURIComponent(path)}&t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("proxy");
      const body = (await res.json()) as { ok?: boolean; error?: string; content?: unknown } | null;
      if (body == null) return null;
      if (body.ok === false) throw new Error(body.error || "unread");
      if (body.ok === true && "content" in body) return body.content;
      return body;
    };
    const placeLive = (raw: RawExport, status: string, active: boolean) => {
      const base = cubeFromRaw(raw, "Live Feed", false, LIVE_ID);
      if (!liveSlotRef.current) {
        const placed = assignStacks(
          cubesRef.current.filter((cube) => !cube.id.startsWith("live-")),
          [base],
          { x: 1, y: 1, z: 1 },
          true,
        )[0];
        liveSlotRef.current = placed.slot;
      }
      const liveCube = { ...base, slot: liveSlotRef.current };
      setCubes((prev) => [...prev.filter((cube) => !cube.id.startsWith("live-")), liveCube]);
      setLiveCubeId(LIVE_ID);
      setLiveActive(active);
      setLiveStatus(status);
      if (liveSeenRef.current !== LIVE_ID) {
        liveSeenRef.current = LIVE_ID;
        setSelectedIds((prev) => {
          const next = prev.includes(LIVE_ID) ? prev : [...prev, LIVE_ID];
          selectedIdsRef.current = next;
          return next;
        });
      }
    };
    placeLive(waitingLiveRaw(), "Waiting for the live table…", false);
    const poll = async () => {
      try {
        const config = (await readLive("ashtree/analytics-live/config.json")) as { enabled?: boolean; mazeId?: string } | null;
        if (cancelled) return;
        if (!config || !config.enabled || !config.mazeId) {
          setLiveActive(false);
          setLiveStatus(config ? "Off — no active session right now." : "Waiting for Autumn to publish the live table.");
          return;
        }
        const raw = (await readLive(`ashtree/analytics-live/${config.mazeId}/latest-export.json`)) as RawExport | null;
        if (cancelled) return;
        if (!raw || typeof raw !== "object" || !("cube" in raw)) {
          setLiveActive(false);
          setLiveStatus("Table is on. Waiting for the first events along the path.");
          return;
        }
        const total = raw.totalEvents ?? 0;
        placeLive(raw, `Live — ${total} events along the path, updated ${new Date().toLocaleTimeString()}.`, true);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "";
        setLiveActive(false);
        setLiveStatus(
          message.includes("Unknown")
            ? "The journal script isn't serving the live read yet — retrying."
            : "Live feed unreachable — will keep retrying.",
        );
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [liveOn]);

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

  const publish = useCallback((id: string, next: number, length: number, fanout = false) => {
    const clamped = Math.max(0, Math.min(length - 1, next));
    stepsRef.current[id] = clamped;
    if (fanout) {
      const ids = new Set(selectedIdsRef.current);
      for (const cube of cubesRef.current) {
        if (cube.id === id || !ids.has(cube.id)) continue;
        const limit = Math.max(0, cube.model.path.length - 1);
        stepsRef.current[cube.id] = Math.max(0, Math.min(limit, next));
      }
    }
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
      if (!id) {
        selectedIdsRef.current = [];
        setSelectedIds([]);
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      const prevIds = selectedIdsRef.current;
      const nextIds = !multiRef.current
        ? [id]
        : prevIds.includes(id)
          ? prevIds.filter((item) => item !== id)
          : [...prevIds, id];
      selectedIdsRef.current = nextIds;
      setSelectedIds(nextIds);
      const primary = nextIds[nextIds.length - 1] ?? "";
      setCubes((prev) => {
        if (prev.length <= 1 && primary) return prev.map((cube) => realizeCube(cube));
        return prev.map((cube) => (primary && cube.id === primary ? realizeCube(cube) : shellCube(cube)));
      });
      if (!primary) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      if (index == null || id !== primary) {
        playingRef.current = false;
        setPlaying(false);
        setStep(stepsRef.current[primary] ?? 0);
        return;
      }
      focusIndex(primary, index);
    },
    [focusIndex],
  );

  const selectAll = useCallback(() => {
    const ids = cubesRef.current.map((cube) => cube.id);
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
    const primary = ids[ids.length - 1] ?? "";
    setCubes((prev) => prev.map((cube) => (cube.id === primary ? realizeCube(cube) : shellCube(cube))));
    if (!primary) return;
    playingRef.current = false;
    setPlaying(false);
    setStep(stepsRef.current[primary] ?? 0);
  }, []);

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
    let placed = incoming;
    flushSync(() => {
      setCubes((prev) => {
        placed = assignStacks(prev, incoming, stackDims, newStack);
        const next = [...prev, ...placed];
        return next.map((cube) => (cube.id === first.id ? realizeCube(cube) : shellCube(cube)));
      });
      setSelectedIds([first.id]);
    });
    selectedIdsRef.current = [first.id];
    setStep(0);
    stepsRef.current[first.id] = 0;
    setFollowAll(true);
    setAutoRotate(false);
    setBusy(false);
    if (/Android/i.test(navigator.userAgent)) {
      remounting.current = true;
      gpuStamp.current = Date.now();
      setSceneLive(false);
      window.setTimeout(() => setGpuEpoch((n) => n + 1), 120);
      window.setTimeout(() => {
        remounting.current = false;
      }, 1600);
    }
    const extra = errors.length ? ` ${errors.length} skipped.` : "";
    const dimsByStack = new Map<number, string>();
    for (const cube of placed) dimsByStack.set(cube.slot.stack, `${cube.slot.nx}×${cube.slot.ny}×${cube.slot.nz}`);
    const dimKinds = [...new Set(dimsByStack.values())];
    const stackCount = dimsByStack.size;
    const stacked =
      dimKinds.length === 1
        ? `${stackCount} ${stackCount === 1 ? "stack" : "stacks"} of ${dimKinds[0]}`
        : `${stackCount} stacks`;
    setNotice(`Added ${incoming.length} ${incoming.length === 1 ? "cube" : "cubes"} in ${stacked}.${extra}`);
  };

  const patch = (partial: Partial<CubeView>) => setView((current) => ({ ...current, ...partial }));
  const model = selected?.model;
  const activeEvent = model ? markerIndexAt(model.path, step) : -1;
  const node = model ? model.path[Math.min(model.path.length - 1, Math.floor(step))] : undefined;
  const heading = node?.events[0] ? eventTitle(node.events[0]) : "Open corridor";
  const meanPath = average(briefs.map((brief) => brief.pathLength));
  const meanEvents = average(briefs.map((brief) => brief.events));
  const perStack = [stackDims.x, stackDims.y, stackDims.z]
    .map((value) => Math.min(10000, Math.max(1, Math.round(Number(value)) || 1)))
    .reduce((product, value) => product * value, 1);

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
                key={gpuEpoch}
                cubes={cubes}
                selectedId={selected?.id ?? ""}
                selectedIds={selectedIds}
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
                onGpuLost={onGpuLost}
                liveCubeId={liveCubeId}
              />
            </Suspense>
          ) : null}
        </div>

        <div className="stage-hud">
          <div className="stage-hud-body">
            <div className="stage-hud-main">
              {hud.session ? (
            <div className="pointer-events-auto glass w-full max-w-xl rounded-2xl px-4 py-3">
              <div className="flex items-start gap-2">
                <EyeButton label="Session Cube" open onClick={() => toggleHud("session")} />
                <div className="min-w-0">
              <p className="font-mono text-xs tracking-widest text-verdigris uppercase">This session</p>
              <h1 className="font-display text-3xl leading-none font-extrabold text-bone sm:text-4xl">Session Cube</h1>
              <p className="mt-2 max-w-md text-sm leading-snug text-mist">
                {selected
                  ? `${selected.name} · ${selected.model.width}×${selected.model.height}×${selected.model.depth} · ${selectedIds.length} selected · cube ${selectedIndex + 1} of ${cubes.length}`
                  : "Nothing selected — tap a cube, or use All"}
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
                    selectedIdsRef.current = ["example"];
                    setSelectedIds(["example"]);
                    setFollowAll(true);
                  }}
                  className="rounded-full bg-panel-2 px-3 py-2 text-xs text-bone"
                >
                  Example
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCubes([]);
                    selectedIdsRef.current = [];
                    setSelectedIds([]);
                    setFollowAll(true);
                    setNotice("");
                    stepsRef.current = {};
                    setStep(0);
                  }}
                  className="rounded-full bg-panel-2 px-3 py-2 text-xs text-mist"
                >
                  Clear
                </button>
                <button
                  type="button"
                  aria-pressed={multi}
                  onClick={() => setMulti((value) => !value)}
                  className={cn("rounded-full px-3 py-2 text-xs", multi ? "bg-brass text-ink" : "bg-panel-2 text-bone")}
                >
                  Multiple
                </button>
                <button type="button" onClick={selectAll} className="rounded-full bg-panel-2 px-3 py-2 text-xs text-bone">
                  All
                </button>
                <button type="button" onClick={() => selectCube("")} className="rounded-full bg-panel-2 px-3 py-2 text-xs text-mist">
                  None
                </button>
                <button
                  type="button"
                  aria-pressed={liveOn}
                  onClick={() => setLiveOn((value) => !value)}
                  title={liveStatus || "Show the live analytics feed from the sentient journal, if one is running"}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-medium",
                    liveActive ? "bg-verdigris text-ink" : liveOn ? "bg-panel-2 text-verdigris" : "bg-panel-2 text-mist",
                  )}
                >
                  {liveActive ? "● Live Feed" : "Live Feed"}
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
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-none text-mist">
                <label className="flex items-center gap-1">
                  X
                  <input
                    className="w-16 rounded bg-panel-2 px-1 py-0.5 font-mono text-bone"
                    type="number"
                    min={1}
                    max={10000}
                    value={stackDims.x}
                    aria-label="Stack X across"
                    title="Across"
                    suppressHydrationWarning
                    onChange={(event) =>
                      setStackDims((dims) => ({ ...dims, x: Math.min(10000, Math.max(1, Math.round(Number(event.target.value)) || 1)) }))
                    }
                  />
                  <span>across</span>
                </label>
                <label className="flex items-center gap-1">
                  Y
                  <input
                    className="w-16 rounded bg-panel-2 px-1 py-0.5 font-mono text-bone"
                    type="number"
                    min={1}
                    max={10000}
                    value={stackDims.y}
                    aria-label="Stack Y layers up"
                    title="Layers up"
                    suppressHydrationWarning
                    onChange={(event) =>
                      setStackDims((dims) => ({ ...dims, y: Math.min(10000, Math.max(1, Math.round(Number(event.target.value)) || 1)) }))
                    }
                  />
                  <span>layers up</span>
                </label>
                <label className="flex items-center gap-1">
                  Z
                  <input
                    className="w-16 rounded bg-panel-2 px-1 py-0.5 font-mono text-bone"
                    type="number"
                    min={1}
                    max={10000}
                    value={stackDims.z}
                    aria-label="Stack Z deep"
                    title="Deep"
                    suppressHydrationWarning
                    onChange={(event) =>
                      setStackDims((dims) => ({ ...dims, z: Math.min(10000, Math.max(1, Math.round(Number(event.target.value)) || 1)) }))
                    }
                  />
                  <span>deep</span>
                </label>
                <span className="font-mono text-bone">{perStack} per stack</span>
                <label className="flex items-center gap-1" title="Off keeps filling the last stack">
                  <input
                    type="checkbox"
                    className="size-3"
                    checked={newStack}
                    aria-label="Start a new stack"
                    suppressHydrationWarning
                    onChange={(event) => setNewStack(event.target.checked)}
                  />
                  Start a new stack
                </label>
              </div>
              {notice ? <p className="mt-2 text-xs text-mist">{notice}</p> : null}
              {liveOn && liveStatus ? <p className="mt-1 text-xs text-verdigris">{liveStatus}</p> : null}
                </div>
              </div>
            </div>
              ) : (
                <EyeButton label="Session Cube" open={false} onClick={() => toggleHud("session")} />
              )}
            </div>

            <div className="stage-hud-side">
              {hud.master ? (
            <div className="pointer-events-auto glass flex w-full gap-2 rounded-2xl p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
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
              <label className="flex items-center gap-3 text-xs text-mist">
                <span className="w-14 font-mono tracking-widest uppercase">Lights</span>
                <input
                  className="scrub"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(view.lights * 100)}
                  aria-label="Spotlight brightness"
                  suppressHydrationWarning
                  onChange={(event) => patch({ lights: Number(event.target.value) / 100 })}
                />
                <span className="w-8 font-mono text-bone">{view.lights <= 0.01 ? "Off" : Math.round(view.lights * 100)}</span>
              </label>
              </div>
              <EyeButton label="Play all" open onClick={() => toggleHud("master")} />
            </div>
              ) : (
                <EyeButton label="Play all" open={false} onClick={() => toggleHud("master")} />
              )}

              {hud.events ? (
                <section className="stage-events pointer-events-auto glass flex w-full min-h-0 flex-col overflow-hidden rounded-2xl">
                  <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                    <h2 className="min-w-0 flex-1 font-display text-lg text-bone">Events</h2>
                    <span className="font-mono text-xs text-mist">{model?.eventCount ?? 0}</span>
                    <EyeButton label="Events" open onClick={() => toggleHud("events")} />
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
              ) : (
                <EyeButton label="Events" open={false} onClick={() => toggleHud("events")} />
              )}
            </div>
          </div>

          <div className="flex items-end">
            {hud.walk ? (
            <div className="pointer-events-auto glass min-w-0 flex-1 rounded-2xl px-4 py-3">
              <div className="mb-2 flex items-start gap-2">
                <EyeButton label="Walk" open onClick={() => toggleHud("walk")} />
                <div className="min-w-0 flex-1">
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
                    aria-label={playing ? "Pause the selected walks" : "Play every selected walk"}
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
                  <button
                    type="button"
                    aria-label="How to read the cube"
                    onClick={() => setReadOpen(true)}
                    className="grid size-11 place-items-center rounded-full bg-panel-2 text-bone"
                  >
                    <BookOpen className="size-5" />
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
                aria-label="Scrub every selected walk"
                suppressHydrationWarning
                onChange={(event) => {
                  if (!selected) return;
                  playingRef.current = false;
                  masterRef.current = false;
                  setPlaying(false);
                  setMaster(false);
                  publish(selected.id, Number(event.target.value), selected.model.path.length, true);
                }}
              />
              <p className="mt-2 font-mono text-xs text-mist">
                Drag to orbit · play and scrub run every selected cube · green ring enters · coral ring exits
              </p>
            </div>
            ) : (
              <EyeButton label="Walk" open={false} onClick={() => toggleHud("walk")} />
            )}
          </div>
        </div>

        {readOpen && model ? (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70%] overflow-y-auto p-3">
            <section className="glass rounded-2xl p-3">
              <header className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg text-bone">How to read it</h2>
                <button
                  type="button"
                  aria-label="Close panel"
                  onClick={() => setReadOpen(false)}
                  className="grid size-11 place-items-center rounded-full bg-panel-2 text-bone"
                >
                  <X className="size-5" />
                </button>
              </header>
              <Readout model={model} />
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={multi}
              onClick={() => setMulti((value) => !value)}
              className={cn("rounded-full px-3 py-1.5 text-xs", multi ? "bg-brass text-ink" : "bg-panel-2 text-bone")}
            >
              Multiple
            </button>
            <button type="button" onClick={selectAll} className="rounded-full bg-panel-2 px-3 py-1.5 text-xs text-bone">
              All
            </button>
            <button type="button" onClick={() => selectCube("")} className="rounded-full bg-panel-2 px-3 py-1.5 text-xs text-mist">
              None
            </button>
          </div>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
            {cubes.map((cube, index) => (
              <button
                key={cube.id}
                type="button"
                aria-pressed={selectedIds.includes(cube.id)}
                onClick={() => selectCube(cube.id, null)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm",
                  cube.id === selected?.id ? "bg-panel-2 font-medium text-bone" : selectedIds.includes(cube.id) ? "bg-panel-2 text-bone" : "text-mist",
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

function EyeButton({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="stage-eye"
      aria-expanded={open}
      aria-label={open ? `Collapse ${label}` : `Show ${label}`}
      title={open ? `Hide ${label}` : label}
      onClick={onClick}
    >
      <Eye className="size-4" />
    </button>
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
