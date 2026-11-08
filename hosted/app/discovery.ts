import {el,input,field,link} from '../shared/dom.ts';

export interface CatalogFilters {query:string;type:string;style:string;offset:string;sort?:string;limit?:string}

export function readCatalogFilters(params:URLSearchParams):CatalogFilters {
 return {query:params.get('q')??'',type:params.get('type')??'',style:params.get('style')??'',offset:params.get('offset')??'0',...(params.get('sort')==='top'?{sort:'top'}:{}),...(['48','96'].includes(params.get('limit')??'')?{limit:params.get('limit')!}:{})};
}

export function catalogSearch(filters:CatalogFilters):string {
 const params=new URLSearchParams();
 for(const [key,value] of [['q',filters.query],['type',filters.type],['style',filters.style],['sort',filters.sort??''],['limit',filters.limit??''],['offset',filters.offset==='0'?'':filters.offset]])if(value)params.set(key!,value);
 const search=params.toString();return search?'?'+search:'';
}

export function catalogFilterForm(filters:CatalogFilters,facets:{types:Array<[string,string]>;styles:Array<[string,string]>}):HTMLFormElement {
 const form=el('form','hosted-catalog-filters'),query=input('q','search',false),submit=el('button','button-secondary','Search');form.action='/catalog';form.method='get';form.setAttribute('role','search');form.setAttribute('aria-label','Filter models');query.value=filters.query;query.placeholder='Model name';query.maxLength=100;submit.type='submit';
 function chooser(name:string,label:string,all:string,value:string,options:Array<[string,string]>){
  const select=el('select'),choices:Array<[string,string]>=[['',all],...options];select.name=name;if(value&&!options.some(([id])=>id===value))choices.push([value,value]);
  for(const [id,text] of choices){const option=el('option','',text);option.value=id;select.append(option);}
  select.value=value;select.addEventListener('change',()=>form.requestSubmit());return field(label,select);
 }
 form.append(field('Search models',query),submit,chooser('type','Type','All types',filters.type,facets.types),chooser('style','Style','All styles',filters.style,facets.styles),chooser('sort','Sort by','Newest',filters.sort??'',[['top','Top rated']]),chooser('limit','Models per page','24 per page',filters.limit??'',[['48','48 per page'],['96','96 per page']]),link('Clear filters','/catalog','button-secondary'));
 return form;
}
