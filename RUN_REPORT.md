# Run Report

## Environment
- Agent/IDE: Claude Code (Claude desktop app, Code tab, Windows 11)
- Orchestrator model: Claude Opus 5.5 (claude-opus-5-5)
- Sub-agent model(s): Claude Sonnet (5 agents), Claude Haiku (2 agents)
- Stack chosen: TypeScript + Vite 5 + raw Canvas 2D (no engine), DOM overlay UI, WebAudio synth
- Delivery method: PWA on GitHub Pages (https://elrick97.github.io/errata-nib/), service worker precache
- Start time / end time (with timezone): 2026-11-24 16:10 WEST / 2026-11-24 16:36 WEST
- Wall-clock duration: 00:26

## Metrics
| Metric | Value |
|---|---|
| Orchestrator turns/invocations | 6 (1 user prompt + 5 background-agent notification wake-ups) |
| Sub-agents spawned (total) | 7 |
| Sub-agents by model | sonnet: 5, haiku: 2 |
| Sub-agent tasks passed verification first try | 5 |
| Sub-agent tasks sent back for rework | 2 (ui: pause-screen class collision; pwa: offline cache miss) |
| Escalations to a stronger model | 0 |
| Tool calls (total, approx.) | ~165 (orchestrator ~65, sub-agents 98) |
| Tokens used (orchestrator / sub-agents / total) | unknown / ~949k / unknown |
| Build errors encountered | 0 |
| Runtime errors encountered | 3 |
| Errors fixed / still open | 3 / 0 |
| Inconveniences (friction, not blocking) | 4 |
| Blockers (work stopped until resolved) | 0 |
| Workarounds applied | 4 |
| Times human input would have been needed | 0 |
| Files created | 41 (tracked in git) |
| Lines of code (approx.) | 6,400 (src + scripts + html/css) |
| Upgrades / enemy types / bosses shipped | 26 (8 weapons, 9 passives, 3 legendaries, 6 evolutions) + heal / 7 (typo, smudge, smudgelet, blot, dangler, widow, redaction elite) / 3 |
| Offline test passed (Y/N) | Y |
| Deployed by agent (Y/N) | Y |
| Measured FPS at phone viewport (approx.) | 30 (the preview pane caps rAF at 30); measured frame cost p95 1.7 ms / max 3.2 ms with 480 enemies + 233 enemy bullets, so there is headroom for 60 on device (not measured on a real phone) |

## Blockers (one line each: what happened → how resolved)
- None.

## Workarounds (one line each)
- No Python on the machine → used sed and the Edit tool for the integration patch.
- The enemies and weapons sub-agents both used the `enemy.c` scratch field → the orchestrator moved the paren hit-cooldown to per-id typed arrays in weapons.ts.
- Offline test without DevTools network throttling → stopped the local preview server to physically cut the origin, then reloaded.
- Lighthouse not run (Lighthouse 12+ removed the PWA category) → checked installability manually on the deployed URL: HTTPS, an active controlling SW, a manifest with name/short_name/start_url/scope/display standalone, 192/512/maskable icons, 0 cross-origin requests.

## Notable errors (top 5, one line each)
- Offline reload served the HTML shell but JS/CSS failed: `crossorigin` requests plus `Vary: Origin` made `cache.match` miss → fixed with `ignoreVary` and plain-URL keys.
- The pause screen collapsed into a 48 px column because the screen class `pause` collided with the HUD pause-button CSS → renamed.
- Weapons and enemy AI shared the `enemy.c` scratch field, which would have corrupted blot/dangler timers when Parentheses hit them → separated.
- The boss name overlapped the boss HP bar and the page label duplicated the boss name → HUD layout fixed.
- A stress-test run died because my debug HP override was reset by `recomputeStats` (test-harness issue, not a game bug); it also confirmed that the death → results → save flow works.

## Self-assessment (1–5): game feel, visual identity, performance, offline reliability, code quality
- Game feel: 4. Hit flash, damage numbers, splats, rings, shake, hitstop, slow-mo level-ups and evolution/legendary flashes are all in. Balance is only lightly tuned.
- Visual identity: 4. The inked notebook page, misspelled-word enemies with spell-check squiggles, and the Run-On Sentence snake are distinctive.
- Performance: 4. Pooled, spatial-hashed and sprite-cached, with low frame cost on desktop. Not measured on a real phone.
- Offline reliability: 4. Verified locally with the server down and verified the deployed precache. Not verified on a physical iPhone in airplane mode.
- Code quality: 4. Typed contracts, data-driven defs, module ownership. Some sub-agent files are large.

## One-paragraph retrospective: what you'd do differently
Writing the contracts (types, pool, stubs with exact signatures, and the main loop) before fanning out to seven parallel agents paid off: every agent came back type-clean and integration took minutes. Two things slipped through. First, I gave "scratch fields" to two owners without assigning which fields belonged to whom, so the next time I'd give each module explicit field ownership, or per-module side arrays, in the contract. Second, the service worker was only checked structurally by its author, so I'd make "load, kill the server, reload" part of the PWA agent's own acceptance criteria. I would also spend some budget on a dedicated balance pass with a scripted bot (time to level 5, boss time-to-kill per page) and on real-device profiling. The preview pane's 30 fps cap meant I could only measure per-frame cost, not true phone FPS.
