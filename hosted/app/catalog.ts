import {modelReport} from './member-safety.ts';
import records from 'virtual:hosted-trusted-recipes';
import {matchTrustedRecipe} from './runtime-identity.ts';
import {brandArtwork} from '../../src/site/brand.ts';
import {el,link,input,button,status,heading,empty,action,when} from '../shared/dom.ts';
import {verifyArtifact,explain,ApiFailure} from '../shared/http.ts';
import {readCatalogFilters,catalogSearch,catalogFilterForm} from './discovery.ts';
import type {Context,ModelDetail,Artifact,CatalogPage} from './types.ts';
import {downloadLabel} from './download-labels.ts';
import {modelCommunity} from './community.ts';
import {resolvePreset} from './preset-resolve.ts';
import {trimPreview} from '../shared/trim-preview.ts';
import {describeModel,factsList,fileSlug,recipeSourceButton,recipeDescription,usageBlock} from './model-facts.ts';
import './recipe.css';
const CARD_FILL=[239,240,236] as const;
const voteLabel=(count:number)=>count+' '+(count===1?'vote':'votes');
const bytesLabel=(size:number)=>size<1024?size+' B':size<1024*1024?(size/1024).toFixed(1)+' KB':(size/1024/1024).toFixed(1)+' MB';
export async function catalog(context:Context){
 let active=true,revision=0;const pending=new Set<AbortController>(),observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);void previews.get(entry.target)?.();}},{rootMargin:'160px'}),previews=new Map<Element,()=>Promise<void>>();context.resources.add(()=>{active=false;revision++;observer.disconnect();for(const request of pending)request.abort();});
 const filters=readCatalogFilters(new URLSearchParams(location.search)),root=el('section','hosted-catalog'),layout=el('div','hosted-catalog-layout'),sidebar=el('aside'),content=el('section'),summary=status('Loading models…'),results=el('div'),paging=el('nav','actions'),form=catalogFilterForm(filters,{types:[],styles:[]});sidebar.setAttribute('aria-label','Model filters');paging.setAttribute('aria-label','Model pages');sidebar.append(form);content.append(summary,results,paging);layout.append(sidebar,content);root.append(heading('Find your next model.','Browse individual published models by name, type and style. Keep the editable source for your next change.'),layout);
 async function refresh(){
  const current=++revision;summary.textContent='Loading models…';content.setAttribute('aria-busy','true');results.replaceChildren();paging.replaceChildren();observer.disconnect();previews.clear();
  try{
   const data=await context.api.json<CatalogPage>('/api/catalog'+catalogSearch(filters));if(!active||current!==revision)return;
   sidebar.replaceChildren(catalogFilterForm(filters,{types:data.facets.types.map(facet=>[facet.value,facet.label+' ('+facet.count+')']),styles:data.facets.styles.map(facet=>[facet.value,facet.label+' ('+facet.count+')'])}));
   const labels=(value:string|null,kind:'types'|'styles')=>data.facets[kind].find(facet=>facet.value===(value??'unclassified'))?.label??'Unclassified';
   summary.textContent=data.models.length?'Showing '+(data.offset+1)+'–'+(data.offset+data.models.length)+' of '+data.total+' '+(data.total===1?'model.':'models.'):'0 models on this page.';
   const grid=el('div','hosted-model-grid');results.append(grid);
   let shown=0;const addCards=(models:CatalogPage['models'])=>{for(const model of models){
    const target='/asset/'+encodeURIComponent(model.id)+catalogSearch(filters),visual=el('div','hosted-model-visual'),placeholder=el('div','hosted-model-placeholder',brandArtwork('logo'),el('span','','No preview published'));visual.append(placeholder);
    const editable=model.kind!=='static'||!!resolvePreset({handle:model.handle,title:model.handle});
    const tags=el('div','card-tags',...(model.type?[el('span','pill',labels(model.type,'types'))]:[]),...(editable?[el('span','pill editable','Editable')]:[]));
    const facts=[model.triangles?model.triangles.toLocaleString('en-US')+' tris':'',model.votes?voteLabel(model.votes):''].filter(Boolean).join(' · ');
    const card=link('',target,'hosted-model-card');card.setAttribute('aria-label',model.title);card.append(visual,el('div','hosted-model-copy',el('h2','',model.title),el('p','muted card-facts',facts||'Published model'),tags));grid.append(card);
    if(model.preview){
     const file=model.preview;placeholder.lastElementChild!.textContent='Preview loading…';
     const image=el('img');void previews;image.alt=model.title+' published preview';image.loading=shown<8?'eager':'lazy';image.decoding='async';image.width=512;image.height=512;image.src='/api/catalog/'+encodeURIComponent(model.id)+'/files?path='+encodeURIComponent(file.path)+'&v='+file.sha256.slice(0,16);image.addEventListener('load',()=>{if(!active||current!==revision)return;trimPreview(image,CARD_FILL);visual.replaceChildren(image);},{once:true});image.addEventListener('error',()=>{if(active&&current===revision)placeholder.lastElementChild!.textContent='Preview unavailable';},{once:true});
    }
    shown++;
   }};
   addCards(data.models);
   if(!data.models.length){const filtered=!!(filters.query||filters.type||filters.style),pastPage=data.offset>0;results.append(empty(pastPage?'No models on this page':filtered?'No matching models':'The catalog is getting ready.',pastPage?'Published models can change while you browse. Return to the first page.':filtered?'Try fewer filters or clear them to see every published model.':'Published models will appear here after their review and release.'),link(pastPage?'Return to first page':'Clear filters and show all models',pastPage?'/catalog'+catalogSearch({...filters,offset:'0'}):'/catalog','button-secondary'));}
   if(data.offset>0)paging.append(link('Previous','/catalog'+catalogSearch({...filters,offset:String(Math.max(0,data.offset-data.limit))}),'button-secondary'));if(data.nextOffset!==null)paging.append(link('Next','/catalog'+catalogSearch({...filters,offset:String(data.nextOffset)}),'button-secondary'));let nextOffset=data.nextOffset;if(nextOffset!==null){const more=button('Load more models','button-primary');more.addEventListener('click',async()=>{if(nextOffset===null)return;more.disabled=true;more.textContent='Loading…';try{const page=await context.api.json<CatalogPage>('/api/catalog'+catalogSearch({...filters,offset:String(nextOffset)}));if(!active||current!==revision)return;addCards(page.models);nextOffset=page.nextOffset;summary.textContent='Showing '+(data.offset+1)+'–'+(page.offset+page.models.length)+' of '+page.total+' models.';if(nextOffset===null)more.remove();else{more.disabled=false;more.textContent='Load more models';}}catch{more.disabled=false;more.textContent='Retry loading more';}});paging.prepend(more);}paging.querySelector('a')?.setAttribute('aria-label',data.offset>0?'Previous models page':'Next models page');if(data.offset>0&&data.nextOffset!==null)paging.lastElementChild!.setAttribute('aria-label','Next models page');
  }catch(error){if(!active||current!==revision)return;summary.textContent=error instanceof ApiFailure?({invalid_catalog_type:'Choose an available model type.',invalid_catalog_style:'Choose an available model style.',invalid_catalog_offset:'Choose a valid models page.',invalid_catalog_query:'Check the model filters and try again.',query_too_long:'Use a model name of up to 100 characters.'} as Record<string,string>)[error.code]??explain(error):explain(error);const retry=button('Retry models','button-secondary');retry.addEventListener('click',()=>void refresh());results.replaceChildren(retry);}
  finally{if(active&&current===revision)content.setAttribute('aria-busy','false');}
 }
 void refresh();return root;
}
async function checkedBytes(context:Context,id:string,file:Artifact){
 const bytes=await context.api.bytes('/api/catalog/'+encodeURIComponent(id)+'/files?path='+encodeURIComponent(file.path));await verifyArtifact(bytes,file);return bytes;
}
export async function model(context:Context,id:string){
 const data=await context.api.json<ModelDetail>('/api/catalog/'+encodeURIComponent(id)),root=el('section'),feedback=status();
 root.append(link('Back to models','/catalog'+catalogSearch(readCatalogFilters(new URLSearchParams(location.search))),'back-link'),heading(data.title,describeModel(data,null)),feedback);
 const editable=!!(matchTrustedRecipe(records,data)&&data.artifacts.some(file=>file.path==='selected.design.json'))||data.capabilities.includes('controls')||data.artifacts.some(file=>file.path.endsWith('.controls.json'));
 const trustedStudio=!!(matchTrustedRecipe(records,data)&&data.sourcePackage&&data.artifacts.some(file=>file.path==='selected.design.json'));
 if(editable&&!trustedStudio)root.append(link('Customize this model','/asset/'+id+'?edit=1','button'));
 const indexedRecipe=resolvePreset({title:data.title,handle:data.handle,candidate:data.candidate,sourceFamily:data.sourceFamily,design:data.design});
 const recipeMatch=indexedRecipe??(data.sourceFamily?{family:data.sourceFamily,version:'1.0.0',applied:{},hint:[data.candidate,data.handle,data.title].filter(Boolean).join(' ')}:null);
 const family=recipeMatch?.family??null,glb=data.artifacts.find(file=>file.path==='selected.glb'||file.path==='published.glb');
 const preview=el('div','private-preview published-preview'),previewStatus=status('Looking for a published preview…');preview.append(previewStatus);
 const body=el('div','panel',factsList(data,glb?.bytes??null,!!recipeMatch||data.kind!=='static'),el('p','muted','Published '+when(data.published_at)));
 body.prepend(await modelCommunity(context,id));
 const vote=button(data.voted?'Remove my vote':'Vote for this model','button-secondary'),votes=el('span','muted',voteLabel(data.votes));
 vote.addEventListener('click',()=>void action(vote,feedback,async()=>{if(context.member.status==='guest'){location.assign('/sign-in');return;}
  const result=await context.api.json<{votes:number}>('/api/catalog/'+encodeURIComponent(data.asset_id)+'/vote',{method:data.voted?'DELETE':'PUT',...(data.voted?{}:{body:'{}'})});data.voted=!data.voted;vote.textContent=data.voted?'Remove my vote':'Vote for this model';votes.textContent=voteLabel(result.votes);feedback.textContent=data.voted?'Your vote is saved.':'Your vote was removed.';
 }));body.append(el('div','actions',vote,votes),el('h2','','Take it into your project'));
 const files=data.artifacts.filter(file=>data.delivery?.primary.includes(file.path)),downloads=el('ul','download-list');
 for(const file of files){
  const label=downloadLabel(file.path)??(file.path.endsWith('.zip')?(data.capabilities.includes('download:source')&&files.filter(candidate=>candidate.path.endsWith('.zip')).length===1?'Download editable source':'Download ZIP'):file.path.endsWith('.design.json')?'Save design':file.path.split('/').at(-1)??'Download file');
  const download=button(label,'button-secondary');download.addEventListener('click',()=>void action(download,feedback,async()=>{
   const bytes=await checkedBytes(context,id,file),url=context.resources.create(new Blob([Uint8Array.from(bytes)],{type:file.media_type})),a=link('',url);a.download=file.path.endsWith('.glb')?fileSlug(data.title)+'.glb':file.path.split('/').at(-1)??'download';a.click();feedback.textContent='Verified download ready: '+a.download+'.';
  }));download.title=file.path;downloads.append(el('li','',download,el('span','muted',bytesLabel(file.bytes))));
 }
 if(family&&!data.sourcePackage){const source=recipeSourceButton(family,feedback);if(source)downloads.append(el('li','',source,el('span','muted','.mjs')));}
 if(files.length)body.append(downloads);
 if(!files.length)body.append(el('p','muted','This published model has no downloadable artifacts listed.'));
 root.append(el('div','split published-model',preview,body),usageBlock(data,family));root.append(modelReport(context,id));
 const details=el('details','panel design-details',el('summary','','Saved design details'),el('pre','file-list',JSON.stringify(data.design,null,2)));root.append(details);
 const image=data.artifacts.find(file=>file.path===data.delivery?.preview);
 const showImage=async()=>{if(!image){previewStatus.textContent='No image preview was published for this model.';return;}const bytes=await checkedBytes(context,id,image),img=el('img');img.alt=data.title+' published preview';img.src=context.resources.create(new Blob([Uint8Array.from(bytes)],{type:/\.jpe?g$/i.test(image.path)?'image/jpeg':/\.webp$/i.test(image.path)?'image/webp':'image/png'}));await img.decode();trimPreview(img);preview.replaceChildren(img);};
 const blurb=root.querySelector('.page-heading p');
 const markEditable=()=>{void recipeDescription(family??undefined).then(text=>{if(blurb)blurb.textContent=describeModel(data,text);});};
 let live=false;
 if(trustedStudio){
  const {editor}=await import('./editor.ts');
  const studio=await editor(context,id,true);
  root.insertBefore(studio,root.querySelector('.published-model'));
  if(studio.querySelector('.parameter'))markEditable();
  try{await showImage();}catch{previewStatus.textContent='Published preview unavailable.';}
 }else if(recipeMatch){
  previewStatus.textContent='Loading the editable model…';
  try{
   const {mountRecipe}=await import('./recipe-viewer.ts');
  context.resources.add(await mountRecipe(preview,recipeMatch,document.createElement('div')));
   for(const anchor of root.querySelectorAll('a'))if(anchor.textContent==='Customize this model')anchor.remove();
      markEditable();
   live=true;
  }catch(error){live=false;if(!(error instanceof Error&&error.message==='Missing recipe module'))console.error('editable model failed', error);}
 }
 if(!trustedStudio&&!live&&glb){
  previewStatus.textContent='Loading the 3D model…';
  try{const bytes=await checkedBytes(context,id,glb);const {mountOrbit}=await import('./orbit-viewer.ts');context.resources.add(await mountOrbit(preview,bytes));}
  catch{try{await showImage();}catch{previewStatus.textContent='The 3D model is unavailable. Downloads remain checked separately.';}}
 }else if(!trustedStudio&&!live){try{await showImage();}catch{previewStatus.textContent='The verified preview is unavailable. Downloads remain checked separately.';}}
 return root;
}
