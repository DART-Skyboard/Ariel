"""Pure-Python (no bpy) tests: python3 blender/tests/test_solver.py"""
import os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'arc_flow'))

from core import sdf, world, fluids, materials, mathcards, units
from core import primitives as MS


def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        ok.fail += 1
ok.fail = 0


def test_units_math():
    ok(abs(units.to_kelvin(25, 'C') - 298.15) < 1e-9 and abs(units.from_kelvin(373.15, 'F') - 212.0) < 1e-6, "temperature units")
    T = mathcards.Term
    # (a / b) * Group A  where Group A = c + 2 ; a=8 b=2 c=1 -> 4*3 = 12
    terms = [T('ADD', 'CARD', 'a', 0, ''), T('DIV', 'CARD', 'b', 0, ''), T('MUL', 'GROUP', 'Group A', 0, ''),
             T('ADD', 'CARD', 'c', 0, 'Group A'), T('ADD', 'CONST', '', 2, 'Group A')]
    ok(mathcards.evaluate(terms, {'a': 8, 'b': 2, 'c': 1}.get) == 12.0, "math card with group = parentheses (12)")
    t2 = [T('ADD', 'CARD', 'a', 0, ''), T('ADD', 'CARD', 'b', 0, ''), T('MUL', 'CARD', 'c', 0, '')]
    ok(mathcards.evaluate(t2, {'a': 1, 'b': 2, 'c': 3}.get) == 7.0, "precedence: 1 + 2 * 3 = 7")
    ok(mathcards.evaluate([T('ADD', 'CARD', 'a', 0, ''), T('ROOT', 'CONST', '', 2, '')], {'a': 16}.get) == 4.0, "radical: 16 root 2 = 4")
    ok(mathcards.evaluate([T('ADD', 'CONST', '', 2, ''), T('POW', 'CONST', '', 3, ''), T('POW', 'CONST', '', 2, '')], {}.get) == 512.0, "exponent is right-associative: 2^3^2 = 512")
    ok(mathcards.evaluate([T('ADD', 'CARD', 'a', 0, ''), T('DIV', 'CONST', '', 0, '')], {'a': 5}.get) == 0.0, "divide by zero is safe")
    ok(mathcards.group_name(0) == 'Group A' and mathcards.group_name(27) == 'Group AB', "group naming A, B, ... AA")
    ok(fluids.fill_mass(fluids.FLUIDS['RP1'], 1.0, 101325, 290) > 800, "fill mass = volume x density")


def test_sdf():
    v, t = MS.uvsphere()
    s = sdf.soup_from_mesh(v, t)
    d = sdf.signed_distance(s, np.array([[0, 0, 0], [2, 0, 0], [0, 0, 0.99]]))
    ok(d[0] < -0.97 and abs(d[1] - 1.0) < 0.02 and d[2] < 0, "sphere signed distance sign/magnitude")
    v, t = MS.tube()
    f = sdf.PartField(v, t, 'AUTO', resolution=32)
    ok(f.mode == 'SOLID' and abs(f.cavity_volume() - np.pi * 0.64 * 4) / (np.pi * 0.64 * 4) < 0.08, "solid tube: auto SOLID, cavity volume within 8 %% (%.2f)" % f.cavity_volume())
    ok(len(f.openings) == 2, "solid tube: two openings detected")
    b = f.request_refine(np.array([[0, 0.8, 0.0], [0, 0.0, 0.8]]))
    ok(b > 0 and f.n_refined == b, "LOTCBP brick refinement on demand (%d bricks)" % b)
    s2 = sdf.virtual_subdivide(sdf.soup_from_mesh(*MS.box(4, 4, 4)), 1.0)
    ok(len(s2) > 12, "virtual tessellation splits long triangles (%d tris)" % len(s2))
    v, t = MS.uvsphere(n=8, m=4)
    base = sdf.soup_from_mesh(v, t)
    ph = sdf.virtual_subdivide(base, 0.4, phong=1.0)
    flat = sdf.virtual_subdivide(base, 0.4, phong=0.0)
    def spread(sp):
        r = np.linalg.norm(np.concatenate([sp.A, sp.B, sp.C]), axis=1)
        return abs(r.mean() - 1.0)
    ok(spread(ph) < spread(flat), "Phong tessellation moves virtual vertices toward the true curved surface (%.3f < %.3f)" % (spread(ph), spread(flat)))


def mk_world(continuous=True, tube_plug=False, P=5e5, fill=80.0):
    sv, st = MS.uvsphere(r=1.0, center=(0, 0, 0))
    tv, tt = MS.tube(L=4.0, r0=0.35, r1=0.25, center=(0, 0, 0))
    fl = [dict(name='water', spec=fluids.FLUIDS['WATER'], temp=293.15, color=(0, 0, 1))]
    parts = [
        world.PartSpec('tank', sdf.PartField(sv, st, 'SHELL', 32), np.eye(4), 'CONTAINER', fluid=0, fill_value=fill, pressure=P, n_particles=800),
        world.PartSpec('pipe', sdf.PartField(tv, tt, 'SOLID', 48), MS.translate(None, 2.2 if not tube_plug else 8.0, 0, 0), 'TRANSPORT'),
    ]
    return world.World(parts, fl, world.Env(), world.Params(continuous=continuous, net_res=36, vmax=40, seed=3)), parts


def test_sim():
    w, parts = mk_world()
    states = [o['state'] for o in w.openings]
    print("   openings:", [(o['part'], o['state']) for o in w.openings])
    ok(world.CONNECTED in states and world.OPEN in states, "pipe pushed into tank: one joint CONNECTED, far end OPEN")
    n_in0 = int(((w.state == 1) & (w.pin == 0)).sum())
    t0 = time.time()
    for k in range(60):
        w.step(1 / 30)
    el = time.time() - t0
    free = int((w.state == 2).sum())
    ok(free > 20, "pressurised tank leaks through connected pipe (%d free particles after 2 s, %.1fs cpu)" % (free, el))
    ok(w.pos[w.state > 0, 0].max() > 2.5, "fluid travelled down the pipe past x=2.5 (max x %.2f)" % w.pos[w.state > 0, 0].max())
    # finite mode depletes, continuous refills
    wf, _ = mk_world(continuous=False, P=1.6e5)
    wc, _ = mk_world(continuous=True, P=1.6e5)
    for k in range(150):
        wf.step(1 / 30); wc.step(1 / 30)
    inf_ = int(((wf.state == 1) & (wf.pin == 0)).sum()); inc = int(((wc.state == 1) & (wc.pin == 0)).sum())
    ok(inf_ < 0.1 * n_in0 and inc > 0.6 * n_in0, "continuous flow refills (%d in tank) vs finite depletes (%d in tank, started %d)" % (inc, inf_, n_in0))
    # plugging: move the pipe away -> its joint opening becomes OPEN (spills); tank itself closed -> nothing leaks
    wp, _ = mk_world(tube_plug=True)
    for k in range(30):
        wp.step(1 / 30)
    ok(int((wp.state == 2).sum()) == 0, "closed tank with pipe far away: sealed, no leak")
    wp.set_matrices([np.eye(4), MS.translate(None, 2.2, 0, 0)])
    ok(any(o['state'] == world.CONNECTED for o in wp.openings), "moving the pipe back re-detects the sealed joint dynamically")
    for k in range(60):
        wp.step(1 / 30)
    ok(int((wp.state == 2).sum()) > 0, "after re-joining, fluid flows out again")


if __name__ == '__main__':
    test_units_math(); test_sdf(); test_sim()
    print("FAILURES:", ok.fail)
    sys.exit(1 if ok.fail else 0)
