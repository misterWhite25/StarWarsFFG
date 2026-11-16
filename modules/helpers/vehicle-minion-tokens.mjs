import {vehicleMinionGroup} from './vehicle-minion-group.mjs';

export function registerVehicleMinionTokens(){
  const Base=CONFIG.Token.documentClass;
  CONFIG.Token.documentClass=class extends Base{
    getBarAttribute(barName,options={}){
      const bar=super.getBarAttribute(barName,options);
      if(!bar)return bar;
      const group=vehicleMinionGroup(this.actor);
      if(!group.enabled)return bar;
      if(bar.attribute==='stats.systemStrain')return null;
      return bar.attribute==='stats.hullTrauma'?{...bar,max:group.totalHull}:bar;
    }
  };
}
