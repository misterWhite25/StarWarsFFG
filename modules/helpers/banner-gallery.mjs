const SYSTEM='starwarsffg';
let application;

export class BannerGallery extends foundry.applications.api.ApplicationV2 {
 static DEFAULT_OPTIONS={id:'ffg-banner-gallery',classes:['ffg-banner-gallery'],tag:'section',window:{title:'SWFFG.Gallery.Title',icon:'fa-solid fa-images',resizable:true},position:{width:1360,height:900}};
 async _renderHTML(){
  const frame=document.createElement('iframe');
  frame.className='ffg-banner-gallery-frame';frame.title=game.i18n.localize('SWFFG.Gallery.FrameTitle');
  const url=foundry.utils.getRoute(`systems/${SYSTEM}/gallery/banners/index.html`);
  const response=await fetch(url);if(!response.ok)throw Error(game.i18n.localize('SWFFG.Gallery.LoadError'));
  const base=new URL('.',new URL(url,location.href)).href;
  // Foundry denies framing served HTML; a local document keeps the gallery isolated.
  const language=game.i18n.lang==='fr'?'fr':'en';
  frame.srcdoc=(await response.text()).replace('<html lang="fr">',`<html lang="${language}">`).replace('<head>',`<head><base href="${base}">`);
  return frame;
 }
 _replaceHTML(result,content){content.replaceChildren(result);}
}

export async function openBannerGallery(){
 if(!application?.rendered)application=new BannerGallery({position:{width:Math.min(1360,Math.max(260,innerWidth-32)),height:Math.min(900,Math.max(300,innerHeight-48))}});
 await application.render({force:true});await application.maximize();application.bringToFront();return application;
}

function addGalleryButton(app,html){
 const root=html instanceof HTMLElement?html:html?.[0]??app.element;
 const section=root?.querySelector('section.documentation')??root?.querySelector('section.settings');
 if(!section||section.querySelector('[data-ffg-banner-gallery]'))return;
 const button=document.createElement('button');button.type='button';button.dataset.ffgBannerGallery='';
 const icon=document.createElement('i');icon.className='fa-solid fa-images';icon.setAttribute('inert','');
 button.append(icon,document.createTextNode(' '+game.i18n.localize('SWFFG.Gallery.Title')));
 button.addEventListener('click',()=>openBannerGallery().catch(error=>ui.notifications.error(error.message)));
 section.append(button);
}

Hooks.once('init',()=>{
 if(game.settings.menus.has(`${SYSTEM}.bannerGallery`))return;
 game.settings.registerMenu(SYSTEM,'bannerGallery',{name:'SWFFG.Gallery.Title',label:'SWFFG.Gallery.Open',icon:'fa-solid fa-images',type:BannerGallery,restricted:false});
});
Hooks.on('renderSettings',addGalleryButton);
Hooks.once('ready',()=>{game.ffg??={};game.ffg.openBannerGallery=openBannerGallery;if(ui.settings?.element)addGalleryButton(ui.settings,ui.settings.element);});
