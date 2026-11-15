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

Everything runs in the browser. There is no backend (versus mode connects the two browsers directly). The gesture-and-landmark model (`public/models/gesture_recognizer.task`) is stored locally, and the wasm runtime is copied from `node_modules` on install, so the game never needs a CDN or venue Wi‑Fi. If the local files are missing, it falls back to the CDN automatically.

## Developer pinch lab

Shared defaults live in the tracked `config/pinch.defaults.json`, used in development and production. These snapshot the current saved tuning: start/end 0.15/0.25, two-frame begin/end confirmation, thumb-tip tracking, 2D distances, depth veto off, buffering off, and speed assistance on with range 0.10. Personal development overrides live in `config/pinch.local.json` (ignored by Git); copy `config/pinch.local.example.json` if absent. The dev server validates and loads overrides on each page load. URL parameters override individual values. **Save settings as local defaults** in the lab writes the personal override, not the shared baseline; refresh gameplay to load saved changes. Edit the tracked defaults file to change the baseline for everyone. Unsaved controls last until reload. The camera and title screens have a development-only **Input lab / settings** button. Production ignores personal overrides. Configs use `buffered: false` or `true`; existing `variant` values migrate automatically and are removed on save.

Run `npm run dev` and open **http://localhost:5173/dev/pinch**. This development-only page runs the same hand tracker and casting pipeline without starting the game. Choose timing settings and a cursor anchor, then draw and release to see strokes, provisional recognition, casts, and rejections.

The lab starts the camera and tracker automatically on entry (browser permission still applies), keeps the camera selector, and shows a retry button if startup fails. This does not change camera startup in the main game.

**Require minimum stroke length** and **Require minimum point count** independently enable the original 40-game-pixel and 8-captured-point checks. Length checking is on and point-count checking is off in the shared defaults; at least two points are always required. Template acceptance controls default to 0.76 normally and 0.55 for monster-wanted symbols, with the existing 0.08 margin. They save to the local file and transfer into dev gameplay. Straight-line recognition remains geometric. The game's fading trail uses captured points with circles at joins, while the debug thumbnail resamples to 64 points; the debug panel now labels both counts.

The lab overlays ink and the hand skeleton on a white-tinted camera view. Its drawing box is 20% wider and taller than the original game box, with the same aspect ratio; the gameplay comparison link carries that box along. The sidebar shows thumb/index separation in camera pixels, its hand-size-normalized ratio, the 3D veto, and the distance and time thresholds active for the current settings. All anchors use the same thumb/index pinch measurement.

**Line recognition** controls expose minimum straightness (default 0.30), maximum thinness (0.20), normal angle tolerance (35 degrees), and wanted-line angle tolerance (55 degrees). Lower straightness or higher thinness permits more hooked lines; too much tolerance can turn bent symbols into lines. The detection sidebar shows the previous stroke's measured values and which line checks pass or fail, even after changing these controls. All four values save to the local defaults file and transfer through the gameplay link. If both horizontal and vertical lines are wanted, the angle boundary remains 45 degrees.

**Minimum hysteresis gap** (default 0.08, range 0.01 to 0.30) controls the minimum separation between pinch Start and End and the lowest End ratio allowed by speed assistance. The actual hysteresis band is End minus Start. Reducing the minimum alone keeps the chosen base End ratio; lower End directly to narrow the band, or enable speed assistance. Increasing the minimum adjusts the ratios if needed to keep them valid. Calibration, saving, and gameplay links respect the selected minimum.

The lab has two confirmation parameters, **Begin** and **End**, with a shared units selector (milliseconds or processed camera frames), plus a **Buffered segmentation** toggle. **Start ratio** and **End ratio** are editable and update after calibration or a threshold reset. Lower Start values demand a tighter pinch; lower End values need less finger opening to release. End must be at least the selected minimum hysteresis gap above Start. Speed assistance modifies the base End value. Start with 30 ms / 80 ms, or try 2 / 3 frames. A frame means a new processed camera observation, not a display refresh. Frame mode has no additional millisecond requirement; time mode has no fixed frame count. Hand-loss grace remains 300 ms and gaps over 200 ms reset the temporal evidence.

- Choose knuckle, index fingertip, thumb tip, or midpoint as the cursor anchor. All use the same thumb/index separation for pinch detection.
- Sample a comfortably closed pinch and a comfortably open pinch, two seconds each. A banner on the video and a panel beside the buttons show countdown, count, tracking availability, and the latest ratio. Completed results show count and p10 / median / p90 normalized distances. Move gently while maintaining each pose to sample across positions. Apply calibration derives bounded close/open thresholds; rejected calibration restores defaults. Calibration applies with buffering on or off and lasts for the page session.
- Buffering keeps 750 ms of history, recovers up to 80 ms of prefix below the open threshold, and permits an opening trend above close + 0.10 with a rise greater than 0.06 per observation to begin release confirmation. The opening still must satisfy End. Finished strokes are cut back to the first release-evidence sample. Tracking loss is separate, and consumed samples cannot cast again. With buffering off, there is no prefix recovery or trend release. Both modes recognize completed strokes; live previews cannot commit. The simple path retains endpoint trimming on sufficiently long strokes; buffered segmentation uses its inferred boundaries instead.
- **Use 3D distances** switches the primary signal to world-space thumb/index distance divided by world-space wrist/middle-knuckle distance. Start/End ratios, confirmation timing, buffering, and speed-assistance controls are shared. Speed assistance still measures selected-anchor image motion in hand lengths/second, so changing the pinch signal does not also change the velocity estimator. The veto is bypassed in 3D mode; missing world landmarks do not fall back to 2D. Calibration samples the selected mode. Switching modes clears pose samples and resets previously calibrated thresholds to defaults; manual thresholds remain. Recalibrate each signal independently. The mode is included in session configuration and gameplay links.
- **Use 3D depth veto** defaults off. Disable it to use the raw 2D pinch ratio alone; the 3D ratio stays visible for comparison. The toggle is carried into development gameplay links and recording configuration.
- Optional **Low-speed release assistance** measures selected-anchor movement in camera pixels, divides by current hand size and elapsed time, and smooths the resulting hand lengths/second over an 80 ms time constant. Its editable **Speed assistance range** (0?0.30, default 0.10) adjusts the base open ratio from minus that range at rest to plus that range at 2 hand lengths/second or faster, clamped to at least start + the selected minimum hysteresis gap and at most 0.85. No speed estimate means no adjustment. It never changes the start ratio, waives release confirmation, or makes low speed alone a release. The buffered opening-trend rule still operates; fast-motion adjustment also raises its threshold floor. Disable buffering for an isolated comparison of velocity assistance.
- The detection panel keeps the last three gesture results in a fixed-height scrollable log and shows the gate's actual blocker or start-confirmation progress. The displayed raw 2D ratio can be below Start while the effective ratio is raised by the 3D veto, or closing evidence has not lasted long enough. Threshold comparisons are strict; rounding may visually hide small differences.
- There is one pinch detector with an optional `buffered` boolean; no A-F algorithm selection remains. Older saved configs and development links migrate C (and A/B/D) to buffering off, E/F to buffering on. Saving writes only the new format. The old F endpoint-scoring heuristic has been removed.
- Record landmarks locally, mark approximate intended boundaries and symbols, then download JSON. Replay the same observations under different settings; smoothing and segmentation are recomputed. No video is recorded or uploaded. Recording is bounded at 18,000 observations.
- **Test these settings in the game** carries timing, buffering, anchor, calibration, and the larger box into a development gameplay session. Production builds omit the lab.

These are experimental parameters, not measured improvements. The lab displays diagnostics; correctness, merge/split rates, and physical release latency still require labeled trials. Imported replay uses the current mirror and drawing box, so keep those fixed across comparisons. Replay adds a missing-hand tail to finish a held final stroke and leaves live tracking paused until **Stop replay**.

`npm test` covers rapid openings, timing gaps, tracking loss, depth veto, calibration rejection, prefix commit prevention, bounded refinement, and duplicate prevention.

## How to play

### Screens

- **Title:** two buttons, **Classic** (singleplayer) and **Duel** (multiplayer), and four icons down the right edge: settings, accessibility, achievements, friends. Every button works with a pinch or a click.
- **Classic:** pick a difficulty and one or more subjects (Shapes, ASL, Math, Korean, Japanese, Chinese), read the three-step "how it works", and press **Start**. With several subjects picked, each wave switches to the next one, and each subject keeps its own lesson order.
- **Duel:** the same subject and difficulty pickers, a mode row (**Casual**: open games or a join code; Ranked isn't built yet), and the spell deck, where each player picks their own two spells.
- **Settings:** separate on/off switches and volume sliders for sound effects and music, mirroring, camera, drawing-area calibration, the ASL trainer, and the debug overlay.
- **Accessibility:** color-blind marker colors (the Okabe–Ito set, with no red next to green), larger cards on the monsters (normal, large, extra large), reduced motion (no screen shake or flashes), and a plain sans-serif font in place of the handwriting. A preview on the screen shows the result, and the choices are saved in the browser.
- **Achievements** shows your best Classic scores (there are no badges yet). **Friends** has no friends list yet and points to Duel.

### Playing

- **Hand:** pinch thumb + index to start inking, move to draw, release to cast. The cursor follows the base knuckle of your index finger, so it stays put while you pinch and release. Both hands can draw at once, so one hand can make a line while the other makes a circle. A line or a closed circle is eased a little toward a clean shape, and the ends of the stroke stay on your hand. A V is left as drawn. Language waves keep the stroke exactly as drawn.
- **Mouse:** works in the menus only (alongside the pinch pointer). Rounds are played with your hand. For testing without a camera, open the page with `?mouse` in the URL and the mouse draws too.
- **Restart:** after a round, pinch and hold (or hold the mouse button, or press Space). Esc goes back to change the difficulty or subjects.
- **Mana and spells:** Duel always has spells; in Classic, turn on **Spells** at the top right of setup and pick two. Mana starts at 40 of 100. Clearing a symbol adds 6, a kill adds 8 more, and clearing a wave adds 20. Both modes use the current subject's fixed sign sequence (see below), including ASL and math. Hold thumbs up to start. In Duel, casting slows only your own arena; your opponent continues playing normally. Changing the host's subjects or difficulty clears both Ready states. Readiness is tied to that setup revision, so both players must confirm the new settings.

  | Spell | Mana | What it does |
  |---|---|---|
  | Fire | 30 | burns the nearest monster |
  | Wave | 35 | washes every monster back toward the edge |
  | Freeze | 40 | slows every monster to about a third of its speed for 7 seconds |
  | Shield | 45 | blocks the next monster that reaches you (lasts 15 seconds) |
  | Bomb | 60 | destroys every monster near you |
  | Heal | 70 | gives one heart back |
- **Bosses:** every third wave a boss comes with the wave: a bigger, slower monster carrying a long row. In shapes it is 6 to 8 symbols, in math four problems, in ASL a word to fingerspell (CLAY, WORLD, MONSTER…), and in Korean, Japanese and Chinese a word to write (그이, のりのり, 工人…). Fire and Bomb tear three cards off a boss instead of destroying it. A boss is worth four times the kill score.
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
- **Spells:** duels always have mana and spells. Each player brings their own two. Bosses come every third wave, as in Classic.
- **Score:** +100 per symbol removed, +250 per kill. One cast hitting 2 monsters scores ×2, and 3 or more scores ×3. A streak multiplier (+0.5× every 5 hitting casts, up to ×3) resets when you take damage. You get 3 hearts.

### Classic spell sequences

Spell damage removes queued symbol cards, equally for ordinary enemies and bosses. Fire deals 1 damage to every live enemy. Bomb deals 5 damage within a 500-pixel radius (twice the old radius). Wave pushes up to 460 pixels, bounded by arena edges, and slows enemies to 35% movement speed for 4 seconds. Freeze stops enemy movement for 7 seconds and takes priority over Wave's slow. Shield has no expiration and blocks the next enemy hit; Heal restores one heart. Effect durations follow world time, including casting slow motion.

With Spells enabled, hold **thumbs up** at or above the confidence threshold for the configured hold time to enter casting mode. Defaults are **0.50 confidence for 250 ms**. It starts as soon as the hold completes; no release is required. The next character selects the spell from its unique first character, then you finish that recipe. The HUD stacks both spells vertically on the right, showing only their icons, names, and mana costs. Setup shows the recipes. While casting, monsters, spawning, world timers, and tweens run at **12% speed**, while hand recognition and input deadlines stay in real time.

Complete the characters in order within **4 seconds per sign** and **14 seconds total**, starting from thumbs-up hold completion. The overlay contains only “Casting [name]” and characters: completed characters are gray, the current character is red, and upcoming characters are black. Before choosing a spell it shows the affordable options. ASL also shows the next letters' reference cards. Spell signs do not hit monsters as normal attacks. Finishing spends the spell's full mana cost and applies its existing effect. A wrong/unrecognized sign, timeout, or Esc cancellation costs **25% of the spell's mana cost, rounded up**, and restores normal time. Before selection the first affordable slot determines the penalty. Completion without a valid target also costs the partial penalty. After resolution, a 750 ms cooldown prevents immediate repeated spell starts. Esc during casting cancels it; a later Esc leaves the round.

The tracker uses MediaPipe's pretrained `GestureRecognizer` instead of running a separate hand tracker and gesture task. It returns both landmarks and `Thumb_Up` scores in the same pipeline, with GPU preference and CPU fallback. The model is stored at `public/models/gesture_recognizer.task`; `npm install` / `npm run fetch-model` fetches it when missing. No retraining is required.

While waiting to start a spell, qualifying thumbs-up input takes priority over pinch drawing and ASL during hold confirmation. The original thumbs-up hold remains reserved after activation until release, preventing it from being emitted as an ASL letter. After that release, later thumbs-up classifications cannot interrupt the active spell sequence. An unfinished stroke is discarded and ASL hold progress is reset. There is no ASL-confidence veto. Confidence dips lasting at most 120 ms pause the hold timer rather than resetting it; low-confidence time does not advance confirmation, and activation requires a qualifying frame. Longer dips reset confirmation and rearm the gesture. One continuous hold produces only one activation; lower the hand or leave the gesture to rearm for the next activation. Each hand has its own hold evidence. Tracking gaps reset pending time, without making an already-fired hold repeat.

The input lab shows live thumbs-up score, hold progress, and `GESTURE` detections. **Thumbs-up confidence threshold** and **Thumbs-up hold time** are editable, saved by the local-defaults button, and carried into the development gameplay link. New recordings retain the gesture score for replay; older recordings without scores cannot replay thumbs-up detection. Thumbs up is the only spell starter; the former infinity detector has been removed.

| Spell | ASL sequence | Korean sequence |
|---|---|---|
| Fire | F → I → R → E | ㄱ → ㄴ → ㅡ |
| Wave | W → A → V → E | ㅇ → ㅣ → ㅅ |
| Bomb | B → O → M → B | ㄴ → ㅡ → ㄱ |
| Freeze | I → C → E | ㅣ → ㅅ → ㅇ |
| Shield | S → A → F → E | ㅡ → ㄱ → ㄴ |
| Heal | H → E → A → L | ㅅ → ㅇ → ㅣ |

Hold thumbs up before any recipe in the table. Korean uses drawn Hangul jamo, not Korean Sign Language. Shapes use drawn symbol sequences, math uses digits, and Japanese/Chinese use recognized script marks. For alphabets with fewer than six available marks, the two equipped spells are assigned distinct initial characters deterministically for that deck; recipes stay fixed throughout the round. Subject changes select that subject's recipes. Outside gesture confirmation and casting, alphabet signs retain their normal attack behavior. These timings are initial gameplay tuning values in `src/game/spellCasting.ts`.

Recognition tests cover both the historical reference geometry and the shipped defaults. The shared defaults deliberately allow endpoint hooks; the deterministic scribble rejection budget is 65%, compared with 70% for the stricter reference geometry. These synthetic checks do not replace real-hand testing.

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

- **Korean:** ㅡ and ㅣ are a flat line and a stick, ㅇ is a circle, and ㄱ and ㄴ are drawn the way they are written (ㄱ across then down, ㄴ down then across). The second lesson is syllables such as 이, 기, 그 and 느. The third is the syllables for whole words (아, 시, 저, 요, 다, 마), each letter in its real stroke order, up to five strokes. The Korean boss words are 저기요 (excuse me), 아니요 (no) and 마시다 (to drink).
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
| Hold thumbs up | Classic with spells enabled / Duel: begin casting, then complete the spell sequence |
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
    spells.ts             the six spell effects, mana costs, loadout, and Duel hand poses
    spellCasting.ts       Classic alphabet recipes, unique starting signs, real-time deadlines and failure penalties
    bosses.ts             the boss that comes every third wave, and the words it carries
    sfx.ts                procedural Web Audio sound effects, the looping background music (public/audio/bg_music.mp3), and their volume settings
```

## Decisions and known gaps

- **Webcam tuning still needs real-hand validation.** Shared thresholds come from `config/pinch.defaults.json`: start/end 0.15/0.25, two-frame confirmation, optional 3D veto off, and speed assistance on. One Euro parameters and the drawing box are in `src/config.ts`. Use the input lab for live measurements.
- **The default cursor follows the thumb tip.** Choose knuckle, index tip, thumb tip, or midpoint in the input lab. Hand loss retains a 300 ms stroke grace, but immediately releases menu presses; missing camera updates also cancel menu holds after 200 ms. Unbuffered strokes trim three points at each end when sufficiently long; buffering uses the inferred boundaries.
- **Symbols a monster currently needs are matched first, with a lower bar** (score ≥ 0.55 and within 0.08 of the best match overall, against 0.76 otherwise). A slanted line counts as a dash or pillar when only one of the two is needed.
- **The recognizer is \$1 without rotation invariance.** It searches only ±25° of rotation, so `|` ≠ `—` and `V` ≠ `Λ`. Circles have templates at 8 start angles × 2 directions. Zigzag accepts 3- and 4-segment zigzags (M, W, N-like) in both directions.
- **Art and sound are procedural** (canvas drawing and Web Audio oscillators). Everything is paper and pencil: a plain folded sheet for the arena, wobbly double-stroked pencil lines, cut-out monsters (a crumpled ball, a torn notebook page, a sticky note), marker symbols and handwriting fonts (the macOS ones, with bundled Patrick Hand and Permanent Marker as the fallback elsewhere). Colors live in `src/game/palette.ts` and the drawings in `src/game/scenes/Boot.ts`. There are no third-party assets. Textures are drawn once and registered as images, so they survive a WebGL context loss.
- **The webcam feed sits faintly behind the whole arena** (greyscale, under a mostly opaque sheet of paper, so it reads as a faint pencil sketch), with a full preview in the debug overlay.
- **All tunables are in a single `src/config.ts`**, instead of separate input and game config files.
- **Out of scope for now:** pose modifiers, combos, PvP, learning modes, and the leaderboard (see `init_plan.md` §9).
