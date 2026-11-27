export function isAntiFighterWeapon(weapon) {
  return weapon?.type === 'shipweapon' && weapon.flags?.starwarsffg?.antiFighter === true;
}

// Capital-ship anti-fighter weapons count the attacker as one silhouette smaller.
export function shipWeaponAttackProfile(ship, weapon, targetSilhouette) {
  const silhouette = Number(ship.silhouette);
  const reduction = ship.spaceShip === true && silhouette >= 5 && isAntiFighterWeapon(weapon) ? 1 : 0;
  const effectiveSilhouette = silhouette - reduction;
  const difference = effectiveSilhouette - Number(targetSilhouette);
  const difficulty = difference <= -2 ? 1 : difference >= 4 ? 5 : difference === 3 ? 4 : difference === 2 ? 3 : 2;
  return {effectiveSilhouette, difficulty};
}
