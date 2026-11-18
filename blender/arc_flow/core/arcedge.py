"""Arc Edge math (LEATR / DART Meadow) - the author's circumference ladder, vectorised with NumPy.

Documented formulas (LEATR documentation, "Lead Edge Ash Tree Reflex"):
    circumference(d) = (sqrt(d*3))^2      (= 3*d)
    area             = circumference^2
    volume           = area^3
    sphere surface   = volume * 0.25
    branch arc       = circumference * 0.125     (a 1/8 circle arc)
    ArcEdge builder  : y = ((x*2)+1)/x
Worked example d=1: circumference 3, area 9, volume 729, sphere surface 182.25.

Measuring principle: on any curve a 1/8th of a perfect circle occurs at any point, so a curve is measured by
finding the first circle (small to large) whose 1/8 arc matches the arc between two points x and y on the curve.

ACCURACY NOTE: the documented circumference 3*d is about 4.5% below the geometric pi*d.  In Projection Remesh the
Arc Edge ladder is used ONLY as the scale/ratio measure that drives the density field.  All geometric work
(deviation from the source surface, symmetry error, edge lengths, projection distances) is exact Euclidean.
It does not replace pi in the geometry."""
import numpy as np

CIRCUM_FACTOR = 3.0          # the documented circumference constant
ARC_FRACTION = 0.125         # branch arc = 1/8 of the circumference


def circumference(d):
    return np.sqrt(np.asarray(d, dtype=np.float64) * 3.0) ** 2


def area(d):
    return circumference(d) ** 2


def volume(d):
    return area(d) ** 3


def sphere_surface(d):
    return volume(d) * 0.25


def branch_arc(d):
    return circumference(d) * ARC_FRACTION


def arcedge_y(x):
    """ArcEdge builder y = ((x*2)+1)/x."""
    x = np.asarray(x, dtype=np.float64)
    return ((x * 2.0) + 1.0) / x


def diameter_from_arc(arc):
    """Diameter of the circle whose branch (1/8) arc equals `arc` (inverse of branch_arc)."""
    return np.asarray(arc, dtype=np.float64) / (CIRCUM_FACTOR * ARC_FRACTION)


def ladder(d_min, d_max, ratio=2 ** 0.5):
    """Ascending ladder of circle diameters d_min .. d_max (geometric steps)."""
    n = int(np.ceil(np.log(max(d_max / d_min, 1.0)) / np.log(ratio))) + 1
    return d_min * ratio ** np.arange(n)


def match_circle(arc, diameters):
    """First circle (small to large) of the ascending ladder whose 1/8 arc is >= `arc`.
    Returns the ladder index per arc (clipped to the last rung)."""
    arcs = branch_arc(diameters)
    return np.minimum(np.searchsorted(arcs, np.asarray(arc, dtype=np.float64), side="left"), len(arcs) - 1)
