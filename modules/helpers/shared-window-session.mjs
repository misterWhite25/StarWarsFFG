const empty = () => ({revision:0, open:false, sessionId:null, navigatorId:null, view:null});

/** Commands travel through the sender's User document. Foundry supplies the
 * authenticated author to updateUser and enforces ownership of player flags.
 * One connected authority serializes commands, including simultaneous opens. */
export function createSharedWindowSession({
  onState,onError,getMode=()=>({shared:true,epoch:'initial'}),
  scope='swffg-compendium-bilingual-steelers-core_rule',
  stateKey='galacticMapSession',requestKey='galacticMapRequest',sanitizeView,
  initialView=false,validateRequest,validateState,allowClosedHandoff=stateKey==='galacticMapSession'
}) {
  const SCOPE=scope,STATE=stateKey,REQUEST=requestKey;
  let queue = Promise.resolve(), outgoing = Promise.resolve(), current = empty();
  let scheduled = null, draftView = null, disposed = false, viewSending=false;
  let notifiedRevision=-1;
  const waiting = new Map();
  const seen = new Set();
  const activeUsers = () => game.users.filter(user => user.active).sort((a,b) => a.id.localeCompare(b.id));
  const authority = () => game.users.activeGM ?? activeUsers()[0];
  const localAuthority = () => authority()?.id === game.user.id;
  const sameMode=state=>(state.modeId??'initial')===getMode().epoch;
  const canNavigate = () => !disposed && getMode().shared && sameMode(current) && current.open && current.navigatorId === game.user.id && game.user.active;

  function latest() {
    return game.users.map(user => {
      const state=user.getFlag(SCOPE,STATE);
      return !validateState||validateState(user,state??{})?state:null;
    })
      .filter(state => Number.isSafeInteger(state?.revision) && state.revision > 0)
      .sort((a,b) => b.revision - a.revision || String(b.writerId).localeCompare(String(a.writerId)))[0] ?? empty();
  }

  function notify(state, force=false) {
    if (disposed || state.revision < current.revision || (!force&&state.revision===notifiedRevision)) return;
    notifiedRevision=state.revision;
    current = structuredClone(state);
    for (const [id, pending] of waiting) {
      if (state.requestId !== id) continue;
      clearTimeout(pending.timer);
      waiting.delete(id);
      if (state.error) pending.reject(Error(state.error));
      else pending.resolve(current);
    }
    try { Promise.resolve(onState(current)).catch(onError); }
    catch (error) { onError(error); }
  }

  async function commit(state, requestId, error) {
    if (disposed || !localAuthority()) return;
    const next = {...state, revision:Math.max(current.revision, latest().revision) + 1,
      writerId:game.user.id, requestId:requestId ?? null, error:error ?? null};
    await game.user.setFlag(SCOPE, STATE, next);
    notify(next);
  }

  function serialize(work) {
    queue = queue.catch(onError).then(async () => {
      if (!disposed && localAuthority()) await work();
    }).catch(onError);
    return queue;
  }

  async function reconcile() {
    current = structuredClone(latest());
    if(!sameMode(current)||(!getMode().shared&&current.open)){
      await commit({...empty(),modeId:getMode().epoch});
    }else if (current.open && !game.users.get(current.navigatorId)?.active) {
      const replacement = authority();
      await commit({...current, navigatorId:replacement?.id ?? null, open:Boolean(replacement)});
    } else if (current.revision && current.writerId !== game.user.id) {
      await commit(current);
    } else notify(current,true);
  }

  function cleanView(view) {
    if (!view || typeof view !== 'object') return null;
    const clean = {};
    for (const key of ['from','to','selectedRoute','fromFilter','toFilter']) {
      if (typeof view[key] === 'string') clean[key] = view[key].slice(0,160);
    }
    if (Number.isFinite(view.hyperdrive) && view.hyperdrive > 0 && view.hyperdrive <= 10000) clean.hyperdrive = view.hyperdrive;
    const camera = view.camera;
    if (camera && [camera.zoom,camera.cx,camera.cy].every(Number.isFinite)) {
      clean.camera = {
        zoom:Math.max(1,Math.min(12,camera.zoom)),
        cx:Math.max(0,Math.min(3636,camera.cx)),
        cy:Math.max(0,Math.min(3260,camera.cy))
      };
    }
    return clean;
  }

  async function handle(user, request, author) {
    if (disposed || !localAuthority() || !request || user.id !== author || !user.active ||
        request.authorityId !== authority()?.id || typeof request.id !== 'string' || seen.has(request.id)) return;
    seen.add(request.id);
    if (seen.size > 500) seen.delete(seen.values().next().value);
    current = structuredClone(latest());
    if(!sameMode(current))current={...empty(),modeId:getMode().epoch};
    let next = {...current}, error;
    if(request.modeId!==getMode().epoch||!getMode().shared){
      await commit(next,request.id);
      return;
    }
    try{await validateRequest?.({user,request,state:current});}
    catch(error){await commit(next,request.id,error.message);return;}
    const owner = current.navigatorId === user.id;
    if (request.action === 'open') {
      if (!current.open) next = {...empty(), modeId:getMode().epoch, open:true, sessionId:request.id, navigatorId:allowClosedHandoff&&game.users.get(current.navigatorId)?.active?current.navigatorId:user.id,
        view:initialView?(sanitizeView?sanitizeView(request.view):cleanView(request.view)):null};
    } else if (request.action === 'handoff' && allowClosedHandoff && !current.open && request.sessionId === current.sessionId && user.isGM && game.users.get(request.target)?.active) {
      next.navigatorId = request.target;
    } else if (!current.open || request.sessionId !== current.sessionId) {
      error = game.i18n.localize("SWFFG.UI.Interface.SharedSessionEnded");
    } else if (request.action === 'navigate' && owner) {
      const view = sanitizeView?sanitizeView(request.view):cleanView(request.view);
      if (view) next.view = view;
    } else if (request.action === 'handoff' && user.isGM && game.users.get(request.target)?.active) {
      next.navigatorId = request.target;
    } else if (request.action === 'close' && (owner || user.isGM)) {
      next.open = false;
    } else {
      error = game.i18n.localize("SWFFG.UI.Interface.SharedOperatorRequired");
    }
    await commit(next, request.id, error);
  }

  function request(action, values = {}) {
    if (disposed) return Promise.reject(Error(game.i18n.localize("SWFFG.UI.Interface.SessionClosed")));
    const sessionId=current.sessionId,modeId=getMode().epoch;
    const result = outgoing.catch(() => {}).then(async () => {
      if (disposed) throw Error(game.i18n.localize("SWFFG.UI.Interface.SessionClosed"));
      if(!getMode().shared||modeId!==getMode().epoch)return current;
      if(action==='navigate'&&(!canNavigate()||current.sessionId!==sessionId))return current;
      const leader = authority();
      if (!leader || !game.user.active) throw Error(game.i18n.localize("SWFFG.UI.Interface.ConnectForSharedMap"));
      const command = {id:foundry.utils.randomID(24), action, sessionId, modeId,
        authorityId:leader.id, ...values};
      const response = new Promise((resolve,reject) => {
        const timer = setTimeout(() => {
          waiting.delete(command.id);
          reject(Error(game.i18n.localize("SWFFG.UI.Interface.SharedMapNotResponding")));
        },10000);
        waiting.set(command.id,{resolve,reject,timer});
      });
      // Register the rejection handler before the asynchronous document write.
      response.catch(() => {});
      try {
        await game.user.setFlag(SCOPE, REQUEST, command);
        return await response;
      } catch (error) {
        const pending = waiting.get(command.id);
        if (pending) {clearTimeout(pending.timer); waiting.delete(command.id);}
        throw error;
      }
    });
    outgoing = result;
    return result;
  }

  function publishView(view) {
    if (!canNavigate()) return;
    draftView = view;
    if (scheduled !== null||viewSending) return;
    const sessionId = current.sessionId, navigatorId = current.navigatorId;
    scheduled = setTimeout(async () => {
      scheduled = null;
      const pending = draftView;
      draftView = null;
      if (canNavigate() && current.sessionId === sessionId && current.navigatorId === navigatorId) {
        viewSending=true;
        try{await request('navigate', {view:pending});}
        catch(error){onError(error);}
        finally{
          viewSending=false;
          if(draftView)publishView(draftView);
        }
      }
    },120);
  }

  const updateHook = Hooks.on('updateUser', (user, changes, _options, author) => {
    const flags = changes.flags?.[SCOPE];
    if (flags?.[STATE] && user.id === authority()?.id && author === user.id) notify(user.getFlag(SCOPE, STATE));
    if (flags?.[REQUEST]) {
      const command=structuredClone(user.getFlag(SCOPE, REQUEST));
      serialize(() => handle(user, command, author));
    }
  });
  const connectedHook = Hooks.on('userConnected', () => {
    if (localAuthority()) serialize(reconcile);
    else notify(latest(),true);
  });

  return {
    get state() {return getMode().shared&&sameMode(current)?current:{...empty(),modeId:getMode().epoch};},
    canNavigate,
    request,
    publishView,
    async modeChanged(){
      if (disposed) return;
      clearTimeout(scheduled);scheduled=null;draftView=null;
      if(localAuthority())await serialize(reconcile);
      else notify(latest(),true);
    },
    async start() {
      if (disposed) return;
      current = structuredClone(latest());
      if (localAuthority()) await serialize(reconcile);
      else notify(current);
    },
    destroy() {
      disposed = true;
      clearTimeout(scheduled);scheduled=null;draftView=null;
      seen.clear();
      Hooks.off('updateUser',updateHook);
      Hooks.off('userConnected',connectedHook);
      for (const pending of waiting.values()) {clearTimeout(pending.timer); pending.reject(Error(game.i18n.localize("SWFFG.UI.Interface.SessionClosed")));}
      waiting.clear();
    }
  };
}
