import {expect, test} from "@playwright/test";
import {openGame} from "../playwright/fixtures";

test("the Foundry language setting applies to system screens and content", async ({page}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
  });
  await page.addLocatorHandler(page.locator(".tour-center-step [data-action=exit], #tooltip.tour [data-action=exit]").first(),
    button => button.click());
  await openGame(page);
  for (const [language, expected] of Object.entries({
    fr: {space: "Combat spatial", map: "Carte de combat spatial", empty: "Déposez une fiche de vaisseau FFG sur la carte.",
      reference: "Difficulté des attaques à distance", sheet: "Camp permanent du personnage", camp: "Allié", gallery: "Les bandeaux des compendiums",
      npc: "Véhicule PNJ", create: "Créer un véhicule", instructions: "Aucune destination choisie.", attack: "Effectuer une attaque"},
    en: {space: "Space Combat", map: "Space combat map", empty: "Drop an FFG ship sheet onto the map.",
      reference: "Ranged attack difficulty", sheet: "Character’s permanent side", camp: "Ally", gallery: "Compendium banners",
      npc: "NPC vehicle", create: "Create vehicle", instructions: "No destination selected.", attack: "Perform an Attack"},
  })) {
    if (await page.evaluate(() => game.i18n.lang) !== language) {
      await page.evaluate(() => ui.settings.activate());
      await page.locator('[data-action=openApp][data-app=configure]').click();
      const settings = page.locator("#settings-config");
      await settings.locator('select[name="core.language"]').selectOption(language);
      await settings.locator("button[type=submit]").click();
      await page.locator('#reload-world-confirm [data-action=yes]').click();
      await page.waitForFunction(lang => globalThis.game?.ready && game.i18n.lang === lang, language);
    }
    await expect(page.locator("[data-open-space-combat]")).toHaveAttribute("aria-label", expected.space);
    expect(await page.evaluate(async () => {
      const {ACTIONS} = await import("/systems/starwarsffg/modules/space-combat/combat-rules.mjs");
      return [game.settings.get("core", "language"), game.i18n.localize("SWFFG.UI.SpaceCombat.NoDestination"),
        ACTIONS.find(action => action.id === "attack").label];
    })).toEqual([language, expected.instructions, expected.attack]);
    const reference = await page.evaluate(async lang => {
      const journal = await JournalEntry.create({
        name: "Combat and healing tables",
        flags: {starwarsffg: {language: lang === "fr" ? "en" : "fr", referenceTables: true}},
        pages: [{type:"text", name:"6-1 · Wrong language", text:{content:"<p>Wrong language</p>"}}],
      });
      try {
        const {skillReferenceHTML} = await import("/systems/starwarsffg/modules/helpers/skill-information-ui.js");
        return await skillReferenceHTML({key:"Ranged: Light",label:"Ranged: Light"}, {scale:"personal",includeCombatSpending:false});
      } finally {
        await journal.delete();
      }
    }, language);
    expect(reference).toContain(expected.reference);
    expect(reference).not.toContain("Wrong language");
    const actorId = await page.evaluate(async () => {
      const actor = await Actor.create({name:"Bilingual review",type:"character"});
      await actor.sheet.render({force:true});
      return actor.id;
    });
    try {
      const camp = page.getByRole("group",{name:expected.sheet,exact:true});
      await expect(camp.getByRole("button",{name:expected.camp,exact:true})).toBeVisible();
    } finally {
      await page.evaluate(async id => {
        const actor = game.actors.get(id);
        await actor?.sheet.close();
        await actor?.delete();
      }, actorId);
    }
    await page.evaluate(async () => {
      const {chooseVehicleMode} = await import("/systems/starwarsffg/modules/helpers/npc-vehicle-ui.mjs");
      void chooseVehicleMode();
    });
    const vehicle = page.locator(".ffg-vehicle-mode");
    await expect(vehicle.getByText(expected.create, {exact:true})).toBeVisible();
    await expect(vehicle.locator('select[name="vehicleMode"] option[value=npc]')).toHaveText(expected.npc);
    await vehicle.locator('[data-action=cancel]').click();
    await page.evaluate(() => game.ffg.openBannerGallery());
    const gallery = page.frameLocator(".ffg-banner-gallery-frame");
    await expect(gallery.locator("html")).toHaveAttribute("lang", language);
    await expect(gallery.locator("h1")).toHaveText(expected.gallery);
    await page.evaluate(() => foundry.applications.instances.get("ffg-banner-gallery").close());
    await page.locator("[data-open-space-combat]").click();
    const map = page.locator("#ffg-space-combat");
    await expect(map.locator("svg.sc-plot")).toHaveAttribute("aria-label", expected.map, {timeout: 30_000});
    await expect(map.getByText(expected.empty, {exact:true})).toBeVisible();
    await map.locator("[data-cmd=close]").click();
    await expect(map).not.toBeVisible();
  }
});
