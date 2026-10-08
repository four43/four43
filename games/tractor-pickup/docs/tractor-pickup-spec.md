# Tractor Pickup: Design Specification

Version: 1.10 (after review 3)
Date: 7 October 2026
Published path: `/exp/tractor-pickup/`
Language standard: ASD-STE100 Simplified Technical English (STE). Section 2 gives the technical names (TN) and technical verbs (TV).
Status of items: Each design item has an ID (for example, **[C-1]**). All items in this document are accepted for the first version. Items marked **Phase 2** in section 14 are accepted but come after version 1.8.

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

### 1.2.7 Change in version 1.7

- While driving, two buttons stacked at the bottom left open the paint screen and the sticker book (U-6).
- Stickers are die-cut: a 3D picture of the animal in one of 6 poses, seen from one of 5 camera angles, with a clear background and a white sticker border (W-1).
- The sticker book has pages with a farm picture. The player drags stickers from a tray onto a page, and can move them again later (W-2).
- The paint screen has a row of the unlocked hats: each hat can be turned off or on (W-4).
- The parent gear is at the top left. Every close button is a red X at the top right (U-3, U-7).
- The horn button shows a classic bulb horn (U-2). Every hat sits on the top of the head, with no head poking through it (W-4).

### 1.2.9 Change in version 1.9 (multiplayer phase 1.5)

- All shared game state is replicated objects (14.4): animals, trees, players and trains. Each kind of object has a list of fields and one authority. The authority sends a keyframe (the full state) every 2 s and diffs (only the changed objects) between keyframes. A lost message does not cause an error, because the next diff or keyframe has the correct state.
- A claim (M-13) is a request to own an animal. The answer is the animal's replicated owner, not a different message. Thus no answer can be lost.
- Each device repairs its state from each keyframe (M-56 to M-58).
- The welcome no longer carries the animals and the trees: the first keyframe after the welcome carries them.
- A new animal takes the place (the id) of an animal that has been gone for 10 s or more (G-3), so a long game does not slow down. Each player and the solo game do this.

### 1.2.8 Change in version 1.8

- Multiplayer (section 14): two to four players drive on one farm, each on a different device, each with a tractor, a trailer and a wagon. Animals are shared: the first tractor that boops an animal gets it. Each player has a show and stickers on that device.
- The parent menu has a "Multiplayer" button at the top (P-10). Its panel has "Host" and "Join". A guest joins with the 5-character room code, a link or a QR code.
- The signaling server is a different project: Handshake (`https://handshake.four43.com`).

### 1.2.6 Change in version 1.6 (after review 2)

- The show starts when the tractor is 3/4 of the way through the barn, at any speed. The tractor and the wagons stop in the barn by themselves (F-1, F-5).
- The sum is a running sum from zero, one group at a time and slowly: "0 + 3 = 3", then "3 + 2 = 5" (F-7). After each stage, that group's animals move into a tally circle at the left, and the count above the circle goes up (F-14). A skip button ends the show (F-13).
- The sticker card says "New sticker!" (and the voice says "You got a sticker!"), and the sticker book button shows how many stickers are in the book (F-3).
- Paint: the body paint goes on the cab and the hood; the trim paint goes on the fenders and the roof. The windows and the wheels are never painted (W-3).
- Each animal model has a hat node; the hat moves with the head (W-4). The sheep has a short dark muzzle. The cow has spots on both sides, the back and the top (5.1).
- The open barn door leaves no longer flicker (T-28). The farmyard has a drive-through wash (T-36).

### 1.2.10 Change in version 1.10 (after review 3)

- Point to go (7.2): the stick points where the tractor must go on the screen, and the tractor turns and drives there by itself. The stick is read against the camera, so a stick held to one side drives the tractor round in a circle (C-2). The tractor slows while it turns (C-9) and can turn near a fence or a bush (C-10). The stick straight down still reverses (C-8), with more force, so it pushes jackknifed wagons back.
- Show: each animal that hops out gets a check mark in the slot bar (F-15). The show is approximately 35% faster (F-6, F-8, F-14). Numbers and group labels do not overlap on an iPad in landscape (F-12). A term of the sum is hidden until the voice says it (F-7).
- The gravel sound is 1/4 as loud (S-2). The horn is a loud bulb-horn "HONK-honk" (S-7).
- The game fills the whole screen when it is installed on a home screen (X-11), and it can be played on a phone in portrait (X-3, X-12).
- No stutters far from the farmyard (X-4): no shader program look-ups between draws, and `?fps` lists each long frame with what took the time.
- The sticker book button shows only the stickers earned since the book was last opened (F-3, W-2).

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
| Room, host, guest, room code | TN | See section 14.1 for the multiplayer terms. |

---

## 3. Trip flow

### 3.1 Sequence

1. The game makes a new farm. See section 4.
2. The tractor starts in the farmyard, at the barn exit, with an empty trailer and wagon. If the player has a paint to choose, the start screen shows first (F-11). The voice says "Let's find animals!" after the first touch or key press.
3. The player drives out on a route and boops animals. Each boop fills one slot.
4. The player comes back to the farmyard and drives into the barn, from either end. When the tractor is 3/4 of the way through the barn (at any speed) and at least one animal rides in the trailer or the wagon, the show starts (3.4). If no animal rides, nothing occurs and the tractor drives on. **[F-1]**
5. When all 12 slots are full, the voice says "Great job! Go to the barn!". An arrow and a path of sparkles show the way to the barn. The path goes to a point on the barn axis outside the nearer opening, then straight along the axis into the barn. At the opening, a sparkle frame shows the full width and height of the door opening. The arrow points to the center of that opening. **[F-2]**
6. After the show, the delivered animals walk into the barn and do not come back. The player gets a sticker (W-1). The sticker card shows "New sticker!" above the new die-cut sticker (W-1), which stamps on with a small bounce; the voice says "You did it! You got a sticker!". The sticker book button shows the number of new stickers: the stickers earned since the sticker book was last opened. With no new sticker, it shows no number. **[F-3]**
7. The player drives again with an empty trailer and wagon, on the same farm. **[F-9]** The sticker card has one large green "go" button (a play triangle). Only the parent menu makes a new farm (P-8).

| ID | Item | Description |
|---|---|---|
| F-11 | Start screen | The start screen is the paint screen (W-3) with a "go" button. It shows only when the player has more paints than the two start paints. If not, the game starts to drive at once. The first touch or key press unlocks the sound and starts the trip (the voice says "Let's find animals!"). |

### 3.2 Animals and slots

| ID | Item | Value |
|---|---|---|
| G-1 | Slots | 12: 6 in the trailer, then 6 in the wagon |
| G-2 | Trip size | 1 to 12 animals. There is no fixed goal. |
| G-3 | Free animals | 18 on the routes and 3 in the farmyard. After each show, new animals walk in along the routes to replace the delivered animals. A new animal takes the id of the animal that has been gone longest, if that animal has been gone for 10 s or more; otherwise it gets a new id. The new animal has a higher ownership number than the old one (M-26), so a late message about the old animal does not change the new one. |

### 3.3 Help to find animals

**[F-4]** If the player does not boop an animal for 20 s, the nearest free animal walks to the road ahead of the tractor. It waves and makes its sound. An arrow at the edge of the screen points to it.

### 3.4 Show

The show starts when the tractor is 3/4 of the way through the barn with at least one animal. It helps the child count and read.

| ID | Item | Description |
|---|---|---|
| F-5 | Stop | The tractor and the wagons stop in the barn by themselves, in about half a second, at any speed. The controls do nothing until the show ends. If an animal is still in flight, it lands first. The camera moves to a position at the side of the line-up area. |
| F-6 | Count each group | The show counts one animal type at a time, in the order of the first landing of each type. The animals of that type hop out of the trailer and the wagon one at a time (each hop 0.5 s) and stand in their group's place in the line-up area (F-12). When an animal lands, a large number shows above it: the count in its group (1, 2, 3 ...). The voice says the number. After the last animal of the group, the numbers go away and the group label shows below the group: the number and the name ("3 Pigs"). The voice says it ("Three pigs!"). Plural names: Pigs, Cows, Chickens, Sheep, Ducks, Bunnies, Dogs, Chicks. One animal uses the singular name ("1 Cow"). A golden animal counts in the group of its type. Its label shows "Golden" above the number while it is counted. |
| F-7 | Add together | After the last group, a running sum shows at the top of the screen, one stage per group, from zero: "0 + 3 = 3", then "3 + 2 = 5", then "5 + 1 = 6", and so on. Each term is hidden (not only pale) until the voice says it; then it lights up. The terms show one at a time from left to right while the voice says them, so the player cannot read the answer early ("Zero plus three makes three! Three plus two makes five!"), with a 0.45 s pause after each term and 1.2 s between stages. The tally count (F-14) glows with the first term and the group label with the second. After each stage, that group moves into the tally circle (F-14) and its label fades. Then all animals jump together. The voice says "Six animals! Hooray!". Confetti. If there is only one group, there is no sum: the total shows alone. |
| F-8 | Speed | Each step waits 0.35 s (0.8 s before version 1.10). A tap on the screen goes to the next step immediately, so a parent can make it faster. |
| F-14 | Tally circle | With two or more groups, a circle on the ground at the left of the blocks (screen left; on a phone in portrait, in front of the blocks at the bottom of the screen, F-12): a pale disc with a yellow rim, sized so that every animal of the show fits with no overlap. Above it, a large number: the animals in the circle, starting at 0. After each stage of the sum (F-7), the animals of that group move into the circle one after another (0.15 s apart, a short hop of 0.45 s each), and the number goes up by one as each lands. The circle fills from the middle out, so the groups stand together. The camera moves back so that the circle and all blocks are in view. The farmyard keeps the ground for the circle clear of obstacles (T-29). |
| F-13 | Skip | A skip button (a fast-forward picture) at the top right ends the whole show at once. The sticker card comes next. |
| F-10 | Into the barn | After the show, the animals walk, one after the other, into the barn. They do not come back. The camera goes back to the chase camera. |
| F-12 | Line-up layout | Each group has its own block in the line-up area. A block has rows of up to 4 animals. Animals in a row stand side by side with a gap of 0.4 m. Rows in a block are 0.6 m apart (from body edge to body edge). The first row is nearest to the barn axis, and later rows are nearer to the camera. The blocks stand side by side with a 1.5 m gap. If the blocks are wider than the line-up area, a block has fewer animals in a row, then the blocks go on a second line of blocks. No two animals overlap. The camera moves back so that all blocks are in view. No two numbers or labels overlap on the screen, on an iPad in landscape or on a phone in portrait: the show text scales with the scene (the size of a letter is never more than the room each letter has in its block, LINEUP.letter, at the show camera's distance; never less than half size), and lines of blocks are 4.8 m apart, so the counts above the animals of one line stay clear of the labels of the line in front. On a phone in portrait the line-up is 8 m long (more lines, so the camera is nearer) and the tally circle (F-14) stands in front of the blocks (at the bottom of the screen), 4.5 m from the last line. |
| F-15 | Mark off | When an animal hops out of the trailer or the wagon, its slot in the slot bar (U-1) gets a large green check mark and goes pale. |

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

Point to go (changed in version 1.10, after review 3). The stick points where the tractor must go, as seen on the screen: up is away from the camera, right is to the right of the screen. The tractor turns and drives to that direction by itself, like a tank in Halo. The player does not steer the wheels. There is only one control mode. All values below are in the `?tune` panel.

| ID | Item | Description |
|---|---|---|
| C-1 | Throttle | The stick distance sets the speed. |
| C-2 | Camera direction | The wanted heading is the camera heading plus the stick angle, read again at each step. The camera turns behind the tractor, so a stick held to one side keeps the tractor turning: held to the left, the tractor drives round in a circle, and the player learns to bring the stick back up. (A direction lock was tried and removed after review 3.) |
| C-9 | Turn speed | The tractor turns its nose to the wanted heading at its maximum steer. The speed is full when the heading error is less than 30°. Between 30° and 90°, the speed falls to a crawl (20% of the stick speed). The front wheels steer with a gain on the heading error, so the tractor does not swing past the wanted heading. |
| C-10 | Turn help | At low speed with a heading error of more than 30°, a yaw force helps the tractor turn almost in place, so that it can turn near a fence, a tree or a bush. |
| C-8 | Reverse | When the stick is within 35° of straight down, the tractor drives backward (maximum 3 m/s), with the same pushing force as Medium forward (version 1.10: enough to push jackknifed wagons back). The stick distance sets the speed. Down-left moves the rear of the tractor to the left of the screen, and down-right to the right. A stick that points behind but out of this cone (for example, down-left at 45° or more from straight down) turns the tractor around and drives forward. |
| C-7 | Stop | Release the stick. The tractor rolls to a stop. The parking brake holds it. |
| C-11 | Aim help | The aim help to animals (B-3) adds a small change to the wanted heading only when the heading error is less than 30°. |

### 7.3 Inputs

| ID | Input | Function |
|---|---|---|
| C-3 | Touch | A floating thumb stick. It appears where the thumb touches the left two-thirds of the screen. A large outer ring. |
| C-4 | Keyboard | W/A/S/D and the arrow keys are stick directions: W is up, D is right, W and D together are up-right. S alone reverses (C-8). |
| C-5 | Gamepad | The left stick. Button A is the horn. |
| C-6 | Horn | A large horn button at the bottom right. The gamepad A button and the H key also work. A loud bulb-horn "HONK-honk" sound (S-7). All animals look at the tractor. Some animals come (A-11). |

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
| U-1 | Slot bar | Top center. 12 slots: 6 for the trailer, a small gap, then 6 for the wagon. Each slot fills with the animal picture and name. In the show, each slot gets a check mark when its animal hops out (F-15). The bar empties after the show. On a phone in portrait the bar is two rows of 6 (trailer, then wagon) below the gear (X-12). |
| U-2 | Horn | Bottom right. A round button with a classic bulb horn: a red rubber squeeze bulb on a brass horn with a flared bell. |
| U-3 | Parent menu | Top left. A small gear. Press and hold for 2 s to open. A child cannot open it by accident. |
| U-4 | Text | Only animal names (W-5), the numbers and names in the show (section 3.4) and "New sticker!" on the sticker card (F-3). The voice says each of them (R-2). The parent menu can use text. |
| U-5 | Skip | During the show only: top right. A fast-forward picture (F-13). |
| U-7 | Close buttons | Every close button is a red X in the top right corner of what it closes: the paint screen and the sticker book (top right of the screen) the parent menu (top right of its panel) and the Multiplayer panel (top right of its panel, M-29). |
| U-6 | Drive buttons | While driving only (not during the start screen, the show or the sticker card): two round buttons stacked at the bottom left, clear of the slot bar (on a phone in portrait: smaller, at the top right, X-12). The sticker book button shows the number of new stickers (F-3). The upper button (a paint pot) opens the paint screen (W-3); the lower button (a book) opens the sticker book (W-2). A tap on a button never moves the stick. While either screen is open, the tractor is held (like the sticker card) and nothing is booped; a close button (a red X, top right) goes back to driving. |

### 8.2 Sounds

| ID | Sound | Description |
|---|---|---|
| S-1 | Engine | A "putt-putt" sound. The pitch increases with the speed. |
| S-2 | Gravel | A quiet crunch on the track. A quiet swish on the grass. The crunch and the gravel spray are 1/4 as loud as in version 1.9. |
| S-3 | Animals | One sound for each type (table 5.1). |
| S-4 | Voice | Recorded words in a parent's voice. See section 12. |
| S-5 | Music | A light loop. The parent menu can turn it off. |
| S-6 | Celebration | Music and a cheer at the barn. |
| S-7 | Horn | A bulb horn: two reedy notes, "HONK" (0.3 s) then "honk" (0.25 s), each with a small pitch drop, approximately 3 times louder than the horn of version 1.9. |

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
| W-1 | Sticker | One sticker after each show. The sticker shows the golden animal (if found) or the animal type with the most boops. A sticker is die-cut: a 3D picture of the animal (gold for a golden animal) with a clear background, a thick white border that follows the animal's outline, and a soft shadow, not a circle. Each sticker has a pose (standing, walking, running, dancing, eating or shaking its head: a frame of that animation) and a camera angle (one of 5: from the front left or right, three-quarter left or right, or a little from above). The pose and the angle come from the show number and the animal type, so each new sticker usually looks different, and a sticker always looks the same each time it is drawn. Stickers from version 1.6 and before get a pose and an angle the same way. |
| W-2 | Sticker book | The sticker book has pages. Each page is a farm picture (sky, hills, grass; the pictures take turns: day farm, pond, sunset). Opening the book sets all stickers as seen (F-3). Stickers that are not on a page wait in a tray along the bottom of the screen, newest first; a new sticker bounces once. The player drags a sticker from the tray onto the page, where it stays where it is dropped, slightly tilted. A sticker on the page can be dragged again to move it; it comes to the front. Dragging a sticker back onto the tray takes it off the page. Arrows at the left and right edges turn the pages; there is always one empty page after the last page that has a sticker. The page, the position (as a part of the page width and height, so it fits any screen) and the tilt of each sticker are kept in the browser storage. A close button (a red X, top right) closes the book. Dragging works with a finger or a mouse. |
| W-2 | Sticker book | A screen with all stickers. Data stays in the browser storage. |
| W-3 | Paint | The tractor has two paint areas: the body (the cab, the hood and the frame) and the trim (the fenders and the roof). The windows, the wheels, the exhaust and the lamps are never painted. The start paints are red (on the body) and yellow (on the trim). After each 3 shows, the player gets a new paint, in this order: green, blue, pink, orange, purple, white, rainbow. Each paint can go on either area. Paint screen: at the left, a large 3D picture of the tractor in its current paints. At the right, two rows of paint pots, one row for each area. At the start of each row, a small tractor outline shows which area the row paints (that area is filled in). A tap on a pot paints that area at once (the picture and the tractor in the game change), with a "splat" sound. The pot in use has a gold ring. On the sticker card (F-3), the paint screen shows only after a new paint was unlocked: the new pot bounces and sparkles in both rows. The player's choice is kept in the browser storage. |
| W-4 | Hats | After 4, 8 and 12 shows, the player gets a new hat (straw, cowboy, party). The animals in the trailer wear hats. Each animal model has an empty node named `hat` on its head; the hat hangs on it, so it bobs with the head in every animation. The node sits on the top of the head cube, so no head pokes through a hat and no hat floats above the head (within 5 cm), with every hat, in every frame of every animation. Ears, tufts, combs and wool can poke through a hat. `tools/hats.html` shows every hat on every animal, playing any animation, with see-through hats. Below the paint rows, the paint screen (W-3) has a row of the unlocked hats, starting with a small pig in a hat. A tap turns a hat off (pale and grey) or on (in color, with a gold ring), with a "plop"; the animals change their hats at once. The animals wear only the hats that are on, taking turns among them; with all hats off, no animal wears a hat. A newly unlocked hat starts on. The choice is kept in the browser storage. |

---

## 10. Parent menu

| ID | Setting | Values | Default |
|---|---|---|---|
| P-3 | Voice | On, Off | On |
| P-4 | Music | On, Off | On |
| P-5 | Farm seed | A number | Random |
| P-8 | New farm | Button | — |
| P-10 | Multiplayer | A button at the top of the parent menu. It opens the Multiplayer panel (M-29). | — |
| P-9 | Apply and close | An Apply button saves the settings and closes the menu. The red X at the top right of the panel (U-7) closes it without saving. | — |
| P-6 | Clear stickers | Button with a confirmation | — |
| P-7 | Power | Low (6 m/s, small slides), Medium (9 m/s), High (12 m/s, large slides) | Medium |

---

## 11. Technical requirements

| ID | Item | Value |
|---|---|---|
| X-1 | Libraries | three.js and `@dimforge/rapier3d-compat`. Fixed physics step at 60 Hz with render interpolation. |
| X-2 | Assets | Kenney Cube Pets, Nature Kit and the Pig Pens tractor. Bake them into the single HTML file. |
| X-3 | Devices | The main device is an iPad in landscape. A phone in portrait is also supported (X-12). A desktop with a keyboard or a gamepad is for tests. One player on each device; multiplayer connects 2 to 4 devices (section 14). |
| X-4 | Frame rate | 60 frames per second on an iPad of 2020 or newer, everywhere on the farm. No repeated stutters (frames longer than 50 ms) far from the farmyard. A material is never shared by instanced and plain meshes (or by meshes that do and do not receive shadows), and instanced shadow casters have their own depth material, so the renderer never looks a shader program up again between draws. With `?fps`, the corner readout lists the last long frames: the time, the frame length, the sim and render milliseconds, the distance from the barn and the events in that frame. |
| X-5 | Offline | The game operates offline after the first load (PWA). |
| X-6 | Source | `games/tractor-pickup/` |
| X-7 | Output | `site/exp/tractor-pickup/` |
| X-8 | Model files | Every 3D model is a GLB file in `games/tractor-pickup/assets/models/`: the Kenney models (with their colors moved into vertex colors), the sheep, the duck and the chicken, and the models that version 1.4 made in code (the trailer, the barn, the hats, the props, the stump, the sprinkler arch and the gate arch), and the farmyard wash (version 1.6). A person can edit these files by hand (for example in Blender: vertex paint for colors). The bake (`npm run bake`) reads only this folder and writes `src/assets.json`; the build embeds it. Model rules: colors are vertex colors (`COLOR_0`), or a base color texture. The tractor is split into the nodes `body`, `fenders`, `roof`, `glass` and `details`; the material names `paint-body` and `paint-trim` mark the two paint areas (W-3). Each animal has an empty `hat` node (W-4). The barn material names `planks` and `shingles` get the game's wood and roof textures. Node names are part names that the code uses; `assets/models/README.md` lists them. The script `models.mjs` made the first version of the files from the Kenney packs and does not overwrite a file that exists; it only adds a `hat` node to an animal file that has none. |
| X-11 | Screen fit | As in Pig Pens: the canvas and the screen items fill the whole screen in the browser and when installed on a home screen (iOS reports a viewport one status bar short in an installed app with a translucent status bar; the game then uses the full screen height). The renderer takes its size from the canvas. The manifest has no orientation lock. |
| X-12 | Portrait | On a phone in portrait: a wider camera view (64°, as Pig Pens), the chase camera 1.25 times farther back and higher, the slot bar in two rows of 6 (trailer, then wagon) below the gear and the skip button, the drive buttons (U-6) smaller at the top right below the slot bar (the driving thumb is at the bottom), a smaller horn, the paint screen in one column, and the show as in F-12. |
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

State at version 1.10 (`npm test`: 662 tests, all pass). Version 1.9 had 640, version 1.8 had 602, version 1.7 had 490, version 1.6 had 485, version 1.5 had 475, release 1.0.0 had 464. "Desktop" means a manual check in desktop Chromium with Playwright (keyboard, mouse, screenshots). No iPad was available for these checks. Sound and touch were not tested on a device.

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
| 8.1 Screen items | `trip.test.mjs`, `showSteps.test.mjs` | HUD and arrows in screenshots | Text size on the iPad, safe areas |
| 8.2 Sounds | `voice.test.mjs` (word list, fallback, backlog) | None: headless has no sound | All sounds, speech fallback, engine and skid levels |
| 8.3 Reading aid | `showSteps.test.mjs` (R-2 labels) | Letters glow in the show (screenshots) | Andika and Sniglet fonts load on the iPad |
| 9 Rewards | `progress.test.mjs` | Sticker and card after a show | Card buttons are easy to tap |
| 10 Parent menu | `progress.test.mjs` (settings limits) | Menu opens and saves | Opening it with the gesture the spec names |
| 11 X-1 Libraries, fixed step | `rng.test.mjs`, `game.test.mjs` | Runs in the browser | None |
| 11 X-2 Assets | `assets.test.mjs` | Build is 6.04 MB | None |
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
| 1.7 U-6 Drive buttons | None (UI) | Both buttons at the bottom left only while driving (hidden in the show); each opens its screen, the tractor is held, the X gives driving back; a paint tap repaints and is saved | Button size and the stick near them on the iPad |
| 1.7 W-4 Hat fit | `hats.test.mjs` (every animal, every hat, every frame of every animation: the head cube's top is 0 to 5 cm under the hat's base) | `tools/hats.html`: 8 animals by 3 hats, walking; every hat sits on its head; ears and combs poke through | None |
| 1.7 W-4 Hats on or off | `progress.test.mjs` (toggle, all off, a new hat starts on, locked hats cannot be toggled, storage and old saves) | Paint screen with 3 hats: straw turned off, the animals wear only cowboy and party; the choice is saved | Hat buttons read as on and off to a 4-year-old |
| 1.7 W-1, W-2 Die-cut stickers and the book | `progress.test.mjs` (pose and angle from show and type, varied and stable; place, move to the front, back to the tray, one empty page at the end; old saves and damaged places) | 10 stickers: die-cut renders in 6 poses and 5 angles; dragged 4 onto a page, moved one (it came to the front); placements kept after a reload; the sticker card shows the new die-cut sticker | Dragging with a small finger; sticker size on the page |
| 12 Voice | `voice.test.mjs` | Build prints the clip count (0 now) | Record the clips, check loudness |
| T-34 Breakable trees | `trees.test.mjs`, `game.test.mjs` | Burst, stump and regrow seen | Crunch-pop sound level |
| 1.9 M-22..M-27 Replicated objects, keyframes, diffs, smooth motion | `replica.test.mjs` (round trips per kind, diffs, keyframes, the store's order and ownership numbers, bad data, size limits), `interp.test.mjs`, `protocol.test.mjs`, `link.test.mjs` | Two windows with a local Handshake (`handshake:phase1`) in headless Chromium with service workers blocked: the guest made the host's farm 12 m ahead of the host's start and showed the host's animals 0.35 s after the Join tap, in the same places as on the host. Each window showed the other train in its paints (red; blue), and on the host the guest's tractor moved off smoothly from 0 to 2.9 m/s with no jumps. With `?lag=300,80,5` on the guest, driving was normal (5.2 m in 2 s), the animals showed 1.1 s after the Join tap, and each boop held over the cab and landed 1.2 to 1.4 s after the boop. Not checked: two real devices, a real network with real delay and loss, and the frame rate with two trains on an iPad | — |
| 1.8 M-1..M-19 Play together | `mp.test.mjs` (two to four games in one process over the in-memory link, with 300 ms delay, jitter and loss), `spawn.test.mjs`, `bump.test.mjs`, `game.test.mjs`, `herd.test.mjs` | Two browser windows with a local Handshake (two Chromium contexts, `?signal=`, seed 7): the guest made the host's farm and started 12 m ahead of the host's start, with a horn on the host. Each window showed the other train in its paints (red and yellow; green and blue), with its wheels and the carried animals in the wagon. A guest boop landed in the guest's train 1.3 s after the host put the animal in front of it, and the host showed it there. Host and guest booped two animals at the same time: both landed. Head-on bump: a boing and a horn on both, pushed apart (closest 4.9 m between the tractor centers). The guest's show: the host saw the guest's tractor stopped in the barn and drove on; after the show the host had 21 free animals again. With `?lag=300,80,5` on the guest: driving was normal and a boop landed 1.7 s after the host put the animal there. Not seen in the browser: a refusal (poof) and a new farm from the host. Version 1.9 replaces this check for boops at the same time and refusals (see the 1.9 claims and repair row) | Two iPads on one home network; one iPad over mobile data (TURN) |
| 1.8 M-29..M-36 Multiplayer panel | `session.test.mjs` | Gear held 2 s, "Multiplayer" at the top of the parent menu. Host: the room name, a QR code and "Player 1". Join with the code in lower case: "Join tractor-pickup-…? 1 player.", and Join closed the panel. Host list: "Player 2, direct" with Remove; guest panel: "Player 1 (host), direct" with Leave. Lock, then Remove: the guest went on alone on the same farm; its new join said "That farm is locked." `?r=<code>`: the join prompt at once, and the address had no `r` after it. With a paint choice pending, the start screen stays up after a link join until its go button is tapped | QR code from the iPad camera; text size |
| 1.8 M-39..M-44 Connection loss | `mp.test.mjs` | Leave: the guest went on alone on the same farm with its own herd. The guest's page closed: the host panel said "away" in under 3 s; the guest's train became half transparent (no shadow since this check; the carried animals stay opaque) and went away with a poof 31 to 34 s after the close. No error showed in the game; the browser console had only Handshake warnings. Not checked: host away (M-40), coming back in 30 s, M-42 and M-43 | Screen lock and Wi-Fi to mobile data on an iPad |
| 1.9 M-13, M-14, M-56..M-58 Claims and repair | `mp.test.mjs` (the answer is the replicated owner: yes, refusal, late yes, timeout, no re-boop until a keyframe), `mp.repair.test.mjs` (host frees an animal missing from a train for 3 s; an away guest keeps its animals; a lost claim, a lost answer, lost tree breaks and a 1 s loss of everything with two guests under 150 ms delay, jitter and 5 % loss: all devices agree within 3 s) | Headless Chromium with service workers blocked, same setup as the 1.9 M-22..M-27 row. A guest boop landed in the guest's train 1.3 s after the host put the animal in front of it, and the host showed it there; in 8 races of host and guest to one animal, the guest got it 4 times, the host 3 times (each time the guest's animal went away with a poof and stars) and once the animal walked away, and no animal was ever in two trains. The guest broke a tree and it burst in both windows within 0.1 s; the guest's show grew it back on the host, the guest's 5 riders walked into the barn on the host, and after the show the host had 21 free animals again. The host's page was made to stop for 10 s as a simulation (headless Chromium never hides a page, so the test set the page's visibility state to hidden and stopped all its JavaScript with the DevTools debugger): after 2.9 s the guest showed the host's train half transparent, its panel said "away" and boops were paused; when the host came back, boops started again at once and the free animals near the guest and the guest's 2 riders were the same in both windows at the first check. A guest's page that slept for 10 s, simulated the same way with its Handshake socket closed first, was "away" on the host at once, half transparent, with its 2 riders still in its train; 2.4 s after it woke, both windows agreed and its next boop landed. Lock, then Remove: the guest said "You were removed from the farm." and went on alone on the same farm with its riders, and its animals walked again. A guest's page that stops but keeps its Handshake socket open (a desktop background tab) does not get "away" from the server. The host now shows that guest as away when no frame comes from it for more than 3 s. `mp.test.mjs` tests this; it was not checked on a device. The M-57 rule counts only while the guest's frames come in, so the guest keeps its animals. Known limit: on a very slow link (more than approximately 1 s extra), M-57 can free a delivered animal before the delivery that the guest sends again arrives; the animal is then free again. The browser consoles had no errors from the game: only Playwright's service worker notice, a GPU driver performance message and Handshake `peer_unavailable` warnings after a guest page closed. Not checked: a real hidden tab and screen lock, a real network change (only the page's online event, which restarts the connections: all agreed 1.2 s after) and TURN | A real network change (Wi-Fi to mobile data), a hidden tab and screen lock on an iPad |
| 1.8 M-45..M-51 Safety | `mp.test.mjs` (bad messages, spoofing, floods, claim and tree range), `protocol.test.mjs`, Handshake's own tests | — | — |
| 1.10 C-1, C-2, C-8..C-11 Point to go | `pilot.test.mjs` (stick angle to heading, speed by heading error, reverse cone, turn help; closed loop with a real tractor: held up drives straight, held right drives in a circle, down backs straight, down-left swings the rear left, a turn in a small space), `input.test.mjs` (radial dead zone), `hitch.test.mjs` (reverse pushes jackknifed wagons back) | Keyboard and mouse stick: held right turns and keeps turning; up drives straight | The feel for a 4-year-old; the `?tune` values |
| 1.10 F-6..F-8, F-12, F-14, F-15 Show | `show.test.mjs` (faster timings, each hop reported once for the check mark, label scale), `showSteps.test.mjs` | Shows with 4 groups at 1180×820, 1366×1024 and 390×844: no overlapping labels, check marks, sum terms hidden until spoken | Timing with the voice |
| 1.10 S-2, S-7 Sound | None (sound) | Horn plays with no error | Gravel volume and the horn sound |
| 1.10 X-11, X-12, U-1, U-6 Screen fit and portrait | None (layout) | Start screen, driving and show at 390×844; drive buttons top right in portrait | Installed on the home screen: full height; a phone in portrait |
| 1.10 F-3, W-2 New-sticker badge | `progress.test.mjs` (new since last opened, seen on open, old saves have none) | Badge 1 on the card and the drive button after a show, gone after the book opens | None known |
| 1.10 X-4 Stutters | `matSplit.test.mjs`, `shadows.test.mjs` | Desktop: no long frames (also with the CPU 4 times slower); program look-ups between draws measured at zero in the yard and on the routes | A drive on the routes with `?fps`: the list of long frames |

Performance (X-4), desktop proxy: an RTX 5070 Ti is too fast to show an iPad limit, so the numbers are mainly the draw calls and triangles. Seed 1, start position, 1280 by 800:

| Change | GPU time per frame | Draw calls | Triangles |
|---|---|---|---|
| Before | 0.39 ms | 111 | 1.85 M |
| After: grass skips rock samples, ground in 6 by 6 chunks | 0.35 ms | 124 | 1.66 M |

At 2360 by 1640 the time went from 0.63 ms to 0.54 ms. The shadow pass is about 40 % of the triangles and of the GPU time. The shadow map and the shadow box were not reduced, because the desktop frame time gives no reason. They are the next step if the iPad drops below 55 fps: map 1024 and box 22 m.

---

## 14. Multiplayer

Two to four players drive on the same farm at the same time, each on a different device. Each player has a tractor, a trailer and a wagon. The animals are shared: the first tractor that boops an animal gets it. This is not a competition. There is no score, no winner and no timer.

The usual players are a parent and a child on the same home network. Players on different networks (for example, a hotel on a different continent) must also be able to play. Some delay is acceptable.

Items marked **Phase 2** are part of the design but not part of version 1.8.

### 14.1 Terms

| Term | Type | Definition |
|---|---|---|
| Room | TN | One multiplayer game: one host and its guests. |
| Host | TN | The device that makes the room. Its farm is the farm of the room. |
| Guest | TN | A device that joins a room. |
| Room code | TN | 5 letters and digits that identify a room, for example `K7MX2`. The signaling server makes it. It does not use 0, O, 1, I or L. |
| Room name | TN | `tractor-pickup-` and the room code, for example `tractor-pickup-K7MX2`. |
| Other tractor | TN | A tractor of a different player, as it shows on this device. |
| Owner | TN | The device that moves an object and sends its position to the other devices. |
| Claim | TN | A request from a guest to the host for an animal that the guest booped. |
| Ownership number | TN | A number on each animal. It increases each time the animal changes owner. |
| Replicated object | TN | A game object that all devices in a room share: an animal, a tree, a player or a train. It has an id, a kind and fields. |
| Kind | TN | The type of a replicated object. A kind gives the fields that are sent, the size of each field and the authority. |
| Authority | TN | The one device that can change a replicated object. The host is the authority for animals, trees and players. Each player is the authority for its own train. |
| Keyframe | TN | A message with the full state of all replicated objects of one authority. |
| Diff | TN | A message with only the replicated objects that changed since the last diff. Each object in a diff has all of its fields, not only the changed fields. |
| Handshake | TN | The signaling server (`https://handshake.four43.com`) and its client library `handshake.js`. It finds the room and connects the devices. It does not carry game data. |

### 14.2 Play

| ID | Item | Description |
|---|---|---|
| M-1 | Shared farm | All players drive on the host's farm. Each guest makes the same farm from the host's seed (P-5). |
| M-2 | Own vehicles | Each player has a tractor, a trailer and a wagon, with 12 slots (G-1). The other tractors show in their own paint (W-3). |
| M-3 | Shared animals | All players see the same free animals. The first tractor that boops an animal gets it (M-12). |
| M-4 | Own show | When a player drives into the barn, that player gets a show (section 3.4) on that device. The other players continue to drive. On the other devices, that player's tractor stops in the barn until the show ends. The other devices do not show the show. |
| M-5 | Own rewards | Stickers, paints, hats (section 9), settings (section 10) and the voice stay on each device. A guest's progress does not change when it joins or leaves. |
| M-6 | Respawn | After a player's show, the delivered animals go away and new animals walk in along the routes (G-3), on all devices. |
| M-7 | Soft bump | When two tractors touch, each device pushes its own tractor gently away from the other tractor, with a "boing" and a short horn. The push is approximately 2 m/s, away from the other tractor's center. The tractors do not stay together. Trailers and wagons do not touch other vehicles. |
| M-8 | Horn | The horn (U-2) calls animals to that player's tractor on all devices (C-6, A-11). The horn of an other tractor sounds more quietly. |
| M-9 | Help | The help animal (F-4) comes to the tractor of the player who needs help. |
| M-10 | Join on screen | When a guest joins, its tractor appears ahead of the farm start with a sparkle and a short horn. Each player number has its own place, 12 m apart along the farm start's heading (8 m to the side when that place is blocked), clear of obstacles. |

### 14.3 What each device owns

| ID | Item | Description |
|---|---|---|
| M-11 | Own vehicle | Each device moves its own tractor, trailer and wagon and the animals in flight to them or in them. It sends their positions to the other devices. Thus driving has no delay on any device. |
| M-12 | Host animals | The host owns all free animals and their behavior (section 5.2). Only the host runs the animal behavior. An animal reacts to the nearest tractor (flee, look, come to the horn). When a guest's train is full, the host makes animals hop out of its way (B-14). |
| M-13 | Boop by a guest | The guest launches the animal at once (B-4) and sends a claim. A claim is a request to own the animal. A booped hen sends a claim for the whole chick line (A-12). The host gives an animal to the first claim that it gets: the animal's owner becomes that guest and its ownership number increases. If the animal is not free, the host does not change it. The host sends no separate answer: the guest learns the result from the animal's replicated owner (M-22). |
| M-14 | Land after a yes | An animal in flight lands only when its replicated owner is this guest, with an ownership number higher than when the guest booped it. If the result is late, the animal stays at the top of its arc for up to 1 s more. If the replicated owner is a different player, or the result does not come in that time, the animal disappears with a "poof" (stars and a soft sound) and shows again where the host has it. The claim stays open until a keyframe shows the result; the guest does not boop that animal again before then. Thus an animal that landed never goes away (R-4). A refusal is rare: it occurs only when two players boop the same animal at almost the same time. |
| M-15 | Boop by the host | The host's own boops do not need a claim. The host is first for every animal that it boops. |
| M-16 | Delivery | After a guest's show, the guest tells the host which animals it delivered. The host removes them and makes new animals (M-6). |
| M-17 | Trees and bushes | The host owns the state of each tree and bush (T-34, T-35). A guest breaks a tree on its own screen at once and tells the host. The host breaks it on all devices. When the show of any player starts, broken trees and bushes grow back on all devices (T-32). |
| M-18 | Yard props | Hay bales, cones and barrels (T-31) are not shared. Each device moves its own props, and both tractors can push them. Props can be in different positions on different devices. Each device resets its props at its own show. |
| M-19 | New farm | When the host makes a new farm (P-8), each guest makes the same new farm. A guest in its show makes it after the show. A guest cannot make a new farm while it is in a room. |

### 14.4 Network data

| ID | Item | Description |
|---|---|---|
| M-20 | Connections | The devices connect directly with WebRTC data channels, in a star: each guest connects only to the host. Handshake helps them connect and does not carry game data. If a direct connection is not possible, a TURN server relays the data. All game data is encrypted (DTLS). |
| M-21 | Channels | Each connection has two channels. The fast channel does not resend lost messages and does not keep the order. It carries positions. The reliable channel resends and keeps the order. It carries all other messages. |
| M-22 | Replicated objects | All shared state is replicated objects. The kinds are: animal (authority: host; fields: type, golden, home (route or yard), state, owner, ownership number, position, rotation, animation, hidden, chick line), tree (authority: host; field: state), player (authority: host; fields: player number, paints, away, join (which joining of that player number; a number given again is a new player)) and train (authority: the player; fields: the tractor, trailer and wagon positions and rotations, mode, full, and the animals in its slots or in flight to it, by id and slot). Game code registers its objects; it does not make network messages. A new kind of shared object in a later version is a new kind, not a new message. |
| M-23 | Keyframes and diffs | Each authority sends a keyframe on the reliable channel every 2 s, and at once to a new guest. Between keyframes it sends diffs on the fast channel: from the host approximately 15 times each second, and for a train approximately 20 times each second. Both are binary, with a time stamp. A diff has each changed object with all its fields, so a lost diff is not a problem: the next diff or keyframe has the correct state. The host sends each guest's train to the other guests. With each keyframe, the host also sends the welcome (M-24) to each guest again. |
| M-24 | Event messages | On the reliable channel, JSON. They are requests and one-time effects, not state: welcome (seed, farm number, game version, player number; the farm number changes with each new farm, also when the seed is the same), claim, delivery, tree break, trees regrow, horn, help request and answer, new farm. The result of a request comes back as replicated state. A lost message is sent again: the host sends the welcome with each keyframe, and a guest ignores a welcome that it already has. A guest sends hello every 2 s until the welcome comes. At each host keyframe, a guest sends delivery and paint again until the replicated state shows them. |
| M-25 | Smooth motion | A device shows the other tractors and the host's animals approximately 100 ms behind their time stamps, and moves them smoothly between two messages. When the messages arrive unevenly, this delay increases, up to 300 ms. |
| M-26 | Old messages | A device ignores a message that is older than the last message it used. It ignores animal data that has a lower ownership number than the number it knows. A keyframe replaces the state of every object that this device is not the authority for. |
| M-27 | Game version | The game has a network version number. It increases when the network messages change. A device with a different number cannot join (Handshake refuses it). The join prompt (M-32) then says "Update the game on both devices". |
| M-28 | Lag test | The URL parameter `?lag=ms` (with optional jitter and loss, for example `?lag=300,80,5`) delays all network messages on this device. The URL parameter `?signal=url` uses a different Handshake server. These are for tests. |

### 14.5 Parent menu: the Multiplayer panel

| ID | Item | Description |
|---|---|---|
| M-29 | Multiplayer button | At the top of the parent menu (section 10), a "Multiplayer" button opens the Multiplayer panel. A red X at the top right closes the panel (U-7). The panel has text, like the parent menu. A child cannot open it, because the parent menu needs a long press (U-3). |
| M-30 | Start | When the device is not in a room, the panel shows two buttons: "Host" and "Join". |
| M-31 | Host | "Host" makes a room. The panel shows: the room name in large letters; a QR code of the full game URL with the room code (for example `https://four43.com/exp/tractor-pickup/?r=K7MX2`); and the player list. Each row of the player list shows a small tractor picture in that player's paints, the player number and the state (connecting, direct, relayed or away). Each guest row has a "Remove" button. A "Lock" switch stops new players. A "Stop hosting" button closes the room. When Handshake cannot be reached, the panel says so and tries again every 10 s. |
| M-32 | Join | "Join" shows `tractor-pickup-` as fixed text, then a text box for the room code (for example `K7MX2`), and a "Join" button. The text box takes the code in upper or lower case; a pasted full room name keeps only its code. The game asks Handshake whether the room exists (peek). Then a prompt shows the room name and the number of players, with "Join" and "Cancel". If the room does not exist, is full, is locked or has a different game version, the panel says so. |
| M-33 | Joined | A "Join" in the prompt closes the panel and the guest goes onto the host's farm. While the device is in a room as a guest, the panel shows the room name, the player list (without "Remove") and a "Leave" button. |
| M-34 | Link | When the game opens with `?r=<code>` (for example from the QR code and the camera of a phone or tablet), it shows the join prompt (M-32) at once. The game then removes `?r` from the address, so a reload does not show the prompt again. |
| M-35 | No names | Players have no names. A player is a player number and a tractor in its paints. |
| M-36 | Not kept | A room does not continue after a reload or after the game closes. "Host" must be selected again. |
| M-37 | Nearby list | **Phase 2.** The Join panel also shows the rooms on the same network. A tap on a room sends a knock to the host. The host shows a prompt over the game: "Let a tractor join?" with a button that the parent must hold for 2 s (as U-3), and "No". A join with the room code does not need a knock. |
| M-38 | Scan in the game | **Phase 2.** The Join panel has a camera button. It opens the camera and reads the QR code (M-31), then shows the join prompt. It uses the browser's barcode reader when it has one, and a small QR library (approximately 50 KB) when it does not (Safari on iPad). |

### 14.6 Connection loss

| ID | Item | Description |
|---|---|---|
| M-39 | Guest away | When a guest's connection stops (for example, the screen locks), its tractor stops on the other devices and becomes half transparent. If the guest comes back in 30 s, it continues. If not, its tractor disappears with a "poof". The host removes the animals of that guest and makes new animals (M-6). |
| M-40 | Host away | When the host's connection stops, the guests continue to drive. The host's tractor becomes half transparent. The free animals stop, and boops stop until the host comes back. If the host does not come back in 30 s, each guest continues alone (M-41). |
| M-41 | Alone on the same farm | When a guest leaves a room for any reason (Leave, Remove, room closed, host gone), it continues alone on the same farm. Its device starts to run the animal behavior with the animals where they are. The animals in its slots stay. Nothing is made again. |
| M-42 | Network change | When a device changes network (for example, from Wi-Fi to mobile data), the connection is made again without a stop of the game. |
| M-43 | Screen on | While the device is in a room, the screen does not go dark (Screen Wake Lock). |
| M-56 | Guest repair | At each keyframe from the host, a guest makes its state agree. An open claim that the keyframe does not give to this guest ends (M-14). An animal that the keyframe gives to this guest but that the guest does not have goes back to the host (the guest sends a release). Trees agree with the keyframe. |
| M-57 | Host repair | If an animal is owned by a guest but is not in that guest's train for 3 s, the host makes it free again (its ownership number increases). |
| M-58 | Repair time | After a message is lost, or after a connection is made again (M-42), all devices agree again in 3 s or less. |
| M-44 | Failure | No network failure stops the game or shows an error to the child (R-1). Errors show only in the Multiplayer panel. The browser console shows each kind of network error once, not once for each message. |

### 14.7 Safety

The players are children. These rules apply to all items in section 14.

| ID | Rule |
|---|---|
| M-45 | No talk | There is no chat, voice, picture or free text between players. The only text from the network that shows is the room name and the player numbers, and only in the Multiplayer panel. |
| M-46 | Code to join | In Phase 1, the only way into a room is its room code (typed, from the link or from the QR code). Handshake does not list the rooms of this game (`list = "none"`). Phase 2 adds the nearby list with a knock (M-37). |
| M-47 | Guessing | Handshake limits wrong room codes for each address (20 each minute) and for the whole game (200 each minute). A peek counts as a join attempt. |
| M-48 | Hidden addresses | When a guest is not on the same network as the host, both devices connect only through the TURN relay. Thus neither device gets the public IP address of the other. |
| M-49 | Host control | The host can remove a guest and lock the room (M-31). A removed guest cannot come back while the room is locked. |
| M-50 | Check all data | The host checks each message from a guest: the size, that each number is a valid number in its range, that each id exists, and the message rate (a maximum of 60 messages each second on each channel, counted in wall time, so a page that stops does not block messages after it starts again). The host ignores a bad message. The host refuses a claim when the guest's tractor is more than 8 m from the animal, and a tree break when the guest's tractor is more than 12 m from the tree. For these checks, the host does not use the tractor position from the guest directly: it moves its own copy of the position to the position from the guest at a maximum of 1.5 times the top speed of a tractor. After a welcome, this copy starts at the spawn place of the guest. A guest can send a maximum of 4 keyframes each second; these do not count in the limit for its other reliable messages. The host sends the train of each guest to the other guests at a maximum of 20 times each second (only the newest train), and its keyframe every 2 s. The guest checks the messages from the host in the same way, including the game version in the welcome (M-27), but accepts up to 120 messages each second on the fast channel, because the host also sends the trains of the other guests on that channel. |
| M-51 | No personal data | The game sends no name, account, place or device data. Handshake keeps rooms in memory only. |

### 14.8 Tests

| ID | Item | Description |
|---|---|---|
| M-52 | Two games in one test | Automated tests run a host game and a guest game in Node, connected by an in-memory link that can add delay, jitter and loss (as M-28). They check: the guest makes the same farm; both see the same animals; a claim, a refusal (the "poof") and a late yes (M-14); delivery and respawn; tree breaks and regrow; away, back and alone on the same farm (M-39 to M-41); new farm; old messages (M-26); bad messages (M-50). |
| M-53 | Messages | Automated tests encode and decode each kind, keyframe and diff, check the size limits, and check that bad data is refused. Loss tests drop all claim messages and replicated messages during a connection change, and check that all devices agree again in 3 s (M-58). |
| M-54 | Browser | A desktop check with two browser windows: host, join with the code, drive both tractors, boop, bump, show, leave. |
| M-55 | Handshake | Handshake has its own tests (its `SPEC.md`). |
