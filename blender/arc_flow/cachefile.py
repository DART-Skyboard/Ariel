"""Simulation cache: per-frame particle snapshots, stored as one compressed NumPy archive (.npz).

Why .npz: it is lossless, lazily loadable, needs nothing beyond NumPy (bundled with Blender), round-trips
every solver quantity (positions, velocities, temperatures, part temperatures / stress) so a sim can be
*resumed* from any frame, and is trivially portable between machines.  Point-cache interchange formats
(Alembic / PLY sequence) are produced from it by the Export operators."""
import base64
import io
import json
import os

import numpy as np

VERSION = 1
PER_PARTICLE = ('pos', 'vel', 'state', 'temp', 'rad')
PER_PART = ('part_T', 'part_stress', 'part_heat', 'part_press')


class Cache:
    def __init__(self, layout=None):
        self.frames = {}            # frame -> snapshot dict
        self.layout = layout or {}
        self.path = ""
        self.unsaved = 0

    def __contains__(self, f):
        return f in self.frames

    def put(self, frame, snap):
        self.frames[int(frame)] = {k: (v.copy() if hasattr(v, 'copy') else v) for k, v in snap.items()}
        self.unsaved += 1

    def get(self, frame):
        return self.frames.get(int(frame))

    def erase_after(self, frame):
        for f in [f for f in self.frames if f > frame]:
            del self.frames[f]
        self.unsaved += 1

    def range(self):
        return (min(self.frames), max(self.frames)) if self.frames else (None, None)

    def compatible(self, n_particles):
        return not self.frames or next(iter(self.frames.values()))['pos'].shape[0] == n_particles

    # ---------------------------------------------------------------- IO
    def to_bytes(self):
        bio = io.BytesIO()
        self._write(bio)
        return bio.getvalue()

    def _write(self, fh):
        fr = sorted(self.frames)
        arrays = {'frames': np.array(fr, dtype=np.int32),
                  'meta': np.frombuffer(json.dumps(dict(version=VERSION, layout=self.layout)).encode('utf8'), dtype=np.uint8)}
        if fr:
            for k in PER_PARTICLE + PER_PART:
                arr = np.stack([self.frames[f][k] for f in fr])
                if k == 'vel':
                    arr = arr.astype(np.float16)
                arrays[k] = arr
            arrays['ignition'] = np.array([float(self.frames[f].get('ignition', 0.0)) for f in fr], dtype=np.float32)
        np.savez_compressed(fh, **arrays)

    def save(self, path):
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, 'wb') as fh:
            self._write(fh)
        os.replace(tmp, path)
        self.path = path
        self.unsaved = 0
        return path

    @classmethod
    def from_file(cls, fh):
        z = np.load(fh, allow_pickle=False)
        meta = json.loads(bytes(z['meta'].tobytes()).decode('utf8'))
        c = cls(meta.get('layout', {}))
        fr = z['frames'].tolist()
        for i, f in enumerate(fr):
            snap = {k: z[k][i].astype(np.float32 if k in ('pos', 'vel', 'temp', 'rad') else z[k].dtype) for k in PER_PARTICLE + PER_PART}
            snap['state'] = z['state'][i].astype(np.int8)
            snap['ignition'] = np.float32(z['ignition'][i])
            c.frames[int(f)] = snap
        return c

    @classmethod
    def load(cls, path):
        c = cls.from_file(path)
        c.path = path
        c.unsaved = 0
        return c

    @classmethod
    def from_bytes(cls, data):
        return cls.from_file(io.BytesIO(data))

    # ---------------------------------------------------------------- text (pack into .blend)
    def to_text(self):
        b = base64.b64encode(self.to_bytes()).decode('ascii')
        return "\n".join(b[i:i + 76] for i in range(0, len(b), 76))

    @classmethod
    def from_text(cls, text):
        return cls.from_bytes(base64.b64decode("".join(text.split())))

    # ---------------------------------------------------------------- PLY export
    def export_ply_sequence(self, folder, prefix="arcflow", alive_only=True):
        os.makedirs(folder, exist_ok=True)
        n = 0
        for f in sorted(self.frames):
            s = self.frames[f]
            m = s['state'] > 0 if alive_only else np.ones(len(s['state']), bool)
            P = s['pos'][m]
            T = s['temp'][m]
            with open(os.path.join(folder, "%s_%05d.ply" % (prefix, f)), 'wb') as fh:
                fh.write(("ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty float x\nproperty float y\n"
                          "property float z\nproperty float temperature\nend_header\n" % len(P)).encode('ascii'))
                rec = np.zeros(len(P), dtype=[('p', '<f4', 3), ('t', '<f4')])
                rec['p'], rec['t'] = P, T
                fh.write(rec.tobytes())
            n += 1
        return n
