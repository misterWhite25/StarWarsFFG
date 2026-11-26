export const DEFAULT_GROUND_RANGES=Object.freeze({contact:1.5,short:10,medium:20,long:50,extreme:150});
export function validateGroundRanges(values){
 const result=Object.fromEntries(Object.keys(DEFAULT_GROUND_RANGES).map(key=>[key,Number(values?.[key])]));
 const numbers=Object.values(result);
 if(numbers.some(value=>!Number.isFinite(value)||value<=0))throw Error(game.i18n.localize("SWFFG.UI.Ground.PositiveDistancesRequired"));
 if(numbers.some((value,index)=>index>0&&value<=numbers[index-1]))throw Error(game.i18n.localize("SWFFG.UI.Ground.IncreasingAllDistances"));
 return result;
}
export function groundRangeValues(){
 try{return validateGroundRanges(globalThis.game?.settings?.get('starwarsffg','groundRangeDistances')??DEFAULT_GROUND_RANGES);}
 catch{return {...DEFAULT_GROUND_RANGES};}
}
