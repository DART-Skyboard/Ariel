"""Small procedural test meshes (NumPy only)."""
import numpy as np


def uvsphere(n=24, m=12, r=1.0, center=(0, 0, 0)):
    v = [(0, 0, r)]
    for j in range(1, m):
        th = np.pi * j / m
        for i in range(n):
            ph = 2 * np.pi * i / n
            v.append((r * np.sin(th) * np.cos(ph), r * np.sin(th) * np.sin(ph), r * np.cos(th)))
    v.append((0, 0, -r))
    v = np.array(v) + np.asarray(center, float)
    t = []
    for i in range(n):
        t.append((0, 1 + i, 1 + (i + 1) % n))
    for j in range(m - 2):
        for i in range(n):
            a = 1 + j * n + i; b = 1 + j * n + (i + 1) % n; c = a + n; d = b + n
            t.append((a, c, b)); t.append((b, c, d))
    last = len(v) - 1
    for i in range(n):
        t.append((last, 1 + (m - 2) * n + (i + 1) % n, 1 + (m - 2) * n + i))
    return v, np.array(t)


def tube(n=32, r0=1.0, r1=0.8, L=4.0, center=(0, 0, 0), axis='x'):
    """Solidified tube, open ends, along `axis`.  Normals point away from the material."""
    def ring(r, x):
        return [(x, r * np.cos(2 * np.pi * i / n), r * np.sin(2 * np.pi * i / n)) for i in range(n)]
    v = np.array(ring(r0, -L / 2) + ring(r0, L / 2) + ring(r1, L / 2) + ring(r1, -L / 2))
    t = []
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        for i in range(n):
            i2 = (i + 1) % n
            A, B, C, D = a * n + i, a * n + i2, b * n + i, b * n + i2
            t.extend([(A, B, C), (B, D, C)])
    v = np.asarray(v)
    if axis == 'z':
        v = v[:, [1, 2, 0]]
    elif axis == 'y':
        v = v[:, [2, 0, 1]]
    return v + np.asarray(center, float), np.array(t)


def box(sx=1.0, sy=1.0, sz=1.0, center=(0, 0, 0)):
    """Closed solid box, outward normals."""
    x, y, z = sx / 2, sy / 2, sz / 2
    v = np.array([(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)], float)
    q = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
    t = []
    for a, b, c, d in q:
        t.extend([(a, b, c), (a, c, d)])
    return v + np.asarray(center, float), np.array(t)


def translate(m, x, y, z):
    M = np.eye(4); M[:3, 3] = (x, y, z)
    return M
