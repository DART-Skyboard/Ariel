"""Atmosphere presets and gas-mix physics (pure NumPy / math, no bpy).

A gas mix is a dict {compound_id: mole fraction}.  Everything the solver needs from the surrounding atmosphere is
derived from the mix and the ambient pressure / temperature:

    molar mass  M = sum x_i M_i                                   (kg/mol)
    density     rho = P M / (R T)                                 (ideal gas, kg/m3)
    gamma       = sum x_i cp_i / sum x_i cv_i   with cp_i = g_i/(g_i-1) R   (molar heat capacities)
    viscosity   mu_i(T) = mu0_i (T/273.15)^1.5 (273.15+S_i)/(T+S_i)   (Sutherland), mixed by Herning-Zipperer:
                mu = sum x_i mu_i sqrt(M_i) / sum x_i sqrt(M_i)
    sound speed a = sqrt(gamma R T / M)
    scale height H = R T / (M g)

The solver uses rho for gas drag and buoyancy, mu for Stokes drag on small droplets, P for the spill / vent pressure
difference, gamma for the isentropic expansion of exhaust gas.  Phase changes and chemical reactions are not modelled.
"""
import math

R_GAS = 8.314462618
T_REF = 273.15

# id: (label, molar mass kg/mol, heat capacity ratio gamma, viscosity at 273.15 K in Pa s, Sutherland constant S in K)
COMPOUNDS = {
    'N2':  ("Nitrogen (N2)",        0.0280134, 1.400, 1.663e-5, 107.0),
    'O2':  ("Oxygen (O2)",          0.0319988, 1.395, 1.919e-5, 139.0),
    'AR':  ("Argon (Ar)",           0.039948,  1.667, 2.125e-5, 144.0),
    'CO2': ("Carbon dioxide (CO2)", 0.04401,   1.289, 1.370e-5, 222.0),
    'CH4': ("Methane (CH4)",        0.01604,   1.307, 1.025e-5, 198.0),
    'H2':  ("Hydrogen (H2)",        0.002016,  1.410, 8.411e-6, 97.0),
    'HE':  ("Helium (He)",          0.004003,  1.667, 1.870e-5, 79.4),
    'H2O': ("Water vapour (H2O)",   0.018015,  1.330, 8.200e-6, 1000.0),
    'NH3': ("Ammonia (NH3)",        0.017031,  1.310, 9.180e-6, 370.0),
    'SO2': ("Sulfur dioxide (SO2)", 0.064066,  1.260, 1.170e-5, 416.0),
}
COMPOUND_ITEMS = [(k, v[0], "M %.4f kg/mol, gamma %.3f" % (v[1], v[2])) for k, v in COMPOUNDS.items()]

# Reference conditions (surface / 1 bar level).  sky = world background colour, ground = ground-plane base colour,
# fog = fog scale (1/m at Earth density, multiplied by rho/rho_earth in the world shading hook).
PRESETS = {
    'EARTH':   dict(label="Earth", pressure=101325.0, temperature=288.15, gravity=9.80665,
                    mix={'N2': 0.7808, 'O2': 0.2095, 'AR': 0.0093, 'CO2': 0.0004},
                    sky=(0.28, 0.50, 0.90), ground=(0.12, 0.17, 0.08)),
    'MARS':    dict(label="Mars", pressure=610.0, temperature=210.0, gravity=3.721,
                    mix={'CO2': 0.9532, 'N2': 0.027, 'AR': 0.016, 'O2': 0.0013},
                    sky=(0.72, 0.46, 0.30), ground=(0.35, 0.14, 0.07)),
    'VENUS':   dict(label="Venus", pressure=9.2e6, temperature=737.0, gravity=8.87,
                    mix={'CO2': 0.965, 'N2': 0.035, 'SO2': 0.00015},
                    sky=(0.80, 0.58, 0.22), ground=(0.10, 0.07, 0.05)),
    'TITAN':   dict(label="Titan", pressure=146700.0, temperature=94.0, gravity=1.352,
                    mix={'N2': 0.949, 'CH4': 0.049, 'H2': 0.001},
                    sky=(0.62, 0.38, 0.10), ground=(0.16, 0.09, 0.04)),
    'JUPITER': dict(label="Jupiter (1 bar level)", pressure=1.0e5, temperature=165.0, gravity=24.79,
                    mix={'H2': 0.8975, 'HE': 0.102, 'CH4': 0.003, 'NH3': 0.0003},
                    sky=(0.66, 0.52, 0.38), ground=None),
}
PRESET_ITEMS = [(k, v['label'], "") for k, v in PRESETS.items()] + [('CUSTOM', "Custom", "Edit pressure, temperature, gravity and the gas mix by hand")]


def normalise(mix):
    """Drop non-positive / unknown entries and scale the mole fractions to sum to one."""
    m = {k: float(v) for k, v in mix.items() if k in COMPOUNDS and float(v) > 0.0}
    tot = sum(m.values())
    if tot <= 0.0:
        return {'N2': 0.7808, 'O2': 0.2095, 'AR': 0.0097}
    return {k: v / tot for k, v in m.items()}


def molar_mass(mix):
    m = normalise(mix)
    return sum(x * COMPOUNDS[k][1] for k, x in m.items())


def gamma(mix):
    m = normalise(mix)
    cp = sum(x * COMPOUNDS[k][2] / (COMPOUNDS[k][2] - 1.0) * R_GAS for k, x in m.items())
    cv = sum(x * 1.0 / (COMPOUNDS[k][2] - 1.0) * R_GAS for k, x in m.items())
    return cp / cv


def species_viscosity(cid, temp_k):
    _l, _M, _g, mu0, S = COMPOUNDS[cid]
    T = max(temp_k, 1.0)
    return mu0 * (T / T_REF) ** 1.5 * (T_REF + S) / (T + S)


def viscosity(mix, temp_k):
    m = normalise(mix)
    num = sum(x * species_viscosity(k, temp_k) * math.sqrt(COMPOUNDS[k][1]) for k, x in m.items())
    den = sum(x * math.sqrt(COMPOUNDS[k][1]) for k, x in m.items())
    return num / den


def density(mix, pressure_pa, temp_k):
    return max(pressure_pa, 0.0) * molar_mass(mix) / (R_GAS * max(temp_k, 1.0))


def sound_speed(mix, temp_k):
    return math.sqrt(gamma(mix) * R_GAS * max(temp_k, 1.0) / molar_mass(mix))


def scale_height(mix, temp_k, g):
    return R_GAS * max(temp_k, 1.0) / (molar_mass(mix) * max(g, 1e-6))


def state(mix, pressure_pa, temp_k, g=9.80665):
    """Everything derived from a mix at (P, T) in one dict."""
    return dict(molar=molar_mass(mix), gamma=gamma(mix), mu=viscosity(mix, temp_k), rho=density(mix, pressure_pa, temp_k),
                sound=sound_speed(mix, temp_k), scale_height=scale_height(mix, temp_k, g))


def preset_state(key):
    p = PRESETS[key]
    s = state(p['mix'], p['pressure'], p['temperature'], p['gravity'])
    s.update(pressure=p['pressure'], temperature=p['temperature'], gravity=p['gravity'])
    return s


def fog_density(rho, rho_earth=1.225, base=0.002, cap=0.2):
    """Volume-scatter density (1/m) for the world shading hook: proportional to the gas density, capped for render time."""
    return min(max(base * rho / rho_earth, 0.0), cap)
