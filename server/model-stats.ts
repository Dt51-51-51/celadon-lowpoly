import type {Env,PrivateObjects} from './types.ts';
import {deliver} from './delivery.ts';
import {glbStats,type ModelStats} from './glb-stats.ts';
const cacheKey=(id:string,glb:string)=>'https://model-stats.polyspoon.invalid/v3/'+id+'/'+glb;
const publishedGlb=async(env:Env,id:string)=>(await env.DB.prepare('SELECT n.sha256 AS sha FROM safety_normalized n JOIN safety_attempt t ON t.id=n.attempt_id WHERE t.report_id=(SELECT r.id FROM safety_report r WHERE r.version_id=? ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1)').bind(id).first<{sha:string}>())?.sha??'source';
const store=()=>typeof caches==='undefined'?null:(caches as unknown as {default:Cache}).default;
export async function modelStats(env:Env,objects:PrivateObjects,id:string):Promise<ModelStats|null>{
 const cache=store(),key=cacheKey(id,await publishedGlb(env,id)),cached=await cache?.match(key);if(cached)return await cached.json() as ModelStats|null;
 let stats:ModelStats|null=null;
 try{const response=await deliver(new Request('https://polyspoon.invalid/'),env,null,objects,id,'published.glb');if(response.ok)stats=glbStats(new Uint8Array(await response.arrayBuffer()));}catch{stats=null;}
 if(stats)await cache?.put(key,new Response(JSON.stringify(stats),{headers:{'content-type':'application/json','cache-control':'public, max-age=31536000, immutable'}}));
 return stats;
}
