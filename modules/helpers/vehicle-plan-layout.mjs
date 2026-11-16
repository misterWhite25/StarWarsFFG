/** Arrange the local windows; shared content never carries another user's pixels. */
async function imageDimensions(ship,plan) {
  const src=ship.getFlag('starwarsffg','vehicleDeck')?.image;
  if(!src)return null;
  const current=plan.element?.querySelector('.ffg-deck-image');
  if(current?.complete && current.naturalWidth && current.naturalHeight)return {width:current.naturalWidth,height:current.naturalHeight};
  return new Promise(resolve=>{
    const image=new Image();
    const finish=value=>{clearTimeout(timer);image.onload=image.onerror=null;resolve(value);};
    const timer=setTimeout(()=>finish(null),6000);
    image.onload=()=>finish(image.naturalWidth&&image.naturalHeight?{width:image.naturalWidth,height:image.naturalHeight}:null);
    image.onerror=()=>finish(null);
    image.src=src;
  });
}

export async function fitVehiclePlanImage(ship,plan,bounds) {
  const source=ship.getFlag('starwarsffg','vehicleDeck')?.image??'';
  const dimensions=await imageDimensions(ship,plan);
  plan.layoutBounds={...bounds};
  if(!dimensions){
    plan.setPosition({...bounds,width:Math.min(520,bounds.width),height:Math.min(280,bounds.height)});
    plan.fittedImageSource=source;
    return;
  }
  const minimumWidth=Math.min(320,bounds.width);
  // A narrower window can wrap its controls. Measure that new height before
  // choosing the final scale; all passes complete before the browser paints.
  for(let pass=0;pass<4;pass++) {
    const frame=plan.element,chart=frame.querySelector('.ffg-deck-chart');
    const css=getComputedStyle(chart);
    const chromeWidth=frame.offsetWidth-chart.clientWidth+parseFloat(css.paddingLeft)+parseFloat(css.paddingRight);
    const chromeHeight=frame.offsetHeight-chart.clientHeight+parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
    const scale=Math.max(0.01,Math.min(1,(bounds.width-chromeWidth)/dimensions.width,(bounds.height-chromeHeight)/dimensions.height));
    const width=Math.min(bounds.width,Math.max(minimumWidth,Math.ceil(dimensions.width*scale+chromeWidth)));
    const height=Math.min(bounds.height,Math.max(100,Math.ceil(dimensions.height*scale+chromeHeight)));
    plan.setPosition({...bounds,width,height});
  }
  plan.fittedImageSource=source;
}

export async function arrangeVehiclePlan(ship, plan) {
  const margin=12, gap=12, top=44;
  const width=Math.max(200,window.innerWidth-margin*2);
  const height=Math.max(200,window.innerHeight-top-margin);
  const canReadSheet=ship.testUserPermission(game.user,'OBSERVER');
  const sideBySide=width>=700;
  const stacked=!sideBySide && height>=620;
  let planPosition={left:margin,top,width,height};
  if(canReadSheet && (sideBySide || stacked)) {
    const sheet=ship.sheet;
    const sheetPosition=sideBySide
      ? {left:margin,top,width:360,height}
      : {left:margin,top,width,height:300};
    if(!sheet.rendered)await sheet.render({force:true,position:sheetPosition});
    if(sheet.minimized)await sheet.maximize();
    sheet.setPosition(sheetPosition);
    plan.companionSheet=sheet;
    const box=sheet.element.getBoundingClientRect();
    planPosition=sideBySide
      ? {left:box.right+gap,top,width:Math.max(200,window.innerWidth-margin-box.right-gap),height}
      : {left:margin,top:box.bottom+gap,width,height:Math.max(200,window.innerHeight-margin-box.bottom-gap)};
    sheet.bringToFront();
  }
  await fitVehiclePlanImage(ship,plan,planPosition);
}

export async function restoreVehicleSheet(plan) {
  const sheet=plan.companionSheet;
  delete plan.companionSheet;
  if(!sheet?.rendered)return;
  if(sheet.minimized)await sheet.maximize();
  sheet.resetDefaultSize();
}
