import {expect, test} from '@playwright/test';
import {openGame} from '../playwright/fixtures.ts';

test.describe.configure({timeout: 150_000});

test('character PDF separates the profile from the inventory and preserves long biographies', async ({page}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('core.noCanvas', 'true');
    localStorage.setItem('core.language', JSON.stringify('fr'));
    localStorage.setItem('core.maxFPS', '10');
  });
  await openGame(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({name: 'Mira Venn', type: 'character'});
    await actor.update({
      'system.characteristics.Brawn.value': 2,
      'system.characteristics.Agility.value': 3,
      'system.characteristics.Intellect.value': 3,
      'system.characteristics.Cunning.value': 2,
      'system.characteristics.Willpower.value': 2,
      'system.characteristics.Presence.value': 2,
      'system.skills.Athletics.rank': 3,
      'system.skills.Athletics.careerskill': true,
      'system.stats.wounds.max': 12, 'system.stats.wounds.value': 4,
      'system.stats.medical.uses': 2,
      'system.stats.forcePool.max': 3, 'system.stats.forcePool.value': 2,
      'system.general.motivation1': {category: 'Famille', type: 'Liens', description: 'Trouver <Venn>.'},
      'system.experience.available': 15, 'system.experience.total': 25,
      'system.general.gender': 'Femme',
      'system.general.age': '31',
      'system.general.height': '1,69 m',
      'system.general.build': 'Athlétique',
      'system.general.hair': 'Bruns',
      'system.general.eyes': 'Verts',
      'system.biography': '<p>Pilot and mechanic from an independent salvage crew.</p>',
    });
    await actor.setFlag('starwarsffg', 'xpLog', [{
      date: 'TIMESTAMP-MARKER 2040-05-16 16:51:22', description: 'Training investment', xp: {cost: 10, available: 15, total: 25},
    }]);
    await actor.createEmbeddedDocuments('Item', [
      {type: 'weapon', name: 'Service blaster', system: {
        description: 'WEAPON-DESCRIPTION-MARKER', special: {value: 'WEAPON-SPECIAL-MARKER'},
        damage: {value: 6}, crit: {value: 3}, range: {value: 'Short'}, skill: {value: 'Ranged: Light'},
        itemattachment: [new Item({type: 'itemattachment', name: 'Optical scope', system: {description: 'SCOPE-DESCRIPTION-MARKER'}}).toObject()],
        itemmodifier: [{name: 'Accurate', system: {rank: 2, description: 'QUALITY-DESCRIPTION-MARKER'}}],
      }},
      {type: 'armour', name: 'Reinforced jacket', system: {
        description: 'ARMOR-DESCRIPTION-MARKER', soak: {value: 2},
        itemattachment: [new Item({type: 'itemattachment', name: 'Thermal lining'}).toObject()],
      }},
      {type: 'gear', name: 'Tool kit', system: {description: 'GEAR-DESCRIPTION-MARKER', quantity: {value: 2}, encumbrance: {value: 1}}},
      {type: 'talent', name: 'Toughened', system: {description: 'TALENT-DESCRIPTION-MARKER', ranks: {ranked: true, current: 3}}},
      {type: 'talent', name: 'Quick Draw', system: {description: 'UNRANKED-DESCRIPTION-MARKER', ranks: {ranked: false}}},
      {type: 'species', name: 'SPECIES-MARKER'},
      {type: 'career', name: 'CAREER-MARKER'},
      {type: 'specialization', name: 'SPECIALIZATION-MARKER'},
    ]);
    const open = window.open;
    window.open = (...args) => {
      const popup = open.apply(window, args);
      if (popup) popup.print = () => { popup.document.body.dataset.requestedPrint = 'true'; };
      return popup;
    };
    await actor.sheet.render({force: true});
    return {actor: actor.id, sheet: actor.sheet.id, woundsMax: actor.system.stats.wounds.max};
  });

  async function preview() {
    await page.locator('[id="' + actorId.sheet + '"] button[data-action=toggleControls]').click();
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByText('Export PDF', {exact: true}).click()]);
    await expect(popup.locator('body')).toHaveAttribute('data-requested-print', 'true', {timeout: 20_000});
    return popup;
  }

  try {
    let popup = await preview();
    await expect(popup.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(popup.locator('h1')).toHaveText('Mira Venn');
    const logo = popup.getByRole('img', {name: 'Star Wars', exact: true});
    await expect(logo).toBeVisible();
    await expect(logo).not.toHaveJSProperty('naturalWidth', 0);
    const paper = popup.locator('main > img.sheet-paper');
    await expect(paper).toHaveAttribute('alt', '');
    await expect(paper).not.toHaveJSProperty('naturalWidth', 0);
    await expect(popup.locator('.characteristics > h2')).toHaveText('Caractéristiques');
    const athletics = popup.locator('.skill-columns tbody tr').filter({hasText: 'Athlétisme'});
    await expect(athletics.locator('.career-mark')).toHaveText('Oui');
    await expect(athletics.locator('.skill-rank')).toHaveText('3');
    await expect(athletics.locator('.rank-track .filled')).toHaveCount(3);
    await expect(popup.locator('.continuation-heading p')).toHaveText('Mira Venn');
    await expect(popup.locator('.gear-table thead h2')).toHaveText('Matériel');
    const wounds = popup.locator('.combat-stat').filter({has: popup.getByText('Blessures', {exact: true})});
    await expect(wounds.locator('strong')).toHaveText([String(actorId.woundsMax), '4']);
    await popup.emulateMedia({media: 'print'});
    await expect(paper).toHaveCSS('position', 'fixed');
    await expect(popup.locator('main > .continuation')).toHaveCSS('break-before', 'page');
    const stats = popup.locator('.stats > .stat');
    await expect(stats.locator('span')).toHaveText(['Encombrement', 'Réserve de Force', 'Crédits', 'XP', 'Soins reçus']);
    await expect(stats.filter({has: popup.getByText('Réserve de Force', {exact: true})}).locator('strong')).toHaveText('2 / 1');
    const xp = stats.filter({has: popup.getByText('XP', {exact: true})});
    const treatments = stats.filter({has: popup.getByText('Soins reçus', {exact: true})});
    await expect(xp.locator('strong')).toHaveText('15 / 25');
    await expect(treatments.locator('strong')).toHaveText('2 / 5');
    await expect(treatments.locator('small')).toHaveText('Stimpacks / patchs');
    const tops = await stats.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    await expect(popup.locator('.weapons-table tbody tr')).toContainText('Service blaster');
    await expect(popup.locator('.weapons-table tbody td').nth(4)).toHaveText('Courte');
    await expect(popup.locator('.weapons-table tbody tr')).toContainText('Accurate 2');
    await expect(popup.locator('.armor-table tbody tr')).toContainText('Reinforced jacket');
    await expect(popup.locator('.weapons-table td:first-child small')).toContainText('Optical scope');
    await expect(popup.locator('.armor-table td:first-child small')).toContainText('Thermal lining');
    await expect(popup.locator('.gear-table tbody tr')).toHaveCount(1);
    await expect(popup.locator('.gear-table tbody tr')).toContainText('Tool kit');
    const oldMotivation = popup.locator('.entry').filter({has: popup.getByRole('heading', {name: 'Famille', exact: true})});
    await expect(oldMotivation.locator('.meta')).toHaveText('Liens');
    await expect(oldMotivation.locator('.description')).toHaveText('Trouver <Venn>.');
    await expect(popup.locator('.talents-table thead th')).toHaveText(['Talent', 'Rang']);
    await expect(popup.locator('.talents-table tbody tr').filter({hasText: 'Toughened'}).last().locator('td').last()).toHaveText('3');
    await expect(popup.locator('.talents-table tbody tr').filter({hasText: 'Quick Draw'}).locator('td').last()).toHaveText('-');
    await expect(popup.locator('.xp-table')).toContainText('Training investment');
    await expect(popup.locator('.identity-details dd')).toHaveText(['Femme', '31', '1,69 m', 'Athlétique', 'Bruns', 'Verts']);
    await expect(popup.locator('.identity-biography')).toContainText('independent salvage crew');
    await expect(popup.locator('.continuation')).not.toContainText('independent salvage crew');
    await expect(popup.locator('.summary .inventory-table')).toHaveCount(0);
    await expect(popup.locator('main')).not.toContainText(/DESCRIPTION-MARKER|SPECIAL-MARKER|TIMESTAMP-MARKER|SPECIES-MARKER|CAREER-MARKER|SPECIALIZATION-MARKER|Faits notables/);
    const pdf = await popup.pdf({path: testInfo.outputPath('character-sheet.pdf'), preferCSSPageSize: true, printBackground: false});
    expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
    await popup.close();

    await page.evaluate(async id => {
      const actor = game.actors.get(id);
      const paragraph = 'The salvage crew crossed the Outer Rim and repaired stranded ships, recording each route in a shared flight journal.';
      await actor.update({'system.biography': '<p>LONG BIOGRAPHY START. ' + (paragraph + ' ').repeat(22) + 'LONG BIOGRAPHY END.</p>'});
      await actor.createEmbeddedDocuments('Item', [
        {type: 'obligation', name: 'Protect the fleet', system: {type: 'duty', magnitude: 4}},
        {type: 'obligation', name: 'Compassion', system: {type: 'morality', subtype: 'Emotional Strength'}},
        {type: 'motivation', name: 'Libérer les prisonniers', system: {type: 'Cause'}},
      ]);
      await actor.createEmbeddedDocuments('Item', Array.from({length: 65}, (_, index) => ({
        name: 'Field kit ' + (index + 1) + ' with a long label for inventory wrapping',
        type: 'gear',
        system: {quantity: {value: 2}, encumbrance: {value: index % 5}},
      })));
    }, actorId.actor);
    popup = await preview();
    await expect(popup.locator('.gear-table tbody tr')).toHaveCount(66);
    await expect(popup.locator('.identity-biography')).toHaveCount(0);
    const section = title => popup.locator('.continuation > section')
      .filter({has: popup.getByRole('heading', {level: 2, name: title, exact: true})});
    await expect(section('Biographie').locator('.description')).toContainText('LONG BIOGRAPHY END.');
    await expect(section('Obligation')).toHaveCount(0);
    await expect(section('Devoir')).toContainText('Protect the fleet');
    await expect(section('Moralité')).toContainText('Force émotionnelle');
    await expect(section('Motivation').locator('.entry h3')).toHaveText(['Libérer les prisonniers', 'Famille']);
    const counters = popup.locator('.stats > .stat > span');
    await expect(counters).toContainText(['Devoir', 'Moralité', 'Conflit']);
    await expect(counters.filter({hasText: 'Obligation'})).toHaveCount(0);
    await popup.pdf({path: testInfo.outputPath('long-inventory.pdf'), preferCSSPageSize: true, printBackground: false});
    await popup.close();
  } finally {
    await page.evaluate(async id => {await game.actors.get(id)?.sheet.close();await game.actors.get(id)?.delete();}, actorId.actor);
  }
});
