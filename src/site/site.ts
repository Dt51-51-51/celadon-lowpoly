import {brandArtwork} from './brand.ts';
import './site.css';
import './workspace.css';
import type { WorkspaceActions } from './workspace.ts';
import { mountWorkspace } from './workspace.ts';
import { mountUsage } from './usage.ts';
import { catalog,descriptor,buildAsset,disposeAsset } from '../catalog/index.ts';
import { recipe } from '../recipes/index.ts';
import { createContributePage } from './contribute.ts';
import { createLandingPage, createDocsPage, createFooter } from './entry-pages.ts';
import { modelDescription } from './presentation.ts';
import type { Design } from '../catalog/index.ts';
import { inspectGeometry } from '../lantern/inspect.ts';
import { createDiscoveryModel, filterModels, readDiscoveryState, discoverySearch, styleLabels } from './discovery.ts';

const images=import.meta.glob('./previews/*.png',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const categoryOf=(id:string)=>recipe(id).presentation.category;
interface EditorBridge extends WorkspaceActions {
 select(id:string):boolean;
 apply(input:unknown,frame?:boolean):boolean;
 kit():void;
 configuration():Design;
 visibility():Array<{name:string;visible:boolean}>;
 togglePart(name:string,visible:boolean):void;
 resetVisibility():void;
}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''){
 const node=document.createElement(tag);node.className=className;node.textContent=text;return node;
}
function thumb(family:string,preset:string){
 const filename=recipe(family).presentation.thumbnails?.[preset];
 const url=filename?images['./previews/'+filename]:undefined;
 if(!url){const placeholder=el('div','thumbnail-placeholder','Preview in editor');placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label',descriptor(family).title+' preview available in editor');return placeholder;}
 const image=el('img');image.src=url;image.alt=descriptor(family).title+' · '+preset;image.loading='lazy';return image;
}
export function mountSite(bridge:EditorBridge){
 const technical=new URLSearchParams(location.search).has('diagnostic')||location.pathname==='/editor';
 if(technical){const refresh=()=>{document.title=descriptor(bridge.configuration().family).title+' · Celadon Lowpoly';};refresh();return {refresh,openGroup:(_group:string)=>{}};}
 document.body.classList.add('website');
 const shapeTab=document.querySelector<HTMLButtonElement>('button[data-group="shape"]')!;
 const buildTab=document.querySelector<HTMLButtonElement>('button[data-group="construction"]')!;
 shapeTab.textContent='Proportions';buildTab.textContent='Construction';
 const app=document.getElementById('app')!;
 const header=el('header','site-header');
 const brand=el('a','site-brand');brand.append(brandArtwork());brand.href='/';brand.setAttribute('aria-label','Celadon Lowpoly home');
 const navigation=el('nav','site-navigation');
 for(const [title,path] of [['Models','/catalog'],['Docs','/docs'],['Contribute','/contribute']]){
  const link=el('a','',title);link.href=path!;navigation.append(link);
 }
 header.append(brand,navigation,el('span','local-label','Made to make your own'));
 const contributePage=createContributePage(),landingPage=createLandingPage(),docsPage=createDocsPage(),footer=createFooter();
 const catalogPage=el('section','catalog-page');
 const models=catalog.map(d=>{
  const build=buildAsset(d.id);
  try{return createDiscoveryModel({...d,description:modelDescription(d.id)},categoryOf(d.id),build.semantics,inspectGeometry(build.root).triangles);}
  finally{disposeAsset(build);}
 });
 let state=readDiscoveryState(new URLSearchParams(location.search),models);
 const intro=el('div','catalog-intro');intro.append(el('p','eyebrow','PROCEDURAL MODELS'),el('h1','','Find your next model.'),el('p','intro-copy','Choose from '+catalog.length+' models and '+catalog.reduce((n,d)=>n+d.presets.length,0)+' presets. Customize each model and export it to your project.'));
 const layout=el('div','catalog-layout'),sidebar=el('aside','catalog-sidebar'),content=el('div','catalog-content');
 sidebar.setAttribute('aria-label','Filter models');
 const searchLabel=el('label','search-label','Search models'),search=el('input');search.type='search';search.placeholder='Name, ID or description';search.id='catalog-search';searchLabel.htmlFor=search.id;
 sidebar.append(searchLabel,search);
 function filterSelect(id:string,label:string,options:Array<[string,string]>) {
  const text=el('label','filter-label',label);text.htmlFor=id;
  const select=el('select');select.id=id;
  for(const [value,copy] of options){const option=el('option','',copy);option.value=value;select.append(option);}
  const field=el('div','filter-field');field.append(text,select);sidebar.append(field);return select;
 }
 const type=filterSelect('catalog-type','Type',[['','All types'],...[...new Set(models.map(m=>m.type))].sort().map(value=>[value,value] as [string,string])]);
 const style=filterSelect('catalog-style','Style',[['','All styles'],...[...new Set(models.map(m=>m.style))].map(value=>[value,styleLabels[value]!] as [string,string])]);
 const capability=filterSelect('catalog-capability','Capability',[['','All models'],['poseable','Poseable parts']]);
 const capabilityNote=el('p','filter-note','Adjust supported parts, such as lids, wheels and cranks.');sidebar.append(capabilityNote);
 const clear=el('button','clear-filters','Clear filters');clear.type='button';clear.id='catalog-clear';sidebar.append(clear);
 const bar=el('div','catalog-bar'),count=el('span'),sort=el('select');count.id='catalog-count';count.setAttribute('role','status');sort.id='catalog-sort';sort.setAttribute('aria-label','Sort models');
 for(const [value,label] of [['name','Name A–Z'],['name-desc','Name Z–A'],['triangles','Fewest triangles']]){const option=el('option','',label);option.value=value!;sort.append(option);}
 bar.append(count,sort);const cards=el('div','asset-grid');content.append(bar,cards);layout.append(sidebar,content);catalogPage.append(intro,layout);
 const detail=el('section','detail-heading'),breadcrumb=el('a','breadcrumb','Back to models');breadcrumb.href='/catalog';
 const title=el('h1'),description=el('p'),version=el('span','version-pill');
 const titleRow=el('div','detail-title');titleRow.append(title,version);detail.append(breadcrumb,titleRow,description);
 const below=el('section','detail-below'),presetHeading=el('div','section-heading');presetHeading.append(el('div','', 'A starting point for your next idea'),el('span','','Choose a preset, then shape the details.'));
 const presets=el('div','preset-grid'),information=el('div','asset-information');

 below.append(presetHeading,presets,information);
 const usage=mountUsage(information,bridge.configuration,bridge.currentDesignReady);
 const parts=document.createElement('section');parts.className='part-inspector';
 const summary=el('h3','','Preview visibility');const partList=el('div','part-list');
 const partFilterLabel=el('label','','Filter parts by name'),partFilter=el('input'),partCount=el('span','part-filter-count'),clearPartFilter=el('button','','Clear part filter');
 partFilter.type='search';partFilter.id='part-name-filter';partFilter.placeholder='For example, roof or crank';partFilterLabel.htmlFor=partFilter.id;partCount.id='part-filter-count';partCount.setAttribute('role','status');clearPartFilter.type='button';
 const partFilterBar=el('div','part-filter-bar');partFilterBar.append(partFilterLabel,partFilter,partCount,clearPartFilter);
 partFilter.addEventListener('input',renderParts);clearPartFilter.addEventListener('click',()=>{partFilter.value='';renderParts();partFilter.focus();});
 const resetParts=el('button','','Show all parts');resetParts.addEventListener('click',()=>{bridge.resetVisibility();renderParts();});
 parts.append(summary,el('p','','Visibility is preview-only. GLB always exports the complete model.'),partFilterBar,resetParts,partList);
 document.querySelector('.inspector')!.append(parts);
 document.body.prepend(header,landingPage,catalogPage,docsPage,contributePage,detail);app.after(below);document.body.append(footer);
 const workspace=mountWorkspace(app,below,parts,bridge);
 function renderCards(){
  search.value=state.query;type.value=state.type;style.value=state.style;capability.value=state.capability;sort.value=state.sort;
  const catalogHref='/catalog'+discoverySearch(state);
  breadcrumb.href=catalogHref;navigation.querySelector<HTMLAnchorElement>('a')!.href=catalogHref;
  for(const link of document.querySelectorAll<HTMLAnchorElement>('[data-catalog-link]'))link.href=catalogHref;
  const entries=filterModels(models,state);
  count.textContent=entries.length+' of '+models.length+' models';cards.replaceChildren();
  for(const m of entries){
   const d=descriptor(m.id),card=el('a','asset-card');card.href='/asset/'+m.id+discoverySearch(state);card.dataset.model=m.id;
   const visual=el('div','card-visual');visual.append(thumb(m.id,d.presets[0]!.id),el('span','card-category',m.type));
   const text=el('div','card-copy');text.append(el('h2','',m.title),el('p','',m.description));
   const labels=el('div','card-labels');labels.append(el('span','',styleLabels[m.style]!));if(m.poseable)labels.append(el('span','','Poseable parts'));text.append(labels);
   const footer=el('div','card-footer');footer.append(el('span','',m.triangles.toLocaleString()+' tris'),el('span','','Customize ↗'));
   card.append(visual,text,footer);cards.append(card);
  }
  if(!entries.length){
   const empty=el('div','empty-state');empty.append(el('h2','','No matching models'),el('p','','Try fewer filters or clear them to see every model.'));
   const reset=el('button','','Clear filters and show all models');reset.type='button';reset.addEventListener('click',resetFilters);empty.append(reset);cards.append(empty);
  }
 }
 function updateFilters(replace=false){
  state={query:search.value,type:type.value,style:style.value,capability:capability.value,sort:sort.value};
  const target='/catalog'+discoverySearch(state);
  if(location.pathname+location.search!==target)window.history[replace?'replaceState':'pushState']({},'',target);
  renderCards();
 }
 function resetFilters(){state=readDiscoveryState(new URLSearchParams(),models);renderCards();updateFilters();}
 clear.addEventListener('click',resetFilters);
 search.addEventListener('input',()=>updateFilters(true));
 for(const select of [type,style,capability,sort])select.addEventListener('change',()=>updateFilters());
 renderCards();
 let routeFamily='',routing=false;
 function renderParts(){
  partList.replaceChildren();
  const all=bridge.visibility(),query=partFilter.value.trim().toLocaleLowerCase(),matching=all.filter(part=>(part.name+' '+part.name.replaceAll('-',' ')).toLocaleLowerCase().includes(query));
  partCount.textContent=matching.length+' of '+all.length+' parts';
  for(const part of matching){
   const label=el('label'),input=el('input');input.type='checkbox';input.checked=part.visible;input.dataset.part=part.name;
   input.addEventListener('change',()=>bridge.togglePart(part.name,input.checked));
   label.append(input,document.createTextNode(part.name.replaceAll('-',' ')));partList.append(label);
  }
  if(!matching.length)partList.append(el('p','','No parts match this name. Clear the filter to see all parts.'));
 }
 function renderDetail(id:string){
  const d=descriptor(id);document.title=d.title+' · Celadon Lowpoly';title.textContent=d.title;description.textContent=modelDescription(id);version.textContent='v'+d.version;
  presets.replaceChildren();
  for(const p of d.presets){
   const button=el('button','preset-card');button.dataset.preset=p.id;button.append(thumb(id,p.id),el('strong','',p.name),el('span','',p.description));
   button.addEventListener('click',()=>{bridge.apply(p.parameters,true);refresh();});presets.append(button);
  }
  renderParts();usage.refresh();workspace.refresh(d.title,modelDescription(d.id));
 }
 function route(){
  routing=true;
  if(location.pathname==='/catalog'||location.pathname.startsWith('/asset/')||location.pathname==='/kit/woodland-workshop')state=readDiscoveryState(new URLSearchParams(location.search),models);
  if(location.pathname==='/kit/woodland-workshop')window.history.replaceState({},'','/catalog'+discoverySearch(state));
  const path=location.pathname,match=path.match(/^\/asset\/([^/]+)$/);
  const id=match?.[1],valid=id&&catalog.some(d=>d.id===id),contributing=path==='/contribute',home=path==='/',docs=path==='/docs';
  landingPage.hidden=!home;docsPage.hidden=!docs;contributePage.hidden=!contributing;catalogPage.hidden=Boolean(valid)||contributing||home||docs;detail.hidden=!valid;app.hidden=!valid;below.hidden=!valid;
  workspace.route(!valid);document.body.classList.toggle('site-catalog',!catalogPage.hidden);
  renderCards();
  if(valid){bridge.select(id);routeFamily=id;renderDetail(id);}
  else{routeFamily='';document.title=(home?'Editable 3D models':docs?'Documentation':contributing?'Contribute':'Models')+' · Celadon Lowpoly';}
  for(const link of navigation.querySelectorAll('a')){
   const current=link.pathname==='/catalog'?!catalogPage.hidden:link.pathname===path;
   if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  document.body.classList.remove('collapsed');routing=false;
 }
 function refresh(){
  if(routing||app.hidden)return;
  const config=bridge.configuration();
  if(routeFamily!==config.family){routeFamily=config.family;window.history.replaceState({},'', '/asset/'+config.family+discoverySearch(state));renderDetail(config.family);}
  const d=descriptor(config.family);document.title=d.title+' · Celadon Lowpoly';
  for(const button of presets.querySelectorAll('button')){const preset=d.presets.find(p=>p.id===button.dataset.preset)!;button.setAttribute('aria-pressed',String(JSON.stringify(d.save(preset.parameters).applied)===JSON.stringify(config.applied)));}
  usage.refresh();workspace.refresh(d.title,modelDescription(d.id));
  renderParts();
 }
 document.addEventListener('click',event=>{
  const link=(event.target as Element).closest<HTMLAnchorElement>('a[href^="/"]');if(!link||link.pathname==='/editor'||link.hasAttribute('download')||link.target||event.ctrlKey||event.metaKey||event.shiftKey)return;
  event.preventDefault();window.history.pushState({},'',link.href);route();window.scrollTo(0,0);
 });
 window.addEventListener('popstate',route);
 route();return {refresh,openGroup:(group:string)=>workspace.selectGroup(group)};
}
