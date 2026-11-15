import Phaser from "phaser";
import { calmCamera } from "../../a11y";
import { ARENA, DIFFICULTY, GAME, waveSpec, type Difficulty } from "../../config";
import { recognizer } from "../../input/castPipeline";
import { experiment } from "../../input/pinchExperiment";
import { recognizeDigit } from "../../input/digits";
import { castLabel, isLangShape, mathName, onInput, type CastName, type Pt } from "../../input/events";
import { mulberry32 } from "../../input/shapes";
import { resetAslHold } from "../../input/handTracker";
import { pvp } from "../../net/pvp";
import { state } from "../../state";
import { Monster } from "../entities/Monster";
import { Player } from "../entities/Player";
import { ACCENT_CSS, castColor, FONT, INK, INK_CSS, MONSTER_PALETTES, ORANGE_CSS } from "../palette";
import { setMusicFast, sfx } from "../sfx";
import { Casting, type CastHost } from "../systems/Casting";
import { Fx } from "../systems/Fx";
import { Hud } from "../systems/Hud";
import { hintFor, langCast, langWaveBlurb, nextMarks, pickLang, scriptMarks, type Mark } from "../languages";
import { cleanSubjects, isScript, SUBJECT_INFO, waveSubject, type Subject } from "../subjects";
import { makeProblem, mathQueue, mathWaveBlurb } from "../math";
import { BOSS, bossCards, isBossWave, type BossCards } from "../bosses";
import { cleanLoadout, damageSpellTarget, spellMovementScale, wavePushDistance, MANA, SPELL_POWER, SPELLS, type Loadout, type SpellId } from "../spells";
import { INCANTATION, SpellCasting, spellFailureCost, type SpellResult } from "../spellCasting";
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
  /** The two spells brought into this round, the mana to cast them, and spell effects still running. */
  private loadout: Loadout = ["fire", "water"];
  private mana = MANA.start;
  private slowUntil = 0;
  private freezeUntil = 0;
  private shieldUntil = 0;
  private shieldGfx: Phaser.GameObjects.Graphics | null = null;
  /** What this wave's boss will carry, on a boss wave. */
  private bossPlan: BossCards | null = null;
  private languageStrokes: Pt[][] = [];
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
  private incantation = new SpellCasting();
  private worldTime = 0;
  private spellPanel: Phaser.GameObjects.Container | null = null;
  private spellSequenceText: Phaser.GameObjects.Text | null = null;
  private spellCharacters: Phaser.GameObjects.Container | null = null;
  private spellVisualKey = "";

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
  /** This round has mana and spells: always in a duel, in Classic only when switched on there. */
  private spells = false;

  /** Both game modes use the current subject's spell sequences. */
  private get spellsOn() {
    return this.spells;
  }

  init(data: { demo?: boolean; subjects?: Subject[]; pvp?: boolean }) {
    this.incantation.reset();
    this.worldTime = 0;
    this.spells = !!data?.pvp || (state.classicSpells && !data?.demo);
    this.loadout = cleanLoadout(state.loadout);
    this.mana = MANA.start;
    this.slowUntil = this.freezeUntil = this.shieldUntil = 0;
    this.bossPlan = null;
    this.versus = !!data?.pvp;
    this.demo = !!data?.demo && !this.versus;
    // the demo run is scripted for drawn shapes
    this.subjects = this.demo ? ["shapes"] : cleanSubjects(data?.subjects ?? state.subjects);
    this.subject = this.subjects[0];
    this.level = 1;
    this.charge = 0;
    this.buffer = "";
    this.languageStrokes = [];
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
    calmCamera(this.cameras.main);
    const cx = ARENA.width / 2, cy = ARENA.height / 2;
    this.add.image(cx, cy, "floor").setDepth(-10);
    this.player = new Player(this, cx, cy);
    this.fx = new Fx(this);
    this.casting = new Casting(this, this);
    this.hud = new Hud(this, this.hearts, this.difficulty);
    this.hud.setHearts(this.hearts);
    const panelBackground = this.add.rectangle(0,0,600,160,0xfffefa,.94).setStrokeStyle(3,0x487ca4);
    this.spellSequenceText = this.add.text(0,-42,"",{fontFamily:FONT,fontSize:"27px",fontStyle:"bold",color:INK_CSS,align:"center"}).setOrigin(.5);
    this.spellCharacters = this.add.container(0,8);
    this.spellVisualKey="";
    this.spellPanel = this.add.container(cx,188,[panelBackground,this.spellSequenceText,this.spellCharacters]).setDepth(1050).setVisible(false);
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
        .text(cx, 76, "", { fontFamily: FONT, fontSize: "24px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 }) // under the mana bar
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

    this.input.keyboard?.on("keydown", (ev: KeyboardEvent) => {
      if (!this.lang || this.phase !== "play" || ev.repeat) return;
      if (ev.code === "Space") { ev.preventDefault(); this.submitLanguage(); }
      if (ev.key === "Backspace") { ev.preventDefault(); this.clearLanguage(); }
    });

    const off = onInput((e) => {
      switch (e.type) {
        case "cursor": return this.casting.onCursor(e.p, e.inking, e.hand);
        case "strokeStart": return this.casting.onStrokeStart(e.p, e.hand);
        case "strokePoint": return this.casting.onStrokePoint(e.p, e.hand);
        case "strokeCancel": return this.casting.cancelStroke(e.hand);
        case "strokeEnd":
          this.casting.onStrokeEnd(e.hand);
          if (this.math && this.phase === "play") this.onDrawnDigit(e.points, e.hand);
          if (this.lang && this.phase === "play" && (!this.incantation.active || this.subject !== "korean")) this.onLanguageStroke(e.points, e.hand);
          return;
        case "languageSubmit":
          this.submitLanguage(e.hand);
          return;
        case "spellGesture":
          if(!this.routeSpellSign("spell_thumbs_up") && this.spellsOn && this.phase==="play"){
            this.fx.floatText(this.player.x,this.player.y-80,"not enough mana or spell cooling down","#8a857a",18);
          }
          return;
        case "symbol":
          if (!this.math && this.subject !== "japanese" && this.subject !== "chinese" && this.routeSpellSign(e.name)) return;
          if (this.lang && this.phase === "play") return;
          if (!this.math && this.phase !== "over" && !isLangShape(e.name)) this.casting.cast(e.name, e.hand);
          return;
        case "fizzle":
          if (this.lang && this.phase === "play" && (!this.incantation.active || this.subject === "japanese" || this.subject === "chinese")) {
            // Language strokes are evaluated together only on submission.
            return;
          }
          if (!this.math && this.incantation.active) { this.routeSpellSign("unrecognized"); return; }
          if (!this.math && this.phase !== "over") this.casting.onFizzle(e.points, e.hand);
          return;
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.incantation.reset();
      this.setSpellTime(false);
      off();
      setMusicFast(false); // leaving the round (game over, menu): normal speed again
      state.wanted = [];
      state.langMarks = null;
      state.wantedMarks = [];
      state.inRound = false;
      state.spellGesturesEnabled=false;
      state.aslActive = false;
      state.mathActive = false;
      state.langActive = false;
      state.langScript = null;
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      const cancelled = this.incantation.cancel(performance.now());
      if (cancelled) { this.finishIncantation(cancelled); return; }
      if (this.versus && this.phase !== "over") pvp.send({ t: "dead", score: this.score, forfeit: true }); // leaving a versus game gives it up
      this.scene.start(this.versus ? "Duel" : this.demo ? "Title" : "Classic");
    });

    this.shieldGfx = this.add.graphics().setDepth(399);
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
    state.inRound = true;
    state.aslActive = this.asl;
    state.mathActive = this.math;
    state.langActive = this.lang;
    state.langScript = isScript(this.subject) ? this.subject : null;
    state.spellGesturesEnabled=false;
    state.langMarks = isScript(this.subject) ? scriptMarks(this.subject) : null;
    this.buffer = "";
    this.languageStrokes = [];
    this.answerHold = 0;
    this.answerBar?.clear();
    this.answerText?.setVisible(this.math || this.lang).setFontSize(this.math ? 36 : 28);
    if (this.lang) this.refreshLang();
    else this.refreshAnswer();
    this.showSpells();
  }

  private showSpells() {
    this.hud.showSpells(this.spells); // no mana bar when the round has no spells
    this.hud.setSpells(this.loadout.map((id) => ({ name: SPELLS[id].name, glyph: SPELLS[id].glyph, cost: SPELLS[id].cost, gesture: "" })), this.spellsOn);
    this.hud.setMana(this.mana, MANA.max);
  }

  private gainMana(n: number) {
    this.mana = Math.min(MANA.max, this.mana + n);
    this.hud.setMana(this.mana, MANA.max);
  }

  /** Only the first sign of an affordable equipped recipe can enter slow-time casting. */
  private routeSpellSign(sign: string): boolean {
    if (!this.spellsOn || this.phase !== "play") return false;
    const now = performance.now();
    if (this.incantation.active) {
      const result = this.incantation.input(sign,now);
      this.casting.clearCompletedInk();
      if (result) this.finishIncantation(result);
      return true;
    }
    if (!this.incantation.beginFrom(sign,this.loadout,this.subject,this.mana,now)) return false;
    resetAslHold();
    this.languageStrokes=[];this.buffer="";this.answerHold=0;
    this.answerBar?.clear();this.casting.clearCompletedInk();
    this.setSpellTime(true);
    this.paintIncantation();
    return true;
  }

  private setSpellTime(active: boolean) {
    state.spellCastingActive=active;
    const scale = active ? INCANTATION.timeScale : 1;
    this.time.timeScale=scale;
    this.tweens.timeScale=scale;
    if (!active) {this.spellPanel?.setVisible(false);this.spellVisualKey="";}
  }

  private finishIncantation(result: SpellResult) {
    this.setSpellTime(false);
    this.languageStrokes = [];
    this.refreshLang();
    this.casting.clearCompletedInk();
    if (result.success && this.castSpell(result.id)) return;
    const penalty=Math.min(this.mana,spellFailureCost(result.id));
    this.mana-=penalty;this.hud.setMana(this.mana,MANA.max);
    this.fx.floatText(this.player.x,this.player.y-105,`${SPELLS[result.id].name}: ${result.reason??"no valid target"} (-${penalty} mana)`,"#8a857a",22);
    sfx.fizzle();
    if(this.lang)this.refreshLang();else this.refreshAnswer();
  }

  private paintIncantation() {
    const a=this.incantation.active;
    this.spellPanel?.setVisible(!!a);
    if(!a)return;
    const options=this.incantation.options;
    const key=options.map(option=>`${option.id}:${option.step}`).join("/");
    if(key===this.spellVisualKey)return;
    this.spellVisualKey=key;
    this.spellSequenceText?.setText(`Casting ${options.map(option=>SPELLS[option.id].name).join(" / ")}`);
    this.spellCharacters?.removeAll(true);
    options.forEach((option,row)=>option.steps.forEach((step,i)=>{
      const color=i<option.step?"#aaa69d":i===option.step?"#d7372f":"#171717";
      const text=this.add.text((i-(option.steps.length-1)/2)*68,row*42,step.label,{fontFamily:FONT,fontSize:"34px",color}).setOrigin(.5);
      this.spellCharacters?.add(text);
    }));
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
    // every few waves a boss comes too; ASL words only use letters this difficulty has introduced
    const boss = isBossWave(n) && !this.demo;
    this.bossPlan = boss ? bossCards(this.subject, this.asl ? Spawner.poolWave(this.level, this.difficulty) : this.level, this.roll) : null;
    this.fx.banner(boss ? `Wave ${n}: Boss!` : `Wave ${n}`, boss ? ACCENT_CSS : INK_CSS, this.bossPlan?.title ?? this.waveSubtitle(n), boss ? 1700 : 1200);
    sfx.wave();
    this.time.delayedCall(DIFFICULTY[this.difficulty].breather * 1000, () => {
      if (this.phase === "over" || this.wave !== n) return;
      if (this.demo && n === 1) this.scriptDemoOpening();
      this.phase = "play";
      state.spellGesturesEnabled=this.spells;
      if (this.bossPlan) this.spawnBoss(this.bossPlan);
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
    if (isScript(this.subject)) return langWaveBlurb(this.subject, level, this.wave <= 1);
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
    this.aslText?.setText(lost ? "ASL needs the camera" : letter ? `you're signing ${letter}${state.aslSource === "yours" ? " (your example)" : ""}` : "no letter recognised");
    const g = this.aslBar!;
    g.clear();
    if (on && letter && !lost) {
      const w = 160, x = ARENA.width / 2 - w / 2, y = 112;
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
    this.incantation.reset();
    this.setSpellTime(false);
    state.spellGesturesEnabled = false;
    state.wanted = [];
    state.wantedMarks = [];
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
    const monster = new Monster(this, p.x, p.y, o.symbols, o.speed, o.palette, o.labels, o.boss);
    this.monsters.push(monster);
    if (this.asl && this.phase === "play" && !this.incantation.active && state.aslLetter && state.aslProgress === 1) {
      const name: CastName = `asl_${state.aslLetter}`;
      if (monster.front === name) this.casting.cast(name, 0, monster);
    }
  }

  /** One big, slow monster with a long row of cards. The wave isn't over until it is gone. */
  private spawnBoss(cards: BossCards) {
    this.spawn({
      angle: this.roll() * Math.PI * 2,
      symbols: cards.symbols,
      labels: cards.labels,
      speed: this.spawner.speed * BOSS.speed,
      palette: Math.floor(this.roll() * 3),
      boss: true,
    });
    sfx.hurt();
  }

  update(_t: number, deltaMs: number) {
    const expired=this.incantation.tick(performance.now());
    if(expired)this.finishIncantation(expired);
    const dt = Math.min(0.05, deltaMs / 1000)*(this.incantation.active?INCANTATION.timeScale:1);
    this.worldTime+=dt*1000;
    this.paintIncantation();
    // strokes are only kept while a card or number is half drawn
    const partDrawn = !!this.incantation.active || (this.lang && this.languageStrokes.length > 0) || (this.math && this.buffer.length > 0);
    if (!partDrawn && this.casting.holding) this.casting.releaseHeld();
    this.casting.update(dt);
    // the figure casts while a stroke is being drawn, or (ASL) while a letter is being held
    this.player.setCasting(this.phase !== "over" && (!!this.incantation.active || this.casting.drawing || (this.asl && state.aslProgress > 0)));
    this.hud.update(this.score);
    const fronts = this.monsters.filter((m) => !m.dying && m.front).map((m) => m.front!) as CastName[];
    state.wanted = this.phase === "over" ? [] : this.incantation.active ? (this.asl || this.subject === "shapes" ? this.incantation.expectedTokens as CastName[] : []) : fronts;
    state.wantedMarks = this.lang ? this.incantation.active ? ((this.subject === "japanese" || this.subject === "chinese") ? nextMarks(this.incantation.expectedTokens, []) : this.incantation.expectedTokens as Mark[]) : nextMarks(state.wanted, []) : [];
    if (this.aslText) this.updateAsl();
    if (this.math && !this.incantation.active) this.tickAnswerHold(dt);
    if (this.versus && this.phase !== "over") this.updateVersus();
    this.paintShield();
    if (this.phase === "over") return;

    if (this.phase === "play") {
      for (const o of this.spawner.update(dt, fronts)) this.spawn(o);
    }

    const { x: px, y: py } = this.player;
    const frozen = this.worldTime < this.freezeUntil;
    const slowed = this.worldTime < this.slowUntil;
    for (const m of [...this.monsters]) {
      if (frozen || slowed) m.sprite.setTint(0x9fd0ff);
      else if (m.sprite.tintTopLeft === 0x9fd0ff) m.sprite.clearTint();
      m.step(dt * spellMovementScale(this.worldTime, this.freezeUntil, this.slowUntil), px, py);
      if (!m.dying && m.distanceTo(px, py) < GAME.contactDistance) this.contact(m);
      if (this.hearts <= 0) return;
    }

    if (this.phase === "play" && !this.incantation.active && this.spawner.done && this.monsters.length === 0) {
      const bonus = Math.round(500 * this.wave * DIFFICULTY[this.difficulty].scoreMult);
      this.score += bonus;
      this.fx.floatText(px, py - 90, `wave clear +${bonus}`, ORANGE_CSS, 28);
      this.gainMana(MANA.perWave);
      this.startWave(this.wave + 1);
    }
  }

  private castSpell(id: SpellId): boolean {
    if (!this.spellsOn || this.phase !== "play") return false;
    const spell = SPELLS[id];
    const { x: px, y: py } = this.player;
    const no = (why: string) => { this.fx.floatText(px, py - 80, why, "#8a857a", 18); return false; };
    if (this.mana < spell.cost) return no(`not enough mana for ${spell.name}`);
    const live = this.monsters.filter((m) => !m.dying && m.active);
    const spend = () => {
      this.mana -= spell.cost;
      this.hud.setMana(this.mana, MANA.max);
      this.fx.floatText(px, py - 104, `${spell.glyph} ${spell.name}`, `#${spell.color.toString(16).padStart(6, "0")}`, 24);
    };

    if (id === "fire") {
      if (!live.length) return no("nobody near");
      spend();
      for (const target of live) {
        this.animateSpell("fire", target, () => this.strike(target, SPELL_POWER.fireDamage));
      }
    } else if (id === "water") {
      if (!live.length) return no("nobody to wash away");
      spend();
      this.pushBack(live);
    } else if (id === "bomb") {
      if (!live.some((m) => m.distanceTo(px, py) <= SPELL_POWER.bombRadius)) return no("nothing in range");
      spend();
      this.explode();
    } else if (id === "freeze") {
      if (!live.length) return no("nobody to freeze");
      spend();
      this.freezeUntil = this.worldTime + SPELL_POWER.freezeSeconds * 1000;
      sfx.water();
      this.cameras.main.flash(160, 150, 210, 255);
    } else if (id === "shield") {
      if (this.worldTime < this.shieldUntil) return no("the shield is already up");
      spend();
      this.shieldUntil = Infinity;
      sfx.wave();
    } else {
      const max = DIFFICULTY[this.difficulty].hearts;
      if (this.hearts >= max) return no("hearts are already full");
      spend();
      this.hearts++;
      this.hud.setHearts(this.hearts);
      this.fx.burst(px, py - 20, 0xd7372f, 22);
      this.fx.floatText(px, py - 130, "+1 heart", ACCENT_CSS, 26);
      sfx.wave();
    }
    return true;
  }

  /** One damage removes one symbol, for ordinary monsters and bosses alike. */
  private strike(m: Monster, damage: number) {
    if (!m.active || m.dying) return;
    const killed = damageSpellTarget(m, damage);
    m.flashHit();
    if (!killed) return;
    m.dying = true;
    const pts = Math.round(GAME.scorePerKill * this.streakMult * (m.boss ? BOSS.scoreMult : 1));
    this.score += pts;
    this.fx.floatText(m.x, m.y - 40, `+${pts}`, ORANGE_CSS, 28);
    if (this.versus) this.chargeAttack(1, 1);
    this.kill(m);
  }

  /** Wave: a ring of water shoves every monster back toward the edge. */
  private pushBack(live: Monster[]) {
    const { x: px, y: py } = this.player;
    this.slowUntil = this.worldTime + SPELL_POWER.waveSlowSeconds * 1000;
    sfx.water();
    const ring = this.add.circle(px, py, 30).setStrokeStyle(10, 0x4db4ff, 0.8).setDepth(850);
    this.tweens.add({ targets: ring, scale: 12, alpha: 0, duration: 520, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.cameras.main.flash(120, 70, 150, 255);
    for (const m of live) {
      const d = m.distanceTo(px, py);
      const ux = d > 0 ? (m.x - px) / d : 1, uy = d > 0 ? (m.y - py) / d : 0;
      const radiusX = Math.abs(ux) > 1e-6 ? (ux > 0 ? ARENA.width - px : px) / Math.abs(ux) : Infinity;
      const radiusY = Math.abs(uy) > 1e-6 ? (uy > 0 ? ARENA.height - py : py) / Math.abs(uy) : Infinity;
      const push = wavePushDistance(d, Math.min(radiusX, radiusY), Math.min(ARENA.width, ARENA.height));
      let done = 0;
      this.tweens.addCounter({
        from: 0,
        to: push,
        duration: 420,
        ease: "Quad.easeOut",
        onUpdate: (tw) => {
          if (!m.active) return;
          const v = tw.getValue() ?? 0;
          m.x += ux * (v - done);
          m.y += uy * (v - done);
          done = v;
        },
      });
      this.fx.puff(m.x, m.y, 0xd7f1ff, 8);
    }
  }

  /** Bomb: everything inside the blast when it goes off is hit. */
  private explode() {
    const { x: px, y: py } = this.player;
    const r = SPELL_POWER.bombRadius;
    const blast = this.add.circle(px, py, r, 0xff8a3d, 0.28).setStrokeStyle(6, 0xd7372f, 0.9).setDepth(850).setScale(0.1);
    sfx.fire();
    this.tweens.add({
      targets: blast,
      scale: 1,
      duration: 240,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: blast, alpha: 0, duration: 260, onComplete: () => blast.destroy() });
        this.fx.burst(px, py, 0xff4d1a, 40);
        this.cameras.main.shake(200, 0.012);
        this.cameras.main.flash(140, 255, 150, 60);
        for (const m of [...this.monsters]) {
          if (m.active && !m.dying && m.distanceTo(px, py) <= r) this.strike(m, SPELL_POWER.bombDamage);
        }
      },
    });
  }

  /** The shield: a ring around you until it blocks a hit. */
  private paintShield() {
    const g = this.shieldGfx;
    if (!g) return;
    g.clear();
    const left = this.shieldUntil - this.worldTime;
    if (left <= 0) return;
    const { x, y } = this.player;
    const pulse = 0.6 + 0.25 * Math.sin(this.worldTime / 180);
    const a = 1;
    g.fillStyle(0x2f9e58, 0.1 * a);
    g.fillCircle(x, y, 78);
    g.lineStyle(6, 0x2f9e58, pulse * a);
    g.strokeCircle(x, y, 78);
  }

  private animateSpell(id: "fire" | "water", target: Monster, onHit: () => void) {
    const fromX = this.player.x;
    const fromY = this.player.y - 24;
    const toX = target.x;
    const toY = target.y;
    if (id === "fire") {
      sfx.fire();
      for (let i = 0; i < 8; i++) {
        const flame = this.add.circle(fromX, fromY, 8 + (i % 3) * 4, i % 2 ? 0xfff1c9 : 0xff5a1f, 0.92).setDepth(860);
        this.tweens.add({
          targets: flame,
          x: toX + (i - 3.5) * 8,
          y: toY - (i % 4) * 10,
          duration: 200 + i * 26,
          ease: "Quad.easeIn",
          onComplete: () => flame.destroy(),
        });
      }
      this.time.delayedCall(400, () => {
        this.fx.burst(toX, toY, 0xff4d1a, 42);
        this.fx.burst(toX, toY, 0xffd27a, 18);
        this.cameras.main.flash(140, 255, 110, 30);
        this.cameras.main.shake(110, 0.006);
        onHit();
      });
      return;
    }
    sfx.water();
    const ring = this.add.circle(fromX, fromY, 16, 0x4db4ff, 0.35).setDepth(850);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
    const drop = this.add.circle(fromX, fromY - 20, 14, 0x2f7dff, 0.95).setDepth(860);
    this.tweens.add({
      targets: drop,
      x: toX,
      y: toY,
      duration: 300,
      ease: "Quad.easeIn",
      onComplete: () => {
        drop.destroy();
        this.fx.burst(toX, toY, 0x4db4ff, 34);
        this.fx.puff(toX, toY, 0xd7f1ff, 22);
        const splash = this.add.ellipse(toX, toY + 18, 24, 10, 0x7ec8ff, 0.85).setDepth(860);
        this.tweens.add({ targets: splash, scaleX: 5, scaleY: 2.2, alpha: 0, duration: 320, onComplete: () => splash.destroy() });
        this.cameras.main.flash(120, 70, 150, 255);
        onHit();
      },
    });
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
    const pts = Math.round((GAME.scorePerSymbol + (killed ? GAME.scorePerKill * (m.boss ? BOSS.scoreMult : 1) : 0)) * mult * this.streakMult * DIFFICULTY[this.difficulty].scoreMult);
    this.gainMana(MANA.perSymbol + (killed ? MANA.perKill : 0));
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

  /** Keep raw ink, including small or unfamiliar strokes, until explicit submission. */
  private onLanguageStroke(points: Pt[], hand = 0) {
    if (!points.length) return;
    this.languageStrokes.push(points.map(point => ({ ...point })));
    this.casting.holdLast(hand);
    this.refreshLang();
  }

  private clearLanguage() {
    this.languageStrokes = [];
    this.casting.releaseHeld();
    this.refreshLang();
  }

  private submitLanguage(hand = 0) {
    if (!this.lang || this.phase !== "play" || !this.languageStrokes.length || !isScript(this.subject)) return;
    const cards = this.incantation.active ? this.incantation.expectedTokens : this.monsters.filter(m => !m.dying && m.front).map(m => m.front!);
    const marks: string[] = [];
    for (const points of this.languageStrokes) {
      const result = recognizer.recognize(points, nextMarks(cards, marks), undefined, scriptMarks(this.subject),
        Math.max(0, experiment.wantedRecognitionThreshold - (this.subject === "japanese" ? 0.04 : 0)));
      state.lastRecog = result;
      marks.push(result.accepted && result.name ? result.name : "unrecognized");
    }
    const name = langCast(marks);
    this.languageStrokes = [];
    if ((this.subject === "japanese" || this.subject === "chinese") && this.incantation.active) {
      this.routeSpellSign(name);
    } else {
      this.casting.releaseHeld(castColor(name));
      this.casting.cast(name, hand);
    }
    this.refreshLang();
  }

  private refreshLang() {
    if (!this.answerText || !this.lang) return;
    const drawn = this.languageStrokes.length ? `${this.languageStrokes.length} stroke${this.languageStrokes.length === 1 ? "" : "s"}` : "";
    const hint = this.monsters.find((m) => !m.dying && m.prompts[0])?.prompts[0];
    const help = hint ? hintFor(hint) : "";
    const submitHint = this.wave <= 1 ? " / 🤟 to submit" : "";
    if (drawn) this.answerText.setText(`${drawn}${submitHint}`);
    else this.answerText.setText(`${help || "draw the character"}${submitHint}`);
  }

  private onDrawnDigit(points: { x: number; y: number }[], hand = 0) {
    const hit = recognizeDigit(points);
    if (hit && this.routeSpellSign(`digit_${hit.digit}`)) return;
    if (!hit && this.incantation.active) { this.routeSpellSign("unrecognized"); return; }
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
    this.casting.holdLast(hand); // the digits drawn so far stay up until the number is cast
  }

  private onAnswerKey(ev: KeyboardEvent) {
    if (!this.math || this.incantation.active || this.phase !== "play" || ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
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
    this.casting.releaseHeld(castColor(name));
    this.casting.cast(name);
  }

  private miss() {
    this.buffer = "";
    this.answerHold = 0;
    this.languageStrokes = [];
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
    if (this.worldTime < this.shieldUntil) {
      // the shield takes this one, and is used up
      this.shieldUntil = 0;
      this.fx.burst(m.x, m.y, 0x2f9e58, 30);
      this.fx.floatText(this.player.x, this.player.y - 96, "blocked!", "#2f9e58", 26);
      this.cameras.main.shake(120, 0.006);
      sfx.kill();
      m.destroy();
      return;
    }
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
    state.spellGesturesEnabled=false;
    this.incantation.reset();this.setSpellTime(false);
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
