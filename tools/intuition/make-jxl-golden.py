# Regenerates tools/intuition/jxl-golden.json: SHA-256 of what the ORIGINAL Frax JXL encoder (Python, from the
# DART-Skyboard/frax-jxl-dcp-render Blender extension) writes for the fixture images. The JS port must match it byte for byte.
#   node tools/intuition/dump-fixtures.js /tmp/fx && python3 tools/intuition/make-jxl-golden.py /path/to/frax-jxl-dcp-render/extension /tmp/fx
import hashlib, json, sys, os
import numpy as np
ext, fx = sys.argv[1], sys.argv[2]
sys.path.insert(0, ext)
from jxl.encoder import Encoder, ImageOptions, FrameOptions
meta = json.load(open(os.path.join(fx, 'meta.json'))); out = {}
for name, m in meta.items():
    w, h, alpha = m['w'], m['h'], m['alpha']
    frames = [np.fromfile(os.path.join(fx, f'{name}.{i}.rgba'), np.uint8).reshape(h, w, 4).astype(np.int64) for i in range(m['n'])]
    enc = Encoder(ImageOptions(width=w, height=h, bits=8, alpha=alpha, animated=m['animated'], tps_num=m.get('fps', 1000), tps_den=1))
    for f in frames:
        if alpha: f[f[:, :, 3] == 0, :3] = 0           # colour under clear pixels is never seen (the JS port zeroes it too)
        planes = [f[:, :, c] for c in range(4 if alpha else 3)]
        enc.add_frame(planes, FrameOptions(duration=1 if m['animated'] else 0, effort=1, group_shift=m['groupShift']))
    data = enc.finish(); out[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    print(name, out[name])
json.dump(out, open(os.path.join(os.path.dirname(__file__), 'jxl-golden.json'), 'w'), indent=2)
