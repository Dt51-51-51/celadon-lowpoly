export const agentApps={codex:'Codex',claude:'Claude Code',cursor:'Cursor',copilot:'GitHub Copilot'};
export type AgentApp=keyof typeof agentApps;
export function agentBundleUrl(origin:string){
 const base=new URL(origin.endsWith('/')?origin:origin+'/');
 if(!['http:','https:'].includes(base.protocol))throw Error('Agent distribution requires an HTTP(S) origin');
 return new URL('agent-bundles/celadon-agent-3.zip',base).href;
}
export function agentSetupText(app:AgentApp,origin:string){
 if(!Object.hasOwn(agentApps,app))throw Error('Unsupported agent app');
 return 'Set up the local Celadon Lowpoly toolkit for this project and '+agentApps[app]+'. Download '+agentBundleUrl(origin)+' and extract it to a fresh celadon-agent-setup folder. Inspect the installer, source archive, dependency lock and license notices before execution. From this project root, run:\n\nnode celadon-agent-setup/install.mjs --app '+app+' --project .\nnode .polyspoon/bootstrap.mjs\nnode .polyspoon/runtime.mjs catalog\n\nUse Node.js 22.22.1 and npm 10 or later. This installs project-local skill instructions and bootstraps a local engine; it does not install the agent app or a hosted account. Preserve existing changes if installation reports a conflict. Use the installed model skill to make my requested model, inspect the actual result, and deliver the GLB, saved design, editable source and known limits. My request: ';
}
export function createAgentSetup(origin=new URL(import.meta.env.BASE_URL,location.origin).href){
 const configured=import.meta.env.VITE_POLYSPOON_ORIGIN||origin;
 const section=document.createElement('section');section.className='agent-setup';
 const heading=document.createElement('h2');heading.textContent='Install once. Describe what you want.';
 const intro=document.createElement('p');intro.textContent='Copy this setup request to your agent. One bundle supplies the project skill and the local model engine. Your agent handles setup and checks the result.';
 const label=document.createElement('label');label.htmlFor='agent-app';label.textContent='Your agent app';
 const select=document.createElement('select');select.id='agent-app';
 for(const [id,name] of Object.entries(agentApps)){const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);}
 const text=document.createElement('textarea');text.id='agent-setup-text';text.rows=12;text.readOnly=true;text.setAttribute('aria-label','Setup request to give your agent');
 const copy=document.createElement('button');copy.type='button';copy.className='blue-action';copy.textContent='Copy setup request';
 const selectText=document.createElement('button');selectText.type='button';selectText.className='quiet-action';selectText.textContent='Select setup text';selectText.addEventListener('click',()=>{text.focus();text.select();status.textContent='Setup request selected. Copy the selected text with your browser.';});
 const download=document.createElement('a');download.id='agent-bundle-download';download.className='quiet-action';download.href=agentBundleUrl(configured);download.download='celadon-agent-3.zip';download.textContent='Download one agent bundle (.zip)';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=document.createElement('p');note.textContent='Project installation only. Review executable source before setup. The open-source local toolkit is separate from future hosted catalog access. App support depends on your installed version and policy.';
 const refresh=()=>{text.value=agentSetupText(select.value as AgentApp,configured);status.textContent='';};
 select.addEventListener('change',refresh);refresh();
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Setup request copied. Add your model request before sending.';}catch{text.focus();text.select();status.textContent='Select and copy the setup request above.';}});
 const actions=document.createElement('div');actions.className='entry-actions';actions.append(copy,selectText,download);
 section.append(heading,intro,label,select,text,actions,status,note);return section;
}
