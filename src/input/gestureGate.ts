/** Brief confidence dips pause evidence for 120 ms. Activation still needs a qualifying frame. */
export class GestureGate {
  progress = 0;
  holding = false;
  private since: number | null = null;
  private last = -Infinity;
  private fired = false;
  private settings = "";
  private dipSince: number | null = null;

  update(score: number, now: number, threshold: number, holdMs: number): boolean {
    const settings=`${threshold}/${holdMs}`;
    if(settings!==this.settings || now<this.last){
      this.reset();this.settings=settings;
    }
    if(now===this.last)return false;
    if(now-this.last>200){this.since=null;this.dipSince=null;this.progress=0;}
    this.last=now;
    if(!Number.isFinite(score)){this.reset();return false;}
    if(score<threshold){
      if(this.since!==null || this.fired){
        if(this.dipSince===null)this.dipSince=now;
        if(now-this.dipSince<=120){this.holding=true;return false;}
      }
      this.since=null;this.dipSince=null;this.fired=false;this.progress=0;this.holding=false;
      return false;
    }
    this.holding=true;
    if(this.dipSince!==null){
      if(now-this.dipSince>120){this.since=null;this.fired=false;}
      else if(this.since!==null)this.since+=now-this.dipSince;
      this.dipSince=null;
    }
    if(this.since===null)this.since=now;
    this.progress=this.fired||holdMs===0?1:Math.min(1,(now-this.since)/holdMs);
    if(!this.fired && this.progress>=1){this.fired=true;return true;}
    return false;
  }

  reset(){this.since=null;this.dipSince=null;this.last=-Infinity;this.fired=false;this.progress=0;this.holding=false;}
}
