import {createSharedWindowSession} from "../helpers/shared-window-session.mjs";

const SETTING = "spaceCombatMapMode";
const DEFAULT_MODE = {shared: false, epoch: "initial"};

/** Share the map session, never a participant's local camera. */
export function registerSharing({show, hide, refresh, report}) {
  let session, started, visible = false, displayedSession = null;
  let preserveEpoch = null, transitionEpoch = null;
  let dismissedSession=null;
  const dismissalKey=()=>"starwarsffg.spaceCombatDismissed."+game.world.id+"."+game.user.id;
  function clearDismissal(){dismissedSession=null;sessionStorage.removeItem(dismissalKey());}
  let modeWork = Promise.resolve(), uiWork = Promise.resolve();
  const mode = () => game.settings.get(game.system.id, SETTING) ?? DEFAULT_MODE;
  const enqueueUI = work => (uiWork = uiWork.catch(report).then(work));

  async function showWindow() {
    await show();
    visible = true;
  }

  async function hideWindow() {
    // The local Application may already be rendered while its opening is finishing.
    await hide();
    visible = false;
    displayedSession = null;
  }

  async function applyState() {
    if (!mode().shared) return;
    const state = session.state;
    if (!state.open) {
      clearDismissal();
      if (displayedSession !== null) await hideWindow();
      return;
    }
    if(state.sessionId===dismissedSession)return;
    if(dismissedSession)clearDismissal();
    const opening = displayedSession !== state.sessionId;
    if (opening) {
      await showWindow();
      displayedSession = state.sessionId;
    }
    if (opening) await refresh();
  }

  function start() {
    if (!started) {
      dismissedSession=sessionStorage.getItem(dismissalKey());
      session = createSharedWindowSession({
        scope: game.system.id,
        stateKey: "spaceCombatMapSession",
        requestKey: "spaceCombatMapRequest",
        getMode: mode,
        initialView: false,
        sanitizeView: () => null,
        validateState: (user, state) => {
          const authority = game.users.activeGM ?? game.users.filter(u => u.active).sort((a, b) => a.id.localeCompare(b.id))[0];
          return state.writerId === user.id && (user.isGM || user.id === authority?.id);
        },
        onState: () => enqueueUI(applyState),
        onError: report,
      });
      started = session.start();
    }
    return started;
  }

  function changeMode(next) {
    if (transitionEpoch === next.epoch) return modeWork;
    transitionEpoch = next.epoch;
    const keepLocal = preserveEpoch === next.epoch;
    modeWork = modeWork.catch(report).then(async () => {
      if (mode().epoch !== next.epoch) return;
      await enqueueUI(async () => {
        if (keepLocal && visible) {
          displayedSession = null;
          await refresh();
        } else await hideWindow();
      });
      if (session) await session.modeChanged();
    });
    return modeWork;
  }

  Hooks.once("init", () => {
    game.settings.register(game.system.id, SETTING, {
      scope: "world", config: false, restricted: true, type: Object, default: DEFAULT_MODE,
      onChange: next => changeMode(next).catch(report),
    });
  });
  Hooks.once("ready", () => start().catch(report));

  async function open() {
    await start();
    await modeWork;
    clearDismissal();
    const {shared, epoch} = mode();
    if (!shared || session.state.open) {
      const sessionId = session.state.sessionId;
      return enqueueUI(() => {
        if (mode().epoch !== epoch) return;
        if (shared && (!session.state.open || session.state.sessionId !== sessionId)) return;
        if(shared) {
          displayedSession=null;
          return applyState();
        }
        return showWindow();
      });
    }
    await session.request("open");
    await uiWork;
  }

  async function close() {
    await modeWork;
    const {shared, epoch} = mode();
    if (!shared || !session?.state.open) {
      return enqueueUI(() => {
        if (mode().epoch === epoch && !(shared && session?.state.open)) return hideWindow();
      });
    }
    if (!game.user.isGM && !session.canNavigate()) {
      dismissedSession=session.state.sessionId;
      sessionStorage.setItem(dismissalKey(),dismissedSession);
      return enqueueUI(hideWindow);
    }
    await session.request("close");
    await uiWork;
  }

  async function setShared(enabled) {
    if (!game.user.isGM) throw Error("Seul le MJ peut changer le mode de la carte.");
    if (typeof enabled !== "boolean") throw TypeError("Le mode partagé doit être activé ou désactivé.");
    if (enabled === mode().shared) return;
    const next = {shared: enabled, epoch: foundry.utils.randomID(24)};
    const wasVisible = visible;
    preserveEpoch = wasVisible ? next.epoch : null;
    try {
      await game.settings.set(game.system.id, SETTING, next);
      await changeMode(next);
      if (enabled && wasVisible && mode().epoch === next.epoch) await open();
    } finally {
      if (preserveEpoch === next.epoch) preserveEpoch = null;
    }
  }

  return {
    open, close, setShared, ready:start,
    get shared() { return mode().shared; },
    get sharedOpen() { return !!session?.state.open&&session.state.sessionId!==dismissedSession; },
  };
}
