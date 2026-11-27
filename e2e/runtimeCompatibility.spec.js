// @ts-check
import { test, expect } from '@playwright/test';

// Document and chat scenarios can run without a WebGL scene in software-rendered CI.
async function configureClient(page, canvasNeeded = false) {
  await page.addInitScript(enabled => {
    localStorage.setItem('core.maxFPS', '10');
    localStorage.setItem('core.noCanvas', JSON.stringify(!enabled));
  }, canvasNeeded);
  await page.addLocatorHandler(page.locator('.tour-center-step [data-action=exit], #tooltip.tour [data-action=exit]').first(),
    button => button.click());
}

async function joinPlayer(page) {
  await configureClient(page);
  await page.goto(new URL('/join', process.env.FOUNDRY_URL).href);
  await expect(page.locator('#main-header h1')).toHaveText(process.env.FOUNDRY_TEST_WORLD_TITLE);
  await page.locator('#join-username').selectOption({label: 'Player2'});
  await page.locator('#join-game-form button[name="join"]').click();
  await page.waitForFunction(() => globalThis.game?.ready === true, null, {timeout: 60_000});
  const save = page.getByRole('button', {name: 'Save Player Configuration', exact: true});
  if (await save.isVisible()) await save.click();
}

test.use({actionTimeout: 20_000});
test.describe.configure({timeout: 90_000});
test.beforeEach(async ({ page }, testInfo) => {
  await configureClient(page, testInfo.tags.includes('@canvas'));
  await page.addLocatorHandler(page.locator('#notifications .notification').filter({
    hasText: 'Your web browser does not have hardware acceleration enabled.',
  }), notice => notice.click());
  await page.goto('/game');
  await expect(page.locator('#destinyDark')).toBeVisible({ timeout: 30_000 });
  const identity = await page.evaluate(() => ({ world: game.world.id, system: game.system.id, isGM: game.user.isGM }));
  expect(identity).toEqual({ world: process.env.FOUNDRY_TEST_WORLD, system: 'starwarsffg', isGM: true });
});

test('runtime: all narrative dice, standard dice and mixed pools serialize', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const output = [];
    for (const formula of ['1da', '1db', '1dc', '1di', '1df', '1dp', '1ds', '1d6 + 2', '1da + 1d6', 'apd']) {
      try {
        const roll = new game.ffg.RollFFG(formula);
        await roll.evaluate({ maximize: true });
        const restored = game.ffg.RollFFG.fromData(JSON.parse(JSON.stringify(roll)));
        output.push({ formula, total: roll.total, ffg: roll.ffg, restored: restored.ffg,
          restoredTotal: restored.total, dice: roll.dice.map(d => ({ faces: d.faces, results: d.results.length })) });
      } catch (error) { output.push({ formula, error: String(error) }); }
    }
    return output;
  });
  expect(results.filter(r => r.error)).toEqual([]);
  for (const result of results) {
    expect(result.restored).toEqual(result.ffg);
    expect(result.restoredTotal).toEqual(result.total);
    expect(Object.values(result.ffg).every(Number.isFinite)).toBe(true);
    expect(result.dice.every(d => d.results === 1)).toBe(true);
  }
  expect(results.find(r => r.formula === '1d6 + 2').total).toBe(8);
  expect(results.find(r => r.formula === '1da + 1d6').total).toBe(6);
});

test('runtime: current chat modes and legacy options set actual document visibility', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const previous = game.settings.get('core', 'messageMode');
    const before = game.messages.size;
    const output = [];
    try {
      await game.settings.set('core', 'messageMode', 'blind');
      for (const mode of ['public', 'gm', 'blind', 'self', 'publicroll', 'roll']) {
        const roll = await new game.ffg.RollFFG('1da').evaluate({ maximize: true });
        const data = await roll.toMessage({}, { messageMode: mode, create: false });
        output.push({ mode, whisper: data.whisper, blind: data.blind, author: data.author });
      }
      return { output, author: game.user.id, gms: game.users.filter(u => u.isGM).map(u => u.id),
        messagesAdded: game.messages.size - before };
    } finally { await game.settings.set('core', 'messageMode', previous); }
  });
  expect(results.messagesAdded).toBe(0);
  for (const result of results.output) {
    expect(result.author).toBe(results.author);
    expect(result.whisper).toEqual(['public', 'publicroll'].includes(result.mode) ? []
      : result.mode === 'self' ? [results.author] : results.gms);
    expect(result.blind).toBe(['blind', 'roll'].includes(result.mode));
  }
});

test('runtime: automatic symbols cancel correctly and survive serialization', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const pool = new DicePoolFFG({ success: 3, failure: 1, advantage: 2, threat: 3,
      triumph: 1, despair: 1, light: 1, dark: 2 });
    // The first ability-die face is blank, leaving only the automatic symbols.
    const roll = await new game.ffg.RollFFG('1da', {}, pool).evaluate({ minimize: true });
    return { symbols: roll.ffg, restored: game.ffg.RollFFG.fromData(JSON.parse(JSON.stringify(roll))).ffg };
  });
  expect(result.symbols).toEqual({ success: 2, failure: 0, advantage: 0, threat: 1,
    triumph: 1, despair: 1, light: 1, dark: 2 });
  expect(result.restored).toEqual(result.symbols);
});

test('runtime: character, minion, rival, nemesis and vehicle sheets persist edits', async ({ page }) => {
  const ids = [];
  try {
    for (const type of ['character', 'minion', 'rival', 'nemesis', 'vehicle']) {
      const id = await page.evaluate(async type => {
        const actor = await game.ffg.ActorFFG.create({ name: `Runtime ${type} persistence`, type });
        const stat = type === 'vehicle' ? 'hullTrauma' : 'wounds';
        await actor.update({ [`system.stats.${stat}.max`]: 20, [`system.stats.${stat}.value`]: 3 });
        await actor.sheet.getData();
        return actor.id;
      }, type);
      ids.push(id);
    }
    await page.reload({waitUntil: 'domcontentloaded'});
    await expect(page.locator('#destinyDark')).toBeVisible({ timeout: 30_000 });
    const saved = await page.evaluate(ids => ids.map(id => {
      const actor = game.actors.get(id);
      const stat = actor.type === 'vehicle' ? 'hullTrauma' : 'wounds';
      return actor.toObject().system.stats[stat].value;
    }), ids);
    expect(saved).toEqual([3, 3, 3, 3, 3]);
  } finally {
    await page.evaluate(async ids => { await game.ffg.ActorFFG.deleteDocuments(ids); }, ids);
  }
});

test('runtime: active effect source data renders with v14 phases and duration', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { default: EffectHelpers } = await import('/systems/starwarsffg/modules/helpers/effects.js');
    const actor = new game.ffg.ActorFFG({ name: 'Transient runtime effect test', type: 'character' });
    const effect = new game.ffg.ActiveEffectFFG({ name: 'Runtime defense',
      duration: { value: 2, units: 'rounds' },
      system: { changes: [{ key: 'system.stats.defence.ranged', type: 'add', phase: 'initial', value: 1, priority: 20 }] }
    }, { parent: actor });
    const before = JSON.stringify(effect.toObject());
    const display = EffectHelpers.transformEffects(effect);
    return { display, unchanged: before === JSON.stringify(effect.toObject()) };
  });
  expect(result.unchanged).toBe(true);
  expect(result.display.changes[0]).toMatchObject({ key: 'stats.defence.ranged', mode: 'ADD', phase: 'initial', priority: 20 });
  expect(typeof result.display.duration).toBe('string');
});

test('runtime: item sheets prepare without traversing circular Document references', async ({ page }) => {
  const failures = await page.evaluate(async () => {
    const failures = [];
    for (const type of ['armour', 'weapon', 'gear', 'itemattachment', 'itemmodifier', 'talent', 'forcepower', 'signatureability', 'specialization']) {
      const item = new game.ffg.ItemFFG({ name: `Transient ${type}`, type });
      try {
        const data = await item.sheet.getData();
        const tree = data.item.system.upgrades ?? data.item.system.talents;
        if (tree && Object.values(tree).some(node => node.visible !== true)) throw new Error('Tree was not prepared before the sheet snapshot');
      }
      catch (error) { failures.push({ type, error: error.stack }); }
    }
    return failures;
  });
  expect(failures).toEqual([]);
});

test('runtime: an observer sees only the public and revealed parts of a character biography', async ({page, browser}) => {
  test.slow();
  const context = await browser.newContext({storageState: {cookies: [], origins: []}});
  let actorId;
  try {
    actorId = await page.evaluate(async () => {
      const player = game.users.getName('Player2');
      const biography = '<p>Public passage</p><section class="secret"><p>Private passage</p></section>'
        + '<section class="secret revealed"><p>Revealed passage</p></section>';
      const actor = await Actor.create({name: 'Biography visibility QA', type: 'character', system: {biography},
        ownership: {[player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER}}, {renderSheet: false});
      return actor.id;
    });
    const renderBiography = async (client, id) => {
      const sheetId = await client.evaluate(async id => {
        const sheet = game.actors.get(id).sheet;
        await sheet.render({force: true});
        return sheet.id;
      }, id);
      return client.locator('[id="' + sheetId + '"] .ffg-basic-biography .biography-editor');
    };
    const ownerBio = await renderBiography(page, actorId);
    await expect(ownerBio).toContainText('Private passage');
    const player = await context.newPage();
    await joinPlayer(player);
    expect(await player.evaluate(id => game.actors.get(id).testUserPermission(game.user, 'OBSERVER', {exact: true}), actorId)).toBe(true);
    const observerBio = await renderBiography(player, actorId);
    await expect(observerBio).toContainText('Public passage');
    await expect(observerBio).toContainText('Revealed passage');
    await expect(observerBio).not.toContainText('Private passage');
  } finally {
    await context.close();
    if (actorId) await page.evaluate(id => game.actors.get(id)?.delete(), actorId);
  }
});

test('runtime: player and GM see the correct roll content, including after reload', async ({ page, browser }) => {
  test.setTimeout(150_000);
  // Override Playwright's project storageState: the player must get a new server session.
  const playerContext = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
  const playerPage = await playerContext.newPage();
  const ids = [];
  try {
    await joinPlayer(playerPage);
    expect(await playerPage.evaluate(() => ({ name: game.user.name, isGM: game.user.isGM })))
      .toEqual({ name: 'Player2', isGM: false });
    expect(await page.evaluate(() => game.user.isGM)).toBe(true);
    for (const mode of ['public', 'gm', 'blind', 'self']) {
      const id = await playerPage.evaluate(async mode => {
        const roll = await new game.ffg.RollFFG('1da').evaluate({ maximize: true });
        return (await roll.toMessage({ flavor: `Runtime visibility ${mode}` }, { messageMode: mode })).id;
      }, mode);
      ids.push(id);
      await expect.poll(() => page.evaluate(id => !!game.messages.get(id), id)).toBe(true);
      const playerContent = await playerPage.evaluate(id => game.messages.get(id).isContentVisible, id);
      const gmContent = await page.evaluate(id => game.messages.get(id).isContentVisible, id);
      expect(playerContent, `${mode}: player visibility`).toBe(mode !== 'blind');
      expect(gmContent, `${mode}: GM visibility`).toBe(mode !== 'self');
    }
    await playerPage.reload({waitUntil: 'domcontentloaded'});
    await expect.poll(() => playerPage.evaluate(() => typeof game !== 'undefined' && !!game.ready).catch(() => false), { timeout: 60_000 }).toBe(true);
    const visibility = await playerPage.evaluate(ids => ids.map(id => game.messages.get(id)?.isContentVisible), ids);
    expect(visibility).toEqual([true, true, false, true]);
    const blindMessage = playerPage.locator(`[data-message-id="${ids[2]}"]`);
    await expect(blindMessage).not.toContainText('Successes:');
  } catch (error) {
    console.log('Player page at failure:', await playerPage.locator('body').innerText({ timeout: 3000 }).catch(() => 'Unavailable'));
    throw error;
  } finally {
    await playerContext.close();
    await page.evaluate(async ids => {
      const remaining = ids.filter(id => game.messages.has(id));
      if (remaining.length) await ChatMessage.deleteDocuments(remaining);
    }, ids);
  }
});

test('runtime: Force bonuses and final-phase effects persist without double application', async ({ page }) => {
  const id = await page.evaluate(async () => {
    const actor = await game.ffg.ActorFFG.create({ name: 'Runtime Force phase test', type: 'character' });
    await actor.update({ 'system.stats.forcePool.max': 2, 'system.stats.forcePool.value': 1 });
    await actor.createEmbeddedDocuments('ActiveEffect', [
      { name: 'Force Rating', system: { changes: [{ key: 'system.stats.forcePool.max', type: 'add', value: 1 }] } },
      { name: 'Disabled Force Rating', disabled: true, system: { changes: [{ key: 'system.stats.forcePool.max', type: 'add', value: 5 }] } },
      { name: 'Force skill', system: { changes: [{ key: 'system.skills.Discipline.force', type: 'add', value: 0 }] } },
      { name: 'Final defense', system: { changes: [{ key: 'system.stats.defence.ranged', type: 'add', value: 2, phase: 'final', priority: 20 }] } },
    ]);
    return actor.id;
  });
  try {
    const readStats = () => page.evaluate(id => {
      const actor = game.actors.get(id);
      return { max: actor.system.stats.forcePool.max, force: actor.system.skills.Discipline.force,
        defense: actor.system.stats.defence.ranged };
    }, id);
    expect(await readStats()).toEqual({ max: 3, force: 2, defense: 2 });
    await page.reload({waitUntil: 'domcontentloaded'});
    await expect(page.locator('#destinyDark')).toBeVisible({ timeout: 30_000 });
    expect(await readStats()).toEqual({ max: 3, force: 2, defense: 2 });
    await page.evaluate(async id => {
      await game.actors.get(id).effects.find(e => e.name === 'Force Rating').update({ disabled: true });
    }, id);
    expect(await readStats()).toEqual({ max: 2, force: 1, defense: 2 });
  } finally {
    await page.evaluate(async id => { await game.actors.get(id)?.delete(); }, id);
  }
});

test('runtime: system status durations survive the v14 ActiveEffect data model', async ({ page }) => {
  const id = await page.evaluate(async () => {
    const actor = await game.ffg.ActorFFG.create({ name: 'Runtime expiring effects', type: 'character' });
    await actor.createEmbeddedDocuments('ActiveEffect', ['once', 'combat'].map(duration => ({
      name: `Runtime ${duration} effect`, system: { duration },
      changes: [{ key: 'system.skills.Discipline.boost', type: 'add', value: 1 }],
    })));
    return actor.id;
  });
  try {
    const readDurations = () => page.evaluate(id => game.actors.get(id).effects.map(effect => ({
      prepared: effect.system.duration, saved: effect.toObject().system.duration,
    })).sort((a, b) => a.prepared.localeCompare(b.prepared)), id);
    const expected = [{ prepared: 'combat', saved: 'combat' }, { prepared: 'once', saved: 'once' }];
    expect(await readDurations()).toEqual(expected);
    await page.reload({waitUntil: 'domcontentloaded'});
    await expect(page.locator('#destinyDark')).toBeVisible({ timeout: 30_000 });
    expect(await readDurations()).toEqual(expected);
    await page.evaluate(id => {
      const actor = game.actors.get(id);
      new game.ffg.RollBuilderFFG({ document: actor, actor: actor.toObject() },
        new DicePoolFFG({ boost: 1 }), 'Runtime expiry roll', 'Discipline').render(true);
    }, id);
    await page.locator('#roll-builder .roll-button .btn').click();
    await expect.poll(readDurations).toEqual([{ prepared: 'combat', saved: 'combat' }]);
    await page.evaluate(async () => {
      await Object.values(ui.windows).find(app => app.id === 'roll-builder')?.close();
    });
  } finally {
    await page.evaluate(async id => {
      const messages = game.messages.filter(m => m.speaker.actor === id).map(m => m.id);
      if (messages.length) await ChatMessage.deleteDocuments(messages);
      await game.actors.get(id)?.delete();
    }, id);
  }
});

test('runtime: hidden initiative remains private and combat advances', {tag: '@canvas'}, async ({ page }) => {
  test.setTimeout(90_000);
  const created = await page.evaluate(async () => {
    const actor = await game.ffg.ActorFFG.create({ name: 'Runtime hidden combatant', type: 'character' });
    await actor.update({ 'system.characteristics.Willpower.value': 2 });
    await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Runtime combat effect',
      system: { duration: 'combat' } }]);
    const scene = await Scene.create({ name: 'Runtime combat scene', width: 1000, height: 1000,
      tokens: [{ name: actor.name, actorId: actor.id, actorLink: true, hidden: true, x: 200, y: 200 }] });
    await scene.activate();
    await scene.view();
    const combat = await game.ffg.CombatFFG.create({ scene: scene.id, active: true });
    const [combatant] = await combat.createEmbeddedDocuments('Combatant', [{ actorId: actor.id,
      tokenId: scene.tokens.contents[0].id, sceneId: scene.id, hidden: true }]);
    return { actor: actor.id, scene: scene.id, combat: combat.id, combatant: combatant.id };
  });
  try {
    await page.evaluate(({ combat, combatant }) => {
      void game.combats.get(combat).rollInitiative([combatant], { messageOptions: { messageMode: 'public' } });
    }, created);
    await page.getByRole('button', { name: 'Rolling Initiative', exact: true }).click();
    await expect.poll(() => page.evaluate(({ combat, combatant }) =>
      game.combats.get(combat).combatants.get(combatant).initiative, created)).not.toBe(null);
    const message = await page.evaluate(({ actor }) => {
      const message = game.messages.find(m => m.speaker.actor === actor && m.flags.core?.initiativeRoll);
      return { whisper: message?.whisper, gms: game.users.filter(u => u.isGM).map(u => u.id) };
    }, created);
    expect(message.whisper).toEqual(message.gms);
    const state = await page.evaluate(async ({ combat, combatant }) => {
      const encounter = game.combats.get(combat);
      await encounter.startCombat();
      await encounter.claimSlot(encounter.round, combatant, combatant);
      const claim = encounter.getSlotClaims(encounter.round, combatant);
      await ui.combat.render(true);
      await encounter.nextTurn();
      return { round: encounter.round, claim };
    }, created);
    expect(state.round).toBeGreaterThanOrEqual(1);
    expect(state.claim).toBe(created.combatant);
    await page.evaluate(async ({ combat, combatant }) => {
      await game.combats.get(combat).combatants.get(combatant).delete();
    }, created);
    expect(await page.evaluate(({ actor }) => game.actors.get(actor).effects.size, created)).toBe(0);
  } finally {
    await page.evaluate(async ({ actor, scene, combat }) => {
      const messages = game.messages.filter(m => m.speaker.actor === actor).map(m => m.id);
      if (messages.length) await ChatMessage.deleteDocuments(messages);
      await game.combats.get(combat)?.delete();
      await game.scenes.get(scene)?.delete();
      await game.actors.get(actor)?.delete();
    }, created);
  }
});

test('runtime: destiny rolls and spending synchronize between player and GM', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const previous = await page.evaluate(() => ({ light: game.settings.get('starwarsffg', 'dPoolLight'),
    dark: game.settings.get('starwarsffg', 'dPoolDark'), messages: game.messages.map(m => m.id) }));
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
  try {
    const player = await context.newPage();
    await joinPlayer(player);
    await page.evaluate(async () => {
      await game.settings.set('starwarsffg', 'dPoolLight', 2);
      await game.settings.set('starwarsffg', 'dPoolDark', 1);
    });
    const readPool = client => client.evaluate(() => ({ light: game.settings.get('starwarsffg', 'dPoolLight'),
      dark: game.settings.get('starwarsffg', 'dPoolDark') }));
    await expect.poll(() => readPool(player)).toEqual({ light: 2, dark: 1 });
    await player.locator('#destinyLight').click();
    await expect.poll(() => readPool(page)).toEqual({ light: 1, dark: 2 });
    await expect.poll(() => readPool(player)).toEqual({ light: 1, dark: 2 });
    await page.locator('#destinyDark').click();
    await expect.poll(() => readPool(player)).toEqual({ light: 2, dark: 1 });
    // The normal GM request button registers the respondent and creates the chat action.
    await page.locator('#destinyMenu a[data-value="1"]').click();
    const readRequest = () => page.evaluate(previousIds => game.messages.find(m =>
      !previousIds.includes(m.id) && m.content.includes('ffg-destiny-roll'))?.id, previous.messages);
    await expect.poll(readRequest).toBeTruthy();
    const requestId = await readRequest();
    await player.reload({waitUntil: 'domcontentloaded'});
    await player.waitForFunction(() => globalThis.game?.ready === true, null, {timeout: 60_000});
    await player.getByRole('tab', { name: 'Chat Messages', exact: true }).click();
    await player.locator(`[data-message-id="${requestId}"] .ffg-destiny-roll:not(#chat-notifications *)`).click({ timeout: 15_000 });
    await expect.poll(async () => {
      const pool = await readPool(page);
      return pool.light + pool.dark;
    }).toBeGreaterThan(3);
    await expect.poll(() => readPool(player)).toEqual(await readPool(page));
  } finally {
    await page.evaluate(async previous => {
      await game.settings.set('starwarsffg', 'dPoolLight', previous.light);
      await game.settings.set('starwarsffg', 'dPoolDark', previous.dark);
      const ids = game.messages.filter(m => !previous.messages.includes(m.id)).map(m => m.id);
      if (ids.length) await ChatMessage.deleteDocuments(ids);
    }, previous);
    await context.close();
  }
});

test('runtime: skill previews use one actor sheet context per render', async ({page}) => {
  const results = await page.evaluate(async () => {
    const actor = await game.ffg.ActorFFG.create({name:'Skill previews test',type:'character'}, {renderSheet:false});
    const sheet = actor.sheet;
    const prepare = sheet._prepareContext.bind(sheet);
    let calls = 0;
    sheet._prepareContext = (...args) => { calls++; return prepare(...args); };
    try {
      await actor.update({'system.characteristics.Brawn.value':3, 'system.skills.Athletics.rank':1});
      const measurements = [];
      for (let i = 0; i < 2; i++) {
        const before = calls;
        await sheet.render({force:true});
        const pools = sheet.element.querySelectorAll('.skill[data-ability] .roll-button');
        measurements.push({contexts:calls-before,rows:pools.length,hasDice:[...pools].some(pool=>pool.childElementCount>0)});
      }
      return measurements;
    } finally {
      delete sheet._prepareContext;
      await sheet.close({animate:false});
      await actor.delete();
    }
  });
  for (const result of results) {
    expect(result.contexts).toBe(1);
    expect(result.rows).toBeGreaterThan(1);
    expect(result.hasDice).toBe(true);
  }
});

test('runtime: ground range labels follow the token through pans, zooms and range changes', {tag: '@canvas'}, async ({page}) => {
  await page.waitForFunction(() => canvas.initialized && !canvas.loading && (!game.scenes.current || canvas.ready));
  const result = await page.evaluate(async () => {
    const {setGroundRangeOverlay, clearGroundRangeOverlay} = await import('/systems/starwarsffg/modules/helpers/ground-range-overlay.mjs');
    const oldMode = game.settings.get('starwarsffg', 'enableBattlemapMovement');
    const oldRanges = game.settings.get('starwarsffg', 'groundRangeDistances');
    const oldScene = game.scenes.current;
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let scene, actor;
    try {
      await game.settings.set('starwarsffg', 'enableBattlemapMovement', true);
      await game.settings.set('starwarsffg', 'groundRangeDistances', {contact: 1, short: 2, medium: 4, long: 6, extreme: 8});
      actor = await Actor.create({name:'Runtime range token', type:'minion'}, {renderSheet:false});
      scene = await Scene.create({name:'Runtime ground ranges', active:false, width:1600, height:1600, grid:{type:1, size:100, distance:1, units:'m'},
        flags:{starwarsffg:{groundMovement:{mode:'battlemap'}}},
        tokens:[{name:actor.name, actorId:actor.id, actorLink:true, x:600, y:600}]});
      await scene.view();
      const token = scene.tokens.contents[0];
      setGroundRangeOverlay({token}, token, true);
      await nextFrame();
      const overlay = () => canvas.interface.children.find(child => child.name === 'ffg-ground-range-overlay');
      const labels = () => overlay().children.flatMap(child => child.visible ? child.children.filter(text => text instanceof PIXI.Text) : []);
      const first = labels();
      const pixelPositions = () => labels().every(label => {
        const screen = label.getGlobalPosition();
        return Math.abs(screen.x - Math.round(screen.x)) < .001 && Math.abs(screen.y - Math.round(screen.y)) < .001;
      });
      canvas.pan({x:740, y:720, scale:1.25});
      await nextFrame();
      const zoom = canvas.stage.scale.x;
      const readable = pixelPositions() && labels().every(label => Math.abs(label.parent.scale.x * zoom - 1) < .001);
      canvas.pan({x:660, y:680, scale:zoom});
      await nextFrame();
      const afterPan = pixelPositions();
      await token.update({x:800, y:900}, {animate:false});
      await nextFrame();
      const center = token.object.center;
      const followed = overlay().ffgCenter.x === center.x && overlay().ffgCenter.y === center.y;
      const retained = first.length === 4 && first.every((label, i) => labels()[i] === label);
      await game.settings.set('starwarsffg', 'groundRangeDistances', {contact:1, short:3, medium:4, long:6, extreme:10000});
      await nextFrame();
      const ranges = overlay().ffgRanges.map(({distance, radiusPixels}) => [distance, radiusPixels]);
      const visibleLabels = labels().length;
      clearGroundRangeOverlay();
      return {readable, afterPan, followed, retained, ranges, visibleLabels, removed:!overlay(), released:first.every(label => label.destroyed)};
    } finally {
      clearGroundRangeOverlay();
      if (oldScene) await oldScene.view();
      await scene?.delete();
      await actor?.delete();
      await game.settings.set('starwarsffg', 'groundRangeDistances', oldRanges);
      await game.settings.set('starwarsffg', 'enableBattlemapMovement', oldMode);
    }
  });
  expect(result).toEqual({readable:true, afterPan:true, followed:true, retained:true,
    ranges:[[3,300],[4,400],[6,600]], visibleLabels:3, removed:true, released:true});
});
