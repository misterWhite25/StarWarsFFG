import { FormApplicationV2 } from "../applications/form-application-v2.js";
import ImportHelpers from "./import-helpers.js";
import {reviewedPassiveSources} from "../helpers/reviewed-passives.js";

export default class SWAImporter extends FormApplicationV2 {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "swa-importer",
      classes: ["starwarsffg", "data-import"],
      title: game.i18n.localize("SWFFG.UI.Import.AdversariesTitle"),
      template: "systems/starwarsffg/templates/importer/swa-importer.html",
    });
  }

  /** @override */
  getData() {
    return {cssClass: "data-importer-window"};
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".dialog-button").off("click.swaImport").on("click.swaImport", this._dialogButton.bind(this));
  }

  async _dialogButton(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (button.dataset.button !== "import" || this._importing) return;

    const input = this.element.querySelector('input[name="data"]');
    const file = input.files[0];
    if (!file) {
      input.required = true;
      input.reportValidity();
      return;
    }

    this._importing = true;
    button.disabled = true;
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const filter = this.element.querySelector('[name="tag-filter"]').value.trim();
      await this._importArchive(zip, file.name, filter);
      await this.close();
    } catch (error) {
      ui.notifications.error(game.i18n.format("SWFFG.UI.Import.ProcessFileFailed", {filename: file.name}));
      console.error(error);
    } finally {
      button.disabled = false;
      this._importing = false;
    }
  }

  async _importArchive(zip, filename, filter) {
    const files = Object.values(zip.files).filter(file => !file.dir);
    const adversaries = files.filter(file => /(?:^|\/)adversaries\/.*\.json$/i.test(file.name));
    if (!adversaries.length) throw new Error("No adversary data files in the archive");

    const library = {};
    for (const key of ["skills", "weapons", "abilities", "talents", "qualities"]) {
      const candidates = files.filter(file => file.name.split("/").pop() === key + ".json");
      const matches = candidates.length > 1 ? candidates.filter(file => file.name.split("/").includes("src")) : candidates;
      if (candidates.length && matches.length !== 1) {
        throw new Error("Ambiguous data file: " + key + ".json");
      }
      const records = matches.length ? await this._readRecords(matches[0]) : [];
      library[key] = Object.fromEntries(records.map(record => [record.name, record]));
    }

    // Prepare every selected document before opening or changing a world compendium.
    const documents = [];
    for (const [index, file] of adversaries.entries()) {
      for (const record of await this._readRecords(file)) {
        if (typeof record.type !== "string" || !record.type.trim() || (record.tags != null && !Array.isArray(record.tags))) {
          throw new Error("Invalid adversary in " + file.name);
        }
        if (filter && !record.tags?.includes(filter)) continue;
        const data = await this._prepareAdversary(record, file.name, library);
        const defaults = await ImportHelpers.getTemplate(data.type);
        const system = foundry.utils.mergeObject(defaults, data.system);
        const document = new CONFIG.Actor.documentClass({...data, system}, {temporary: true, strict: true});
        documents.push({data, document});
      }
      this._updateProgress("current", index + 1, adversaries.length);
    }
    if (!documents.length) return;

    const stem = filename.replace(/\.zip$/i, "");
    const label = /^sw-adversaries(?:-(?:master|main))?$/i.test(stem) ? "Star Wars Adversaries" : stem;
    const pack = await this._getCompendiumPack(label);
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({locked: false});
    try {
      const entries = await pack.getIndex();
      const ids = new Map(entries.map(entry => [entry.name, entry._id]));
      for (const [index, {data, document}] of documents.entries()) {
        const id = ids.get(document.name);
        const actor = id ? await pack.getDocument(id) : await pack.importDocument(document);
        if (id) await this._updateActor(actor, data);
        ids.set(document.name, actor.id);
        for (const item of actor.items) await ImportHelpers.createActiveEffects(item);
        this._updateProgress("overall", index + 1, documents.length);
      }
    } finally {
      if (wasLocked) await pack.configure({locked: true});
    }
  }

  async _updateActor(actor, data) {
    // Foundry merges embedded documents by ID. Match repeated entries in their original order.
    const existing = new Map();
    const obsolete = new Set();
    const hasManagedItems = actor.flags?.starwarsffg?.swaManagedItems;
    for (const item of actor.items) {
      if (hasManagedItems && !item.flags.starwarsffg?.swaImported) continue;
      const key = JSON.stringify([item.type, item.name]);
      if (!existing.has(key)) existing.set(key, []);
      existing.get(key).push(item);
      if (item.flags.starwarsffg?.swaImported) obsolete.add(item.id);
    }
    for (const item of data.items) {
      const previous = existing.get(JSON.stringify([item.type, item.name]))?.shift();
      if (!previous) continue;
      item._id = previous.id;
      obsolete.delete(previous.id);
    }
    await actor.update(data);
    if (obsolete.size) await actor.deleteEmbeddedDocuments("Item", [...obsolete]);
  }

  async _readRecords(file) {
    const records = JSON.parse((await file.async("text")).replace(/^\uFEFF/, ""));
    if (!Array.isArray(records) || records.some(record => typeof record?.name !== "string" || !record.name.trim())) {
      throw new Error("Invalid data in " + file.name);
    }
    return records;
  }

  _updateProgress(stage, count, total) {
    const progress = this.element.querySelector(".import-progress." + stage);
    progress.classList.remove("import-hidden");
    const percent = Math.trunc(count / total * 100) + "%";
    const bar = progress.querySelector(".import-progress-bar");
    bar.style.width = percent;
    bar.textContent = percent;
  }

  async _getCompendiumPack(label) {
    const matches = game.packs.filter(pack => pack.collection.startsWith("world.") && pack.metadata.label === label);
    if (!matches.length) {
      return foundry.documents.collections.CompendiumCollection.createCompendium({type: "Actor", label});
    }
    if (matches.length !== 1 || matches[0].documentName !== "Actor") {
      throw new Error("Cannot identify a unique world Actor compendium for " + label);
    }
    return matches[0];
  }

  async _prepareAdversary(item, fileName, library) {
    let skills = {
      "Astrogation": {
        "rank": 0,
        "careerskill": false,
        "Key": "ASTRO",
      },
      "Athletics": {
        "rank": 0,
        "careerskill": false,
        "Key": "ATHL",
      },
      "Brawl": {
        "rank": 0,
        "careerskill": false,
        "Key": "BRAWL",
      },
      "Charm": {
        "rank": 0,
        "careerskill": false,
        "Key": "CHARM",
      },
      "Coercion": {
        "rank": 0,
        "careerskill": false,
        "Key": "COERC",
      },
      "Computers": {
        "rank": 0,
        "careerskill": false,
        "Key": "COMP",
      },
      "Cool": {
        "rank": 0,
        "careerskill": false,
        "Key": "COOL",
      },
      "Coordination": {
        "rank": 0,
        "careerskill": false,
        "Key": "COORD",
      },
      "Deception": {
        "rank": 0,
        "careerskill": false,
        "Key": "DECEP",
      },
      "Discipline": {
        "rank": 0,
        "careerskill": false,
        "Key": "DISC",
      },
      "Gunnery": {
        "rank": 0,
        "careerskill": false,
        "Key": "GUNN",
      },
      "Leadership": {
        "rank": 0,
        "careerskill": false,
        "Key": "LEAD",
      },
      "Lightsaber": {
        "rank": 0,
        "careerskill": false,
        "Key": "LTSABER",
      },
      "Mechanics": {
        "rank": 0,
        "careerskill": false,
        "Key": "MECH",
      },
      "Medicine": {
        "rank": 0,
        "careerskill": false,
        "Key": "MED",
      },
      "Melee": {
        "rank": 0,
        "careerskill": false,
        "Key": "MELEE",
      },
      "Negotiation": {
        "rank": 0,
        "careerskill": false,
        "Key": "NEG",
      },
      "Perception": {
        "rank": 0,
        "careerskill": false,
        "Key": "PERC",
      },
      "Piloting: Planetary": {
        "rank": 0,
        "careerskill": false,
        "Key": "PILOTPL",
      },
      "Piloting: Space": {
        "rank": 0,
        "careerskill": false,
        "Key": "PILOTSP",
      },
      "Ranged: Heavy": {
        "rank": 0,
        "careerskill": false,
        "Key": "RANGHVY",
      },
      "Ranged: Light": {
        "rank": 0,
        "careerskill": false,
        "Key": "RANGLT",
      },
      "Resilience": {
        "rank": 0,
        "careerskill": false,
        "Key": "RESIL",
      },
      "Skulduggery": {
        "rank": 0,
        "careerskill": false,
        "Key": "SKUL",
      },
      "Stealth": {
        "rank": 0,
        "careerskill": false,
        "Key": "STEAL",
      },
      "Streetwise": {
        "rank": 0,
        "careerskill": false,
        "Key": "SW",
      },
      "Survival": {
        "rank": 0,
        "careerskill": false,
        "Key": "SURV",
      },
      "Vigilance": {
        "rank": 0,
        "careerskill": false,
        "Key": "VIGIL",
      },
      "Knowledge: Core Worlds": {
        "rank": 0,
        "careerskill": false,
        "Key": "CORE",
      },
      "Knowledge: Education": {
        "rank": 0,
        "careerskill": false,
        "Key": "EDU",
      },
      "Knowledge: Lore": {
        "rank": 0,
        "careerskill": false,
        "Key": "LORE",
      },
      "Knowledge: Outer Rim": {
        "rank": 0,
        "careerskill": false,
        "Key": "OUT",
      },
      "Knowledge: Underworld": {
        "rank": 0,
        "careerskill": false,
        "Key": "UND",
      },
      "Knowledge: Warfare": {
        "rank": 0,
        "careerskill": false,
        "Key": "WARF",
      },
      "Knowledge: Xenology": {
        "rank": 0,
        "careerskill": false,
        "Key": "XEN",
      },
      "Cybernetics": {
        "rank": 0,
        "careerskill": false,
        "Key": "CYBERNETICS",
        "custom": true,
        "type": "General",
        "characteristic": "Intellect",
        "label": "Cybernetics",
      },
    };

    const skilltheme = game.settings.get("starwarsffg", "skilltheme");

    if (skilltheme !== "starwars") {
      skills = JSON.parse(JSON.stringify(CONFIG.FFG.alternateskilllists.find((list) => list.id === skilltheme).skills));
    }

    let importType;
    if (item.type === "Nemesis") {
      importType = "nemesis";
    } else if (item.type === "Rival") {
      importType = "rival";
    } else {
      importType = "minion";
    }

    let adversary = {
      name: item.name,
      type: importType,
      flags: {
        starwarsffg: {
          swaManagedItems: true,
          ffgimportid: `${fileName}-${item.type}-${item.name}`,
          config: {
            enableAutoSoakCalculation: false,
            enableCriticalInjuries: item.type !== "Minion",
          }
        }
      },
      system: {
        attributes: {},
        characteristics: {},
        skills,
        stats: {
          defence: {},
        },
        metadata: {
          tags: [],
          sources: [],
        },
      },
      items: [],
    };

    if (item?.tags) {
      adversary.system.metadata.tags = item.tags.filter(t => !t.includes("book:"));
      adversary.system.metadata.sources = item.tags.filter(t => t.includes("book:"));
    }
    adversary.system.metadata.tags.push(item.type);

    Object.values(CONFIG.FFG.characteristics).forEach((char) => {
      adversary.system.characteristics[char.value] = {
        value: item?.characteristics?.[char.value] ? item?.characteristics?.[char.value] : 0,
        label: game.i18n.localize(char.label),
        abrev: game.i18n.localize(char.abrev),
      };
    });

    if (item.derived) {
      ["soak", "wounds", "strain"].forEach((stat) => {
        if (item.derived[stat] == null) return;
        if (!Number.isFinite(Number(item.derived[stat]))) throw new Error("Invalid " + stat + " for " + item.name);
        if (stat === "soak") {
          adversary.system.stats[stat] = {
            value: parseInt(item.derived[stat], 10),
          };

          adversary.system.attributes.Soak = {
            mod: "Soak",
            modtype: "Stat",
            value: Math.abs(adversary.system.stats[stat].value - parseInt(adversary.system.characteristics.Brawn.value, 10)),
          };
        } else {
          if (stat === "wounds" && adversary.type === "minion") {
            adversary.system.quantity = {
              value: 1,
              max: 1,
            };

            adversary.system["unit_wounds"] = {
              value: item.derived[stat],
            };
          } else {
            adversary.system.stats[stat] = {
              value: 0,
              min: 0,
              max: item.derived[stat],
            };
          }
        }
      });
      if (Object.keys(item.derived).includes("defence")) {
        adversary.system.stats.defence.melee = item.derived.defence[0];
        adversary.system.stats.defence.ranged = item.derived.defence[1];
      }
    }

    if (item.skills) {
      let isMinion = Array.isArray(item.skills);
      let adversarySkills = isMinion ? item.skills : Object.keys(item.skills);
      adversarySkills.forEach((skillRaw) => {
        const skill = skillRaw.match(/^[^()]*/)[0].trim();
        let alternateCharacteristic = skillRaw.match(/(?<=\()(.*?)(?=\))/)?.length ? skillRaw.match(/(?<=\()(.*?)(?=\))/)[0] : undefined;

        const ffgSkill = Object.keys(skills).find((s) => skill.toLowerCase() === s.toLowerCase());

        if (ffgSkill) {
          adversary.system.skills[ffgSkill].groupskill = isMinion ? true : false;
          if (!isMinion) {
            adversary.system.attributes[skill] = {
              key: skill,
              mod: skill,
              modType: 'Skill Rank',
              value: item.skills[skill],
            };
            adversary.system.skills[ffgSkill].rank = item.skills[skill];
          }
          if (library.skills?.[skill]?.characteristic) {
            if (alternateCharacteristic) {
              adversary.system.skills[ffgSkill].characteristic = alternateCharacteristic;
            } else {
              adversary.system.skills[ffgSkill].characteristic = library.skills[skill].characteristic;
            }
          }

          if ((!adversary.system.skills[ffgSkill]?.type && skilltheme !== "starwars") || (skilltheme === "starwars" && !CONFIG.FFG.skills[ffgSkill])) {
            adversary.system.skills[ffgSkill].Key = ffgSkill.toUpperCase();
            adversary.system.skills[ffgSkill].custom = true;
            adversary.system.skills[ffgSkill].type = "General";
            adversary.system.skills[ffgSkill].label = ffgSkill;
          }
        }
      });
    }

    if (item.talents) {
      item.talents.forEach((talent) => {
        if (typeof talent === "object") {
          let adversaryTalent = {
            name: talent.name,
            type: "talent",
            flags: {},
            system: {
              attributes: {},
              description: talent.description,
              activation: {
                value: "Passive",
              },
              ranks: {
                ranked: false,
              },
            },
          };

          adversary.items.push(adversaryTalent);
        } else {
          const swaTalentKey = talent in library.talents ? talent : talent.replace(/\s+\d+$/, "");

          if (Object.hasOwn(library.talents, swaTalentKey)) {
            const swaTalent = library.talents[swaTalentKey];
            let rank = 0;
            if (swaTalent.ranked) {
              if (talent.replace(swaTalentKey, "").length > 0) {
                rank = parseInt(talent.replace(swaTalentKey, ""), 10);
              }
            }

            let adversaryTalent = {
              name: swaTalent.name,
              type: "talent",
              flags: {},
              system: {
                attributes: {},
                description: swaTalent.description,
                ranks: {
                  current: rank,
                  ranked: swaTalent.ranked,
                },
                activation: {
                  value: "Passive",
                },
                isForceTalent: false,
              },
            };

            adversary.items.push(adversaryTalent);
          }
        }
      });
    }

    if (item.weapons) {
      const template = await ImportHelpers.getTemplate("weapon");
      item.weapons.forEach((weapon) => {
        let data = JSON.parse(JSON.stringify(template));
        let weaponData;

        if (typeof weapon === "object") {
          weaponData = {
            name: weapon.name,
            type: "weapon",
            flags: {},
            system: {
              attributes: {},
              description: "No description provided",
              damage: {
                value: parseInt(!weapon?.damage ? weapon["plus-damage"] : weapon.damage, 10),
              },
              crit: {
                value: parseInt(weapon.critical, 10),
              },
              special: {
                value: weapon?.qualities?.length ? weapon.qualities.join(",") : "",
              },
              skill: {
                value: weapon.skill,
              },
              range: {
                value: weapon.range,
              },
            },
          };
          weaponData.system.skill.useBrawn = ["Melee", "Brawl", "Lightsaber"].some((element) => weaponData.system.skill.value.includes(element)) && (!weapon.damage || weapon.damage === "0");
          if (weapon?.["plus-damage"] && parseInt(weapon["plus-damage"], 10) > 0) {
            weaponData.system.attributes[foundry.utils.randomID()] = {
              isCheckbox: false,
              mod: "damage",
              modtype: "Weapon Stat",
              value: parseInt(weapon["plus-damage"], 10),
            };
          }
        } else {
          const swaWeaponKey = Object.keys(library.weapons).find((t) => weapon.includes(t));

          if (swaWeaponKey) {
            const swaWeapon = library.weapons[swaWeaponKey];
            weaponData = {
              name: swaWeapon.name,
              type: "weapon",
              flags: {},
              system: {
                attributes: {},
                description: "No description provided",
                damage: {
                  value: parseInt(!swaWeapon?.damage ? swaWeapon["plus-damage"] : swaWeapon.damage, 10),
                },
                crit: {
                  value: parseInt(swaWeapon.critical, 10),
                },
                special: {
                  value: swaWeapon?.qualities?.length ? swaWeapon.qualities.join(",") : "",
                },
                skill: {
                  value: swaWeapon.skill,
                },
                range: {
                  value: swaWeapon.range,
                },
              },
            };

            weaponData.system.skill.useBrawn = ["Melee", "Brawl", "Lightsaber"].some((element) => weaponData.system.skill.value.includes(element)) && (!swaWeapon.damage || swaWeapon.damage === "0");

            if (swaWeapon?.["plus-damage"] && parseInt(swaWeapon["plus-damage"], 10) > 0) {
              weaponData.system.attributes[foundry.utils.randomID()] = {
                isCheckbox: false,
                mod: "damage",
                modtype: "Weapon Stat",
                value: parseInt(swaWeapon["plus-damage"], 10),
              };
            }
          }
        }

        if (weaponData) {
          const templatedData = weaponData;
          templatedData.system = foundry.utils.mergeObject(data, weaponData.system);

          if (templatedData.system.special?.value?.length > 0) {
            templatedData.system.special.value.split(",").forEach((w) => {
              const wName = w.match(/^.*([^0-9\s]+)/gim);
              const wRank = w.match(/[^\w][0-9]/gim);

              const id = foundry.utils.randomID();
              const unique = {
                name: wName[0],
                id: id,
                _id: id,
                type: "itemmodifier",
                flags: {},
                system: {
                  description: library?.qualities?.[wName]?.description ? library.qualities[wName].description : "No description provided",
                  attributes: {},
                  type: "all",
                  rank: wRank ? parseInt(wRank[0].replace(" ", ""), 10) : 1,
                },
              };
              const descriptor = new CONFIG.Item.documentClass(unique, { temporary: true });
              templatedData.system.itemmodifier.push(descriptor.toObject());
            });
          }

          let w = new CONFIG.Item.documentClass(templatedData, { temporary: true });
          adversary.items.push(w.toObject());
        }
      });
    }

    if (item.gear) {
      if (Array.isArray(item.gear)) {
        item.gear.forEach((gear) => {
          if (gear.includes("Soak") && gear.includes("Defence")) {
            let Armordata = {
              name: gear.slice(0, gear.indexOf("(") - 1).trim(),
              type: "armour",
              flags: {},
              system: {
                description: "No description provided",
                defence: {
                  value: gear.charAt(gear.indexOf("Defence") - 2),
                },
                soak: {
                  value: gear.charAt(gear.indexOf("Soak") - 2),
                },
              },
            };
            adversary.items.push(Armordata);
          } else if (gear.includes("Soak")) {
            let Armordata = {
              name: gear.slice(0, gear.indexOf("(") - 1).trim(),
              type: "armour",
              flags: {},
              system: {
                description: "No description provided",

                soak: {
                  value: gear.charAt(gear.indexOf("Soak") - 2),
                },
              },
            };
            adversary.items.push(Armordata);
          } else if (gear.includes("Defence")) {
            let Armordata = {
              name: gear.slice(0, gear.indexOf("(") - 1).trim(),
              type: "armour",
              flags: {},
              system: {
                description: "No description provided",
                defence: {
                  value: gear.charAt(gear.indexOf("Defence") - 2),
                },
              },
            };
            adversary.items.push(Armordata);
          } else {
            let gearData = {
              name: gear,
              type: "gear",
              flags: {},
              system: {
                description: "No description provided",
              },
            };
            adversary.items.push(gearData);
          }
        });
      } else if (item.gear.includes("Soak") && item.gear.includes("Defence")) {
        let Armordata = {
          name: item.gear.slice(0, item.gear.indexOf("(") - 1).trim(),
          type: "armour",
          flags: {},
          system: {
            description: "No description provided",
            defence: {
              value: item.gear.charAt(item.gear.indexOf("Defence") - 2),
            },
            soak: {
              value: item.gear.charAt(item.gear.indexOf("Soak") - 2),
            },
          },
        };
        adversary.items.push(Armordata);
      } else if (item.gear.includes("Soak")) {
        let Armordata = {
          name: item.gear.slice(0, item.gear.indexOf("(") - 1).trim(),
          type: "armour",
          flags: {},
          system: {
            description: "No description provided",

            soak: {
              value: item.gear.charAt(item.gear.indexOf("Soak") - 2),
            },
          },
        };
        adversary.items.push(Armordata);
      } else if (item.gear.includes("Defence")) {
        let Armordata = {
          name: item.gear.slice(0, item.gear.indexOf("(") - 1).trim(),
          type: "armour",
          flags: {},
          system: {
            description: "No description provided",
            defence: {
              value: item.gear.charAt(item.gear.indexOf("Defence") - 2),
            },
          },
        };
        adversary.items.push(Armordata);
      } else {
        let gearData = {
          name: item.gear,
          type: "gear",
          flags: {},
          system: {
            description: "No description provided",
          },
        };
        adversary.items.push(gearData);
      }
    }

    let biography = "";

    if (item.description) {
      biography += `<p>${item.description}</p>`;
    }

    if (item.abilities) {
      for (const ability of item.abilities) {
        if (typeof ability === "object") {
          adversary.items.push({
            name: ability.name,
            type: "ability",
            system: {
              description: ability.description,
            },
          });
        } else {
          const swaAbilityKey = Object.keys(library.abilities).find((t) => ability.includes(t));
          if (swaAbilityKey) {
            const swaAbility = library.abilities[swaAbilityKey];
            adversary.items.push({
              name: swaAbility.name,
              type: "ability",
              system: {
                description: swaAbility.description,
              },
            });
          }
        }
      }
    }

    adversary.system.biography = biography;
    for (const embedded of adversary.items) {
      embedded.flags ??= {};
      embedded.flags.starwarsffg = {...embedded.flags.starwarsffg, swaImported: true};
      // The archive supplies final thresholds, including the bonuses Foundry applies at preparation.
      for (const {rule, rank} of reviewedPassiveSources(embedded)) {
        for (const path of rule.paths.filter(path => path.startsWith("system.stats."))) {
          const value = foundry.utils.getProperty(adversary, path);
          if (value != null) foundry.utils.setProperty(adversary, path, Number(value) - rank);
        }
      }
    }
    return adversary;
  }
}
