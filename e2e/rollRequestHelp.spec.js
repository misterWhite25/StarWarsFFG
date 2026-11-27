import {expect, test} from '@playwright/test';
import {openGame} from '../playwright/fixtures';

test.describe.configure({timeout: 120_000});

test('roll request skill help opens on demand and tracks the selected skill', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('core.noCanvas', 'true');
    localStorage.setItem('core.language', JSON.stringify('fr'));
    localStorage.setItem('core.maxFPS', '10');
  });
  await openGame(page);

  await page.waitForFunction(() => typeof globalThis.game?.ffg?.rollRequests?.show === 'function');
  page.on('pageerror', error => console.error(error.message));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('ROLL_REQUEST_TEST')) console.error(message.text()); });
  const openRequest = () => page.evaluate(() => {
    window.rollRequestTest = game.ffg.rollRequests.show({skillKey: 'Ranged: Light'});
    void window.rollRequestTest.catch(error => console.error('ROLL_REQUEST_TEST', error.stack));
  });
  const request = page.locator('.ffg-roll-request-dialog');
  const help = page.locator('.ffg-roll-request-rules-window');
  const toggle = request.getByRole('button', {name: 'Règles de la compétence'});
  const skill = request.locator('[data-request-skill]');
  const references = [];
  page.on('request', request => {
    if (request.url().endsWith('/data/skill-references-fr.json')) references.push(request.url());
  });

  await openRequest();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(skill).toHaveValue('Ranged: Light');
  const skillGroups = await skill.locator('optgroup').evaluateAll(groups => groups.map(group => ({
    label: group.label,
    names: [...group.children].map(option => option.text),
    keys: [...group.children].map(option => option.value),
  })));
  expect(skillGroups.map(group => group.label)).toEqual(['Compétences Générales', 'Compétences de Combat', 'Social', 'Connaissances']);
  expect(skillGroups[0].keys).toContain('Medicine');
  expect(skillGroups[1].keys).toContain('Ranged: Light');
  expect(skillGroups[2].keys).toContain('Charm');
  expect(skillGroups[3].keys).toContain('Knowledge: Outer Rim');
  const collator = new Intl.Collator('fr');
  for (const group of skillGroups) expect(group.names).toEqual([...group.names].sort(collator.compare));
  await expect(request.locator('.ffg-request-rules')).toHaveCount(0);
  await expect(help).toHaveCount(0);
  expect(references).toHaveLength(0);

  await toggle.click();
  await expect(help).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(help.locator('h2')).toHaveText('Armes légères');
  await expect(help.locator('[data-reference-id="6-1"] summary')).toContainText('Difficulté des attaques');
  const formBounds = await request.boundingBox();
  const helpBounds = await help.boundingBox();
  expect(helpBounds.x >= formBounds.x + formBounds.width - 1 || formBounds.x >= helpBounds.x + helpBounds.width - 1).toBe(true);
  expect(await help.evaluate(element => element.matches(':modal'))).toBe(false);

  await skill.selectOption('Medicine');
  await expect(help.locator('h2')).toHaveText('Médecine');
  await expect(help.locator('[data-request-description]')).not.toHaveAttribute('aria-busy', 'true');
  await expect(skill).toHaveValue('Medicine');
  await help.getByRole('button', {name: 'Fermer les informations'}).click();
  await expect(help).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(help.locator('h2')).toHaveText('Médecine');
  await toggle.click();
  await expect(help).toHaveCount(0);
  await toggle.click();
  await expect(help).toBeVisible();
  await request.getByRole('button', {name: 'Annuler', exact: true}).click();
  await expect(request).toHaveCount(0);
  await expect(help).toHaveCount(0);

  await page.setViewportSize({width: 800, height: 800});
  await page.evaluate(() => {
    CONFIG.FFG.skills['Route Planning QA'] = {label: 'Planification des routes', type: 'Navigation avancée'};
    window.rollRequestTest = game.ffg.rollRequests.show({skillKey: 'Ranged: Light'});
    void window.rollRequestTest.catch(error => console.error('ROLL_REQUEST_TEST', error.stack)).finally(() => { delete CONFIG.FFG.skills['Route Planning QA']; });
  });
  await expect(skill.locator('optgroup[label="Navigation avancée"] option')).toHaveText('Planification des routes');
  await toggle.click();
  await expect(help).toBeVisible();
  const compact = await help.boundingBox();
  expect(compact.x).toBeGreaterThanOrEqual(0);
  expect(compact.y).toBeGreaterThanOrEqual(0);
  expect(compact.x + compact.width).toBeLessThanOrEqual(800);
  expect(compact.y + compact.height).toBeLessThanOrEqual(800);
  await help.getByRole('button', {name: 'Fermer les informations'}).click();
  await expect(skill).toBeVisible();
  await request.locator('.window-header [data-action="close"]').click();
  await expect(request).toHaveCount(0);
  expect(await page.evaluate(() => window.rollRequestTest)).toBeNull();
});
