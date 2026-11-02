# arc-flow multi-instance clone test

Headless (Playwright + Chrome/SwiftShader) regression test for `templates/arc-flow.html`:

* `prerun` – Quick Rocket + N clones made *before* Simulate, then Play.
* `midrun`  – Quick Rocket running, then N clones added *during* the run (clones must start simulating at once, shared bake by default,
  without stopping or rebaking the instances that are already running).

Asserts: instance count >= N+1, every instance built + active, its own `frames` and plume clock advancing, no link crossing an instance
boundary, one world position per instance, no page errors.

```
python3 -m http.server 8765 &                      # repo root
python3 tests/arc-flow-midrun-clone/run.py both --clones 4
```
Software GL is slow: use a small viewport (the script does), expect minutes for the first bake. Exit status 0 = pass.
