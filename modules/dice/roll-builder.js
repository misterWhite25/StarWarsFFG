import {preparePilotage,renderPilotageNotice,pilotageTotals,poolModifiers,reservePilotage,restorePilotage} from "../helpers/pilotage-mj.js";
import {renderSkillInformation} from "../helpers/skill-information-ui.js";
import { effectivePool, gmDifficulty, NEGATIVE_DICE } from "../helpers/gm-difficulty.js";
import { brawlAttackProfile, isBrawlSkill, weaponStunProfile, resolveShot, matchingWeapons, replaceWeaponPool, describeWeaponQuality, hasAutoFire, setAutoFirePool, combatSkillKind, combatModeForRoll, rememberWeapon } from "../helpers/weapon-selection.js";
import { pendingAid, consumeAid, restoreAid } from "../helpers/combat-actions.js";
import { renderPreciseAimButton, selectedRollTalents, rollTalentPool, commitRollTalents, rollbackRollTalents, renderRollTalents, talentWeaponSnapshot, talentWeaponPreview } from "../helpers/roll-talents.js";
import { FormApplicationV2 } from "../applications/form-application-v2.js";
import { MonteCarlo } from "../../lib/@swrpg-online/monte-carlo/dist/index.esm.js";

export default class RollBuilderFFG extends FormApplicationV2 {
  constructor(rollData, rollDicePool, rollDescription, rollSkillName, rollItem, rollAdditionalFlavor, rollSound) {
    super();
    this.roll = {
      data: rollData,
      skillName: rollSkillName,
      combatMode: combatModeForRoll(rollSkillName,rollItem),
      item: rollItem,
      sound: rollSound,
      flavor: rollAdditionalFlavor,
    };
    this.dicePool = rollDicePool;
    this.description = rollDescription;
    this._pilotageHook = Hooks.on('ffgPilotageChanged', () => {
      if(this.rendered) {this._initializeInputs($(this.element));renderPilotageNotice(this,$(this.element));}
    });
    this._gmDifficultyHook = Hooks.on("ffgGMDifficultyChanged", () => {
      if (this.rendered) this._initializeInputs($(this.element));
    });
  }

  async close(options) {
    if(this._frenziedBusy){ui.notifications.warn('Terminez ou annulez le choix d’Attaque furieuse avant de fermer ce jet.');return this;}
    this._reviewedClosed=true;
    if(this._frenziedPaid){const {cancelFrenziedAttack}=await import("../helpers/roll-talents.js");await cancelFrenziedAttack(this);}
    Hooks.off("ffgPilotageChanged",this._pilotageHook);
    await this._skillInformationWindow?.close();
    await this._talentWindow?.close();
    Hooks.off("ffgGMDifficultyChanged", this._gmDifficultyHook);
    return super.close(options);
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "roll-builder",
      classes: ["starwarsffg", "roll-builder-dialog"],
      template: "systems/starwarsffg/templates/dice/roll-options-ffg.html",
      width: 350
    });
  }

  /** @override */
  get title() {
    let title = this.description || game.i18n.localize("SWFFG.RollingDefaultTitle");
    const prefix = game.i18n.localize("SWFFG.Rolling");
    if(title.startsWith(prefix + " ") && !title.startsWith(prefix + " - ")) {
      title = prefix + " - " + title.slice(prefix.length + 1);
    }
    return title.replace(/\bGunnery\b/g, () => game.i18n.localize("SWFFG.SkillsNameGunnery"));
  }

  /** @override */
  async getData() {
    // Chat flags contain document data only. Restore the exact actor (including a synthetic token actor).
    if (this.roll.data?.documentUuid && typeof this.roll.data.document?.getEmbeddedCollection !== 'function') {
      const actor = await fromUuid(this.roll.data.documentUuid);
      if (!actor) throw new Error(game.i18n.lang === 'fr' ? 'Le personnage de ce jet est introuvable.' : 'This roll actor no longer exists.');
      this.roll.data.document = actor;
    }
    preparePilotage(this);
    if (!this._aidPrepared) {
      this._aidPrepared = true;
      this._aidContext={subjectUuid:this.dicePool._pilotageSubjectUuid,actorUuid:this.roll.data?.document?.uuid};
      this._aidEntries = pendingAid(this._aidContext);
      this.dicePool.boost = Number(this.dicePool.boost) + this._aidEntries.length;
    }
    if (this.weaponContext && !this._weaponBaseline) this._weaponBaseline = {...this.dicePool, boost:Number(this.dicePool.boost) - (this._aidEntries?.length ?? 0)};
    //get all possible sounds
    let sounds = [];
    const diceSymbols = {
      advantage: await foundry.applications.ux.TextEditor.enrichHTML("[AD]"),
      success: await foundry.applications.ux.TextEditor.enrichHTML("[SU]"),
      threat: await foundry.applications.ux.TextEditor.enrichHTML("[TH]"),
      failure: await foundry.applications.ux.TextEditor.enrichHTML("[FA]"),
      upgrade: await foundry.applications.ux.TextEditor.enrichHTML("[PR]"),
      triumph: await foundry.applications.ux.TextEditor.enrichHTML("[TR]"),
      despair: await foundry.applications.ux.TextEditor.enrichHTML("[DE]"),
      light: await foundry.applications.ux.TextEditor.enrichHTML("[LI]"),
      dark: await foundry.applications.ux.TextEditor.enrichHTML("[DA]"),
    };

    let canUserAddAudio = await game.settings.get("starwarsffg", "allowUsersAddRollAudio");

    if (game.user.isGM) {
      game.playlists.contents.forEach((playlist) => {
        playlist.sounds.forEach((sound) => {
          let selected = false;
          const s = this.roll?.sound ?? this.roll?.item?.flags?.starwarsffg?.ffgsound;
          if (s === sound.path) {
            selected = true;
          }
          sounds.push({ name: sound.name, path: sound.path, selected });
        });
      });
    } else if (canUserAddAudio) {
      const playlistId = await game.settings.get("starwarsffg", "allowUsersAddRollAudioPlaylist");
      const playlist = await game.playlists.get(playlistId);

      if (playlist) {
        playlist.sounds.forEach((sound) => {
          let selected = false;
          const s = this.roll?.sound ?? this.roll?.item?.flags?.starwarsffg?.ffgsound;
          if (s === sound.path) {
            selected = true;
          }
          sounds.push({ name: sound.name, path: sound.path, selected });
        });
      } else {
        CONFIG.logger.warn(`Playlist for players does not exist, disabling audio`);
        canUserAddAudio = false;
      }
    }

    let users = [{ name: "Send To All", id: "all" }];
    if (game.user.isGM) {
      game.users.contents.forEach((user) => {
        if (user.visible && user.id !== game.user.id) {
          users.push({ name: user.name, id: user.id });
        }
      });
    }

    const enableForceDie = game.settings.get("starwarsffg", "enableForceDie");
    const labels = {
      light: game.settings.get("starwarsffg", "destiny-pool-light"),
      dark: game.settings.get("starwarsffg", "destiny-pool-dark"),
    };

    let display = false;
    const displaySimulation = game.settings.get("starwarsffg", "displaySimulation");
    if (displaySimulation === "GM" && game.user.isGM || displaySimulation === "All") {
      display = true;
    }

    return {
      sounds,
      isGM: game.user.isGM,
      canUserAddAudio,
      flavor: this.roll.flavor,
      users,
      enableForceDie,
      labels,
      diceSymbols,
      simDisplay: display,
      simCount: game.settings.get("starwarsffg", "rollSimulation")
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    this._initializeInputs(html);
    this._activateInputs(html);
    this._activateWeaponSelection(html);
    this._activateFixedWeapon(html);
    this._activateAutoFire(html);
    this._activateShotMode(html);
    this._activateCombatContext(html);
    void renderRollTalents(this, html).catch(error => ui.notifications.error(error.message));
    if (this._aidEntries?.length) {
      const notice = document.createElement("p");
      notice.textContent = game.i18n.lang === "fr"
        ? `Aide acceptée : +${this._aidEntries.length} dé(s) de Fortune, inclus dans ce jet.`
        : `Accepted assistance: +${this._aidEntries.length} Boost die/dice included in this roll.`;
      html[0].prepend(notice);
    }

    html.find(".btn").click(async (_event) => {
      if (this._postingRoll || this._selectingWeapon || this._frenziedBusy) return;
      this._postingRoll = true;
      let aidConsumed = false;
      let posted = false;
      let talentTransaction;
      let pilotageTransaction;
      const resourceTransaction = {};
      const talentActor = this.weaponContext?.actor ?? this.roll.data?.document ?? game.actors.get(this.roll.data?.actor?._id);
      const talentSkill = this.weaponContext?.skillKey ?? this.roll.skillName;
      try {
      if((this._talentSelections??[]).some(s=>s.id==='confidence')){const fear=this._previewPool();if(!fear.difficulty&&!fear.challenge){ui.notifications.info('Aplomb : aucun test de peur nécessaire, la difficulté est nulle.');return;}}
      // Validate talent limits before ammunition or one-shot effects are touched.
      selectedRollTalents(talentActor, talentSkill, this._talentSelections ?? [], {item:this.roll.item,precisePaid:this._preciseAimPaid,frenziedPaid:this._frenziedPaid?.selection});
      if(this._talentSelections?.length && html.find('.user-selection')?.[0]?.value) {
        throw new Error(game.i18n.lang === 'fr'
          ? 'Les talents sélectionnés appartiennent à ce personnage. Lance ce jet toi-même.'
          : 'Selected talents belong to this actor. Roll this check yourself.');
      }
      if (this.weaponContext && this.roll.item?.id) {
        const selected = matchingWeapons(this.weaponContext.actor, this.weaponContext.skillKey).find(item => item.id === this.roll.item.id);
        if (!selected) throw new Error(game.i18n.lang === 'fr' ? 'Cette arme a été retirée ou sa compétence a changé. Rouvre le jet.' : 'This weapon was removed or its skill changed. Reopen the roll.');
        if (selected.getFlag('starwarsffg','config.enableAmmo') && Number(selected.system.ammo?.value) <= 0) throw new Error(game.i18n.lang === 'fr' ? 'Cette arme n’a plus de munitions.' : 'This weapon has no ammunition.');
        this.roll.item = selected;
      }
      const shot = this.roll.item?.type === 'weapon' ? resolveShot(this.roll.item,{mode:this.roll.shotMode,targetRange:this.roll.shotRange}) : undefined;
      // if sound was not passed search for sound dropdown value
      if (!this.roll.sound) {
        const sound = html.find(".sound-selection")?.[0]?.value;
        if (sound) {
          this.roll.sound = sound;
          if (this.roll.item?.setFlag) await this.roll.item.setFlag('starwarsffg','ffgsound',sound);
        }
      }

      if (!this.roll.flavor) {
        const flavor = html.find(".flavor-text")?.[0]?.value;
        if (flavor) {
          this.roll.flavor = flavor;
        }
      }

      // validate that required data is present
      if (this.roll.item?.type !== 'shipweapon' && this.roll.item?.uuid && !this.roll.item.flags?.starwarsffg?.uuid) {
        // uuid flag is missing, look up the item and set it, so it's fixed going forward
        const tmp_item = await fromUuid(this.roll.item.uuid);
        await tmp_item.setFlag("starwarsffg", "uuid", this.roll.item.uuid);
      }


      talentTransaction = await commitRollTalents(talentActor, talentSkill, this._talentSelections ?? [], {item:this.roll.item,precisePaid:this._preciseAimPaid,frenziedPaid:this._frenziedPaid?.selection});
      if(this.roll.data?.triggeredTalent){const {commitTriggeredTalentUsage}=await import('../helpers/triggered-talents.js');const changes=await commitTriggeredTalentUsage(talentActor,this.roll.data.triggeredTalent);talentTransaction.changes.push(...changes);}
      const sentToPlayer = html.find(".user-selection")?.[0]?.value;
      if (sentToPlayer) {
        if (this._talentSelections?.length) throw new Error(game.i18n.lang === 'fr'
          ? 'Les talents sélectionnés appartiennent à ce personnage. Lance ce jet toi-même.'
          : 'Selected talents belong to this actor. Roll this check yourself.');
        if (this._aidEntries?.length) throw new Error(game.i18n.lang === "fr"
          ? "Cette réserve contient ton aide personnelle. Lance-la toi-même ; elle ne peut pas être transférée."
          : "This pool includes your accepted assistance. Roll it yourself; it cannot be forwarded.");
        let container = $(`<div class='dice-pool'></div>`)[0];
        this.dicePool.renderAdvancedPreview(container);

        const messageText = `<div>
          <div>${game.i18n.localize("SWFFG.SentDicePoolRollHint")}</div>
          ${$(container).html()}
          <button class="ffg-pool-to-player">${game.i18n.localize("SWFFG.SentDicePoolRoll")}</button>
        </div>`;

        let chatOptions = {
          author: game.user.id,
          content: messageText,
          flags: {
            starwarsffg: {
              roll: {...this.roll,
                item: this.roll.item?.uuid ? {...(this.roll.item.toObject ? this.roll.item.toObject() : this.roll.item), uuid: this.roll.item.uuid} : this.roll.item,
                data: {...this.roll.data,
                documentUuid: this.roll.data?.document?.uuid ?? talentActor?.uuid,
              }},
              dicePool: this.dicePool,
              description: this.description,
            },
          },
        };

        if (sentToPlayer !== "all") {
          chatOptions.whisper = [sentToPlayer];
        }

        await ChatMessage.create(chatOptions);
        posted = true;
        this._frenziedPaid=null;
      } else {
        await consumeAid(this._aidEntries,this._aidContext);
        aidConsumed = true;
        // Preserve prepared weapon qualities in the saved roll, including after reload.
        let rollItem = this.roll.item;
        if (rollItem?.type === 'shipweapon') {
          const crew = this.roll.crew ?? rollItem.crew ?? rollItem.flags?.starwarsffg?.crew;
          const system = rollItem.getItemDetails ? await rollItem.getItemDetails() : foundry.utils.deepClone(rollItem.system);
          rollItem = {
            ...(rollItem.toObject ? rollItem.toObject() : rollItem), system, crew,
            flags: {...rollItem.flags, starwarsffg: {...rollItem.flags?.starwarsffg, uuid: rollItem.uuid ?? rollItem.flags?.starwarsffg?.uuid, crew, rollWeaponSnapshot: true}}
          };
        }
        rollItem = brawlAttackProfile(talentActor,talentSkill,rollItem);
        rollItem = talentWeaponSnapshot(rollItem, talentTransaction.selections,talentActor,talentSkill);
        if (rollItem?.type === 'shipweapon' || rollItem?.crew?.crew_card) this.roll.combatMode = 'vehicle';
        const pilotageEntries = poolModifiers(this.dicePool);
        const finalPool = rollTalentPool(effectivePool(this.dicePool), talentTransaction.selections,talentActor,talentSkill);
        pilotageTransaction = await reservePilotage(this.dicePool,pilotageEntries);
        await this._reserveRollResources(resourceTransaction);
        const roll = new game.ffg.RollFFG(finalPool.renderDiceExpression(), rollItem, finalPool, this.roll.flavor);
        await roll.toMessage({
          author: game.user.id,
          speaker: ChatMessage.getSpeaker({actor: this.roll.data.document ?? game.actors.get(this.roll.data?.actor?._id)}),
          flags: {starwarsffg: {triggeredTalent:this.roll.data?.triggeredTalent, talentProtection:finalPool._talentProtection,pilotageEffects:pilotageTransaction.entries.map(e=>({id:e.id,subjectUuid:e.subjectUuid,boost:e.boost,setback:e.setback,reason:e.reason})), shot, combatMode:this.roll.combatMode, combatSkill:this.roll.skillName, autoFire:Boolean(this.roll.autoFire && hasAutoFire(this.roll.item)), rollTalents:talentTransaction.selections, usedAid: (this._aidEntries ?? []).map(a => a.id)}},
          flavor: `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize(this.roll.skillName)}...`,
        });
        posted = true;
        this._frenziedPaid=null;
        if(talentTransaction.selections.length) {
          this._talentSelections = [];
          this._preciseAimPaid = null;
          await renderRollTalents(this, html);
          this._updatePreview(html);
        }
        if (this.roll?.sound) {
          foundry.audio.AudioHelper.play({ src: this.roll.sound }, true);
        }

        return roll;
      }
      } catch (error) {
        if (!posted) {
          // Each refund must be attempted even if another resource has changed meanwhile.
          const refunds = [
            () => this._restoreRollResources(resourceTransaction),
            () => pilotageTransaction && restorePilotage(pilotageTransaction),
            () => aidConsumed && restoreAid(this._aidEntries),
            () => talentTransaction && rollbackRollTalents(talentActor, talentTransaction),
          ];
          for (const refund of refunds) {
            try { await refund(); }
            catch (refundError) { ui.notifications.error(refundError.message); }
          }
        }
        ui.notifications.error(error.message);
      } finally {
        this._postingRoll = false;
      }
    });

    renderPilotageNotice(this, html);
    renderSkillInformation(this, html);

    html.find(".extend-button").on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      $(event.currentTarget).toggleClass("minimize");

      const selector = $(event.currentTarget).next();
      $(selector).toggleClass("hide");
      $(selector).toggleClass("maximize");

      if (!$(event.currentTarget).hasClass("minimize")) {
        $(selector).val("");
      }
    });
  }

  _activateWeaponSelection(html) {
    const context = this.weaponContext;
    if (!context) return;
    const root = html[0];
    root.querySelector('.ffg-weapon-selection')?.remove();
    const group = document.createElement('div');
    group.className = 'ffg-weapon-selection';
    group.style.cssText = 'display:block;margin-bottom:10px';
    group.append(document.createTextNode(game.i18n.lang === 'fr' ? 'Arme utilisée (facultatif)' : 'Weapon used (optional)'));
    const select = document.createElement('select');
    select.setAttribute('aria-label',game.i18n.lang === 'fr' ? 'Arme utilisée (facultatif)' : 'Weapon used (optional)');
    select.style.width = '100%';
    const none = document.createElement('option');none.value = '';none.textContent = isBrawlSkill(context.skillKey)?(game.i18n.lang === 'fr'?'Mains nues':'Unarmed'):(game.i18n.lang === 'fr' ? 'Aucune arme' : 'No weapon');select.append(none);
    for (const item of matchingWeapons(context.actor,context.skillKey)) {
      const option = document.createElement('option');option.value = item.id;option.textContent = item.name;select.append(option);
    }
    select.value = this.roll.item?.id ?? '';
    group.append(select);
    const qualities = document.createElement('small');
    qualities.className = 'ffg-selected-weapon-qualities';
    qualities.style.cssText = 'display:block;margin-top:4px;font-size:12px;line-height:1.35;font-weight:normal;color:var(--color-text-secondary,#555);white-space:normal';
    qualities.setAttribute('aria-live','polite');
    group.append(qualities);
    const showQualities = () => this._renderWeaponSummary(html);
    const diceTable = root.querySelector('input[name="boost"]')?.closest('table');
    if (diceTable) diceTable.after(group);
    else (root.querySelector('.window-content') ?? root).prepend(group);
    showQualities(this.roll.item);
    select.addEventListener('change',async()=>{
      if (this._postingRoll || this._selectingWeapon) return;
      const previousID = this.roll.item?.id ?? '';
      this._selectingWeapon = true;select.disabled = true;
      try {
        const item = select.value ? matchingWeapons(context.actor,context.skillKey).find(i=>i.id===select.value) : null;
        if (select.value && !item) throw new Error(game.i18n.lang === 'fr' ? 'Arme indisponible.' : 'Weapon unavailable.');
        if (item?.getFlag('starwarsffg','config.enableAmmo') && Number(item.system.ammo?.value) <= 0) throw new Error(game.i18n.lang === 'fr' ? 'Cette arme n’a plus de munitions.' : 'This weapon has no ammunition.');
        const next = await context.makePool(item ?? {});
        await rememberWeapon(context.actor, context.skillKey, item);
        setAutoFirePool(this.dicePool,this.roll.autoFire,false);
        this.roll.autoFire=false;
        Object.assign(this.dicePool,replaceWeaponPool(this.dicePool,this._weaponBaseline,next));
        this._weaponBaseline = {...next};
        this.roll.item = item ?? {};
        this.roll.shotMode = undefined;
        this.roll.shotRange = undefined;
        this._talentSelections = (this._talentSelections ?? []).filter(selection => !['sniper-shot','point-blank'].includes(selection.id));
        await renderRollTalents(this, html);
        showQualities(item);
        this._activateAutoFire(html);
        this._activateShotMode(html);
        if(!this._combatModeExplicit)this.roll.combatMode=combatModeForRoll(this.roll.skillName,item);
        this._activateCombatContext(html);
        this._initialRollSound ??= this.roll.sound ?? '';
        this.roll.sound = item?.flags?.starwarsffg?.ffgsound ?? this._initialRollSound;
        this._initializeInputs(html);
      } catch(error) {select.value = previousID;ui.notifications.error(error.message);}
      finally {this._selectingWeapon = false;select.disabled = false;}
    });
  }

  /** Spend ammunition and one-shot effects only for the actual roll, after validation. */
  async _reserveRollResources(transaction) {
    const itemUuid = this.roll.item?.uuid ?? this.roll.item?.flags?.starwarsffg?.uuid ?? this.roll.item?.flags?.starwarsffg?.ffgUuid;
    const item = this.roll.item?.type === 'weapon' && itemUuid ? await fromUuid(itemUuid) : null;
    if (this.roll.item?.type === 'weapon' && itemUuid && !item) throw new Error(game.i18n.lang === 'fr'
      ? 'Cette arme a été retirée. Rouvre le jet.' : 'This weapon was removed. Reopen the roll.');
    if (item?.flags?.starwarsffg?.inventoryLocation === 'possession') throw new Error(game.i18n.lang === 'fr'
      ? 'Cette arme est dans Possession : transporte-la avant de l’utiliser.'
      : 'This weapon is a possession: carry it before using it.');
    const ammoEnabled = item?.getFlag('starwarsffg', 'config.enableAmmo');
    const before = Number(item?.system.ammo?.value);
    if (ammoEnabled && (!Number.isFinite(before) || before <= 0)) throw new Error(game.i18n.lang === 'fr'
      ? 'Cette arme n’a plus de munitions.' : 'This weapon has no ammunition.');
    let actor = this.roll.data?.document;
    if (typeof actor?.getEmbeddedCollection !== 'function' && (this.roll.data?.documentUuid ?? actor?.uuid)) actor = await fromUuid(this.roll.data.documentUuid ?? actor.uuid);
    const effects = actor?.getEmbeddedCollection?.('ActiveEffect');
    const once = (effects?.contents ?? []).filter(effect => effect.system?.duration === 'once');
    if (once.length) {
      transaction.effects = {actor, snapshots: once.map(effect => effect.toObject())};
      await actor.deleteEmbeddedDocuments('ActiveEffect', once.map(effect => effect.id ?? effect._id));
    }
    if (ammoEnabled) {
      transaction.ammo = {item, before, after: before - 1};
      await item.update({'system.ammo.value': before - 1});
    }
  }

  async _restoreRollResources(transaction) {
    const errors = [];
    if (transaction.ammo) {
      const {item, before, after} = transaction.ammo;
      try {
        const current = Number(item.system.ammo?.value);
        if (current === after) await item.update({'system.ammo.value': before});
        else if (current !== before) throw new Error(game.i18n.lang === 'fr'
          ? 'Les munitions ont changé depuis : vérifie leur remboursement sur l’arme.'
          : 'Ammunition changed meanwhile: check the weapon refund.');
      } catch (error) { errors.push(error.message); }
    }
    if (transaction.effects) {
      const {actor, snapshots} = transaction.effects;
      try {
        const present = new Set((actor.getEmbeddedCollection('ActiveEffect')?.contents ?? []).map(effect => effect.id ?? effect._id));
        const missing = snapshots.filter(effect => !present.has(effect._id));
        if (missing.length) await actor.createEmbeddedDocuments('ActiveEffect', missing, {keepId: true});
      } catch (error) { errors.push(error.message); }
    }
    if (errors.length) throw new Error(errors.join(' · '));
  }

  _renderWeaponSummary(html) {
    const root=html[0];if(!root?.ownerDocument)return;
    const item=brawlAttackProfile(this.weaponContext?.actor??this.roll.data?.document,this.weaponContext?.skillKey??this.roll.skillName,this.roll.item),group=root.querySelector('.ffg-weapon-selection');if(!group)return;
    let card=group.querySelector('.ffg-selected-weapon-qualities');
    if(!card){card=document.createElement('div');card.className='ffg-selected-weapon-qualities';group.append(card);}
    card.hidden=!item?.id&&!item?.flags?.starwarsffg?.brawlAttack;if(!item?.id&&!item?.flags?.starwarsffg?.brawlAttack){card.replaceChildren();return;}
    card.style.cssText='display:block;margin-top:6px;padding:8px 10px;border:1px solid #748a9166;border-left:3px solid #607d8b;border-radius:4px;background:#607d8b12;font-size:12px;line-height:1.45;color:inherit;white-space:normal';
    card.replaceChildren();
    let selections=[];try{selections=selectedRollTalents(this.weaponContext?.actor??this.roll.data?.document,this.weaponContext?.skillKey??this.roll.skillName,this._talentSelections??[],{item});}catch { /* Invalid selections are reported again when posting. */ }
    const info=talentWeaponPreview(item,selections,this.weaponContext?.actor??this.roll.data?.document,this.weaponContext?.skillKey??this.roll.skillName),fr=game.i18n.lang==='fr';
    const line=(label,value)=>{const row=document.createElement('div'),title=document.createElement('strong');title.style.color='#496573';title.textContent=label+' : ';row.append(title,document.createTextNode(value));card.append(row);};
    const rangeLabel=range=>range?game.i18n.localize(`SWFFG.WeaponRange${range}`):(fr?'non renseignée':'not specified');
    line(fr?'Portée maximale':'Maximum range',rangeLabel(info.baseRange)+(info.range!==info.baseRange?' → '+rangeLabel(info.range):''));
    line(fr?'Dégâts':'Damage',String(info.baseDamage)+(info.damageBonus?' → '+info.damage+' (+'+info.damageBonus+' '+(fr?'talent, une touche réussie':'talent, one successful hit')+')':''));
    const values=item.system?.adjusteditemmodifier??item.system?.itemmodifier??[];
    line(fr?'Qualités':'Qualities',Object.values(values).filter(q=>q?.name).map(q=>describeWeaponQuality(q,game.i18n.lang)).join(' · ')||(fr?'aucune renseignée':'none listed'));
  }

  _activateFixedWeapon(html) {
    if (this.weaponContext || !['weapon','shipweapon'].includes(this.roll.item?.type)) return;
    const root = html[0];
    root.querySelector('.ffg-weapon-selection')?.remove();
    const group = document.createElement('div');
    group.className = 'ffg-weapon-selection';
    group.style.cssText = 'margin:8px 0;font-size:12px;line-height:1.4';
    const name = document.createElement('strong');
    name.textContent = this.roll.item.name;
    const qualities = document.createElement('div');
    const values = this.roll.item.system?.adjusteditemmodifier ?? this.roll.item.system?.itemmodifier ?? [];
    const labels = Object.values(values).filter(q => q?.name).map(q => describeWeaponQuality(q, game.i18n.lang));
    qualities.textContent = (game.i18n.lang === 'fr' ? 'Qualités : ' : 'Qualities: ') +
      (labels.join(' · ') || (game.i18n.lang === 'fr' ? 'aucune renseignée' : 'none listed'));
    group.append(name, qualities);
    root.querySelector('input[name="boost"]')?.closest('table')?.after(group);
  }

  _activateCombatContext(html) {
    const kind=combatSkillKind(this.roll.skillName ?? this.roll.item?.system?.skill?.value);
    if(!kind && this.roll.item?.type!=='shipweapon')return;
    const root=html[0];root.querySelector('.ffg-combat-context')?.remove();
    const group=document.createElement('div');group.className='ffg-combat-context';
    group.style.cssText='margin:8px 0;font-size:12px';
    const fr=game.i18n.lang==='fr';
    if(this.roll.item?.type === 'shipweapon' || this.roll.item?.crew?.crew_card) {
      this.roll.combatMode = 'vehicle';
      group.textContent = fr ? 'Combat spatial / véhicules' : 'Space / vehicle combat';
    } else if(kind==='gunnery') {
      const label=document.createElement('label');label.textContent=fr?'Contexte du combat':'Combat context';
      const select=document.createElement('select');select.setAttribute('aria-label',label.textContent);select.style.width='100%';
      for(const [value,text] of [['personal',fr?'Combat personnel':'Personal combat'],['vehicle',fr?'Combat spatial / véhicules':'Space / vehicle combat']]) {
        const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
      }
      select.value=this.roll.combatMode;
      select.addEventListener('change',()=>{
        if(this._postingRoll || this._selectingWeapon){select.value=this.roll.combatMode;return;}
        this.roll.combatMode=select.value;this._combatModeExplicit=true;
      });
      label.append(select);group.append(label);
    } else group.textContent=fr?'Effets du jet : combat spatial / véhicules':'Roll effects: space / vehicle combat';
    const weapon=root.querySelector('.ffg-weapon-selection');
    if(weapon)weapon.after(group);else root.querySelector('input[name="boost"]')?.closest('table')?.after(group);
  }


  _activateShotMode(html) {
    const root=html[0];root.querySelector('.ffg-shot-mode')?.remove();
    if(this.roll.item?.type!=='weapon')return;
    const profile=weaponStunProfile(this.roll.item),fr=game.i18n.lang==='fr';
    if(!profile.fixed&&!profile.setting)return;
    const group=document.createElement('div');group.className='ffg-shot-mode';group.style.cssText='margin:8px 0;font-size:12px';
    if(profile.fixed)group.textContent=fr?'Dégâts étourdissants : stress (encaissement applicable).':'Stun damage: strain (soak applies).';
    else {
      const label=document.createElement('label');label.textContent=fr?'Mode du tir':'Firing mode';
      const select=document.createElement('select');select.setAttribute('aria-label',label.textContent);select.style.width='100%';
      for(const [value,text] of [['normal',fr?'Normal - blessures':'Normal - wounds'],['stun',fr?'Étourdissant - stress':'Stun - strain']]) {const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
      select.value=this.roll.shotMode??'normal';label.append(select);group.append(label);
      const rangeLabel=document.createElement('label');rangeLabel.textContent=fr?'Portée de la cible':'Target range';
      const range=document.createElement('select');range.setAttribute('aria-label',rangeLabel.textContent);range.style.width='100%';
      for(const [value,text] of [['',fr?'À confirmer avant le tir':'Confirm before firing'],['engaged',fr?'Au contact':'Engaged'],['short',fr?'Courte':'Short'],['beyond',fr?'Moyenne ou au-delà - incompatible':'Medium or farther - incompatible']]) {const option=document.createElement('option');option.value=value;option.textContent=text;range.append(option);}
      range.value=this.roll.shotRange??'';rangeLabel.append(range);group.append(rangeLabel);
      const refresh=()=>{rangeLabel.hidden=select.value!=='stun';};refresh();
      select.addEventListener('change',()=>{if(this._postingRoll||this._selectingWeapon){select.value=this.roll.shotMode??'normal';return;}this.roll.shotMode=select.value;refresh();});
      range.addEventListener('change',()=>{if(this._postingRoll||this._selectingWeapon){range.value=this.roll.shotRange??'';return;}this.roll.shotRange=range.value;});
    }
    root.querySelector('.ffg-weapon-selection')?.append(group);
  }

  _activateAutoFire(html) {
    const root=html[0];
    root.querySelector('.ffg-auto-fire')?.remove();
    if (!hasAutoFire(this.roll.item)) return;
    const label=document.createElement('label');
    label.className='ffg-auto-fire';
    label.style.cssText='display:flex;align-items:center;gap:6px;margin:6px 0;font-size:12px;white-space:normal';
    const input=document.createElement('input');input.type='checkbox';input.checked=Boolean(this.roll.autoFire);
    label.append(input,document.createTextNode(game.i18n.lang==='fr'?'Tir automatique (+1 dé de Difficulté)':'Auto-fire (+1 Difficulty die)'));
    const group=root.querySelector('.ffg-weapon-selection');
    if(group)group.append(label);
    else root.querySelector('input[name="boost"]')?.closest('table')?.after(label);
    input.addEventListener('change',()=>{
      if(this._postingRoll || this._selectingWeapon){input.checked=Boolean(this.roll.autoFire);return;}
      setAutoFirePool(this.dicePool,this.roll.autoFire,input.checked);
      this.roll.autoFire=input.checked;
      this._initializeInputs(html);
    });
  }

  _updatePreview(html) {
    const poolDiv = html.find(".dice-pool-dialog .dice-pool")[0];
    poolDiv.innerHTML = "";
    const pool=this._previewPool(),base=effectivePool(this.dicePool);
    const total=Math.max(0,Number(base.setback)||0),remaining=Math.max(0,Number(pool.setback)||0);
    const configuredRemoval=game.settings.get('starwarsffg','ApplyRemoveSetbackMods')?Math.min(remaining,Math.max(0,Number(pool.remsetback)||0)):0;
    const cancelled=Math.max(0,Math.min(total,total-remaining+configuredRemoval));
    // Rendering only: the original pool and the dice expression stay unchanged.
    pool.renderPreview(poolDiv,{total,cancelled});
    this._updateSimulationPreview();
  }

  _initializeInputs(html) {
    this._renderWeaponSummary(html);
    const config = gmDifficulty();
    const personal = pilotageTotals(this.dicePool);
    const pool = this._previewPool();
    const activeTalents = this._talentSelections ?? [];
    let removals=html[0].querySelector('.ffg-reviewed-removals');
    if(!removals){removals=document.createElement('p');removals.className='ffg-reviewed-removals';removals.setAttribute('role','status');html[0].querySelector('.roll-button')?.before(removals);}
    const base=effectivePool(this.dicePool),removed=Math.max(0,(Number(base.setback)||0)-(Number(pool.setback)||0));
    const details=(pool._reviewedRemovals??[]).filter(e=>e.removed>0).map(e=>`${e.name} : ${e.removed}`).join(', ');
    removals.hidden=!removed;removals.textContent=`Infortunes retirées : ${removed}${details?' ('+details+')':''}.`;

    renderPreciseAimButton(this,html,this.weaponContext?.actor??this.roll.data?.document,this.weaponContext?.skillKey??this.roll.skillName);
    let notice = html[0].querySelector(".ffg-gm-difficulty-notice");
    if (!notice) { notice = document.createElement("p"); notice.className = "ffg-gm-difficulty-notice"; html[0].prepend(notice); }
    notice.textContent = config.enabled ? "Pilotage MJ" : "";
    notice.hidden = !config.enabled;
    html.find("#upgrade-difficulty, #downgrade-difficulty").prop("disabled", config.enabled);
    html.find(".pool-value input").each((key, value) => {
      const name = $(value).attr("name");
      value.value = pool[name];
      value.disabled = (config.enabled && NEGATIVE_DICE.includes(name)) || (name==="boost" && personal.boost>0) || (name==="setback" && personal.setback>0) ||
        (['ability','proficiency'].includes(name) && activeTalents.some(s=>['true-aim','intense-focus','frenzied-attack'].includes(s.id))) ||
        (['difficulty','challenge'].includes(name) && activeTalents.some(s=>['sniper-shot','confidence'].includes(s.id))) ||
        (name==='boost' && activeTalents.some(s=>s.id==='command'||s.id==='true-aim'||['physical-training','stalker','quick-strike'].includes(s.id))) ||
        (name==='setback' && activeTalents.some(s=>['kill-with-kindness','plausible-deniability','convincing-demeanor','skilled-jockey','galaxy-mapper','bypass-security','researcher','forager','brace','precise-aim','outdoorsman'].includes(s.id)));
    });

    html.find(".pool-additional input").each((key, value) => {
      const name = $(value).attr("name");
      value.value = this.dicePool[name];
      $(value).attr("allowNegative", true);
    });

    this._updatePreview(html);
  }

  _activateInputs(html) {
    html.find(".upgrade-buttons button").on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const id = $(event.currentTarget).attr("id");

      switch (id.toLowerCase()) {
        case "upgrade-ability": {
          this.dicePool.upgrade(1);
          break;
        }
        case "downgrade-ability": {
          this.dicePool.upgrade(-1);
          break;
        }
        case "upgrade-difficulty": {
          this.dicePool.upgradeDifficulty(1);
          break;
        }
        case "downgrade-difficulty": {
          this.dicePool.upgradeDifficulty(-1);
          break;
        }
      }
      this._initializeInputs(html);
    });

    html.find(".pool-container, .pool-additional").on("click", (event) => {
      let input;

      if ($(event.currentTarget).hasClass(".pool-container")) {
        input = $(event.currentTarget).find(".pool-value input")[0];
      } else {
        input = $(event.currentTarget).find("input")[0];
        if(!input) {
          input = $(event.currentTarget.nextElementSibling).find("input")[0];
        }
      }

      if (input.disabled || (gmDifficulty().enabled && NEGATIVE_DICE.includes(input.name))) return;
      this.dicePool[input.name] = (Number(this.dicePool[input.name])||0)+1;
      this._initializeInputs(html);
    });

    html.find(".pool-container, .pool-additional").on("contextmenu", (event) => {
      let input;

      if ($(event.currentTarget).hasClass(".pool-container")) {
        input = $(event.currentTarget).find(".pool-value input")[0];
      } else {
        input = $(event.currentTarget).find("input")[0];
        if(!input) {
          input = $(event.currentTarget.nextElementSibling).find("input")[0];
        }
      }

      if (input.disabled || (gmDifficulty().enabled && NEGATIVE_DICE.includes(input.name))) return;
      const allowNegative = $(input).attr("allowNegative");

      if ((Number(this.dicePool[input.name])||0) > 0 || allowNegative) this.dicePool[input.name]=(Number(this.dicePool[input.name])||0)-1;
      this._initializeInputs(html);
    });
  }

  _updateObject() {}

  _previewPool() {
    const actor = this.weaponContext?.actor ?? this.roll.data?.document ?? game.actors.get(this.roll.data?.actor?._id);
    const skill = this.weaponContext?.skillKey ?? this.roll.skillName;
    let selected = [];
    try {selected = selectedRollTalents(actor,skill,this._talentSelections ?? [],{item:this.roll.item,precisePaid:this._preciseAimPaid,frenziedPaid:this._frenziedPaid?.selection});}
    catch (_) { /* Invalid/inapplicable choices are rejected again when posting. */ }
    return rollTalentPool(effectivePool(this.dicePool),selected,actor,skill);
  }

  /**
   * Add the results of the dice simulation
   * @private
   */
  _updateSimulationPreview() {
    try {
      const pool = this._previewPool();
      const simPool = new MonteCarlo({
        dicePool: {
          abilityDice: pool.ability,
          difficultyDice: pool.difficulty,
          proficiencyDice: pool.proficiency,
          challengeDice: pool.challenge,
          boostDice: pool.boost,
          setbackDice: pool.setback,
        },
        iterations: game.settings.get("starwarsffg", "rollSimulation"),
        runSimulate: false,
        modifiers: {
          automaticSuccesses: pool.success,
          automaticFailures: pool.failure,
          automaticAdvantages: pool.advantage,
          automaticThreats: pool.threat,
          automaticTriumphs: pool.triumph,
          automaticDespairs: pool.despair,
        },
      });
      const simResults = simPool.simulate();

      let newClass = "";
      if (simResults.successProbability < .25) {
        newClass = "unlikely";
      } else if (simResults.successProbability > .75) {
        newClass = "likely";
      }

      $("#success_chance").text(
        `${(simResults.successProbability * 100).toLocaleString(undefined, {maximumFractionDigits: 0})}%`
      ).removeClass("likely unlikely").addClass(newClass);
    } catch (error) {
      CONFIG.logger.debug("Unable to calculate roll probability", error);
    }
  }
}
