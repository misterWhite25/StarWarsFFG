export default class Helpers {
  static logger = {
    log: (...args) => {
      console.log(`${CONFIG.module} | `, ...args);
    },
    warn: (...args) => {
      console.warn(`${CONFIG.module} | `, ...args);
    },
    error: (...args) => {
      console.error(`${CONFIG.module} | `, ...args, new Error().stack);
    },
  };

  static async getSpecializationTalent(itemId, packName) {
    let item = game.items.get(itemId);
    if (item) {
      return item;
    } else {
      const pack = await game.packs.get(packName);
      if ( !pack.indexed ) await pack.getIndex();
      const entry = await pack.getIndex({fields: ["name", "type"]});
      if (entry) {
        const entryId = entry.filter((i) => i._id === itemId);
        return await pack.getDocument(entryId[0]._id);
      }
    }
  }

  /**
   * Uploads a file to Foundry without the UI Notification
   * @param  {string} source
   * @param  {string} path
   * @param  {blog} file
   * @param  {object} options
   */
  static async UploadFile(source, path, file, options) {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) {
      return Helpers.ForgeUploadFile("forgevtt", path, file, options);
    }

    return foundry.applications.apps.FilePicker.upload(source, path, file, options, {notify: false});
  }

  static async ForgeUploadFile(source, path, file, _options) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("path", `${path}/${file.name}`);

    const response = await ForgeAPI.call("assets/upload", fd);
    if (!response || response.error) {
      ui.notifications.error(response ? response.error : game.i18n.localize("SWFFG.UI.Interface.ForgeError"));
      return false;
    } else {
      return { path: response.url };
    }
  }

  /**
   * Returns the difference between object 1 and 2
   * @param  {object} obj1
   * @param  {object} obj2
   * @returns {object}
   */
  static diff(obj1, obj2) {
    var result = {};
    for (const key of Object.keys(obj1)) {
      if (obj2[key] != obj1[key]) result[key] = obj2[key];
      if (Array.isArray(obj2[key]) && Array.isArray(obj1[key])) result[key] = this.diff(obj1[key], obj2[key]);
      else if (typeof obj2[key] == "object" && typeof obj1[key] == "object") result[key] = this.diff(obj1[key], obj2[key]);
    }
    return result;
  }

  /**
   * Returns the MIME type for a media file
   * @param  {string} header - Hex header for file.
   */
  static getMimeType(header) {
    let type = "";
    switch (header) {
      case "89504e47":
        type = "image/png";
        break;
      case "47494638":
        type = "image/gif";
        break;
      case "ffd8ffe0":
      case "ffd8ffe1":
      case "ffd8ffe2":
      case "ffd8ffe3":
      case "ffd8ffe8":
        type = "image/jpeg";
        break;
      default:
        type = "unknown"; // Or you can use the blob.type as fallback
    }

    return type;
  }
}
