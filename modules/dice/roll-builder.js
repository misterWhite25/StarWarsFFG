import { matchingWeapons, replaceWeaponPool, describeWeaponQuality, hasAutoFire, setAutoFirePool, combatSkillKind, combatModeForRoll } from "../helpers/weapon-selection.js";
import { pendingAid, consumeAid, restoreAid } from "../helpers/combat-actions.js";
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
    const title = this.description || game.i18n.localize("SWFFG.RollingDefaultTitle");
    return title.replace(/\bGunnery\b/g, () => game.i18n.localize("SWFFG.SkillsNameGunnery"));
  }

  /** @override */
  async getData() {
    if (!this._aidPrepared) {
      this._aidPrepared = true;
      this._aidEntries = pendingAid();
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
    this._activateCombatContext(html);
    if (this._aidEntries?.length) {
      const notice = document.createElement("p");
      notice.textContent = game.i18n.lang === "fr"
        ? `Aide acceptée : +${this._aidEntries.length} dé(s) de Fortune, inclus dans ce jet.`
        : `Accepted assistance: +${this._aidEntries.length} Boost die/dice included in this roll.`;
      html[0].prepend(notice);
    }

    html.find(".btn").click(async (_event) => {
      if (this._postingRoll || this._selectingWeapon) return;
      this._postingRoll = true;
      let aidConsumed = false;
      let posted = false;
      try {
      if (this.weaponContext && this.roll.item?.id) {
        const selected = matchingWeapons(this.weaponContext.actor, this.weaponContext.skillKey).find(item => item.id === this.roll.item.id);
        if (!selected) throw new Error(game.i18n.lang === 'fr' ? 'Cette arme a été retirée ou sa compétence a changé. Rouvre le jet.' : 'This weapon was removed or its skill changed. Reopen the roll.');
        if (selected.getFlag('starwarsffg','config.enableAmmo') && Number(selected.system.ammo?.value) <= 0) throw new Error(game.i18n.lang === 'fr' ? 'Cette arme n’a plus de munitions.' : 'This weapon has no ammunition.');
        this.roll.item = selected;
      }
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
      if (this.roll.item?.uuid && !this.roll.item.flags?.starwarsffg?.uuid) {
        // uuid flag is missing, look up the item and set it, so it's fixed going forward
        const tmp_item = await fromUuid(this.roll.item.uuid);
        await tmp_item.setFlag("starwarsffg", "uuid", this.roll.item.uuid);
      }


      try {
        // remove one-time status effects
        CONFIG.logger.debug("Removing one-time status effects from actor");
        const actorData = this.roll.data.document;
        if (actorData) {
          if (actorData) {
            const actorEffects = actorData.getEmbeddedCollection("ActiveEffect");
            if (actorEffects) {
              const toDelete = [];
              for (const activeEffect of actorEffects.contents) {
                if (activeEffect?.system?.duration === "once") {
                  toDelete.push(activeEffect._id);
                }
              }
              if (toDelete.length > 0) {
                await actorData.deleteEmbeddedDocuments("ActiveEffect", toDelete);
              }
            }
          }
        }
      } catch (error) {
        CONFIG.logger.warn(`Caught error in roller: ${error}`);
      }

      try {
        if (this?.roll?.item && this.roll.item.type === "weapon") {
          const item = await foundry.utils.fromUuid(this.roll.item.uuid);
          if (item) {
            const ammoEnabled = item.getFlag("starwarsffg", "config.enableAmmo");
            if (ammoEnabled) {
              await item.update({"system.ammo.value": item.system.ammo.value - 1});
            }
          }
        }
      } catch (error) {
        CONFIG.logger.warn(`Caught ammo error in roller: ${error}`);
      }

      const sentToPlayer = html.find(".user-selection")?.[0]?.value;
      if (sentToPlayer) {
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
              roll: this.roll,
              dicePool: this.dicePool,
              description: this.description,
            },
          },
        };

        if (sentToPlayer !== "all") {
          chatOptions.whisper = [sentToPlayer];
        }

        ChatMessage.create(chatOptions);
      } else {
        if (this.roll.crew) {
          this.roll.item['crew'] = this.roll.crew
        }
        await consumeAid(this._aidEntries);
        aidConsumed = true;
        // Preserve prepared weapon qualities in the saved roll, including after reload.
        const rollItem = this.roll.item?.type === 'shipweapon' ? {
          ...(this.roll.item.toObject ? this.roll.item.toObject() : this.roll.item),
          system: foundry.utils.deepClone(this.roll.item.system),
          crew: this.roll.item.crew,
        } : this.roll.item;
        if (rollItem?.type === 'shipweapon' || rollItem?.crew?.crew_card) this.roll.combatMode = 'vehicle';
        const roll = new game.ffg.RollFFG(this.dicePool.renderDiceExpression(), rollItem, this.dicePool, this.roll.flavor);
        // check if this is a crew roll - and it's a roll for a weapon
        if (this.roll.item && Object.hasOwn(this.roll.item, 'crew') && Object.keys(this.roll.item).length > 1) {
          await this.roll.item.update({"flags": {"starwarsffg": {"crew": this.roll.item.crew}}})
        }
        await roll.toMessage({
          author: game.user.id,
          speaker: ChatMessage.getSpeaker({actor: this.roll.data.document ?? game.actors.get(this.roll.data?.actor?._id)}),
          flags: {starwarsffg: {combatMode:this.roll.combatMode, combatSkill:this.roll.skillName, autoFire:Boolean(this.roll.autoFire && hasAutoFire(this.roll.item)), usedAid: (this._aidEntries ?? []).map(a => a.id)}},
          flavor: `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize(this.roll.skillName)}...`,
        });
        posted = true;
        if (this.roll?.sound) {
          foundry.audio.AudioHelper.play({ src: this.roll.sound }, true);
        }

        return roll;
      }
      } catch (error) {
        if (aidConsumed && !posted) await restoreAid(this._aidEntries);
        ui.notifications.error(error.message);
      } finally {
        this._postingRoll = false;
      }
    });

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
    const none = document.createElement('option');none.value = '';none.textContent = game.i18n.lang === 'fr' ? 'Aucune arme' : 'No weapon';select.append(none);
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
    const showQualities = item => {
      qualities.hidden = !item?.id;
      if (!item?.id) {qualities.textContent = '';return;}
      const values = item.system?.adjusteditemmodifier ?? item.system?.itemmodifier ?? [];
      const labels = Object.values(values).filter(q=>q?.name).map(q=>describeWeaponQuality(q,game.i18n.lang));
      qualities.textContent = (game.i18n.lang === 'fr' ? 'Qualités : ' : 'Qualities: ') + (labels.join(' · ') || (game.i18n.lang === 'fr' ? 'aucune renseignée' : 'none listed'));
    };
    showQualities(this.roll.item);
    const diceTable = root.querySelector('input[name="boost"]')?.closest('table');
    if (diceTable) diceTable.after(group);
    else (root.querySelector('.window-content') ?? root).prepend(group);
    select.addEventListener('change',async()=>{
      if (this._postingRoll || this._selectingWeapon) return;
      const previousID = this.roll.item?.id ?? '';
      this._selectingWeapon = true;select.disabled = true;
      try {
        const item = select.value ? matchingWeapons(context.actor,context.skillKey).find(i=>i.id===select.value) : null;
        if (select.value && !item) throw new Error(game.i18n.lang === 'fr' ? 'Arme indisponible.' : 'Weapon unavailable.');
        if (item?.getFlag('starwarsffg','config.enableAmmo') && Number(item.system.ammo?.value) <= 0) throw new Error(game.i18n.lang === 'fr' ? 'Cette arme n’a plus de munitions.' : 'This weapon has no ammunition.');
        const next = await context.makePool(item ?? {});
        setAutoFirePool(this.dicePool,this.roll.autoFire,false);
        this.roll.autoFire=false;
        Object.assign(this.dicePool,replaceWeaponPool(this.dicePool,this._weaponBaseline,next));
        this._weaponBaseline = {...next};
        this.roll.item = item ?? {};
        showQualities(item);
        this._activateAutoFire(html);
        if(!this._combatModeExplicit)this.roll.combatMode=combatModeForRoll(this.roll.skillName,item);
        this._activateCombatContext(html);
        this._initialRollSound ??= this.roll.sound ?? '';
        this.roll.sound = item?.flags?.starwarsffg?.ffgsound ?? this._initialRollSound;
        this._initializeInputs(html);
      } catch(error) {select.value = previousID;ui.notifications.error(error.message);}
      finally {this._selectingWeapon = false;select.disabled = false;}
    });
  }

  _activateFixedWeapon(html) {
    if (this.weaponContext || this.roll.item?.type !== 'shipweapon') return;
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
    this.dicePool.renderPreview(poolDiv);
    this._updateSimulationPreview();
  }

  _initializeInputs(html) {
    html.find(".pool-value input").each((key, value) => {
      const name = $(value).attr("name");
      value.value = this.dicePool[name];
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

      input.value++;
      this.dicePool[input.name] = parseInt(input.value);
      this._updatePreview(html);
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

      const allowNegative = $(input).attr("allowNegative");

      if (input.value > 0 || allowNegative) {
        input.value--;
        this.dicePool[input.name] = parseInt(input.value);
      }
      this._updatePreview(html);
    });
  }

  _updateObject() {}

  /**
   * Add the results of the dice simulation
   * @private
   */
  _updateSimulationPreview() {
    try {
      const simPool = new MonteCarlo({
        dicePool: {
          abilityDice: this.dicePool.ability,
          difficultyDice: this.dicePool.difficulty,
          proficiencyDice: this.dicePool.proficiency,
          challengeDice: this.dicePool.challenge,
          boostDice: this.dicePool.boost,
          setbackDice: this.dicePool.setback,
        },
        iterations: game.settings.get("starwarsffg", "rollSimulation"),
        runSimulate: false,
        modifiers: {
          automaticSuccesses: this.dicePool.success,
          automaticFailures: this.dicePool.failure,
          automaticAdvantages: this.dicePool.advantage,
          automaticThreats: this.dicePool.threat,
          automaticTriumphs: this.dicePool.triumph,
          automaticDespairs: this.dicePool.despair,
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
