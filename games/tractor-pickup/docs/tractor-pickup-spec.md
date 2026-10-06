# Tractor Pickup: Design Specification

Version: 1.6 (after review 2: model fixes, stop in the barn, running sum, farmyard wash)
Date: 6 October 2026
Published path: `/exp/tractor-pickup/`
Language standard: ASD-STE100 Simplified Technical English (STE). Section 2 gives the technical names (TN) and technical verbs (TV).
Status of items: Each design item has an ID (for example, **[C-1]**). All items in this document are accepted for the first version.

---

## 1. Introduction

### 1.1 Purpose

This document gives the design for Tractor Pickup. Tractor Pickup is a 3D browser game for a child of approximately 4 years.

### 1.2 Initial brief

- The player drives a tractor on a gravel track.
- The game makes a new track at random for each round.
- The player uses one thumb stick, the W/A/S/D keys or the left stick of a gamepad.
- When the tractor hits a farm animal, the animal flies up into the air and lands in the trailer.
- The tractor tows the trailer and the animals.
- When the trailer has enough animals, the round ends.

### 1.2.1 Change in version 1.1

The farm has a large open farmyard at the center, with the barn. Two roads (routes) go out from the farmyard, turn through the fields and come back to the farmyard. The player drives a route, boops animals and comes back. When the tractor drives into the barn, it stops, the animals hop out and the game shows them, counts them and says their names. The farmyard is also an open area to drive, slide and push obstacles, with a drive-through wash.

### 1.2.2 Change in version 1.2 (after playtest 2)

Everything is larger. Routes are 14 m wide and have rock edges, so the tractor cannot leave them. The farmyard is larger. The paddock is removed: after the show, the animals walk into the barn and do not come back. The barn has a better model.

### 1.2.3 Change in version 1.3 (after playtest 2b)

The ground is in large high and low areas. Where the ground next to a route is high, the route goes through a cutting with a rock bank. Where the ground is low, a fence keeps the tractor on the route. The farmyard and the area around it are low. The stage is removed: the animals stand on the ground for the show.

### 1.2.4 Change in version 1.4 (release 1.0.0)

Section 13 now holds the test results, not open questions. The game has PWA icons, a share image and a `?fps` meter. No design item changed.

### 1.2.5 Change in version 1.5 (after review 1)

- The game does not slow down when an animal flies (B-7 is removed).
- The start screen shows only when the player has a paint to choose (F-11). The sticker card has one "go" button. "New farm" is only in the parent menu.
- Paint: each unlocked paint can go on the body or on the trim of the tractor (W-3).
- When the trailer and the wagon are full, animals hop out of the way of the tractor and the trailers (B-14).
- The sparkle path goes along the barn axis into the opening, and a sparkle frame shows the full door opening (F-2).
- The show counts each animal type as a group, then adds the groups together (F-6, F-7). The animals stand in rows with no overlap (F-12).
- New looks: the duck is a mallard, the chicken is white, the sheep has round black ears (5.1).
- The farmyard has no fixed posts (T-31). It has more trees and bushes, and the trees are larger. Trees and bushes also stand along the routes. All of them burst (T-34, T-35).
- All 3D models are GLB files in one folder, so a person can edit them by hand (X-8).

### 1.2.6 Change in version 1.6 (after review 2)

- The show starts when the tractor is 3/4 of the way through the barn, at any speed. The tractor and the wagons stop in the barn by themselves (F-1, F-5).
- The sum is a running sum from zero, one group at a time and slowly: "0 + 3 = 3", then "3 + 2 = 5" (F-7). After each stage, that group's animals move into a tally circle at the left, and the count above the circle goes up (F-14). A skip button ends the show (F-13).
- The sticker card says "New sticker!" (and the voice says "You got a sticker!"), and the sticker book button shows how many stickers are in the book (F-3).
- Paint: the body paint goes on the cab and the hood; the trim paint goes on the fenders and the roof. The windows and the wheels are never painted (W-3).
- Each animal model has a hat node; the hat moves with the head (W-4). The sheep has a short dark muzzle. The cow has spots on both sides, the back and the top (5.1).
- The open barn door leaves no longer flicker (T-28). The farmyard has a drive-through wash (T-36).

### 1.3 Design rules for a 4-year-old player

These rules apply to all items in this document. If an item does not obey a rule, change the item.

| ID | Rule |
|---|---|
| R-1 | The player cannot fail. No item can stop a trip. |
| R-2 | The player does not need to read to play. Use pictures, sounds and a voice. The only text in the game is animal names and the show's numbers, as a reading aid, and "New sticker!" on the sticker card. The voice always says each word that shows (W-5). |
| R-3 | Each action must give a large and fast response: a sound, a movement and a visual effect. |
| R-4 | The game must not remove a thing that the player got. An animal in the trailer stays in the trailer. |
| R-5 | A trip must be short: approximately 1 to 4 minutes. The player decides when to go back to the barn. |
| R-6 | The player must not need a precise movement. The game helps the player aim. |
| R-7 | Use only one control: the stick. Other buttons are optional. |
| R-8 | No sound or image must frighten the child. No crash damage, no injured animals, no loud alarm. |

### 1.4 Reuse from Pig Pens

| Item | Source | Use |
|---|---|---|
| Tractor vehicle controller | `games/pig-pens/src/tractor.js` | Start point for the drive model. See [D-1]. |
| Thumb stick | `games/pig-pens/src/main.js` | Start point for the touch control. |
| Asset bake and single-file build | `games/pig-pens/bake.mjs`, `build.py` | Same build pipeline. Output to `site/exp/tractor-pickup/`. |
| PWA files | `games/pig-pens/pwa/` | Same install and offline behavior. |
| Kenney Cube Pets animals | Pig Pens bake (`bakePet`) | Pig, chick and dog are in Pig Pens. Add cow and bunny from the same pack. See section 5. |

---

## 2. Terms

| Term | Type | Definition |
|---|---|---|
| Farmyard | TN | The large open gravel area at the center of the farm. The barn is in it. |
| Route | TN | A road that goes out of the farmyard at one gate and comes back at a different gate. It has a rock edge on each side. |
| Edge | TN | The barrier along each side of a route: a rock bank where the ground is high, a fence where the ground is low. The tractor cannot pass it. |
| High ground / low ground | TN | The two terrain levels of the farm. High ground is 4 m above low ground. |
| Shoulder | TN | The grass strip between the road and the edge. |
| Gate | TN | One of the four openings in the farmyard fence, at the middle of each side. |
| Road | TN | All route tiles together. |
| Tile | TN | One 20 m × 20 m square of the farm. |
| Field | TN | The grass and forest area outside the edges. The tractor cannot go there. |
| Obstacle | TN | A hay bale, cone, barrel, tree or bush in the farmyard. |
| Paint | TN | A color that the player can put on the body or on the trim of the tractor. |
| Paint pot | TN | The picture of a paint on the paint screen. |
| Trip | TN | One drive from the barn, out on the routes and back into the barn. |
| Show | TN | The sequence after a trip. The animals hop out, the game counts them and says their names. |
| Line-up | TN | The area of ground next to the barn exit where the animals stand during the show. |
| Trailer | TN | The cart that the tractor tows. Animals ride in it. |
| Wagon | TN | One more trailer that the game attaches behind the last trailer. |
| Barn | TN | The drive-through building at the center of the farmyard. The player drives into it to deliver the animals; the tractor stops inside. |
| Wash | TN | The drive-through wash in the farmyard. Driving through it cleans the tractor, the trailers and the animals in them. |
| Boop | TV | Hit an animal with the tractor so that it flies. |
| Launch | TN | The flight of an animal from the tractor to the trailer. |
| Catch zone | TN | The area in front of the tractor where a boop occurs. It is larger than the tractor. |
| Slot | TN | One position for one animal in the trailer. |
| Slot bar | TN | The row of 12 slot pictures at the top of the screen. |
| Golden animal | TN | A rare animal that shines. It gives a larger celebration. |
| Sticker | TN | A reward picture that the player gets after each show. |
| Sticker book | TN | The screen that shows all stickers. |
| Parent menu | TN | The settings screen. A long press opens it. |

---

## 3. Trip flow

### 3.1 Sequence

1. The game makes a new farm. See section 4.
2. The tractor starts in the farmyard, at the barn exit, with an empty trailer and wagon. If the player has a paint to choose, the start screen shows first (F-11). The voice says "Let's find animals!" after the first touch or key press.
3. The player drives out on a route and boops animals. Each boop fills one slot.
4. The player comes back to the farmyard and drives into the barn, from either end. When the tractor is 3/4 of the way through the barn (at any speed) and at least one animal rides in the trailer or the wagon, the show starts (3.4). If no animal rides, nothing occurs and the tractor drives on. **[F-1]**
5. When all 12 slots are full, the voice says "Great job! Go to the barn!". An arrow and a path of sparkles show the way to the barn. The path goes to a point on the barn axis outside the nearer opening, then straight along the axis into the barn. At the opening, a sparkle frame shows the full width and height of the door opening. The arrow points to the center of that opening. **[F-2]**
6. After the show, the delivered animals walk into the barn and do not come back. The player gets a sticker (W-1). The sticker card shows "New sticker!" above the sticker, which stamps on with a small bounce; the voice says "You did it! You got a sticker!". The sticker book button shows the number of stickers in the book. **[F-3]**
7. The player drives again with an empty trailer and wagon, on the same farm. **[F-9]** The sticker card has one large green "go" button (a play triangle). Only the parent menu makes a new farm (P-8).

| ID | Item | Description |
|---|---|---|
| F-11 | Start screen | The start screen is the paint screen (W-3) with a "go" button. It shows only when the player has more paints than the two start paints. If not, the game starts to drive at once. The first touch or key press unlocks the sound and starts the trip (the voice says "Let's find animals!"). |

### 3.2 Animals and slots

| ID | Item | Value |
|---|---|---|
| G-1 | Slots | 12: 6 in the trailer, then 6 in the wagon |
| G-2 | Trip size | 1 to 12 animals. There is no fixed goal. |
| G-3 | Free animals | 18 on the routes and 3 in the farmyard. After each show, new animals walk in along the routes to replace the delivered animals. |

### 3.3 Help to find animals

**[F-4]** If the player does not boop an animal for 20 s, the nearest free animal walks to the road ahead of the tractor. It waves and makes its sound. An arrow at the edge of the screen points to it.

### 3.4 Show

The show starts when the tractor is 3/4 of the way through the barn with at least one animal. It helps the child count and read.

| ID | Item | Description |
|---|---|---|
| F-5 | Stop | The tractor and the wagons stop in the barn by themselves, in about half a second, at any speed. The controls do nothing until the show ends. If an animal is still in flight, it lands first. The camera moves to a position at the side of the line-up area. |
| F-6 | Count each group | The show counts one animal type at a time, in the order of the first landing of each type. The animals of that type hop out of the trailer and the wagon one at a time and stand in their group's place in the line-up area (F-12). When an animal lands, a large number shows above it: the count in its group (1, 2, 3 ...). The voice says the number. After the last animal of the group, the numbers go away and the group label shows below the group: the number and the name ("3 Pigs"). The voice says it ("Three pigs!"). Plural names: Pigs, Cows, Chickens, Sheep, Ducks, Bunnies, Dogs, Chicks. One animal uses the singular name ("1 Cow"). A golden animal counts in the group of its type. Its label shows "Golden" above the number while it is counted. |
| F-7 | Add together | After the last group, a running sum shows at the top of the screen, one stage per group, from zero: "0 + 3 = 3", then "3 + 2 = 5", then "5 + 1 = 6", and so on. The terms light up one at a time from left to right while the voice says them ("Zero plus three makes three! Three plus two makes five!"), with a 0.45 s pause after each term and 1.2 s between stages. The tally count (F-14) glows with the first term and the group label with the second. After each stage, that group moves into the tally circle (F-14) and its label fades. Then all animals jump together. The voice says "Six animals! Hooray!". Confetti. If there is only one group, there is no sum: the total shows alone. |
| F-8 | Speed | Each step waits 0.8 s. A tap on the screen goes to the next step immediately, so a parent can make it faster. |
| F-14 | Tally circle | With two or more groups, a circle on the ground at the left of the blocks (screen left): a pale disc with a yellow rim, sized so that every animal of the show fits with no overlap. Above it, a large number: the animals in the circle, starting at 0. After each stage of the sum (F-7), the animals of that group move into the circle one after another (0.25 s apart, a short hop each), and the number goes up by one as each lands. The circle fills from the middle out, so the groups stand together. The camera moves back so that the circle and all blocks are in view. The farmyard keeps the ground for the circle clear of obstacles (T-29). |
| F-13 | Skip | A skip button (a fast-forward picture) at the top right, under the parent gear, ends the whole show at once. The sticker card comes next. |
| F-10 | Into the barn | After the show, the animals walk, one after the other, into the barn. They do not come back. The camera goes back to the chase camera. |
| F-12 | Line-up layout | Each group has its own block in the line-up area. A block has rows of up to 4 animals. Animals in a row stand side by side with a gap of 0.4 m. Rows in a block are 0.6 m apart (from body edge to body edge). The first row is nearest to the barn axis, and later rows are nearer to the camera. The blocks stand side by side with a 1.5 m gap. If the blocks are wider than the line-up area, a block has fewer animals in a row, then the blocks go on a second line of blocks. No two animals overlap. The camera moves back so that all blocks are in view. |

---

## 4. Farm, farmyard and routes

### 4.1 Layout

The game makes the farm at run time from a set of predefined tiles. Each route starts and ends at the farmyard, so the player never comes to a dead end.

| ID | Item | Value |
|---|---|---|
| T-1 | Grid | Square tiles, 36 m × 36 m. The farm is a grid of 11 × 11 tiles (396 m × 396 m). The outer ring of tiles has no road. |
| T-2 | Road width | 14 m (approximately 6 tractor widths). A 1.5 m grass shoulder on each side, then the edge (T-17). |
| T-3 | Farmyard | The 3 × 3 tiles at the grid center (108 m × 108 m). Four gates, one at the middle of each side. Each gate is 17 m wide. |
| T-4 | Seed | Each new farm uses a new random seed. The parent menu shows the seed and can set it. The same seed always makes the same farm. |
| T-5 | Curves | A curve tile turns the road 90°. The curve radius is 18 m. |
| T-24 | Routes | Two routes. Each route goes out at one gate and comes back at the next gate around the farmyard (for example, north gate to east gate). The two routes use opposite corners of the farm, so they never meet. Each route is 8 to 14 tiles long. |
| T-25 | Twists | Each route has at least 4 curves. No more than 2 curves are next to each other. |

### 4.2 Tile set

Road tiles have connection points at the center of a tile edge. The road surface is gravel. The game makes the road meshes in code. Kenney Nature Kit models give the scenery.

| ID | Tile | Connections | Contents |
|---|---|---|---|
| T-6 | Straight | Two opposite edges | Gravel road |
| T-7 | Curve | Two adjacent edges | Gravel road with a 90° turn |
| T-8 | Gate | Two opposite edges | The first or last tile of a route, next to the farmyard. Straight road with two wood gate posts at the farmyard side. |
| T-9 | Mud | Two opposite edges | Straight road with a large mud area. See 4.4. |
| T-10 | Ramp | Two opposite edges | Straight road with a ramp. See 4.4. |
| T-11 | Sprinkler | Two opposite edges | Straight road with a sprinkler arch. See 4.4. |
| T-12 | Field | None | Forest, crops and grass outside the edges. Decoration only. |
| T-26 | Farmyard | Gates | Open packed gravel with the barn, the line-up area, the pond and obstacles. See 4.7. |

### 4.3 Generation steps

1. Mark the 3 × 3 farmyard tiles at the grid center.
2. Choose the gate pairs at random: (north, east) and (south, west), or (north, west) and (south, east).
3. For each route, find a path of tiles from the tile outside its first gate to the tile outside its second gate. Use a random depth-first search. Use only the tiles in the corner of the farm between the two gates. Obey T-24 and T-25.
4. Give each road tile its type: straight or curve, from the directions of the road into and out of the tile. The first and last tiles are gate tiles.
5. Change straight tiles to feature tiles (T-9 to T-11). Obey the rules in 4.5.
6. Put the barn, the line-up area, the pond and the obstacles in the farmyard (4.7).
7. Fill all other tiles with field tiles (T-12). Put more animals on the field tiles next to the road.
8. Make the high and low ground. Put the edges along both sides of each route (T-17), and a fence around the farmyard. The farmyard fence has an opening at each gate.

### 4.4 Track features

| ID | Feature | Description |
|---|---|---|
| T-13 | Mud | The mud decreases the maximum speed by 50 % and decreases grip. The wheels throw brown splashes. A "squelch" sound. The tractor gets very dirty fast (T-16). |
| T-14 | Ramp | A gravel kicker across the full road width: 5 m up to 0.6 m, a 1 m flat top, 3 m down. The tractor jumps approximately 4 m. Driven in the other direction, it is a bump. The trailer and the wagon follow over the ramp. The animals bounce up and land in their slots again (B-11). A "whee" sound and a cheer from the animals. |
| T-15 | Sprinkler | A sprinkler arch over the road. Water sprays when the tractor comes near. The tractor drives through the spray and becomes clean in 1.5 s. Sparkles and a "squeaky clean" sound. |
| T-16 | Dirt | The tractor, the trailer, the wagon and each animal have a dirt level from 0 (clean) to 1 (very dirty). The level increases slowly on gravel and grass, and fast in mud. Brown spots and dust show on the tractor body, the wheels, the trailers and the animals. Animals in the trailers get dirt from the mud splashes. More dirt gives more spots. Only the sprinkler (T-15) and the farmyard wash (T-36) remove the dirt. They wash the tractor, the trailers and all animals in them. |
| T-17 | Edges | The farm has large areas of high ground (4 m) and low ground (0 m), with smooth slopes between them (approximately 20 m wide). The farmyard and the ground within 20 m of it are low. The road is always at 0 m. Where the ground beside a route is high, the route goes through a cutting: a steep rocky bank (approximately 50°) up to the high ground, with rocks along the top. Where the ground is low, a wood fence 1.2 m high stands at the outer side of the shoulder. Where the ground changes, the fence and the bank overlap by at least 6 m, so there is no gap and no bank stops suddenly. The tractor cannot pass an edge. The route and the farmyard are one closed area. The shoulder is grass: it decreases the maximum speed by 30 % and decreases grip. |

### 4.5 Placement rules

| ID | Rule |
|---|---|
| T-18 | Each farm has 1 or 2 mud tiles, 1 or 2 ramp tiles and 1 sprinkler tile. Each route has at least one feature tile. |
| T-19 | A ramp tile must have a straight tile before it and after it, so the player can aim and land. |
| T-20 | The sprinkler tile is on the same route as a mud tile, with 1 to 4 tiles between them. |
| T-21 | Two feature tiles must not be next to each other. |
| T-22 | A gate tile must not be a feature tile. |
| T-23 | If a farm cannot obey all rules, try again from step 2 with the next random numbers. |

### 4.6 Scenery

Outside the edges: dense forest, crops and fields, on the high and the low ground. This scenery is decoration only; the tractor cannot reach it. Scenery must not block the view of an animal from the chase camera. Put tall items (trees) on the outer side of curves, not the inner side. Forest trees are 1.6 to 3.4 times the model size (larger than in version 1.4).

### 4.7 Farmyard

| ID | Item | Description |
|---|---|---|
| T-27 | Surface | Packed gravel. Grip and speed are the same as on the road. |
| T-28 | Barn | A drive-through barn at the farmyard center, 12 m long and 10 m wide inside. It is open at both ends. Its axis points to two opposite gates. The player can drive through it in either direction. Look: a classic red barn with a gambrel roof, white trim, X-braced doors that stand open at both ends, a hay-loft door and a small cupola. The roof fades out when the tractor comes near, so the player can see inside. No two faces of the barn share a plane (they flicker): each door leaf stops 5 cm inside its frame on all four edges. |
| T-29 | Line-up and pond | The line-up is an area of farmyard ground 16 m long and 7 m deep, 8 m past one barn exit, at the side of the drive line. It has no platform. Past the line-up's end on the show's screen-left, the ground for the tally circle (F-14) is also kept clear of obstacles: 11 m along and about 10 m deep. The duck pond is in a corner of the farmyard. |
| T-30 | Lanes | Keep a 10 m wide lane clear of obstacles from each gate to the nearest barn end. |
| T-31 | Obstacles | 8 round hay bales (they roll when the tractor pushes them), 16 cones and 8 barrels (they tip over and slide), 18 trees and 16 bushes (T-34). There are no fixed posts. Put them at random outside the lanes. |
| T-32 | Reset | When a show starts, all moved obstacles go back to their start positions with a small "poof". |
| T-34 | Breakable trees and bushes | The farmyard has 18 trees: 10 large single trees and young trees in small groups. Trees are 2.6 times the oak model size (young trees 1.6 times). When the tractor hits a tree at 4 m/s or faster, the tree bursts into pieces: wood chunks and leaf cubes fly up, bounce and stay on the ground for a few seconds, then fade. A happy "crunch-pop" sound plays. A stump stays. The tractor loses only a little speed. Below 4 m/s the tree is solid: it wobbles and the tractor bumps it. The parent menu and the tune panel can change the break speed. Bushes are never solid: when the tractor touches a bush at any speed above 0.5 m/s, it bursts into leaf cubes with a softer "pop" and the tractor does not slow down. A broken bush leaves nothing. The trailer and the wagon go through trees and bushes; only the tractor hits them. At the reset (T-32), broken trees and bushes grow back with a short grow animation. |
| T-36 | Farmyard wash | A drive-through wash beside the barn, on the side away from the line-up, parallel to the barn: a concrete pad, four blue corner posts, a blue canopy with red and white stripes, and a tall striped brush at each side. The opening is 9 m wide and 7 m long. Water falls from the canopy when the tractor comes near, and the brushes spin. Driving through cleans the tractor, the wagons and the riders 3 times as fast as the sprinkler (T-15), so any pass comes out clean. The posts and the brushes are solid. The canopy fades while the tractor is under it, like the barn roof. Obstacles stay out of the wash and 4 m past each end. |
| T-35 | Roadside trees and bushes | Breakable trees and bushes (T-34) also stand on the route shoulders, outside the road surface. On average each route tile has 1 tree and 2 bushes. Trees stand only on straight and gate tiles, or on the outer side of a curve (4.6). There are no trees or bushes on feature tiles (T-9 to T-11) or within 6 m of a hiding bush (A-13). |

---

## 5. Animals

### 5.1 Types

Use Kenney Cube Pets models for the pig, cow, bunny and dog. The cow gets more spots: on its right side, its back and its top (the Kenney cow has spots on its left side only). The pack has no sheep, no duck and no adult chicken. Make them from the pig and the chick models (X-8). Each keeps the body parts and the animations of its source model. Each type has a sound and a launch style.

| Animal | Source | Look |
|---|---|---|
| Sheep | Pig | Cream wool body and a wool tuft on the head. A dark grey face with a short, dark muzzle (the pig snout, shorter and dark). Round black ears that stand out at the sides of the head. Dark legs. |
| Duck | Chick | A mallard drake: a glossy green head, a thin white neck ring, a chestnut-brown chest, a grey body and grey-brown wings. A wide, flat yellow bill. Orange feet. A flatter scale. |
| Chicken | Chick | White feathers, a red comb on the head, an orange beak and orange feet. |
| Chick | Chick | The Kenney yellow chick, smaller (A-12). |

| ID | Animal | Sound | Launch style | Status |
|---|---|---|---|---|
| A-1 | Pig | "Oink" | A full somersault on the path | Accepted |
| A-2 | Cow | "Moo" | Slow and heavy on the path. The trailer bounces when it lands. | Accepted |
| A-3 | Chicken | "Bawk" | It flaps its wings on the path and floats down into the slot. | Accepted |
| A-4 | Sheep | "Baa" | A soft spin on the path | Accepted |
| A-5 | Duck | "Quack" | Water drops fall from it if it comes from the pond. Ducks live at the pond in the farmyard. | Accepted |
| A-6 | Bunny | Small "boing" | Its ears spin like a propeller on the path. | Accepted |
| A-7 | Dog | "Woof" | It jumps on the path by itself when the tractor comes near. It does not need a boop. | Accepted |
| A-8 | Golden animal | Bells | One of the types above, but gold. A rainbow trail on the path. A large celebration. The name shows as "Golden Pig" (for example). One or zero on the farm at a time. | Accepted |

### 5.2 Behavior on the farm

| ID | Item | Description | Status |
|---|---|---|---|
| A-9 | Mosey | Animals walk slowly along the road and across it, between the edges. They stop, eat grass, look around and walk again. Each animal type has a different walk speed. | Accepted |
| A-10 | Gentle run | Some animals run away slowly when the tractor comes near. The tractor is always faster. | Accepted |
| A-11 | Come here | Some animals walk to the tractor when the player uses the horn. | Accepted |
| A-12 | Groups | Chicks walk in a line behind a hen. The name of a chick is "Chick". One boop launches all of them, one after the other. | Accepted |
| A-13 | Hide | An animal hides in a bush on the shoulder, against the edge. Its tail shows. A boop on the bush finds it. | Accepted |
| A-14 | Mud bath | Pigs walk to a mud tile and roll in the mud. They get very dirty (T-16). | Accepted |
| A-15 | Farmyard animals | 3 animals walk in the farmyard between the obstacles. They stay out of the barn. They walk across the lanes, so the player meets them. | Accepted |
| A-16 | Into the barn | Delivered animals walk into the barn and are gone. | Accepted |

---

## 6. Boop and launch

### 6.1 Boop

| ID | Item | Value |
|---|---|---|
| B-1 | Catch zone | A box in front of the tractor, 1.5 × the tractor width |
| B-2 | Minimum speed | None. A very slow touch also boops the animal. |
| B-3 | Aim help | When an animal is in a 30° cone in front of the tractor and less than 6 m away, the steering turns a small amount to the animal. |
| B-4 | Response | A "boing" sound, the animal sound, a short camera shake and a ring of stars. |

### 6.2 Launch

| ID | Item | Value |
|---|---|---|
| B-5 | Path | A predefined animation path. It goes from the boop point, up and over the tractor cab, and down into the next empty slot. The path is in the local space of the tractor, so it moves with the tractor. The last part of the path bends to the slot position, so it follows the trailer or the wagon when it swings. The animal is kinematic during the flight. Physics does not control it. |
| B-6 | Duration | 1.0 s to 1.4 s, by animal type. Each type adds its own movement on the path (table 5.1). |
| B-7 | Slow motion | Removed in version 1.5. The game always runs at full speed, and a boop does not change the speed of the tractor. |
| B-8 | Landing | A "plop" sound. The slot picture at the top of the screen fills with the animal picture. |
| B-9 | Animal name | The name of the animal shows in large letters at the center top of the screen (for example, "Pig"). See W-5. The voice says the name. |

### 6.3 In the trailer

| ID | Item | Description | Status |
|---|---|---|---|
| B-10 | Ride | The animals sit in rows. They face forward. They move a little when the trailer turns. | Accepted |
| B-11 | Bounce | On a bump or a jump, the animals bounce up and come back to their slot. They never fall out (R-4). | Accepted |
| B-12 | Cheer | When the tractor goes fast, the animals put their front legs up and cheer. | Accepted |
| B-13 | Wagon | The tractor tows a trailer and a wagon from the start. Both are empty at the start. Each holds 6 animals in 2 rows of 3 slots. A spherical joint connects the trailer to the tractor, and a second spherical joint connects the wagon to the trailer. | Accepted |
| B-14 | Full: out of the way | When all 12 slots are full, there is no boop. An animal that comes near the front of the tractor, or the side of the trailer or the wagon, hops out of the way: a quick 0.5 s hop of approximately 3 m to the side away from the vehicle, with a small "boing". Then it looks at the tractor. The tractor does not slow down. | Accepted |

---

## 7. Tractor and controls

### 7.1 Drive model

Design goal: the tractor must feel like a small rally car. The physics must be better than the player expects. The suspension moves, the body rolls in turns, the rear slides on gravel, and gravel sprays from the wheels.

| ID | Item | Description |
|---|---|---|
| D-1 | Base | Start from the Rapier ray-cast vehicle controller in Pig Pens. Tune it for rally behavior (D-5 to D-9). |
| D-2 | No roll-over | Put the center of mass low. If the tractor tilts more than 35°, put it upright again with a soft movement. |
| D-3 | No damage | The tractor does not get damage. It bounces gently off trees and fences. |
| D-4 | Trailer hitch | The trailer is a dynamic body. A ball-and-socket joint (Rapier spherical joint) connects the trailer tongue to the tractor drawbar. The trailer pitches over bumps, rolls in turns and swings behind the tractor. |
| D-5 | Suspension | Long and soft travel. The body visibly pitches when the tractor starts and stops, and rolls in turns. |
| D-6 | Gravel grip | Lower side grip on the rear wheels than on the front wheels. The rear slides out in fast turns. On grass, grip is lower again. On the track edge, grip increases, so that the track "holds" the tractor. |
| D-7 | Slide help | Large slides are good. The player learns to control them. A stability force limits the slide angle to approximately 45° and turns the tractor back to the direction of travel, so the tractor does not spin a full turn. The Power setting (P-7) controls how strong the slides can become. |
| D-8 | Speed | Maximum speed approximately 9 m/s on gravel. Strong acceleration from a stop. |
| D-9 | Effects | Gravel spray from the rear wheels in a slide. Dust clouds. Tire marks on the gravel. A skid sound. |
| D-10 | Jackknife limit | The spherical joint has no angle limit in Rapier. Add a soft limit on each joint: when the angle between two connected bodies is more than 75°, apply a correction torque to the rear body. Test the chain on the ramp (T-14) and in mud (T-13). |
| D-11 | Trailer roll-over | If the trailer tilts more than 45°, put it upright again with a soft movement. |
| D-12 | Animals and trailer physics | The trailer physics moves the animals, but the animals do not use free physics. Each animal is attached to its slot with a spring. The trailer motion makes the animals sway and bounce. An animal never leaves its slot (R-4). |

### 7.2 Control

The tractor drives like a car. The chase camera (V-1) always stays behind the tractor, so "left" on the stick is always "left" on the screen. There is only one control mode.

| ID | Item | Description |
|---|---|---|
| C-1 | Throttle | Stick up drives forward. The stick distance sets the speed. |
| C-2 | Steering | Stick left and right turn the front wheels. A curve (power 1.4) gives fine control near the center. |
| C-7 | Stop | Release the stick. The tractor rolls to a stop. The parking brake holds it. |
| C-8 | Reverse | Stick down brakes. When the tractor is stopped, stick down drives backward slowly (maximum 3 m/s). |

### 7.3 Inputs

| ID | Input | Function |
|---|---|---|
| C-3 | Touch | A floating thumb stick. It appears where the thumb touches the left two-thirds of the screen. A large outer ring. |
| C-4 | Keyboard | W/S for throttle and reverse, A/D for steering. The arrow keys do the same. Keys ease in, so that a key press does not give a full turn immediately. |
| C-5 | Gamepad | The left stick. Button A is the horn. |
| C-6 | Horn | A large horn button at the bottom right. The gamepad A button and the H key also work. A "honk-honk" sound. All animals look at the tractor. Some animals come (A-11). |

### 7.4 Camera

| ID | Item | Description |
|---|---|---|
| V-1 | Type | A chase camera behind and above the tractor. Approximately 22° down, with the look point approximately 11 m ahead, so the player sees far ahead (changed after playtest 1). The trailer shows behind the tractor. |
| V-2 | Turns | The camera stays behind the tractor and turns with it, with a short lag. In a slide, the camera follows the direction of travel more than the tractor nose, so the view does not swing. In reverse, the camera stays behind the tractor. |
| V-3 | Launch | The camera does not follow the animal. The arc must stay in the view. |

---

## 8. Screen and sound

### 8.1 Screen items

| ID | Item | Position |
|---|---|---|
| U-1 | Slot bar | Top center. 12 slots: 6 for the trailer, a small gap, then 6 for the wagon. Each slot fills with the animal picture and name. The bar empties after the show. |
| U-2 | Horn | Bottom right |
| U-3 | Parent menu | Top right. A small gear. Press and hold for 2 s to open. A child cannot open it by accident. |
| U-4 | Text | Only animal names (W-5), the numbers and names in the show (section 3.4) and "New sticker!" on the sticker card (F-3). The voice says each of them (R-2). The parent menu can use text. |
| U-5 | Skip | During the show only: top right, under the gear. A fast-forward picture (F-13). |

### 8.2 Sounds

| ID | Sound | Description |
|---|---|---|
| S-1 | Engine | A "putt-putt" sound. The pitch increases with the speed. |
| S-2 | Gravel | A soft crunch on the track. A soft swish on the grass. |
| S-3 | Animals | One sound for each type (table 5.1). |
| S-4 | Voice | Recorded words in a parent's voice. See section 12. |
| S-5 | Music | A light loop. The parent menu can turn it off. |
| S-6 | Celebration | Music and a cheer at the barn. |

### 8.3 Reading aid

| ID | Item | Description |
|---|---|---|
| W-5 | Animal name | When an animal lands in the trailer, its name shows at the center top for 2.5 s. Use a large, clear, rounded font (for example, Andika or Atkinson Hyperlegible), with lowercase letters after a capital ("Pig", "Cow", "Chicken"). Each letter pops in from left to right while the voice says the word. Then the word moves into its slot in the slot bar. |
| W-6 | Tap to hear | A tap on a word (in the game or in the show) plays the voice again. |
| W-7 | Highlight | In the show, the letters of each name light up one at a time, from left to right, while the voice says the word. |

---

## 9. Rewards

All items in this section are accepted for the first version.

| ID | Item | Description |
|---|---|---|
| W-1 | Sticker | One sticker after each show. The sticker shows the golden animal (if found) or the animal type with the most boops. |
| W-2 | Sticker book | A screen with all stickers. Data stays in the browser storage. |
| W-3 | Paint | The tractor has two paint areas: the body (the cab, the hood and the frame) and the trim (the fenders and the roof). The windows, the wheels, the exhaust and the lamps are never painted. The start paints are red (on the body) and yellow (on the trim). After each 3 shows, the player gets a new paint, in this order: green, blue, pink, orange, purple, white, rainbow. Each paint can go on either area. Paint screen: at the left, a large 3D picture of the tractor in its current paints. At the right, two rows of paint pots, one row for each area. At the start of each row, a small tractor outline shows which area the row paints (that area is filled in). A tap on a pot paints that area at once (the picture and the tractor in the game change), with a "splat" sound. The pot in use has a gold ring. On the sticker card (F-3), the paint screen shows only after a new paint was unlocked: the new pot bounces and sparkles in both rows. The player's choice is kept in the browser storage. |
| W-4 | Hats | After 4, 8 and 12 shows, the player gets a new hat (straw, cowboy, party). The animals in the trailer wear hats. Each animal model has an empty node named `hat` on its head; the hat hangs on it, so it bobs with the head in every animation. |

---

## 10. Parent menu

| ID | Setting | Values | Default |
|---|---|---|---|
| P-3 | Voice | On, Off | On |
| P-4 | Music | On, Off | On |
| P-5 | Farm seed | A number | Random |
| P-8 | New farm | Button | — |
| P-6 | Clear stickers | Button with a confirmation | — |
| P-7 | Power | Low (6 m/s, small slides), Medium (9 m/s), High (12 m/s, large slides) | Medium |

---

## 11. Technical requirements

| ID | Item | Value |
|---|---|---|
| X-1 | Libraries | three.js and `@dimforge/rapier3d-compat`. Fixed physics step at 60 Hz with render interpolation. |
| X-2 | Assets | Kenney Cube Pets, Nature Kit and the Pig Pens tractor. Bake them into the single HTML file. |
| X-3 | Devices | The main device is an iPad in landscape. A desktop with a keyboard or a gamepad is for tests. Single player only. |
| X-4 | Frame rate | 60 frames per second on an iPad of 2020 or newer. |
| X-5 | Offline | The game operates offline after the first load (PWA). |
| X-6 | Source | `games/tractor-pickup/` |
| X-7 | Output | `site/exp/tractor-pickup/` |
| X-8 | Model files | Every 3D model is a GLB file in `games/tractor-pickup/assets/models/`: the Kenney models (with their colors moved into vertex colors), the sheep, the duck and the chicken, and the models that version 1.4 made in code (the trailer, the barn, the hats, the props, the stump, the sprinkler arch and the gate arch), and the farmyard wash (version 1.6). A person can edit these files by hand (for example in Blender: vertex paint for colors). The bake (`npm run bake`) reads only this folder and writes `src/assets.json`; the build embeds it. Model rules: colors are vertex colors (`COLOR_0`), or a base color texture. The tractor is split into the nodes `body`, `fenders`, `roof`, `glass` and `details`; the material names `paint-body` and `paint-trim` mark the two paint areas (W-3). Each animal has an empty `hat` node (W-4). The barn material names `planks` and `shingles` get the game's wood and roof textures. Node names are part names that the code uses; `assets/models/README.md` lists them. The script `models.mjs` made the first version of the files from the Kenney packs and does not overwrite a file that exists; it only adds a `hat` node to an animal file that has none. |
| X-9 | Ground and roads | The ground, the roads, the edges, the ramps, the fences along the routes and the pond are made in code from the farm layout. They are not model files. |

---

## 12. Voice recordings

### 12.1 Word list

A parent records these words. Each word is one file.

| Group | Files |
|---|---|
| Numbers | `zero` to `twelve` (`zero` starts the running sum, F-7) |
| Animals | `pig`, `cow`, `chicken`, `sheep`, `duck`, `bunny`, `dog`, `chick`, `golden` |
| Animal plurals | `pigs`, `cows`, `chickens`, `ducks`, `bunnies`, `dogs`, `chicks` (the plural of `sheep` is `sheep`) |
| Phrases | `lets-find` ("Let's find..."), `animals` ("...animals!"), `great-job` ("Great job!"), `go-to-barn` ("Go to the barn!"), `lets-count` ("Let's count!"), `hooray` ("Hooray!"), `you-did-it` ("You did it!"), `new-sticker` ("You got a sticker!"), `plus` ("plus"), `makes` ("makes") |

The game joins files to make sentences. For example: `lets-find` + `animals`, `three` + `pigs`, or `three` + `plus` + `two` + `makes` + `five`.

### 12.2 File format

| Item | Value |
|---|---|
| Folder | `games/tractor-pickup/audio/voice/` |
| Name | The file name in 12.1, plus `.mp3` (for example, `chicken.mp3`) |
| Format | MP3, mono, 64 kbit/s. Approximately 10 KB for each word. |
| Trim | The build removes silence at the start and the end, and sets the same loudness for all files. |
| Missing file | The game uses the browser speech function for that word. Thus, the game operates before all recordings are complete. |

---

## 13. Test results

State at version 1.6 (`npm test`: 485 tests, all pass). Version 1.5 had 475, release 1.0.0 had 464. "Desktop" means a manual check in desktop Chromium with Playwright (keyboard, mouse, screenshots). No iPad was available for these checks. Sound and touch were not tested on a device.

| Section | Automated tests (`games/tractor-pickup/test/`) | Checked in a desktop browser | Still needs an iPad check |
|---|---|---|---|
| 3.1 Trip flow, 3.3 Help | `trip.test.mjs`, `game.test.mjs` | Full trip with seeds 1 to 4: intro, boops, barn pass, help arrow after 20 s | Feel of the pace for a 4-year-old |
| 3.2 Animals and slots | `slots.test.mjs`, `game.test.mjs` | HUD slots fill in order | Slot icons are readable at arm length |
| 3.4 Show | `show.test.mjs`, `showSteps.test.mjs`, `trip.test.mjs` | Show with 3, 4, 7 and 12 animals, tap to skip | Timing of the count with the voice |
| 4.1 to 4.5 Layout, tiles, routes, rules | `track.test.mjs`, `road.test.mjs`, `terrain.test.mjs` | Routes on seeds 1 to 4 (screenshots in the SDD notes) | None known |
| 4.6 Scenery, 4.7 Farmyard | `yard.test.mjs`, `trees.test.mjs`, `terrain.test.mjs` (T-29 line-up) | Yard, barn, props, tree bursts | None known |
| 5.1 Animal types | `assets.test.mjs`, `herd.test.mjs` | Every type seen | None known |
| 5.2 Behavior (A-7 to A-16) | `herd.test.mjs`, `game.test.mjs` | Flee, horn, chick line, pig mud seen | Horn response feels right |
| 6.1 Boop, 6.2 Launch, 6.3 In the trailer | `launch.test.mjs`, `slowmo.test.mjs`, `game.test.mjs`, `slots.test.mjs` | Flights over the cab (`pwa/og-image.jpg`) | Slow motion (B-7) is pleasant, not confusing |
| 7.1 Drive model | `tractor.test.mjs`, `hitch.test.mjs`, `terrain.test.mjs`, `dirt.test.mjs`, `sandbox.test.mjs` | Keyboard driving on gravel, mud, banks and ramps | Slides and grip (D-6, D-7) on the touch stick |
| 7.2 Control, 7.3 Inputs | `input.test.mjs` (circle to square stick) | Keyboard and mouse. Gamepad not tested. | Touch stick, horn button, multi-touch, no page zoom |
| 7.4 Camera | None (visual) | Chase camera and the turn back after the show | Camera height and comfort |
| 8.1 Screen items | `trip.test.mjs`, `showSteps.test.mjs` | HUD and arrows in screenshots | Text size on the iPad, safe areas, landscape lock |
| 8.2 Sounds | `voice.test.mjs` (word list, fallback, backlog) | None: headless has no sound | All sounds, speech fallback, engine and skid levels |
| 8.3 Reading aid | `showSteps.test.mjs` (R-2 labels) | Letters glow in the show (screenshots) | Andika and Sniglet fonts load on the iPad |
| 9 Rewards | `progress.test.mjs` | Sticker and card after a show | Card buttons are easy to tap |
| 10 Parent menu | `progress.test.mjs` (settings limits) | Menu opens and saves | Opening it with the gesture the spec names |
| 11 X-1 Libraries, fixed step | `rng.test.mjs`, `game.test.mjs` | Runs in the browser | None |
| 11 X-2 Assets | `assets.test.mjs` | Build is 5.87 MB | None |
| 11 X-3 Devices | None | Desktop only | The whole game on an iPad in landscape |
| 11 X-4 Frame rate | None | `?fps` meter, desktop (see below) | **60 fps on a 2020 or newer iPad: not measured** |
| 11 X-5 Offline | None | Service worker installs, caches the page, icons and fonts. The page loads offline (Playwright offline mode). | Install to the Home Screen and play in airplane mode |
| 11 X-6, X-7 Source and output | None | `npm run build` writes `site/exp/tractor-pickup/` | None |
| 11 X-8 Model files | `assets.test.mjs` (every model, the part names the code uses, paint areas, barn UVs, the sheep, duck and chicken colors) | All files in `tools/models.html`; the game drawn from them | Hand edits in Blender round-trip through `npm run bake` |
| 1.5 F-6, F-7, F-12 Show by groups | `showSteps.test.mjs` (groups, sum words, no overlap, label room), `show.test.mjs` | Show with 9 animals in 7 groups: counts per group, labels clear, the sum lights up term by term | Pace of the sum with the voice |
| 1.5 F-11, W-3 Start skip and paint | `progress.test.mjs` (paint unlocks, start screen rule, 1.0 saves) | Start skipped with no new paint; paint screen and sticker card with a new paint; a pot tap repaints | Pot size for small fingers |
| 1.5 F-2 Sparkle path | None (visual) | Path along the barn axis into the opening, frame around the door | Readable at a distance |
| 1.5 B-14 Full: out of the way, B-7 removed | `game.test.mjs` | Animals hop aside when full | Feels fair, not like a miss |
| 1.5 T-34, T-35 Trees and bushes | `trees.test.mjs`, `track.test.mjs` | Yard and roadside trees and bushes; bushes pop | Gib count when many bushes pop on a route (frame rate) |
| 1.6 F-1, F-5 Stop in the barn | `road.test.mjs` (3/4 point, once per entry), `game.test.mjs` (medium and high power: the train stops inside the barn; an empty train drives on) | Full speed into the barn with 7 riders: stopped 4.1 m past the middle, show started | Feels like arriving, not like a crash |
| 1.6 F-7, F-13, F-14 Running sum, tally circle, skip | `showSteps.test.mjs` (stages from zero, circle packing with no overlap, 12 cows fit), `show.test.mjs` (words in order, takes over 3 s, the count goes 0 to 4, all animals end in the circle, skip ends the show), `track.test.mjs` (300 seeds: the circle's ground is in the yard and clear of obstacles and the pond) | 7 animals in 4 groups: "0 + 2 = 2" ... "6 + 1 = 7", each group moves into the circle at the left, count above it; skip button | Pace with recorded voice clips |
| 1.6 W-3, W-4, 5.1 Model fixes | `assets.test.mjs` (tractor parts and paint areas, hat node height in every walk frame, sheep muzzle) | Tractor red and yellow with clear glass and grey wheels; hats on riders; cow spots; stickers with snouts and legs | Hand edits of the split tractor in Blender |
| 1.6 T-36 Farmyard wash | `track.test.mjs` (300 seeds: in the yard, clear of lanes, line-up, pond and obstacles), `dirt.test.mjs` (cleans in one pass, posts are solid) | Drive through: spray, brushes spin, canopy fades, tractor clean | Frame rate with the extra water particles |
| 12 Voice | `voice.test.mjs` | Build prints the clip count (0 now) | Record the clips, check loudness |
| T-34 Breakable trees | `trees.test.mjs`, `game.test.mjs` | Burst, stump and regrow seen | Crunch-pop sound level |

Performance (X-4), desktop proxy: an RTX 5070 Ti is too fast to show an iPad limit, so the numbers are mainly the draw calls and triangles. Seed 1, start position, 1280 by 800:

| Change | GPU time per frame | Draw calls | Triangles |
|---|---|---|---|
| Before | 0.39 ms | 111 | 1.85 M |
| After: grass skips rock samples, ground in 6 by 6 chunks | 0.35 ms | 124 | 1.66 M |

At 2360 by 1640 the time went from 0.63 ms to 0.54 ms. The shadow pass is about 40 % of the triangles and of the GPU time. The shadow map and the shadow box were not reduced, because the desktop frame time gives no reason. They are the next step if the iPad drops below 55 fps: map 1024 and box 22 m.
