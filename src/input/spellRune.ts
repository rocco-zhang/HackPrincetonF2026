import { resample } from "./recognizer";
import { pathLength } from "./strokeDetector";
import type { XY } from "./shapes";

function signedArea(points: XY[]) {
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    area+=a.x*b.y-b.x*a.y;
  }
  return area/2;
}

/** A reserved horizontal two-loop rune; independent of ordinary-symbol acceptance settings. */
export function isInfinityRune(raw: XY[]): boolean {
  if(raw.length<20 || pathLength(raw)<200)return false;
  const xs=raw.map(p=>p.x),ys=raw.map(p=>p.y);
  const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;
  // A normal upright math 8 is deliberately excluded.
  if(w<90 || h<35 || w/h<1.5 || w/h>3.8)return false;
  if(Math.hypot(raw[0].x-raw.at(-1)!.x,raw[0].y-raw.at(-1)!.y)>w*.3)return false;
  const points=resample(raw,96).map(p=>({x:(p.x-x0)/w-.5,y:(p.y-y0)/h-.5}));
  const left=signedArea(points.filter(p=>p.x<0)),right=signedArea(points.filter(p=>p.x>=0));
  // Oppositely wound, substantial lobes distinguish an infinity stroke from a circle or spiral.
  if(left*right>=0 || Math.min(Math.abs(left),Math.abs(right))<.08)return false;
  let best=Infinity;
  for(let phase=0;phase<24;phase++)for(const direction of [-1,1]){
    const template=Array.from({length:193},(_,i)=>{
      const t=phase*Math.PI/12+direction*i*Math.PI*2/192;
      return {x:.5*Math.sin(t),y:.5*Math.sin(2*t)};
    });
    const sampled=resample(template,96);
    const error=points.reduce((sum,p,i)=>sum+(p.x-sampled[i].x)**2+(p.y-sampled[i].y)**2,0)/points.length;
    best=Math.min(best,Math.sqrt(error));
  }
  return best<.15;
}
