"""Fluid presets and equation-of-state helpers."""
import math

R_GAS = 8.314462618
P_ATM = 101325.0

# kind: LIQUID (weakly compressible, bulk modulus) or GAS (ideal gas)
FLUIDS = {
    'WATER': dict(label="Water", kind='LIQUID', density=997.0, bulk=2.2e9, molar=0.018, cp=4181.0,
                  visc=1.0e-3, temp=293.15, flame_t=293.15, color=(0.25, 0.55, 0.95), role='GENERIC'),
    'RP1': dict(label="RP-1 kerosene (fuel)", kind='LIQUID', density=810.0, bulk=1.4e9, molar=0.17, cp=2000.0,
                visc=2.0e-3, temp=290.0, flame_t=3670.0, color=(0.95, 0.75, 0.2), role='FUEL'),
    'LOX': dict(label="Liquid oxygen (oxidizer)", kind='LIQUID', density=1141.0, bulk=0.9e9, molar=0.032,
                cp=1700.0, visc=1.9e-4, temp=90.0, flame_t=3670.0, color=(0.55, 0.8, 1.0), role='OXIDIZER'),
    'LH2': dict(label="Liquid hydrogen (fuel)", kind='LIQUID', density=70.8, bulk=0.2e9, molar=0.002,
                cp=14300.0, visc=1.3e-5, temp=20.0, flame_t=3080.0, color=(0.8, 0.9, 1.0), role='FUEL'),
    'LCH4': dict(label="Liquid methane (fuel)", kind='LIQUID', density=422.0, bulk=0.6e9, molar=0.016,
                 cp=3500.0, visc=1.2e-4, temp=112.0, flame_t=3500.0, color=(0.7, 0.85, 0.7), role='FUEL'),
    'HYDRAZINE': dict(label="Hydrazine (monopropellant)", kind='LIQUID', density=1021.0, bulk=2.0e9, molar=0.032,
                      cp=3080.0, visc=9.0e-4, temp=293.15, flame_t=1300.0, color=(0.9, 0.9, 0.6), role='FUEL'),
    'OIL': dict(label="Oil (generic)", kind='LIQUID', density=870.0, bulk=1.6e9, molar=0.3, cp=1900.0,
                visc=0.05, temp=293.15, flame_t=293.15, color=(0.35, 0.25, 0.08), role='GENERIC'),
    'GOX': dict(label="Gaseous oxygen (oxidizer)", kind='GAS', density=1.31, bulk=0.0, molar=0.032, cp=918.0,
                visc=2.0e-5, temp=293.15, flame_t=3670.0, color=(0.6, 0.85, 1.0), role='OXIDIZER'),
    'N2': dict(label="Nitrogen gas", kind='GAS', density=1.165, bulk=0.0, molar=0.028, cp=1040.0,
               visc=1.8e-5, temp=293.15, flame_t=293.15, color=(0.8, 0.8, 0.9), role='GENERIC'),
    'HE': dict(label="Helium (pressurant)", kind='GAS', density=0.1664, bulk=0.0, molar=0.004, cp=5193.0,
               visc=2.0e-5, temp=293.15, flame_t=293.15, color=(0.9, 0.8, 0.95), role='GENERIC'),
    'AIR': dict(label="Air", kind='GAS', density=1.225, bulk=0.0, molar=0.02896, cp=1005.0,
                visc=1.8e-5, temp=288.15, flame_t=293.15, color=(0.85, 0.9, 1.0), role='GENERIC'),
    'CUSTOM': dict(label="Custom", kind='LIQUID', density=1000.0, bulk=2.0e9, molar=0.03, cp=2000.0,
                   visc=1.0e-3, temp=293.15, flame_t=2500.0, color=(0.5, 0.8, 0.9), role='GENERIC'),
}
FLUID_ITEMS = [(k, v['label'], '') for k, v in FLUIDS.items()]

# one-click propellant pairs
PROPELLANT_PAIRS = {
    'RP1_LOX': ("Falcon 9 style: RP-1 / LOX", ['RP1', 'LOX']),
    'LH2_LOX': ("Hydrolox: LH2 / LOX", ['LH2', 'LOX']),
    'CH4_LOX': ("Methalox: LCH4 / LOX", ['LCH4', 'LOX']),
}


def density_at(spec, pressure_pa, temp_k):
    """Fluid density (kg/m3) at a given pressure and temperature."""
    if spec['kind'] == 'GAS':
        return max(pressure_pa, 1.0) * spec['molar'] / (R_GAS * max(temp_k, 1.0))
    bulk = max(spec.get('bulk', 2e9), 1e6)
    return spec['density'] * (1.0 + (pressure_pa - P_ATM) / bulk)


def fill_mass(spec, volume_m3, pressure_pa, temp_k):
    """Mass of fluid filling `volume_m3` at the given state: volume x density(P, T)."""
    return volume_m3 * density_at(spec, pressure_pa, temp_k)
