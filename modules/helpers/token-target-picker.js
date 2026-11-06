const t=(fr,en)=>game.i18n.lang==='fr'?fr:en;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Scoped to one picker. Token UUIDs distinguish same-named scene tokens. */
export function watchTokenTarget(tokens,getSelect,hooks=Hooks,userId=game.user.id,onChange=()=>{}) {
  let pendingUuid=null;
  const refresh=()=>{const select=getSelect();if(!select||!pendingUuid)return false;select.value=pendingUuid;pendingUuid=null;onChange();return true;};
  const choose=token=>{const uuid=token?.document?.uuid;if(!tokens.some(candidate=>candidate.document.uuid===uuid))return;
    if(!game.user.isGM&&(!token.visible||token.document.hidden))return;pendingUuid=uuid;refresh();};
  const control=hooks.on('controlToken',(token,controlled)=>{if(controlled)choose(token);});
  const target=hooks.on('targetToken',(user,token,targeted)=>{if(targeted&&user.id===userId)choose(token);});
  const stop=()=>{hooks.off('controlToken',control);hooks.off('targetToken',target);};stop.refresh=refresh;return stop;
}
export function preferredTokenTarget(requested,targets=[],controlled=[]) {
  return requested??targets.at(-1)?.document?.uuid??controlled.at(-1)?.document?.uuid;
}
export async function chooseTokenTarget(tokens,{requested,title=t('Choisir la cible','Choose target'),confirmLabel=t('Continuer','Continue')}={}) {
  const sceneId=globalThis.canvas?.scene?.id;
  const visible=token=>token?.actor&&(game.user.isGM||(token.visible&&!token.document.hidden));
  const eligible=tokens.filter(visible);
  if(!eligible.length)throw Error(t('Aucune cible accessible sur cette scène.','No accessible target on this scene.'));
  const labels=new Map(),counts=new Map();
  for(const token of eligible){const n=(counts.get(token.name)??0)+1;counts.set(token.name,n);labels.set(token.document.uuid,token.name+(eligible.filter(t=>t.name===token.name).length>1?` · ${n}`:''));}
  const initial=eligible.some(t=>t.document.uuid===requested)?requested:'';
  const body=document.createElement('div');
  body.innerHTML=`<p>${t('Clique directement sur le pion sur la carte, ou cible-le avec l’outil de ciblage.','Click the token on the map, or use the targeting tool.')}</p>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid currentColor;border-radius:5px;margin:10px 0"><img data-target-image hidden alt="" width="42" height="42" style="object-fit:contain;border:0"><div><strong data-target-name role="status" aria-live="polite"></strong></div></div>
    <details><summary>${t('Choisir dans la liste','Choose from the list')}</summary><label>${t('Cible','Target')}<select name="target" aria-label="${t('Cible','Target')}"><option value="">${t('Clique sur un pion','Click a token')}</option>${eligible.map(token=>`<option value="${esc(token.document.uuid)}" ${token.document.uuid===initial?'selected':''}>${esc(labels.get(token.document.uuid))}</option>`).join('')}</select></label></details>`;
  let root;
  const selected=()=>eligible.find(token=>token.document.uuid===root?.querySelector('[name=target]')?.value&&visible(token));
  const refresh=()=>{if(!root)return;const token=selected(),image=root.querySelector('[data-target-image]');
    root.querySelector('[data-target-name]').textContent=token?labels.get(token.document.uuid):t('Aucune cible sélectionnée','No target selected');
    image.hidden=!token;if(token)image.src=token.document.texture?.src??token.texture?.src??'icons/svg/mystery-man.svg';
    const button=root.querySelector('[data-action=ok]');if(button)button.disabled=!token;
  };
  body.addEventListener('change',refresh);
  const stop=watchTokenTarget(eligible,()=>root?.querySelector('[name=target]'),Hooks,game.user.id,refresh);
  const deleted=Hooks.on('deleteToken',doc=>{const select=root?.querySelector('[name=target]');if(select?.value===doc.uuid){select.value='';refresh();}});
  try {
    return await foundry.applications.api.DialogV2.prompt({window:{title},classes:['starwarsffg','themed','ffg-token-target-picker'],position:{width:420,left:20,top:90},modal:false,content:body,rejectClose:false,
      render:(_event,app)=>{root=app.element;stop.refresh();refresh();},
      ok:{label:confirmLabel,callback:()=>{
        if(sceneId!==globalThis.canvas?.scene?.id)throw Error(t('La scène a changé : rouvre le choix de cible.','The scene changed: reopen the target picker.'));
        const token=selected();if(!token||!(globalThis.canvas?.tokens?.placeables??eligible).some(t=>t.document.uuid===token.document.uuid))throw Error(t('La cible n’est plus accessible. Choisis de nouveau un pion.','The target is no longer accessible. Select a token again.'));
        return token.document.uuid;
      }}});
  } finally {stop();Hooks.off('deleteToken',deleted);body.removeEventListener('change',refresh);}
}
