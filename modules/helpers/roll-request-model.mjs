export const POOL_FIELDS=Object.freeze(['ability','proficiency','difficulty','challenge','boost','setback','force','remsetback','success','advantage','failure','threat','triumph','despair','light','dark','upgrades']);
export const text=(value,max=160)=>String(value??'').replace(/\u2014/g,'-').slice(0,max);
export function cleanPool(value={}){
 const pool={_ignoreGMDifficulty:true};
 for(const key of POOL_FIELDS){const number=Number(value[key]??0),minimum=['success','advantage','failure','threat','triumph','despair','light','dark'].includes(key)?-100:0;if(!Number.isFinite(number)||number<minimum||number>100)throw Error('Invalid dice pool');pool[key]=Math.trunc(number);}
 return pool;
}
export function requestData(message){
 const data=message?.getFlag?.('starwarsffg','rollRequest');
 return data?.version===1&&Array.isArray(data.recipients)?data:null;
}
export function recipientFor(message,user){return requestData(message)?.recipients.find(row=>row.userId===user?.id);}
export function canAnswerRequest(message,user,actor){
 const data=requestData(message),recipient=recipientFor(message,user);
 return Boolean(message?.author?.isGM&&data&&!data.cancelled&&recipient&&data.states?.[user.id]?.status!=='rolled'&&actor?.uuid===recipient.actorUuid&&actor.testUserPermission?.(user,'OWNER')&&actor.system?.skills?.[data.skillKey]);
}
