import type {Env,PrivateObjects} from './types.ts';
import {deliver} from './delivery.ts';
import {glbStats,type ModelStats} from './glb-stats.ts';
const cacheKey=(id:string)=>'https://model-stats.polyspoon.invalid/v2/'+id;
const store=()=>typeof caches==='undefined'?null:(caches as unknown as {default:Cache}).default;
export async function modelStats(env:Env,objects:PrivateObjects,id:string):Promise<ModelStats|null>{
 const cache=store(),cached=await cache?.match(cacheKey(id));if(cached)return await cached.json() as ModelStats|null;
 let stats:ModelStats|null=null;
 try{const response=await deliver(new Request('https://polyspoon.invalid/'),env,null,objects,id,'published.glb');if(response.ok)stats=glbStats(new Uint8Array(await response.arrayBuffer()));}catch{stats=null;}
 if(stats)await cache?.put(cacheKey(id),new Response(JSON.stringify(stats),{headers:{'content-type':'application/json','cache-control':'public, max-age=31536000, immutable'}}));
 return stats;
}
