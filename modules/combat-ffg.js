import {resolveCrewActor} from './helpers/integrated-crew.mjs';
import {crewRoleDefinition} from './helpers/crew-role-definitions.mjs';
import {prepareInitiativeParticipants, initiativeIdentity, revalidateInitiativeParticipant, initiativeSkipSummary} from './helpers/initiative-participants.js';
import { LegacyDialogV2 } from "./applications/legacy-dialog-v2.js";

const { DialogV2 } = foundry.applications.api;
import { getMessageMode } from "./helpers/chat.js";
import {DicePoolFFG, RollFFG} from "./dice-pool-ffg.js";

/**
 * Extend the base Combat entity.
 * @extends {Combat}
 * Note: slot claiming is in the following format:
 * {
 *   <round>: {
 *     <turnCombatantId>:<claimantCombatantId>,
 *   }
 * }
 *
 * for example, if we had two combatants:
 * combatant "hello" - ID 111
 * combatant "world" - ID 222
 * and "hello" claimed "world's" slot for round one, the structure would look like this:
 * {
 *   1: {
 *     222: 111,
 *   }
 * }
 * and the UI would show "hello" as the sole claimant for this round (the other slot would say "claim this slot")
 */
export class CombatFFG extends Combat {
  /**
   * Adds a generic slot to the combat (via a flag)
   * @param round - INT - the round to add the slot to
   * @param disposition - INT - the disposition of the slot
   * @param initiative - FLOAT - the initiative value of the slot
   * @returns {Promise<void>}
   */
  async addExtraSlot(round, disposition, initiative) {
    const data = {
      name: "__GENERIC_SLOT__",
      disposition: disposition,
      combatantId: foundry.utils.randomID(),
      hidden: false,
      visible: true,
      initiative: initiative,
      flags: {
        fake: true,
        disposition: disposition,
      },
    };

    const createdSlotId = (await this.createEmbeddedDocuments("Combatant", [data]))[0].id;
    const createdSlot = this.combatants.get(createdSlotId);
    await createdSlot.setFlag("starwarsffg", "fake", true);
    await createdSlot.setFlag("starwarsffg", "disposition", disposition);
    return createdSlotId;
  }

  /**
   * Adds a slot to the combat with a specific combatant ID
   * @param disposition - disposition to create the combatant with
   * @param initiative - initiative to create the combatant with
   * @param actorId - the ID of the existing actor to assign to the combatant
   * @param tokenId - the ID of the existing token to assign to the combatant
   * @param sceneId - the ID of the existing scene to assign to the combatant
   * @param claimantName - the name of the claimant to assign to the combatant
   * @returns {Promise<void>}
   */
  async addIDedExtraSlot(disposition, initiative, actorId, tokenId, sceneId, claimantName) {
    const data = {
      name: claimantName,
      disposition: disposition,
      actorId: actorId,
      tokenId: tokenId,
      sceneId: sceneId,
      hidden: false,
      visible: true,
      initiative: initiative,
    };

    const createdSlotId = (await this.createEmbeddedDocuments("Combatant", [data]))[0].id;
    return createdSlotId;
  }

  /**
   * Handler for clicking the "add extra slot" button. Creates a dialog to get the slot details,
   * then calls the function to create the slot
   * @returns {Promise<void>}
   */
  async addInitiativeSlot() {
    // ask the user which disposition and initiative they would like, so we can add a generic slot

    let slotDialog = new LegacyDialogV2({
      title: game.i18n.localize("SWFFG.Combats.Slots.Dialog.Title"),
      content: `
        <p>${game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Initiative")} :</p>
        <input type="number" id="initiative" name="initiative" value="0">
        <p>${game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Disposition")}:</p>
        <label><input type="radio" id="friendly" name="disposition" value="friendly">${game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Friendly")}</label>
        <label><input type="radio" id="neutral" name="disposition" value="neutral">${game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Neutral")}</label>
        <label><input type="radio" id="enemy" name="disposition" value="enemy">${game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Enemy")}</label>
      `,
      buttons: {
        submit: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Submit"),
          callback: async (obj, _event) => {
            const jObj = $(obj);
            let disposition = undefined;
            if (jObj.find("#friendly")[0].checked) {
              disposition = CONST.TOKEN_DISPOSITIONS["FRIENDLY"];
            } else if (jObj.find("#neutral")[0].checked) {
              disposition = CONST.TOKEN_DISPOSITIONS["NEUTRAL"];
            } else if (jObj.find("#enemy")[0].checked) {
              disposition = CONST.TOKEN_DISPOSITIONS["HOSTILE"];
            }
            if (disposition === undefined) {
              ui.notifications.warn(game.i18n.localize("SWFFG.UI.Root.DispositionRequired"));
              return;
            }
            const initiative = jObj.find("#initiative")[0].value;
            if (initiative === "") {
              ui.notifications.warn(game.i18n.localize("SWFFG.UI.Root.InitiativeRequired"));
              return;
            }
            this.debounceRender();
            await this.addExtraSlot(this.round, disposition, parseInt(initiative));
            this.setupTurns();
            game.socket.emit("system.starwarsffg", {event: "trackerRender", combatId: this.id});
          }
        }
      },
      default: "submit",
    });
    slotDialog.render(true);
  }

  debounceRender = foundry.utils.debounce(() => {
    if (ui.combat.viewed === this) {
      ui.combat.render();
    }
  }, 200);

  /** @override */
  async _getInitiativeRoll(combatant, initialFormula) {
    let formula = initialFormula;
    const cData = foundry.utils.duplicate(combatant.actor.system);

    if (combatant.actor.type === "vehicle") {
      return new RollFFG("0");
    }

    if (formula === "Vigilance") {
      formula = _getInitiativeFormula(cData.skills.Vigilance, parseInt(cData.characteristics.Willpower.value));
    } else if (formula === "Cool") {
      formula = _getInitiativeFormula(cData.skills.Cool, parseInt(cData.characteristics.Presence.value));
    }

    const rollData = combatant.actor ? combatant.actor.getRollData() : {};

    let roll = await new RollFFG(formula, rollData).roll();

    const total = roll.ffg.success + roll.ffg.advantage * 0.01;
    roll._result = total;
    roll._total = total;

    return roll;
  }

  /** @override */
  _getInitiativeFormula(_combatant) {
    return CONFIG.Combat.initiative.formula || game.system.initiative;
  }

  /** @override */
  async rollInitiative(initialIds, { formula = null, updateTurn = true, messageOptions = {} } = {}) {
    const plan = prepareInitiativeParticipants(this, initialIds);
    let ids = plan.selected.map(c => c.id);
    const identities = new Map(plan.selected.map(c => [c.id, initiativeIdentity(c)]));
    const skipped = [...plan.skipped];
    const reportSkipped = () => {if(skipped.length)ui.notifications.warn(initiativeSkipSummary(skipped,game.i18n.lang==='fr'));};
    if(!ids.length){reportSkipped();return this;}
    let initiative = this;

      const id = foundry.utils.randomID();

      let whosInitiative = initiative.combatant?.name;
      let dicePools = [];
      let vigilanceDicePool = new DicePoolFFG({});
      let coolDicePool = new DicePoolFFG({});
      let addDicePool = new DicePoolFFG({});

      const defaultInitiativeFormula = formula || initiative._getInitiativeFormula();
      if (Array.isArray(ids) && ids.length > 1) {
        whosInitiative = "Multiple Combatants";
      } else {
        // Make sure we are dealing with an array of ids
        ids = typeof ids === "string" ? [ids] : ids;
        const c = initiative.combatants.get(ids[0]);
        //const data = c.actor.system;
        const data = _findActorForInitiative(c);
        whosInitiative = c.actor.name;

        vigilanceDicePool = _buildInitiativePool(data, "Vigilance");
        coolDicePool = _buildInitiativePool(data, "Cool");

        const initSkills = Object.keys(data.skills).filter((skill) => data.skills[skill].useForInitiative);

        initSkills.forEach((skill) => {
          if (dicePools.find((p) => p.name === skill)) return;

          const skillPool = _buildInitiativePool(data, skill);
          skillPool.label = data.skills[skill].label;
          skillPool.name = skill;
          dicePools.push(skillPool);
        });
      }

      if (dicePools.findIndex((p) => p.name === "Vigilance") < 0) {
        vigilanceDicePool.label = "SWFFG.SkillsNameVigilance";
        vigilanceDicePool.name = "Vigilance";
        dicePools.push(vigilanceDicePool);
      }
      if (dicePools.findIndex((p) => p.name === "Cool") < 0) {
        coolDicePool.label = "SWFFG.SkillsNameCool";
        coolDicePool.name = "Cool";
        dicePools.push(coolDicePool);
      }

      const diceSymbols = {
        advantage: await foundry.applications.ux.TextEditor.enrichHTML("[AD]"),
        success: await foundry.applications.ux.TextEditor.enrichHTML("[SU]"),
        threat: await foundry.applications.ux.TextEditor.enrichHTML("[TH]"),
        failure: await foundry.applications.ux.TextEditor.enrichHTML("[FA]"),
        upgrade: await foundry.applications.ux.TextEditor.enrichHTML("[PR]"),
        force: await foundry.applications.ux.TextEditor.enrichHTML("[FO]"),
      };

      const title = game.i18n.localize("SWFFG.InitiativeRoll") + ` ${whosInitiative}...`;
      const content = await foundry.applications.handlebars.renderTemplate("systems/starwarsffg/templates/dialogs/ffg-initiative.html", {
        id,
        dicePools,
        addDicePool,
        defaultInitiativeFormula,
        diceSymbols,
      });

      return new Promise((resolve) => {
        new LegacyDialogV2({
        title,
        content,
        buttons: {
          one: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("SWFFG.InitiativeRoll"),
            callback: async () => {
              try {
                const container = document.getElementById(id);
                const currentId = initiative.combatant?.id;
                const baseFormulaType = container.querySelector('input[name="skill"]:checked')?.value;
                if(!baseFormulaType)throw Error(game.i18n.lang==='fr'?'Choisis la compétence d’initiative.':'Choose the initiative skill.');
                const prepared=[];
                for(const combatantId of ids) {
                  const checked=revalidateInitiativeParticipant(initiative,combatantId,identities.get(combatantId));
                  if(!checked.combatant){skipped.push({id:combatantId,reason:checked.reason});continue;}
                  const c=checked.combatant;
                  try {
                    const data=_findActorForInitiative(c),pool=_buildInitiativePool(data,baseFormulaType);
                    const addPool=DicePoolFFG.fromContainer(container.querySelector('.addDicePool'));
                    for(const name of ['success','advantage','failure','threat','boost','setback'])pool[name]+=Number(addPool[name]);
                    pool.force=Number(addPool.force);pool.upgrade(addPool.upgrades);
                    const roll=await new RollFFG(pool.renderDiceExpression(),c.actor.getRollData(),{success:pool.success,advantage:pool.advantage,failure:pool.failure,threat:pool.threat}).roll();
                    roll._result=roll._total=roll.ffg.success+roll.ffg.advantage*0.01;
                    const stillValid=revalidateInitiativeParticipant(initiative,combatantId,identities.get(combatantId));
                    if(!stillValid.combatant){skipped.push({id:combatantId,reason:stillValid.reason});continue;}
                    let messageMode=getMessageMode(messageOptions);
                    if((c.token.hidden||c.hidden)&&['public','ic'].includes(messageMode))messageMode='gm';
                    const messageData=foundry.utils.mergeObject({speaker:{scene:c.token.parent?.id??initiative.scene?.id,actor:c.actor.id,token:c.token.id,alias:c.token.name},flavor:`${c.token.name} ${game.i18n.localize('SWFFG.InitiativeRoll')} (${game.i18n.localize(`SWFFG.SkillsName${baseFormulaType.replace(/[: ]/g,'')}`)})`,flags:{'core.initiativeRoll':true}},messageOptions);
                    const chatData=await roll.toMessage(messageData,{create:false,messageMode});
                    prepared.push({id:combatantId,initiative:roll.total,chatData});
                  } catch(error) {CONFIG.logger.warn('Initiative roll failed',error);skipped.push({id:combatantId,reason:'failed'});}
                }
                // Revalidate every prepared result immediately before the grouped write.
                const ready=prepared.filter(entry=>{const check=revalidateInitiativeParticipant(initiative,entry.id,identities.get(entry.id));if(check.combatant)return true;skipped.push({id:entry.id,reason:check.reason});return false;});
                if(!ready.length){reportSkipped();return resolve(initiative);}
                await initiative.updateEmbeddedDocuments('Combatant',ready.map(entry=>({_id:entry.id,initiative:entry.initiative})));
                if(updateTurn&&currentId){const turn=initiative.turns.findIndex(t=>t.id===currentId);if(turn>=0)await initiative.update({turn});}
                // No public message for a now-hidden participant; no message for a removed/replaced one.
                const messages=[];
                for(const entry of ready){const check=revalidateInitiativeParticipant(initiative,entry.id,identities.get(entry.id));if(!check.combatant){skipped.push({id:entry.id,reason:check.reason});continue;}
                  if((check.combatant.hidden||check.combatant.token.hidden)&&!entry.chatData.whisper?.length){entry.chatData.whisper=ChatMessage.getWhisperRecipients('GM').map(user=>user.id);}
                  if(messages.length)entry.chatData.sound=null;messages.push(entry.chatData);
                }
                if(messages.length)await CONFIG.ChatMessage.documentClass.create(messages);
                reportSkipped();resolve(initiative);
              } catch(error) {ui.notifications.error(error.message);resolve(initiative);}
            },
          },
          two: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("SWFFG.Cancel"),
            callback: () => resolve(initiative),
          },
        },
        close: () => resolve(initiative),
        }).render(true);
      });
  }

  /**
   * Given an original combatant's ID, look up claims for that slot
   * Note: this is a key lookup
   * @param round - INT - the round
   * @param slot_id - STRING - the ID of the native combatant for this turn
   * @returns {undefined|*}
   */
  getSlotClaims(round, slot_id) {
    const claims = this.getFlag('starwarsffg', 'combatClaims') || undefined;
    if (!claims) {
      return undefined;
    }
    return claims[round]?.[slot_id];
  }

  /**
   * Given a claimant's ID, look up the slot they've claimed
   * Note: This is a search-by-value
   * @param round - INT - the round
   * @param combatantId - STRING - the ID of the native combatant for this turn
   * @returns {string|undefined} - an array of
   */
  findSlotClaims(round, combatantId) {
    const claims = this.getFlag('starwarsffg', 'combatClaims') || undefined;
    if (!claims) {
      return undefined;
    }
    const roundClaims = claims[round];
    try {
      return Object.keys(roundClaims).find(key => roundClaims[key] === combatantId) || undefined;
    } catch {
      // we get an exception if there have been no claims in the round yet
      return undefined;
    }
  }

  /**
   * gets any existing initiative claims for this round of a given combat
   * @param round - INT - the round
   * @returns {*|*[]} - a list of combatant IDs (NOT token IDs, NOT actor IDs)
   */
  getClaims(round) {
    const combatClaims = this.getFlag('starwarsffg', 'combatClaims');
    if (combatClaims) {
      return combatClaims[round] || [];
    }
    return [];
  }

  /**
   * Check if a given combatant has any claims in the current combat round
   * @param combatantId - STRING - the combatant ID (NOT token ID, NOT actor ID)
   * @returns {boolean|string} - false if no claims, otherwise the round of the claimant
   */
  hasClaims(combatantId) {
    const claims = this.getClaims(this.round);
    if (!claims) {
      return false;
    }
    if (Object.values(claims).includes(combatantId)) {
      return Object.keys(claims).find(key => claims[key] === combatantId);
    } else {
      return false;
    }
  }

  async handleCombatantRemoval(combatant, options, userId) {
    const {handleTrackedRemoval}=await import('./helpers/combatant-removal.mjs');
    return handleTrackedRemoval(this,combatant,options,userId);
  }

  async doRemoval(combatant, action) {
    switch (action) {
      case "combatant_only": {
        await this.removeCombatantOnly(combatant.id);
        break;
      }
      case "last_slot": {
        await this.removeLastSlot(combatant.id);
        break;
      }
    }
  }

  async handleCombatantAddition(_combatant, _context, _options, _combatantI) {
    // there may be cases when this is needed, but for now, we don't need to do anything
    // (leaving as a placeholder until we know for sure)
  }

  async removeCombatantOnly(combatantId) {
    const {removeParticipant}=await import('./helpers/combatant-removal.mjs');
    return removeParticipant(this,combatantId);
  }

  async removeLastSlot(combatantId) {
    const {removeParticipant}=await import('./helpers/combatant-removal.mjs');
    return removeParticipant(this,combatantId);
  }

  async claimSlot(round, slot_id, combatantId) {
    if (!game.user.isGM) {
      const data = {
        combatId: this.id,
        round: round,
        slot: slot_id,
        combatantId: combatantId,
      }
      game.socket.emit("system.starwarsffg", {event: "combat", data: data});
      return;
    }
    const claims = {
      ...this.getFlag('starwarsffg', 'combatClaims')
    };
    if (!claims[round]) {
      claims[round] = {};
    }
    claims[round][slot_id] = combatantId;
    await this.setFlag('starwarsffg', 'combatClaims', claims);
  }

  /**
   * Un-claim a slot for a given combatant
   * @param round - INT - the round
   * @param slot_id - STRING - the ID of the native combatant for this turn
   * @returns {Promise<void>}
   */
  async unclaimSlot(round, slot_id) {
    if (!game.user.isGM) {
      // only the GM can un-claim a slot
      return;
    }
    await this.unsetFlag('starwarsffg', `combatClaims.${round}.${slot_id}`);
  }

  /**
   * Used by the Combat Tracker to update the initiative of a single slot
   * @param el
   * @returns {Promise<void>}
   */
  async updateCombatant(el) {
    const slotId = el.getAttribute("data-alt-id") || el.getAttribute("data-combatant-id");
    const combatant = this.combatants.get(slotId);
    if (!combatant) return;
    const result = await DialogV2.input({
      window: {title: game.i18n.localize("SWFFG.Combats.Slots.Dialog.Title")},
      content: `
        <p>${game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Initiative")} :</p>
        <input type="number" name="initiative" step="any" required value="${combatant.initiative ?? ""}">
      `,
      ok: {
        icon: "fas fa-check",
        label: game.i18n.localize("SWFFG.Combats.Slots.Dialog.Labels.Submit"),
      },
    });
    if (!result) return;
    const initiative = Number(result.initiative);
    if (result.initiative == null || result.initiative === "" || !Number.isFinite(initiative)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.UI.Root.InitiativeRequired"));
      return;
    }
    await combatant.update({initiative});
    game.socket.emit("system.starwarsffg", {event: "trackerRender", combatId: this.id});
  }

  async removeCombatant(el) {
    const {removeTrackedCombatant}=await import('./helpers/combatant-removal.mjs');
    return removeTrackedCombatant(this,el);
  }

  async delete() {
    for (const combatant of this.combatants.contents) {
      await combatant.removeCombatEffects();
    }
    await super.delete();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    const turns = this.turns ?? [];
    const initiatives = new Map();
    for (const combatant of turns) {
      const disposition = combatant.disposition;
      if (!initiatives.has(disposition)) initiatives.set(disposition, []);
      initiatives.get(disposition).push(combatant.initiative);
    }
    for (const values of initiatives.values()) values.sort(sortInit);

    const claims = this.getClaims(this.round);
    this.customTurns = turns.map((slot, index) => {
      const claimant = this.started && this.combatants.get(claims[slot.id]);
      const actorTurn = claimant || slot;
      const initiative = initiatives.get(slot.disposition).pop();
      const active = index === this.turn;
      const hidden = actorTurn.hidden || actorTurn.token?.hidden;
      const slotType = dispositionLabel(slot.disposition);
      // Rolls encode advantages in hundredths. Keep unusual manual values legible as numbers.
      const compact = Number.isFinite(initiative) && initiative >= 0 && initiative < 20;
      const hundredths = compact ? Math.round(initiative * 100) : 0;
      return {
        id: actorTurn.id, combatantId: slot.id, name: actorTurn.name, img: actorTurn.img ?? CONST.DEFAULT_TOKEN,
        owner: actorTurn.isOwner, hidden, defeated: actorTurn.isDefeated,
        effects: hidden && !game.user?.isGM ? [] : [...new Set((actorTurn.actor?.temporaryEffects ?? []).map(effect => effect.img).filter(Boolean))],
        slotType, slotLabel: 'SWFFG.Combats.Slots.Name.' + slotType, active, css: active ? "active" : "",
        claimed: !this.started || Boolean(claimant), canClaim: game.user?.isGM || slot.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        initiative, hasRolled: Number.isFinite(initiative), numericInitiative: !compact || hundredths === 0,
        successes: "s".repeat(Math.floor(hundredths / 100)), advantages: "a".repeat(hundredths % 100)
      };
    });
    for (const slot of turns) slot.token?.object?._refreshTurnMarker();
  }
}

function dispositionLabel(disposition) {
  const {FRIENDLY, HOSTILE, SECRET} = CONST.TOKEN_DISPOSITIONS;
  if (disposition === FRIENDLY) return "Friendly";
  if (disposition === HOSTILE) return "Enemy";
  return disposition === SECRET ? "Secret" : "Neutral";
}

function _getInitiativeFormula(skill, ability) {
  const dicePool = new DicePoolFFG({
    ability: ability,
    boost: parseInt(skill.boost),
    setback: parseInt(skill.setback),
    force: parseInt(skill.force),
  });
  dicePool.upgrade(parseInt(skill.rank));
  return dicePool.renderDiceExpression();
}

function _findActorForInitiative(c) {
  let data = c.actor.system;
  
  if (c.actor.type === "vehicle") {
    
    const crew = c.actor.getFlag("starwarsffg", "crew");
    if (crew?.length) {
      const initiativeCrew = crew.find(member => crewRoleDefinition(c.actor,member.role)?.kind === 'pilot');
      if (initiativeCrew) {
        
        const realActor = resolveCrewActor(initiativeCrew,c.actor);
        if (realActor?.system) {
          data = realActor.system;
        }
      }
    } else {
      CONFIG.logger.warn("You must set a crew member with the pilot role to roll initiative for a vehicle");
    }
  }
  
  return data;
}

function _buildInitiativePool(data, skill) {
  const pool = new DicePoolFFG({
    ability: Math.max(data.characteristics[data.skills[skill].characteristic].value, data.skills[skill].rank),
    boost: data.skills[skill].boost,
    advantage: data.skills[skill].advantage,
    success: data.skills[skill].success,
  });
  pool.upgrade(Math.min(data.characteristics[data.skills[skill].characteristic].value, data.skills[skill].rank));

  return pool;
}

export class CombatTrackerFFG extends foundry.applications.sidebar.tabs.CombatTracker {

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {actions: {claimSlot(event, target) { return this._claimInitiativeSlot(event, target); }}};

  static PARTS = {
    header: {
      template: "systems/starwarsffg/templates/combat/ffg-combat-tracker-header.html",
    },
    tracker: {
      template: "systems/starwarsffg/templates/combat/ffg-combat-tracker-body.html",
    },
    footer: {
      template: "systems/starwarsffg/templates/combat/ffg-combat-tracker-footer.html",
    },
  };

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._renderTalentMarkers();
  }

  /** Mark the actual NPC occupying a named row, never an unclaimed initiative slot. */
  _renderTalentMarkers() {
    for (const marker of this.element.querySelectorAll('.ffg-combat-talent-marker')) marker.remove();
    if (!game.user.isGM) return;
    for (const row of this.element.querySelectorAll('li.combatant.claimed[data-combatant-id]')) {
      // id is the claimant; altId is the original roller and may be a different actor.
      const combatantId = row.dataset.combatantId || (!this.viewed?.started ? row.dataset.altId : undefined);
      const actor = this.viewed?.combatants.get(combatantId)?.actor;
      if (!actor || game.users.contents.some(user => !user.isGM && actor.testUserPermission(user, 'OWNER'))) continue;
      const talents = (actor.talentList ?? []).filter(talent => {
        const owned = actor.items?.get?.(talent.itemId);
        return !owned?.flags?.starwarsffg?.characteristicIncrease?.creationTool &&
          !['augmenter un attribut', 'increase a characteristic'].includes(String(talent.name ?? '').trim().toLowerCase());
      });
      const heading = row.querySelector('.token-name h4');
      if (!talents.length || !heading) continue;
      const hint = `Talents : ${talents.map(talent => `${talent.name}${talent.isRanked && Number(talent.rank) > 0 ? ` (rang ${talent.rank})` : ''}`).join(', ')}`;
      const marker = document.createElement('i');
      marker.className = 'fa-solid fa-list-check ffg-combat-talent-marker';
      marker.setAttribute('role', 'img');
      marker.setAttribute('aria-label', hint);
      marker.setAttribute('title', hint);
      heading.append(marker);
    }
  }

  /**
   * Initial JS handler for the "claim slot" button on the combat tracker
   * @param event
   * @returns {Promise<void>}
   * @private
   */
  async _claimInitiativeSlot(_event, target) {
    const slot = Number(target.dataset.claimSlot);
    const slotId = target.closest("[data-alt-id]")?.dataset.altId;
    if (!slotId || this.viewed.turn !== slot || this.viewed.turns[slot]?.id !== slotId || this.viewed.getSlotClaims(this.viewed.round, slotId)) return;
    const tokenCount = canvas.tokens.controlled.length;
    const ownedTokenCount = canvas.tokens.ownedTokens.length;
    // you must have a single token selected to claim a slot
    if (tokenCount !== 1 && (tokenCount !== 0 || ownedTokenCount !== 1)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.Notifications.Combat.Claim.OneToken"));
      return;
    }
    const token = canvas.tokens.controlled[0] ?? canvas.tokens.ownedTokens[0];
    const combatant = this.viewed.combatants.find(entry => entry.token?.uuid === token.document.uuid);
    if (!combatant) {
      ui.notifications.warn(game.i18n.localize("SWFFG.Notifications.Combat.Claim.Combatant"));
      return;
    }
    // ensure combatant is permitted in this type of slot
    const combatantDisposition = combatant?.token?.disposition ?? combatant?.actor?.token?.disposition ?? token?.document?.disposition ?? 0;
    const slotDisposition = this.viewed.turns[slot]?.token?.disposition ?? this.viewed.turns[slot]?.actor?.token?.disposition ?? this.viewed.turns[slot]?.disposition ?? 0;
    if (slotDisposition !== combatantDisposition) {
      ui.notifications.warn(game.i18n.localize("SWFFG.Notifications.Combat.Claim.SlotType"));
      return;
    }
    await this.viewed.claimSlot(this.viewed.round, slotId, combatant.id);
  }

  /** @override */
  async _prepareContext(options) {
    const combat = this.viewed;
    if (!combat) {
      return await super._prepareContext(options);
    }

    const data = await super._prepareContext(options);
    const turnData = {Friendly: [], Enemy: [], Neutral: [], Secret: []};
    const claimed = new Set(Object.values(combat.getClaims(combat.round)));
    for (const turn of combat.turns) {
      if (!turn.token) continue;
      turnData[dispositionLabel(turn.token.disposition)].push({
        id: turn.id, name: turn.name, img: turn.img, defeated: turn.isDefeated,
        hidden: turn.hidden || turn.token.hidden, slotClaimed: claimed.has(turn.id)
      });
    }
    // Token visibility and order can change between document preparation and rendering.
    combat.prepareDerivedData();
    return {
      ...data, hasCombat: combat.started, round: combat.round, turnData,
      custom_turns: combat.customTurns, customControl: combat.customTurns[combat.turn]?.owner ?? false,
      diceTheme: game.settings.get("starwarsffg", "dicetheme")
    };
  }

  /** @override */
  _getEntryContextOptions() {
    const entries = super._getEntryContextOptions();
    for (const entry of entries) {
      if (entry.label === "COMBATANT.ACTIONS.Update") {
        entry.label = "SWFFG.Notifications.Combat.Initiative.Update";
        entry.onClick = (_event, row) => this.viewed.updateCombatant(row);
      } else if (entry.label === "COMBATANT.ACTIONS.Remove") {
        entry.onClick = (_event, row) => this.viewed.removeCombatant(row);
      }
    }
    return entries.filter(entry => entry.label !== "COMBATANT.ACTIONS.Reroll");
  }

  /** @override */
  _attachFrameListeners() {
    super._attachFrameListeners();
    // allow clicking the custom combat stuff and zooming to the combatant
    this.element.addEventListener("click", this._onCombatantMouseDown.bind(this));
  }

  /** @override */
  async _onCombatantMouseDown(event) {
    
    if ( (event.target instanceof HTMLInputElement) || (event.target instanceof HTMLButtonElement) ) {
      
      return;
    }
    if (event.target.classList.contains("roll")) {
      
      return;
    }

    const { combatantId } = event.target?.dataset ?? {};
    const combatant = this.viewed?.combatants?.get(combatantId);
    if ( !combatant ) {
      
      return;
    }
    if ( event.type === "dblclick" ) {
      if ( combatant.actor?.testUserPermission(game.user, "OBSERVER") ) combatant.actor?.sheet.render(true);
      return;
    }
    const token = combatant.token?.object;
    if ( !token ) {
      
      return;
    }
    
    canvas.animatePan(token.center);
  }


}

export default class CombatantFFG extends Combatant {
  get disposition() {
    if (this.getFlag("starwarsffg", "fake")) {
      return this.getFlag("starwarsffg", "disposition");
    } else {
      return this?.token ? this.token?.disposition : this?.actor?.prototypeToken?.disposition;
    }
  }

  /** @override  */
  async delete() {
    await this.removeCombatEffects();
    await super.delete();
  }

  /**
   * Delete any status effects which have a duration of a "combat" when the actor is removed from combat
   * @returns {Promise<void>}
   */
  async removeCombatEffects() {
    if (!this.actor) {
      // no actor exists for this slot
      return;
    }
    
    const effects = this.actor.getEmbeddedCollection("ActiveEffect");
    const toDelete = effects.filter(e => e?.system?.duration === "combat");
    if (toDelete) {
      await this.actor.deleteEmbeddedDocuments("ActiveEffect", toDelete.map(i => i.id));
    }
  }
}

/**
 * Force the combat tracker to re-render, which picks up "hidden" state changes of tokens
 */
export function updateCombatTracker() {
  // Used to force the tracker to re-render based on updated visibility state
  if (game.combat && game.settings.get("starwarsffg", "useGenericSlots")) {
    ui.combat.render(true);
  }
}

/**
 * Sort function for initiatives. Puts NULL to the end.
 * @param a
 * @param b
 * @returns {number|number}
 */
function sortInit(a, b) {
  // equal items sort equally
  if (a === b) {
      return 0;
  }
  // nulls sort before anything else
  if (a === null) {
      return -1;
  }
  if (b === null) {
      return 1;
  }
  return a < b ? -1 : 1;
}

export function registerHandleCombatantRemoval(combatant, options, userId) {
  if(options?.ffgRosterRemoval&&game.user.isGM)return;
  void combatant.parent?.handleCombatantRemoval(combatant, options, userId).catch(error=>ui.notifications.error(error.message));
  return false;
}
