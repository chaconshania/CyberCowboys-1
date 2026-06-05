/**
 * UIManager.ts — Lens Studio 5.x / Spectacles 2024
 */

import { ArenaManager, Phase, DesignTool, PresetCourse, PRESET_COURSES } from './ArenaManager';

const FLASH_DURATION = 1.8;

@component
export class UIManager extends BaseScriptComponent {

  @input arenaManagerObj  : SceneObject;
  @input panelHome        : SceneObject;
  @input panelCourseList  : SceneObject;
  @input panelCalibrate   : SceneObject;
  @input panelDesign      : SceneObject;
  @input panelRide        : SceneObject;

  @input txtInstruction   : Text;
  @input txtCornerCount   : Text;
  @input txtNextObs       : Text;
  @input txtScore         : Text;
  @input txtFlash         : Text;

  @input btnConfirmCorners: SceneObject;
  @input seqChipRoot      : SceneObject;
  @input seqChipPrefab    : ObjectPrefab;
  @input rideChipRoot     : SceneObject;
  @input courseCardPrefab : ObjectPrefab;
  @input courseCardRoot   : SceneObject;

  private am            : ArenaManager;
  private flashTimer    : number        = 0;
  private currentPhase  : Phase         = Phase.Home;
  private seqChips      : SceneObject[] = [];
  private rideChips     : SceneObject[] = [];
  private courseCards   : SceneObject[] = [];
  private updateEvent   : SceneEvent;

  onAwake() {
  try {
    const scripts = this.arenaManagerObj.getAllComponents() as any[];
    if (scripts && scripts.length > 0) {
      for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].startDrawCourse) {
          this.am = scripts[i] as any as ArenaManager;
          break;
        }
      }
    }
  } catch (e) {}

  this.updateEvent = this.createEvent('UpdateEvent');
  this.updateEvent.bind(() => this.onUpdate());

  this.showPanel(Phase.Home);
  if (this.btnConfirmCorners) this.btnConfirmCorners.enabled = false;
  if (this.panelCourseList)   this.panelCourseList.enabled  = false;
}

  private onUpdate() {
    if (this.flashTimer > 0) {
      this.flashTimer -= getDeltaTime();
      if (this.flashTimer <= 0 && this.txtFlash) {
        this.txtFlash.text = '';
        this.txtFlash.getSceneObject().enabled = false;
      }
    }
  }

  onStateChanged(state: any) {
    if (state.phase !== undefined && state.phase !== this.currentPhase) {
      this.currentPhase = state.phase;
      this.showPanel(state.phase);
    }
    if (state.presets !== undefined) {
      this.buildCourseCards(state.presets);
      if (this.panelCourseList) this.panelCourseList.enabled = true;
    }
    if (state.cornerCount !== undefined) this.setCornerCount(state.cornerCount);
    if (state.tool        !== undefined) this.setInstruction(this.instructionFor(state.tool));
    if (state.sequence    !== undefined) this.rebuildSeqChips(state.sequence);
    if (state.score       !== undefined && this.txtScore) this.txtScore.text = String(state.score);
    if (state.currentIdx  !== undefined && state.total !== undefined) {
      this.updateNextObsLabel(state.currentIdx, state.total);
      this.updateRideChips(state.currentIdx, state.total);
    }
    if (state.flash) this.showFlash(state.flash);
    if (state.error) this.showFlash(state.error);
  }

  private showPanel(phase: Phase) {
    if (this.panelHome)      this.panelHome.enabled      = phase === Phase.Home;
    if (this.panelCalibrate) this.panelCalibrate.enabled = phase === Phase.Calibrate;
    if (this.panelDesign)    this.panelDesign.enabled    = phase === Phase.Design;
    if (this.panelRide)      this.panelRide.enabled      = phase === Phase.Ride;
    if (phase !== Phase.Home && this.panelCourseList) this.panelCourseList.enabled = false;
  }

  private buildCourseCards(presets: PresetCourse[]) {
    this.courseCards.forEach(c => c.destroy());
    this.courseCards = [];
    if (!this.courseCardRoot || !this.courseCardPrefab) return;
    presets.forEach(preset => {
      const card = this.courseCardPrefab.instantiate(this.courseCardRoot);
      const nameText = card.getChild(0)?.getComponent('Text') as Text;
      if (nameText) nameText.text = preset.name;
      const descText = card.getChild(1)?.getComponent('Text') as Text;
      if (descText) descText.text = preset.description;
      this.courseCards.push(card);
    });
  }

  private setCornerCount(n: number) {
    if (this.txtCornerCount) this.txtCornerCount.text = n + ' / 4';
    if (this.btnConfirmCorners) this.btnConfirmCorners.enabled = n >= 4;
    const msgs = [
      'Pinch to place corner 1 of 4',
      'Pinch to place corner 2 of 4',
      'Pinch to place corner 3 of 4',
      'Pinch to place corner 4 of 4',
      'All 4 corners set — confirm or undo',
    ];
    this.setInstruction(msgs[Math.min(n, 4)]);
  }

  private setInstruction(msg: string) {
    if (this.txtInstruction) this.txtInstruction.text = msg;
  }

  private instructionFor(tool: DesignTool): string {
    const map: Record<string, string> = {
      PATH:     'Pinch points to draw your path',
      CONE:     'Pinch to place a cone',
      POLE:     'Pinch to place a ground pole',
      STOP:     'Pinch to place a pause zone',
      ERASE:    'Pinch an obstacle to remove it',
      SEQUENCE: 'Pinch obstacles to set their order',
    };
    return map[tool] || '';
  }

  private showFlash(msg: string) {
    if (!this.txtFlash) return;
    this.txtFlash.text = msg;
    this.txtFlash.getSceneObject().enabled = true;
    this.flashTimer = FLASH_DURATION;
  }

  private rebuildSeqChips(sequence: number[]) {
    this.seqChips.forEach(c => c.destroy());
    this.seqChips = [];
    if (!this.seqChipRoot || !this.seqChipPrefab) return;
    sequence.forEach((_, i) => {
      const chip = this.seqChipPrefab.instantiate(this.seqChipRoot);
      const text = chip.getComponent('Text') as Text;
      if (text) text.text = String(i + 1);
      this.seqChips.push(chip);
    });
  }

  private updateRideChips(currentIdx: number, total: number) {
    if (!this.rideChipRoot || !this.seqChipPrefab) return;
    if (this.rideChips.length !== total) {
      this.rideChips.forEach(c => c.destroy());
      this.rideChips = [];
      for (let i = 0; i < total; i++) {
        this.rideChips.push(this.seqChipPrefab.instantiate(this.rideChipRoot));
      }
    }
    this.rideChips.forEach((chip, i) => {
      const text = chip.getComponent('Text') as Text;
      if (!text) return;
      text.text = i < currentIdx ? '✓' : i === currentIdx ? '→' : String(i + 1);
    });
  }

  private updateNextObsLabel(currentIdx: number, total: number) {
    if (!this.txtNextObs) return;
    this.txtNextObs.text = currentIdx >= total ? 'Course complete!' : 'Next: #' + (currentIdx + 1) + ' →';
  }

  // ── Button callbacks ───────────────────────────────────────────────────────
  onBtnDrawCourse()     { if (this.am) this.am.startDrawCourse();   }
  onBtnChooseCourse()   { if (this.am) this.am.openCourseChooser(); }
  onBtnCourseListBack() { if (this.panelCourseList) this.panelCourseList.enabled = false; }

  onBtnCourseCard0()    { this.selectPresetByIndex(0); }
  onBtnCourseCard1()    { this.selectPresetByIndex(1); }
  onBtnCourseCard2()    { this.selectPresetByIndex(2); }
  onBtnCourseCard3()    { this.selectPresetByIndex(3); }

  private selectPresetByIndex(i: number) {
    const preset = PRESET_COURSES[i];
    if (!preset) return;
    if (this.panelCourseList) this.panelCourseList.enabled = false;
    if (this.am) this.am.selectPreset(preset.id);
  }

  onBtnUndoCorner()       { if (this.am) this.am.undoCorner();         }
  onBtnResetCalibration() { if (this.am) this.am.resetCalibration();   }
  onBtnConfirmCorners()   { if (this.am) this.am.confirmCalibration(); }
  onBtnCalibrateHome()    { if (this.am) this.am.goHome();             }

  onBtnToolPath()         { if (this.am) this.am.setDesignTool(DesignTool.Path);     }
  onBtnToolCone()         { if (this.am) this.am.setDesignTool(DesignTool.Cone);     }
  onBtnToolPole()         { if (this.am) this.am.setDesignTool(DesignTool.Pole);     }
  onBtnToolStop()         { if (this.am) this.am.setDesignTool(DesignTool.StopZone); }
  onBtnToolErase()        { if (this.am) this.am.setDesignTool(DesignTool.Erase);    }
  onBtnToolSequence()     { if (this.am) this.am.setDesignTool(DesignTool.Sequence); }

  onBtnClearPath()        { if (this.am) this.am.clearPath();        }
  onBtnResetDesign()      { if (this.am) this.am.resetDesign();      }
  onBtnBackToCalibrate()  { if (this.am) this.am.resetCalibration(); }

  onBtnStartRide()        { if (this.am) this.am.startRide();  }
  onBtnStopRide()         { if (this.am) this.am.stopRide();   }
  onBtnResetRide()        { if (this.am) this.am.resetRide();  }
}