"""Multi-system detection, crossfeed links and a simplified outcome model (pure NumPy / stdlib, no bpy).

Tessera Projection (LOTBCBP) treats every connected set of 3D parts as one *system*.  This module

  1. classifies parts (container / transport / chamber) from simple geometric features when the user did not set a role,
  2. groups parts into independent systems (connected components of the joint graph),
  3. finds *crossfeed links*: transport parts that join two otherwise independent engines (each with its own chamber),
  4. computes per-system requirements (feed pressures, mixture ratio, chamber pressure, thrust estimate, warnings),
  5. runs a deterministic lumped-parameter model (`GroupSim`) that routes flow along the links and classifies the
     result: idle / running / enhanced / failed, with the reason and the rupture event.

THIS IS A SIMPLIFIED TRACER-LEVEL MODEL, NOT CFD.  Quasi-steady orifice flow, a choked nozzle, a parabolic
mixture-ratio efficiency curve, first-order "visual" time constants for pressurisation and wall heating, and the thin-wall
hoop-stress + derated-yield check from `core.materials`.  Numbers are for relative comparison (good vs bad connection),
not for engineering sign-off.
"""
import math
from collections import deque

from . import materials as M

R_U = 8.314462618
P_ATM = 101325.0

# mixture ratio (oxidizer mass / fuel mass) giving the best performance, per fuel preset (rounded handbook values)
MR_OPT = {'RP1': 2.56, 'LH2': 5.5, 'LCH4': 3.2, 'HYDRAZINE': 1.0}
MR_DEFAULT = 2.5
# lumped model constants (documented in the README)
CD = 0.8                 # orifice discharge coefficient of feed lines and crossfeed pipes
GAMMA = 1.2              # exhaust heat-capacity ratio
M_GAS = 0.022            # kg/mol, combustion products
ETA_N = 0.95             # nozzle efficiency
T_IGNITE = 0.5           # s: engines light after this model time
T_RAMP = 0.5             # s: chamber pressure ramp
TAU_LINK = 0.8           # s: pressurisation time constant for 1 m3 ullage and a 0.05 m2 pipe (visual time constant)
TAU_WALL = 1.2           # s: wall heating time constant
T_DWELL = 0.4            # s: hot gas inside a propellant tank before it counts as an ignition / rupture event
WALL_HEAT = {'CHAMBER': 0.10, 'TANK_HOT': 0.25, 'PIPE_HOT': 0.10}   # fraction of (T_gas - 300 K) seen by the wall
INJ_K = 0.02             # injector orifice area per propellant stream, as a fraction of the throat area (in series with the feed line)
ENHANCE_GAIN = 1.05      # thrust ratio (with links / without) from which a system counts as Enhanced


def make_part(name, role='NONE', **kw):
    """Feature record of one part.  Lengths m, volume m3, pressure Pa (0 = ambient)."""
    p = dict(name=name, role=role, declared=role not in ('NONE', ''), volume=0.0, length=0.0, r_eq=0.0, aspect=1.0, closed=True,
             open_r=[], taper=1.0, wall=0.005, material=dict(M.material('INDUSTRIAL_STEEL')), fluid='', fluid_preset='', rho=0.0,
             prop_role='', prop_override='AUTO', flame_t=293.15, fill=0.0, pressure=0.0, pos=(0.0, 0.0, 0.0), kind='')
    p.update(kw)
    return p


# ----------------------------------------------------------------------------- role detection
def classify_features(p):
    """Role from geometry alone: 'TRANSPORT' (tube-like, open), 'CHAMBER' (tapered open bell), 'CONTAINER' (closed volume)."""
    n_open = len(p['open_r'])
    if n_open >= 2 and p['taper'] >= 1.3 and p['aspect'] < 6.0:
        return 'CHAMBER'                       # converging / diverging open part = nozzle / throat section
    if n_open >= 1 and p['aspect'] >= 2.5:
        return 'TRANSPORT'                     # thin channel, open ended
    if n_open == 0 and p['aspect'] >= 6.0:
        return 'TRANSPORT'                     # closed but extremely slender: hose / line modelled as a closed tube
    return 'CONTAINER'


def resolve_roles(parts, edges):
    """Effective role per part name: the declared role wins; otherwise geometry; then a chamber promotion pass:
    a compact closed part that touches a nozzle (tapered open part) and has two or more inlets is the chamber."""
    adj = adjacency(parts, edges)
    roles = {}
    for n, p in parts.items():
        roles[n] = p['role'] if p['declared'] else classify_features(p)
    nozzles = {n for n, p in parts.items() if roles[n] == 'CHAMBER' and len(p['open_r']) >= 2 and p['taper'] >= 1.3}
    for n, p in parts.items():
        if p['declared'] or roles[n] != 'CONTAINER':
            continue
        if adj[n] & nozzles and len(adj[n] - nozzles) >= 2:
            roles[n] = 'CHAMBER'
    return roles


# ----------------------------------------------------------------------------- graph
def adjacency(parts, edges):
    adj = {n: set() for n in parts}
    for a, b in edges:
        if a in adj and b in adj and a != b:
            adj[a].add(b)
            adj[b].add(a)
    return adj


def components(nodes, adj, removed=()):
    removed = set(removed)
    seen, out = set(), []
    for n in sorted(nodes):
        if n in seen or n in removed:
            continue
        comp, dq = [], deque([n])
        seen.add(n)
        while dq:
            x = dq.popleft()
            comp.append(x)
            for y in sorted(adj[x]):
                if y not in seen and y not in removed:
                    seen.add(y)
                    dq.append(y)
        out.append(sorted(comp))
    return out


def _name_hint(name):
    low = name.lower()
    if 'lox' in low or 'oxid' in low or 'ox' in low.replace('box', ''):
        return 'OXIDIZER'
    if 'fuel' in low:
        return 'FUEL'
    return ''


def prop_role_of(p, order):
    """FUEL / OXIDIZER of a container: explicit override, else the assigned fluid's role, else a name hint, else the order."""
    if p['prop_override'] in ('FUEL', 'OXIDIZER'):
        return p['prop_override']
    if p.get('prop_eff'):
        return p['prop_eff']
    if p['prop_role'] in ('FUEL', 'OXIDIZER'):
        return p['prop_role']
    return _name_hint(p['name']) or ('FUEL' if order % 2 == 0 else 'OXIDIZER')


# ----------------------------------------------------------------------------- detection
def detect(parts, edges):
    """parts: {name: make_part(...)}, edges: [(a, b)] joints (cavity overlaps).  Returns dict(roles, systems, links, groups).

    systems: [dict(id, name, parts, containers, transports, chambers, nozzles, fuel, oxid, warnings)] ordered by x position
    links:   [dict(pipe, ends [(part, system)], systems [ids])]  crossfeed pipes joining two engine systems
    groups:  [dict(id, systems [ids], links [pipe names])]  systems joined by links (linked-systems groups)"""
    roles = resolve_roles(parts, edges)
    names = [n for n in parts if roles[n] in ('CONTAINER', 'TRANSPORT', 'CHAMBER')]
    sub = {n: parts[n] for n in names}
    adj = adjacency(sub, edges)
    chamber_set = {n for n in names if roles[n] == 'CHAMBER'}
    # crossfeed pipes: removing a transport part splits the graph into components that are each a complete engine
    # (a chamber, and containers for both propellants).  Pass 2 (broken engines): every component only needs a chamber.
    hint = {}
    for x in sorted(n for n in names if roles[n] == 'CONTAINER'):
        p = parts[x]
        hint[x] = p['prop_override'] if p['prop_override'] in ('FUEL', 'OXIDIZER') else (p['prop_role'] if p['prop_role'] in ('FUEL', 'OXIDIZER') else _name_hint(p['name']))

    def complete(c):
        if not chamber_set & set(c):
            return False
        cont = [x for x in c if roles[x] == 'CONTAINER']
        nf = sum(hint[x] in ('FUEL', '') for x in cont)
        no = sum(hint[x] in ('OXIDIZER', '') for x in cont)
        return len(cont) >= 2 and nf >= 1 and no >= 1

    link_pipes = []
    for test in (complete, lambda c: bool(chamber_set & set(c))):
        for n in sorted(names):
            if roles[n] != 'TRANSPORT' or n in link_pipes:
                continue
            comps = components(names, adj, removed=link_pipes + [n])
            engines = [c for c in comps if test(c)]
            if len(engines) >= 2 and sum(1 for c in engines if set(c) & adj[n]) >= 2:
                link_pipes.append(n)
        if link_pipes:
            break
    comps = [c for c in components(names, adj, removed=link_pipes) if any(roles[x] != 'TRANSPORT' for x in c)]   # loose pipes are no system
    comps.sort(key=lambda c: (sum(parts[x]['pos'][0] for x in c) / len(c), c[0]))
    systems = []
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for k, c in enumerate(comps):
        cont = sorted([x for x in c if roles[x] == 'CONTAINER'], key=lambda x: (parts[x]['name']))
        ch_all = [x for x in c if roles[x] == 'CHAMBER']
        nozz = [x for x in ch_all if len(parts[x]['open_r']) >= 2 and parts[x]['taper'] >= 1.3]
        body = [x for x in ch_all if x not in nozz] or ch_all
        trans = [x for x in c if roles[x] == 'TRANSPORT']
        fuel, oxid = [], []
        for i, x in enumerate(cont):
            r = prop_role_of(parts[x], i)
            parts[x]['prop_eff'] = r
            (fuel if r == 'FUEL' else oxid).append(x)
        s = dict(id="S%d" % (k + 1), name="Engine %s" % (letters[k] if k < 26 else k + 1), parts=c, containers=cont, transports=trans,
                 chambers=body, nozzles=nozz, fuel=fuel, oxid=oxid, warnings=[])
        s['warnings'] = system_warnings(s, parts, adj)
        systems.append(s)
    sys_of = {x: s['id'] for s in systems for x in s['parts']}
    links = []
    for pipe in link_pipes:
        ends = [(x, sys_of[x]) for x in sorted(adj[pipe]) if x in sys_of]
        links.append(dict(pipe=pipe, ends=ends, systems=sorted({e[1] for e in ends})))
    # linked groups = components over systems joined by links
    par = {s['id']: s['id'] for s in systems}

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    for L in links:
        for a in L['systems'][1:]:
            par[find(a)] = find(L['systems'][0])
    gd = {}
    for s in systems:
        gd.setdefault(find(s['id']), []).append(s['id'])
    groups = []
    for k, ids in enumerate(sorted(gd.values())):
        groups.append(dict(id="G%d" % (k + 1), systems=ids, links=[L['pipe'] for L in links if set(L['systems']) <= set(ids)]))
    return dict(roles=roles, systems=systems, links=links, groups=groups, link_pipes=link_pipes)


def system_warnings(s, parts, adj):
    w = []
    if not s['chambers']:
        w.append("no combustion chamber")
    if not s['containers']:
        w.append("no propellant container")
    else:
        if not s['oxid']:
            w.append("no oxidizer source")
        if not s['fuel']:
            w.append("no fuel source")
    if s['chambers'] and not s['nozzles'] and not any(parts[c]['open_r'] for c in s['chambers']):
        w.append("chamber has no throat / nozzle opening")
    if s['chambers']:
        reach = set(path_nodes(adj, s['chambers'][0], s['parts']))
        for c in s['containers']:
            if c not in reach:
                w.append("%s is not connected to the chamber" % c)
    for c in s['containers']:
        p = parts[c]
        if p['fill'] <= 0.0 and p['rho'] > 0:
            w.append("%s is empty" % c)
    return w


def path_nodes(adj, start, allowed):
    allowed = set(allowed)
    seen, dq = {start}, deque([start])
    while dq:
        x = dq.popleft()
        for y in adj[x]:
            if y in allowed and y not in seen:
                seen.add(y)
                dq.append(y)
    return seen


def feed_area(parts, adj, src, dst, allowed):
    """Flow area of the thinnest transport on the shortest path src -> dst inside `allowed` (m2)."""
    prev, dq = {src: None}, deque([src])
    while dq:
        x = dq.popleft()
        if x == dst:
            break
        for y in sorted(adj[x]):
            if y in allowed and y not in prev:
                prev[y] = x
                dq.append(y)
    rs = []
    x = dst
    while x is not None and x in prev:
        if parts[x]['role'] == 'TRANSPORT' or parts[x].get('kind') == 'TRANSPORT':
            rs.append(parts[x]['r_eq'])
        x = prev[x]
    if rs:
        r = min(rs)
    else:
        r = 0.3 * max(parts[dst]['r_eq'], parts[src]['r_eq'] * 0.3)
    return math.pi * max(r, 1e-3) ** 2


# ----------------------------------------------------------------------------- engine model
def mr_eff(mr, mr_opt):
    """Performance factor of the mixture ratio: 1 at the optimum, parabolic fall-off (documented simplification)."""
    x = mr / max(mr_opt, 1e-6) - 1.0
    return float(min(max(1.0 - 0.35 * x * x, 0.4), 1.0))


def cstar(t_flame, mr, mr_opt):
    g = GAMMA
    big = math.sqrt(g) * (2.0 / (g + 1.0)) ** ((g + 1.0) / (2.0 * (g - 1.0)))
    return math.sqrt(R_U * t_flame * mr_eff(mr, mr_opt) / M_GAS) / big


def orifice(rho, area, dp):
    return CD * area * math.sqrt(2.0 * max(rho, 1e-6) * max(dp, 0.0))


class EngineModel:
    """Static data of one system (ports, throat, fluids), built once from the detection result."""

    def __init__(self, s, parts, adj):
        self.s = s
        self.parts = parts
        ch = s['chambers'][0] if s['chambers'] else None
        self.chamber = ch
        allowed = set(s['parts'])
        self.fuel_ports, self.ox_ports = [], []
        for lst, ids in ((self.fuel_ports, s['fuel']), (self.ox_ports, s['oxid'])):
            for c in ids:
                p = parts[c]
                A = feed_area(parts, adj, c, ch, allowed) if ch else 0.0
                A_inj = INJ_K * self.At_pre(parts, s) / max(len(ids), 1)
                lst.append(dict(part=c, A=1.0 / math.sqrt(1.0 / max(A, 1e-9) ** 2 + 1.0 / max(A_inj, 1e-9) ** 2) if A > 0 else 0.0))
        fp = parts[s['fuel'][0]] if s['fuel'] else None
        op = parts[s['oxid'][0]] if s['oxid'] else None
        self.fuel = fp
        self.oxid = op
        preset = fp['fluid_preset'] if fp else ''
        self.mr_opt = MR_OPT.get(preset, MR_DEFAULT)
        self.t_flame = max([parts[c]['flame_t'] for c in s['fuel'] + s['oxid']] + [1500.0]) if (fp and op) else 0.0
        # throat: smallest opening of the nozzle; fall back to a fraction of the chamber radius
        if s['nozzles']:
            rt = min(min(parts[n]['open_r']) for n in s['nozzles'])
        elif ch and parts[ch]['open_r']:
            rt = min(parts[ch]['open_r'])
        else:
            rt = 0.35 * (parts[ch]['r_eq'] if ch else 0.0)
        self.At = math.pi * rt * rt

    @staticmethod
    def At_pre(parts, s):
        if s['nozzles']:
            rt = min(min(parts[n]['open_r']) for n in s['nozzles'])
        elif s['chambers'] and parts[s['chambers'][0]]['open_r']:
            rt = min(parts[s['chambers'][0]]['open_r'])
        else:
            rt = 0.35 * (parts[s['chambers'][0]]['r_eq'] if s['chambers'] else 0.0)
        return math.pi * rt * rt

    def p_of(self, name, ptank):
        p = self.parts[name]
        return ptank.get(name, p['pressure'] or P_ATM)

    def ports(self, ptank, failed):
        """Feed ports that are alive: list of (kind, part, A, P, rho)."""
        out = []
        for kind, lst in (('FUEL', self.fuel_ports), ('OX', self.ox_ports)):
            for q in lst:
                if q['part'] in failed:
                    continue
                p = self.parts[q['part']]
                if p['fill'] <= 0.0:
                    continue
                out.append((kind, q['part'], q['A'], self.p_of(q['part'], ptank), p['rho']))
        return out

    def solve(self, ptank, failed, amb, extra=()):
        """Quasi-steady chamber state.  extra: [(kind, A, P_other, rho_other, rho_gas_flag)] crossfeed ports:
        kind 'FUEL' | 'OX' | 'GAS' (hot gas from another chamber).  Returns dict(Pc, MR, mdot, thrust, ...)."""
        base = self.ports(ptank, failed)
        if not base or self.At <= 0 or self.chamber in failed or not (self.fuel_ports and self.ox_ports):
            return dict(Pc=amb, MR=0.0, mdot=0.0, thrust=0.0, ve=0.0, mdot_f=0.0, mdot_o=0.0, cstar=0.0, ok=False)
        pmax = max([b[3] for b in base] + [e[2] for e in extra] + [amb])
        mr = self.mr_opt
        res = None
        for _ in range(25):
            cs = cstar(self.t_flame, mr, self.mr_opt)
            rho_g = lambda pc: pc * M_GAS / (R_U * self.t_flame)

            def flows(pc):
                f = o = gin = gout = 0.0
                for kind, _p, A, P, rho in base:
                    q = orifice(rho, A, P - pc)
                    if kind == 'FUEL':
                        f += q
                    else:
                        o += q
                for kind, A, Pn, rhon in extra:
                    if Pn > pc:
                        q = orifice(rhon, A, Pn - pc)
                        if kind == 'FUEL':
                            f += q
                        elif kind == 'OX':
                            o += q
                        else:
                            gin += q
                    else:
                        gout += orifice(rho_g(pc), A, pc - Pn)
                return f, o, gin, gout
            lo, hi = amb, pmax
            for _i in range(60):
                mid = 0.5 * (lo + hi)
                f, o, gin, gout = flows(mid)
                if f + o + gin - gout - mid * self.At / cs > 0.0:
                    lo = mid
                else:
                    hi = mid
            pc = 0.5 * (lo + hi)
            f, o, gin, gout = flows(pc)
            mr_new = (o / f) if f > 1e-9 else 99.0
            if abs(mr_new - mr) < 1e-4:
                mr = mr_new
                break
            mr = 0.5 * (mr + mr_new)
        pc_ratio = max(amb / max(pc, 1.0), 1e-9)
        t_c = self.t_flame * mr_eff(mr, self.mr_opt)
        ve = ETA_N * math.sqrt(2.0 * GAMMA / (GAMMA - 1.0) * R_U * t_c / M_GAS * max(1.0 - pc_ratio ** ((GAMMA - 1.0) / GAMMA), 0.0)) if pc > amb * 1.02 else 0.0
        mdot = pc * self.At / cs
        res = dict(Pc=pc, MR=mr, mdot=mdot, thrust=mdot * ve, ve=ve, mdot_f=f, mdot_o=o, cstar=cs, ok=True, T=t_c)
        return res


# ----------------------------------------------------------------------------- group simulation (time stepping)
class GroupSim:
    """Deterministic lumped simulation of all systems and links of a detection result."""

    def __init__(self, parts, edges, amb=P_ATM, links_enabled=True, det=None):
        self.parts = parts
        self.amb = amb
        self.det = det or detect(parts, edges)
        self.roles = self.det['roles']
        for n, p in parts.items():
            p['kind'] = self.roles.get(n, p['role'])
        self.adj = adjacency(parts, edges)
        self.links_enabled = links_enabled
        self.models = {s['id']: EngineModel(s, parts, self.adj) for s in self.det['systems']}
        self.sys_of = {x: s['id'] for s in self.det['systems'] for x in s['parts']}
        self.ptank = {n: (q['pressure'] or amb) for n, q in parts.items() if q['kind'] == 'CONTAINER'}
        self.failed = {}
        self.base = self.solve_all(links=False)
        self.reset()

    # -- state
    def reset(self):
        self.t = 0.0
        self.ptank = {n: (p['pressure'] or self.amb) for n, p in self.parts.items() if p['kind'] == 'CONTAINER'}
        self.Tw = {n: 300.0 for n in self.parts}
        self.failed = {}                  # part -> reason
        self.hot_dwell = {}               # tank -> seconds of hot gas inside
        self.mix_dwell = {}
        self.events = []                  # [dict(t, part, system, kind, reason)] in order
        self.new_events = []
        self.state = {}
        self._update_state(self.solve_all(links=self.links_enabled), 0.0)

    def link_extras(self, sid, pc_all, links=True):
        """Crossfeed ports of system `sid`'s chamber: pipes touching that chamber and another part."""
        out = []
        m = self.models[sid]
        if not links:
            return out
        for L in self.det['links']:
            pipe = L['pipe']
            if pipe in self.failed:
                continue
            nb = [x for x in sorted(self.adj[pipe]) if x in self.sys_of]
            mine = [x for x in nb if x == m.chamber]
            others = [x for x in nb if self.sys_of.get(x) != sid]
            if not mine or not others:
                continue
            A = math.pi * max(self.parts[pipe]['r_eq'], 1e-3) ** 2
            for o in others:
                po = self.parts[o]
                if po['kind'] == 'CONTAINER':
                    if o in self.failed:
                        continue
                    kind = 'OX' if prop_role_of(po, 0) == 'OXIDIZER' else 'FUEL'
                    out.append((kind, A, self.ptank.get(o, self.amb), po['rho']))
                elif po['kind'] == 'CHAMBER':
                    osys = self.sys_of[o]
                    out.append(('GAS', A, pc_all.get(osys, self.amb), 0.0))
        return out

    def solve_all(self, links=True, ptank=None):
        pt = self.ptank if ptank is None else ptank
        failed = getattr(self, 'failed', {})
        pc = {sid: self.amb for sid in self.models}
        res = {}
        for _ in range(8):
            for sid, m in self.models.items():
                ex = self.link_extras(sid, pc, links=links) if links else []
                res[sid] = m.solve(pt, failed, self.amb, ex)
                pc[sid] = res[sid]['Pc']
        return res

    def ramp(self):
        return min(max((self.t - T_IGNITE) / T_RAMP, 0.0), 1.0)

    def _update_state(self, sol, dt):
        s_ramp = self.ramp()
        self.sol = sol
        for sid, r in sol.items():
            base = self.base[sid]
            r = dict(r)
            r['Pc'] = self.amb + s_ramp * (r['Pc'] - self.amb)
            r['thrust'] *= s_ramp ** 2
            r['mdot'] *= s_ramp
            self.state.setdefault(sid, {})
            self.state[sid].update(r)
            self.state[sid]['thrust_base'] = base['thrust']
            self.state[sid]['Pc_base'] = base['Pc']
            self.state[sid]['MR_base'] = base['MR']

    def pressure_of(self, name):
        p = self.parts[name]
        k = p['kind']
        if name in self.failed:
            return self.amb
        if k == 'CONTAINER':
            return self.ptank.get(name, self.amb)
        if k == 'CHAMBER':
            sid = self.sys_of.get(name)
            if sid is None:
                return self.amb
            pc = self.state[sid]['Pc']
            return pc * (0.4 if len(p['open_r']) >= 2 and p['taper'] >= 1.3 else 1.0)
        nb = [x for x in self.adj[name] if x in self.parts]
        return max([self.pressure_of_leaf(x) for x in nb] + [self.amb])

    def pressure_of_leaf(self, name):
        p = self.parts[name]
        if name in self.failed:
            return self.amb
        if p['kind'] == 'CONTAINER':
            return self.ptank.get(name, self.amb)
        if p['kind'] == 'CHAMBER':
            sid = self.sys_of.get(name)
            return self.state[sid]['Pc'] if sid else self.amb
        return self.amb

    def util(self, name):
        p = self.parts[name]
        P = self.pressure_of(name)
        r = max(p['r_eq'], 1e-3)
        sig, u = M.stress_state(p['material'], self.Tw[name], P, r, p['wall'], constrained=0.05)
        return u, P, sig

    def burst_pressure(self, name):
        p = self.parts[name]
        return M.yield_at(p['material'], self.Tw[name]) * p['wall'] / max(p['r_eq'], 1e-3)

    def step(self, dt):
        """Advance the model by dt seconds (use fixed small steps, e.g. 1/24 s)."""
        self.new_events = []
        sol = self.solve_all(links=self.links_enabled)
        self.t += dt
        s_ramp = self.ramp()
        pc_now = {sid: self.amb + s_ramp * (r['Pc'] - self.amb) for sid, r in sol.items()}
        hot_into = {}
        # tank pressurisation / contamination along links (flow follows the pressure gradient)
        if self.links_enabled:
            for L in self.det['links']:
                pipe = L['pipe']
                if pipe in self.failed:
                    continue
                nb = [x for x in sorted(self.adj[pipe]) if x in self.sys_of]
                A = math.pi * max(self.parts[pipe]['r_eq'], 1e-3) ** 2
                for a in nb:
                    for b in nb:
                        if a == b or self.sys_of[a] == self.sys_of[b]:
                            continue
                        pa, pb = self.parts[a], self.parts[b]
                        if pb['kind'] != 'CONTAINER' or b in self.failed:
                            continue
                        if pa['kind'] == 'CHAMBER':
                            sid = self.sys_of[a]
                            psrc = pc_now[sid]
                            kind_src = 'GAS'
                        elif pa['kind'] == 'CONTAINER' and a not in self.failed:
                            psrc = self.ptank.get(a, self.amb)
                            kind_src = prop_role_of(pa, 0)
                        else:
                            continue
                        if psrc <= self.ptank[b] * 1.001:
                            continue
                        vol_u = max(pb['volume'] * (1.0 - pb['fill']), 0.05 * pb['volume'], 1e-3)
                        tau = min(max(TAU_LINK * (vol_u / 1.0) / (A / 0.05), 0.3), 3.0)
                        self.ptank[b] += (psrc - self.ptank[b]) * (1.0 - math.exp(-dt / tau))
                        if kind_src == 'GAS':
                            if s_ramp > 0.05:
                                hot_into[b] = self.det_flame(self.sys_of[a])
                        elif kind_src != prop_role_of(pb, 0):
                            self.mix_dwell[b] = self.mix_dwell.get(b, 0.0) + dt
        # wall temperatures
        a_w = 1.0 - math.exp(-dt / TAU_WALL)
        for n, p in self.parts.items():
            k = p['kind']
            if k not in ('CONTAINER', 'TRANSPORT', 'CHAMBER'):
                continue
            tgt = 300.0
            sid = self.sys_of.get(n)
            if k == 'CHAMBER' and sid and s_ramp > 0 and self.state[sid]['ok']:
                tgt = 300.0 + WALL_HEAT['CHAMBER'] * (self.models[sid].t_flame - 300.0) * s_ramp
            elif k == 'CONTAINER' and n in hot_into:
                tgt = 300.0 + WALL_HEAT['TANK_HOT'] * (hot_into[n] - 300.0)
            elif k == 'TRANSPORT':
                for L in self.det['links']:
                    if L['pipe'] == n and self.links_enabled and s_ramp > 0.05:
                        nb = [x for x in self.adj[n] if x in self.sys_of]
                        pr = {x: self.pressure_of_leaf(x) for x in nb}
                        for x in nb:       # carries hot gas only when a chamber end is the highest-pressure end
                            if self.parts[x]['kind'] == 'CHAMBER' and pr[x] > self.amb * 1.5 and pr[x] >= max(pr.values()):
                                tgt = 300.0 + WALL_HEAT['PIPE_HOT'] * (self.models[self.sys_of[x]].t_flame - 300.0)
            self.Tw[n] += (tgt - self.Tw[n]) * a_w
        for n in hot_into:
            self.hot_dwell[n] = self.hot_dwell.get(n, 0.0) + dt
        for n in list(self.hot_dwell):
            if n not in hot_into:
                self.hot_dwell[n] = max(self.hot_dwell[n] - dt, 0.0)
        # failure checks
        for n, p in self.parts.items():
            if n in self.failed or p['kind'] not in ('CONTAINER', 'TRANSPORT', 'CHAMBER'):
                continue
            u, P, _sig = self.util(n)
            reason = None
            if u >= 1.0:
                reason = "wall stress %.0f%% of derated yield: P = %.1f bar, wall T = %.0f K, burst limit %.1f bar (%s, %.1f mm wall)" % (
                    u * 100, P / 1e5, self.Tw[n], self.burst_pressure(n) / 1e5, p['material'].get('label', 'material'), p['wall'] * 1e3)
                if self.hot_dwell.get(n, 0.0) > 0.0:
                    reason += "; hot combustion gas has backflowed into this %s tank" % prop_role_of(p, 0).lower()
            elif self.hot_dwell.get(n, 0.0) > T_DWELL and p['kind'] == 'CONTAINER':
                reason = "hot combustion gas backflow into the %s tank %s (propellant heating and ignition hazard)" % (
                    prop_role_of(p, 0).lower(), n)
            elif self.mix_dwell.get(n, 0.0) > T_DWELL:
                reason = "fuel and oxidizer mixed inside %s (hypergolic contamination)" % n
            if reason:
                self.failed[n] = reason
                ev = dict(t=self.t, part=n, system=self.sys_of.get(n), kind='RUPTURE', reason=reason)
                self.events.append(ev)
                self.new_events.append(ev)
        sol = self.solve_all(links=self.links_enabled)
        self._update_state(sol, dt)
        for sid in self.state:
            self.state[sid].update(self.classify(sid))

    def det_flame(self, sid):
        return self.models[sid].t_flame or 3000.0

    def classify(self, sid):
        """Outcome of one system: status idle / running / enhanced / failed, with the reason."""
        s = next(x for x in self.det['systems'] if x['id'] == sid)
        st = self.state[sid]
        # failed parts of this system (or a crossfeed pipe attached to it)
        mine = [n for n in self.failed if n in s['parts']]
        mine += [L['pipe'] for L in self.det['links'] if sid in L['systems'] and L['pipe'] in self.failed]
        if mine:
            return dict(status='failed', reason=self.failed[mine[0]], failed_part=mine[0])
        if self.t < T_IGNITE or not st['ok']:
            return dict(status='idle', reason='')
        ratio = st['thrust'] / max(st['thrust_base'], 1e-9) if st['thrust_base'] > 0 else 1.0
        opt = self.models[sid].mr_opt
        toward = st['MR'] < 50.0 and abs(st['MR'] / opt - 1.0) < abs(st['MR_base'] / opt - 1.0)
        if self.ramp() >= 1.0 and ratio >= ENHANCE_GAIN and self.links_enabled and toward:
            return dict(status='enhanced', reason="crossfeed raised thrust x%.2f (O/F %.2f -> %.2f, optimum %.2f); pressures within wall limits" % (
                ratio, st['MR_base'], st['MR'], self.models[sid].mr_opt))
        return dict(status='running', reason='')

    def run(self, seconds, dt=1.0 / 24.0):
        for _ in range(int(round(seconds / dt))):
            self.step(dt)
        return self.summary()

    def summary(self):
        out = {}
        for s in self.det['systems']:
            st = self.state[s['id']]
            out[s['id']] = dict(name=s['name'], status=st.get('status', 'idle'), reason=st.get('reason', ''), Pc=st['Pc'], MR=st['MR'],
                                thrust=st['thrust'], thrust_base=st['thrust_base'])
        return out


def requirements(sim, sid):
    """Per-system requirements shown in the panel: feed pressures, mixture ratio, chamber pressure, thrust estimate."""
    m = sim.models[sid]
    b = sim.base[sid]
    fp = [(q['part'], sim.parts[q['part']]['pressure'] or sim.amb) for q in m.fuel_ports]
    op = [(q['part'], sim.parts[q['part']]['pressure'] or sim.amb) for q in m.ox_ports]
    return dict(feed_fuel=fp, feed_ox=op, Pc=b['Pc'], MR=b['MR'], mr_opt=m.mr_opt, thrust=b['thrust'], mdot=b['mdot'],
                feed_needed=b['Pc'] * 1.2, At=m.At, ok=b['ok'])
