# ERRATA — The Last Proofreader

## Pitch
The Great Library's final, unfinished book has rebelled against its author. Typos breed in the gutters, smudges crawl across the paper, and a Run-On Sentence that refuses to end is eating whole chapters. You are **Nib**, the last living red-ink fountain-pen nib. You skate across the page correcting everything in sight. Each word you strike out leaves **loose letters** behind. Collect enough and you scribble a **margin note**, an upgrade that rewrites how you edit. Every fifth page ends in a **Boss Edit**. The book has no ending, so after Chapter III comes the **Appendix**, which goes on forever and gets worse.

The theme explains each mechanic: you fire **editing marks** (darts of red ink, commas, asterisks, strikethroughs). Enemies come in waves because each wave is one **page**. XP is **letters**. Upgrades are **margin notes**. The meta currency is **ink**, used to refill your pen between runs.

## Core loop
Title → run (30 s pages; a boss every 5th page) → level-up: pick 1 of 3 margin notes → die or keep going → results screen (ink earned, best page) → **Inkwell** shop for permanent upgrades → new run. A run lasts about 8–15 minutes.

## Controls
- **Phone (portrait):** touch anywhere to place a floating joystick and drag to move. Weapons fire automatically. The pause button is in the top corner, and the game auto-pauses when backgrounded.
- **Desktop:** WASD or arrow keys, or click and drag with the mouse. Esc/P pauses.

## Upgrade system (26 margin notes)
- **Weapons (8, max level 5):** Red Ink Dart (aimed shots), Comma (returning boomerang), Parentheses (orbiting guards), Asterisk (mines), Strikethrough (screen-wide line slashes), Exclamation! (strikes from above with a chain), Highlighter (burning aura), Eraser (knockback shockwave).
- **Passives (9, max level 5):** Thick Nib (+dmg), Caffeine (fire rate/cooldown), Wide Margins (area), Italics (projectile speed and duration), Speed Reading (move speed), Bookmark (max HP and regen), Magnifying Glass (pickup range), Serif (crit), Ibid. (+1 projectile to all weapons).
- **Legendaries (rare, max 1, gold cards):** **ALL CAPS** (×2 damage, ×1.4 size, you take +50% damage), **Ctrl+Z** (revive once at full HP with a screen-clearing blast), **Find & Replace** (12% of kills chain-convert nearby enemies into letters).
- **Evolutions:** a level-5 weapon plus the paired passive turns into an evolution card:
  1. Red Ink Dart + Thick Nib → **Fountain Burst**: darts burst into 6 shards on hit.
  2. Comma + Italics → **Semicolon Storm**: two returning blades that leave ink trails.
  3. Parentheses + Bookmark → **[Square Brackets]**: a bigger orbit that also deletes enemy bullets and heals 1 HP for every 25 hits.
  4. Asterisk + Wide Margins → **Footnote Barrage***: mines split into clusters of 4.
  5. Exclamation + Serif → **Interrobang‽**: guaranteed crits that chain 4 times.
  6. Highlighter + Magnifying Glass → **Neon Highlighter**: double radius, pulls enemies and letters inward.

Example builds: *Ibid. + Dart + ALL CAPS* gives a red bullet hose. *Eraser + Parentheses + Brackets* turns you into a bullet-deleting tank. *Highlighter + Neon + Find & Replace* vacuums up whole pages.

## Enemies (factions of the Unedited)
| Enemy | Behaviour |
|---|---|
| **Typo** ("teh", "recieve"…) | fast, weak swarmers |
| **Smudge** | slow and tanky, splits into 3 Smudgelets |
| **Blot** | keeps its distance and spits ink drops |
| **Dangling Modifier** | winds up, then dashes in a straight line |
| **Widow** | slow, explodes in a ring of bullets on death |
| **Redaction** (elite) | large black bar, charges, drops a chest |
| **Bosses** | **The Run-On Sentence** (page 5: a segmented word-snake), **The Redactor** (page 10: a bullet-pattern block), **Purple Prose** (page 15: a summoner that fires flowery spirals) |

## Endless scaling (the Appendix, page 16 onward)
For page `p`: `hpMult = 1 + 0.18·p + 0.012·p²`, `dmgMult = 1 + 0.06·p`, `spawnRate = base·(1 + 0.09·p)`, enemy cap 450 (any excess is converted into extra HP), and an elite every 3 pages. Each page past 15 adds one random **Mutator** (Bold: +40% HP; Italic: +25% speed; Footnoted: bullets on death; Smeared: ink rain; Double-Spaced: twin spawns). Bosses cycle every 5 pages with ×1.5 HP each time around.

## Meta-progression (saved locally, key `errata-nib.save.v1`)
Ink earned is roughly kills/10 + pages·5 + bosses·25. The **Inkwell** shop sells permanent upgrades (Vitality, Sharp Nib, Quick Hand, Long Reach, Fresh Ink for XP, Second Draft for +1 reroll). The game also tracks best page, best score and total runs. The save is validated and reset to defaults if it is corrupt.

## Art and audio direction
**Inked paper:** a cream ruled notebook page with a red margin line that scrolls with the camera. Enemies are black ink glyphs and blots. The player and all of the player's attacks are **red ink**, pickups are **highlighter yellow**, and rare items are gold. Kills leave persistent ink splats on the page, so the paper records how the fight went. Every sprite is drawn procedurally to canvas and cached, and the type is system serif fonts, so there are no assets to download. Audio is synthesized with WebAudio: pen scratches (filtered noise), paper thumps, typewriter dings on level-up, a bell for legendaries, and a generative lo-fi loop (bass plus a pentatonic typewriter melody) that gets more intense during bosses.

## Tech choices
**TypeScript + Vite + raw Canvas 2D, no engine.** The bundle stays tiny (under 100 KB), nothing loads from a CDN, and I have full control of the hot loop. Entities are pooled objects with a spatial hash for the broad phase, and particles live in a fixed ring buffer. DOM overlays handle crisp UI and large touch targets. **PWA on GitHub Pages:** it's free HTTPS, `gh` is already authenticated, iOS supports Add to Home Screen, and a service worker precaches every built file under a versioned cache (`errata-v<hash>`). The seedable RNG is mulberry32.
