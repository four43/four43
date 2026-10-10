# Plan: fresh snow with real ruts (spec R2-5, R2-6)

1. `tire.js`: rename `snow` → `packed`, μ 0.50. Retarget the AWD snow skidpad test (0.43–0.52; skidpad g runs ~0.9 μ).
2. `snow.js` (pure JS): `SnowField` — sparse tiles, `height`, `normal`, `surface`, `press`, `clear`,
   dirty-rect tracking. Packed→ice blended surface table.
3. `sim.js`: `setSurface(key)`; Snow creates a `SnowField` bound to the ground collider; Reset clears.
4. `vehicle.js`: snow-aware contact (ray extended by snow depth, height/normal/surface from the
   field), suspension along the normal on snow, press + plow after the substeps.
5. Tests (headless): sinks into its own ruts; coasting drag fresh > packed; second pass in own ruts
   has less drag; a sideways slide dies faster in fresh snow; rut tug pulls an offset car into a
   pre-made rut; wheelspin in place polishes the cell to ice.
6. `snowView.js` + `render.js`: window texture with raw `texSubImage2D` updates, near displaced
   mesh + far shaded plane via `onBeforeCompile`; `main.js` uses `sim.setSurface`.
7. Browser check: screenshots of ruts, packed and ice; frame time on the dev server.
