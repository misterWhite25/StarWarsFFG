/**
 * Give a custom, Star Wars FFG tooltip when qualities, attachments, upgrades, etc are hovered (after sending to chat)
 * @param event
 */
export function itemPillHover(event) {
  event.preventDefault();
  const li = $(event.currentTarget);
  const itemName = li.data("item-embed-name");
  const itemImage = li.data("item-embed-img");
  const itemType = li.data("item-type");
  const itemRanks = li.data("item-ranks");
  let desc = li.data("desc");
  let descRanks = "";
  if (itemType === "itemattachment") {
    const rarity = li.data("rarity");
    const price = li.data("price");
    if (price) {
      desc = `<span class="statt" title="${game.i18n.localize("SWFFG.UI.Equipment.Price")}"><i class="fa-solid fa-dollar-sign"></i>${price}</span>${desc}`
    }
    if (rarity) {
      desc = `<span class="stat stat-right" title="${game.i18n.localize("SWFFG.UI.Equipment.Rarity")}"><i class="fa-solid fa-magnifying-glass"></i>${rarity}</span>${desc}`
    }

    // if the item has embedded mods, pull the data and add it to the description
    let modNames = li.data("mod-names");
    let modDescs = li.data("mod-descs");
    let modActives = li.data("mod-actives");
    if (modNames) {
      modNames = modNames.split("~");
      modDescs = modDescs.split("~");
      modActives = modActives.split("~");
      
      
      
      let newDesc = `<hr><b>${game.i18n.localize("SWFFG.UI.Equipment.Modifications")}</b>:<br>`;
      for (let i = 0; i < modNames.length - 1; i++) {
        if (modActives[i] === "true") {
          modNames[i] = `<i class="fa-solid fa-user-check" title="${game.i18n.localize("SWFFG.UI.Equipment.Installed")}"></i>&nbsp;${modNames[i]}`;
        } else {
          modNames[i] = `<i class="fa-duotone fa-solid fa-user-xmark" title="${game.i18n.localize("SWFFG.UI.Equipment.NotInstalled")}"></i>&nbsp;${modNames[i]}`;
        }
        newDesc += `<u>${modNames[i]}</u>:&nbsp;${modDescs[i]}<br>`;
      }
      desc += newDesc;
    }
  }
  if (itemRanks > 0) {
    descRanks = game.i18n.format("SWFFG.UI.Equipment.RankCount",{ranks:itemRanks});
  } else {
    if (!["specialization", "signatureAbility", "itemattachment"].includes(itemType)) {
      descRanks = game.i18n.localize("SWFFG.UI.Equipment.NotRanked");
    }
  }
  let embeddedContent = `
    <section class="chat-msg-tooltip content">
      <section class="header">
        <img class="tooltip-img" src="${itemImage}"/>
        <div class="title">${itemName}</div>
      </section>
      <section class="description">
        ${desc}
      </section>
      <section class="ranks">
        ${descRanks}
      </section>
    </section>
  `;
  if (itemType !== undefined) {
    li.attr("data-tooltip", embeddedContent);
  }
}
