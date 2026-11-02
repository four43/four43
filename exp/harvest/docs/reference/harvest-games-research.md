# Harvest-with-a-vehicle mobile games: research notes

Research for a friendly 3D browser game where you drive a tractor or combine with one virtual thumbstick, cut crops by driving over them, fill towed trailers, sell at a farm and buy upgrades (speed, header width, bin size, number of trailers).

- **Researched:** 2026-11-01. Store numbers (downloads, ratings, "updated") are as shown on that date.
- **Method:**
  - Google Play listings read directly, including descriptions, store screenshots and the reviews shown on the page.
  - Apple App Store listings, publisher blogs and a strategy guide.
  - YouTube gameplay videos. I could not watch the videos. I read each video's title and description, and looked at YouTube's storyboard thumbnails, which are about one frame every 5 seconds. Anything I say a video "shows" comes from those frames, so read it as "visible in the thumbnails".
- **Gaps:** Reddit blocked automated access, so I found no Reddit threads. The player opinion in section 5 comes from store reviews. None of the games publish their upgrade tables. The only prices I have are the ones visible in store screenshots, and marketing screenshots may be staged.

Tags used below: **[1st]** first-party (store listing, developer or publisher). **[2nd]** secondary (guide, blog, third-party site). **[vid]** YouTube storyboard frames. **[shot]** official store screenshot. **[inference]** my own reasoning, not sourced.

---

## 1. The games

### The closest matches

**Harvest Village: Idle Farm** (Oh BiBi). This is the closest match to the target design.
- **Platform and size:** Android. 1K+ downloads, updated Oct 30, 2026 [1st] ([Google Play](https://play.google.com/store/apps/details?id=com.ohbibi.harvestvillage)). I found no iOS listing. With only 1K+ downloads it is probably in soft launch [inference].
- **Core loop:** You "Cut wheat, corn and carrots, stack the bales on your trailers, sell them at the farm and spend your coins" [1st].
- **Selling and capacity:** "Load your bales onto the trailers hitched to your harvester, then roll back to the farm to sell them. Trailer space is limited and the cash box fills up fast" [1st].
- **Fields:** "Crops grow back on their own" [1st].
- **Upgrades:** "more speed, a wider cutter, extra trailers and more power". "Richer crops slow you down until you're strong enough, and with enough power you can crush the obstacles" [1st].
- **Helpers:** They "carry bales back to the farm and water your crops so they grow back faster" [1st].
- **Expansion:** New plots with new crops. Each plot earns a "farm star" [1st].
- **Offline:** "Your farm keeps earning while you're away" [1st].
- **Screenshots** [shot]:
  - A combine pulling 3 or more small flatbed trailers stacked with round bales.
  - A green "COMBINE" upgrade pad on the ground next to the barn.
  - An upgrade card with Speed, Capacity, Bale Stack and Trailer.
  - A "4/7" cargo counter floating over the harvester.
  - Locked plots with prices on wooden signs (2.5K, 10K).

**Mow it: Harvest & Mowing / "Mow it: Mowing games"**
- **Publisher:** "PALCY GAMES" on Google Play: 1M+ downloads, 4.3★, 2.37K reviews ([Play](https://play.google.com/store/apps/details?id=com.igdclub.mowit)). On iOS the developer is Oleksandr Piddubnyi: 4.6★ from 241 ratings ([App Store](https://apps.apple.com/us/app/-/id1610099852)). A YouTube description credits "BOLD CAT" ([video](https://www.youtube.com/watch?v=N4aXcGA73yc)). It is most likely the same game under different publisher names.
- **Core loop:** "Fill the cart with hay and once it's full, you can go to the market and sell all the contents" [1st, iOS]. "You can upgrade equipment on them (increase size, speed, power) or develop a farm" [1st, iOS].
- **Visuals:**
  - Very tall, brightly coloured grass that the harvester carves a path through, leaving bare dirt.
  - A vertical fill gauge on the left of the HUD [shot].
  - Video frames show 2–3 blue carts chained behind the harvester.
  - A painted "SELL" pad beside a red barn, where green bales burst out with a floating "+2200" coin popup.
  - A "CART IS FULL" banner, a green arrow pointing back toward the barn, and a "SPECIAL OFFER" pad painted on the ground.
  - Source for the video items: [vid] [Pryszard, Part 1](https://www.youtube.com/watch?v=N4aXcGA73yc).

**Mow & Haul: Grass Cutter** (Play Forge Labs). Android, 50K+ downloads, 3.1★, updated Oct 26, 2026 ([Play](https://play.google.com/store/apps/details?id=com.play.grasscutter.trim.mow.haul.trimgame)).
- **Core loop:** "Drive through thick patches, watch the grass fall away, collect what you cut and haul your load back to sell" [1st].
- **Upgrades:** "Increase your truck's carrying capacity, upgrade its wheels, and improve your trolley… Put coins into your saw to raise blade power, add prongs and increase rotation speed" [1st].
- **Visuals:** Spinning saw discs on arms in front of the vehicle, mown stripes, and cut bales stacked into a tall tower on the truck bed [shot].
- **Video frames** [vid] ([video](https://www.youtube.com/watch?v=2P3_wlTQ5Us)):
  - A floating joystick ring at the bottom of the screen.
  - Separate painted parking bays in the yard. Parking in one opens a panel: "Upgrade Saw", "Upgrade Trolley" or "Upgrade Truck".
  - A "SELL" bay.
  - The bale tower grows taller than the vehicle.

**Harvest.io – 3D Farming Arcade** (Azur Games; the iOS seller is "AI Games FZ").
- **Popularity:** Google Play 100M+ downloads, 4.3★, about 216K reviews ([Play](https://play.google.com/store/apps/details?id=com.harvest.io)). iOS 4.5★ from 50K ratings ([App Store](https://apps.apple.com/us/app/id1499321113)). CrazyGames web version: 8.7 rating, 7.7K likes ([CrazyGames](https://www.crazygames.com/game/harvest-io---3d-farming-arcade)).
- **Genre:** A snake-style .io game rather than a tycoon: "Watch the trailer with haystack behind you grow… don't bump into yourself or others" [1st].
- **Rounds:** Rounds are 2 minutes against bots. You need enough of each crop to "unlock the next field" [2nd, [LevelWinner guide, 2020](https://www.levelwinner.com/harvest-io-guide-tips-cheats-tricks-to-become-the-fastest-farmer/)].
- **Visuals** [shot]:
  - Coloured combines tow long chains of carts, each carrying one or two bales or crop crates.
  - The home screen shows crop quotas for unlocking the next field (0/150, 0/140, 0/130, 0/120).
- It matters here because it is the most popular game that shows "trailers chained like a snake".

**Harvest Run! – 3D Farm Race** (KING UP). 100K+ downloads, 3.8★ ([Play](https://play.google.com/store/apps/details?id=com.kingup.harvestrun)).
- **Core loop:** "you will have 60 seconds" to harvest. Harvesters are "upgradeable in the garage". "increase the silos… to store more grain" [1st].
- **Screenshots** [shot]:
  - A chase camera behind a combine with a "30 KM/H" speedometer.
  - Menu upgrades: "Cutting Bar Level 4 (15 rows) 30,000".
  - Workers: "Hire 50,000 cash", "In-game harvest boost Level 1 (+2%) 5,000", "Offline harvest – Productivity Level 1 (300 L/h) 2,000".
  - A silo at "65% 78,411 litres" with a "SELL THE GRAIN" button.

### Related games: same loop, different subject

| Game | Publisher | Downloads / rating | Relevance |
|---|---|---|---|
| [Lawn City: Idle Grass Cutting](https://play.google.com/store/apps/details?id=com.EG.IdleGrassCutting) | Milkyway | 100K+, 3.2★ | Mow, then "sell the grass… Unlock helpers like the trolley to auto-sell grass" [1st] |
| [Idle Mow: Grass Cutting Tycoon](https://play.google.com/store/apps/details?id=com.ldle.mow) | GREENSTAR | 100K+, 4.6★ | Mowers work automatically; idle upgrades [1st] |
| [Mega Harvester: Lumber Factory](https://play.google.com/store/apps/details?id=com.makemake.megaharvester) | Homa | 10M+, 4.3★ | Same loop with trees: cut, collect logs, sell, garage upgrades [1st] |
| [Crush & Collect: Idle Game](https://play.google.com/store/apps/details?id=com.crush.collect.idle.game) / [Farm Crusher](https://apps.apple.com/us/app/-/id6755424304) | Mango Gamez | 100K+, 4.4★ | Upgrades: "Blade size, Character's Speed, Cutting & Vacuum power… Harvest capacity" [1st iOS] |
| [Harvester Adventure](https://play.google.com/store/apps/details?id=harvester.adventure.farm) | PAMPAM TOV | 5K+, 2.2★ | A Harvest.io clone: "The trailer will get longer with each bundle collected" [1st] |
| [Loopy Farm](https://loopyfarm.itch.io/loopy-farm) | loopyfarm (itch.io, HTML5) | 1 rating | Browser game: "Harvesters fill trailers, trailers unload at the silo"; joystick; offline earnings [1st] |
| [Harvest Rush](https://play.google.com/store/apps/details?id=com.harvest.rush) | Solid Games | 1M+, 4.7★ | Production lines, not driving. "Each [crop] with a higher selling price than the last" [1st] |
| [Harvest Loop 3D](https://play.google.com/store/apps/details?id=com.eg.idlecirclefarm) | Milkyway | 10K+, 4.2★ | Idle circular plots with spinning harvesters; "Load trucks… to sell" [1st] |

### The wider genre ("arcade idle") and contrast titles

| Game | Publisher | Downloads / rating | Note |
|---|---|---|---|
| [Farm Land – Farming life game](https://play.google.com/store/apps/details?id=com.loltap.farmland) | Homa | 100M+, 4.5★, 849K reviews | The template for arcade idle: walk with a joystick, harvest, sell, unlock tiles. Homa calls it the open-world example of the genre [2nd, [Homa blog](https://www.homagames.com/blog/arcade-idle-a-new-hybridcasual-genre-enters-the-game)] |
| [Idle Farming Empire](https://play.google.com/store/apps/details?id=com.futureplay.boots) | Futureplay | 10M+, 4.4★ | Classic tap-idle farm; no driving |
| [Idle Farm (Harvest Empire)](https://play.google.com/store/apps/details?id=com.luma.IdleFarm) | BoomBit | 5M+, 4.1★ | Managers and machines; menu idle |
| [Farm Life: Harvest Tycoon](https://play.google.com/store/apps/details?id=com.miniclip.farmrush) | Miniclip | 100K+, 4.4★ | Run around catching produce; "Idle rewards system" |
| [Farming Simulator 23 Mobile](https://play.google.com/store/apps/details?id=com.giantssoftware.fs23.google) | GIANTS | 500K+, 4.3★ | Contrast: "more than 100 authentic machines", AI helpers, production chains. Realistic sim, not arcade |
| [Farming Simulator Kids](https://play.google.com/store/apps/details?id=com.giantssoftware.fskids.google) | GIANTS | 100K+, 4.3★ | Worth a look for tone: "Child-Friendly Presentation", John Deere vehicles, farmers' market minigames |
| [Hay Day](https://play.google.com/store/apps/details?id=com.supercell.hayday) | Supercell | 100M+, 4.4★ | Not this genre (tap plots, timers, orders). Only relevant as the cozy-farm visual benchmark |

**Candidates I checked and could not confirm:**
- I found no game by the exact names "Grass Cut", "Tractor Farming", "Wheat Harvest" or "Trailer Harvest", and nothing matching from Voodoo, SayGames, Supersonic, Lion Studios or Kwalee.
- "Harvest Master" turned up only small titles. Examples: [Harvest Master!](https://play.google.com/store/apps/details?id=com.UurGames.HarvestMaster), 100+ downloads, and the iOS [Harvest Master: Crop Maze](https://apps.apple.com/us/app/id1629618409), which I did not open.
- "Farming Master 3D" did not show up in Play search.
- In this niche, Homa (Farm Land, Mega Harvester) and Azur (Harvest.io) are the big publishers.

---

## 2. How the core loop works

**Controls**
- **Floating joystick:** This is the standard.
  - Harvest.io: "an on-screen button that appears wherever you place your thumb", "the only control scheme in the game" [2nd, LevelWinner].
  - CrazyGames lists "Tap and drag to steer" on mobile and WASD or mouse-drag on desktop [2nd].
  - Floating joystick rings are visible in Mow it and Mow & Haul video frames [vid].
  - Loopy Farm: "on-screen joystick or arrows" [1st].
  - Genre write-ups list "Controls: Joystick" as a core feature of arcade idle [2nd, [Homa 2021](https://www.homagames.com/blog/arcade-idle-a-new-hybridcasual-genre-enters-the-game); [Udonis 2025](https://www.blog.udonis.co/mobile-marketing/mobile-games/arcade-idle)].
- **Auto-forward:** Harvest.io keeps moving like Snake (the timed rounds and constant motion in the frames). Walls are soft: the tractor "will automatically swerve away from walls" [2nd, LevelWinner]. The tycoon-style games (Mow it, Mow & Haul) seem to stop when you let go [vid, inference from the joystick being released in frames while parked].
- **Control complaints:** A Harvest.io player says steering "feels too sensitive, and sometimes it seems to turn in the opposite direction" [Play review]. A Harvest Run reviewer: "Can't even control the machine" [Play review]. Turning relative to the vehicle confuses players. Steering toward where the thumb points avoids that [inference].

**Camera**
- Mostly a high, tilted top-down chase camera with the vehicle in the lower middle of a portrait screen [shot, all of Harvest.io / Mow it / Mow & Haul / Harvest Village]. Homa describes the genre camera as "slightly inclined top-down" [2nd].
- Harvest Run is the exception, with a low third-person camera behind the combine [shot].
- Mow it zooms out to show the whole farm map between levels [vid].

**How cutting looks**
- The crop disappears where the header passes. Behind it is stubble, bare soil or mown stripes [shot: Mow it dirt path, Mow & Haul striped lawn].
- Small chaff or debris particles and exhaust puffs from the machine [shot, vid].
- Mow it uses oversized, saturated grass (yellow, green, white, purple, even a fur-pattern field) to make the swath obvious [shot].
- Harvest Village marketing shows "bales burst out behind you" [1st].

**How cargo looks**
- **Stacked bales or blocks on flatbed trailers:** Harvest Village, round bales on 3 or more trailers. Mow & Haul, a tower of cubes on the truck bed [shot].
- **Chain of carts:** Harvest.io, with one or two bales per cart, growing to 15+ carts. Mow it, 2–3 carts [shot, vid].
- **Fill gauge:** Mow it has a vertical bar on the HUD [shot]. Harvest Village shows a "4/7" counter over the vehicle [shot].
- **Full feedback:** Mow it shows a "CART IS FULL" banner plus a green arrow pointing to the sell point [vid]. Harvest Village says "Trailer space is limited and the cash box fills up fast" [1st].

**Selling**
- **Drive into a painted zone:** "SELL" pads beside the barn in Mow it, and painted bays in Mow & Haul [vid].
- **Unload animation:** Bales fly out of the trailers into the barn, with a floating "+2200" coin popup [vid, Mow it]. Harvest Village describes a "cash box" that fills up, which suggests coins pile up at the farm to be collected [1st, inference on the exact mechanic].
- **Menu selling:** Harvest Run sells from a silo screen ("SELL THE GRAIN") [shot].

**Refill and regrowth**
- Harvest Village: "Crops grow back on their own". Helpers "water your crops so they grow back faster" [1st].
- Farm Land monetises regrowth: a rewarded ad "fully grows all fields" [2nd, Homa].
- Idle Mow is criticised because fields do not respawn: "you have to drive your tractor further and further" [Play review].

**Progression**
- **Unlock new plots or fields with coins.** Harvest Village shows plot prices of 2.5K and 10K on signs [shot]. In Farm Land, each zone "costs more" but "also increases the earnings" [2nd, Homa].
- **New crops are worth more.** Harvest Rush: "each with a higher selling price than the last" [1st]. Harvest Village: "Richer crops slow you down until you're strong enough" [1st]. That is a gate on power stat, not only on money.
- **Level-based:** Mow it has numbered levels ("LEVEL 9") with new grass colours [vid]. Harvest.io unlocks fields through crop quotas [shot].
- **Gate failures:**
  - Farm Crusher and Crush & Collect players got stuck because the next area needed "Level 20" or "Level 50" with no way to earn it [App Store / Play reviews].
  - Harvest.io players report being stuck at level 49 [2nd, LevelWinner comments].

---

## 3. Upgrade systems

**Upgrade lists seen in the games**

| Game | Upgrades (source) |
|---|---|
| Harvest Village | Tractor: Speed, Capacity, Bale Stack, Trailer. Farmer: Worker Speed, Carry Load, Harvest Power, Extra Worker [shot]. Also "wider cutter" and "power" [1st] |
| Mow & Haul | Truck capacity, wheels, trolley capacity and speed, saw blade power, prongs, rotation speed [1st] |
| Mow it | Size, speed, power, plus farm upgrades [1st iOS] |
| Harvest Run | Cutting bar (rows), harvester models, silo size, workers, in-game boost %, offline productivity (L/h) [shot, 1st] |
| Farm Crusher | Blade size, speed, cutting and vacuum power, harvest capacity, new worlds [1st iOS] |
| Lawn City | Mower, truck and construction tools. Helper "trolley to auto-sell", forklift [1st] |

**How you buy upgrades**
- **Stand-on pads in the world.** Harvest Village's "COMBINE" pad with a green up-arrow by the barn [shot]. Mow & Haul's painted bays that open "Upgrade Saw / Trolley / Truck" panels [vid]. Mow it's "SPECIAL OFFER" ground pad [vid].
- **Garage menu:** Harvest Run [shot].
- **Most common pattern:** The pad opens a small card of 3–4 upgrade rows, each with a level and a price button [shot, vid]. I found no game where simply standing on the pad charges you over time.

**Prices visible in screenshots** (marketing screenshots, so possibly staged)
- **Harvest Village:** Speed Lv2 = 800, Capacity Lv3 = 1.2K, Bale Stack Lv1 = 500, Trailer Lv1 = 900. Worker Speed Lv2 = 700, Carry Load Lv3 = 1.1K, Harvest Power Lv1 = 600, Extra Worker Lv1 = 800. Wallet 12.4K. Plot unlocks 2.5K and 10K [shot].
- **Harvest Run:** Cutting bar Lv4 (15 rows) = 30,000. Hire worker = 50,000. Boost Lv1 (+2%) = 5,000. Offline productivity Lv1 (300 L/h) = 2,000 [shot].
- **No published cost curves for these games.** The general idle-game formula is `cost_next = cost_base × rate^owned`. AdVenture Capitalist's Lemonade Stand uses rate = **1.07**, and production grows only linearly with the number owned [2nd, [Kongregate/Pecorella 2016 via Game Developer](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)]. The 1.15 figure often quoted for Cookie Clicker buildings could not be verified: the wiki fetch failed.

**Idle and offline earnings**
- Harvest Village ("keeps earning while you're away"), Loopy Farm ("Welcome Back screen"), Harvest Run (offline L/h upgrade), Farm Life and Idle Mow [1st].
- The genre guides warn that the passive-income rate and its cap need tuning, so players come back without feeling nagged [2nd, [Mind Studios 2024](https://games.themindstudios.com/post/how-to-make-arcade-idle-game/)].

**Helpers**
- Harvest Village: helpers carry bales to the farm and water crops [1st]; an "Extra Worker" upgrade [shot].
- Lawn City: an auto-sell trolley [1st]. Harvest Run: hired workers [shot]. Loopy Farm: automated machines [1st].
- The genre guides say helpers and machines gather resources in the background [2nd, Mind Studios; Udonis].

---

## 4. Monetisation patterns (to drop for an ad-free kids' game)

- **Rewarded video for bonuses:**
  - "watch an ad to revive, watch an ad to collect double" [Harvest.io Play review].
  - A bigger harvester at the start of a round, free crops, and doubling the crops at the end of a round [2nd, LevelWinner].
  - "extra harvest rewards for watching ads" [1st, Harvest.io iOS v1.12–1.13 notes].
- **"Watch an ad to go faster":** Instantly regrow all fields (Farm Land) [2nd, Homa].
- **Interstitials:**
  - On selling ("forced ads almost every single time you sell the grass", Lawn City review).
  - On unlocking a new area (Harvest Rush review).
  - Every 30 seconds (Idle Mow review).
- **"No Ads" IAP:** Harvest.io $3.99 and Mow it $1.99 on iOS [1st]. Reviews in both say ads continue after paying, because rewarded ads remain [reviews].
- **Other offers:**
  - Pad offers placed in the world ("SPECIAL OFFER" pad, Mow it) [vid].
  - Premium currency (Harvest Village shows coins plus green cash notes) [shot].
  - Subscriptions and pets with passive bonuses (Farm Land) [2nd, Homa].
- **The design effect to undo:** Upgrade costs and gates are tuned so that ads fill the gap. Without ads, costs need to come down or rewards go up [inference].

---

## 5. What players say (store reviews; Reddit not reachable)

**Liked**
- "disturbingly addicting" (Harvest.io).
- "colorful, easy to drive and just a lot of fun… satisfying" (Mow it).
- "No ads, offline" praised (Mow it iOS).
- "Super relaxing" (Farm Land).
- People enjoy the steady progress, big colourful fields and the satisfying swathes.

**Complaints**
- **Ads** dominate the reviews:
  - "you spend more time watching than playing" (Harvest Rush).
  - "played for only 10 minutes and watched 20 minutes of Ads" (Lawn City).
  - Ads that "trigger every 30 seconds" (Idle Mow).
  - "forced ads every minute" (Farm Land).
- **Paid "No Ads" that still shows ads** (Harvest.io, Mow it).
- **Repetition:** "after about 5 or 6 levels gets a bit boring". The same reviewer wanted to drive or load the trucks themselves (Harvest Rush). "the only thing that changed was the scenery, no increase in value" (Idle Mow). "Paid for no ads expecting a lot more" (Mow it).
- **Hard walls and dead ends:** Level 20/50 gates that cannot be met (Farm Crusher, Crush & Collect). "maxed out the length of the machine, and now I can't get more apples" (Crush & Collect). Stuck at level 49 (Harvest.io).
- **Travel distance growing because fields don't respawn** (Idle Mow).
- **Lost progress and bugs:** Lawn City lost a save; Mow it crashed "when I have to turn when inside the crop"; reward coins not credited (Mow it, Mega Harvester).
- **Controls:** Too sensitive or turning the wrong way (Harvest.io); no tutorial (Mega Harvester).
- **Round timer:** Harvest.io players asked for time extensions ("cut short by a few seconds").

---

## 6. Design takeaways

**Common mechanics**
1. A floating virtual joystick, appearing wherever the thumb lands. Portrait, high tilted chase camera.
2. Cut by contact: the crop disappears and leaves visibly different ground behind, so progress shows as a swath.
3. Cargo is visible and physical: bales or blocks stack on trailers or the bed, or a chain of carts grows. A counter (n/max) or gauge shows the load.
4. Full-load feedback (banner, arrow home), then drive into a painted sell zone. Cargo flies off, a coin popup appears and the coin counter ticks up.
5. Upgrades are bought at pads in the world (drive into a bay, a small card of 3–4 upgrades opens). Menus are the alternative.
6. Progression by unlocking more land: plots or fields with price signs, and richer crops that need more power or width.
7. Helpers or automation plus offline earnings in the "idle" variants.

**Numbers to start from** (all [inference] unless noted)
- **Upgrade cost:** Use `cost = base × r^level` [sourced formula, Kongregate]. The one sourced rate is 1.07, from a game with hundreds of levels. For a kids' game with about 10–15 levels per stat, r ≈ 1.35–1.5 keeps each purchase meaningful and finishes a stat within a few play sessions. Without ads to fill gaps, err low.
- **Upgrade value:** Make each level a visible, linear step: +1 trailer, +1 m header, +10–15 % speed. Players complain when "the only thing that changed was the scenery".
- **Capacity:** Start with 1 trailer of about 6–8 bales (Harvest Village shows 4/7 at the start [shot]). A full trailer should take about 20–40 s of cutting, and a round trip about 1 minute.
- **Trailers:** Allow 1 to about 4–5 trailers. Harvest.io gets to 15+, but there trailer length is a hazard. For kids, trailers should never be a hazard.
- **Header width:** 3–4 steps (for example 3 → 5 → 7 → 9 m). Harvest Run uses "rows" (Lv4 = 15 rows) [shot].
- **Speed:** Base about 4–6 m/s in world terms, up to about 2× at max. Harvest Run shows 30 km/h ≈ 8 m/s [shot].
- **Crop value:** Each new crop worth roughly 2–3× the last (sourced: "higher selling price than the last"; multiplier is inference). Plot unlock prices about 4× apart (Harvest Village shows 2.5K vs 10K [shot]).
- **Regrowth:** Fields should regrow within the time it takes to do a sell round trip, so there is never a dead field and never a long drive (Idle Mow complaint).

**What to remove or soften for a kids' version** [inference from section 4–5]
- No ads, no timers, no crash or fail states. Harvest.io's snake collision does not suit a friendly game.
- No hard level gates. There must always be a way to earn what the next unlock needs.
- Keep steering forgiving. Use world-relative steering (the vehicle drives where the stick points). This is consistent with the existing Tractor Pickup point-to-go stick decision.

**Open questions for the user**
1. Free-roam tycoon (Harvest Village, Mow it), timed rounds (Harvest Run, Harvest.io), or both (free roam plus optional challenge fields)?
2. Bales stacked on flatbeds, a grain bin with a fill level, or both (combine bin plus grain carts)? Combines really unload grain into carts, and bales come from balers. The kid probably won't care, but it decides the look.
3. Upgrade pads in the world (drive into the shed) or a menu? Pads suit a stick-only kids' game better, with no small buttons.
4. Should helpers or automation exist? They add idle income but take driving away from the player.
5. Offline earnings: keep them (a nice "welcome back") or skip them (no pressure to return)?
6. Persistent progress per device (localStorage) versus short sessions that reset.
7. Should more trailers be pure upside, or slow turning or speed a little (a light trade-off, like Harvest Village's "Richer crops slow you down")?
8. How many crops and fields at launch: 3 crops and 3 fields?
