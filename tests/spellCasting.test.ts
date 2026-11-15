import { describe, expect, it } from "vitest";
import { ASL_LETTERS } from "../src/asl/hand";
import { INCANTATION, SpellCasting, spellFailureCost, spellRecipes } from "../src/game/spellCasting";
import { SPELL_IDS, SPELLS, type Loadout } from "../src/game/spells";
import { SUBJECTS } from "../src/game/subjects";
import { CHINESE, CHINESE_MORE, langCast, scriptMarks } from "../src/game/languages";

const deck:Loadout=["fire","water"];
function startFire(caster:SpellCasting){
  caster.beginFrom("spell_thumbs_up",deck,"asl",100,0);
  caster.input("asl_F",0);
}
describe("spell incantations",()=>{
  it("gives every possible equipped pair distinct starting signs in every subject",()=>{
    for(const subject of SUBJECTS)for(let i=0;i<SPELL_IDS.length;i++)for(let j=i+1;j<SPELL_IDS.length;j++){
      const recipes=spellRecipes([SPELL_IDS[i],SPELL_IDS[j]],subject);
      expect(recipes[0].steps[0].token).not.toBe(recipes[1].steps[0].token);
      expect(recipes.every(r=>r.steps.length>=3)).toBe(true);
      expect(spellRecipes([SPELL_IDS[i],SPELL_IDS[j]],subject)).toEqual(recipes);
      for(const r of recipes)for(const step of r.steps){
        if(subject==="asl")expect(ASL_LETTERS).toContain(step.token.slice(4));
        if(subject==="japanese") expect(step.token).toMatch(/^lang_(shi|ku|no|vline-vline)$/);
        if(subject==="chinese") expect([...CHINESE, ...CHINESE_MORE].map(item => langCast(item.strokes))).toContain(step.token);
        if(subject==="korean")expect(scriptMarks(subject)).toContain(step.token);
      }
    }
  });
  it("starts on the first sign, consumes it, and casts only after the final sign",()=>{
    const caster=new SpellCasting(), recipe=spellRecipes(deck,"asl")[0];
    expect(caster.beginFrom("asl_X",deck,"asl",100,0)).toBe(false);
    expect(caster.beginFrom(recipe.steps[0].token,deck,"asl",100,0)).toBe(false);
    expect(caster.beginFrom("spell_thumbs_up",deck,"asl",100,0)).toBe(true);
    expect(caster.active?.step).toBe(0);
    for(let i=0;i<recipe.steps.length;i++){
      const result=caster.input(recipe.steps[i].token,i*500);
      if(i===recipe.steps.length-1)expect(result).toEqual({id:"fire",success:true,reason:undefined});
      else expect(result).toBeNull();
    }
    expect(caster.active).toBeNull();expect(caster.input(recipe.steps.at(-1)!.token,2200)).toBeNull();
  });
  it("completes either equipped recipe using its subject's actual input tokens",()=>{
    for(const subject of SUBJECTS)for(let i=0;i<SPELL_IDS.length;i++)for(let j=i+1;j<SPELL_IDS.length;j++){
      const loadout:Loadout=[SPELL_IDS[i],SPELL_IDS[j]];
      for(const recipe of spellRecipes(loadout,subject)){
        const caster=new SpellCasting();
        expect(caster.beginFrom("spell_thumbs_up",loadout,subject,100,0)).toBe(true);
        for(let n=0;n<recipe.steps.length;n++){
          const result=caster.input(recipe.steps[n].token,n*500);
          if(n===recipe.steps.length-1)expect(result).toMatchObject({id:recipe.id,success:true});
          else expect(result).toBeNull();
        }
        expect(caster.active).toBeNull();
      }
    }
  });
  it("requires the reserved thumbs-up gesture and uses the first alphabet sign only after arming",()=>{
    const caster=new SpellCasting();
    expect(caster.beginFrom("spell_infinity",deck,"asl",100,0)).toBe(false);
    for(const recipe of spellRecipes(deck,"asl"))expect(caster.beginFrom(recipe.steps[0].token,deck,"asl",100,0)).toBe(false);
    expect(caster.beginFrom("spell_thumbs_up",deck,"asl",100,0)).toBe(true);
    expect(caster.options).toHaveLength(2);
    caster.input("asl_W",500);
    expect(caster.active?.id).toBe("water");expect(caster.active?.step).toBe(1);expect(caster.options).toHaveLength(1);
  });
  it("rejects wrong signs without restarting or casting another spell",()=>{
    const caster=new SpellCasting();
    startFire(caster);
    expect(caster.beginFrom("asl_W",deck,"asl",100,100)).toBe(false);
    expect(caster.input("asl_W",100)).toMatchObject({id:"fire",success:false,reason:"wrong sign"});
    expect(caster.active).toBeNull();expect(caster.tick(9000)).toBeNull();
  });
  it("uses real-time per-input deadlines even if the world is slowed",()=>{
    const caster=new SpellCasting();startFire(caster);
    expect(caster.tick(INCANTATION.inputMs-1)).toBeNull();
    expect(caster.tick(INCANTATION.inputMs)).toMatchObject({success:false,reason:"too slow"});
    expect(caster.active).toBeNull();
  });
  it("rejects a correct sign arriving at the deadline instead of casting it late",()=>{
    const caster=new SpellCasting();startFire(caster);
    expect(caster.input("asl_I",INCANTATION.inputMs)).toMatchObject({success:false,reason:"too slow"});
    expect(caster.active).toBeNull();
  });
  it("enforces the total deadline even while making progress",()=>{
    const caster=new SpellCasting({inputMs:4000,totalMs:1000});
    startFire(caster);
    caster.input("asl_I",500);
    expect(caster.tick(999)).toBeNull();
    expect(caster.tick(1000)).toMatchObject({success:false,reason:"too slow"});
  });
  it("does not start without full mana, and cancellation is penalized only once",()=>{
    const caster=new SpellCasting();
    expect(caster.beginFrom("spell_thumbs_up",deck,"asl",SPELLS.fire.cost-1,0)).toBe(false);
    startFire(caster);
    expect(caster.cancel(500)).toMatchObject({id:"fire",success:false,reason:"cancelled"});
    expect(caster.cancel(501)).toBeNull();
    expect(caster.beginFrom("spell_thumbs_up",deck,"asl",100,501)).toBe(false);
    expect(caster.beginFrom("spell_thumbs_up",deck,"asl",100,500+INCANTATION.cooldownMs)).toBe(true);
    expect(spellFailureCost("fire")).toBe(8);
    caster.reset();expect(caster.active).toBeNull();
  });
});
