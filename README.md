# SPELLCAM

You are a stick figure on a sheet of paper, and the paper monsters are closing in. Draw shapes in the air with your fingertip to tear them up before they reach you.

Your webcam tracks your hand in the browser (MediaPipe). Pinch your thumb and index finger to start drawing, and release to cast. Each monster carries a queue of symbols on a scrap of paper taped above it. Drawing a symbol strips it from **every** monster whose next symbol matches, so one spell can hit several at once.

Built at HackPrinceton Fall '26 (Entertainment & Media track). The design doc is [`init_plan.md`](init_plan.md).

![gameplay](docs/screenshot.png)

## Run it

```bash
npm install        # also copies the MediaPipe wasm into public/ and fetches the hand model if missing
npm run dev        # http://localhost:5173
```

Click **Enable camera & sound**. The game is played with your hand, so it needs a camera. If the computer has more than one camera, a picker appears on that screen. Camera access works on `localhost` without HTTPS. Adding `?mouse` to the URL skips the start screen in mouse mode.

Everything runs in the browser. There is no backend (versus mode connects the two browsers directly). The hand model (`public/models/hand_landmarker.task`) is committed, and the wasm runtime is copied from `node_modules` on install, so the game never needs a CDN or venue Wi‑Fi. If the local files are missing, it falls back to the CDN automatically.

## Developer pinch lab

Personal dev defaults live in `config/pinch.local.json` (ignored by Git). The dev server reads and validates this file on each page load; refresh after editing it. Copy `config/pinch.local.example.json` if the file is absent. Settings apply to both the lab and dev gameplay; URL parameters override individual values. Use **Save settings as local defaults** in the lab to write current controls to that file. The button reports success or failure; saved defaults load on refresh or a new gameplay page without restarting the server. Unsaved UI edits last until reload. The camera start screen and game title screen both have a development-only **Input lab / settings** button. Production builds ignore the local file and retain the original defaults. The example uses start/end ratios 0.15/0.25, 2D without depth veto, speed assistance range 0.10, one-frame begin/end, thumb-tip anchor, and buffering off. With this exact 0.10 ratio gap, the existing minimum hysteresis gap prevents speed assistance from lowering End below 0.25; assistance can still raise it during motion.

Run `npm run dev` and open **http://localhost:5173/dev/pinch**. This development-only page runs the same hand tracker and casting pipeline without starting the game. Choose timing settings and a cursor anchor, then draw and release to see strokes, provisional recognition, casts, and rejections.

The lab starts the camera and tracker automatically on entry (browser permission still applies), keeps the camera selector, and shows a retry button if startup fails. This does not change camera startup in the main game.

**Require minimum stroke length** and **Require minimum point count** independently enable the original 40-game-pixel and 8-captured-point checks. Both are off in the personal example; at least two points are always required. Template acceptance controls default to 0.76 normally and 0.55 for monster-wanted symbols, with the existing 0.08 margin. They save to the local file and transfer into dev gameplay. Straight-line recognition remains geometric. The game's fading trail uses captured points with circles at joins, while the debug thumbnail resamples to 64 points; the debug panel now labels both counts.

The lab overlays ink and the hand skeleton on a white-tinted camera view. Its drawing box is 20% wider and taller than the original game box, with the same aspect ratio; the gameplay comparison link carries that box along. The sidebar shows thumb/index separation in camera pixels, its hand-size-normalized ratio, the 3D veto, and the distance and time thresholds active for the selected variant. All anchors use the same thumb/index pinch measurement.

The lab has two confirmation parameters, **Begin** and **End**, with a shared units selector (milliseconds or processed camera frames), plus a **Buffered segmentation** toggle. **Start ratio** and **End ratio** are editable and update after calibration or a threshold reset. Lower Start values demand a tighter pinch; lower End values need less finger opening to release. End must be at least 0.10 above Start. Speed assistance modifies the base End value. Start with 30 ms / 80 ms, or try 2 / 3 frames. A frame means a new processed camera observation, not a display refresh. Frame mode has no additional millisecond requirement; time mode has no fixed frame count. Hand-loss grace remains 300 ms and gaps over 200 ms reset the temporal evidence.

- Choose knuckle, index fingertip, thumb tip, or midpoint as the cursor anchor. All use the same thumb/index separation for pinch detection.
- Sample a comfortably closed pinch and a comfortably open pinch, two seconds each. A banner on the video and a panel beside the buttons show countdown, count, tracking availability, and the latest ratio. Completed results show count and p10 / median / p90 normalized distances. Move gently while maintaining each pose to sample across positions. Apply calibration derives bounded close/open thresholds; rejected calibration restores defaults. Calibration applies with buffering on or off and lasts for the page session.
- Buffering keeps 750 ms of history, recovers up to 80 ms of prefix below the open threshold, and permits an opening trend above close + 0.10 with a rise greater than 0.06 per observation to begin release confirmation. The opening still must satisfy End. Finished strokes are cut back to the first release-evidence sample. Tracking loss is separate, and consumed samples cannot cast again. With buffering off, there is no prefix recovery or trend release. Both modes recognize completed strokes; live previews cannot commit. The simple path retains endpoint trimming on sufficiently long strokes; buffered segmentation uses its inferred boundaries instead.
- **Use 3D distances** switches the primary signal to world-space thumb/index distance divided by world-space wrist/middle-knuckle distance. Start/End ratios, confirmation timing, buffering, and speed-assistance controls are shared. Speed assistance still measures selected-anchor image motion in hand lengths/second, so changing the pinch signal does not also change the velocity estimator. The veto is bypassed in 3D mode; missing world landmarks do not fall back to 2D. Calibration samples the selected mode. Switching modes clears pose samples and resets previously calibrated thresholds to defaults; manual thresholds remain. Recalibrate each signal independently. The mode is included in session configuration and gameplay links.
- **Use 3D depth veto** defaults on. Disable it to use the raw 2D pinch ratio alone; the 3D ratio stays visible for comparison. The toggle is carried into development gameplay links and recording configuration.
- Optional **Low-speed release assistance** measures selected-anchor movement in camera pixels, divides by current hand size and elapsed time, and smooths the resulting hand lengths/second over an 80 ms time constant. Its editable **Speed assistance range** (0?0.30, default 0.08) adjusts the base open ratio from minus that range at rest to plus that range at 2 hand lengths/second or faster, clamped to at least start + 0.10 and at most 0.85. No speed estimate means no adjustment. It never changes the start ratio, waives release confirmation, or makes low speed alone a release. The buffered opening-trend rule still operates; fast-motion adjustment also raises its threshold floor. Disable buffering for an isolated comparison of velocity assistance.
- The detection panel keeps the last three gesture results in a fixed-height scrollable log and shows the gate's actual blocker or start-confirmation progress. The displayed raw 2D ratio can be below Start while the effective ratio is raised by the 3D veto, or closing evidence has not lasted long enough. Threshold comparisons are strict; rounding may visually hide small differences.
- Legacy A-F configurations remain internally available for reproducibility via development query parameters. A is the unchanged default in production. The simplified lab uses C internally without buffering and E with buffering. Legacy F additionally scores up to nine nearby endpoint trims using template similarity and pinch support, penalizing changes; F is not enabled by the buffering toggle.
- Record landmarks locally, mark approximate intended boundaries and symbols, then download JSON. Replay the same observations under different settings; smoothing and segmentation are recomputed. No video is recorded or uploaded. Recording is bounded at 18,000 observations.
- **Test these settings in the game** carries timing, buffering, anchor, calibration, and the larger box into a development gameplay session. Production builds omit the lab.

These are experimental parameters, not measured improvements. The lab displays diagnostics; correctness, merge/split rates, and physical release latency still require labeled trials. Imported replay uses the current mirror and drawing box, so keep those fixed across comparisons. Replay adds a missing-hand tail to finish a held final stroke and leaves live tracking paused until **Stop replay**.

`npm test` covers rapid openings, timing gaps, tracking loss, depth veto, calibration rejection, prefix commit prevention, bounded refinement, and duplicate prevention.

## How to play

### Screens

- **Title:** two buttons, **Classic** (singleplayer) and **Duel** (multiplayer), and four icons down the right edge: settings, accessibility, achievements, friends. Every button works with a pinch or a click.
- **Classic:** pick a difficulty and one or more subjects (Shapes, ASL, Math, Korean, Japanese, Chinese), read the three-step "how it works", and press **Start**. With several subjects picked, each wave switches to the next one, and each subject keeps its own lesson order.
- **Duel:** the same subject and difficulty pickers, a mode row (**Casual**: open games or a join code; Ranked isn't built yet), and a spell deck that is still empty before a match. Fire and water are earned during a shapes wave. See [Versus mode](#versus-mode-two-computers).
- **Settings:** separate on/off switches and volume sliders for sound effects and music, mirroring, camera, drawing-area calibration, the ASL trainer, and the debug overlay.
- **Accessibility:** color-blind marker colors (the Okabe–Ito set, with no red next to green), larger cards on the monsters (normal, large, extra large), reduced motion (no screen shake or flashes), and a plain sans-serif font in place of the handwriting. A preview on the screen shows the result, and the choices are saved in the browser.
- **Achievements** shows your best Classic scores (there are no badges yet). **Friends** has no friends list yet and points to Duel.

### Playing

- **Hand:** pinch thumb + index to start inking, move to draw, release to cast. The cursor follows the base knuckle of your index finger, so it stays put while you pinch and release. Both hands can draw at once, so one hand can make a line while the other makes a circle. A line or a closed circle is eased a little toward a clean shape, and the ends of the stroke stay on your hand. A V is left as drawn. Language waves keep the stroke exactly as drawn.
- **Mouse:** works in the menus only (alongside the pinch pointer). Rounds are played with your hand. For testing without a camera, open the page with `?mouse` in the URL and the mouse draws too.
- **Restart:** after a round, pinch and hold (or hold the mouse button, or press Space). Esc goes back to change the difficulty or subjects.
- **Spells:** clearing a shapes wave awards a random stack, such as 3 fire or 1 water. Horns (index and pinky out) casts fire, and an open palm casts water. The spell hits the nearest monster. With `?mouse`, `1` is fire and `2` is water.
- **Symbols:**

  | Name | Symbol |
  |---|---|
  | dash | — |
  | pillar | \| |
  | vee | V |
  | peak | Λ |
  | ring | ◯ |
  | bolt | zigzag (M or W) |

  Any drawing direction works.
- **Waves:** wave 1 uses three symbols, wave 2 adds Λ and ◯, and wave 3 adds the zigzag and multi-symbol monsters.
- **Spells:** clearing a wave in drawing mode, solo or versus, awards a random stack such as 3 fire or 1 water. Hold the horns hand (index and pinky out, like spiderman) to cast fire, or an open palm to cast water. The spell hits the nearest monster. With the mouse, `1` is fire and `2` is water. Hold the pose after you finish a stroke, so opening your hand to stop drawing does not cast.
- **Score:** +100 per symbol removed, +250 per kill. One cast hitting 2 monsters scores ×2, and 3 or more scores ×3. A streak multiplier (+0.5× every 5 hitting casts, up to ×3) resets when you take damage. You get 3 hearts.

### ASL fingerspelling mode

Pick **ASL** as a subject on the Classic or Duel screen. ASL needs the camera, so Start stays disabled until hand input is on.

- Each monster carries a **letter**. Make that letter's ASL handshape and hold it for about half a second to cast it.
- A reference card appears along the bottom for every letter a monster needs right now.
- The line under the wave number shows what the camera thinks you are signing, with a bar that fills as you hold it.
- **Letters:** all 24 static letters (J and Z are movements, so they are left out). Wave 1 uses A B C L Y; wave 2 adds D F I O V W; wave 3 adds E K R S U; wave 4 adds G H M N P Q T X. Monsters move slower than in drawing mode.

**How letters are recognised.** A small neural network (`src/asl/model.json`, 138 KB) reads the 21 hand landmarks. It was trained on [`sid220/asl-now-fingerspelling`](https://huggingface.co/datasets/sid220/asl-now-fingerspelling) (MIT licence): about 1,900 landmark recordings of the alphabet from several people, made with the same MediaPipe hand model this game uses. `scripts/asl/train.py` rebuilds it.

- On a held-out fifth of that dataset it gets 98% right. That number is optimistic, because the same people are in both halves.
- On a second, independent image dataset (not trained on, not shipped) it gets 81% of handshapes right. The weak letters there are K, T, P and N (43–65%); A, B, C, F, I, V, Y are above 94%. That dataset's images are rotated at random, so this check ignores which way the hand points and counts K/P, G/Q and H/U as the same shape.
- It has no "not a letter" answer, so a relaxed hand can read as some letter. Recording your relaxed hand (below) fixes that.

**Teach it your own hand.** Open Settings (the cog on the title screen) and choose **Teach it your own hand**. Pick a letter with the arrow keys, press Space, and hold the letter for about 3 seconds while tilting it slightly. From then on that letter is recognised from your examples instead of the model. The last tile, "rest", records your relaxed hand so it reads as no letter.

Your examples are saved automatically and survive restarts:

- to `data/asl-examples.json` in the repo when running `npm run dev` (commit it to share with teammates; `npm run build` bundles it), and
- to the browser's storage, which is all a deployed static site has.

Backspace forgets the selected letter, and Shift+Backspace forgets everything.

The reference cards are drawn from a real example of each letter in the training data, as the camera saw it. They are rough sketches, hard to read for the closed-fist letters (A, E, M, N, S, T), so keep a real ASL chart nearby.

### Math mode

Pick **Math** on the Classic or Duel screen. The camera is optional.

- Each monster carries a problem. Pinch and draw one digit at a time, then hold your hand still. A bar fills, and the whole number casts. Start another digit before the bar fills to add to the number.
- The same answer hits every monster showing it.
- Wave 1 is addition, wave 2 subtraction, wave 3 multiplication, wave 4 division. Later waves mix all four, use bigger numbers, put more than one problem on a monster, then add two-step questions.

### Korean, Japanese and Chinese

Pick any of the three as a subject. A card is drawn stroke by stroke, and each language only reads strokes as its own marks.

- **Korean:** ㅡ and ㅣ are a flat line and a stick, ㅇ is a circle, and ㄱ and ㄴ are drawn the way they are written (ㄱ across then down, ㄴ down then across). The second lesson is syllables such as 이, 기, 그 and 느.
- **Japanese:** ー is a flat line, の is a circle, り is two sticks, and く and し are their own strokes (く an angle pointing left, し down then a hook up to the right). The second lesson is words such as のり and くし.
- **Chinese:** 一 人 〇 二 十, then 三 and 工, from flat lines, sticks, a peak and a circle.
- A hint at the bottom says how to draw the nearest card, with its sound or meaning.

The game checks the strokes and their order, not where they sit relative to each other, and ㅇ, の and 人 are still simplified to a circle or a peak.

### Versus mode (two computers)

Both players open the game and choose **Duel** on the title screen (Mode stays on **Casual**; Ranked isn't built yet).

- **Host a game**, then choose:
  - **Public game**: listed in Browse games under your name, subjects and difficulty, and also given a four-letter **join code** (shown on the Duel screen) for friends.
  - **Private game**: not listed anywhere; only someone with its join code can join.
- **Browse games** opens a panel with your name, the list of **open games** (click **Join** on one), **Quick match** (joins the open game most like yours; it never hosts), and **Have a code?**, where you type a friend's join code and press **Join**.

Once connected, both press **Ready** (or Space). The round begins when both are ready.

- Each player has their own arena. Killing monsters sends extra monsters to your opponent: every two kills sends one, and multi-hits send more.
- The opponent's hearts, score and wave are shown under your hearts. Whoever runs out of hearts first loses.
- Both play the same subjects and difficulty. The host picks them on the Duel screen, and the guest's screen follows.
- Pressing Esc mid-round gives up the round. If the connection drops, the other player has 5 seconds to come back before it counts as a forfeit.
- After a round, hold to return to the Duel screen and ready up again for a rematch.

The two browsers talk directly to each other (WebRTC) and find each other through PeerJS's free public broker, so both need internet access, and some networks (often venue or campus Wi-Fi) block this kind of connection. A phone hotspot is the usual workaround. There is no cheat protection: each game reports its own results. Without a server, the lobby works by giving public games a fixed set of 12 broker ids: hosting claims a free one (plus a second id for its join code), and the lobby lists games by briefly connecting to each id and asking who's there. So at most 12 games can be hosted at once.

### Hotkeys

| Key | Action |
|---|---|
| `C` / `V` | on the title screen: open Classic / Duel |
| `1` `2` `3` | on the Classic and Duel screens: easy / medium / hard |
| `Space` | Classic: start. Duel: ready |
| `D` | debug overlay: camera preview with hand skeleton and drawing box, pinch ratio, FPS, last recognition + score, resampled stroke |
| `K` | calibrate the drawing area: sweep your pinch over a comfortable area for 4 s |
| `C` | next camera (laptop ↔ external webcam); on the title screen use Settings instead |
| `F` | toggle mirroring |
| `G` | **demo run**: seeded RNG, slightly slower monsters, and an opening that sets up a multi-hit |
| `T` | template recorder on/off (`1`–`6` pick the symbol, `E` exports `templates.json`) |
| `1` / `2` | during a shapes wave: cast a fire or water spell, if you have one |
| `N` | mute everything (sound effects and music); press again to bring both back |
| `Esc` | back one screen |

## Recording real templates (do this before the demo)

The recognizer ships with synthetic templates for every symbol in both directions, so it works out of the box. Real strokes from real hands make it better:

1. Press `M` for hand mode, then `T` to start recording.
2. Press `1`–`6` to choose a symbol (dash, pillar, vee, peak, ring, bolt), then draw it 5+ times, in both directions. Strokes are saved to `localStorage` immediately and used right away.
3. Get 2–3 other people to add a few each.
4. Press `E` to download `templates.json`, replace `src/input/templates.json` with it, and commit.

Lines (dash and pillar) are classified by angle before template matching, so recording them is optional.

## Tests

```bash
npm test           # vitest: recognizer accuracy, One Euro filter, pinch hysteresis/debounce, stroke detector
npm run typecheck
npm run build      # static site in dist/
```

The recognizer tests draw 12 jittered strokes per base shape and direction (random size, position, rotation ±10°, vertex and point noise). They require ≥ 90% accuracy per symbol, zero confusions between `—`/`|` and `V`/`Λ`, and that ≥ 70% of random scribbles fizzle.

## Deploy

`npm run build` produces a static `dist/` that any static host (GitHub Pages, Vercel, Netlify) can serve; there is no automatic deploy. Camera access needs **HTTPS** when deployed, which all three provide. For the live demo, run from `localhost` with the local model file.

## Code map

```
src/
  main.ts                 boot: start screen (camera + audio unlock) → Phaser; global hotkeys
  config.ts               every tunable: pinch thresholds, One Euro, drawing box, recognizer, waves, scoring
  state.ts                shared app state (mode, tracker status, last recognition…)
  actions.ts              what the settings screen and the hotkeys both do
  a11y.ts                 accessibility settings (color-blind colors, card size, reduced motion, plain font)
  asl/
    features.ts           landmarks → the 63 numbers the classifier reads (position, size and mirror removed)
    hand.ts               trained model + your recorded examples → letter; hold-to-cast
    model.json            the trained network and one typical example per letter (built by scripts/asl/train.py)
    examples.ts           loading and saving your recorded examples
  net/
    pvp.ts                versus mode: PeerJS connection, messages, ready-up, drop detection and forfeit
    lobby.ts              the host / join panel
  input/
    events.ts             the input → game event bus (InputEvent)
    mouseAdapter.ts       the mouse as a menu pointer (and, with ?mouse, a full stand-in for the hand)
    camera.ts             getUserMedia, camera switching, mirroring
    handTracker.ts        MediaPipe loop (GPU → CPU fallback), two hands, pinch → cursor → strokes, calibration
    hands.ts              which detected hand is the left one and which is the right one
    smooth.ts             a light ease of lines and closed circles; a V is left alone
    oneEuro.ts            One Euro filter
    strokeDetector.ts     pinch hysteresis + debounce, stroke start/points/end, end trimming
    recognizer.ts         orientation-sensitive $1 + straight-line special case
    shapes.ts             ideal symbol shapes + jittered synthetic templates
    castPipeline.ts       strokeEnd → recognize → symbol / fizzle; template recorder
    templates.json        recorded human templates (bundled)
    debugOverlay.ts       D overlay
  game/
    scenes/               Boot (procedural art), Title, Classic, Duel, Panel (friends / achievements / settings), Arena, GameOver, AslTrainer
    subjects.ts           the six subjects, combining them, which one a wave uses, best-score keys
    icons.ts              pencil-drawn button icons
    entities/             Player, Monster, SymbolBubble
    systems/              Spawner, Casting (trail + spells), Hud, Fx, HoldToStart, Menu (pinch-or-click buttons), pickers (difficulty + subjects)
    spells.ts             fire and water: wave rewards and the horns / open-palm gestures
    sfx.ts                procedural Web Audio sound effects, the looping background music (public/audio/bg_music.mp3), and their volume settings
```

## Decisions and known gaps

- **Not yet verified on a real hand.** The build machine had no webcam in the loop. The MediaPipe model loads locally on the GPU delegate in ~150 ms, and the whole game was play-tested with simulated mouse strokes. But pinch thresholds (`INPUT.pinchOn` 0.28 / `pinchOff` 0.5, a 3D veto at `pinch3dMax` 0.5, plus a 180 ms release grace period), One Euro parameters (`minCutoff` 1.0, `beta` 0.01) and the default drawing box all need tuning on a real webcam. Use `D` to see the live pinch ratio.
- **The cursor follows the index-finger base knuckle** (`INPUT.cursorAnchor: "knuckle"`), which does not move when the fingers pinch or open. Set it to `"pinch"` for the thumb–index midpoint instead. A release has to last 180 ms (300 ms if the hand is lost) before a stroke ends, and the stroke is cut back to where the release began. The first and last 3 points of each hand stroke are also trimmed.
- **Symbols a monster currently needs are matched first, with a lower bar** (score ≥ 0.55 and within 0.08 of the best match overall, against 0.76 otherwise). A slanted line counts as a dash or pillar when only one of the two is needed.
- **The recognizer is \$1 without rotation invariance.** It searches only ±25° of rotation, so `|` ≠ `—` and `V` ≠ `Λ`. Circles have templates at 8 start angles × 2 directions. Zigzag accepts 3- and 4-segment zigzags (M, W, N-like) in both directions.
- **Art and sound are procedural** (canvas drawing and Web Audio oscillators). Everything is paper and pencil: a plain folded sheet for the arena, wobbly double-stroked pencil lines, cut-out monsters (a crumpled ball, a torn notebook page, a sticky note), marker symbols and handwriting fonts (the macOS ones, with bundled Patrick Hand and Permanent Marker as the fallback elsewhere). Colors live in `src/game/palette.ts` and the drawings in `src/game/scenes/Boot.ts`. There are no third-party assets. Textures are drawn once and registered as images, so they survive a WebGL context loss.
- **The webcam feed sits faintly behind the whole arena** (greyscale, under a mostly opaque sheet of paper, so it reads as a faint pencil sketch), with a full preview in the debug overlay.
- **All tunables are in a single `src/config.ts`**, instead of separate input and game config files.
- **Out of scope for now:** mana, pose modifiers, combos, PvP, learning modes, and the leaderboard (see `init_plan.md` §9).
