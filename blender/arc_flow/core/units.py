"""Unit helpers and the common-velocity preset list."""

KELVIN_OFFSET = 273.15


def to_kelvin(value, unit):
    unit = unit.upper()
    if unit == 'K':
        return float(value)
    if unit == 'C':
        return float(value) + KELVIN_OFFSET
    if unit == 'F':
        return (float(value) - 32.0) * 5.0 / 9.0 + KELVIN_OFFSET
    raise ValueError("unknown temperature unit %r" % unit)


def from_kelvin(k, unit):
    unit = unit.upper()
    if unit == 'K':
        return float(k)
    if unit == 'C':
        return float(k) - KELVIN_OFFSET
    if unit == 'F':
        return (float(k) - KELVIN_OFFSET) * 9.0 / 5.0 + 32.0
    raise ValueError("unknown temperature unit %r" % unit)


# (identifier, label, metres per second).  From atomic scale up to hypersonic.
VELOCITY_PRESETS = [
    ('CUSTOM', "Custom", None),
    ('ELECTRON_BOHR', "Atomic: electron, Bohr orbit (2.19e6 m/s)", 2.19e6),
    ('THERMAL_H2', "Atomic: H2 molecule rms @300 K (1930 m/s)", 1930.0),
    ('THERMAL_N2', "Atomic: N2 molecule rms @300 K (517 m/s)", 517.0),
    ('BROWNIAN', "Micro: Brownian drift (1e-6 m/s)", 1.0e-6),
    ('CAPILLARY', "Micro: capillary creep (1 mm/s)", 1.0e-3),
    ('SEEP', "Slow seep / drip (1 cm/s)", 1.0e-2),
    ('LAMINAR', "Laminar pipe flow (0.1 m/s)", 0.1),
    ('WALKING', "Walking water / river (1.5 m/s)", 1.5),
    ('HOSE', "Garden hose (8 m/s)", 8.0),
    ('FIREHOSE', "Fire hose (35 m/s)", 35.0),
    ('PRESSURE_WASHER', "Pressure washer (100 m/s)", 100.0),
    ('SOUND', "Speed of sound in air, Mach 1 (343 m/s)", 343.0),
    ('SUPERSONIC', "Supersonic, Mach 2 (686 m/s)", 686.0),
    ('HYPERSONIC_5', "Hypersonic threshold, Mach 5 (1715 m/s)", 1715.0),
    ('NOZZLE', "Rocket nozzle exit, ~Mach 8 (2700 m/s)", 2700.0),
    ('HYPERSONIC_10', "Hypersonic, Mach 10 (3430 m/s)", 3430.0),
    ('ORBITAL', "Orbital velocity, LEO (7800 m/s)", 7800.0),
]


def velocity_from_preset(ident, default=0.0):
    for i, _l, v in VELOCITY_PRESETS:
        if i == ident and v is not None:
            return v
    return default
