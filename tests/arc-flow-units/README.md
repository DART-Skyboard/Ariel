# arc-flow unit-scale test
Headless Playwright check for the Blender-style unit system in `templates/arc-flow.html` (`<units:begin>` block).
`python3 -m http.server 8765` from the repo root, then `python3 tests/arc-flow-units/run.py`. Exit 0 = pass.
Covers the import scale (mm/cm/in/ft/m/custom/unitless), persistence across reload and the display toggle default; physics stays 1 unit = 1 m.
