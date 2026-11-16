/** Prepare only roll inputs, without rendering a sheet or copying its inventory. */
export function rollContext(actor, {token=actor.token, tokenUuid=token?.document?.uuid??token?.uuid}={}) {
  const clone=globalThis.foundry?.utils?.deepClone??structuredClone;
  const data=clone({skills:actor.system?.skills??{},characteristics:actor.system?.characteristics??{},stats:actor.system?.stats??{}});
  const context={actor:{_id:actor.id,id:actor.id,name:actor.name,type:actor.type,img:actor.img},data,documentUuid:actor.uuid};
  if(tokenUuid)context.pilotageTokenUuid=tokenUuid;
  // Live documents and functions are useful while rolling, but do not belong in saved chat flags.
  Object.defineProperties(context,{
    document:{value:actor,writable:true,configurable:true},
    token:{value:token,writable:true,configurable:true},
    rollData:{value:actor.getRollData?.bind(actor),configurable:true}
  });
  return context;
}
