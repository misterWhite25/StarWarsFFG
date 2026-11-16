const defaultImage='systems/starwarsffg/images/shipdefence.png';
export function activateVehicleDefenseImage(sheet){
  if(sheet.actor?.type!=='vehicle')return;
  const image=sheet.element?.querySelector('.defense-img');if(!image||image.dataset.ffgDefenseBound)return;
  image.dataset.ffgDefenseBound='';
  const source=String(sheet.actor.name??'')+' '+String(image.getAttribute('src')??'');
  const icon=/cr[\s_-]?90/i.test(source)?'cr90':/tie[\s/_-]*(?:ln|fighter)\b/i.test(source)?'tie-fighter':null;
  const candidates=icon?['systems/starwarsffg/images/ship-icons/'+icon+'.svg',defaultImage]:[defaultImage];
  let next=0;
  const fallback=()=>{
    while(next<candidates.length){
      const path=candidates[next++],url=new URL(path,document.baseURI).href;if(url===image.src)continue;
      if(path.endsWith('.svg'))image.dataset.ffgDefenseIcon=icon;else delete image.dataset.ffgDefenseIcon;
      image.src=url;return;
    }
  };
  image.addEventListener('error',fallback);
  if(image.complete&&!image.naturalWidth)fallback();
}
