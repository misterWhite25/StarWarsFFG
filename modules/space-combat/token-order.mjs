const rank=ship=>Number.isSafeInteger(ship.sort)?ship.sort:0;
export const orderedShips=ships=>[...ships].sort((a,b)=>rank(a)-rank(b));
export function bringShipToFront(ships,id) {
  const ship=ships.find(entry=>entry.id===id);
  if(!ship)throw Error("Ce pion a quitté le plateau.");
  const order=orderedShips(ships).filter(entry=>entry.id!==id);order.push(ship);
  const ranks=new Map(order.map((entry,index)=>[entry.id,index]));
  return ships.map(entry=>({...entry,sort:ranks.get(entry.id)}));
}
