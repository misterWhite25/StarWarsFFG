const scope = "starwarsffg";
let tail = Promise.resolve();

function serial(work) {
  const result = tail.then(work);
  tail = result.catch(() => {});
  return result;
}

function readPool() {
  return {light: Number(game.settings.get(scope, "dPoolLight")), dark: Number(game.settings.get(scope, "dPoolDark"))};
}

async function writePool(before, after) {
  if (before.light !== after.light) await game.settings.set(scope, "dPoolLight", after.light);
  try {
    if (before.dark !== after.dark) await game.settings.set(scope, "dPoolDark", after.dark);
  } catch (error) {
    if (before.light !== after.light) await game.settings.set(scope, "dPoolLight", before.light);
    throw error;
  }
}

export function changeDestinyPool(lightDelta, darkDelta, roll) {
  return serial(async () => {
    if (!game.user.isGM) throw Error(game.i18n.localize("SWFFG.UI.Talent.DestinyGMRequired"));
    if (roll?.used()) return null;
    const before = readPool();
    const after = {light: Math.max(0, before.light) + lightDelta, dark: Math.max(0, before.dark) + darkDelta};
    if (!Object.values(after).every(n => Number.isSafeInteger(n) && n >= 0)) {
      throw Error(game.i18n.localize("SWFFG.UI.Talent.DestinyEmpty"));
    }
    await writePool(before, after);
    if (roll) {
      try { await roll.record(); }
      catch (error) { await writePool(after, before); throw error; }
    }
    return {before, after};
  });
}

export async function reserveTalentDestiny(pool) {
  if (!["light", "dark"].includes(pool)) throw Error(game.i18n.localize("SWFFG.UI.Talent.DestinyChoosePool"));
  const light = pool === "light" ? -1 : 1;
  return {pool, ...await changeDestinyPool(light, -light)};
}

export function refundTalentDestiny(transaction) {
  return serial(async () => {
    if (!game.user?.isGM || !transaction) throw Error(game.i18n.localize("SWFFG.UI.Talent.DestinyRefundUnavailable"));
    const {before, after} = transaction;
    const current = readPool();
    if (current.light !== after.light || current.dark !== after.dark) throw Error(game.i18n.localize("SWFFG.UI.Talent.DestinyChanged"));
    await writePool(after, before);
  });
}
