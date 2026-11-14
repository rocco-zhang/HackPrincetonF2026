# Handoff: SPELLCAM (working title) — base prototype, one builder

> Written Sat Nov 14, 2026, ~2:00 AM ET at HackPrinceton Fall '26.
> **Scope right now: the base prototype only** (single-player vs. monsters), built by **one person working top to bottom** in the order of §7.
> Special tracks are deliberately out of scope for now. Everything else is in the roadmap at the end.

---

## 0. The game in one paragraph
- **Core mechanic:** you stand in the center of a 2D arena while monsters walk toward you from the edges. Each monster has a short sequence of symbols floating above its head.
- **Input:** you cast spells by **drawing symbols in the air with your fingertip** in front of your webcam. The browser tracks your hand and recognizes the shape.
- **Effect of a spell:** drawing a symbol strips that symbol from every monster whose *next* symbol matches. A monster with no symbols left dies, and a monster that reaches you costs a heart.
- **Inspiration:** the trackpad-drawing mechanic of Google's 2016 Magic Cat Academy Doodle, moved to hand tracking.
- **IP rule:** the mechanic is fine to borrow, but **all art, characters and the name must be our own.** No cat named Momo, no Google branding, no Doodle assets.

## 1. Hackathon constraints that affect the build
- Main track: **Entertainment and Media** (the only main track we'll enter).
- Deadline: **8:00 AM Sun Nov 15** on Devpost. The GitHub repo must be **public** and **created Nov 13–15**.
- Live demo of **≤ 2 minutes** on Sunday, in a loud, bright room. Plan for bad lighting and a judge's hand, not just ours.
- One builder: follow the build order in §7, and don't start a step until the one before it passes its check.

---

## 2. Tech stack (Decision; versions checked on npm tonight)

| Piece | Choice | Why |
|---|---|---|
| App | **Vite 8 + TypeScript**, runs fully in the browser | Webcam works on `localhost` without HTTPS hassle; nothing to host but static files |
| Hand tracking | **`@mediapipe/tasks-vision` (1.2.3)**, `HandLandmarker` in `VIDEO` mode, GPU delegate | 21 landmarks per hand at webcam frame rate, in the browser. The same package also ships a `GestureRecognizer` (built-in poses such as `Victory`, `ILoveYou`, `Closed_Fist`) for later modes |
| Symbol recognition | **$1 Unistroke Recognizer**, our own TypeScript port with two fixes (§4.3) | Template-based: no training, adding a symbol means recording a few examples. Works with mouse and finger alike |
| Game engine | **Phaser 3 (pin `phaser@3.90.0`)** | Sprites, tweens, particles and scenes come built in. Phaser 4 (4.2.1) exists, but there's far more Phaser 3 documentation and examples, so pin 3 for speed |
| Smoothing | **One Euro filter** on the fingertip | Removes jitter without adding lag |

Commands:
```bash
npm create vite@latest spellcam -- --template vanilla-ts
cd spellcam
npm i @mediapipe/tasks-vision phaser@3.90.0
npm run dev    # http://localhost:5173 — camera permission works on localhost
```

MediaPipe setup (check URLs against the official MediaPipe "Hand landmarker – web" guide if anything 404s):
```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"
);
const hands = await HandLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  numHands: 1,                 // 2 later for PvP
});

// each animation frame:
const res = hands.detectForVideo(videoEl, performance.now());
// res.landmarks[0] = 21 points {x, y, z}, normalized 0..1 (x is NOT mirrored)
```
**For the demo,** download the `.task` model file into `public/` and point `modelAssetPath` at it, so venue Wi-Fi can't break the demo.

---

## 3. Architecture: input and game joined by one small event interface

- **Separation:** the input code (mouse or hand) emits events, and the game only listens to them.
- **Why it helps a solo builder:**
  - You can build and debug the whole game with the **mouse** first.
  - Swapping in the hand tracker changes nothing in the game.
  - The mouse stays as a fallback if the camera misbehaves during the demo.

```ts
// src/input/events.ts
export type Pt = { x: number; y: number; t: number };      // x,y in GAME pixels (already mirrored + mapped)

export type InputEvent =
  | { type: "cursor"; p: Pt; inking: boolean }            // every frame: where the fingertip is, and whether it's drawing
  | { type: "strokeStart"; p: Pt }
  | { type: "strokePoint"; p: Pt }
  | { type: "strokeEnd"; points: Pt[] }
  | { type: "symbol"; name: SymbolName; score: number; points: Pt[] }  // recognized cast
  | { type: "fizzle"; points: Pt[]; best?: { name: SymbolName; score: number } }; // drawn but not recognized

export type SymbolName = "hline" | "vline" | "v" | "caret" | "circle" | "zigzag";

// tiny event bus: input → game
export const bus = new EventTarget();
export const emit = (e: InputEvent) => bus.dispatchEvent(new CustomEvent("input", { detail: e }));
```

```
src/
  main.ts                 # boot: camera → input → Phaser game
  input/
    events.ts             # the interface above
    mouseAdapter.ts       # mouse drag → the same events (build this first)
    camera.ts             # getUserMedia, <video> element, mirroring
    handTracker.ts        # MediaPipe loop → cursor + pinch state
    oneEuro.ts            # smoothing filter
    strokeDetector.ts     # pinch on/off → strokeStart/Point/End
    recognizer.ts         # $1 + line special-case → symbol / fizzle
    templates.json        # recorded examples per symbol
    debugOverlay.ts       # landmarks, trail, last result + score
  game/
    config.ts             # all tunables (speeds, waves, thresholds)
    scenes/Boot.ts, Title.ts, Arena.ts, GameOver.ts
    entities/Player.ts, Monster.ts, SymbolBubble.ts
    systems/Spawner.ts, Casting.ts, Hud.ts
  assets/                 # our own sprites/sfx (placeholders fine at first)
```

---

## 4. Hand tracking and drawing

### 4.1 Cursor
- **Fingertip:** use the index fingertip (landmark **8**), mirrored as `x = 1 - lm.x` so it behaves like a mirror. Map it into game coordinates.
- **Smoothing:** run it through a One Euro filter (start with `minCutoff ≈ 1.0`, `beta ≈ 0.01`, then tune).
- **Camera view:** show the webcam feed **mirrored** in a corner, or faint behind the arena. Players need to see their hand.
- **Drawing area:** map a comfortable box in camera space, not the full frame, to the full arena. Then small hand motions cover the whole screen and arms tire less.

### 4.2 When is the player "inking"? (Decision: pinch)
- **Pinch:** inking means the distance between the thumb tip (**4**) and the index fingertip (**8**) is small relative to hand size. Hand size is the wrist (**0**) to middle-finger base (**9**) distance.
- **Hysteresis:** start inking when `pinch < 0.35 × handSize` and stop when `> 0.50 × handSize`. Tune both.
- **Debounce:** require 2–3 consecutive frames before switching state.
- **End of stroke:** releasing the pinch ends the stroke. Then:
  1. Drop strokes shorter than about 8 points or 40 px.
  2. Resample.
  3. Recognize.
- **Visible feedback:** show a glowing trail while inking and a hollow cursor while not.
- **Fallback if pinch is unreliable:** "only the index finger extended" = ink (compare fingertip vs. middle-joint heights for each finger). Keep it behind a toggle.

### 4.3 Recognition: $1 plus two known fixes
$1 (Wobbrock, Wilson & Li, 2007) resamples the stroke to 64 points, rotates it, scales it into a square and compares it to templates. **Two things break it for our symbol set:**
1. **Rotation invariance:** by default "|" and "—" become the same, and so do V and Λ. **Remove the rotate-to-indicative-angle step** (an orientation-sensitive variant) and compare as drawn.
2. **Lines are 1D:** scaling a line into a square blows up noise. **Special-case lines before $1:** if the stroke's bounding-box aspect ratio is above about 4:1 and the points fit a straight line well, classify by angle. Within ±25° of horizontal is `hline`; within ±25° of vertical is `vline`. Only send everything else to $1.

Other recognition settings:
- **Templates:** record **5+ examples per symbol** with a "record template" debug mode that saves to `templates.json`. Draw both directions (e.g. V left-to-right and right-to-left) unless direction should matter. Before the demo, have 2–3 other people add a few examples each.
- **Accept threshold:** $1 score ≥ **0.80** (tune it). Below that, emit `fizzle` with the best guess so the game can show a fizzle effect.
- **Base symbol set (6):** `hline`, `vline`, `v`, `caret` (Λ), `circle`, `zigzag`. They're easy to tell apart and easy to draw in the air. Add more only after these hit about 90%.

### 4.4 Debug overlay (build it early; it saves hours)
- The landmarks drawn on the video, the pinch distance and the inking state
- The current stroke, the resampled 64 points, the recognized symbol and its score
- An FPS counter
- Hotkeys: `D` toggles the overlay, `T` records templates, `M` switches between mouse and hand input

---

## 5. Game design (base PvE)

### Rules
- **Layout:** the player is fixed at the center. Monsters spawn just off-screen at random angles and walk straight toward the center.
- **Monster symbols:** each monster carries **1–3 symbols** (a queue), shown in a bubble above it. The front symbol is highlighted.
- **A cast** of symbol `S` pops the front symbol off **every** monster whose front symbol is `S`. A monster with an empty queue dies (particles, score).
- **Contact:** a monster touching the player removes 1 heart (start with **3**) and dies. At 0 hearts the game is over.
- **Fizzle:** a small puff at the cursor, with no penalty in the base game.
- **Waves:** wave *n* spawns `4 + 2n` monsters, a little faster each wave. Longer symbol queues appear from wave 3. Add a short breather and "WAVE n" banner between waves.
- **Score:**
  - +100 per symbol removed, +250 per kill.
  - **Multi-hit bonus:** ×2 if one cast hits 2+ monsters, ×3 if it hits 3+.
  - A streak multiplier that resets when you take damage.

### Starting tunables (`config.ts`)
| Setting | Value |
|---|---|
| Monster speed | 40 px/s, +6 per wave (cap 90) |
| Spawn interval | 2.0 s → 0.9 s floor |
| Arena | 1280×720, player radius 40, hit radius 50 |
| Symbol bubble | 48 px icons, readable from 2 m away (judges stand back) |

### Feel ("juice" matters for Entertainment judges)
- **Hit feedback:** a spell flies from the player to each monster that was hit.
- **Juice on kills:** a little screen shake on kills and big flashes on multi-hits.
- **Sound:** one sound effect per symbol type, plus kill, hurt and fizzle sounds.
- **Screens:** title ("pinch to start": a pinch hold of 1 second, so a new player learns the gesture), game over with score and wave, and an instant restart.
- **Art:** an original look. Placeholder circles are fine until the loop is fun.

### App shell
- **Camera:** a permission flow with a friendly error if it's denied, a camera picker (laptops plus external webcams), and a mirror toggle.
- **Layout:** the Phaser canvas centered, with a small mirrored webcam preview plus a hand skeleton in a corner, and the HUD (hearts, score, wave).
- **Calibration screen** (10 seconds): "hold your hand up", which confirms tracking and sets the drawing box from §4.1.
- **Performance:** run MediaPipe in its own `requestAnimationFrame` loop, decoupled from Phaser. If FPS drops below about 25, lower the video resolution to 640×480.

---

## 6. Repo and deploy
- **Repo:** Vite + TS project, **public GitHub repo** (required), README, MIT license.
- **Deploy:** a static build (`npm run build`) to GitHub Pages, Vercel or Netlify. Camera access needs **HTTPS** when deployed, and those hosts provide it.
- **Demo:** run it from **`localhost` plus the local model file** to be safe.

---

## 7. Build order (one person, top to bottom)

| # | Step | Check before moving on | Rough time |
|---|---|---|---|
| 1 | Scaffold: Vite + TS + Phaser, empty Arena scene, public repo pushed | `npm run dev` shows a blank arena | 20 min |
| 2 | Mouse adapter + recognizer (with both fixes) + template recorder | All 6 symbols recognized with the **mouse**, ≥ 90% of tries | 1.5 h |
| 3 | Game loop with mouse: player, spawner, monsters with symbol queues, casting, hearts, waves, game over | Fully playable with the mouse | 2–3 h |
| 4 | Camera + MediaPipe + debug overlay | Landmarks drawn on a mirrored video at ≥ 25 FPS | 1 h |
| 5 | Hand cursor: One Euro smoothing, pinch-to-ink, stroke detector, drawing box | Finger draws a smooth trail; symbols recognized ≥ 80% with the hand | 1.5–2 h |
| 6 | Feel: juice, sounds, title + game-over screens, tuned difficulty | Someone who hasn't seen it plays 3 waves without explanation | 2–3 h |
| 7 | Demo-proofing: other people's templates, bright-light test, local model file, seeded "demo wave", mouse fallback hotkey | Works for a stranger's hand in venue light | 1–2 h |
| 8 | Ship: deploy, README, ≤ 2-min video, Devpost | Submitted by **7:30 AM Sunday** | 1.5 h |

The game comes before the camera on purpose. If hand tracking turns out harder than expected, you still have a working game to show, and tuning the feel with a mouse is much faster.

---

## 8. Known risks and fixes
- **Lighting and backgrounds:** test against a busy background. If tracking drops, raise contrast, ask the player to keep their hand in front of their body, and keep the camera at chest height.
- **Recognition is wrong:**
  - **Under-recording:** more templates from more people (most errors come from this).
  - **Lines and orientation:** check the line special-case and the orientation fix.
  - **Confusable shapes:** drop or replace confusable symbols. Fewer, distinct symbols beat many similar ones.
- **Arm fatigue:** keep rounds short (3–5 waves for a demo) and let people draw small by using the drawing box.
- **Latency:** if the trail lags, lower the video resolution before touching anything else. Keep recognition off the render path, since it runs only at stroke end.
- **Running out of time:** steps 1–5 are the prototype, and step 6 is what makes it win. Cut roadmap items, never step 6.

---

## 9. Roadmap AFTER the base works (don't build yet)
1. **Mana bar and spell costs:** stronger spells cost more mana, and mana regenerates over time.
2. **Hand-pose modifiers:** a pose held while you finish a symbol changes the spell, e.g. ✌ peace sign = cast twice, 🤘 "rock" sign = area blast, open palm = shield.
   - MediaPipe's `GestureRecognizer` already detects `Victory`, `Open_Palm`, `Closed_Fist`, `Pointing_Up`, `Thumb_Up`, `Thumb_Down`, `ILoveYou`.
   - The "rock" sign (index + pinky, no thumb) isn't built in. Train a tiny classifier on normalized landmarks (kNN or a small MLP over 63 features, about 100 samples per pose per person).
3. **Combos:** two symbols within about 1.5 s make a combo spell (e.g. circle then zigzag = lightning storm). Add bosses that require a specific combo.
4. **PvP:** two hands or two players in frame (`numHands: 2`, split arena). Your casts send monsters at your opponent.
5. **Learning mode (same game, different mode):**
   - **Kana / characters:** monsters carry Japanese kana, and you draw them to win. This needs **multistroke** recognition, so switch to the **$P point-cloud recognizer**, which accepts strokes in any order.
   - **ASL fingerspelling:** monsters carry letters, and you sign the letter. Most letters are static handshapes, so use the pose classifier from item 2. J and Z involve motion, so leave them out at first.
6. **Polish:** leaderboard, shareable end-screen GIF of your best spell, accessibility mode (one hand, seated, slower monsters).
7. **Special tracks:** paused on purpose; revisit only after step 6 of the build order.
