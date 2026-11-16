/** Scene membership is the token's parent scene, never a saved flag on its source actor. */
export function sceneDirectoryTokens(actor,scene){
  if(!actor||actor.visible===false||!scene)return [];
  return Array.from(scene.tokens??[]).filter(token=>token.actorId===actor.id&&token.actor&&token.actor.visible!==false&&
    (globalThis.game?.user?.isGM||!token.hidden&&(globalThis.canvas?.ready&&canvas.scene?.id===scene.id?token.object?.isVisible!==false:true)));
}

/** Keep separate rows for separate minion groups and other unlinked copies of the same actor. */
export function renderSceneTokenRows(app,active,scene){
  const list=app.element.querySelector('.directory-list');if(!list)return;
  for(const copy of list.querySelectorAll('[data-ffg-scene-token-copy]'))copy.remove();
  for(const row of [...list.querySelectorAll('li.directory-item.document[data-entry-id]')]){
    const actor=app.collection.get(row.dataset.entryId),link=row.querySelector(':scope>.entry-name');
    if(!actor||!link)continue;
    if(!active){
      if(row.dataset.ffgSceneToken){link.textContent=actor.name;const image=row.querySelector('img');if(image)image.src=actor.img;delete row.dataset.ffgSceneToken;delete row.dataset.action;}
      continue;
    }
    const tokens=sceneDirectoryTokens(actor,scene);if(!tokens.length){row.remove();continue;}
    let previous=row;
    for(const [index,token]of tokens.entries()){
      const entry=index?row.cloneNode(true):row;
      if(index){entry.dataset.ffgSceneTokenCopy='';previous.after(entry);}
      entry.dataset.ffgSceneToken=token.uuid;
      entry.dataset.action='activateEntry';
      entry.querySelector(':scope>.entry-name').textContent=token.name;
      const image=entry.querySelector('img');if(image)image.src=token.texture?.src??token.actor.img;
      previous=entry;
    }
  }
}

export async function openSceneDirectoryToken(uuid){
  const token=fromUuidSync(uuid);
  if(!token?.actor||token.parent?.id!==canvas.scene?.id||!sceneDirectoryTokens(game.actors.get(token.actorId),canvas.scene).includes(token))return;
  for(let i=0;canvas.loading&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,30));
  if(!canvas.ready||canvas.scene?.id!==token.parent.id)return;
  const {selectGroundSheetToken,isGroundToken}=await import('./ground-movement-state.mjs');if(isGroundToken(token))selectGroundSheetToken(token.actor,token);
  if(game.user.isGM||token.actor.isOwner){canvas.tokens.activate();token.object?.control({releaseOthers:true});}
  await canvas.animatePan({...token.getCenterPoint(),duration:250});
  const sheet=token.actor.sheet;await sheet.render({force:true});sheet.bringToFront();
}
