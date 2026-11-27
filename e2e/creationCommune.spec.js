import {expect, test} from '@playwright/test';
import {openGame} from '../playwright/fixtures';

test('Création guidée ouvre l’historique et les catalogues Steelers', async ({page}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    localStorage.setItem('core.noCanvas', 'true');
    localStorage.setItem('core.language', JSON.stringify('fr'));
    localStorage.setItem('core.maxFPS', '10');
  });
  await openGame(page);
  const core = 'swffg-compendium-bilingual-steelers-core_rule';
  const active = await page.evaluate(id => Boolean(game.modules.get(id)?.active), core);
  test.skip(!active, 'Requires the Steelers Core Rule module and Babele');
  await page.evaluate(() => {
    foundry.nue.Tour.activeTour?.exit();
    ui.sidebar.changeTab('actors', 'primary');
    if (!ui.sidebar.expanded) ui.sidebar.expand();
  });
  await expect(page.locator('#actors').getByRole('button', {name: 'Création manuelle'})).toBeVisible();
  await page.locator('#ffgCharacterWizard').click();
  const wizard = page.locator('.charCreator');
  const step = wizard.locator('.tab.active');
  const next = wizard.locator('[data-direction="forward"]');
  await expect(step).toHaveAttribute('data-tab', 'background');
  await expect(step.locator('#culture option')).toHaveCount(5);
  await expect(step.locator('#starting-trait optgroup')).toHaveCount(4);
  await expect(wizard.locator('.wizard-header')).toBeVisible();

  const rules = step.getByLabel('Gamme de jeu');
  const budget = wizard.locator('.wizard-budget');
  const bonus = step.locator('#startingBonus');
  const startingObligation = await page.evaluate(() => game.settings.get('starwarsffg', 'defaultObligation'));
  await expect(rules).toHaveValue('fad');
  await expect(budget.locator('dt').last()).toHaveText('Moralité');
  await rules.selectOption('aor');
  await expect(budget.locator('dt').last()).toHaveText('Devoir');
  await expect(bonus.locator('option[value="5xp"]')).toContainText('-5 en Devoir');
  await rules.selectOption('eote');
  await expect(budget.locator('dt').last()).toHaveText('Obligation');
  await expect(bonus.locator('option[value="5xp"]')).toContainText('+5 en Obligation');
  await step.locator('#startingBonus + .ss-main').click();
  await page.locator('.ss-option:visible').filter({hasText: '+5 XP de départ, +5 en Obligation'}).click();
  await expect(budget.locator('dd').last()).toHaveText(String(startingObligation + 5));

  await next.click();
  await expect(step).toHaveAttribute('data-tab', 'species', {timeout: 20_000});
  const species = step.locator('#species tbody tr');
  await expect(species).toHaveCount(20);
  const human = await page.evaluate(async id => {
    const pack = game.packs.get(id + '.en-species');
    const items = await pack.getDocuments();
    const actor = items.find(item => /^(humain|human)$/i.test(item.name));
    return actor && {name: actor.name, uuid: actor.uuid};
  }, core);
  expect(human).toBeTruthy();
  await step.locator('input[type="search"]').fill(human.name);
  const humanRow = species.filter({has: page.locator('[data-source="' + human.uuid + '"]')});
  await humanRow.locator('.species-spend').click();
  await expect.poll(() => page.evaluate(() => {
    const app = [...foundry.applications.instances.values()].find(instance => instance.constructor.name === 'CharacterCreator');
    return Boolean(app?.tempActor?.items.some(item => item.type === 'species'));
  })).toBe(true);
  await next.click();
  await expect(step).toHaveAttribute('data-tab', 'career', {timeout: 20_000});
  await expect(step.locator('#careers tbody tr .career-spend').first()).toBeVisible();
  const chosenCareer = await page.evaluate(async id => {
    const actor = await game.packs.get(id + '.en-talents').getDocument('59c9e1b0e5a5fb4a');
    return actor && {name: actor.name, uuid: actor.uuid};
  }, core);
  expect(chosenCareer).toBeTruthy();
  await step.locator('input[type="search"]').fill(chosenCareer.name);
  await step.locator('.career-spend[data-source="' + chosenCareer.uuid + '"]').click();
  await expect.poll(() => page.evaluate(() => {
    const app = [...foundry.applications.instances.values()].find(instance => instance.constructor.name === 'CharacterCreator');
    return app?.data.selected.career?.name;
  })).toBe(chosenCareer.name);

  await page.evaluate(async id => {
    const app = [...foundry.applications.instances.values()].find(instance => instance.constructor.name === 'CharacterCreator');
    const source = await game.packs.get(id + '.en-species').getDocuments();
    app.data.selected.species = source.find(item => item.flags?.['swffg-compendium-bilingual']?.startingGrants?.key === 'csg-8-0');
    app.data.selected.specialization = app.data.available.specializations[0];
    if (!app.data.selected.species || !app.data.selected.specialization) throw Error('Missing fixed-bonus species or specialization');
    await app.showCharacterStatusShim();
    await app.render({force: true, creationStep: 'xp_spend'});
  }, core);
  await expect(step).toHaveAttribute('data-tab', 'xp_spend');
  await step.locator('section.specializations details > summary').first().click();
  await expect(step.locator('.specialization-grid').first()).toBeVisible();
  const known = await page.evaluate(() => game.actors.map(actor => actor.id));
  await page.evaluate(async () => {
    const app = [...foundry.applications.instances.values()].find(instance => instance.constructor.name === 'CharacterCreator');
    await app.render({force: true, creationStep: 'review'});
  });
  await wizard.getByRole('button', {name: 'Confirmer la création', exact: true}).click();
  await expect(wizard).toHaveCount(0, {timeout: 20_000});
  const savedId = await page.evaluate(ids => game.actors.find(actor => !ids.includes(actor.id) &&
    actor.items.some(item => item.type === 'career') && actor.items.some(item => item.type === 'specialization'))?.id, known);
  expect(savedId).toBeTruthy();
  expect(await page.evaluate(id => game.actors.get(id).system.obligation.value, savedId)).toBe(startingObligation + 5);
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await actor.sheet.close({animate: false});
    await actor.delete();
  }, savedId);
  await expect.poll(() => page.evaluate(() => game.actors.filter(actor => actor.getFlag('starwarsffg', 'wizardPreviewOwner')).length)).toBe(0);
});
