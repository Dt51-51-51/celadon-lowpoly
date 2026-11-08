import {communityModeration} from './community-moderation.ts';
import {addressBlockRoutes,enforceAddress} from './address-blocks.ts';
import {admissionError} from './budgets.ts';
import type {Env} from './types.ts';
import {authentication,authenticationHeaders} from './auth.ts';
import {principal,mutationOrigin,optionalPrincipal} from './access.ts';
import {HttpError} from './domain.ts';
import {processingRoutes} from './processing.ts';
import {processorAdminRoutes} from './processors.ts';
import {accountRoutes} from './accounts.ts';
import {catalogRoutes} from './catalog.ts';
import {versionRoutes} from './versions.ts';
import {moderationRoutes} from './moderation.ts';
import {communityRoutes} from './community.ts';
import {collectionRoutes} from './collections.ts';
import {uploadRoutes} from './uploads.ts';
import {reviewQueueRoutes} from './review-queue.ts';
import {appealRoutes} from './appeals.ts';
import {privateObjects} from './storage.ts';
import {mailConfigured} from './mail.ts';
import {publicResponse,protectedDocument,documentNavigation,publicCatalogRead} from './public.ts';

export function json(value:unknown,status=200):Response{return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8'}});}
function secured(response:Response):Response {
 const headers=new Headers(response.headers),immutable=response.ok&&headers.get('cache-control')==='public, max-age=31536000, immutable';if(!immutable){headers.set('cache-control','private, no-store');headers.set('vary','Cookie, Authorization');}headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','same-origin');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  try{
   const url=new URL(request.url);
   if(env.APP_ENV==='local'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new HttpError(503,'local_mode_requires_loopback');
   if(url.pathname.startsWith('/api/auth/')){
    if(request.method==='POST'&&url.pathname==='/api/auth/sign-in/magic-link'&&!mailConfigured(env))throw new HttpError(503,'mail_provider_unconfigured');
    return secured(await authentication(env).handler(new Request(request,{headers:authenticationHeaders(request,env)})));
   }
   if(url.pathname==='/health'&&request.method==='GET'){let storage='unconfigured';try{privateObjects(env);storage=env.APP_ENV==='local'?'local-simulation':'supabase-configured';}catch{}return json({status:'ok',privateStorage:storage,privateStorageCheck:'configuration-only'});}
   const publicAsset=await publicResponse(request,env);if(publicAsset)return publicAsset;
   if(['/','/docs','/legal','/help','/sign-in'].includes(url.pathname)&&request.method==='GET')return new Response('<!doctype html><meta charset="utf-8"><title>Polyspoon</title><h1>Polyspoon</h1><p>Private marketplace service. The public shell and authenticated application are separate builds.</p>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
   if((['POST','PUT'].includes(request.method)||(request.method==='DELETE'&&(url.pathname.startsWith('/api/community/')||url.pathname.startsWith('/api/collections'))))&&(url.pathname.startsWith('/api/versions')||url.pathname.startsWith('/api/review-evidence/')||url.pathname==='/api/account/tokens'||url.pathname.endsWith('/reports')||url.pathname.startsWith('/api/community/')||url.pathname.startsWith('/api/collections')||url.pathname.startsWith('/api/uploads')||url.pathname.startsWith('/api/processor/')))await enforceAddress(request,env);
   const processing=await processingRoutes(request,env,url.pathname,()=>privateObjects(env));if(processing)return secured(processing);
   if(unknownPage(request,url.pathname))return secured(new Response(NOT_FOUND_PAGE,{status:404,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}));
   const open=publicCatalogRead(request.method,url.pathname);
   const actor=open?await optionalPrincipal(request,env):await principal(request,env,true);
   if(!actor){const response=await catalogRoutes(request,env,null,url.pathname,()=>privateObjects(env));if(response)return secured(response);throw new HttpError(404,'not_found');}
   mutationOrigin(request,env,actor);
   if(url.pathname==='/api/me'&&request.method==='GET'){const user=await env.DB.prepare('SELECT email,name FROM user WHERE id=?').bind(actor.id).first<{email:string;name:string}>();if(!user)throw new HttpError(401,'authentication_required');return secured(json({id:actor.id,email:user.email,displayName:user.name,status:actor.status,verified:actor.verified,capabilities:actor.capabilities,scopes:actor.scopes??null}));}
   const restrictedPath=['/api/account/restriction','/api/account/appeals'].includes(url.pathname);
   const shell=['/app','/catalog'].includes(url.pathname)||url.pathname.startsWith('/app/');
   if(actor.status==='suspended'&&!restrictedPath&&!shell)throw new HttpError(403,'account_restricted');
   const objects=()=>privateObjects(env);
   const response=await communityModeration(request,env,actor,url.pathname)??await addressBlockRoutes(request,env,actor,url.pathname)??await processorAdminRoutes(request,env,actor,url.pathname)??await accountRoutes(request,env,actor,url.pathname)??await catalogRoutes(request,env,actor,url.pathname,objects)??await versionRoutes(request,env,actor,url.pathname,objects)??await uploadRoutes(request,env,actor,url.pathname,objects)??await reviewQueueRoutes(request,env,actor,url.pathname,objects)??await appealRoutes(request,env,actor,url.pathname)??await moderationRoutes(request,env,actor,url.pathname)??await communityRoutes(request,env,actor,url.pathname)??await collectionRoutes(request,env,actor,url.pathname);
   if(response)return secured(response);
   throw new HttpError(404,'not_found');
  }catch(caught){let error=caught;try{admissionError(caught);}catch(mapped){error=mapped;}if(error instanceof HttpError){const path=new URL(request.url).pathname;if(protectedDocument(path)&&documentNavigation(request)){if(error.status===401)return secured(new Response(null,{status:302,headers:{location:'/sign-in'}}));if(error.code==='account_restricted')return secured(new Response(null,{status:302,headers:{location:'/catalog'}}));if(error.status===403)return secured(new Response('<!doctype html><meta charset="utf-8"><title>Access restricted</title><h1>Access restricted</h1><p>This account cannot access the marketplace.</p>',{status:403,headers:{'content-type':'text/html; charset=utf-8'}}));}return secured(json({error:error.code},error.status));}console.error('Marketplace request failed',error instanceof Error?error.message:'unknown');return secured(json({error:'internal_error'},500));}
 },
};

const NOT_FOUND_PAGE='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Polyspoon</title><style>body{font-family:system-ui,sans-serif;background:#f7f9fc;color:#1d2433;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem;text-align:center}a{display:inline-block;margin:.4rem;padding:.6rem 1.1rem;border-radius:999px;background:#1d2433;color:#fff;text-decoration:none}a.secondary{background:#e6e9ef;color:#1d2433}</style></head><body><main><h1>Page not found</h1><p>This page does not exist on Polyspoon.</p><a href="/">Home</a><a class="secondary" href="/catalog">Browse models</a></main></body></html>';
/** Unknown non-API document paths get a real 404 page instead of an authentication error. */
export function unknownPage(request:Request,path:string){
 if(!['GET','HEAD'].includes(request.method))return false;
 if(path.startsWith('/api/')||path==='/app'||path.startsWith('/app/')||path.startsWith('/asset/'))return false;
 return !['/catalog','/contribute','/editor','/health'].includes(path);
}
