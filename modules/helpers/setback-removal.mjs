/** Remaining Setback dice after the applicable reductions carried by this pool. */
export function setbackAfterRemovals(pool){
 const total=Math.max(0,Number(pool?.setback)||0),removed=Math.max(0,Number(pool?.remsetback)||0);
 return Math.max(0,total-removed);
}
