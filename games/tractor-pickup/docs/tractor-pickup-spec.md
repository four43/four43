# Tractor Pickup: Design Specification

Version: 1.1 (farmyard and routes)
Date: 5 October 2026
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

The farm has a large open farmyard at the center, with the barn. Two roads (routes) go out from the farmyard, turn through the fields and come back to the farmyard. The player drives a route, boops animals and comes back. When the tractor drives through the barn, the animals hop out and the game shows them, counts them and says their names. The farmyard is also an open area to drive, slide and push obstacles.

### 1.3 Design rules for a 4-year-old player

These rules apply to all items in this document. If an item does not obey a rule, change the item.

| ID | Rule |
|---|---|
| R-1 | The player cannot fail. No item can stop a trip. |
| R-2 | The player does not need to read to play. Use pictures, sounds and a voice. The only text in the game is animal names, as a reading aid. The voice always says each word that shows (W-5). |
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
| Route | TN | A road that goes out of the farmyard at one gate and comes back at a different gate. |
| Gate | TN | One of the four openings in the farmyard fence, at the middle of each side. |
| Road | TN | All route tiles together. |
| Tile | TN | One 20 m × 20 m square of the farm. |
| Field | TN | The grass area between the routes. |
| Obstacle | TN | A hay bale, cone, barrel, post or tree in the farmyard. |
| Trip | TN | One drive from the barn, out on the routes and back through the barn. |
| Show | TN | The sequence after a trip. The animals hop out, the game counts them and says their names. |
| Stage | TN | The low platform next to the barn exit. The animals stand on it during the show. |
| Paddock | TN | The fenced area next to the barn. Delivered animals live in it. |
| Trailer | TN | The cart that the tractor tows. Animals ride in it. |
| Wagon | TN | One more trailer that the game attaches behind the last trailer. |
| Barn | TN | The drive-through building at the center of the farmyard. The player drives through it to deliver the animals. |
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
2. The tractor starts in the farmyard, at the barn exit, with an empty trailer and wagon. The voice says "Let's find animals!".
3. The player drives out on a route and boops animals. Each boop fills one slot.
4. The player comes back to the farmyard and drives through the barn, in either direction. If at least one animal rides in the trailer or the wagon, the show starts (3.4). If no animal rides, nothing occurs. **[F-1]**
5. When all 12 slots are full, the voice says "Great job! Go to the barn!". An arrow and a path of sparkles show the way to the barn. **[F-2]**
6. After the show, the delivered animals walk into the paddock and stay there. The player gets a sticker (W-1). **[F-3]**
7. The player drives again with an empty trailer and wagon, on the same farm. **[F-9]** The sticker card has a "new farm" button (a map picture). A tap on it makes a new farm.

### 3.2 Animals and slots

| ID | Item | Value |
|---|---|---|
| G-1 | Slots | 12: 6 in the trailer, then 6 in the wagon |
| G-2 | Trip size | 1 to 12 animals. There is no fixed goal. |
| G-3 | Free animals | 18 on the routes and 3 in the farmyard. After each show, new animals walk in from the farm edge to replace the delivered animals. |

### 3.3 Help to find animals

**[F-4]** If the player does not boop an animal for 20 s, the nearest free animal walks to the road ahead of the tractor. It waves and makes its sound. An arrow at the edge of the screen points to it.

### 3.4 Show

The show starts when the tractor comes out of the barn with at least one animal. It helps the child count and read.

| ID | Item | Description |
|---|---|---|
| F-5 | Stop | The tractor stops softly after the barn exit. The camera moves to a position at the side of the stage. |
| F-6 | Hop out | The animals hop out of the trailer and the wagon one at a time, in landing order, and stand in a row on the stage. When an animal lands, a large number shows above it (1, 2, 3 ...) and its name shows below it. The voice says the number and the name ("One... Pig!"). |
| F-7 | All together | After the last animal, all animals jump together. One large number shows the total. The animals move into groups by type, with the name and the number of each group. The voice says the total and "animals!", then "Hooray!". Confetti. |
| F-8 | Speed | Each step waits 0.8 s. A tap on the screen goes to the next step immediately, so a parent can make it faster. |
| F-10 | Paddock | After the show, the animals walk off the stage into the paddock. The camera goes back to the chase camera. |

---

## 4. Farm, farmyard and routes

### 4.1 Layout

The game makes the farm at run time from a set of predefined tiles. Each route starts and ends at the farmyard, so the player never comes to a dead end.

| ID | Item | Value |
|---|---|---|
| T-1 | Grid | Square tiles, 20 m × 20 m. The farm is a grid of 11 × 11 tiles (220 m × 220 m). The outer ring of tiles has no road. |
| T-2 | Road width | 7 m (approximately 3 tractor widths) |
| T-3 | Farmyard | The 3 × 3 tiles at the grid center (60 m × 60 m). Four gates, one at the middle of each side. |
| T-4 | Seed | Each new farm uses a new random seed. The parent menu shows the seed and can set it. The same seed always makes the same farm. |
| T-5 | Curves | A curve tile turns the road 90°. The curve radius is 10 m. |
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
| T-12 | Field | None | Grass, crops, trees, a pond or a hay stack. Animals live here. |
| T-26 | Farmyard | Gates | Open packed gravel with the barn, the stage, the paddock and obstacles. See 4.7. |

### 4.3 Generation steps

1. Mark the 3 × 3 farmyard tiles at the grid center.
2. Choose the gate pairs at random: (north, east) and (south, west), or (north, west) and (south, east).
3. For each route, find a path of tiles from the tile outside its first gate to the tile outside its second gate. Use a random depth-first search. Use only the tiles in the corner of the farm between the two gates. Obey T-24 and T-25.
4. Give each road tile its type: straight or curve, from the directions of the road into and out of the tile. The first and last tiles are gate tiles.
5. Change straight tiles to feature tiles (T-9 to T-11). Obey the rules in 4.5.
6. Put the barn, the stage, the paddock and the obstacles in the farmyard (4.7).
7. Fill all other tiles with field tiles (T-12). Put more animals on the field tiles next to the road.
8. Put a low fence around the farm edge and around the farmyard. The farmyard fence has an opening at each gate.

### 4.4 Track features

| ID | Feature | Description |
|---|---|---|
| T-13 | Mud | The mud decreases the maximum speed by 50 % and decreases grip. The wheels throw brown splashes. A "squelch" sound. The tractor gets very dirty fast (T-16). |
| T-14 | Ramp | A gravel kicker: 5 m up to 0.6 m, a 1 m flat top, 3 m down. The tractor jumps approximately 4 m. Driven in the other direction, it is a bump. The trailer and the wagon follow over the ramp. The animals bounce up and land in their slots again (B-11). A "whee" sound and a cheer from the animals. |
| T-15 | Sprinkler | A sprinkler arch over the road. Water sprays when the tractor comes near. The tractor drives through the spray and becomes clean in 1.5 s. Sparkles and a "squeaky clean" sound. |
| T-16 | Dirt | The tractor, the trailer, the wagon and each animal have a dirt level from 0 (clean) to 1 (very dirty). The level increases slowly on gravel and grass, and fast in mud. Brown spots and dust show on the tractor body, the wheels, the trailers and the animals. Animals in the trailers get dirt from the mud splashes. More dirt gives more spots. Only the sprinkler removes the dirt. It washes the tractor, the trailers and all animals in them. |
| T-17 | Off-road | The player can drive on the grass. Grass decreases the maximum speed by 30 % and decreases grip. The fence at the farm edge stops the tractor softly. |

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

Scenery must not block the view of an animal from the chase camera. Put tall items (trees) on the outer side of curves, not the inner side.

### 4.7 Farmyard

| ID | Item | Description |
|---|---|---|
| T-27 | Surface | Packed gravel. Grip and speed are the same as on the road. |
| T-28 | Barn | A drive-through barn at the farmyard center. It is open at both ends. Its axis points to two opposite gates. The player can drive through it in either direction. |
| T-29 | Stage and paddock | The stage is a low wood platform 8 m past one barn exit, at the side of the drive line. The paddock is a fenced area next to the stage. |
| T-30 | Lanes | Keep a 6 m wide lane clear of obstacles from each gate to the nearest barn end. |
| T-31 | Obstacles | 4 round hay bales (they roll when the tractor pushes them), 8 cones and 4 barrels (they tip over and slide), 4 fixed posts and 2 trees (they do not move). Put them at random outside the lanes. |
| T-32 | Reset | When a show starts, all moved obstacles go back to their start positions with a small "poof". |

---

## 5. Animals

### 5.1 Types

Use Kenney Cube Pets models for the pig, cow, chicken, bunny and dog. The pack has no sheep and no duck. Make the sheep from the pig model with new colors (cream wool, dark face). Make the duck from the chick model with new colors (white body, orange beak) and a flatter scale. Both keep the same body parts and animations. Each type has a sound and a launch style.

| ID | Animal | Sound | Launch style | Status |
|---|---|---|---|---|
| A-1 | Pig | "Oink" | A full somersault on the path | Accepted |
| A-2 | Cow | "Moo" | Slow and heavy on the path. The trailer bounces when it lands. | Accepted |
| A-3 | Chicken | "Bawk" | It flaps its wings on the path and floats down into the slot. | Accepted |
| A-4 | Sheep | "Baa" | A soft spin on the path | Accepted |
| A-5 | Duck | "Quack" | Water drops fall from it if it comes from the pond. | Accepted |
| A-6 | Bunny | Small "boing" | Its ears spin like a propeller on the path. | Accepted |
| A-7 | Dog | "Woof" | It jumps on the path by itself when the tractor comes near. It does not need a boop. | Accepted |
| A-8 | Golden animal | Bells | One of the types above, but gold. A rainbow trail on the path. A large celebration. The name shows as "Golden Pig" (for example). One or zero on the farm at a time. | Accepted |

### 5.2 Behavior on the farm

| ID | Item | Description | Status |
|---|---|---|---|
| A-9 | Mosey | Animals walk slowly near the road and across it. They stop, eat grass, look around and walk again. Each animal type has a different walk speed. | Accepted |
| A-10 | Gentle run | Some animals run away slowly when the tractor comes near. The tractor is always faster. | Accepted |
| A-11 | Come here | Some animals walk to the tractor when the player uses the horn. | Accepted |
| A-12 | Groups | Chicks walk in a line behind a hen. The name of a chick is "Chick". One boop launches all of them, one after the other. | Accepted |
| A-13 | Hide | An animal hides behind a bush. Its tail shows. A boop on the bush finds it. | Accepted |
| A-14 | Mud bath | Pigs walk to a mud tile and roll in the mud. They get very dirty (T-16). | Accepted |
| A-15 | Farmyard animals | 3 animals walk in the farmyard between the obstacles. They stay out of the barn. They walk across the lanes, so the player meets them. | Accepted |
| A-16 | Paddock | Delivered animals live in the paddock. They walk, eat and look at the tractor. They cannot be booped. If the paddock has more than 30 animals, the oldest animals walk out of the farm. | Accepted |

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
| B-7 | Slow motion | The game runs at 50 % speed at the top of the arc for 0.3 s. |
| B-8 | Landing | A "plop" sound. The slot picture at the top of the screen fills with the animal picture. |
| B-9 | Animal name | The name of the animal shows in large letters at the center top of the screen (for example, "Pig"). See W-5. The voice says the name. |

### 6.3 In the trailer

| ID | Item | Description | Status |
|---|---|---|---|
| B-10 | Ride | The animals sit in rows. They face forward. They move a little when the trailer turns. | Accepted |
| B-11 | Bounce | On a bump or a jump, the animals bounce up and come back to their slot. They never fall out (R-4). | Accepted |
| B-12 | Cheer | When the tractor goes fast, the animals put their front legs up and cheer. | Accepted |
| B-13 | Wagon | The tractor tows a trailer and a wagon from the start. Both are empty at the start. Each holds 6 animals in 2 rows of 3 slots. A spherical joint connects the trailer to the tractor, and a second spherical joint connects the wagon to the trailer. | Accepted |

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
| U-4 | Text | Only animal names (W-5) and the numbers and names in the show (section 3.4). The parent menu can use text. |

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
| W-3 | Tractor colors | After each 3 shows, the player gets a new tractor color: red, green, blue, yellow, pink, rainbow. The player chooses by a tap on a tractor picture. |
| W-4 | Hats | After 4, 8 and 12 shows, the player gets a new hat (straw, cowboy, party). The animals in the trailer wear hats. |

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

---

## 12. Voice recordings

### 12.1 Word list

A parent records these words. Each word is one file.

| Group | Files |
|---|---|
| Numbers | `one` to `twelve` |
| Animals | `pig`, `cow`, `chicken`, `sheep`, `duck`, `bunny`, `dog`, `chick`, `golden` |
| Phrases | `lets-find` ("Let's find..."), `animals` ("...animals!"), `great-job` ("Great job!"), `go-to-barn` ("Go to the barn!"), `lets-count` ("Let's count!"), `hooray` ("Hooray!"), `you-did-it` ("You did it!") |

The game joins files to make sentences. For example: `lets-find` + `animals`, or `one` + `pig`.

### 12.2 File format

| Item | Value |
|---|---|
| Folder | `games/tractor-pickup/audio/voice/` |
| Name | The file name in 12.1, plus `.mp3` (for example, `chicken.mp3`) |
| Format | MP3, mono, 64 kbit/s. Approximately 10 KB for each word. |
| Trim | The build removes silence at the start and the end, and sets the same loudness for all files. |
| Missing file | The game uses the browser speech function for that word. Thus, the game operates before all recordings are complete. |

---

## 13. Open questions

None.
