# ERRATA — The Last Proofreader

You are **Nib**, the last red-ink fountain pen in a book whose words have rebelled. Fight typos, smudges, ink blots and the Run-On Sentence. It's a one-thumb roguelike for phones (in the style of Archero / Survivor.io / Vampire Survivors) that runs fully offline.

**Play / install:** https://elrick97.github.io/errata-nib/

## How to install on my phone before the flight (iPhone, iOS Safari)
1. Connect to Wi-Fi and open **Safari** (it has to be Safari, not Chrome) at **https://elrick97.github.io/errata-nib/**.
2. Wait until the title screen ("ERRATA" with a red strikethrough) appears. Keep the page open for about 5 seconds so it can save itself for offline use.
3. Tap the **Share** button (the square with an up arrow) at the bottom of Safari.
4. Scroll down and tap **Add to Home Screen**. The name should read **ERRATA**. Tap **Add**.
5. Close Safari and launch **ERRATA** from your home screen. It opens full-screen with no browser bar. Tap **Begin Editing** once so the game is primed.

On Android/Chrome, open the URL, then use the ⋮ menu and choose **Install app** (or **Add to Home screen**).

## How to verify it works in airplane mode before leaving home
1. Do the install steps above and launch the game from the home-screen icon at least once while online.
2. Swipe the app away completely in the app switcher.
3. Turn on **Airplane Mode** and make sure Wi-Fi is off too.
4. Launch **ERRATA** from the home screen. The title screen should appear, and **Begin Editing** should start a run.
5. Play for about 30 seconds and pause. If that works, you're set for the flight.
   - **No sound?** The iPhone's silent switch mutes web audio. Flip the ringer on to hear the music and SFX.
   - If it fails offline, reconnect, open the app once more, wait 10 seconds, and try again.

## Controls
| | Phone | Desktop |
|---|---|---|
| Move | Touch and drag anywhere (floating joystick) | WASD / arrow keys, or click and drag |
| Attack | Automatic | Automatic |
| Pick upgrade | Tap a card | Click a card |
| Pause | ❚❚ button, top right (the game also auto-pauses when you leave the app) | Esc / P |

Your progress (ink, shop upgrades, best page) is saved on the device under the key `errata-nib.save.v1`.

## Laptop fallback (offline)
Open the URL in Chrome or Edge once while online. After that it works offline in the browser, or you can choose **Install** from the address bar. To run it from the source instead: `npm install`, `npm run build`, then `npm run preview` and open http://localhost:4173.

## Develop and redeploy
```powershell
npm install
npm run dev
```
```powershell
npm run deploy
```
`npm run deploy` type-checks, builds, generates `dist/sw.js` (a versioned precache of every file, cache name `errata-nib-<hash>`), and force-pushes `dist/` to the `gh-pages` branch of `elrick97/errata-nib`. It needs the `gh` CLI to be authenticated. A new build changes the cache version, so installed copies update the next time they're opened online. Close the app and open it again to pick up the update.

## Project layout
- `src/types.ts`: shared contracts
- `src/game.ts`: state machine and main loop
- `src/game/*`: simulation (enemies, director, weapons, upgrades, player, pickups, fx, render)
- `src/core/*`: rng, pool, spatial hash, input, audio synth, save, platform, SW registration
- `src/ui/*`: DOM screens and HUD
- `scripts/`: icon generator, service-worker generator, deploy

See `DESIGN.md` for the game design.
