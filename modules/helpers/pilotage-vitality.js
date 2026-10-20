/** UI definition requested by the GM; does not change game death rules or actor data. */
export function vitalityState(actor) {
  const wounds=actor?.system?.stats?.wounds;
  const numeric=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
  if(!numeric(wounds?.value)||!numeric(wounds?.max))return 'unknown';
  return Number(wounds.value)>Number(wounds.max)?'dead':'alive';
}
export function matchesVitalityFilter(actor,filter='all') {
  return filter==='all'||vitalityState(actor)===filter;
}
