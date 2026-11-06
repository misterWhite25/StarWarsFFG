// The world settings are writable by the GM. Never announce a paid point before both writes succeed.
let tail=Promise.resolve();
async function serial(work){const job=tail.catch(()=>{}).then(work);tail=job;return job;}
export async function reserveTalentDestiny(pool){return serial(async()=>{
 if(!game.user?.isGM)throw Error('Le MJ doit effectuer cette activation : la réserve de Destin n’offre pas encore de transaction joueur confirmée.');
 if(!['light','dark'].includes(pool))throw Error('Choisissez la réserve de Destin.');
 const before={light:Number(game.settings.get('starwarsffg','dPoolLight')),dark:Number(game.settings.get('starwarsffg','dPoolDark'))};
 if(!Number.isInteger(before.light)||!Number.isInteger(before.dark)||before[pool]<1)throw Error('Aucun point disponible dans cette réserve de Destin.');
 const after={...before};after[pool]--;after[pool==='light'?'dark':'light']++;
 await game.settings.set('starwarsffg','dPoolLight',after.light);
 try{await game.settings.set('starwarsffg','dPoolDark',after.dark);}
 catch(error){await game.settings.set('starwarsffg','dPoolLight',before.light);throw error;}
 return {pool,before,after};
});}
export async function refundTalentDestiny(transaction){return serial(async()=>{
 if(!game.user?.isGM||!transaction)throw Error('Remboursement de Destin indisponible.');
 const {before,after}=transaction;
 if(Number(game.settings.get('starwarsffg','dPoolLight'))!==after.light||Number(game.settings.get('starwarsffg','dPoolDark'))!==after.dark)throw Error('La réserve de Destin a changé depuis : remboursement à vérifier avec le MJ.');
 await game.settings.set('starwarsffg','dPoolLight',before.light);
 try{await game.settings.set('starwarsffg','dPoolDark',before.dark);}
 catch(error){await game.settings.set('starwarsffg','dPoolLight',after.light);throw error;}
});}
