(()=>{const out=[];const vis=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden'};
const name=e=>(e.tagName+(e.id?'#'+e.id:'')+' "'+(e.innerText||e.value||e.placeholder||e.getAttribute('aria-label')||'').trim().slice(0,25)+'"');
if(document.documentElement.scrollWidth>innerWidth+1)out.push('PAGE OVERFLOW x '+document.documentElement.scrollWidth+'>'+innerWidth);
const ctl=[...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]),main select,main button,main a.btn,main textarea')].filter(vis);
const rows={};for(const e of ctl){const b=e.getBoundingClientRect();if(e.tagName!=='TEXTAREA'&&b.height<44&&!e.closest('table'))out.push('SMALL '+Math.round(b.height)+'px '+name(e));
let p=e.parentElement;while(p&&!/flex|grid/.test(getComputedStyle(p).display))p=p.parentElement;if(!p)continue;(p.__k??=Math.random());(rows[p.__k]??=[]).push(e)}
for(const k in rows){const list=rows[k];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i].getBoundingClientRect(),b=list[j].getBoundingClientRect();
if(Math.abs(a.top-b.top)<a.height*0.6&&(Math.abs(a.height-b.height)>2||Math.abs(a.bottom-b.bottom)>2))out.push('MISALIGN '+name(list[i])+' h'+Math.round(a.height)+'@'+Math.round(a.top)+' vs '+name(list[j])+' h'+Math.round(b.height)+'@'+Math.round(b.top))}}
for(const e of document.querySelectorAll('main *')){if(!vis(e)||e.children.length)continue;const cs=getComputedStyle(e);if(e.scrollWidth>e.clientWidth+2&&cs.overflowX!=='auto'&&cs.overflowX!=='scroll'&&!['INPUT','SELECT','OPTION'].includes(e.tagName)&&cs.textOverflow!=='ellipsis')out.push('CLIPPED '+name(e))}
return JSON.stringify([...new Set(out)].slice(0,25))})()
