/** Load a rarely used application on first use and coalesce rapid clicks. */
export function lazyApplication(load,{onError=error=>ui.notifications.error(error.message)}={}) {
  let pending,instance;
  return event=>{
    if(instance?.rendered){instance.bringToFront();return Promise.resolve(instance);}
    if(pending)return pending;
    const button=event?.currentTarget,disabled=button?.disabled;
    if(button)button.disabled=true;
    pending=Promise.resolve().then(load).then(async module=>{
      instance??=new module.default();await instance.render({force:true});return instance;
    }).catch(error=>{onError(error);return null;}).finally(()=>{pending=null;if(button)button.disabled=disabled;});
    return pending;
  };
}
