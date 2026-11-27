import ImportHelpers from "../../import-helpers.js";

export default class Specializations {
  static getMetaData() {
    return {
      displayName: 'Specializations',
      className: "Specialization",
      itemName: "specialization",
      localizationName: "SWFFG.Specializations",
      fileNames: ["/Specializations/"],
      filesAreDir: true,
      phase: 5,
    };
  }

  static async Import(zip) {
    try {
      const files = ImportHelpers.xmlFiles(zip, "Specializations");
      const talentsByKey = new Map();
      let totalCount = files.length;
      let currentCount = 0;

      if (files.length) {
        let pack = await ImportHelpers.getCompendiumPack("Item", `oggdude.Specializations`);
        
        $(".import-progress.specialization").toggleClass("import-hidden");

        await ImportHelpers.asyncForEach(files, async (file) => {
          try {
            const zipData = await zip.file(file.name).async("text");
            const xmlData = ImportHelpers.stringToXml(zipData);
            const specializationData = JXON.xmlToJs(xmlData);
            const item = specializationData.Specialization;

            item.Description = ImportHelpers.cleanDescription(item.Description);

            let data = ImportHelpers.prepareBaseObject(item, "specialization");
            data.system = {
              attributes: {},
              description: item.Description,
              talents: {},
              careerskills: {},
              isReadOnly: true,
              metadata: {
                tags: [
                  "specialization",
                ],
                sources: ImportHelpers.getSourcesAsArray(item?.Sources ?? item?.Source),
              },
              careerSkills: {
                careerSkill0: "(none)",
                careerSkill1: "(none)",
                careerSkill2: "(none)",
                careerSkill3: "(none)",
                careerSkill4: "(none)",
              },
              universal: false,
            };

            // process career skills
            let currentSkill = 0;
            for (const skillKey of [].concat(item.CareerSkills?.Key ?? [])) {
              const skill = CONFIG.temporary.skills[skillKey];
              if (skill) data.system.careerSkills[`careerSkill${currentSkill++}`] = skill;
            }

            if (item?.Universal) {
              data.system.universal = item.Universal === 'true';
            }

            const rows = ImportHelpers.xmlRecords(item.TalentRows?.TalentRow);
            for (const [i, row] of rows.entries()) {
              const directions = ImportHelpers.xmlRecords(row.Directions?.Direction);
              const keys = [].concat(row.Talents?.Key ?? []);
              for (const [index, talentKey] of keys.entries()) {
                let talentItem = talentsByKey.get(talentKey);
                if (!talentItem) {
                  talentItem = await ImportHelpers.findCompendiumEntityByImportId("Item", talentKey, undefined, "talent")
                    ?? ImportHelpers.findEntityByImportId("items", talentKey);
                  if (!talentItem) throw new Error(`Missing talent ${talentKey} for specialization ${item.Name}`);
                  talentsByKey.set(talentKey, talentItem);
                }

                const rowTalent = {};
                rowTalent.attributes = {};
                for (const attribute of Object.values(talentItem.system.attributes ?? {})) {
                  rowTalent.attributes[ImportHelpers.attributeKey()] = foundry.utils.deepClone(attribute);
                }

                rowTalent.name = talentItem.name;
                rowTalent.description = talentItem.system.description;
                rowTalent.activation = talentItem.system.activation.value;
                rowTalent.activationLabel = talentItem.system.activation.label;
                rowTalent.isForceTalent = talentItem?.system?.isForceTalent ? true : false;
                rowTalent.isConflictTalent = talentItem?.system?.isConflictTalent ? true : false;
                rowTalent.isRanked = talentItem?.system?.ranks?.ranked ? true : false;
                rowTalent.size = "single";
                rowTalent.canLinkTop = true;
                rowTalent.canLinkRight = true;
                rowTalent.itemId = talentItem._id;
                rowTalent.longDesc = "";

                if (directions[index]?.Up === "true") {
                  rowTalent["links-top-1"] = true;
                }

                if (directions[index]?.Right === "true") {
                  rowTalent["links-right"] = true;
                }

                const talentIndex = `talent${i * 4 + index}`;
                data.system.talents[talentIndex] = rowTalent;
              }
            }

            data.system.metadata.tags.push(...ImportHelpers.importTags(item.Categories?.Category, item.Type));

            let imgPath = await ImportHelpers.getImageFilename(zip, "Specialization", "", data.flags.starwarsffg.ffgimportid);
            if (imgPath) {
              data.img = await ImportHelpers.importImage(imgPath.name, zip, pack);
            }

            await ImportHelpers.addImportItemToCompendium("Item", data, pack);

            currentCount += 1;

            $(".specialization .import-progress-bar")
              .width(`${Math.trunc((currentCount / totalCount) * 100)}%`)
              .html(`<span>${Math.trunc((currentCount / totalCount) * 100)}%</span>`);
          } catch (err) {
            CONFIG.logger.error(`Error importing record : `, err);
          }
        });
      }
    } catch (err) {
      CONFIG.logger.error(`Error importing record : `, err);
    }
  }
}
