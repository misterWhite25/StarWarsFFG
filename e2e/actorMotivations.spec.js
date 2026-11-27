import {expect, test} from '@playwright/test';
import {openGame} from '../playwright/fixtures';

test.describe.configure({timeout: 150_000});

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('core.noCanvas', 'true');
    localStorage.setItem('core.language', JSON.stringify('fr'));
    localStorage.setItem('core.maxFPS', '10');
  });
  await openGame(page);
});

test('character information supports manual and catalogue motivations and keeps GM settings at the bottom', async ({page}) => {
  const fixtures = await page.evaluate(async () => {
    const actor = await Actor.create({name: 'Motivations QA', type: 'rival'}, {renderSheet: false});
    const item = await Item.create({name: 'Solidarité du monde', type: 'motivation',
      system: {type: 'Cause', description: '<p>Une description du monde.</p>'}}, {renderSheet: false});
    const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
      name: 'qa-motivations', label: 'Catalogue de test', type: 'Item'
    });
    const [entry] = await Item.createDocuments([{name: 'Serment du catalogue', type: 'motivation',
      system: {type: 'Belief', description: '<p>Rester fidèle à son équipage.</p>'}}], {pack: pack.collection});
    await actor.sheet.render({force: true});
    return {actor: actor.id, sheet: actor.sheet.id, item: item.id, pack: pack.collection, entry: entry.id};
  });
  const sheet = page.locator('[id="' + fixtures.sheet + '"]');
  const info = sheet.locator('.tab[data-tab="general"]');
  const motivations = info.locator('.ffg-motivation-list');
  const popup = page.locator('.ffg-motivation-dialog');
  const add = () => motivations.getByRole('button', {name: 'Ajouter une motivation'}).click();
  const submit = () => popup.getByRole('button', {name: 'Ajouter une motivation'}).click();
  const selectSource = uuid => popup.locator('[name="motivationSource"]').selectOption(uuid);
  try {
    await sheet.locator('nav [data-tab="general"]').click();
    await expect(info).toBeVisible();
    await expect(motivations.locator('table')).toHaveCount(0);
    await expect(motivations.locator('.ffg-basic-section-heading')).toHaveCSS('background-image', /linear-gradient/);
    await expect(info.locator(':scope > :nth-last-child(2)')).toHaveClass('ffg-market-participant');
    await expect(info.locator(':scope > :last-child')).toHaveClass('ffg-pilotage-assets-field');

    await add();
    await expect(popup).toBeVisible();
    await expect(popup.locator('optgroup[label="Objets du monde"] option')).toContainText('Solidarité du monde');
    await expect(popup.locator('optgroup[label="Catalogue de test"] option')).toContainText('Serment du catalogue');
    await popup.locator('[name="motivationName"]').fill('Défendre la station');
    await popup.locator('[name="motivationType"]').fill('Solidarité locale');
    await popup.locator('[name="motivationDescription"]').fill('Protéger les civils.\nLeur donner un refuge.');
    await submit();
    await expect(popup).toHaveCount(0);
    const manual = motivations.locator('tr[data-motivation-id]').filter({hasText: 'Défendre la station'});
    await expect(manual).toContainText('Solidarité locale');
    await expect(manual.locator('.ffg-motivation-description')).toContainText('Leur donner un refuge.');
    await manual.getByRole('button', {name: 'Modifier la motivation'}).click();
    const typeSelect = page.getByRole('combobox').filter({has: page.getByRole('option', {name: 'Solidarité locale', exact: true})});
    await expect(typeSelect).toHaveValue('Solidarité locale');
    await page.evaluate(async id => {
      const item = game.actors.get(id).items.find(item => item.name === 'Défendre la station');
      await item.sheet.close({animate: false});
    }, fixtures.actor);

    for (const [uuid, title] of [
      ['Item.' + fixtures.item, 'Solidarité du monde'],
      ['Compendium.' + fixtures.pack + '.Item.' + fixtures.entry, 'Serment du catalogue'],
    ]) {
      await add();
      await selectSource(uuid);
      await expect(popup.locator('[name="motivationName"]')).not.toBeVisible();
      await submit();
      await expect(popup).toHaveCount(0);
      await expect(motivations.locator('tr[data-motivation-id]').filter({hasText: title})).toBeVisible();
    }
    await expect(motivations.locator('tr[data-motivation-id]')).toHaveCount(3);

    await page.evaluate(async id => {
      const actor = game.actors.get(id);
      await actor.update({'system.general.motivation1': {category: 'Protéger sa famille', type: 'Liens', description: 'Un texte déjà enregistré.'}});
      await actor.sheet.render({force: true});
    }, fixtures.actor);
    await expect(motivations.locator('[data-legacy-motivation]')).toHaveCount(1);
    await expect(motivations.locator('[name="data.general.motivation1.category"]')).toHaveValue('Protéger sa famille');
    await expect(motivations.locator('tr[data-motivation-id]')).toHaveCount(3);
    const persisted = await page.evaluate(id => {
      const actor = game.actors.get(id);
      return {legacy: actor.toObject().system.general.motivation1.category, items: actor.items.filter(item => item.type === 'motivation')
        .map(item => ({name: item.name, description: item.toObject().system.description, source: item._stats?.compendiumSource}))};
    }, fixtures.actor);
    expect(persisted.legacy).toBe('Protéger sa famille');
    for (const type of ['character', 'nemesis']) {
      const other = await page.evaluate(async type => {
        const actor = await Actor.create({name: 'Motivations QA ' + type, type}, {renderSheet: false});
        await actor.sheet.render({force: true});
        return {actor: actor.id, sheet: actor.sheet.id};
      }, type);
      try {
        const sheet = page.locator('[id="' + other.sheet + '"]');
        await sheet.locator('nav [data-tab="general"]').click();
        const list = sheet.locator('.ffg-motivation-list');
        await expect(list.getByRole('button', {name: 'Ajouter une motivation'})).toBeVisible();
        await expect(list.locator('tbody tr')).toHaveCount(0);
        await expect(sheet.locator('.tab[data-tab="general"] > :last-child')).toHaveClass('ffg-pilotage-assets-field');
      } finally {
        await page.evaluate(async id => {
          await game.actors.get(id)?.sheet.close({animate: false});
          await game.actors.get(id)?.delete();
        }, other.actor);
      }
    }
    expect(persisted.items).toEqual(expect.arrayContaining([
      expect.objectContaining({name: 'Défendre la station', description: '<p>Protéger les civils.<br>Leur donner un refuge.</p>'}),
      expect.objectContaining({name: 'Solidarité du monde', description: '<p>Une description du monde.</p>'}),
      expect.objectContaining({name: 'Serment du catalogue', source: 'Compendium.' + fixtures.pack + '.Item.' + fixtures.entry}),
    ]));
  } finally {
    await page.evaluate(async ({actor, item, pack}) => {
      await game.actors.get(actor)?.sheet.close({animate: false});
      await game.actors.get(actor)?.delete();
      await game.items.get(item)?.delete();
      await game.packs.get(pack)?.deleteCompendium();
    }, fixtures);
  }
});

test('player information offers creation catalogue obligations and a biography editor in the blue header', async ({page}) => {
  const data = await page.evaluate(async () => {
    const actor = await Actor.create({name: 'Mira Venn QA', type: 'character', system: {biography: '<p>Une biographie déjà écrite.</p>'}}, {renderSheet: false});
    const world = await Item.create({name: 'Dette du monde', type: 'obligation',
      system: {type: 'obligation', magnitude: 3}}, {renderSheet: false});
    const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
      name: 'qa-obligations', label: 'Catalogue de création QA', type: 'Item'
    });
    const previous = game.settings.get('starwarsffg', 'obligationCompendiums');
    await game.settings.set('starwarsffg', 'obligationCompendiums', pack.collection);
    const [entry] = await Item.createDocuments([{name: 'Devoir du catalogue', type: 'obligation',
      system: {type: 'duty', magnitude: 10, description: '<p>Défendre le convoi.</p>'}}], {pack: pack.collection});
    await actor.sheet.render({force: true});
    return {actor: actor.id, sheet: actor.sheet.id, world: world.id, pack: pack.collection, uuid: entry.uuid, previous};
  });
  const sheet = page.locator('[id="' + data.sheet + '"]');
  const info = sheet.locator('.tab[data-tab="general"]');
  const table = info.locator('.ffg-basic-obligations table');
  const motivationHeading = info.locator('.ffg-motivation-list > header');
  const biography = info.locator('.ffg-basic-biography');
  const bioHeading = biography.locator('header');
  const dialog = page.locator('.ffg-obligation-dialog');
  const add = () => table.getByRole('button', {name: 'Ajouter une obligation'}).click();
  const submit = () => dialog.getByRole('button', {name: 'Ajouter une obligation'}).click();
  try {
    await sheet.locator('nav [data-tab="general"]').click();
    const tableHeading = await table.locator('thead').evaluate(header => getComputedStyle(header).backgroundImage);
    expect(tableHeading).toContain('linear-gradient');
    await expect(motivationHeading).toHaveCSS('background-image', tableHeading);
    await expect(bioHeading).toHaveCSS('background-image', tableHeading);
    await expect(biography.locator('.biography-editor').getByRole('button')).toHaveCount(0);
    await bioHeading.getByRole('button', {name: 'Modifier la biographie'}).click();
    const editor = page.locator('.ffg-popout-editor');
    await expect(editor).toBeVisible();
    const editorText = editor.locator('prose-mirror .editor-content[contenteditable="true"]');
    await expect(editorText).toHaveText('Une biographie déjà écrite.');
    await editorText.fill('Une biographie mise à jour.');
    await editor.locator('prose-mirror [data-action="save"]').click();
    await expect(editor).toHaveCount(0);
    await expect(biography.locator('.biography-editor')).toHaveText('Une biographie mise à jour.');

    await add();
    await expect(dialog.locator('optgroup[label="Objets du monde"] option')).toContainText('Dette du monde');
    await expect(dialog.locator('optgroup[label="Catalogue de création QA"] option')).toContainText('Devoir du catalogue');
    await dialog.locator('[name="obligationSource"]').selectOption(data.uuid);
    await expect(dialog.locator('[name="obligationName"]')).toBeHidden();
    await submit();
    await expect(dialog).toHaveCount(0);
    const duty = table.locator('tbody tr').filter({hasText: 'Devoir du catalogue'});
    await expect(duty.locator('td').nth(1)).toHaveText('10');
    await expect(duty).toContainText('Défendre le convoi.');

    await add();
    await expect(dialog.locator('[name="obligationType"]')).toHaveValue('obligation');
    await expect(dialog.locator('[name="obligationMagnitude"]')).toHaveValue('0');
    await dialog.locator('[name="obligationName"]').fill('Une promesse personnelle');
    const magnitude = dialog.locator('[name="obligationMagnitude"]');
    for (const invalid of ['-1', '2.5', '']) {
      await magnitude.fill(invalid);
      await submit();
      await expect(dialog.getByRole('alert')).toHaveText('Saisis un nombre entier supérieur ou égal à zéro.');
      await expect(table.locator('tbody tr').filter({hasText: 'Une promesse personnelle'})).toHaveCount(0);
    }
    await magnitude.fill('7');
    await submit();
    await expect(dialog).toHaveCount(0);
    await expect(table.locator('tbody tr').filter({hasText: 'Une promesse personnelle'}).locator('td').nth(1)).toHaveText('7');

    await add();
    await dialog.locator('[name="obligationName"]').fill('Devoir personnel');
    await dialog.locator('[name="obligationType"]').selectOption('duty');
    await magnitude.fill('-1');
    await submit();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await magnitude.fill('0');
    await submit();
    await expect(dialog).toHaveCount(0);
    await expect(table.locator('tbody tr').filter({hasText: 'Devoir personnel'}).locator('td').nth(1)).toHaveText('0');

    await add();
    await dialog.locator('[name="obligationName"]').fill('Une force personnelle');
    await dialog.locator('[name="obligationType"]').selectOption('morality');
    await expect(dialog.locator('[name="obligationMagnitude"]')).toBeHidden();
    await dialog.locator('[name="obligationSubtype"]').selectOption('Emotional Strength');
    await submit();
    await expect(dialog).toHaveCount(0);
    await expect(table.locator('tbody tr').filter({hasText: 'Une force personnelle'}).locator('td').nth(1)).toHaveText('Force émotionnelle');
  } finally {
    await page.evaluate(async ({actor, world, pack, previous}) => {
      await game.actors.get(actor)?.sheet.close({animate: false});
      await game.actors.get(actor)?.delete();
      await game.items.get(world)?.delete();
      await game.settings.set('starwarsffg', 'obligationCompendiums', previous);
      await game.packs.get(pack)?.deleteCompendium();
    }, data);
  }
});
