import type {Env} from './types.ts';
import type {Principal} from './domain.ts';
import {HttpError} from './domain.ts';
import {json} from './input.ts';
import {selectPublicDelivery} from './public-delivery.ts';
import {styleLabels} from '../src/site/discovery.ts';
import {modelStats} from './model-stats.ts';
import type {PrivateObjects} from './types.ts';
import {displayTitle,preferredSafetyPreview,SAFETY_PREVIEW_NAMES} from './catalog-presentation.ts';

type Row={id:string;asset_id:string;title:string;kind:string;published_at:number|null;votes:number;voted:number;type:string|null;style:string|null;metadataSource:string;subject:string};
type Artifact={version_id:string;path:string;sha256:string;bytes:number;media_type:string};
type Facet={value:string;label:string;count:number};
export function voteCountSql(asset:string){return "(SELECT count(*) FROM vote voter JOIN member voting_member ON voting_member.user_id=voter.user_id JOIN user voting_user ON voting_user.id=voter.user_id WHERE voter.asset_id="+asset+" AND voting_member.status='active' AND voting_user.emailVerified=1)";}
function facets(values:Set<string>,counts:Map<string,number>,label:(value:string)=>string):Facet[]{return [...values].sort((a,b)=>a==='unclassified'?1:b==='unclassified'?-1:a.localeCompare(b)).map(value=>({value,label:label(value),count:counts.get(value)??0}));}
export async function catalogDiscovery(request:Request,env:Env,actor:Principal|null,objects:()=>PrivateObjects){
 const params=new URL(request.url).searchParams,allowed=['q','type','style','offset','sort','limit'];
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw new HttpError(400,'invalid_catalog_query');
 const rawQuery=params.get('q')??'';if(rawQuery.length>100)throw new HttpError(400,'query_too_long');const sort=params.get('sort')??'new';if(!['new','top'].includes(sort))throw new HttpError(400,'invalid_catalog_sort');const query=rawQuery.trim(),type=params.get('type')??'',style=params.get('style')??'',rawOffset=params.get('offset')??'0',offset=Number(rawOffset),rawLimit=params.get('limit')??'24',limit=Number(rawLimit);if(!['24','48','96'].includes(rawLimit))throw new HttpError(400,'invalid_catalog_query');
 if(!/^(0|[1-9][0-9]*)$/.test(rawOffset)||!Number.isSafeInteger(offset)||offset>100000)throw new HttpError(400,'invalid_catalog_offset');
 const known=(await env.DB.prepare('SELECT model_type FROM catalog_family_type UNION SELECT model_type FROM catalog_recipe_metadata WHERE recipe_id NOT IN (SELECT family FROM catalog_family_type)').all<{model_type:string}>()).results,types=new Set([...known.map(row=>row.model_type),'unclassified']),styles=new Set(Object.keys(styleLabels));
 if(type&&!types.has(type))throw new HttpError(400,'invalid_catalog_type');if(style&&!styles.has(style))throw new HttpError(400,'invalid_catalog_style');
 const where="(instr(lower(d.title),lower(?))>0 OR instr(lower(replace(replace(d.title,'--',' '),'-',' ')),lower(replace(replace(?,'--',' '),'-',' ')))>0) AND (?='' OR COALESCE(d.model_type,'unclassified')=?) AND (?='' OR COALESCE(d.style_id,'unclassified')=?)",bindings=[query,query,type,type,style,style];
 const results=await env.DB.batch<Record<string,unknown>>([
  env.DB.prepare('SELECT d.id,d.asset_id,d.title,d.kind,d.published_at,d.subject,d.model_type AS type,d.style_id AS style,d.metadata_source AS metadataSource,'+voteCountSql('d.asset_id')+' AS votes,EXISTS(SELECT 1 FROM vote WHERE asset_id=d.asset_id AND user_id=?) AS voted FROM catalog_discovery d WHERE '+where+' ORDER BY '+(sort==='top'?'votes DESC,':'')+'COALESCE(d.published_at,0) DESC,d.id DESC LIMIT ? OFFSET ?').bind(actor?.id??'',...bindings,limit,offset),
  env.DB.prepare('SELECT count(*) AS total FROM catalog_discovery d WHERE '+where).bind(...bindings),
  env.DB.prepare('SELECT model_type,style_id,count(*) AS count FROM catalog_discovery GROUP BY model_type,style_id'),
 ]);
 const rows=results[0]!.results as Row[],total=Number(results[1]!.results[0]?.total??0),counts=results[2]!.results as {model_type:string|null;style_id:string|null;count:number}[],typeCounts=new Map<string,number>(),styleCounts=new Map<string,number>();
 for(const row of counts){const typeKey=row.model_type??'unclassified',styleKey=row.style_id??'unclassified';typeCounts.set(typeKey,(typeCounts.get(typeKey)??0)+row.count);styleCounts.set(styleKey,(styleCounts.get(styleKey)??0)+row.count);}
 const ids=rows.map(row=>row.id),idList=JSON.stringify(ids),marks='SELECT value FROM json_each(?)',names=SAFETY_PREVIEW_NAMES.map(name=>"'"+name+"'").join(','),files=rows.length?(await env.DB.prepare("SELECT version_id,path,sha256,bytes,media_type FROM version_artifact WHERE uploaded=1 AND version_id IN ("+marks+") AND (lower(path) LIKE '%.png' OR lower(path) LIKE '%.jpg' OR lower(path) LIKE '%.jpeg' OR lower(path) LIKE '%.webp') UNION ALL SELECT r.version_id,'safety/'||a.name||'.png',a.sha256,a.bytes,a.media_type FROM safety_report r JOIN safety_attempt t ON t.report_id=r.id JOIN safety_artifact a ON a.attempt_id=t.id WHERE r.version_id IN ("+marks+") AND a.name IN ("+names+") AND r.id=(SELECT r2.id FROM safety_report r2 WHERE r2.version_id=r.version_id ORDER BY r2.created_at DESC,r2.rowid DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM version_artifact va WHERE va.version_id=r.version_id AND va.uploaded=1 AND (lower(va.path) LIKE '%.png' OR lower(va.path) LIKE '%.jpg' OR lower(va.path) LIKE '%.jpeg' OR lower(va.path) LIKE '%.webp'))").bind(idList,idList).all<Artifact>()).results:[],byVersion=new Map<string,Artifact[]>();
 for(const file of files){const group=byVersion.get(file.version_id)??[];group.push(file);byVersion.set(file.version_id,group);}
 const models=rows.map(row=>{const {subject,voted,...model}=row,group=byVersion.get(row.id)??[],selected=selectPublicDelivery(JSON.parse(subject),group).preview??preferredSafetyPreview(group);const preview=selected?{path:selected.path,sha256:selected.sha256,bytes:selected.bytes,media_type:selected.media_type}:null;return {...model,handle:model.title,title:displayTitle(model.title),voted:!!voted,preview};});
 const triCounts=new Map<string,number>();if(models.length)for(const row of (await env.DB.prepare('SELECT version_id,triangles FROM model_stats WHERE version_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(models.map(model=>model.id))).all<{version_id:string;triangles:number}>()).results)triCounts.set(row.version_id,row.triangles);
 const missing=models.filter(model=>!triCounts.has(model.id)),fresh=await Promise.all(missing.map(model=>modelStats(env,objects(),model.id).catch(()=>null)));
 const writes=missing.flatMap((model,index)=>{const triangles=fresh[index]?.triangles;if(typeof triangles!=='number')return [];triCounts.set(model.id,triangles);return [env.DB.prepare('INSERT OR REPLACE INTO model_stats(version_id,triangles,updated_at) VALUES(?,?,?)').bind(model.id,triangles,Date.now())];});if(writes.length)await env.DB.batch(writes).catch(()=>null);
 for(const model of models)Object.assign(model,{triangles:triCounts.get(model.id)??null});
 return json({models,total,offset,limit,nextOffset:offset+rows.length<total?offset+limit:null,facets:{types:facets(types,typeCounts,value=>value==='unclassified'?styleLabels.unclassified!:value),styles:facets(styles,styleCounts,value=>styleLabels[value]!)}});
}
