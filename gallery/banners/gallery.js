const ids=['adversaries','characters','equipment','illustrations','market','planets','references','tables','species','ships'];
const requested=new URLSearchParams(location.search).get('lang')??document.documentElement.lang;
const language=requested==='en'?'en':'fr',catalog=JSON.parse(document.querySelector('#gallery-i18n').textContent)[language];
document.documentElement.lang=language;
const text=(key,values={})=>catalog['SWFFG.Gallery.'+key].replace(/\{([A-Za-z]+)\}/g,(_all,name)=>String(values[name]));
for(const node of document.querySelectorAll('[data-i18n]'))node.textContent=text(node.dataset.i18n,{count:ids.length});
for(const button of document.querySelectorAll('[data-index]')){
 const id=ids[Number(button.dataset.index)],name=text(id);button.setAttribute('aria-label',text('Enlarge',{name}));button.querySelector('img').alt=name;
}
document.querySelector('#close').setAttribute('aria-label',text('CloseImage'));
const viewer=document.querySelector('#viewer'),large=document.querySelector('#large-image');let index=0;
function show(next){index=(next+ids.length)%ids.length;const id=ids[index],label=text(id);large.src=id+'.png';large.alt=label;document.querySelector('#viewer-title').textContent=label;document.querySelector('#counter').textContent=(index+1)+' / '+ids.length;document.querySelector('#download').href=id+'.png';if(!viewer.open)viewer.showModal();}
document.querySelectorAll('[data-index]').forEach(button=>button.addEventListener('click',()=>show(Number(button.dataset.index))));
document.querySelector('#close').addEventListener('click',()=>viewer.close());viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
document.querySelector('#previous').addEventListener('click',()=>show(index-1));document.querySelector('#next').addEventListener('click',()=>show(index+1));
document.addEventListener('keydown',event=>{if(!viewer.open)return;if(event.key==='ArrowRight'){event.preventDefault();show(index+1);}if(event.key==='ArrowLeft'){event.preventDefault();show(index-1);}});
document.querySelector('#brightness').addEventListener('change',event=>document.body.classList.toggle('bright',event.target.checked));
