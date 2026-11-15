import { scriptMarks, MARK_GLYPH } from "./languages";
import { SPELL_IDS, SPELLS, type Loadout, type SpellId } from "./spells";
import { isScript, type Subject } from "./subjects";

export const INCANTATION = { timeScale: .12, inputMs: 4000, totalMs: 14000, failureFraction: .25, cooldownMs: 750 };
export type SpellStep = { label: string; token: string; hint: string };
export type SpellAttempt = { id: SpellId; steps: SpellStep[]; step: number; started: number; advanced: number };
export type SpellResult = { id: SpellId; success: boolean; reason?: "wrong sign" | "too slow" | "cancelled" };
const WORDS: Record<SpellId,string> = {fire:"FIRE",water:"WAVE",bomb:"BOMB",freeze:"ICE",shield:"SAFE",heal:"HEAL"};
const SHAPES = ["hline","circle","v","vline","caret","zigzag"];
const GLYPHS: Record<string,string> = {...MARK_GLYPH,v:"V",zigzag:"W"};
const KOREAN = ["giyeok","circle","nieun","vline","hline","caret"];
const KOREAN_LABELS: Record<string,string> = {giyeok:"ㄱ",circle:"ㅇ",nieun:"ㄴ",vline:"ㅣ",hline:"ㅡ",caret:"ㅅ"};

/** Recipes stay fixed for a deck and subject; equipped spells always have distinct first signs. */
export function spellRecipes(loadout: Loadout, subject: Subject): {id:SpellId;steps:SpellStep[]}[] {
  const used=new Set<string>();
  return loadout.map(id=>{
    if(subject==="asl")return {id,steps:[...WORDS[id]].map(letter=>({label:letter,token:`asl_${letter}`,hint:`Hold the ASL handshape for ${letter}`}))};
    const alphabet=subject==="korean"?KOREAN:isScript(subject)?scriptMarks(subject):subject==="math"?["1","2","3","4","5","6"]:SHAPES;
    const index=SPELL_IDS.indexOf(id);
    let first=index%alphabet.length;
    while(used.has(alphabet[first]))first=(first+1)%alphabet.length;
    used.add(alphabet[first]);
    const signs=[alphabet[first],alphabet[(index+2)%alphabet.length],alphabet[(index+4)%alphabet.length]];
    return {id,steps:signs.map(sign=>{
      const label=subject==="korean"?KOREAN_LABELS[sign]:subject==="math"?sign:GLYPHS[sign]??sign;
      return {label,token:subject==="math"?`digit_${sign}`:sign,hint:subject==="korean"?`Draw ${label} in one stroke`:subject==="math"?`Draw ${sign}`:`Draw ${label}`};
    })};
  });
}

/** Real-time deadlines never depend on the slowed scene clock. The first sign commits immediately. */
export class SpellCasting {
  active: SpellAttempt | null = null;
  private choices: {id:SpellId;steps:SpellStep[]}[] = [];
  private readyAt = 0;
  constructor(private deadlines: Pick<typeof INCANTATION,"inputMs"|"totalMs"> = INCANTATION) {}
  beginFrom(token: string, loadout: Loadout, subject: Subject, mana: number, now: number) {
    if(token!=="spell_thumbs_up" || this.active || now<this.readyAt)return false;
    this.choices=spellRecipes(loadout,subject).filter(r=>mana>=SPELLS[r.id].cost);
    if(!this.choices.length)return false;
    this.active={...this.choices[0],step:0,started:now,advanced:now};return true;
  }
  get options() {return this.active ? this.choices.length>1?this.choices.map(r=>({...this.active!,...r,step:0})):[this.active]:[];}
  get expectedTokens() {return this.options.map(a=>a.steps[a.step].token);}
  get expected() {const a=this.active;return a?.steps[a.step]?.token??null;}
  remaining(now: number) {const a=this.active;return a?Math.max(0,Math.min(this.deadlines.inputMs-(now-a.advanced),this.deadlines.totalMs-(now-a.started))):0;}
  tick(now: number): SpellResult | null {return this.active && this.remaining(now)<=0?this.finish(false,now,"too slow"):null;}
  input(token: string, now: number): SpellResult | null {
    const expired=this.tick(now);if(expired)return expired;
    let a=this.active;if(!a)return null;
    if(this.choices.length>1){
      const selected=this.choices.find(r=>r.steps[0].token===token);
      if(!selected)return this.finish(false,now,"wrong sign");
      a=this.active={...a,...selected};this.choices=[];
    }
    if(token!==this.expected)return this.finish(false,now,"wrong sign");
    a.step++;a.advanced=now;
    return a.step===a.steps.length?this.finish(true,now):null;
  }
  cancel(now: number) {return this.active?this.finish(false,now,"cancelled"):null;}
  reset() {this.active=null;this.choices=[];this.readyAt=0;}
  private finish(success: boolean, now: number, reason?: SpellResult["reason"]): SpellResult {
    const id=this.active!.id;this.active=null;this.choices=[];this.readyAt=now+INCANTATION.cooldownMs;return {id,success,reason};
  }
}
export const spellFailureCost = (id: SpellId) => Math.ceil(SPELLS[id].cost*INCANTATION.failureFraction);
