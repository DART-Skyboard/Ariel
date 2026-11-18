"""Pure-Python unit tests of system grouping, linking, role detection and the outcome model: python3 blender/tests/test_systems.py"""
import sys
from engines import S, twin, engine, mat

fails = [0]


def ok(c, msg):
    print(("PASS " if c else "FAIL ") + msg)
    if not c:
        fails[0] += 1


# ---- grouping: two engines, no link -> two independent systems
PA, EA = engine('A_', 0.0, 20e5)
PB, EB = engine('B_', 11.0, 6e5)
det = S.detect({**PA, **PB}, EA + EB)
ok(len(det['systems']) == 2 and not det['links'] and len(det['groups']) == 2, "two engines without a pipe: 2 independent systems, no links")
ok([s['name'] for s in det['systems']] == ["Engine A", "Engine B"], "systems named by position (Engine A, Engine B)")
s0 = det['systems'][0]
ok(len(s0['containers']) == 2 and len(s0['fuel']) == 1 and len(s0['oxid']) == 1 and s0['chambers'] == ['A_Chamber'] and s0['nozzles'] == ['A_Nozzle'],
   "roles per system: 2 containers (fuel + oxidizer), chamber, nozzle")
ok(not s0['warnings'], "complete engine has no warnings")

# ---- linking / merging
for variant in ('GOOD', 'BAD'):
    P, E = twin(variant)
    det = S.detect(P, E)
    ok(len(det['systems']) == 2 and [l['pipe'] for l in det['links']] == ['Crossfeed'] and len(det['groups']) == 1 and det['groups'][0]['systems'] == ['S1', 'S2'],
       "%s: crossfeed pipe links the two systems into one group, own feed lines are not links" % variant)
    ok(len(det['systems'][0]['parts']) == 6 and len(det['systems'][1]['parts']) == 6, "%s: the crossfeed pipe belongs to neither system" % variant)
# removing the pipe again splits the group
P, E = twin('GOOD')
E2 = [e for e in E if 'Crossfeed' not in e]
ok(not S.detect(P, E2)['links'] and len(S.detect(P, E2)['groups']) == 2, "pipe removed: systems un-link")

# ---- warnings
P, E = engine('A_', 0.0, 20e5)
P.pop('A_OxTank'); E = [e for e in E if 'A_OxTank' not in e]
d = S.detect(P, E)
ok(any('oxidizer' in w for w in d['systems'][0]['warnings']) or any('fuel' in w for w in d['systems'][0]['warnings']), "missing tank: warning %s" % d['systems'][0]['warnings'])
P, E = engine('A_', 0.0, 20e5)
P.pop('A_Chamber'); P.pop('A_Nozzle'); E = [e for e in E if 'A_Chamber' not in e and 'A_Nozzle' not in e]
ok('no combustion chamber' in S.detect(P, E)['systems'][0]['warnings'], "no chamber warning")

# ---- role detection from geometry only
P, E = engine('A_', 0.0, 20e5)
for p in P.values():
    p['role'], p['declared'] = 'NONE', False
roles = S.resolve_roles(P, E)
want = dict(A_FuelTank='CONTAINER', A_OxTank='CONTAINER', A_FuelLine='TRANSPORT', A_OxLine='TRANSPORT', A_Chamber='CHAMBER', A_Nozzle='CHAMBER')
ok(roles == want, "roles detected from geometry alone: %s" % roles)

# ---- fuel / oxidizer assignment: override, fluid role, name hint, order
a = S.make_part('Tank1', 'CONTAINER'); b = S.make_part('Tank2', 'CONTAINER')
ok((S.prop_role_of(a, 0), S.prop_role_of(b, 1)) == ('FUEL', 'OXIDIZER'), "default fluids by container order")
c = S.make_part('LOX_tank', 'CONTAINER')
ok(S.prop_role_of(c, 0) == 'OXIDIZER', "name hint")
c['prop_override'] = 'FUEL'
ok(S.prop_role_of(c, 0) == 'FUEL', "visible override wins")

# ---- outcome classification
def run(variant, **kw):
    P, E = twin(variant, **kw)
    sim = S.GroupSim(P, E)
    hist = []
    for _ in range(24 * 6):
        sim.step(1 / 24)
        hist.append({k: v['status'] for k, v in sim.summary().items()})
    return sim, hist


sim, hist = run('GOOD')
sm = sim.summary()
ok(hist[0] == {'S1': 'idle', 'S2': 'idle'}, "GOOD: idle before ignition")
ok(sm['S1']['status'] == 'running' and sm['S2']['status'] == 'enhanced', "GOOD: engine A runs, engine B enhanced (%s)" % {k: v['status'] for k, v in sm.items()})
ok(sm['S2']['thrust'] > 1.05 * sm['S2']['thrust_base'] and abs(sm['S2']['MR'] / 2.56 - 1) < abs(1.19 / 2.56 - 1), "GOOD: thrust up %.0f%%, mixture ratio %.2f moved toward the optimum" % (
    100 * (sm['S2']['thrust'] / sm['S2']['thrust_base'] - 1), sm['S2']['MR']))
ok(not sim.failed, "GOOD: no wall failure (pressures within hoop limits)")
ok('running' in [h['S2'] for h in hist] and hist[-1]['S2'] == 'enhanced', "GOOD: status sequence idle -> running -> enhanced")

sim, hist = run('BAD')
sm = sim.summary()
ok(sm['S2']['status'] == 'failed' and sm['S2']['reason'], "BAD: engine B failed: %s" % sm['S2']['reason'][:100])
ok(any(e['kind'] == 'RUPTURE' and e['part'] == 'B_FuelTank' for e in sim.events), "BAD: rupture event fired at the fuel tank")
ok('backflow' in sm['S2']['reason'] or 'hot' in sm['S2']['reason'], "BAD: reason names the hot gas backflow")
ok(hist[0]['S2'] == 'idle' and 'failed' in [h['S2'] for h in hist], "BAD: status sequence idle -> failed")

# crossfeed toggle off: both engines just run
P, E = twin('BAD')
sim = S.GroupSim(P, E, links_enabled=False)
sim.run(4.0)
ok({v['status'] for v in sim.summary().values()} == {'running'} and not sim.failed, "crossfeed disabled: both engines run normally")

# hoop-stress rule: thin wall chamber at high pressure
P, E = twin('GOOD')
P['B_FuelTank']['wall'] = 0.0003
sim = S.GroupSim(P, E, links_enabled=False)
sim.run(3.0)
ok(sim.summary()['S2']['status'] == 'failed' and 'wall stress' in sim.summary()['S2']['reason'], "thin wall exceeds the hoop-stress limit -> failed: %s" % sim.summary()['S2']['reason'][:80])

print("FAILURES:", fails[0])
sys.exit(1 if fails[0] else 0)
