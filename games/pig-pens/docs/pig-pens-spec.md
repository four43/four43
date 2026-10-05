# Pig Pens: Technical Specification

Version: 1.3 (mud and hose release)
Date: 4 October 2026
Published page: https://claude.ai/artifact/LJhHWc3FBwULhavmjkyG75
Language standard: ASD-STE100 Simplified Technical English (STE). Technical names (TN) and technical verbs (TV) for this domain are in Section 2.

---

## 1. Introduction

### 1.1 Purpose

This document specifies the Pig Pens herd simulation. It gives the architecture, the physics model, the herd behavior, the user tools and the test results. Use this document to change, tune or extend the simulation.

### 1.2 Scope

Pig Pens is a browser application. It shows a herd of pigs on a farm. The farm has six pens, a lane, a field and a mud wallow. The pigs move as a flock. They also have needs: food, mud and baths.

The user has five tools:

- Shoo: send a dog to move the pigs.
- Feed: toss a snack.
- Hose: spray water to clean muddy pigs.
- Grab: lift and throw a pig.
- Look: turn the camera.

### 1.3 Deliverable

The deliverable is one self-contained HTML file, `pig-pens.html`. The file is approximately 5.7 MB. It contains the application code, the physics engine, the 3D library and the 3D models. The file does not load other files at runtime. The only exception is one web font. If the font does not load, the page uses a fallback font.

### 1.4 Libraries and assets

| Item | Version or source | Function |
|---|---|---|
| three.js | 0.160.0 | 3D rendering |
| Rapier | `@dimforge/rapier3d-compat` 0.21.0 | Rigid-body physics (WASM inside the bundle) |
| esbuild | latest | Bundler (IIFE format, minified) |
| Kenney Cube Pets | CC0 | Pig and dog models with animations |
| Kenney Nature Kit | CC0 | Fences, trees, plants, rocks, crops |
| Kenney Food Kit | CC0 | Snacks, trough food, barrels |
| Kenney Graveyard Kit | CC0 | Hay bales |
| Kenney Car Kit | CC0 | Tractor |

The Kenney models come from a GitHub mirror of the CC0 packs (`Hidencod/tge-assets`).

---

## 2. Terms

| Term | Type | Definition |
|---|---|---|
| Boids | TN | A flock model. Each agent steers with three rules: separation, alignment and cohesion. |
| Flow field | TN | A grid of path distances to a target. A pig moves to the neighbor cell with the smallest distance. |
| Feeler | TN | A short ray in front of a pig. It finds fences and other obstacles. |
| Tile | TN | One fence section. One tile is 2.4 m long. |
| Pen | TN | One of six fenced areas, 12 m × 12 m. |
| Lane | TN | The fenced path between the two rows of pens. |
| Field | TN | The fenced grass area around the pens. |
| Wallow | TN | The mud area in the field. Pigs get muddy there. |
| Trough | TN | The food box in each pen. |
| Snack | TN | One food item that the user tosses. |
| Hunger | TN | A pig value from 0 (full) to 1 (very hungry). |
| Panic | TN | A pig value from 0 (calm) to 1 (very afraid). |
| Mud level | TN | A pig value from 0 (clean) to 1 (fully muddy). |
| Zoomies | TN | The fast run that a pig does after a bath. State name: ZOOM. |
| Traction | TN | The horizontal force that the ground gives a pig. The model limits it to a maximum acceleration. |
| Step | TN | One physics update. One step is 1/60 s. |
| Simulate | TV | Calculate the next state of the farm. |
| Render | TV | Draw the scene on the screen. |
| Bake | TV | Convert a model file into compact geometry data before the build. |

---

## 3. System overview

### 3.1 Architecture

The code has two layers. The simulation layer has no rendering code. It operates in Node.js for headless tests. The presentation layer reads the simulation state and renders it.

| File | Layer | Function |
|---|---|---|
| `src/layout.js` | Simulation | Farm layout data: fence edges, pens, troughs, obstacles, decor, destinations. |
| `src/flow.js` | Simulation | Flow-field grid and obstacle tests. |
| `src/sim.js` | Simulation | Rapier world, pig behavior, dog, snacks, mud, hose, grab. |
| `src/main.js` | Presentation | Scene, models, animation, mud shader, water particles, camera, input, minimap. |
| `src/sound.js` | Presentation | Synthesized sounds. |
| `src/assets.json` | Data | Baked Kenney geometry and animation tables. |
| `bake.mjs` | Build tool | Converts Kenney GLB files into `assets.json`. |
| `template.html` | Presentation | Page structure, CSS and toolbar. |
| `build.py` | Build tool | Bundles the code and puts it into the template. |

### 3.2 Update cycle

The simulation uses a fixed step of 1/60 s. The render loop adds the frame time to an accumulator. Then it does steps until the accumulator is less than one step.

The loop does a maximum of 4 steps in one frame. If the frame rate is less than 15 frames per second, the simulation becomes slower than real time. This prevents a long chain of steps after a slow frame.

Each step does these operations in this sequence:

1. The farmer refills a trough if the refill timer is at zero.
2. The flow field to the hose target updates, if necessary.
3. The dog moves to its target.
4. Each snack updates its age and position.
5. Each pig reads its neighbors, updates its needs and selects a state.
6. Each pig calculates a desired velocity and applies a traction impulse.
7. Rapier does one physics step.
8. The hose cleans the pigs in the spray.
9. The simulation counts the pigs in each area.

### 3.3 Determinism

The simulation uses a seeded random number generator (mulberry32). The default seed is 1. With the same seed and the same user input, the simulation gives the same result. The water particles in the presentation layer use a different random source. These particles have no effect on the simulation.

### 3.4 URL parameters

| Parameter | Default | Function |
|---|---|---|
| `pigs` | 48 | Number of pigs |
| `seed` | 1 | Random seed |

---

## 4. Farm layout

### 4.1 Grid

The layout uses a grid of 2.4 m tiles. The tile coordinate (tx, tz) changes to world coordinates with these equations:

- x = (tx − 7.5) × 2.4
- z = (tz − 6) × 2.4

### 4.2 Areas

| Area | Tiles | Size | Notes |
|---|---|---|---|
| Pen complex | 15 × 12 | 36 m × 28.8 m | Center of the world |
| Pen (6) | 5 × 5 | 12 m × 12 m | Two rows of three pens |
| Lane | 15 × 2 | 36 m × 4.8 m | Between the two rows |
| Field | 25 × 22 | 60 m × 52.8 m | Around the complex |
| Wallow | Ellipse | 6.8 m × 5.2 m | West side of the field |

### 4.3 Gates

All gates are open. Each gate is one tile wide (2.4 m). The farm has 14 gates:

- 6 gates from the pens to the lane (one for each pen).
- 4 gates between pens in the same row.
- 2 gates at the ends of the lane, into the field.
- 2 gates from corner pens into the field.

Two posts mark each gate. The gate leaf is open and lies near the adjacent fence. The gate leaf has no collider.

### 4.4 Obstacles

The layout gives one list of obstacles. The physics world and the flow-field grid both use this list. Thus the physics and the route data always agree.

| Obstacle | Shape | Height |
|---|---|---|
| Fence tile | Box, 2.4 m × 0.18 m | 0.84 m |
| Field boundary tile | Box, 2.4 m × 0.18 m | 3.0 m (above the visible planks) |
| Gate post | Box, 0.2 m × 0.18 m | 0.84 m |
| Trough | Box, 2.3 m × 0.62 m | 0.42 m |
| Hay bale | Box | 0.9 m |
| Water barrel | Cylinder, radius 0.52 m | 1.1 m |
| Tree | Cylinder, radius 0.40 to 0.45 m | 2 m |
| Tractor | Rotated box | 2.6 m |

The field boundary is 3 m high. This keeps thrown pigs on the farm.

### 4.5 Troughs

Each pen has one trough against its outer wall. Each trough has a food level from 0 to 1.

---

## 5. Physics model

### 5.1 World

The Rapier world has gravity of −9.81 m/s². The ground is a large static box. All obstacles are static colliders.

### 5.2 Collision groups

| Group | Collides with |
|---|---|
| Ground | All |
| Static obstacles | Pigs, snacks |
| Pigs | All |
| Snacks | All |
| Dog | Ground, pigs, snacks |

The dog does not collide with fences or other static obstacles. Thus the dog can go to all parts of the farm quickly. The renderer shows a jump when the dog is near a fence.

### 5.3 Pig body

| Property | Adult | Piglet |
|---|---|---|
| Collider | Ball, radius 0.40 m | Ball, radius 0.25 m |
| Mass | 60 kg | 12 kg |
| Model scale | 0.62 (±7 %) | 0.38 (±7 %) |
| Friction | 0 (Min rule) | 0 (Min rule) |
| Restitution | 0.15 | 0.15 |
| Rotation | Locked | Locked |
| CCD | On | On |

Approximately 72 % of the pigs are adults. Each piglet has one adult as its mother.

The pig collider has zero friction. The traction model (Section 5.4) gives all horizontal forces. This keeps the movement predictable and lets pigs slide along fences.

### 5.4 Traction

Each pig has a desired velocity. The traction model calculates an acceleration:

a = (v_desired − v) / 0.35 s

The model limits the magnitude of a:

- Walk: 3.5 m/s²
- Run (FLEE and ZOOM): 8.0 m/s²

The model applies a = m × a × Δt as an impulse at the body center. It applies the impulse only when the body is on the ground (height less than r + 0.15 m).

### 5.5 Body direction

The body direction (yaw) turns to the direction of the velocity. The maximum turn rate is 3.5 rad/s. In FLEE, the maximum turn rate is 7 rad/s. At the trough, the pig turns to face the trough. In SHOWER, the pig turns to face the nozzle.

### 5.6 Dog body

The dog is a ball with radius 0.36 m and mass 25 kg. The dog moves to the user target with a maximum speed of 8 m/s and a maximum acceleration of 16 m/s². When the user releases the tool, the dog stops and stays at its position.

### 5.7 Grab and throw

When the user grabs a pig, these changes occur:

- The rotation lock of the body is removed.
- The collider friction changes to 0.7.
- A spring attaches to a point 0.3 m above the body center (the "scruff").

The spring has a natural frequency of 8 rad/s and a damping ratio of 0.6. The spring also cancels the weight of the pig. The spring force is limited to 60 g. The target point is on a horizontal plane at 1.7 m.

When the user releases the pig, the pig goes into state AIR. The release speed is limited to 14 m/s. The pig tumbles because the spring was not at the center of mass.

When the pig touches the ground, the model removes speed and spin:

- Linear: an opposite impulse at 2.5 per second.
- Angular: a decrease of 3 per second.

This simulates the friction of a body that is not round. The pig is settled when these conditions are true for 0.35 s:

- Speed is less than 0.5 m/s.
- Angular speed is less than 1.5 rad/s.

After 8 s, the pig is settled in all conditions. When the pig is settled, the rotation lock is applied again. The renderer then turns the pig upright over approximately 0.6 s.

### 5.8 Snack body

| Snack | Ball radius |
|---|---|
| Apple | 0.17 m |
| Carrot | 0.14 m |
| Cabbage | 0.26 m |
| Corn cob | 0.15 m |

All snacks have friction 0.9 and restitution 0.35. The rotation is free. Each snack starts 5 m from its target, toward the camera, at a height of 3.5 m. The flight time is 0.85 s. The start velocity is a ballistic solution for that flight time.

---

## 6. Navigation

### 6.1 Flow-field grid

The grid covers the field with cells of 0.4 m. The grid has 150 × 132 cells. A cell is blocked if it is less than 0.48 m from an obstacle. This distance is a little more than the adult pig radius.

The model calculates each field with Dijkstra's algorithm. Diagonal moves cost √2 × cell size. Diagonal moves cannot cross the corner of a blocked cell.

| Field | Target | When the model calculates it |
|---|---|---|
| Trough (6) | 0.95 m in front of each trough | At start |
| Destination (7) | Each pen center and the wallow | At start |
| Snack | Snack position | When the snack lands, and when it moves more than 1.2 m |
| Hose | Spray target | Maximum two times each second, when the target moves more than 0.8 m |

One field calculation takes less than 10 ms at all positions on the farm.

### 6.2 Direction from a field

The model calculates a direction at the pig position from two values:

1. The smooth gradient of the bilinear distance values.
2. The direction to the lowest cell in a 4 × 4 area around the pig.

The model uses the average of these two directions. The second value moves pigs correctly through narrow gates and around corners.

### 6.3 Feelers

Pigs in ROAM, FLEE and ZOOM use feelers. Each pig casts three rays at a height of 0.3 m:

| Ray | Angle | Weight |
|---|---|---|
| Center | 0 | 1.0 |
| Left | +0.6 rad | 0.75 |
| Right | −0.6 rad | 0.75 |

The ray length is 1.2 m + 0.5 × speed. The rays find static obstacles only. Each hit gives a push along the surface normal. The push decreases with distance. The center ray also gives a push along the wall. The direction of this push is the side that the pig moves to already. Each pig casts rays on alternate steps.

---

## 7. Herd behavior

### 7.1 Flock rules

Each pig examines all other pigs in a radius of 5 m.

| Rule | Radius | Weight | Function |
|---|---|---|---|
| Separation | r₁ + r₂ + 0.35 m | 1.6 (added after the speed) | Keeps space between pigs |
| Alignment | 3 m | 0.5 (ROAM), 0.2 (TRAVEL), 0.7 (FLEE) | Matches the velocity of neighbors |
| Cohesion | 5 m | Maximum 0.6 | Moves to the center of neighbors |
| Wander | — | 1.0 | Random slow change of direction |
| Feelers | — | 2.5 × maximum(speed, 0.8 m/s) | Moves away from obstacles |

The model normalizes the sum of the direction rules. Then it multiplies the result by the state speed. Then it adds separation and feelers. The result is limited to 1.1 × the state speed (minimum 0.9 m/s).

### 7.2 States

| State | Speed | Behavior | Exit |
|---|---|---|---|
| ROAM | 0.55 m/s | Wander with the flock | After 3 to 8 s, go to GRAZE |
| GRAZE | 0 | Stand and eat grass | After 4 to 11 s, go to ROAM |
| TRAVEL | 1.25 m/s (+0.6 × hunger to a trough) | Follow a flow field | At the target, or after 60 to 70 s |
| EAT | 0 | Eat at the trough | Hunger < 0.04, or trough empty |
| FLEE | 1.8 + 2.6 × panic m/s | Run from the threat | Panic < 0.12 |
| REST | 0 | Lie on one side in the wallow | After 14 to 28 s |
| SNACK | 2.0 m/s | Go to a snack and eat it | Snack eaten or removed, or after 25 s |
| GRAB | — | Hang from the spring | User releases the pig |
| AIR | — | Tumble after a throw | Pig settled |
| SHOWER | Maximum 1.8 m/s | Go to the spray and stand in it | Mud < 0.03, or 2.5 s after the hose stops |
| ZOOM | 3.7 m/s (piglets × 0.9) | Run away after a bath | After 2.5 to 5 s |

### 7.3 Priority

The model checks these conditions in this sequence:

1. If panic is more than 0.3, the pig goes into FLEE. FLEE has priority over all other states except GRAB and AIR.
2. A pig in ROAM, GRAZE, REST or TRAVEL to a destination examines the snacks four times each second. If it finds a snack, it goes into SNACK.
3. If hunger is more than 0.68, the pig selects a trough and goes into TRAVEL.
4. If the curiosity timer is at zero, the pig can select a new destination.
5. If the hose operates and the pig is muddy, the pig can go into SHOWER.

### 7.4 Hunger and troughs

Hunger increases at a rate of 1/50 to 1/85 per second. The rate is different for each pig.

The pig selects the trough with the lowest score:

score = path distance + 5 × (number of pigs that go to that trough) + 12 (if the level is less than 0.2)

The pig does not select a trough with a level less than 0.06.

At the trough, the pig decreases its hunger at 0.2 per second. One trough holds 10 hunger units. A piglet takes 0.4 of the food that an adult takes.

The farmer refills one trough at a time. The interval is 14 s × 48 / (number of pigs). The farmer selects a random trough with a level less than 0.5. The troughs thus get food at different times. The herd moves between pens to find food.

### 7.5 Curiosity

Each pig has a curiosity timer of 35 to 90 s. When the timer is at zero, an adult pig with hunger less than 0.5 selects a destination:

- If the mud level is less than 0.3, the pig goes to the wallow with a probability of 0.5.
- If the mud level is 0.3 or more, the pig goes to the wallow with a probability of 0.12.
- If the pig does not go to the wallow, it goes to a different pen.

Calm adult pigs in a radius of 3.5 m join the trip with a probability of 0.6. Thus small groups move together through the gates.

### 7.6 Piglets

A piglet stays near its mother. If the distance is more than 1.6 m, the piglet moves to its mother. Beyond 4 m, the piglet uses the flow field of its mother. If the mother rests, a near piglet also rests.

The mother attraction does not apply in these conditions:

- The piglet goes to a trough.
- The piglet is in SHOWER, ZOOM, FLEE, EAT or SNACK.

### 7.7 Fear

The dog causes panic. The fear radius is 6.5 m when the dog is active or moves faster than 1.5 m/s. The fear radius is 2.6 m when the dog is idle.

In the fear radius, panic increases at this rate:

5 × (1 − distance / radius) per second

Piglets get panic 1.3 times faster.

Panic moves through the herd. If a neighbor in a radius of 2.6 m has more panic, the pig moves its panic to 0.8 × the panic of that neighbor. The pig also flees from the threat of that neighbor.

A pig in GRAB or AIR also frightens pigs in a radius of 4 m. Panic decreases at 0.22 per second.

---

## 8. Snacks

### 8.1 Limits

| Item | Value |
|---|---|
| Maximum snacks on the farm | 5 |
| Maximum pigs that come to one snack from a distance | 3 |
| Total eat time | 2.5 s |
| Time on the ground before the snack disappears | 20 s |
| Shrink time before the snack disappears | 1.5 s |

When the farm has 5 snacks, the Feed tool does not toss more snacks. The Feed button shows the number of snacks that are available. At 0, the badge is grey and a message tells the user to wait.

### 8.2 Smell

A pig finds a snack if the path distance is less than 16 m. If hunger is more than 0.5, the distance is 26 m.

### 8.3 Snack consumption

All pigs in reach of a snack eat it at the same time. The eat time adds together. Thus a group of pigs eats a snack faster than one pig. A pig in reach can join a snack that already has 3 pigs.

The snack shrinks while the pigs eat it. Each pig that eats decreases its hunger at 0.12 per second.

If no pig eats a snack in 20 s, the snack shrinks and disappears. Thus a snack cannot attract the herd for a long time.

---

## 9. Mud and hose

### 9.1 Mud gain

A pig gets mud when its center is in the wallow ellipse:

| Condition | Mud gain |
|---|---|
| REST in the wallow | 0.16 per second |
| Other states in the wallow | 0.07 per second |
| Out of the wallow | −0.0015 per second (the mud dries slowly) |

At start, approximately 35 % of the pigs have a mud level from 0.45 to 1.0. A pig is muddy when its mud level is more than 0.3.

### 9.2 Hose control

The Hose tool sets a spray target on the ground below the finger. The nozzle is 5.2 m from the target, toward the camera, and 1.2 m to the side. The nozzle height is 1.5 m.

### 9.3 Bath behavior

When the hose operates, a muddy pig in a radius of 11 m goes into SHOWER. These states can change to SHOWER: ROAM, GRAZE, REST, TRAVEL and SNACK.

In SHOWER, the pig moves to the spray target. Beyond 2.5 m, the pig uses the hose flow field. Near the target, the pig stands still and faces the nozzle. The renderer plays a happy dance animation.

The hose cleans all pigs in the spray. The spray radius is 1.4 m + the pig radius. The mud level decreases at 0.45 per second. A fully muddy pig is clean in approximately 2.2 s.

When the mud level is less than 0.03, the pig goes into ZOOM. A clean pig that the user sprays also goes into ZOOM.

In ZOOM, the pig runs away from the center of the spray. It does not run away from the nozzle, because the queue of muddy pigs is between the spray and the nozzle. The direction has a small random change. ZOOM does not cause panic in other pigs.

When the hose stops, pigs in SHOWER wait for 2.5 s. Then they go into GRAZE.

### 9.4 Mud appearance

The renderer gives each pig instance three values: mud level, seed and scale. A shader changes the pig color to mud color in irregular areas.

The shader calculates these values for each pixel:

- n = 0.75 × noise(p) + 0.25 × noise(2.4 × p). The value p is the model-space position × 2.3 + the pig seed.
- h = world height / (1.5 × scale). This gives 0 at the feet and 1 at the top of the pig.
- s = 0.6 × n + 0.6 × (1 − h).
- t = 1.22 − 0.98 × mud level.
- mask = smoothstep(t, t + 0.07, s).

Mud thus starts on the legs and the lower body. It moves up as the mud level increases. At mud level 1, some pink areas stay on the top of the pig. Thus the user can always see that the animal is a pig. Lower areas get a darker mud color.

### 9.5 Water appearance

The water is a particle system with a maximum of 900 drops.

| Item | Value |
|---|---|
| New drops | 300 per second |
| Flight time | 0.48 to 0.58 s (ballistic) |
| Target area | Disc, radius 1.0 m around the target |
| Splash | 55 % of drops bounce up for 0.45 s |
| Drop size | 0.3 m, round soft texture |

A green hose pipe goes from the nozzle, down to the ground and away to the side. A blue ring on the ground shows the spray area.

---

## 10. User interface

### 10.1 Tools

| Tool | Key | One finger or left mouse button |
|---|---|---|
| Shoo | 1 | Drag. The dog goes to the finger. |
| Feed | 2 | Tap. A snack goes to that point. |
| Hose | 3 | Drag. Water sprays at the finger. |
| Grab | 4 | Touch a pig and drag it. Release to throw. |
| Look | 5 | Drag to turn and tilt the camera. |

### 10.2 Camera

| Input | Function |
|---|---|
| Two fingers, pinch | Zoom |
| Two fingers, twist | Turn |
| Two fingers, move | Pan |
| Right mouse button | Turn and tilt |
| Middle mouse button | Pan |
| Mouse wheel | Zoom |
| Minimap tap | Move the view to that point |

When a second finger touches the screen, the current tool action stops. The camera distance is from 6 m to 80 m. The camera pitch is from 0.28 rad to 1.48 rad.

On a portrait screen, the field of view is 64°. The long axis of the pens is vertical on the screen. On a landscape screen, the field of view is 48°.

### 10.3 Other controls

- Bell button (key B): fills all troughs. It also sets the hunger of all pigs to a minimum of 0.72. The herd runs to the troughs.
- Sound button: turns the sound on or off.
- Minimap: shows the pens, troughs and food levels, snacks, the dog and the pigs. A pig dot becomes brown when the pig is muddy. The minimap turns with the camera.
- Message area: shows a short instruction when the tool changes.

### 10.4 Pig selection

The Grab tool finds the nearest pig along the touch ray. The tolerance is 1.6 × the pig radius + 2 % of the distance. Thus the user can touch small or distant pigs easily.

---

## 11. Rendering

### 11.1 Baked assets

The `bake.mjs` tool reads the Kenney GLB files with `@gltf-transform`. It writes compact geometry with one color for each vertex. It reads the color from the Kenney color-map texture at the UV position. The material factors stay as sRGB values, because Kenney writes them in that form.

For the pig and the dog, the tool keeps each part separate (body, head, four legs). It also records a pet-space matrix for each part in each animation frame, at 30 frames per second.

### 11.2 Instanced meshes

Each pig part is one InstancedMesh with one instance for each pig. The farm draws 48 pigs with 6 draw calls. Fences, decor, trough food and snacks also use InstancedMesh.

### 11.3 Animation

| Condition | Animation | Play rate |
|---|---|---|
| Speed < 0.12 m/s | idle | 1.0 |
| Speed < 1.7 m/s | walk | speed / (0.85 × scale / 0.62), minimum 0.5 |
| Speed ≥ 1.7 m/s | run | speed / (2.6 × scale / 0.62) |
| EAT, GRAZE (stopped) | eat | 1.0 or 0.7 |
| SHOWER (in the spray) | dance | 1.4 |
| GRAB | dance | 2.2 |
| AIR | gesture-negative | 1.5 |
| REST | idle, body turned 1.45 rad onto one side | 0.4 |

The renderer interpolates between frames. It blends from the old animation to the new animation in 1/6 s.

In GRAB and AIR, the pig turns about the body center, not the feet. The pig uses the rotation of the physics body.

### 11.4 Lights

- Hemisphere light: sky #eef7ff, ground #b9a27c.
- Sun: one directional light with a shadow map of 2048 × 2048 (PCF soft). The shadow area covers the field.
- Fog: from 70 m to 170 m, in the sky color.

---

## 12. Sound

All sounds are synthesized with the Web Audio API. The page has no audio files. Sound starts after the first touch, because browsers block sound before a user action.

| Event | Sound |
|---|---|
| Pig calls | Sawtooth through two formant filters, pitch goes down |
| Frightened pig | Same, higher pitch |
| Clean pig in ZOOM | Same, highest pitch |
| Grabbed pig | Squeal |
| Dog starts | Two barks |
| Snack eaten | Short noise clicks |
| Hose | Filtered noise loop |
| Bell | Three sine tones, four strikes |

The model limits pig calls to one in each 250 ms (120 ms for ZOOM). The volume decreases with distance from the camera.

---

## 13. Build procedure

### 13.1 Prepare the environment

1. Install Node.js and Python 3.
2. Install the packages:

   ```
   npm i three@0.160.0 @dimforge/rapier3d-compat esbuild @gltf-transform/core @gltf-transform/extensions pngjs
   ```

3. Download the Kenney GLB files into `assets/`. Use the file names that `bake.mjs` lists.

### 13.2 Make the page

1. Bake the assets:

   ```
   node bake.mjs
   ```

2. Make sure that the tool writes `src/assets.json`.
3. Build the page:

   ```
   python3 build.py
   ```

4. Make sure that the tool writes `pig-pens.html`.

### 13.3 Change a parameter

1. Open `src/sim.js`.
2. Find the `P` object at the top of the file.
3. Change the value.
4. Do the headless tests (Section 14.1).
5. Build the page.

CAUTION: Do not change the grid cell size or the obstacle margin without a new test of all gates. A larger margin can close a gate in the flow field.

---

## 14. Test procedure

### 14.1 Headless tests

The tests import `src/sim.js` in Node.js. They do not render.

| Test file | What it checks |
|---|---|
| `test/headless.mjs` | 5 to 10 min of free herd behavior |
| `test/scenarios.mjs` | Dog sweep, snack toss, grab and throw, bell |
| `test/food.mjs` | Snack limit, eat time, snack time limit |
| `test/hose.mjs` | Mud gain, bath behavior, mud removal, ZOOM |
| `test/fieldsweep.mjs` | Time for a flow field at more than 1000 positions |

To do a test:

1. Go to the project directory.
2. Type `node test/<file>.mjs`.
3. Compare the result with Section 14.3.

### 14.2 Browser tests

The browser tests use Playwright with Chromium and the SwiftShader software renderer. The page gives a debug object, `window.piggies`. This object can pause the simulation, do steps and operate the tools.

| Test file | What it checks |
|---|---|
| `test/shot.mjs` | Screenshots at phone and desktop sizes |
| `test/interact.mjs` | Tool buttons, Shoo drag, Feed tap, Grab and throw |
| `test/interact2.mjs` | Hose drag, toolbar width on a 390 px screen |

NOTE: The software renderer gives approximately 4 frames per second. This value does not show the performance on a phone.

### 14.3 Results

| Check | Result |
|---|---|
| Pigs in a fence collider (10 min, 48 pigs) | 0 |
| Pigs outside the farm (respawns) | 0 |
| Area changes in 10 min | Approximately 1200 to 1400 |
| Hungry pigs at 10 min (hunger > 0.95) | 0 or 1 |
| Simulation time for one step (48 pigs) | Approximately 0.5 ms |
| Simulation time for one step (80 pigs) | Approximately 0.75 ms |
| Minimum distance between pig centers | 0.92 to 0.96 × (r₁ + r₂) |
| Dog sweep: pigs in FLEE | 8 |
| Dog sweep: pigs in FLEE 15 s after the dog stops | 0 |
| Snack toss: 5 snacks accepted of 10 | Pass |
| Snack toss: snacks eaten | 4 to 10 s after they land |
| Snack with no pigs near it | Disappears at approximately 22 s |
| Pig thrown over a fence | Lands in the next pen and stands up |
| Bell: pigs that eat at the same time | 31 to 36 of 48 |
| Muddy pigs after 4 min without the hose | 12 increases to 27 |
| Hose, 25 s on one pen | 13 pigs came, 9 to 12 became clean |
| Pigs in ZOOM that are clean | 100 % |
| Maximum speed in ZOOM | 3.6 m/s |
| Pigs that wait at the spray 4 s after the hose stops | 0 |
| Slowest flow-field calculation | 9.3 ms |

---

## 15. Defects found and corrections

| No. | Defect | Cause | Correction |
|---|---|---|---|
| 1 | Troughs were empty and 25 pigs were very hungry. | The farmer gave less food than the herd ate. | Trough capacity changed from 5 to 10. Refill interval changed from 20 s to 14 s. The interval now changes with the number of pigs. |
| 2 | Piglets did not eat. | The mother attraction was stronger than the route to the trough. | The mother attraction does not apply when a piglet goes to a trough. |
| 3 | Thrown pigs rolled for a long time. | A ball has no rolling resistance. | A ground friction model removes speed and spin when a thrown pig touches the ground. |
| 4 | Thrown pigs turned about their feet. | The render transform used the foot position as the pivot. | The pig now turns about the body center. |
| 5 | Kenney models had pale colors. | The bake tool changed the material factors from linear to sRGB a second time. | The bake tool keeps the factors as sRGB. |
| 6 | Pigs did not eat snacks near them. | One pig claimed each snack. Other pigs ignored it. | All pigs in reach now eat a snack together. A snack has a time limit. |
| 7 | The page stopped at some snack positions. | Dijkstra stored distances as 32-bit floats and compared them with 64-bit values. The round-off error added the same cell to the queue again and again. | The calculation now rounds each new distance to 32 bits before the comparison (`Math.fround`). |
| 8 | Clean pigs did not run away quickly. | They ran toward the nozzle, through the queue of muddy pigs. | Clean pigs now run away from the center of the spray. |

---

## 16. Known limits

- The dog does not collide with fences. It jumps over them in the render only.
- The hose pipe goes through fences.
- Open gate leaves have no collider. A pig can touch a gate leaf without contact.
- The dog does not get muddy.
- The pigs flee only from the dog, a grabbed pig and a thrown pig.
- The model selects each piglet's mother at random at start. A piglet can start far from its mother.
- When the frame rate is less than 15 frames per second, the simulation is slower than real time.
- We did not measure the frame rate on a real phone.

---

## 17. Asset credits

All 3D models are from Kenney (www.kenney.nl) and have the CC0 license. The packs are Cube Pets, Nature Kit, Food Kit, Graveyard Kit and Car Kit. The troughs, gate posts, hose nozzle and hose pipe are simple shapes made in code.
