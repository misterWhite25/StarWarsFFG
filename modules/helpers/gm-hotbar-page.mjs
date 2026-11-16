/** A fixed sixth page using Foundry's native Hotbar without consuming macro slots. */
export function registerGMHotbar(api){
  const Base=CONFIG.ui.hotbar;
  const available=()=>game.ready&&game.user.isGM&&game.settings.get('starwarsffg','enableGMHotbar');
  const indexFor=node=>Number(/^ffg-mj-(\d+)$/.exec(node?.closest?.('.slot')?.dataset.slot??'')?.[1]);
  CONFIG.ui.hotbar=class SteelersHotbar extends Base {
    _ffgMJActive=false;
    _ffgMJSlots=[];
    _ffgRestore=true;
    static DEFAULT_OPTIONS={actions:{
      execute:async function(event,target){
        if(this.isGMPage){event.stopPropagation();return this.executeGMShortcut(indexFor(target??event.target),event);}
        return Base.DEFAULT_OPTIONS.actions.execute.call(this,event,target);
      },
      clear:async function(event,target){
        if(this.isGMPage)return;
        return Base.DEFAULT_OPTIONS.actions.clear.call(this,event,target);
      }
    }};
    get isGMPage(){return available()&&this._ffgMJActive;}
    get page(){return this.isGMPage?6:super.page;}
    get slots(){return this.isGMPage?this._ffgMJSlots:super.slots;}
    async _prepareContext(options){
      if(this._ffgRestore&&game.ready){this._ffgRestore=false;this._ffgMJActive=available()&&api.preferences().activePage==='mj';}
      if(!this.isGMPage)return super._prepareContext(options);
      this._ffgMJSlots=await Promise.all(api.slots().map(async(value,index)=>{
        const info=value?await api.describe(value):null;
        return {slot:'ffg-mj-'+index,key:index<9?index+1:0,img:info?.img??null,
          cssClass:value?'full':'open',tooltip:info?.name??null,
          ariaLabel:info?.name??api.text('EmptySlot'),style:'',
          macro:value?{execute:()=>this.executeGMShortcut(index)}:null};
      }));
      return {slots:this._ffgMJSlots,page:game.i18n.localize("SWFFG.UI.Interface.GMShort")};
    }
    async _onRender(context,options){
      if(!this.isGMPage)await super._onRender(context,options);
      else {
        this._updateToggles();
        const prevent=event=>{event.preventDefault();event.stopImmediatePropagation();};
        new foundry.applications.ux.DragDrop.implementation({dragSelector:'.slot.full',dropSelector:'.slot',callbacks:{dragstart:prevent,dragover:prevent,drop:prevent}}).bind(this.element);
      }
      const clear=this.element.querySelector('[data-action=clear]');if(clear)clear.hidden=this.isGMPage;
      if(!available())return;
      const nav=this.element.querySelector('#hotbar-page-controls');nav?.classList.add('ffg-gm-pages');
      const select=document.createElement('select');select.className='hotbar-page-number ffg-gm-page-selector';select.setAttribute('aria-label',api.text('PageSelector'));
      for(let page=1;page<=6;page++){
        const option=document.createElement('option');option.value=String(page);option.textContent=page===6?game.i18n.localize("SWFFG.UI.Interface.GMShort"):String(page);option.selected=page===this.page;select.append(option);
      }
      select.addEventListener('change',event=>{event.stopPropagation();this.changePage(Number(select.value)).catch(api.report);});
      nav?.querySelector('.hotbar-page-number')?.replaceWith(select);
    }
    _getContextMenuOptions(){
      return super._getContextMenuOptions().map(option=>{
        const visible=option.visible;
        return {...option,visible:target=>!this.isGMPage&&(typeof visible==='function'?visible(target):visible!==false)};
      });
    }
    async changePage(page){
      if(page===6&&available()){
        this._ffgRestore=false;this._ffgMJActive=true;
        if(api.preferences().activePage!=='mj')await api.save({activePage:'mj'});
        return this.render();
      }
      if(!Number.isInteger(page)||page<1||page>5)return super.changePage(page);
      this._ffgRestore=false;this._ffgMJActive=false;
      await super.changePage(page);
      if(available()&&api.preferences().activePage==='mj')await api.save({activePage:'native'});
    }
    cyclePage(direction){
      if(!available())return super.cyclePage(direction);
      const offset=Number.isFinite(Number(direction))?Math.sign(Number(direction))||1:1;
      return this.changePage((this.page-1+offset+6)%6+1);
    }
    async refreshGMPage(){if(!available())this._ffgMJActive=false;return this.render();}
    async executeGMShortcut(index,event){
      if(!this.isGMPage||!Number.isInteger(index)||index<0||index>9)return;
      const value=api.slots()[index];if(!value)return;
      const target=this.element.querySelector('[data-slot="ffg-mj-'+index+'"]');
      try{await api.execute(value,event,target);}catch(error){api.report(error);}
    }
  };
}
