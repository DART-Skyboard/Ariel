"""Arc Flow solver: LOTCBP collision composition, sealed-joint detection, container drain,
channel flow, free flight, emitters, thermal/stress state.  Pure NumPy."""
import math
import numpy as np

from . import fluids as F
from . import materials as M
from .sdf import _trilerp

CONNECTED, PLUGGED, OPEN = 'CONNECTED', 'PLUGGED', 'OPEN'


class PartSpec:
    def __init__(self, name, field, matrix, role, fluid=-1, fill_mode='PERCENT', fill_value=80.0,
                 pressure=None, n_particles=1500, material='INDUSTRIAL_STEEL', wall=0.005,
                 mat_custom=None, emit=None, temp0=293.15):
        self.name, self.field, self.role = name, field, role
        self.matrix = np.asarray(matrix, float)
        self.fluid, self.fill_mode, self.fill_value = fluid, fill_mode, fill_value
        self.pressure = pressure            # Pa absolute, None = ambient
        self.n_particles = int(n_particles)
        self.material = mat_custom or dict(M.material(material))
        self.wall = wall
        self.emit = emit                    # None or dict(mode, rate, speed, fluid, faces(optional (K,3,3) local tris), cap)
        self.temp0 = temp0


class Env:
    def __init__(self, pressure=F.P_ATM, gravity=(0, 0, -9.81), wind=(0, 0, 0), temp=293.15, density=1.225,
                 atmo_fluid=None, ground_z=None, ground_on=True):
        self.pressure, self.temp, self.density = pressure, temp, density
        self.gravity = np.asarray(gravity, float)
        self.wind = np.asarray(wind, float)
        self.atmo_fluid = atmo_fluid        # dict fluid spec or None
        self.ground_z, self.ground_on = ground_z, ground_on


class Params:
    def __init__(self, continuous=True, net_res=40, vmax=60.0, max_sub=6, refine_budget=12,
                 flight_factor=2.0, spill_life=25.0, radius_scale=1.0, ignition_gain=1.0,
                 ignition=None, seed=1, lotcbp=True, cd=0.8, t_lo=273.15):
        self.__dict__.update(locals()); del self.__dict__['self']


class World:
    def __init__(self, parts, fluids, env=None, params=None):
        self.parts = parts
        self.fluids = fluids                # list of dict(name, spec, color, temp)
        self.env = env or Env()
        self.p = params or Params()
        self.rng = np.random.default_rng(self.p.seed)
        self.active = [i for i, q in enumerate(parts) if q.role in ('CONTAINER', 'TRANSPORT', 'CHAMBER', 'COLLIDER')]
        self.time = 0.0
        self.frame_dp = {}
        self._mats_key = None
        self.openings = []                  # world-space openings with state
        self.net = None
        self._setup_transforms()
        self._build_network(force=True)
        self._build_pool()
        self.ignition = 0.0
        self.part_T = np.array([q.temp0 for q in parts], float)
        self.part_stress = np.zeros(len(parts))
        self.part_press = np.zeros(len(parts))
        self.part_heat = np.zeros(len(parts))
        self.stats = dict(refined=0, leaked=0, sub=1)

    # ------------------------------------------------------------------ transforms
    def _setup_transforms(self):
        self.Minv, self.scale = [], []
        for q in self.parts:
            m = q.matrix
            det = abs(np.linalg.det(m[:3, :3]))
            s = det ** (1.0 / 3.0) if det > 1e-18 else 1.0
            self.scale.append(s)
            self.Minv.append(np.linalg.inv(m))
        self.scale = np.array(self.scale)
        self._mats_key = np.stack([q.matrix for q in self.parts]) if self.parts else np.zeros((0, 4, 4))

    def to_local(self, i, P):
        Mi = self.Minv[i]
        return P @ Mi[:3, :3].T + Mi[:3, 3]

    def set_matrices(self, mats):
        """Move parts.  Re-evaluates cavities/joints/openings only when something actually moved."""
        mats = [np.asarray(m, float) for m in mats]
        new = np.stack(mats)
        if self._mats_key is not None and np.allclose(new, self._mats_key, atol=1e-7):
            return False
        for q, m in zip(self.parts, mats):
            q.matrix = m
        self._setup_transforms()
        self._build_network(force=True)
        return True

    # ------------------------------------------------------------------ composed collision queries
    def _eval_parts(self, P, bricks=True):
        n = len(self.active)
        cavs = np.empty((n, len(P)))
        mats = np.empty((n, len(P)))
        for k, i in enumerate(self.active):
            q = self.parts[i]
            c, m = q.field.fields(self.to_local(i, P), bricks)
            if q.role == 'COLLIDER':
                c = np.full(len(P), 1e9)
            cavs[k] = c * self.scale[i]
            mats[k] = m * self.scale[i]
        return cavs, mats

    @staticmethod
    def _compose(cavs, mats):
        n = cavs.shape[0]
        cavU = cavs.min(axis=0)
        if n > 1:
            two = np.partition(cavs, 1, axis=0)[:2]
            others = np.where(cavs == two[0][None], two[1][None], two[0][None])
        else:
            others = np.full_like(cavs, 1e9)
        matU = np.maximum(mats, -others).min(axis=0)
        legal = np.maximum(cavU, -matU)
        return legal, matU, cavU

    def query(self, P, bricks=True):
        cavs, mats = self._eval_parts(P, bricks)
        legal, matU, cavU = self._compose(cavs, mats)
        owner = np.asarray(self.active)[np.argmin(cavs, axis=0)]
        return legal, matU, cavU, owner, cavs

    def _grad(self, fn, P, eps):
        g = np.empty_like(P)
        for ax in range(3):
            d = np.zeros(3); d[ax] = eps
            g[:, ax] = fn(P + d) - fn(P - d)
        n = np.linalg.norm(g, axis=1, keepdims=True)
        return g / np.maximum(n, 1e-12)

    # ------------------------------------------------------------------ network (joints, openings, path-length field)
    def _world_bounds(self):
        lo = np.full(3, np.inf); hi = np.full(3, -np.inf)
        for i in self.active:
            q = self.parts[i]
            b0, b1 = q.field.bmin, q.field.bmax
            corners = np.array([[x, y, z] for x in (b0[0], b1[0]) for y in (b0[1], b1[1]) for z in (b0[2], b1[2])])
            w = corners @ q.matrix[:3, :3].T + q.matrix[:3, 3]
            lo = np.minimum(lo, w.min(0)); hi = np.maximum(hi, w.max(0))
        return lo, hi

    def _build_network(self, force=False):
        if not self.active:
            self.net = None
            self.openings = []
            return
        lo, hi = self._world_bounds()
        ext = np.maximum(hi - lo, 1e-6)
        h = float(np.cbrt(np.prod(ext) / max(self.p.net_res ** 3, 1)))
        h = max(h, ext.max() / 90.0)
        pad = 2.5 * h
        origin = lo - pad
        dims = np.maximum(np.ceil((hi + pad - origin) / h).astype(int) + 1, 4)
        idx = np.stack(np.meshgrid(*[np.arange(d) for d in dims], indexing='ij'), -1).reshape(-1, 3)
        pts = origin + idx * h
        legal, matU, _c, owner, _cs = self.query(pts, bricks=False)
        legal = legal.reshape(dims); matU = matU.reshape(dims)
        mask = legal < 0.0
        self.h_ref = h
        # --- classify openings
        ops = []
        for i in self.active:
            q = self.parts[i]
            if q.role == 'COLLIDER':
                continue
            R = q.matrix[:3, :3] / self.scale[i]
            for o in q.field.openings:
                c = q.matrix[:3, :3] @ o['centre'] + q.matrix[:3, 3]
                n = R @ o['normal']; n /= max(np.linalg.norm(n), 1e-12)
                r = o['radius'] * self.scale[i]
                probes = np.array([c + n * d * h for d in (0.4, 0.9, 1.6)])
                lg, mu, _cu, _ow, _cv = self.query(probes, bricks=False)
                if lg[2] < 0.0 and lg[1] < 0.0:
                    state = CONNECTED
                elif np.any(mu < 0.0):
                    state = PLUGGED
                else:
                    state = OPEN
                ops.append(dict(part=i, centre=c, normal=n, radius=r, state=state))
        self.openings = ops
        # --- path-length field to the open exits (geodesic through the merged cavity)
        INF = 1e9
        dist = np.full(dims, INF)
        gx = np.arange(dims[0]) * h + origin[0]; gy = np.arange(dims[1]) * h + origin[1]; gz = np.arange(dims[2]) * h + origin[2]
        X, Y, Z = np.meshgrid(gx, gy, gz, indexing='ij')
        for o in ops:
            if o['state'] != OPEN:
                continue
            d = np.stack([X - o['centre'][0], Y - o['centre'][1], Z - o['centre'][2]], -1)
            rr = np.linalg.norm(d, axis=-1)
            along = np.sum(d * o['normal'], axis=-1)
            src = mask & (rr < 1.6 * (o['radius'] + h)) & (along <= 0.5 * h)
            dist[src] = 0.0
            if not src.any():                       # mouth sits just outside the coarse mask: seed the nearest legal voxels
                rrm = np.where(mask, rr, INF)
                dist[rrm <= rrm.min() + 1.5 * h] = 0.0
        if (dist < INF).any():
            wts = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        if dx or dy or dz:
                            wts.append((dx, dy, dz, h * math.sqrt(dx * dx + dy * dy + dz * dz)))
            for _it in range(int(dims.sum()) * 2):
                best = dist.copy()
                for dx, dy, dz, w in wts:
                    sh = np.roll(dist, (dx, dy, dz), axis=(0, 1, 2))
                    if dx > 0: sh[:dx] = INF
                    elif dx < 0: sh[dx:] = INF
                    if dy > 0: sh[:, :dy] = INF
                    elif dy < 0: sh[:, dy:] = INF
                    if dz > 0: sh[:, :, :dz] = INF
                    elif dz < 0: sh[:, :, dz:] = INF
                    np.minimum(best, sh + w, out=best)
                best = np.where(mask, best, INF)
                if np.array_equal(best, dist):
                    break
                dist = best
        reach = dist < INF * 0.5
        dsm = np.where(reach, dist, np.nan)
        # gradient of the geodesic distance (central differences; unreachable voxels -> 0)
        fill = np.where(reach, dist, 0.0)
        grads = []
        for ax in range(3):
            gp = np.roll(fill, -1, ax); gm = np.roll(fill, 1, ax)
            rp = np.roll(reach, -1, ax); rm = np.roll(reach, 1, ax)
            gp = np.where(rp, gp, fill); gm = np.where(rm, gm, fill)
            grads.append((gp - gm) / (2 * h))
        # local radius (max inscribed) for continuity: dilate -legal over 3 steps
        rad = np.where(mask, -legal, 0.0)
        for _ in range(2):
            acc = rad.copy()
            for ax in range(3):
                acc = np.maximum(acc, np.maximum(np.roll(rad, 1, ax), np.roll(rad, -1, ax)))
            rad = np.where(mask, acc, 0.0)
        open_r = [o['radius'] for o in ops if o['state'] == OPEN]
        self.net = dict(reachf=reach.astype(float), origin=origin, h=h, dims=dims, mask=mask, dist=fill, reach=reach, grad=grads, rad=rad,
                        legal=legal, r_exit=float(np.mean(open_r)) if open_r else h, L0=max(4 * h, 0.25 * float(np.mean(open_r)) if open_r else 4 * h))

    def _gs(self, arr, P):
        n = self.net
        g = (P - n['origin']) / n['h']
        gc = np.clip(g, 0, n['dims'] - 1 - 1e-9)
        i0 = np.floor(gc).astype(np.int64)
        return _trilerp(arr, i0, gc - i0)

    # ------------------------------------------------------------------ particle pool
    def _fluid_rho(self, fi, pressure=None):
        sp = self.fluids[fi]['spec']
        return F.density_at(sp, pressure or F.P_ATM, self.fluids[fi]['temp'])

    def _build_pool(self):
        self.sources = []
        n_total = 0
        for i in self.active:
            q = self.parts[i]
            if q.role == 'CONTAINER' and q.fluid >= 0:
                n0 = q.n_particles
                cap = int(n0 * (1.0 + self.p.flight_factor))
                self.sources.append(dict(kind='C', part=i, fluid=q.fluid, n0=n0, lo=n_total, hi=n_total + cap, dp=0.0, carry=0.0))
                n_total += cap
        for i, q in enumerate(self.parts):
            if q.emit and q.emit.get('fluid', -1) >= 0 and q.emit.get('rate', 0) > 0:
                cap = int(q.emit.get('cap', 3000))
                self.sources.append(dict(kind='E', part=i, fluid=q.emit['fluid'], n0=0, lo=n_total, hi=n_total + cap, carry=0.0, dp=0.0, head=0))
                n_total += cap
        self.N = n_total
        N = n_total
        self.pos = np.zeros((N, 3)); self.vel = np.zeros((N, 3))
        self.state = np.zeros(N, np.int8)
        self.pfluid = np.zeros(N, np.int32); self.psrc = np.zeros(N, np.int32)
        self.age = np.zeros(N); self.life = np.full(N, 1e9)
        self.temp = np.zeros(N); self.rad = np.zeros(N); self.mass = np.zeros(N)
        self.pin = -np.ones(N, np.int32)
        for si, s in enumerate(self.sources):
            self.psrc[s['lo']:s['hi']] = si
            self.pfluid[s['lo']:s['hi']] = s['fluid']
        self.reset()

    def reset(self):
        self.rng = np.random.default_rng(self.p.seed)
        self.time = 0.0
        self.state[:] = 0
        self.vel[:] = 0
        self.pos[:] = 0
        self.pin[:] = -1
        self.rad[:] = 0
        for s in self.sources:
            s['carry'] = 0.0; s['head'] = 0
        for si, s in enumerate(self.sources):
            if s['kind'] == 'C':
                self._init_container(si)

    # ------------------------------------------------------------------ container filling
    def _gdir(self):
        g = self.env.gravity
        n = np.linalg.norm(g)
        return g / n if n > 1e-9 else np.array([0, 0, -1.0])

    def _sample_cavity(self, part_i, n_want, max_rounds=8, region_lowest=None):
        """Random legal points inside part's cavity (world space). Returns (pts, legal_fraction_in_bbox, bbox_volume)."""
        q = self.parts[part_i]
        lo, hi = q.field.bmin, q.field.bmax
        vol_local = float(np.prod(hi - lo))
        out = []
        tried = 0; ok = 0
        for _ in range(max_rounds):
            m = max(n_want * 6, 4000)
            L = lo + self.rng.random((m, 3)) * (hi - lo)
            W = L @ q.matrix[:3, :3].T + q.matrix[:3, 3]
            legal, _mu, _cu, owner, cavs = self.query(W, bricks=False)
            k = self.active.index(part_i)
            good = (legal < -0.3 * self.h_ref) & (cavs[k] < -0.3 * self.h_ref)
            tried += m; ok += int(good.sum())
            out.append(W[good])
            if sum(len(o) for o in out) >= n_want * (3 if region_lowest else 1):
                break
        pts = np.concatenate(out) if out else np.zeros((0, 3))
        frac = ok / max(tried, 1)
        return pts, frac, vol_local * self.scale[part_i] ** 3

    def _init_container(self, si):
        s = self.sources[si]
        q = self.parts[s['part']]
        fs = self.fluids[s['fluid']]
        n0 = s['n0']
        pts, frac, bvol = self._sample_cavity(s['part'], n0, region_lowest=True)
        cav_vol = frac * bvol
        has_cavity = len(pts) >= 16 and cav_vol > 0
        fill_vol = (q.fill_value / 100.0) * cav_vol if q.fill_mode == 'PERCENT' else q.fill_value
        s['cav_vol'] = cav_vol; s['fill_vol'] = fill_vol
        P_c = q.pressure if q.pressure else self.env.pressure
        s['P'] = P_c
        rho = F.density_at(fs['spec'], P_c, fs['temp'])
        s['mass'] = fill_vol * rho
        s['rho'] = rho
        lo_i = s['lo']
        slots = np.arange(s['lo'], s['lo'] + n0)
        if has_cavity:
            if fs['spec']['kind'] == 'LIQUID' and cav_vol > 0 and fill_vol < cav_vol * 0.999:
                h = -(pts @ self._gdir())                 # height along -gravity
                keep = np.argsort(h)[:max(int(len(pts) * fill_vol / cav_vol), n0)]
                pts = pts[keep]
            pick = self.rng.integers(0, len(pts), n0)
            self.pos[slots] = pts[pick]
            self.state[slots] = 1
        else:
            # solid body without a modelled cavity: the fluid rests on top of it and spills off
            lo, hi = q.field.bmin, q.field.bmax
            c = q.matrix[:3, :3] @ ((lo + hi) / 2) + q.matrix[:3, 3]
            ext = (hi - lo) * self.scale[s['part']]
            up = -self._gdir()
            r = max(ext.max(), 1e-3) * 0.5
            vp = max(fill_vol, 1e-6)
            R = np.cbrt(vp * 3 / (4 * math.pi))
            R = min(R, r)
            pts = c + up * (ext.max() * 0.5 + R) + (self.rng.normal(size=(n0, 3)) * R * 0.4)
            self.pos[slots] = pts
            self.state[slots] = 2
        s['n_alive0'] = n0
        pv = max(fill_vol, 1e-9) / n0
        self.mass[slots] = rho * pv
        self.rad[slots] = (3 * pv / (4 * math.pi)) ** (1 / 3) * self.p.radius_scale * 1.6
        self.temp[slots] = fs['temp']
        self.vel[slots] = 0
        self.age[slots] = 0
        self.life[slots] = self.p.spill_life
        self.pin[slots] = s['part'] if has_cavity else -1
        s['pv'] = pv
        s['has_cavity'] = has_cavity

    def _refill(self, si, dt, ninside):
        s = self.sources[si]
        if not s.get('has_cavity'):
            return
        need = s['n0'] - ninside
        if need <= 0:
            return
        dead = np.flatnonzero(self.state[s['lo']:s['hi']] == 0) + s['lo']
        k = int(min(need, max(8, int(0.15 * s['n0']))))
        if len(dead) < k:       # pool exhausted: recycle the oldest free (spilled / vented) particles of this source
            free = np.flatnonzero(self.state[s['lo']:s['hi']] == 2) + s['lo']
            free = free[np.argsort(-self.age[free])][:k - len(dead)]
            dead = np.concatenate([dead, free])
        k = min(k, len(dead))
        if k <= 0:
            return
        pts, _f, _b = self._sample_cavity(s['part'], k * 2)
        if len(pts) == 0:
            return
        sl = dead[:k]
        self.pos[sl] = pts[self.rng.integers(0, len(pts), k)]
        self.state[sl] = 1; self.vel[sl] = 0; self.age[sl] = 0
        fs = self.fluids[s['fluid']]
        self.temp[sl] = fs['temp']; self.life[sl] = self.p.spill_life
        pv = s['pv']
        self.mass[sl] = s['rho'] * pv
        self.rad[sl] = (3 * pv / (4 * math.pi)) ** (1 / 3) * self.p.radius_scale * 1.6
        self.pin[sl] = s['part']

    # ------------------------------------------------------------------ emitters
    def _emit(self, si, dt):
        s = self.sources[si]
        q = self.parts[s['part']]
        e = q.emit
        s['carry'] += e['rate'] * dt
        k = int(s['carry']); s['carry'] -= k
        if k <= 0:
            return
        k = min(k, s['hi'] - s['lo'])
        mode = e.get('mode', 'SURFACE')
        slots = (s['lo'] + (s['head'] + np.arange(k)) % (s['hi'] - s['lo']))
        s['head'] = (s['head'] + k) % (s['hi'] - s['lo'])
        Rm, tm = q.matrix[:3, :3], q.matrix[:3, 3]
        fs = self.fluids[s['fluid']]
        speed = e.get('speed', 1.0)
        if mode in ('SURFACE', 'FACES'):
            tris = e.get('faces') if (mode == 'FACES' and e.get('faces') is not None and len(e['faces'])) else None
            if tris is None:
                sp = q.field.soup
                A, B, C = sp.A, sp.B, sp.C
            else:
                A, B, C = tris[:, 0], tris[:, 1], tris[:, 2]
            cr = np.cross(B - A, C - A); area = np.linalg.norm(cr, axis=1)
            if area.sum() <= 0:
                return
            ti = self.rng.choice(len(A), k, p=area / area.sum())
            u, v = self.rng.random(k), self.rng.random(k)
            flip = u + v > 1; u = np.where(flip, 1 - u, u); v = np.where(flip, 1 - v, v)
            L = A[ti] + (B[ti] - A[ti]) * u[:, None] + (C[ti] - A[ti]) * v[:, None]
            nrm = cr[ti] / np.maximum(area[ti], 1e-30)[:, None]
            W = L @ Rm.T + tm
            Nw = nrm @ Rm.T
            Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-12)
            if e.get('inward'):
                Nw = -Nw
            self.pos[slots] = W + Nw * 1e-3
            self.vel[slots] = Nw * speed + self.rng.normal(size=(k, 3)) * 0.05 * speed
        else:
            if mode == 'ORIGIN':
                r = e.get('radius', 0.1) * self.scale[s['part']]
                self.pos[slots] = tm + self.rng.normal(size=(k, 3)) * r * 0.5
            else:   # VOLUME
                lo, hi = q.field.bmin, q.field.bmax
                got = []
                for _ in range(6):
                    L = lo + self.rng.random((k * 4, 3)) * (hi - lo)
                    sdv = q.field.sample_sd(L, bricks=False)
                    good = (sdv < 0) if q.field.mode == 'SHELL' else (sdv < 0)
                    got.append(L[good])
                    if sum(len(g) for g in got) >= k:
                        break
                Lp = np.concatenate(got) if got else np.zeros((0, 3))
                if len(Lp) == 0:
                    Lp = np.tile((lo + hi) / 2, (k, 1))
                Lp = Lp[self.rng.integers(0, len(Lp), k)]
                self.pos[slots] = Lp @ Rm.T + tm
            self.vel[slots] = self.rng.normal(size=(k, 3)) * 0.1 * max(speed, 0.1)
        self.state[slots] = 2; self.age[slots] = 0
        self.life[slots] = e.get('life', self.p.spill_life)
        self.temp[slots] = fs['temp']
        pv = e.get('particle_volume', 1e-5)
        self.mass[slots] = self._fluid_rho(s['fluid']) * pv
        self.rad[slots] = (3 * pv / (4 * math.pi)) ** (1 / 3) * self.p.radius_scale * 1.6
        self.pin[slots] = -1

    # ------------------------------------------------------------------ stepping
    def step(self, dt):
        env, p = self.env, self.p
        g = env.gravity
        alive = np.flatnonzero(self.state > 0)
        # --- emitters & refills & source pressures (once per frame)
        for si, s in enumerate(self.sources):
            if s['kind'] == 'E':
                self._emit(si, dt)
        pamb = env.pressure
        for si, s in enumerate(self.sources):
            if s['kind'] != 'C':
                continue
            sl = slice(s['lo'], s['hi'])
            inside = int(np.sum((self.state[sl] == 1) & (self.pin[sl] == s['part'])))
            frac = inside / max(s['n0'], 1)
            s['frac'] = frac
            fs = self.fluids[s['fluid']]
            if fs['spec']['kind'] == 'GAS':
                Pe = s['P'] * frac
            else:
                Pe = s['P'] if inside > 0.02 * s['n0'] else pamb
            s['dp'] = max(Pe - pamb, 0.0)
            if p.continuous:
                self._refill(si, dt, inside)
        alive = np.flatnonzero(self.state > 0)
        if len(alive) == 0:
            self.time += dt
            return
        vmax_now = float(np.max(np.linalg.norm(self.vel[alive], axis=1))) if len(alive) else 0.0
        hmin = self.h_ref
        nsub = int(min(max(math.ceil(vmax_now * dt / (0.4 * hmin)), 1), p.max_sub))
        h = dt / nsub
        self.stats['sub'] = nsub
        for _ in range(nsub):
            self._substep(h)
        self.time += dt
        if p.lotcbp:
            al = np.flatnonzero(self.state > 0)
            if len(al):
                samp = al if len(al) <= 3000 else self.rng.choice(al, 3000, replace=False)
                _l, _m, _c, _o, cavs = self.query(self.pos[samp])
                self._refine(self.pos[samp], cavs)
        self._thermal(dt)

    def _src_arrays(self):
        dp = np.array([s['dp'] for s in self.sources])
        rho = np.array([self._fluid_rho(s['fluid'], s.get('P', F.P_ATM)) if s['kind'] == 'C' else self._fluid_rho(s['fluid']) for s in self.sources])
        return dp, rho

    def _substep(self, h):
        env, p = self.env, self.p
        g = env.gravity
        al = np.flatnonzero(self.state > 0)
        if len(al) == 0:
            return
        dp_s, rho_s = self._src_arrays()
        con = al[self.state[al] == 1]
        fre = al[self.state[al] == 2]
        net = self.net
        # ---------- confined
        if len(con):
            x = self.pos[con]; v = self.vel[con]
            si = self.psrc[con]
            dpc = dp_s[si]; rho = rho_s[si]
            if net is not None:
                wsum = self._gs(net['reachf'], x)           # normalised sampling: voxels outside the cavity do not dilute
                reach = wsum > 0.12
                inv = 1.0 / np.maximum(wsum, 1e-6)
                phi = self._gs(net['dist'] * net['reachf'], x) * inv
                gr = np.stack([self._gs(net['grad'][a] * net['reachf'], x) * inv for a in range(3)], 1)
                gn = np.linalg.norm(gr, axis=1, keepdims=True)
                dirv = -gr / np.maximum(gn, 1e-9)
                a_p = np.where(reach & (gn[:, 0] > 1e-6), dpc / (rho * (phi + net['L0'])), 0.0)
                acc = dirv * a_p[:, None]
                rad_loc = np.maximum(self._gs(net['rad'], x), 0.25 * net['r_exit'])
                v_or = np.minimum(p.cd * np.sqrt(2.0 * dpc / rho), p.vmax)
                cont = np.clip((net['r_exit'] / rad_loc) ** 2, 0.25, 4.0)
                vcap = np.maximum(v_or * cont, 1.0)
            else:
                acc = np.zeros_like(x); vcap = np.full(len(x), 1.0)
            visc = np.array([self.fluids[f]['spec']['visc'] for f in range(len(self.fluids))])[self.pfluid[con]]
            kd = 1.5 + 400.0 * visc
            v = (v + (acc + g) * h) * np.exp(-kd * h)[:, None]
            sp = np.linalg.norm(v, axis=1)
            sc = np.minimum(1.0, np.maximum(vcap, 2.0) / np.maximum(sp, 1e-9))
            v *= sc[:, None]
            x = x + v * h
            # mouth exemption + vent
            ex = np.zeros(len(x), bool)
            vent = np.zeros(len(x), bool)
            vent_o = -np.ones(len(x), int)
            for oi, o in enumerate(self.openings):
                if o['state'] != OPEN:
                    continue
                d = x - o['centre']
                rr = np.linalg.norm(d, axis=1)
                near = rr < 2.2 * (o['radius'] + self.h_ref)
                ex |= near
                crossed = near & (np.sum(d * o['normal'], axis=1) > 0.0)
                vent_o = np.where(crossed & ~vent, oi, vent_o)
                vent |= crossed
            legal, matU, cavU, owner, cavs = self.query(x)
            skin = np.maximum(0.3 * self.rad[con], 0.25 * self.h_ref * 0.2)
            viol = (legal > -skin) & ~ex
            if viol.any():
                ii = np.flatnonzero(viol)
                fn = lambda P: self.query(P, bricks=True)[0]
                nrm = self._grad(fn, x[ii], 0.5 * self.h_ref)
                x[ii] -= nrm * (legal[ii] + skin[ii])[:, None]
                vn = np.sum(v[ii] * nrm, axis=1)
                out = vn > 0
                v[ii] -= (1.1 * np.where(out, vn, 0.0))[:, None] * nrm
            self.pos[con] = x; self.vel[con] = v
            self.pin[con] = np.where(legal < 0, owner, -1)
            if vent.any():
                vi = np.flatnonzero(vent)
                gi = con[vi]
                for oi in np.unique(vent_o[vi]):
                    o = self.openings[oi]
                    sel = vi[vent_o[vi] == oi]
                    gs = con[sel]
                    spread = 0.30
                    jd = o['normal'][None] + (self.rng.random((len(gs), 3)) - 0.5) * spread * 2
                    jd /= np.linalg.norm(jd, axis=1, keepdims=True)
                    sps = np.linalg.norm(self.vel[gs], axis=1)
                    vj = np.maximum(np.minimum(p.cd * np.sqrt(2 * dp_s[self.psrc[gs]] / rho_s[self.psrc[gs]]), p.vmax), sps)
                    self.vel[gs] = jd * vj[:, None]
                    self.state[gs] = 2; self.age[gs] = 0; self.pin[gs] = -1
                    self.stats['leaked'] += len(gs)
        # ---------- free flight
        fre = np.flatnonzero(self.state == 2)
        if len(fre):
            x = self.pos[fre]; v = self.vel[fre]
            rho_p = np.array([self._fluid_rho(f) for f in range(len(self.fluids))])[self.pfluid[fre]]
            rho_a = env.atmo_fluid_density if hasattr(env, 'atmo_fluid_density') else env.density
            rp = np.maximum(self.rad[fre], 1e-4)
            coef = 0.375 * 0.47 * (rho_a / rho_p) / rp
            geff = g[None] * (1.0 - rho_a / np.maximum(rho_p, 1e-3))[:, None]
            u = v - env.wind
            sp = np.linalg.norm(u, axis=1)
            v = (v + (geff + (coef * sp)[:, None] * env.wind) * h) / (1.0 + coef * sp * h)[:, None]
            # gas-like jets spread
            x = x + v * h
            self.age[fre] += h
            if env.ground_on:
                gz = env.ground_z if env.ground_z is not None else self._ground_default()
                below = x[:, 2] < gz + self.rad[fre] * 0.5
                if below.any():
                    x[below, 2] = gz + self.rad[fre][below] * 0.5
                    vz = v[below, 2]
                    v[below, 2] = np.where(vz < 0, -0.15 * vz, vz)
                    v[below, 0] *= (1.0 - min(3.0 * h, 0.9)); v[below, 1] *= (1.0 - min(3.0 * h, 0.9))
            if len(self.active):
                legal, matU, cavU, owner, cavs = self.query(x)
                viol = matU < 0.0
                if viol.any():
                    ii = np.flatnonzero(viol)
                    nrm = self._grad(lambda P: self.query(P)[1], x[ii], 0.5 * self.h_ref)
                    x[ii] += nrm * (-matU[ii] + 0.05 * self.rad[fre][ii])[:, None]     # gradient points out of the material
                    vn = np.sum(v[ii] * nrm, axis=1)
                    v[ii] -= (1.2 * np.minimum(vn, 0.0))[:, None] * nrm
            self.pos[fre] = x; self.vel[fre] = v
            dead = self.age[fre] > self.life[fre]
            if dead.any():
                self.state[fre[dead]] = 0
        self.stats['refined'] = sum(q.field.n_refined for q in self.parts)

    def _ground_default(self):
        if not self.active:
            return 0.0
        lo, _hi = self._world_bounds()
        return float(lo[2])

    def _refine(self, xw, cavs):
        """LOTCBP: request virtual-tessellation bricks wherever particles interact with a surface."""
        budget = self.p.refine_budget
        for k, i in enumerate(self.active):
            q = self.parts[i]
            near = np.abs(cavs[k]) < 1.5 * q.field.h * self.scale[i]
            if near.any() and budget > 0 and q.field.n_refined < 6000:
                loc = self.to_local(i, xw[near])
                budget -= q.field.request_refine(loc, max_new=budget)

    # ------------------------------------------------------------------ thermal / stress
    def _thermal(self, dt):
        env = self.env
        al = np.flatnonzero(self.state > 0)
        if len(al) == 0:
            return
        legal, matU, cavU, owner, cavs = self.query(self.pos[al], bricks=False)
        # combustion: chamber-resident particles relax toward the flame temperature
        role = np.array([self.parts[i].role for i in range(len(self.parts))])
        inch = (legal < 0) & (role[owner] == 'CHAMBER')
        ign = self.p.ignition
        if ign is None:
            fuel = oxid = 0
            for f_i, fl in enumerate(self.fluids):
                m = inch & (self.pfluid[al] == f_i)
                if fl['spec']['role'] == 'FUEL': fuel += int(m.sum())
                if fl['spec']['role'] == 'OXIDIZER': oxid += int(m.sum())
            ign = (min(fuel, oxid) / max(fuel, oxid, 1)) if (fuel and oxid) else 0.0
        ign = float(np.clip(ign * self.p.ignition_gain, 0.0, 1.0))
        self.ignition = ign
        if ign > 0 and inch.any():
            flame = np.array([fl['spec']['flame_t'] for fl in self.fluids])[self.pfluid[al]]
            tgt = flame * ign + self.temp[al] * (1 - ign)
            a = 1.0 - math.exp(-dt / 0.25)
            self.temp[al] = np.where(inch, self.temp[al] + (tgt - self.temp[al]) * a, self.temp[al])
        # free particles relax to ambient slowly
        fr = self.state[al] == 2
        a2 = 1.0 - math.exp(-dt / 6.0)
        self.temp[al] = np.where(fr, self.temp[al] + (env.temp - self.temp[al]) * a2, self.temp[al])
        # part lumped thermal model
        for k, i in enumerate(self.active):
            q = self.parts[i]
            contact = np.abs(cavs[k]) < np.maximum(2.5 * self.rad[al], 0.5 * q.field.h * self.scale[i])
            n = int(contact.sum())
            m = q.material
            tau = max(m['density'] * m['cp'] * q.wall ** 2 / max(m['k'], 1e-6), 0.05)
            w = min(n / 20.0, 1.0)
            tgt = (self.temp[al][contact].mean() if n else env.temp)
            T = self.part_T[i]
            T_t = w * tgt + (1 - w) * env.temp
            self.part_T[i] = T + (T_t - T) * (1 - math.exp(-dt / tau))
            dps = [self.sources[s]['dp'] for s in np.unique(self.psrc[al][contact])] if n else [0.0]
            P = max(dps) if dps else 0.0
            rr = np.mean([o['radius'] for o in self.openings if o['part'] == i]) if any(o['part'] == i for o in self.openings) else \
                (max(q.field.cavity_volume(), 1e-9) * 3 / (4 * math.pi)) ** (1 / 3) * self.scale[i]
            _sig, util = M.stress_state(m, self.part_T[i], P, rr, q.wall)
            self.part_press[i] = P
            self.part_stress[i] = util
            self.part_heat[i] = float(np.clip((self.part_T[i] - 273.15) / max(m['tmax'] - 273.15, 1.0), 0.0, 1.0))

    # ------------------------------------------------------------------ output
    def snapshot(self):
        return dict(pos=self.pos.astype(np.float32), vel=self.vel.astype(np.float32), state=self.state.copy(),
                    temp=self.temp.astype(np.float32), rad=self.rad.astype(np.float32),
                    part_T=self.part_T.astype(np.float32), part_stress=self.part_stress.astype(np.float32),
                    part_heat=self.part_heat.astype(np.float32), part_press=self.part_press.astype(np.float32),
                    ignition=np.float32(self.ignition))

    def restore(self, snap):
        self.pos[:] = snap['pos']; self.vel[:] = snap['vel']; self.state[:] = snap['state']
        self.temp[:] = snap['temp']; self.rad[:] = snap['rad']
        self.part_T[:] = snap['part_T']; self.part_stress[:] = snap['part_stress']
        self.part_heat[:] = snap['part_heat']; self.part_press[:] = snap['part_press']
