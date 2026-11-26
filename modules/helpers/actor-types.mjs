/** Group inventory shares the homestead schema and sheet without becoming a character. */
export const isHomesteadType=type=>type==='homestead'||type==='groupinventory';
export const actorSheetType=type=>type==='groupinventory'?'homestead':type;

export const supportsVehiclePlan = actor => actor?.type === 'vehicle' && Number(actor.system?.stats?.silhouette?.value) >= 4;
