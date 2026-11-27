import {npcAdversaryRank} from './npc-command-data.mjs';
import {vehicleMinionGroup} from './vehicle-minion-group.mjs';

export function registerTokenControls() {
  game.settings.register("starwarsffg", "showMinionCount", {
    name: game.i18n.localize("SWFFG.Settings.showMinionCount.Name"),
    hint: game.i18n.localize("SWFFG.Settings.showMinionCount.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
    onChange: (_rule) => window.location.reload()
  });
  game.settings.register("starwarsffg", "showAdversaryCount", {
    name: game.i18n.localize("SWFFG.Settings.showAdversaryCount.Name"),
    hint: game.i18n.localize("SWFFG.Settings.showAdversaryCount.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
    onChange: (_rule) => window.location.reload()
  });
    game.settings.register("starwarsffg", "adversaryItemName", {
    name: game.i18n.localize("SWFFG.Settings.AdversaryItemName.Name"),
    hint: game.i18n.localize("SWFFG.Settings.AdversaryItemName.Hint"),
    scope: "world",
    config: false,
    default: "Adversary",
    type: String,
    onChange: (_rule) => window.location.reload()
  });
}

export function drawMinionCount(token) {
  const actor = token?.actor;
  const group = actor?.type === "vehicle" ? vehicleMinionGroup(actor) : null;
  const existing = token.children.find(child => child.name === "minionCount");
  if (!game.settings.get("starwarsffg", "showMinionCount") || !(actor?.type === "minion" || group?.enabled)) {
    if (existing) {
      token.removeChild(existing);
      existing.destroy({children: true});
    }
    token.minionCount = null;
    return;
  }
  const borderWidth = 0.35;
  const friendlyColor = "0x00A2E84D";
  const enemyColor = "0x8800154D";
  const overflowColor = "0xDAA520";
  // calculate total and alive numbers of minions
  const curCount = group?.enabled ? group.alive : Math.max(actor.system.quantity.value, 0);
  const maxCount = group?.enabled ? group.count : actor.system.quantity.max;
  const maxRender = 6;

  // Foundry also refreshes tokens during movement, hovering and selection.
  const signature = maxCount > maxRender
    ? `overflow:${token.w}:${token.h}`
    : `${curCount}:${maxCount}:${token.w}:${token.h}`;
  if (existing?._minionSignature === signature) return;

  if (existing) {
    token.minionCount = existing;
    existing.removeChildren().forEach(child => child.destroy());
  } else {
    const container = new PIXI.Container();
    container.name = "minionCount";
    container.eventMode = "none";
    token.minionCount = token.addChild(container);
  }
  token.minionCount._minionSignature = signature;

  const tokenWidth = token.w;
  const markerWidth = Math.floor(tokenWidth / 8);
  const markerHeight = markerWidth * 2;
  const insideGap = 3;
  const availableSpace = tokenWidth - ((markerWidth * maxCount) + (insideGap * (maxCount - 1)));
  const outsideGap = availableSpace / 2;

  if (maxCount > maxRender) {
    const text = new PIXI.Text(
      "∞",
      {
        fontFamily: "Arial",
        fontSize: 48,
        fill: overflowColor,
        align: "center",
        stroke: "0x000000",
        strokeThickness: 1,
        fontWeight: "bold" ,
      }
    );
    text.anchor.set(0.5);
    text.x = tokenWidth / 2;
    text.y = token.h - 12;
    token.minionCount.addChild(text);
  } else {
    for (let i = 0; i < maxCount; i++) {
      const element = new PIXI.Graphics();
      element.lineStyle(borderWidth, "0x000000", markerWidth / 4);
      element.beginFill(i < curCount ? friendlyColor : enemyColor);
      element.drawRoundedRect(0, 0, markerWidth, markerHeight, 2);
      element.endFill();
      element.x = (i * (markerWidth + insideGap)) + outsideGap;
      element.y = token.h - markerHeight - 2;
      token.minionCount.addChild(element);
    }
  }
}

export function drawAdversaryCount(token) {
  const rank=game.settings.get('starwarsffg','showAdversaryCount')
    ?npcAdversaryRank(token?.actor??{},game.settings.get('starwarsffg','adversaryItemName')):0;
  let container=token.children.find(child=>child.name==='adversaryLevel');
  if(!rank){
    if(container){token.removeChild(container);container.destroy({children:true});}
    token.adversaryLevel=null;
    return;
  }
  const signature=['dot',rank,token.w,token.h].join(':');
  if(container?._adversarySignature===signature)return;
  if(!container){
    container=new PIXI.Container();container.name='adversaryLevel';
    token.addChild(container);
  }else container.removeChildren().forEach(child=>child.destroy());
  token.adversaryLevel=container;
  container.eventMode='none';
  container._adversarySignature=signature;
  // A small circular badge stays near the rim instead of covering the portrait.
  const radius=Math.max(5,Math.min(16,Math.min(token.w,token.h)*0.10));
  container.position.set(token.w*0.87,token.h*0.86);
  const seal=new PIXI.Graphics();
  seal.lineStyle(Math.max(1.5,radius*0.12),0x10151f,1);
  seal.beginFill(0x48265e,1);seal.drawCircle(0,0,radius);seal.endFill();
  seal.lineStyle(Math.max(0.7,radius*0.05),0xbca4cc,1);
  seal.drawCircle(0,0,radius);
  const text=new PIXI.Text(String(rank),{
    fontFamily:'Arial',fontSize:radius*(rank>99?0.85:rank>9?1.1:1.45),fontWeight:'bold',
    fill:0xffffff,align:'center',stroke:0x24132f,strokeThickness:1
  });
  text.anchor.set(0.5);text.resolution=2;
  container.addChild(seal,text);
}
