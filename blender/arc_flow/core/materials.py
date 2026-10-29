"""Structural / thermal material presets (typical handbook values, SI units).

density kg/m3, young Pa, yield Pa, k W/(m K), cp J/(kg K), tmax K (service limit),
alpha 1/K (thermal expansion), poisson ratio.
"""

MATERIALS = {
    'INDUSTRIAL_STEEL': dict(label="Industrial steel (A36)", density=7850.0, young=200e9, yield_=250e6,
                             k=50.0, cp=490.0, tmax=1000.0, alpha=12e-6, poisson=0.29),
    'STAINLESS_STEEL': dict(label="Stainless steel (304)", density=8000.0, young=193e9, yield_=215e6,
                            k=16.2, cp=500.0, tmax=1150.0, alpha=17.3e-6, poisson=0.29),
    'TITANIUM': dict(label="Aerospace titanium (Ti-6Al-4V)", density=4430.0, young=114e9, yield_=880e6,
                     k=6.7, cp=526.0, tmax=873.0, alpha=8.6e-6, poisson=0.34),
    'ALUMINUM': dict(label="Aerospace aluminum (7075-T6)", density=2810.0, young=71.7e9, yield_=503e6,
                     k=130.0, cp=960.0, tmax=450.0, alpha=23.4e-6, poisson=0.33),
    'COPPER': dict(label="Copper (C101, annealed)", density=8960.0, young=117e9, yield_=70e6,
                   k=391.0, cp=385.0, tmax=1300.0, alpha=16.5e-6, poisson=0.34),
    'INCONEL': dict(label="Inconel 718", density=8190.0, young=200e9, yield_=1034e6,
                    k=11.4, cp=435.0, tmax=1250.0, alpha=13e-6, poisson=0.29),
    'CARBON_COMPOSITE': dict(label="Carbon composite (CFRP)", density=1600.0, young=70e9, yield_=600e6,
                             k=5.0, cp=1000.0, tmax=450.0, alpha=2e-6, poisson=0.30),
    'GLASS': dict(label="Glass (borosilicate)", density=2230.0, young=64e9, yield_=35e6,
                  k=1.14, cp=830.0, tmax=700.0, alpha=3.3e-6, poisson=0.20),
    'CUSTOM': dict(label="Custom", density=7850.0, young=200e9, yield_=250e6,
                   k=50.0, cp=490.0, tmax=1000.0, alpha=12e-6, poisson=0.29),
}

MATERIAL_ITEMS = [(k, v['label'], '') for k, v in MATERIALS.items()]


def material(ident):
    return MATERIALS.get(ident, MATERIALS['INDUSTRIAL_STEEL'])


def yield_at(m, temp_k):
    """Yield strength derated linearly to 10 % at the service-limit temperature."""
    t0 = 300.0
    f = 0.0 if m['tmax'] <= t0 else min(max((temp_k - t0) / (m['tmax'] - t0), 0.0), 1.0)
    return m['yield_'] * (1.0 - 0.9 * f)


def stress_state(m, temp_k, pressure_pa, radius_m, wall_m, t_ref=293.15, constrained=0.25):
    """Return (sigma_vm_pa, utilisation) for a thin-walled pressurised, heated part.

    hoop stress  = P r / t       (thin-wall vessel)
    thermal      = E alpha dT / (1 - nu) * constrained   (fully restrained fraction)
    combined as a magnitude sum (conservative) and divided by temperature-derated yield.
    """
    wall_m = max(wall_m, 1e-6)
    hoop = max(pressure_pa, 0.0) * radius_m / wall_m
    dt = temp_k - t_ref
    thermal = abs(m['young'] * m['alpha'] * dt / max(1.0 - m['poisson'], 0.1)) * constrained
    sigma = hoop + thermal
    return sigma, sigma / max(yield_at(m, temp_k), 1.0)


def thermal_ramp(t):
    """Same cold->cyan->orange->white ramp as the Arc Flow web app. t in [0,1] -> (r,g,b)."""
    t = min(max(float(t), 0.0), 1.0)
    cold, mid, warm, hot = (0.2, 0.55, 1.0), (0.0, 0.9, 0.85), (1.0, 0.55, 0.15), (1.0, 0.95, 0.85)

    def lerp(a, b, f):
        return tuple(a[i] + (b[i] - a[i]) * f for i in range(3))
    if t < 0.33:
        return lerp(cold, mid, t / 0.33)
    if t < 0.66:
        return lerp(mid, warm, (t - 0.33) / 0.33)
    return lerp(warm, hot, (t - 0.66) / 0.34)


# (stop position, r, g, b) tuples used to build node-based colour ramps
THERMAL_STOPS = [(0.0, 0.2, 0.55, 1.0), (0.33, 0.0, 0.9, 0.85), (0.66, 1.0, 0.55, 0.15), (1.0, 1.0, 0.95, 0.85)]
