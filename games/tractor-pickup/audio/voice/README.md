# Voice clips for Tractor Pickup

Record one word or phrase per file. Save it here as `<id>.mp3`. Any missing file uses the browser's voice.

Numbers: one two three four five six seven eight nine ten eleven twelve
Animals: pig cow chicken sheep duck bunny dog chick golden
Plurals (the show counts each group): pigs cows chickens ducks bunnies dogs chicks (sheep is the same word)
Phrases:
- lets-find: "Let's find…"
- animals: "…animals!"
- great-job: "Great job!"
- go-to-barn: "Go to the barn!"
- lets-count: "Let's count!"
- hooray: "Hooray!"
- you-did-it: "You did it!"
- plus: "plus" (the show adds the groups: "three plus two makes five")
- makes: "makes"

Tips: a quiet room, phone or headset mic about 15 cm away, a happy voice, a short pause before and after.
Any format your recorder makes can be converted: `ffmpeg -i pig.m4a pig.mp3`. The build trims silence and evens out the volume.
Run `npm run build` after you add files.
