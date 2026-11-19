"""Fast-path benchmark: blender -b --factory-startup --python blender/tests/bench_retopo.py -- 100000 1000000
Builds a triangulated UV sphere with ~N faces (NumPy, foreach_set), runs fast_stages and prints per-stage timings."""
import os, sys, time, json
import numpy as np, bpy
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from arc_flow import retopo_fast_ops as FO
from arc_flow.core import retopo as R


def make_sphere(target_faces):
    n_u = int((target_faces / 2) ** 0.5 * 1.41); n_v = n_u // 2
    th = np.linspace(0, np.pi, n_v + 1)[1:-1]; ph = np.linspace(0, 2 * np.pi, n_u, endpoint=False)
    T, P = np.meshgrid(th, ph, indexing='ij')
    r = 1.0 + 0.08 * np.sin(6 * T) * np.sin(5 * P) ** 2          # bumps (mirror-symmetric about the XZ-plane? kept simple)
    V = np.stack([r * np.sin(T) * np.cos(P), r * np.sin(T) * np.sin(P), r * np.cos(T)], -1).reshape(-1, 3)
    V = np.vstack([[0, 0, 1], V, [0, 0, -1]]).astype(np.float32)
    nrow = n_v - 1
    idx = lambda j, i: 1 + j * n_u + (i % n_u)
    i0 = np.arange(n_u)
    tris = [np.stack([np.zeros(n_u, int), idx(0, i0), idx(0, i0 + 1)], 1)]
    jj, ii = np.meshgrid(np.arange(nrow - 1), np.arange(n_u), indexing='ij'); jj = jj.ravel(); ii = ii.ravel()
    a = idx(jj, ii); b = idx(jj, ii + 1); c = idx(jj + 1, ii); d = idx(jj + 1, ii + 1)
    tris += [np.stack([a, c, b], 1), np.stack([b, c, d], 1)]
    tris.append(np.stack([np.full(n_u, len(V) - 1), idx(nrow - 1, i0 + 1), idx(nrow - 1, i0)], 1))
    F = np.concatenate(tris).astype(np.int32)
    me = bpy.data.meshes.new("bench")
    me.vertices.add(len(V)); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(len(F) * 3); me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(len(F), dtype=np.int32) * 3)
    me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.update(calc_edges=True)
    uv = me.uv_layers.new(name="UVMap")
    vuv = np.stack([np.arctan2(V[:, 1], V[:, 0]) / (2 * np.pi) + 0.5, np.arccos(np.clip(V[:, 2] / np.linalg.norm(V, axis=1), -1, 1)) / np.pi], 1)
    uvd = vuv[F.ravel()].astype(np.float32)          # coherent UVs (one seam), like a real unwrap
    uv.data.foreach_set('uv', uvd.ravel())
    ob = bpy.data.objects.new("bench", me); bpy.context.scene.collection.objects.link(ob)
    return ob


def run(n, res=1.0, **kw):
    ob = make_sphere(n)
    nf = len(ob.data.polygons)
    st = R.RemeshSettings(resolution=res, **kw)
    gen = FO.fast_stages(ob, st, evaluated=False)
    t = time.time()
    try:
        while True:
            next(gen)
    except StopIteration as e:
        new, rep = e.value
    wall = time.time() - t
    out = len(new.data.polygons) if new else 0
    print("BENCH", json.dumps({"input_faces": nf, "res": res, "output_faces": out, "method": rep.get("method"),
                              "quad_ratio": round(rep.get("output", {}).get("quad_ratio", 0), 4), "wall_s": round(wall, 1),
                              "timing": rep["timing"], "peak_rss_mb": rep.get("peak_rss_mb"),
                              "deviation": rep.get("quality", {}).get("max_deviation"), "sym": rep.get("symmetry", {}).get("class"),
                              "error": rep.get("error")}))
    bpy.data.objects.remove(ob)
    if new:
        bpy.data.objects.remove(new)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["100000"]
    for a in args:
        n, _, res = a.partition("x")
        run(int(n), float(res) if res else 1.0)
