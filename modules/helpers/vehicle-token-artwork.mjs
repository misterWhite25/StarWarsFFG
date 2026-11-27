import {tokenArtworkEntries,legacyTokenArtworkEntries} from './token-artwork-catalogue.mjs';

const oldShipsModule='swffg-compendium-bilingual-steelers-starship_and_speeders';
const shipsModule='swffg-compendium-bilingual-steelers-starships_and_speeders';
const moduleAssets='modules/swffg-compendium-bilingual-steelers-starships_and_speeders/assets/';
const tieToken=moduleAssets+'tokens-20261114/241427fbe237b1e4cd419a5ee2c0.svg';
const corvetteToken=moduleAssets+'tokens-20261114/fb697abce97fcb7face33731845b.svg';
const decode=source=>{try{return decodeURIComponent(source);}catch{return source;}};
function aliasMap(entries){
  const aliases=new Map();
  for(const [source,target] of entries){aliases.set(source,target);aliases.set(decode(source),target);}
  return aliases;
}
const legacyAliases=aliasMap(legacyTokenArtworkEntries);
const replacements=aliasMap([...legacyTokenArtworkEntries,...tokenArtworkEntries,
  [moduleAssets+'starfighters-shuttles/183109796751056f.webp',tieToken],
  [moduleAssets+'cruisers-frigates/ad310e725e1a947f.webp',corvetteToken],
  ['modules/star-wars-all-compendia/assets/images/packs/VehicleImages/TIELN.webp',tieToken],
  ['modules/star-wars-all-compendia/assets/images/packs/VehicleImages/CR90.webp',corvetteToken]
]);

function installedNamespace(source){
  const modules=globalThis.game?.modules;
  return modules?.has(oldShipsModule)&&!modules.has(shipsModule)?source.replaceAll(shipsModule,oldShipsModule):source;
}

function resolveAlias(source,aliases){
  if(typeof source!=='string')return source;
  let current=source.replaceAll(oldShipsModule,shipsModule);
  const visited=new Set();
  while(!visited.has(current)){
    visited.add(current);
    const next=aliases.get(current)??aliases.get(decode(current));
    if(next===undefined||next===current)return installedNamespace(current);
    current=next;
  }
  return installedNamespace(current);
}

// Portrait rendering also follows the renamed starships compendium namespace.
export function resolveLegacyTokenArtwork(source){return resolveAlias(source,legacyAliases);}

// Token rendering also recognizes known portraits, including historical alias chains.
export function vehicleTokenArtwork(source){return resolveAlias(source,replacements);}

const wrappedTokens=new WeakSet(),wrappedActors=new WeakSet();
let chatHookRegistered=false;
export function registerVehicleTokenArtwork(){
  const TokenBase=CONFIG.Token.documentClass;
  if(!wrappedTokens.has(TokenBase)){
    const TokenArtwork=class extends TokenBase{
      prepareDerivedData(){
        super.prepareDerivedData();
        const actor=this.parent?.documentName==='Actor'?this.parent:globalThis.game?.actors?.get(this.actorId);
        if(this.texture)this.texture.src=['vehicle','character','minion','rival','nemesis'].includes(actor?.type)
          ?vehicleTokenArtwork(this.texture.src):resolveLegacyTokenArtwork(this.texture.src);
      }
    };
    wrappedTokens.add(TokenArtwork);CONFIG.Token.documentClass=TokenArtwork;
  }
  const ActorBase=CONFIG.Actor?.documentClass;
  if(ActorBase&&!wrappedActors.has(ActorBase)){
    const ActorArtwork=class extends ActorBase{
      prepareDerivedData(){super.prepareDerivedData();this.img=resolveLegacyTokenArtwork(this.img);}
    };
    wrappedActors.add(ActorArtwork);CONFIG.Actor.documentClass=ActorArtwork;
  }
  if(!chatHookRegistered&&globalThis.Hooks?.on){
    Hooks.on('renderChatMessageHTML',(_message,html)=>{
      const root=html?.querySelectorAll?html:html?.[0];
      for(const image of root?.querySelectorAll('img[src]')??[]){
        const source=image.getAttribute('src'),target=resolveLegacyTokenArtwork(source);
        if(target!==source)image.setAttribute('src',target);
      }
    });
    chatHookRegistered=true;
  }
}
