export class TokenFFG extends foundry.canvas.placeables.Token {
  /** @override */
  _onClickLeft(event) {
    const result = super._onClickLeft(event);
    if (game.activeTool === 'select' && !event.shiftKey && this.controlled) {
      Hooks.callAll('ffgPilotageSceneTokenSelected', this.document);
    }
    return result;
  }

  /** @override */
  _onClickLeft2(event) {
    if (game.activeTool === 'select' && !event.shiftKey && ui.ffgCharacters?.showSceneToken(this.document)) {
      if (!this._propagateLeftClick(event)) event.stopPropagation();
      return;
    }
    return super._onClickLeft2(event);
  }

  /** @override */
  _refreshTurnMarker(wantMarkerActive=false) {
    
    // Should a Turn Marker be active?
    const {turnMarker} = this.document;
    const markersEnabled = CONFIG.Combat.settings.turnMarker.enabled
      && (turnMarker.mode !== CONST.TOKEN_TURN_MARKER_MODES.DISABLED);
    const combat = game.combat;
    const slot = combat?.combatant;
    const claimantId = slot && combat.getSlotClaims(combat.round, slot.id);
    const claimant = claimantId && combat.combatants.get(claimantId);
    if (markersEnabled && (wantMarkerActive || claimant?.token === this.document)) {
      if (!this.turnMarker) this.turnMarker = this.addChildAt(new foundry.canvas.placeables.tokens.TokenTurnMarker(this), 0);
      canvas.tokens.turnMarkers.add(this);
      this.turnMarker.draw();
    }
    else {
      // Remove a Turn Marker
      canvas.tokens.turnMarkers?.delete(this);
      this.turnMarker?.destroy();
      this.turnMarker = null;
    }
  }

  /** @override */
  _refreshSize() {
    this._refreshMeshSizeAndScale();

    // Adjust nameplate and tooltip positioning
    const {width, height} = this.document.getSize();

    this.nameplate.position.set(width / 2, height + 2);
    this.tooltip.position.set(width / 2, -2);

    // Adjust turn marker size (150% size by default);
    // fixes a bug where the default refreshSize does not check that this.turnMarker.mesh is defined
    if ( this.turnMarker && this.turnMarker.mesh ) {
      const mesh = this.turnMarker.mesh;
      mesh.width = mesh.height = this.externalRadius * 3;
    }
  }
}
