import ItemHelpers from "../helpers/item-helpers.js";

export default class ItemBaseFFG extends Item {
  async update(data, options = {}) {
    // Keep flattened flags intact: appending flags:{} would erase them on expansion.
    const updateData = ItemHelpers.normalizeDataStructure(data);
    const hasClickFlag = Object.hasOwn(updateData, "flags.clickfromparent") || typeof updateData.flags?.clickfromparent !== "undefined";
    if (!Object.hasOwn(updateData, "ownership") && !hasClickFlag && typeof this.flags?.clickfromparent !== "undefined") {
      if (updateData.flags && typeof updateData.flags === "object") updateData.flags.clickfromparent = this.flags.clickfromparent;
      else updateData["flags.clickfromparent"] = this.flags.clickfromparent;
    }
    return super.update(updateData, options);
  }
}
