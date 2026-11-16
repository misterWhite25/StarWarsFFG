const pending=new WeakMap();
let DialogClass;

/** Keep live display DOM outside Foundry's immutable dialog options. */
export function summaryDialog(options){
  DialogClass??=class SummaryDialog extends foundry.applications.api.DialogV2{
    constructor(config){
      const content=config.content;
      super({...config,content:'<span></span>'});
      this.summaryContent=content;
    }
    _replaceHTML(result,content,options){
      super._replaceHTML(result,content,options);
      content.querySelector('.dialog-content')?.replaceChildren(this.summaryContent);
    }
    async close(options){
      const result=await super.close(options);
      if(!this.rendered)this.summaryContent=null;
      return result;
    }
    async setContent(content){
      const selector='.ffg-equipment-summary-body,.ffg-talent-summary-body';
      const previous=this.summaryContent?.querySelector?.(selector);
      const top=previous?.scrollTop??0,left=previous?.scrollLeft??0;
      const expanded=new Set(Array.from(this.summaryContent?.querySelectorAll?.('details[data-summary-key][open]')??[],detail=>detail.dataset.summaryKey));
      for(const detail of content.querySelectorAll?.('details[data-summary-key]')??[])detail.open=expanded.has(detail.dataset.summaryKey);
      this.summaryContent=content;
      const host=this.rendered&&this.element?.querySelector('.dialog-content');
      if(host)host.replaceChildren(content);else await this.render({force:true});
      if(this.summaryContent!==content)return;
      const body=content.querySelector?.(selector);if(body){body.scrollTop=top;body.scrollLeft=left;}
    }
  };
  return new DialogClass(options);
}

/** Discard unfinished openings when the selected NPC changes. */
export function cancelSummaryRenders(owner){
  const requests=pending.get(owner);requests?.clear();pending.delete(owner);
}

/** Coalesce openings and let only the latest refresh update a still-open dialog. */
export function renderSummary(owner,key,refresh,render){
  let requests=pending.get(owner);
  if(!requests){requests=new Map();pending.set(owner,requests);}
  const previous=requests.get(key),actor=owner.actor,window=owner[key];
  if(!refresh&&previous?.opening&&previous.actor===actor)return previous.promise;
  const request={actor,opening:!refresh};
  requests.set(key,request);
  const current=()=>requests.get(key)===request&&owner.actor===actor&&(!refresh||(owner[key]===window&&window?.rendered));
  request.promise=Promise.resolve().then(()=>render(current)).finally(()=>{
    if(requests.get(key)===request)requests.delete(key);
    if(!requests.size&&pending.get(owner)===requests)pending.delete(owner);
  });
  return request.promise;
}
