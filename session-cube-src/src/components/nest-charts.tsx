import { useEffect, useRef } from "react";
import * as THREE from "three";

export type Bar = { label: string; value: number; color: string };

function Bars({ bars }: { bars: Bar[] }) {
  const host = useRef<HTMLDivElement>(null);
  const key = bars.map((bar) => `${bar.label}:${bar.value.toFixed(3)}:${bar.color}`).join("|");

  useEffect(() => {
    const el = host.current;
    if (!el || bars.length === 0) return;
    const coarse =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
    renderer.setPixelRatio(coarse ? 1 : Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.maxWidth = "100%";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xd5ece4, coarse ? 1.4 : 0.85));
    if (!coarse) {
      const keyLight = new THREE.DirectionalLight(0xfff4e4, 2.2);
      keyLight.position.set(4, 8, 6);
      scene.add(keyLight);
      const rim = new THREE.DirectionalLight(0x3ecfb2, 0.8);
      rim.position.set(-6, 3, -4);
      scene.add(rim);
    }

    const count = Math.max(1, bars.length);
    const gap = 0.9;
    const width = Math.max(1.6, (count - 1) * gap);
    const max = Math.max(...bars.map((bar) => bar.value), 0.0001);
    bars.forEach((bar, index) => {
      const height = 0.25 + (bar.value / max) * 2.2;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 1, 0.48),
        coarse
          ? new THREE.MeshBasicMaterial({ color: bar.color })
          : new THREE.MeshStandardMaterial({
              color: bar.color,
              emissive: bar.color,
              emissiveIntensity: 0.18,
              roughness: 0.32,
              metalness: 0.42,
            }),
      );
      mesh.scale.y = height;
      mesh.position.set((index - (count - 1) / 2) * gap, height / 2, 0);
      scene.add(mesh);
    });

    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.6, 0.06, 1.4),
      new THREE.MeshBasicMaterial({ color: "#102026" }),
    );
    ground.position.y = -0.03;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    const fit = Math.max(4.5, width + 2.4);
    camera.position.set(fit * 0.72, fit * 0.62, fit * 1.05);
    camera.lookAt(0, 0.7, 0);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let raf = 0;
    let spin = 0.4;
    let last = performance.now();
    let onScreen = true;
    const stepMs = coarse ? 1000 / 15 : 1000 / 30;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!onScreen || document.visibilityState === "hidden") return;
      if (now - last < stepMs) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      spin += dt * 0.15;
      camera.position.x = Math.sin(spin) * fit * 0.85;
      camera.position.z = Math.cos(spin) * fit * 0.95;
      camera.position.y = fit * 0.55;
      camera.lookAt(0, 0.75, 0);
      renderer.render(scene, camera);
    };
    const seen = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
    });
    seen.observe(el);
    loop(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      seen.disconnect();
      observer.disconnect();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [key, bars]);

  return (
    <div>
      <div ref={host} className="h-52 w-full max-w-full overflow-hidden" />
      <ul className="mt-2 flex w-full max-w-full flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-mist">
        {bars.map((bar, index) => (
          <li key={`${bar.label}-${index}`}>
            <span style={{ color: bar.color }}>{bar.label}</span>{" "}
            {bar.value >= 20 ? Math.round(bar.value) : bar.value.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NestCharts({
  match,
  categories,
  mean,
}: {
  match: Bar[];
  categories: Bar[];
  mean: Bar[];
}) {
  return (
    <div className="flex w-full max-w-full flex-col gap-3">
      <figure className="glass w-full max-w-full rounded-2xl p-3">
        <figcaption className="mb-2">
          <p className="font-display text-lg text-bone">Match</p>
          <p className="text-xs text-mist">How closely each cube’s events match the one you selected. Full height is a perfect pattern match.</p>
        </figcaption>
        <Bars bars={match} />
      </figure>
      <figure className="glass w-full max-w-full rounded-2xl p-3">
        <figcaption className="mb-2">
          <p className="font-display text-lg text-bone">Categories</p>
          <p className="text-xs text-mist">Stage, tool, and emotion counts for this cube against the mean of the range.</p>
        </figcaption>
        <Bars bars={categories} />
      </figure>
      <figure className="glass w-full max-w-full rounded-2xl p-3">
        <figcaption className="mb-2">
          <p className="font-display text-lg text-bone">Mean</p>
          <p className="text-xs text-mist">Path, events, turns, and how much of the volume the walk covers. This cube beside the range average.</p>
        </figcaption>
        <Bars bars={mean} />
      </figure>
    </div>
  );
}
