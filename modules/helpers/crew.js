import {malfunctionNavigation} from './vehicle-malfunction-engine.js';
import {assignArmedCrew,isGunner,parseCrewSelections,crewWeaponChoices} from './crew-gunners.mjs';
import {editVehicleCrew} from './crew-assignments.mjs';
const { DialogV2 } = foundry.applications.api;
import DiceHelpers, {get_dice_pool} from "./dice-helpers.js";
import {DicePoolFFG} from "../dice/pool.js";

/**
 * Capture a drag-and-drop event (used to capture adding crew members via a flag)
 * @param args - actor receiving the event, actor being dropped onto the recipient, ID of the actor being dropped on
 * @returns args - the input args (unmodified)
 */
export async function register_crew(...args) {
    CONFIG.logger.debug("Got possible register crew request");
    // check if this is an actor being dragged onto a vehicle
    let vehicle_actor;
    if (args[1].token) {
      // this is a token, not a real actor
      vehicle_actor = args[1].token?.actor;
      if (!vehicle_actor) {
        CONFIG.logger.debug("Not registering crew as entity is a token without a matching actor");
      }
    } else {
      vehicle_actor = args[0];
    }
    if (vehicle_actor?.type !== 'vehicle' || args[2].type !== 'Actor') {
        // the target is not a vehicle or the actor being dragged onto it is a vehicle
        CONFIG.logger.debug("Not registering crew as item is not an actor or the target is not a vehicle");
        return args;
    }
    let drag_actor = null;
    if (Object.hasOwn(args[2], 'uuid')) {
        drag_actor = game.actors.get(args[2].uuid.split('.').pop());
    } else {
        drag_actor = game.actors.get(args[2].id);
    }
    if (!drag_actor || drag_actor.type === 'vehicle') {
      CONFIG.logger.debug("Not registering crew as item is a vehicle");
      return args;
    }

    // prompt the user to select roles
    await selectRoles(vehicle_actor, drag_actor.id);
    return args;
}

/**
 * Remove a crew member + role pair from an actor
 * @param vehicle_actor actor object of the vehicle receiving the crew change
 * @param crew_member actor ID of the crew being changed
 * @param crew_role role of the crew to remove
 */
export function deregister_crew(vehicle_actor, crew_member, crew_role) {
    CONFIG.logger.debug("Got deregister crew request");
    return editVehicleCrew(vehicle_actor, crew => crew.filter(entry =>
      entry.actor_id !== crew_member || entry.role !== crew_role));
}

/**
 *
 * @param vehicle_actor actor object of the vehicle receiving the crew change
 * @param crew_member actor ID of the crew being changed
 * @param old_crew_role old role of the crew member
 * @param new_crew_role new role of the crew member
 */
export async function change_role(vehicle_actor, crew_member, old_crew_role, new_crew_role) {
  return editVehicleCrew(vehicle_actor, async crew => {
    if (!crew.some(e => e.actor_id === crew_member && e.role === old_crew_role)) return null;
    if (crew.some(e => e.actor_id === crew_member && e.role === new_crew_role)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.Crew.Role.Duplicate"));
      return null;
    }
    const member = game.actors.get(crew_member);
    if (!member) return null;
    const roles = crew.filter(e => e.actor_id === crew_member).map(e => e.role === old_crew_role ? new_crew_role : e.role);
    const link = crew.find(e => e.actor_id === crew_member)?.link ?? null;
    return await assignArmedCrew(vehicle_actor, crew, member, roles, link);
  });
}

/**
 * Set the roles of a crew member on a vehicle to a new array of roles (deleting any not in the new array)
 * @param vehicle_actor - actor object of the vehicle receiving the crew change
 * @param crew_member_id - actor ID of the crew member being changed
 * @param new_crew_roles - array of new roles for the crew member
 * @returns {Promise<void>}
 */
export async function updateRoles(vehicle_actor, crew_member_id, new_crew_roles) {
  const gunnerRole = game.settings.get('starwarsffg', 'arrayCrewRoles').find(r => isGunner(r.role_name))?.role_name ?? 'Gunner';
  const selection = parseCrewSelections(new_crew_roles, gunnerRole);
  if (!selection.valid) {ui.notifications.warn(game.i18n.localize('SWFFG.Crew.WeaponAssignment.OneWeapon'));return;}
  const roles = selection.roles;
  return editVehicleCrew(vehicle_actor, async crew => {
    const member = game.actors.get(crew_member_id);
    if (!member) return null;
    const link = await foundry.applications.ux.TextEditor.enrichHTML(member.link) || null;
    return await assignArmedCrew(vehicle_actor, crew, member, roles, link, {weaponId:selection.weaponId});
  });
}

/**
 * Create a string representation of a skill check for a crew member in a particular role on a vehicle
 * @param vehicle actor object for the vehicle the crew is on
 * @param crew_id actor ID of the crew member
 * @param crew_role role of the actor (used to determine which skill to use)
 * @returns {string|boolean} a string representation of HTML for the dice in the roll
 */
export function build_crew_roll(vehicle, crew_id, crew_role) {
  // look up the sheet for passing to the roller
  const crew_member = game.actors.get(crew_id);
  const vehicle_actor = game.actors.get(vehicle);
  if (crew_member === undefined) {
    ui.notifications.warn(game.i18n.localize("SWFFG.Crew.Actor.Removed"));
    deregister_crew(vehicle_actor, crew_id, crew_role);
    return false;
  }
  if (crew_role === "Pilot" || crew_role === "Co-Pilot") {
    return buildPilotRoll(vehicle_actor, crew_id).renderPreview().innerHTML;
  }
  const starting_pool = {'difficulty': 0};
  const registeredRoles = game.settings.get('starwarsffg', 'arrayCrewRoles');
  // don't attempt to draw a roll for the initiative role
  const initiativeRole = game.settings.get('starwarsffg', 'initiativeCrewRole');
  if (crew_role === initiativeRole.role_name) {
    return false;
  }
  // look up the defined metadata for the assigned role
  const role_info = registeredRoles.filter(i => i.role_name === crew_role);
  // validate the role still exists in our settings
  if (role_info.length === 0) {
    ui.notifications.warn(game.i18n.localize("SWFFG.Crew.Role.Removed"));
    return false;
  }
  // validate that it's a valid role
  if (role_info[0].role_skill === undefined) {
    ui.notifications.warn(game.i18n.localize("SWFFG.Crew.Role.Invalid"));
    return false;
  }
  if (crew_role === "Pilot") {
    return buildPilotRoll(vehicle_actor, crew_id).renderPreview().innerHTML;
  }
  // check if the pool uses handling
  if (role_info[0].use_handling) {
    const handling = vehicle_actor?.system?.stats?.handling?.value;
    // add modifiers from the vehicle handling
    if (handling > 0) {
      starting_pool['boost'] = handling;
    } else if (handling < 0) {
      starting_pool['setback'] = handling * -1;
    }
  }
  let pool = new DicePoolFFG(starting_pool);
  pool = get_dice_pool(crew_id, role_info[0].role_skill, pool);
  return pool.renderPreview().innerHTML;
}

/** Dangerous terrain: current speed versus half silhouette (rounded up).
 * Specific actions can override this default difficulty in the roll dialog.
 */
export function getPilotDifficulty(vehicle) {
  const count = value => Math.max(0, Math.floor(Number(value) || 0));
  const speed = count(vehicle?.system?.stats?.speed?.value);
  const silhouette = Math.ceil(count(vehicle?.system?.stats?.silhouette?.value) / 2);
  const challenge = Math.min(speed, silhouette);
  return {difficulty: Math.max(speed, silhouette) - challenge, challenge};
}

/**
 * Build the dice pool for the built-in piloting check, which automatically resolves the correct piloting skill
 * @param vehicle_id - the vehicle actor object
 * @param pilot_id - the actor ID of the pilot
 * @param difficulty - the difficulty of the check (omit to calculate from current speed and silhouette)
 * @returns {Promise<Window.DicePoolFFG>}
 */
export function buildPilotRoll(vehicle_id, pilot_id, difficulty) {
  const vehicle = typeof vehicle_id === "string" ? game.actors.get(vehicle_id) : vehicle_id;
  const starting_pool = difficulty === undefined
    ? getPilotDifficulty(vehicle)
    : {difficulty};
  const skillTheme = game.settings.get("starwarsffg", "skilltheme");

  // add modifiers from the vehicle handling
  const handling = vehicle?.system?.stats?.handling?.value;
  if (handling > 0) {
    starting_pool['boost'] = handling;
  } else if (handling < 0) {
    starting_pool['setback'] = handling * -1;
  }

  // create the dice pool
  let pool = new DicePoolFFG(starting_pool);

  // determine if the vehicle is land or space
  let skill;
  if (vehicle?.system?.spaceShip) {
    if (skillTheme === "starwars") {
      skill = "Piloting: Space";
    } else {
      skill = "Piloting";
    }
  } else {
    if (skillTheme === "starwars") {
      skill = "Piloting: Planetary";
    } else {
      skill = "Driving";
    }
  }

  // update the pool with actor information
  pool = get_dice_pool(pilot_id, skill, pool);
  pool.upgradeDifficulty(malfunctionNavigation(vehicle).pilotUpgrade);
  return pool;
}

/**
 * Create the dice pool and dialog window for the built-in piloting check
 * @param vehicle - the vehicle actor object
 * @param pilot_id - the actor ID of the pilot
 * @returns {Promise<void>}
 */
export async function handlePilotCheck(vehicle, pilot_id, role = "Pilot") {
  const crewSheet = game.actors.get(pilot_id)?.sheet;
  if (!crewSheet) {
    ui.notifications.warn(game.i18n.localize("SWFFG.Crew.Actor.Removed"));
    return;
  }
  const pool = await buildPilotRoll(vehicle, pilot_id);

  // create chat card data
  const card_data = {
    "crew": {
      "name": vehicle.name,
      "img": vehicle.img,
      "crew_card": true,
      "role": role,
    }
  };

  // determine if the vehicle is land or space
  let skill;
  if (vehicle?.system?.spaceShip) {
    skill = "Piloting: Space";
  } else {
    skill = "Piloting: Planetary";
  }

  // open the roll dialog (skill name is already localized)
  await DiceHelpers.displayRollDialog(
    crewSheet,
    pool,
    `${game.i18n.localize("SWFFG.Rolling")} ${skill}`,
    skill,
    card_data
  );
}

export async function selectRoles(vehicle, crew_member_id) {
  const crew_member = game.actors.get(crew_member_id);
  const registeredRoles = game.settings.get('starwarsffg', 'arrayCrewRoles');
  const vehicleRoles = vehicle.getFlag('starwarsffg', 'crew') || [];

  const crewMemberRoles = vehicleRoles.filter(role => role.actor_id === crew_member_id);
  const weapons = crewWeaponChoices(vehicleRoles, vehicle.items, crew_member_id).map(w => ({...w,label:game.i18n.localize('SWFFG.Crew.WeaponAssignment.Gunner')+' - '+w.name+' ('+(w.occupant ? game.i18n.format('SWFFG.Crew.WeaponAssignment.Occupied',{name:w.occupant}) : game.i18n.localize('SWFFG.Crew.WeaponAssignment.Free'))+')'}));
  const rolesInUse = crewMemberRoles.filter(r => !isGunner(r.role)).map(r => r.role).concat(weapons.filter(w => w.selected).map(w => w.value));

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/starwarsffg/templates/dialogs/ffg-crew-change.html",
    {
      actor: crew_member,
      roles: registeredRoles.filter(role => !isGunner(role.role_name)),
      weapons,
      rolesInUse: rolesInUse,
    }
  );

  const trustedContent = document.createElement("div");
  trustedContent.innerHTML = content;
  await DialogV2.prompt({
    window: {title: game.i18n.localize("SWFFG.Crew.Title")},
    content: trustedContent,
    ok: {
      label: game.i18n.localize("SWFFG.Crew.Role.Update"),
      callback: async (_event, _button, dialog) => {
        if (!vehicle.isOwner || !vehicle.verifyEditModeIsNotEnabled()) return;
        const newRoles = $(dialog.element).find('[name="select-many-things"]').val();
        await updateRoles(vehicle, crew_member_id, newRoles);
      },
    },
  });
}

/** Optional weapon station restrictions. No selected station preserves legacy access. */
export function hasWeaponCrewAccess(weapon) {
  const access = weapon?.flags?.starwarsffg?.weaponCrew;
  return ["pilot", "copilot", "gunner"].some(key => access?.[key] === true);
}

export function canCrewUseWeapon(weapon, role) {
  if (!hasWeaponCrewAccess(weapon)) return true;
  const normalized = String(role ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const key = {pilot:"pilot", pilote:"pilot", copilot:"copilot", copilote:"copilot", gunner:"gunner", artilleur:"gunner"}[normalized];
  return Boolean(key && weapon.flags.starwarsffg.weaponCrew[key] === true);
}

export function weaponCrewCandidates(weapon, crew = [], skillRoles = [], navigation) {
  const shipState = navigation ?? (weapon.parent?.type === 'vehicle' ? malfunctionNavigation(weapon.parent) : null);
  if (shipState?.disabledWeapons.includes(weapon.id)) return [];
  const restricted = hasWeaponCrewAccess(weapon);
  const seen = new Set();
  return crew.filter(member => {
    if (isGunner(member.role) && (restricted || member.weapon_id) &&
      (!weapon.flags?.starwarsffg?.weaponCrew?.gunner || member.weapon_id !== (weapon.id ?? weapon._id))) return false;
    const allowed = restricted ? canCrewUseWeapon(weapon, member.role)
      : /^(gunner|artilleur)$/i.test(String(member.role).trim()) || skillRoles.some(role => role.role_name === member.role);
    if (!allowed || seen.has(member.actor_id)) return false;
    seen.add(member.actor_id);
    return true;
  });
}

/** Resolve station access identically from the crew row and from the weapon row. */
export function crewStationWeapons(vehicle, member, registeredRoles = [], navigation = malfunctionNavigation(vehicle)) {
  return vehicle.items.filter(weapon => weapon.type === "shipweapon" &&
    weaponCrewCandidates(weapon, [member], registeredRoles.filter(role =>
      role.role_skill === weapon.system?.skill?.value), navigation).length > 0);
}
