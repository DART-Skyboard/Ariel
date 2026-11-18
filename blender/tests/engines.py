"""Synthetic part records of the twin-engine demo (shared by the unit tests): no Blender needed."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'arc_flow'))
from core import materials as M, systems as S


def mat(key):
    d = dict(M.material(key)); d['label'] = M.MATERIALS[key]['label']; return d


def engine(prefix, dx, p_tank, geo=None):
    """One engine: fuel tank, ox tank, two lines, chamber, nozzle (all as feature records) + its joint edges."""
    g = dict(r_tank=1.0, r_line=0.12, L_line=4.4, r_ch=1.0, r_th=0.35, r_ex=0.8)
    g.update(geo or {})
    P = {}
    P[prefix + 'FuelTank'] = S.make_part(prefix + 'FuelTank', 'CONTAINER', volume=4.19, r_eq=g['r_tank'], length=2.0, aspect=1.2, closed=True, wall=0.004,
                                          material=mat('ALUMINUM'), fluid='RP-1', fluid_preset='RP1', prop_role='FUEL', rho=810.0, flame_t=3670.0,
                                          fill=0.75, pressure=p_tank, pos=(dx - 3.5, 0, 1.2))
    P[prefix + 'OxTank'] = S.make_part(prefix + 'OxTank', 'CONTAINER', volume=4.19, r_eq=g['r_tank'], length=2.0, aspect=1.2, closed=True, wall=0.004,
                                        material=mat('ALUMINUM'), fluid='LOX', fluid_preset='LOX', prop_role='OXIDIZER', rho=1141.0, flame_t=3670.0,
                                        fill=0.75, pressure=p_tank, pos=(dx + 2.2, 4.0, 1.2))
    for nm, pos in (('FuelLine', (dx - 0.6, 0, 1.2)), ('OxLine', (dx + 2.2, 2.0, 1.2))):
        P[prefix + nm] = S.make_part(prefix + nm, 'TRANSPORT', volume=3.14159 * g['r_line'] ** 2 * g['L_line'], r_eq=g['r_line'], length=g['L_line'],
                                     aspect=g['L_line'] / (2 * g['r_line']), closed=False, open_r=[g['r_line']] * 2, wall=0.005,
                                     material=mat('STAINLESS_STEEL'), pos=pos)
    P[prefix + 'Chamber'] = S.make_part(prefix + 'Chamber', 'CHAMBER', volume=4.2, r_eq=g['r_ch'], length=2.4, aspect=1.2, closed=True, wall=0.008,
                                        material=mat('INCONEL'), pos=(dx + 2.2, 0, 1.2))
    P[prefix + 'Nozzle'] = S.make_part(prefix + 'Nozzle', 'CHAMBER', volume=1.0, r_eq=0.5, length=3.0, aspect=3.0, closed=False,
                                       open_r=[g['r_th'], g['r_ex']], taper=g['r_ex'] / g['r_th'], wall=0.004, material=mat('INCONEL'), pos=(dx + 2.2, 0, -0.2))
    E = [(prefix + 'FuelTank', prefix + 'FuelLine'), (prefix + 'FuelLine', prefix + 'Chamber'), (prefix + 'OxTank', prefix + 'OxLine'),
         (prefix + 'OxLine', prefix + 'Chamber'), (prefix + 'Chamber', prefix + 'Nozzle')]
    return P, E


def twin(variant='GOOD', p_a=20e5, p_b=6e5, r_cf=0.018, geo_b=None):
    PA, EA = engine('A_', 0.0, p_a)
    PB, EB = engine('B_', 11.0, p_b, geo_b)
    P = {**PA, **PB}
    E = EA + EB
    P['Crossfeed'] = S.make_part('Crossfeed', 'TRANSPORT', volume=3.14159 * r_cf ** 2 * 6, r_eq=r_cf, length=6.0, aspect=30, closed=False,
                                 open_r=[r_cf] * 2, wall=0.005, material=mat('STAINLESS_STEEL'), pos=(6.0, 2.0, 1.2))
    if variant == 'GOOD':     # A ox tank -> B chamber
        E += [('Crossfeed', 'A_OxTank'), ('Crossfeed', 'B_Chamber')]
    else:                     # A chamber -> B fuel tank
        E += [('Crossfeed', 'A_Chamber'), ('Crossfeed', 'B_FuelTank')]
    return P, E
