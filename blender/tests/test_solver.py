"""Pure-Python (no bpy) tests: python3 blender/tests/test_solver.py"""
import os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'arc_flow'))

from core import sdf, world, fluids, materials, mathcards, units, atmosphere, cavity
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
    ok(b > 0 and f.n_refined == b, "LOTBCBP brick refinement on demand (%d bricks)" % b)
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


def mk_world(continuous=True, tube_plug=False, P=5e5, fill=80.0, env=None, extra=None):
    sv, st = MS.uvsphere(r=1.0, center=(0, 0, 0))
    tv, tt = MS.tube(L=4.0, r0=0.35, r1=0.25, center=(0, 0, 0))
    fl = [dict(name='water', spec=fluids.FLUIDS['WATER'], temp=293.15, color=(0, 0, 1))]
    parts = [
        world.PartSpec('tank', sdf.PartField(sv, st, 'SHELL', 32), np.eye(4), 'CONTAINER', fluid=0, fill_value=fill, pressure=P, n_particles=800),
        world.PartSpec('pipe', sdf.PartField(tv, tt, 'SOLID', 48), MS.translate(None, 2.2 if not tube_plug else 8.0, 0, 0), 'TRANSPORT'),
    ]
    parts += extra or []
    return world.World(parts, fl, env or world.Env(), world.Params(continuous=continuous, net_res=36, vmax=40, seed=3)), parts


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


def test_atmosphere():
    A = atmosphere
    ok(all(abs(sum(p['mix'].values()) - 1.0) < 0.01 for p in A.PRESETS.values()), "preset mixes sum to 1 (+-1 %)")
    ok(len(A.COMPOUNDS) >= 10 and all(k in A.COMPOUNDS for k in ('N2', 'O2', 'AR', 'CO2', 'CH4', 'H2', 'HE', 'H2O', 'NH3', 'SO2')), "compound table has the ten required gases")
    e = A.preset_state('EARTH')
    ok(abs(e['molar'] - 0.02896) < 3e-4 and abs(e['rho'] - 1.225) < 0.01, "Earth: M %.5f rho %.4f" % (e['molar'], e['rho']))
    ok(abs(e['gamma'] - 1.40) < 0.01 and 335 < e['sound'] < 345, "Earth: gamma %.3f, sound %.0f m/s" % (e['gamma'], e['sound']))
    ok(1.7e-5 < A.viscosity(A.PRESETS['EARTH']['mix'], 288.15) < 1.85e-5, "Earth viscosity (Sutherland + Herning-Zipperer) %.3e Pa s" % A.viscosity(A.PRESETS['EARTH']['mix'], 288.15))
    ok(0.012 < A.preset_state('MARS')['rho'] < 0.022, "Mars rho %.4f kg/m3" % A.preset_state('MARS')['rho'])
    ok(55 < A.preset_state('VENUS')['rho'] < 75, "Venus rho %.1f kg/m3" % A.preset_state('VENUS')['rho'])
    ok(4.5 < A.preset_state('TITAN')['rho'] < 6.0, "Titan rho %.2f kg/m3" % A.preset_state('TITAN')['rho'])
    ok(0.14 < A.preset_state('JUPITER')['rho'] < 0.19 and A.preset_state('JUPITER')['molar'] < 0.003, "Jupiter rho %.3f, light H2/He mix" % A.preset_state('JUPITER')['rho'])
    ok(A.PRESETS['JUPITER']['gravity'] > 24 and abs(A.PRESETS['MARS']['gravity'] - 3.721) < 1e-3, "preset gravity (Jupiter 24.79, Mars 3.721)")
    ok(A.viscosity({'N2': 1.0}, 600) > A.viscosity({'N2': 1.0}, 300), "gas viscosity rises with temperature")
    n = A.normalise({'N2': 2.0, 'O2': 2.0, 'FOO': 5.0, 'AR': -1})
    ok(abs(n['N2'] - 0.5) < 1e-12 and set(n) == {'N2', 'O2'}, "mix normalisation drops unknown / negative entries")
    ok(A.fog_density(65.0) <= 0.2 and A.fog_density(1.225) == 0.002, "fog density capped for render time")


def test_environment_in_solver():
    # ambient pressure above the tank pressure: a joint-less open pipe end does not spill; vacuum spills hard
    hi, _ = mk_world(P=5e5, env=world.Env(pressure=9.2e6, density=65.0))
    lo, _ = mk_world(P=5e5, env=world.Env(pressure=0.0, density=0.0, gravity=(0, 0, -1.6)))
    for k in range(40):
        hi.step(1 / 30); lo.step(1 / 30)
    ok(int((hi.state == 2).sum()) < 0.2 * int((lo.state == 2).sum()) + 5, "dense ambient (Venus) suppresses the spill (%d) vs vacuum (%d free)" % ((hi.state == 2).sum(), (lo.state == 2).sum()))
    # Stokes drag of the ambient gas slows free droplets more in a viscous / dense atmosphere
    a, _ = mk_world(P=5e5, env=world.Env(pressure=101325, density=1.225, mu=1.8e-5))
    b, _ = mk_world(P=5e5, env=world.Env(pressure=101325, density=1.225, mu=2.0e-1))
    for k in range(60):
        a.step(1 / 30); b.step(1 / 30)
    va = np.linalg.norm(a.vel[a.state == 2], axis=1).mean(); vb = np.linalg.norm(b.vel[b.state == 2], axis=1).mean()
    ok(vb < va, "more viscous ambient gas drags spilled fluid more (%.2f < %.2f m/s)" % (vb, va))
    # gas exhaust expands as the ambient pressure drops
    def gas_world(pamb):
        sv, st = MS.uvsphere(r=1.0)
        tv, tt = MS.tube(L=4.0, r0=0.35, r1=0.25)
        fl = [dict(name='he', spec=fluids.FLUIDS['HE'], temp=293.15, color=(1, 1, 1))]
        parts = [world.PartSpec('tank', sdf.PartField(sv, st, 'SHELL', 32), np.eye(4), 'CONTAINER', fluid=0, fill_value=80.0, pressure=6e5, n_particles=500),
                 world.PartSpec('pipe', sdf.PartField(tv, tt, 'SOLID', 48), MS.translate(None, 2.2, 0, 0), 'TRANSPORT')]
        return world.World(parts, fl, world.Env(pressure=pamb, density=0.1), world.Params(continuous=True, net_res=36, vmax=40, seed=3))
    g1, g2 = gas_world(101325.0), gas_world(2000.0)
    for k in range(60):
        g1.step(1 / 30); g2.step(1 / 30)
    r1 = g1.rad[g1.state == 2].mean() if (g1.state == 2).any() else 0; r2 = g2.rad[g2.state == 2].mean() if (g2.state == 2).any() else 0
    ok(r2 > 1.2 * r1 > 0, "exhaust gas expands more into a thin atmosphere (particle radius %.4f vs %.4f)" % (r2, r1))


def test_cavity_union():
    w, parts = mk_world()
    rep = cavity.classify(w)
    ok(len(rep['joints']) == 1 and rep['joints'][0]['a'] == 0 and rep['joints'][0]['b'] == 1, "tank + pipe: one joint between parts 0 and 1")
    ok(rep['assemblies'] == [[0, 1]], "connected cavities form one assembly %s" % rep['assemblies'])
    ok(rep['joints'][0]['volume'] > 0 and rep['connected'] == 1 and rep['spilling'] == 1 and rep['plugged'] == 0,
       "joint volume > 0; openings: %d connected, %d spilling, %d plugged" % (rep['connected'], rep['spilling'], rep['plugged']))
    ok(cavity.joints_of(rep, 0) == [1] and cavity.joints_of(rep, 1) == [0], "joint partners")
    ok(cavity.summary(rep) == "1 joints | 0 plugged | 1 spilling", "status line: " + cavity.summary(rep))
    far, _ = mk_world(tube_plug=True)
    r2 = cavity.classify(far)
    ok(r2['joints'] == [] and r2['assemblies'] == [], "pipe far away: no joint, no assembly")
    # plugged: pipe mouth pressed against the tank surface from outside (touching, cavities do not overlap)
    sv, st = MS.uvsphere(r=1.0)
    tv, tt = MS.tube(L=4.0, r0=0.35, r1=0.25)
    fl = [dict(name='water', spec=fluids.FLUIDS['WATER'], temp=293.15, color=(0, 0, 1))]
    def touching(x):
        parts = [world.PartSpec('tank', sdf.PartField(sv, st, 'SHELL', 32), np.eye(4), 'CONTAINER', fluid=0, fill_value=50.0, pressure=2e5, n_particles=200),
                 world.PartSpec('pipe', sdf.PartField(tv, tt, 'SOLID', 48), MS.translate(None, x, 0, 0), 'TRANSPORT')]
        return world.World(parts, fl, world.Env(), world.Params(net_res=36, seed=3))
    pl = cavity.classify(touching(3.05))
    ok(pl['plugged'] + pl['connected'] >= 1 and pl['spilling'] >= 1, "pipe pressed on the tank surface: mouth is plugged / connected (%s)" % cavity.summary(pl))
    # moving it back inside changes the classification dynamically
    w2 = touching(8.0)
    ok(cavity.classify(w2)['assemblies'] == [], "far pipe: separate")
    w2.set_matrices([np.eye(4), MS.translate(None, 2.2, 0, 0)])
    ok(cavity.classify(w2)['assemblies'] == [[0, 1]], "moved into the tank: joint re-classified dynamically")


def test_surface_nets_and_union_region():
    n = 28
    g = np.linspace(-1.5, 1.5, n); h = g[1] - g[0]
    X, Y, Z = np.meshgrid(g, g, g, indexing='ij')
    v, t = cavity.surface_nets(np.sqrt(X ** 2 + Y ** 2 + Z ** 2) - 1.0, np.array([-1.5] * 3), h)
    ok(abs(cavity.mesh_volume(v, t) - 4.18879) / 4.18879 < 0.08 and cavity.is_closed_manifold(v, t), "surface nets: closed manifold sphere, volume within 8 percent")
    ok(cavity.is_closed_manifold(*MS.uvsphere()) and not cavity.is_closed_manifold(MS.uvsphere()[0], MS.uvsphere()[1][:-3]), "closed-manifold test accepts a sphere, rejects an open one")
    f = sdf.PartField(*MS.tube(), 'AUTO', 32)
    cv, ct = cavity.cavity_mesh(f, 40)
    ok(cavity.is_closed_manifold(cv, ct) and abs(cavity.mesh_volume(cv, ct) - np.pi * 0.64 * 4) / (np.pi * 0.64 * 4) < 0.12,
       "solid tube: capped cavity mesh rebuilt from the field (volume %.2f)" % cavity.mesh_volume(cv, ct))
    # the Boolean union region (role CAVITY) joins the solver without changing the physics
    uv, ut = MS.uvsphere(r=1.0)
    ucav = world.PartSpec('union', sdf.PartField(uv, ut, 'SHELL', 32), np.eye(4), 'CAVITY')
    w, parts = mk_world(extra=[ucav])
    ok(all(o['part'] != 2 for o in w.openings), "union region is never an opening source")
    for k in range(60):
        w.step(1 / 30)
    ok(int((w.state == 2).sum()) > 20 and (w.pin[w.state == 1] != 2).all(), "sim with a CAVITY union region still leaks through the joint; the union never owns particles")
    ok(len(cavity.classify(w)['joints']) == 1, "union region is ignored by the joint classification")


if __name__ == '__main__':
    test_units_math(); test_sdf(); test_sim(); test_atmosphere(); test_environment_in_solver(); test_cavity_union(); test_surface_nets_and_union_region()
    print("FAILURES:", ok.fail)
    sys.exit(1 if ok.fail else 0)
