import Phaser from "phaser";
import { ARENA, DIFFICULTY, GAME, waveSpec, type Difficulty } from "../../config";
import { recognizeDigit } from "../../input/digits";
import { castLabel, mathName, onInput, type CastName } from "../../input/events";
import { mulberry32 } from "../../input/shapes";
import { pvp } from "../../net/pvp";
import { state } from "../../state";
import { Monster } from "../entities/Monster";
import { Player } from "../entities/Player";
import { ACCENT_CSS, castColor, FONT, INK, INK_CSS, MONSTER_PALETTES, ORANGE_CSS } from "../palette";
import { sfx } from "../sfx";
import { Casting, type CastHost } from "../systems/Casting";
import { Fx } from "../systems/Fx";
import { Hud } from "../systems/Hud";
import { hintFor, isMark, langCast, langWaveBlurb, MARK_GLYPH, pickLang, type Mark } from "../languages";
import { cleanSubjects, isScript, SUBJECT_INFO, waveSubject, type Subject } from "../subjects";
import { makeProblem, mathQueue, mathWaveBlurb } from "../math";
import { ASL_WAVES, aslPool, DEMO_SEED, edgePoint, Spawner, symbolPool, type SpawnOrder } from "../systems/Spawner";

const SHAPE_GLYPH: Partial<Record<CastName, string>> = { caret: "Λ", circle: "◯", zigzag: "zigzag" };

const MULTI_NAMES = ["", "", "Double!", "Triple!", "Quad!", "Mega!"];
const ANSWER_HOLD = 0.7;

export class Arena extends Phaser.Scene implements CastHost {
  player!: Player;
  monsters: Monster[] = [];
  fx!: Fx;
  private hud!: Hud;
  private casting!: Casting;
  private spawner!: Spawner;
  private difficulty: Difficulty = "medium";
  private hearts = 3;
  private score = 0;
  private streak = 0;
  private wave = 0;
  private phase: "banner" | "play" | "over" = "banner";
  private demo = false;
  /** What was picked for this round, and the one the current wave uses. */
  private subjects: Subject[] = ["shapes"];
  private subject: Subject = "shapes";
  private level = 1;
  private roll: () => number = Math.random;
  private marks: Mark[] = [];
  private buffer = "";
  private answerHold = 0;
  private answerText: Phaser.GameObjects.Text | null = null;
  private answerBar: Phaser.GameObjects.Graphics | null = null;
  private versus = false;
  private charge = 0; // versus: builds up with kills; each whole point sends a monster
  private lastStatus = 0;
  private themText: Phaser.GameObjects.Text | null = null;
  private aslCards = new Map<CastName, Phaser.GameObjects.Image>();
  private aslText: Phaser.GameObjects.Text | null = null;
  private aslBar: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super("Arena");
  }

  private get asl() {
    return this.subject === "asl";
  }
  private get math() {
    return this.subject === "math";
  }
  private get lang() {
    return isScript(this.subject);
  }

  init(data: { demo?: boolean; subjects?: Subject[]; pvp?: boolean }) {
    this.versus = !!data?.pvp;
    this.demo = !!data?.demo && !this.versus;
    // the demo run is scripted for drawn shapes
    this.subjects = this.demo ? ["shapes"] : cleanSubjects(data?.subjects ?? state.subjects);
    this.subject = this.subjects[0];
    this.level = 1;
    this.charge = 0;
    this.buffer = "";
    this.marks = [];
    // the demo run is scripted against the standard tuning
    this.difficulty = this.demo ? "medium" : state.difficulty;
    this.monsters = [];
    this.hearts = DIFFICULTY[this.difficulty].hearts;
    this.score = 0;
    this.streak = 0;
    this.wave = 0;
    this.phase = "banner";
  }

  create() {
    const cx = ARENA.width / 2, cy = ARENA.height / 2;
    this.add.image(cx, cy, "floor").setDepth(-10);
    this.player = new Player(this, cx, cy);
    this.fx = new Fx(this);
    this.casting = new Casting(this, this);
    this.hud = new Hud(this, this.hearts, this.difficulty);
    this.hud.setHearts(this.hearts);
    this.roll = this.demo ? mulberry32(DEMO_SEED) : Math.random;
    this.spawner = this.makeSpawner();
    this.themText = null;
    if (this.versus) this.setupVersus();
    this.aslCards = new Map();
    this.aslText = this.aslBar = null;
    const has = (s: Subject) => this.subjects.includes(s);
    this.answerText = this.answerBar = null;
    if (has("asl")) {
      this.aslText = this.add
        .text(cx, 52, "", { fontFamily: FONT, fontSize: "24px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
        .setOrigin(0.5, 0)
        .setDepth(1000);
      this.aslBar = this.add.graphics().setDepth(1000);
    }
    if (has("math") || this.subjects.some(isScript)) {
      this.answerText = this.add
        .text(cx, ARENA.height - 78, "", { fontFamily: FONT, fontSize: "36px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 8 })
        .setOrigin(0.5)
        .setDepth(1000);
    }
    if (has("math")) {
      this.answerBar = this.add.graphics().setDepth(1000);
      this.input.keyboard?.on("keydown", (ev: KeyboardEvent) => this.onAnswerKey(ev));
    }

    const off = onInput((e) => {
      switch (e.type) {
        case "cursor": return this.casting.onCursor(e.p, e.inking);
        case "strokeStart": return this.casting.onStrokeStart(e.p);
        case "strokePoint": return this.casting.onStrokePoint(e.p);
        case "strokeEnd":
          this.casting.onStrokeEnd();
          if (this.math && this.phase === "play") this.onDrawnDigit(e.points);
          return;
        case "symbol":
          if (this.lang && this.phase === "play") { this.onLangMark(e.name); return; }
          if (!this.math && this.phase !== "over") this.casting.cast(e.name);
          return;
        case "fizzle":
          if (this.lang && this.phase === "play") {
            this.fx.floatText(this.player.x, this.player.y - 80, "line, stick, V, peak, or circle", "#8a857a", 18);
            return;
          }
          if (!this.math && this.phase !== "over") this.casting.onFizzle(e.points);
          return;
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      state.wanted = [];
      state.aslActive = false;
      state.mathActive = false;
      state.langActive = false;
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.versus && this.phase !== "over") pvp.send({ t: "dead", score: this.score, forfeit: true }); // leaving a versus game gives it up
      this.scene.start(this.versus ? "Duel" : this.demo ? "Title" : "Classic");
    });

    this.startWave(1);
  }

  /** A spawner for the current wave's subject. */
  private makeSpawner() {
    const s = this.subject, roll = this.roll;
    return new Spawner(
      roll,
      // slower when the answer takes longer than drawing a line: a handshape, a number, several marks
      isScript(s) ? 0.55 : s === "math" ? 0.58 : s === "asl" ? 0.7 : this.demo ? 0.85 : 1,
      s === "asl" ? aslPool : symbolPool,
      isScript(s)
        ? {
            make: (level) => {
              const item = pickLang(s, level, roll);
              return { name: langCast(item.strokes), label: item.label };
            },
            queue: () => 1,
            interval: 1.45,
          }
        : s === "math"
          ? {
              make: (level, prefer) => {
                const problem = makeProblem(level, roll, prefer);
                return { name: problem.name, label: problem.prompt };
              },
              queue: mathQueue,
              interval: 1.35,
            }
          : undefined,
      this.difficulty,
    );
  }

  /** Point the input and the on-screen prompts at the current wave's subject. */
  private applySubject() {
    state.aslActive = this.asl;
    state.mathActive = this.math;
    state.langActive = this.lang;
    this.buffer = "";
    this.marks = [];
    this.answerHold = 0;
    this.answerBar?.clear();
    this.answerText?.setVisible(this.math || this.lang).setFontSize(this.math ? 36 : 28);
    if (this.lang) this.refreshLang();
    else this.refreshAnswer();
  }

  private startWave(n: number) {
    this.wave = n;
    // with several subjects picked, each wave moves on to the next one
    ({ subject: this.subject, level: this.level } = waveSubject(this.subjects, n));
    this.spawner = this.makeSpawner();
    this.spawner.startWave(n, this.level);
    this.applySubject();
    this.phase = "banner";
    this.hud.setWave(n);
    this.fx.banner(`Wave ${n}`, INK_CSS, this.waveSubtitle(n), 1200);
    sfx.wave();
    this.time.delayedCall(DIFFICULTY[this.difficulty].breather * 1000, () => {
      if (this.phase === "over") return;
      if (this.demo && n === 1) this.scriptDemoOpening();
      this.phase = "play";
    });
  }

  /** What's new this wave: the subject, shapes or letters unlocked, and monsters starting to carry longer queues. */
  private waveSubtitle(n: number): string | undefined {
    const text = this.subjectBlurb(n);
    if (this.subjects.length === 1 || isScript(this.subject)) return text; // language blurbs already name the language
    const label = SUBJECT_INFO[this.subject].label;
    return text ? `${label}: ${text[0].toLowerCase()}${text.slice(1)}` : label;
  }

  private subjectBlurb(n: number): string | undefined {
    const level = this.level;
    // math and languages follow their own curriculum on every difficulty
    if (isScript(this.subject)) return langWaveBlurb(this.subject, level);
    if (this.math) return mathWaveBlurb(level);
    if (level === 1) {
      if (this.asl) return "Make the handshape for a monster's letter, and hold it";
      return this.demo ? "Demo run" : "Draw the shape taped to a monster to tear it up";
    }
    const pw = Spawner.poolWave(level, this.difficulty);
    const parts: string[] = [];
    if (pw !== Spawner.poolWave(level - 1, this.difficulty)) {
      if (this.asl) {
        if (ASL_WAVES[pw - 1]) parts.push(`new letters: ${ASL_WAVES[pw - 1].join(" ")}`);
      } else {
        const before = new Set(symbolPool(pw - 1));
        const added = symbolPool(pw).filter((s) => !before.has(s)).map((s) => SHAPE_GLYPH[s] ?? s);
        if (added.length) parts.push(`new shape${added.length > 1 ? "s" : ""}: ${added.join(" and ")}`);
      }
    }
    const q = waveSpec(n, this.difficulty).maxQueue;
    if (q > waveSpec(n - 1, this.difficulty).maxQueue) parts.push(q === 2 ? "monsters now carry more than one" : "monsters now carry up to three");
    if (!parts.length) return undefined;
    const s = parts.join(". ");
    return s[0].toUpperCase() + s.slice(1);
  }

  /** Show a reference card for each letter a monster needs right now, and what the camera thinks you're signing. */
  private updateAsl() {
    const on = this.asl;
    this.aslText?.setVisible(on);
    const needed = on ? [...new Set(state.wanted)].sort() : [];
    for (const [name, card] of this.aslCards) {
      if (needed.includes(name)) continue;
      this.aslCards.delete(name);
      this.tweens.add({ targets: card, y: ARENA.height + 90, duration: 200, onComplete: () => card.destroy() });
    }
    needed.forEach((name, i) => {
      const x = ARENA.width / 2 + (i - (needed.length - 1) / 2) * Math.min(108, (ARENA.width - 200) / needed.length);
      let card = this.aslCards.get(name);
      if (!card) {
        // under the monsters, so none can hide behind a card
        card = this.add.image(x, ARENA.height + 90, `aslcard_${castLabel(name)}`).setScale(0.82).setDepth(-5).setAngle(Phaser.Math.Between(-3, 3));
        this.aslCards.set(name, card);
      }
      card.x += (x - card.x) * 0.2;
      card.y += (ARENA.height - 78 - card.y) * 0.2;
    });
    const letter = state.aslLetter;
    const lost = state.mode !== "hand";
    this.aslText?.setText(lost ? "ASL mode needs the camera: press M" : letter ? `you're signing ${letter}${state.aslSource === "yours" ? " (your example)" : ""}` : "no letter recognised");
    const g = this.aslBar!;
    g.clear();
    if (on && letter && !lost) {
      const w = 160, x = ARENA.width / 2 - w / 2, y = 88;
      g.fillStyle(castColor(`asl_${letter}`), 1);
      g.fillRect(x, y, w * state.aslProgress, 10);
      g.lineStyle(2, INK, 0.9);
      g.strokeRect(x, y, w, 10);
    }
  }

  /** Versus: opponent's hearts and score, incoming attacks, and how the match ends. */
  private setupVersus() {
    this.themText = this.add
      .text(18, 62, "", { fontFamily: FONT, fontSize: "20px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setDepth(1000);
    const off = pvp.on((e) => {
      if (this.phase === "over") return;
      if (e.type === "forfeit") return this.endVersus(true, "Your opponent disconnected.");
      if (e.type !== "message") return;
      if (e.msg.t === "dead") this.endVersus(true, e.msg.forfeit ? "Your opponent left the game." : undefined);
      else if (e.msg.t === "attack") this.incoming(e.msg.n);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  /** Monsters the opponent sent: one symbol each, arriving from spread-out directions. */
  private incoming(n: number) {
    const fronts = this.monsters.filter((m) => !m.dying && m.front).map((m) => m.front!) as CastName[];
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < Math.min(n, 6); i++) {
      const o = this.spawner.makeOrder(fronts);
      this.spawn({ ...o, symbols: o.symbols.slice(0, 1), angle: base + (i * Math.PI * 2) / Math.max(n, 3) });
    }
    this.fx.floatText(this.player.x, this.player.y - 96, n > 1 ? `${n} incoming!` : "incoming!", ACCENT_CSS, 26);
    sfx.hurt();
  }

  /** Versus: kills charge up attacks. A plain kill is worth half a monster; multi-hits are worth more. */
  private chargeAttack(kills: number, hits: number) {
    this.charge += kills * 0.5 + Math.max(0, hits - 1) * 0.5;
    const n = Math.floor(this.charge);
    if (n < 1) return;
    this.charge -= n;
    pvp.send({ t: "attack", n });
    this.fx.floatText(this.player.x, this.player.y - 124, n > 1 ? `sent ${n}!` : "sent 1!", ORANGE_CSS, 22);
  }

  private endVersus(won: boolean, note?: string) {
    if (this.phase === "over") return;
    this.phase = "over";
    if (won) sfx.wave();
    else sfx.gameOver();
    for (const m of this.monsters) this.tweens.add({ targets: m, alpha: 0.3, duration: 400 });
    this.time.delayedCall(1100, () =>
      this.scene.start("GameOver", { score: this.score, wave: this.wave, subjects: this.subjects, difficulty: this.difficulty, versus: { won, note, theirScore: pvp.them.score } }),
    );
  }

  private updateVersus() {
    const now = performance.now();
    if (now - this.lastStatus > 500) {
      this.lastStatus = now;
      pvp.send({ t: "status", hearts: this.hearts, score: this.score, wave: this.wave });
    }
    const t = pvp.them;
    this.themText?.setText(
      pvp.status === "reconnecting"
        ? `opponent lost connection: ${Math.ceil(pvp.graceLeft / 1000)} s to come back`
        : `opponent  ${"♥".repeat(Math.max(0, t.hearts))}${"♡".repeat(Math.max(0, DIFFICULTY[this.difficulty].hearts - t.hearts))}  ${t.score.toLocaleString()}  wave ${t.wave}`,
    );
  }

  /** Three monsters with the same symbol, so the demo shows a triple hit early. */
  private scriptDemoOpening() {
    const speed = this.spawner.speed;
    const mk = (angle: number, palette: number): SpawnOrder => ({ angle, symbols: ["v"], speed, palette });
    this.spawner.script([
      { at: 0.2, order: mk(Math.PI, 0) },
      { at: 0.5, order: mk(-Math.PI / 5, 1) },
      { at: 0.8, order: mk(Math.PI / 4, 2) },
    ]);
  }

  private spawn(o: SpawnOrder) {
    const p = edgePoint(o.angle);
    this.monsters.push(new Monster(this, p.x, p.y, o.symbols, o.speed, o.palette, o.labels));
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.casting.update(dt);
    this.hud.update(this.score);
    const fronts = this.monsters.filter((m) => !m.dying && m.front).map((m) => m.front!) as CastName[];
    state.wanted = this.phase === "over" ? [] : fronts;
    if (this.aslText) this.updateAsl();
    if (this.math) this.tickAnswerHold(dt);
    if (this.versus && this.phase !== "over") this.updateVersus();
    if (this.phase === "over") return;

    if (this.phase === "play") {
      for (const o of this.spawner.update(dt, fronts)) this.spawn(o);
    }

    const { x: px, y: py } = this.player;
    for (const m of [...this.monsters]) {
      m.step(dt, px, py);
      if (!m.dying && m.distanceTo(px, py) < GAME.contactDistance) this.contact(m);
      if (this.hearts <= 0) return;
    }

    if (this.phase === "play" && this.spawner.done && this.monsters.length === 0) {
      const bonus = Math.round(500 * this.wave * DIFFICULTY[this.difficulty].scoreMult);
      this.score += bonus;
      this.fx.floatText(px, py - 90, `wave clear +${bonus}`, ORANGE_CSS, 28);
      this.startWave(this.wave + 1);
    }
  }

  private get streakMult() {
    return Math.min(GAME.streakMaxMult, 1 + Math.floor(this.streak / GAME.streakStep) * 0.5);
  }

  onCast(name: CastName, hits: Monster[]) {
    if (hits.length === 0) {
      this.fx.floatText(this.player.x, this.player.y - 70, "no monster needs that", "#8a857a", 16);
      return;
    }
    this.streak++;
    this.hud.setMultiplier(this.streakMult);
    if (this.versus) this.chargeAttack(hits.filter((m) => m.queue.length === 0).length, hits.length);
    if (hits.length >= 2) {
      const label = MULTI_NAMES[Math.min(hits.length, MULTI_NAMES.length - 1)];
      const c = castColor(name);
      this.cameras.main.flash(160, (c >> 16) & 255, (c >> 8) & 255, c & 255);
      this.cameras.main.shake(220, 0.008);
      this.fx.banner(label, ACCENT_CSS, `×${Math.min(3, hits.length)} score`, 350);
      sfx.multi(hits.length);
    }
  }

  onSpellLanded(m: Monster, name: CastName, killed: boolean, multi: number) {
    if (!m.active) return;
    const color = castColor(name);
    const mult = multi >= 3 ? 3 : multi >= 2 ? 2 : 1;
    const pts = Math.round((GAME.scorePerSymbol + (killed ? GAME.scorePerKill : 0)) * mult * this.streakMult * DIFFICULTY[this.difficulty].scoreMult);
    this.score += pts;
    this.fx.floatText(m.x, m.y - 40, `+${pts}`, killed ? ORANGE_CSS : INK_CSS, killed ? 28 : 22);
    m.prompts.shift();
    m.bubble.popFront();
    m.flashHit();
    this.fx.burst(m.x, m.y - 10, color, 12);
    sfx.hit();
    if (killed) this.kill(m);
  }

  private kill(m: Monster) {
    this.removeMonster(m);
    const rim = Phaser.Display.Color.HexStringToColor(MONSTER_PALETTES[m.palette].rim).color;
    this.fx.burst(m.x, m.y, rim, 36);
    this.fx.burst(m.x, m.y, 0xffffff, 14);
    this.cameras.main.shake(120, 0.005);
    sfx.kill();
    this.tweens.add({
      targets: m,
      scale: 1.6,
      alpha: 0,
      angle: Phaser.Math.Between(-25, 25),
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => m.destroy(),
    });
  }

  /** A finished stroke casts immediately. A short word keeps the marks until the sequence matches. */
  private onLangMark(name: CastName) {
    if (!isMark(name)) {
      this.fx.floatText(this.player.x, this.player.y - 80, "line, stick, V, peak, or circle", "#8a857a", 18);
      return;
    }
    const next = [...this.marks, name];
    const cast = langCast(next);
    const fronts = this.monsters.filter((m) => !m.dying && m.front).map((m) => m.front!);
    if (fronts.includes(cast)) {
      this.marks = [];
      this.refreshLang();
      this.casting.cast(cast);
      return;
    }
    if (next.length < 3 && fronts.some((front) => front.startsWith(`${cast}-`))) {
      this.marks = next;
      this.refreshLang();
      return;
    }
    const alone = langCast([name]);
    if (fronts.includes(alone)) {
      this.marks = [];
      this.refreshLang();
      this.casting.cast(alone);
      return;
    }
    if (fronts.some((front) => front.startsWith(`${alone}-`))) {
      this.marks = [name];
      this.refreshLang();
      return;
    }
    this.marks = [];
    this.refreshLang();
    this.casting.cast(alone);
  }

  private refreshLang() {
    if (!this.answerText || !this.lang) return;
    const drawn = this.marks.map((mark) => MARK_GLYPH[mark]).join(" ");
    const hint = this.monsters.find((m) => !m.dying && m.prompts[0])?.prompts[0];
    const help = hint ? hintFor(hint) : "";
    if (drawn) this.answerText.setText(`${drawn}  ·  ${help || "draw the next mark"}`);
    else this.answerText.setText(help || "draw the mark");
  }

  private onDrawnDigit(points: { x: number; y: number }[]) {
    const hit = recognizeDigit(points);
    if (!hit) {
      this.fx.floatText(this.player.x, this.player.y - 80, "draw a digit", "#8a857a", 22);
      sfx.fizzle();
      return;
    }
    if (this.buffer.length >= 4) return;
    if (!this.buffer && hit.digit === "0") return;
    this.buffer += hit.digit;
    this.answerHold = 0;
    this.refreshAnswer();
  }

  private onAnswerKey(ev: KeyboardEvent) {
    if (!this.math || this.phase !== "play" || ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key >= "0" && ev.key <= "9") {
      ev.preventDefault();
      if (this.buffer.length >= 4) return;
      if (!this.buffer && ev.key === "0") return;
      this.buffer += ev.key;
      this.answerHold = 0;
      this.refreshAnswer();
      return;
    }
    if (ev.key === "Backspace") {
      ev.preventDefault();
      this.buffer = this.buffer.slice(0, -1);
      this.refreshAnswer();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      this.submit();
    }
  }

  private refreshAnswer() {
    if (this.math) this.answerText?.setText(this.buffer || "draw the answer");
  }

  /** Digits accumulate. Holding still, with the hand open, casts the whole number. */
  private tickAnswerHold(dt: number) {
    const drawing = state.inking;
    const handGone = state.mode === "hand" && performance.now() - state.lastHandSeen > 400;
    if (this.phase !== "play" || !this.buffer || drawing || handGone) {
      this.answerHold = 0;
      this.paintHold();
      return;
    }
    this.answerHold += dt;
    this.paintHold();
    if (this.answerHold >= ANSWER_HOLD) {
      this.answerHold = 0;
      this.submit();
    }
  }

  private paintHold() {
    const g = this.answerBar;
    if (!g) return;
    g.clear();
    if (!this.buffer || this.answerHold <= 0) return;
    const w = 180;
    const x = ARENA.width / 2 - w / 2;
    const y = ARENA.height - 46;
    g.fillStyle(0x2b6fd0, 1);
    g.fillRect(x, y, w * Math.min(1, this.answerHold / ANSWER_HOLD), 8);
    g.lineStyle(2, INK, 0.9);
    g.strokeRect(x, y, w, 8);
  }

  private submit() {
    if (!this.buffer || this.phase === "over") return;
    const name = mathName(Number(this.buffer));
    const hit = this.monsters.some((m) => !m.dying && m.front === name);
    this.buffer = "";
    this.answerHold = 0;
    this.refreshAnswer();
    this.paintHold();
    if (!hit) {
      this.miss();
      return;
    }
    this.casting.cast(name);
  }

  private miss() {
    this.buffer = "";
    this.answerHold = 0;
    this.marks = [];
    if (this.lang) this.refreshLang();
    else this.refreshAnswer();
    this.paintHold();
    this.streak = 0;
    this.hud.setMultiplier(1);
    this.fx.floatText(this.player.x, this.player.y - 80, "not that", "#8a857a", 22);
    this.cameras.main.shake(90, 0.004);
    sfx.fizzle();
  }

  private contact(m: Monster) {
    this.removeMonster(m);
    this.fx.puff(m.x, m.y, 0x8a857a, 20);
    this.fx.burst(this.player.x, this.player.y, 0xff4d6d, 30);
    m.destroy();
    this.hearts--;
    this.streak = 0;
    this.hud.setMultiplier(1);
    this.hud.setHearts(this.hearts);
    this.player.hurt();
    this.cameras.main.shake(300, 0.018);
    this.cameras.main.flash(200, 255, 40, 80);
    sfx.hurt();
    if (this.hearts <= 0) this.gameOver();
  }

  private removeMonster(m: Monster) {
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
  }

  private gameOver() {
    if (this.versus) {
      pvp.send({ t: "dead", score: this.score });
      return this.endVersus(false);
    }
    this.phase = "over";
    sfx.gameOver();
    for (const m of this.monsters) this.tweens.add({ targets: m, alpha: 0.3, duration: 400 });
    this.time.delayedCall(1300, () =>
      this.scene.start("GameOver", { score: this.score, wave: this.wave, demo: this.demo, subjects: this.subjects, difficulty: this.difficulty }),
    );
  }
}
