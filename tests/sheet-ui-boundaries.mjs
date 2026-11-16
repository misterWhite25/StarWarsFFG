// These document tests exercise context/form logic, without starting visual controls or global UI hooks.
const noop = () => {};
export const sheetUiBoundaries = {
  'helpers/actor-camp-sheet.mjs': {renderActorCampField: noop},
  'helpers/auto-crew-ui.mjs': {activateAutoCrew: noop},
  'helpers/dice-helpers.js': {default: {addSkillDicePool: noop}},
  'helpers/ground-movement-sheet.mjs': {prepareGroundMovement: noop},
  'helpers/reviewed-talent-ui.js': {renderReviewedTalentControls: noop},
  'helpers/combat-sheet.mjs': {prepareCombatSheet: noop, fitCombatSheet: noop, resizeActorSheet: noop, setCombatSheetMode: noop},
  'helpers/character-vehicles.mjs': {},
};
