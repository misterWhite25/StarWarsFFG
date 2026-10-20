const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=html=>String(html??'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&(?:apos|rsquo|#39|#8217);/gi,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const normalize=value=>plain(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function talentTitle(name){return String(name??'').toLocaleUpperCase('fr');}
export function talentNameInText(name){return String(name??'').toLocaleLowerCase('fr').replace(/(^|[^\p{L}\p{M}])([\p{L}])/gu,(_all,prefix,letter)=>prefix+letter.toLocaleUpperCase('fr'));}
export function formatTalentMentions(html,names){
 const unique=[...new Set(names.filter(Boolean))].sort((a,b)=>b.length-a.length);
 if(!unique.length)return String(html??'');
 const patterns=unique.map(name=>escapeRegExp(name).replace(/\s+/g,'\\s+').replace(/['’]/g,"(?:['’]|&(?:apos|rsquo|#39|#8217);)"));
 const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])(?:${patterns.join('|')})(?![\\p{L}\\p{N}_])`,'giu');
 // Change text only; preserve links, data attributes, dice markup and stored document data.
 let excluded=null;
 return String(html??'').split(/(<[^>]+>)/g).map(part=>{
  if(part.startsWith('<')){if(/^<(script|style)\b/i.test(part))excluded=part.match(/^<(\w+)/)[1].toLowerCase();else if(/^<\/(script|style)\b/i.test(part))excluded=null;return part;}
  return excluded?part:part.replace(pattern,match=>talentNameInText(match.replace(/&(?:apos|rsquo|#39|#8217);/gi,"’")));
 }).join('');
}
const originalPointBlank='Ajoutez 1 point de dégâts par rang de Bout portant à ceux d’un coup d’une attaque réussie de Distance (armes lourdes) ou Distance (armes légères) effectuée à portée courte ou au contact.';
export const pointBlankText="Ajoutez 1 point de dégâts par rang de Bout Portant aux dégâts d’un coup d’une attaque réussie de Distance (armes lourdes) ou Distance (armes légères) effectuée à portée courte ou au contact.";
export function treeTalentDescription(talent,enrichedHTML,names){
 // Rephrase the known imported summary only; preserve custom additions and house rules.
 const original=plain(talent.description).replace(/[’]/g,"'");
 const canonical=originalPointBlank.replace(/[’]/g,"'");
 if(normalize(talent.name)==='boutportant'&&original===canonical)return `<p>${pointBlankText}</p>`;
 return formatTalentMentions(enrichedHTML,names);
}
const bookFamily=value=>{
 const key=normalize(value);
 for(const [id,aliases]of [['aor',['ageofrebellion','eredelarebellion']],['eote',['edgeoftheempire','auxconfinsdelempire']],['fad',['forceanddestiny','forceetdestinee']]])if(aliases.some(alias=>key.includes(alias)))return id;
 return key;
};
export function treeHeaderDescription(html,name){
 let body=String(html??'');
 const sources=body.match(/<h([1-6])\b[^>]*>\s*(?:Sources?|Références?)\s*:?\s*<\/h\1>/i);
 let bibliography='';if(sources){bibliography=body.slice(sources.index+sources[0].length);body=body.slice(0,sources.index);}
 let first=true;
 body=body.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(heading,level,inner)=>{
  if(!first)return heading;first=false;
  const text=plain(inner),prefix=new RegExp(`^${escapeRegExp(name)}(?:\\s*[—–:-]\\s*|$)`,'iu');
  if(!prefix.test(text))return heading;
  const subtitle=text.replace(prefix,'').trim();return subtitle?`<p class="tree-subtitle">${escapeHTML(subtitle)}</p>`:'';
 });
 const pageSources=[];
 body=body.replace(/Voir\s+p\.\s*([\d–—,\- ]+)\s+du\s+Livre\s+de\s+règles\s+(?:de\s+)?([^<\n]+?)(?:\.(?=\s|<|$)|(?=<|$))/gi,(_all,page,book)=>{
  pageSources.push({book:plain(book),page:page.trim()});return '';
 });
 const books=[];
 bibliography=bibliography.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(_all,_level,book)=>{books.push(plain(book));return '';});
 const entries=pageSources.map(row=>`${row.book}, p. ${row.page}`),seen=new Set(pageSources.map(row=>bookFamily(row.book)));
 for(const book of books){const key=bookFamily(book);if(book&&!seen.has(key)){entries.push(book);seen.add(key);}}
 body=body.replace(/<p\b[^>]*>\s*(?:<br\s*\/?>(?:\s|&nbsp;)*)*<\/p>/gi,'').replace(/(?:<br\s*\/?>\s*){2,}/gi,'<br>');
 const label=entries.length>1?'Sources':'Source';
 const references=entries.length?`<p class="tree-source"><strong>${label} :</strong> ${entries.map(escapeHTML).join(' · ')}</p>`:'';
 return body+references+(plain(bibliography)?`<div class="tree-source-extra">${bibliography}</div>`:'');
}
