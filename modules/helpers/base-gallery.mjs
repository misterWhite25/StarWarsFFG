const scope = 'starwarsffg';
const key = 'baseGallery';
const t = label => game.i18n.localize('SWFFG.BaseGallery.' + label);

export function baseGalleryContext(sheet) {
  const actor = sheet.actor;
  if (!['homestead','vehicle'].includes(actor.type) || !actor.testUserPermission(game.user, 'OBSERVER')) return null;
  const edit = sheet.isEditable && actor.isOwner && !actor.pack;
  const images = Object.entries(actor.getFlag(scope, key) ?? {}).map(([id, image]) => ({
    id, name: image.name, src: foundry.utils.getRoute(image.path)
  }));
  return {images, edit, upload: edit && game.user.can('FILES_UPLOAD')};
}

async function galleryDirectory(actor) {
  const picker = foundry.applications.apps.FilePicker;
  const path = 'worlds/' + game.world.id + (actor.type === 'vehicle' ? '/vehicle-gallery' : '/base-gallery');
  try {
    await picker.browse('data', path);
  } catch {
    try { await picker.createDirectory('data', path); }
    catch { await picker.browse('data', path); } // Another upload may have just created it.
  }
  return path;
}

async function uploadImages(actor, files) {
  const dir = await galleryDirectory(actor);
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!Object.hasOwn(CONST.IMAGE_FILE_EXTENSIONS, ext)) {
      ui.notifications.warn(t('Invalid') + ' ' + file.name);
      continue;
    }
    const id = foundry.utils.randomID();
    const stored = new File([file], id + '.' + ext, {type: file.type});
    const result = await foundry.applications.apps.FilePicker.upload('data', dir, stored, {}, {notify:false});
    if (!result?.path) {
      ui.notifications.error(t('Failed') + ' ' + file.name);
      continue;
    }
    await actor.update({['flags.' + scope + '.' + key + '.' + id]: {name:file.name, path:result.path}});
  }
}

export async function baseGalleryAction(event, target) {
  event.preventDefault();
  const gallery = baseGalleryContext(this);
  if (!gallery) return;
  const image = gallery.images.find(entry => entry.id === target.dataset.image);
  try {
    switch (target.dataset.gallery) {
      case 'download': {
        if (!image) return;
        const response = await fetch(image.src);
        if (!response.ok) throw Error(game.i18n.localize('FILES.ErrorSomethingWrong'));
        const blob = await response.blob();
        foundry.utils.saveDataToFile(blob, blob.type, image.name);
        break;
      }
      case 'open':
        if (image) await new foundry.applications.apps.ImagePopout({
          src:image.src, window:{title:image.name}
        }).render({force:true});
        break;
      case 'upload': {
        if (!gallery.upload) return;
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = Object.keys(CONST.IMAGE_FILE_EXTENSIONS).map(ext => '.' + ext).join(',');
        picker.multiple = true;
        picker.addEventListener('change', () => {
          if (picker.files.length) uploadImages(this.actor, picker.files).catch(err => ui.notifications.error(err.message));
        }, {once:true});
        picker.click();
        break;
      }
      case 'remove':
        if (image && gallery.edit && await foundry.applications.api.DialogV2.confirm({
          window:{title:t('Remove')}, content:t('Confirm')
        })) await this.actor.update({['flags.' + scope + '.' + key + '.-=' + image.id]:null});
        break;
    }
  } catch (error) { ui.notifications.error(error.message); }
}
