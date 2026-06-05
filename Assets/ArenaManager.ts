/**
 * ArenaManager.ts — Lens Studio 5.x / Spectacles 2024
 */

// @ts-ignore
const WorldQuery = require('LensStudio:WorldQueryModule');

// SIK stubbed out — hand tracking disabled for preview/testing
const SIK_Module = null;

export enum Phase {
  Home      = 'HOME',
  Calibrate = 'CALIBRATE',
  Design    = 'DESIGN',
  Ride      = 'RIDE',
}

export enum DesignTool {
  Path     = 'PATH',
  Cone     = 'CONE',
  Pole     = 'POLE',
  StopZone = 'STOP',
  Erase    = 'ERASE',
  Sequence = 'SEQUENCE',
}

export enum ObstacleType {
  Cone     = 'CONE',
  Pole     = 'POLE',
  StopZone = 'STOP',
}

interface Obstacle {
  id       : number;
  type     : ObstacleType;
  worldPos : vec3;
  sceneObj : SceneObject;
  seqNum   : number | null;
  done     : boolean;
}

export interface PresetObstacle {
  type : ObstacleType;
  u    : number;
  v    : number;
}

export interface PresetCourse {
  id          : string;
  name        : string;
  description : string;
  obstacles   : PresetObstacle[];
  sequence    : number[];
}

export const PRESET_COURSES: PresetCourse[] = [
  {
    id          : 'serpentine',
    name        : 'Serpentine',
    description : '5 cones in a weaving line',
    obstacles   : [
      { type: ObstacleType.Cone, u: 0.20, v: 0.25 },
      { type: ObstacleType.Cone, u: 0.50, v: 0.35 },
      { type: ObstacleType.Cone, u: 0.80, v: 0.25 },
      { type: ObstacleType.Cone, u: 0.50, v: 0.65 },
      { type: ObstacleType.Cone, u: 0.20, v: 0.75 },
    ],
    sequence: [0, 1, 2, 3, 4],
  },
  {
    id          : 'figure_eight',
    name        : 'Figure Eight',
    description : 'Two loops around centre cones',
    obstacles   : [
      { type: ObstacleType.Cone, u: 0.50, v: 0.50 },
      { type: ObstacleType.Cone, u: 0.25, v: 0.25 },
      { type: ObstacleType.Cone, u: 0.75, v: 0.25 },
      { type: ObstacleType.Cone, u: 0.75, v: 0.75 },
      { type: ObstacleType.Cone, u: 0.25, v: 0.75 },
    ],
    sequence: [0, 1, 2, 0, 3, 4, 0],
  },
  {
    id          : 'gymnastic_grid',
    name        : 'Gymnastic Grid',
    description : '4 poles with a stop zone at the end',
    obstacles   : [
      { type: ObstacleType.Pole,     u: 0.25, v: 0.50 },
      { type: ObstacleType.Pole,     u: 0.40, v: 0.50 },
      { type: ObstacleType.Pole,     u: 0.55, v: 0.50 },
      { type: ObstacleType.Pole,     u: 0.70, v: 0.50 },
      { type: ObstacleType.StopZone, u: 0.85, v: 0.50 },
    ],
    sequence: [0, 1, 2, 3, 4],
  },
  {
    id          : 'corner_diamonds',
    name        : 'Corner Diamonds',
    description : 'Cones at each corner and centre',
    obstacles   : [
      { type: ObstacleType.Cone, u: 0.15, v: 0.15 },
      { type: ObstacleType.Cone, u: 0.85, v: 0.15 },
      { type: ObstacleType.Cone, u: 0.50, v: 0.50 },
      { type: ObstacleType.Cone, u: 0.85, v: 0.85 },
      { type: ObstacleType.Cone, u: 0.15, v: 0.85 },
    ],
    sequence: [0, 1, 2, 3, 4],
  },
];

@component
export class ArenaManager extends BaseScriptComponent {

  @input arenaRoot          : SceneObject;
  @input horseMarker        : SceneObject;
  @input cornerMarkerPrefab : ObjectPrefab;
  @input pathNodePrefab     : ObjectPrefab;
  @input conePrefab         : ObjectPrefab;
  @input polePrefab         : ObjectPrefab;
  @input stopZonePrefab     : ObjectPrefab;
  @input arrowPrefab        : ObjectPrefab;
  @input pathLinePrefab     : ObjectPrefab;
  @input uiManager          : SceneObject;
  @input matPending         : Material;
  @input matCurrent         : Material;
  @input matDone            : Material;

  private phase         : Phase      = Phase.Home;
  private designTool    : DesignTool = DesignTool.Path;
  private pendingPreset : PresetCourse | null = null;

  private corners       : vec3[]        = [];
  private cornerMarkers : SceneObject[] = [];
  private hitTestSession: any;

  private arenaCenter   : vec3 = vec3.zero();
  private arenaNormal   : vec3 = new vec3(0, 1, 0);

  private pathPoints    : vec3[]        = [];
  private pathNodes     : SceneObject[] = [];
  private pathSegments  : SceneObject[] = [];
  private obstacles     : Obstacle[]    = [];
  private nextObsId     : number        = 0;
  private sequence      : number[]      = [];

  private currentSeqIdx : number = 0;
  private score         : number = 0;
  private arrowObj      : SceneObject | null = null;

  private updateEvent   : SceneEvent;
  private pinchDetected : boolean = false;

  onAwake() {
    try {
      this.hitTestSession = WorldQuery.createHitTestSessionWithConfig({ filter: 1 });
    } catch (e) {}

    this.updateEvent = this.createEvent('UpdateEvent');
    this.updateEvent.bind(() => this.onUpdate());

    this.phase = Phase.Home;
    this.notifyUI();
  }

  private onUpdate() {
    try {
      if (SIK_Module) {
        const SIK  = (SIK_Module as any).SIK;
        const hand = SIK.HandInputData.getDominantHand();
        const isPinching = hand.isPinching();
        if (isPinching && !this.pinchDetected) {
          this.pinchDetected = true;
          this.onPinch(hand);
        } else if (!isPinching) {
          this.pinchDetected = false;
        }
      }
    } catch (e) {}

    if (this.phase === Phase.Ride) this.rideUpdate();
  }

  private onPinch(hand: any) {
    if (this.phase === Phase.Home) return;
    try {
      const pinchPos = hand.getPinchCenter();
      const downDir  = new vec3(0, -1, 0);
      this.hitTestSession.hitTest(pinchPos, pinchPos.add(downDir), (result: any) => {
        if (!result) return;
        const worldPos = result.position;
        if (this.phase === Phase.Calibrate) this.calibrateAddCorner(worldPos);
        else if (this.phase === Phase.Design) this.designHandlePinch(worldPos);
      });
    } catch (e) {}
  }

  startDrawCourse() {
    this.pendingPreset = null;
    this.phase = Phase.Calibrate;
    this.notifyUI({ cornerCount: 0 });
  }

  openCourseChooser() {
    this.notifyUI({ presets: PRESET_COURSES });
  }

  selectPreset(presetId: string) {
    const preset = PRESET_COURSES.find(p => p.id === presetId) ?? null;
    this.pendingPreset = preset;
    if (preset) {
      this.phase = Phase.Calibrate;
      this.notifyUI({ cornerCount: 0, flash: preset.name + ' loaded — place your 4 corners' });
    }
  }

  private calibrateAddCorner(pos: vec3) {
    if (this.corners.length >= 4) return;
    this.corners.push(pos);
    const marker = this.cornerMarkerPrefab.instantiate(this.arenaRoot);
    marker.getTransform().setWorldPosition(pos);
    this.cornerMarkers.push(marker);
    this.notifyUI({ cornerCount: this.corners.length });
    if (this.corners.length === 4) this.computeArenaPlane();
  }

  private computeArenaPlane() {
    const [a, b, c, d] = this.corners;
    this.arenaCenter = new vec3(
      (a.x+b.x+c.x+d.x)/4,
      (a.y+b.y+c.y+d.y)/4,
      (a.z+b.z+c.z+d.z)/4
    );
    const diag1 = c.sub(a);
    const diag2 = d.sub(b);
    this.arenaNormal = diag1.cross(diag2).normalize();
    if (this.arenaNormal.y < 0) this.arenaNormal = this.arenaNormal.uniformScale(-1);
    this.drawArenaFence();
  }

  private drawArenaFence() {
    const pts = [...this.corners, this.corners[0]];
    for (let i = 0; i < pts.length - 1; i++) this.spawnSegment(pts[i], pts[i+1]);
  }

  confirmCalibration() {
    if (this.corners.length < 4) return;
    this.phase = Phase.Design;
    if (this.pendingPreset) {
      this.spawnPreset(this.pendingPreset);
      this.pendingPreset = null;
    }
    this.notifyUI();
  }

  undoCorner() {
    if (this.corners.length === 0) return;
    this.corners.pop();
    const m = this.cornerMarkers.pop();
    if (m) m.destroy();
    this.notifyUI({ cornerCount: this.corners.length });
  }

  resetCalibration() {
    this.corners = [];
    this.cornerMarkers.forEach(m => m.destroy());
    this.cornerMarkers = [];
    this.phase = Phase.Calibrate;
    this.notifyUI({ cornerCount: 0 });
  }

  goHome() {
    this.resetDesign();
    this.resetCalibration();
    this.pendingPreset = null;
    this.phase = Phase.Home;
    this.notifyUI();
  }

  private arenaUVtoWorld(u: number, v: number): vec3 {
    const [c0, c1, c2, c3] = this.corners;
    const top    = c0.add(c1.sub(c0).uniformScale(u));
    const bottom = c3.add(c2.sub(c3).uniformScale(u));
    return top.add(bottom.sub(top).uniformScale(v));
  }

  private spawnPreset(preset: PresetCourse) {
    this.resetDesign();
    preset.obstacles.forEach(def => {
      this.addObstacleAt(def.type, this.arenaUVtoWorld(def.u, def.v));
    });
    this.sequence = preset.sequence
      .filter(idx => idx < this.obstacles.length)
      .map(idx => this.obstacles[idx].id);
    this.reindexSequence();
    this.updateObstacleLabels();
    this.notifyUI({ obstacleCount: this.obstacles.length, sequence: this.sequence });
  }

  setDesignTool(tool: DesignTool) {
    this.designTool = tool;
    this.notifyUI({ tool });
  }

  private designHandlePinch(worldPos: vec3) {
    const pos = this.projectOntoArenaPlane(worldPos);
    switch (this.designTool) {
      case DesignTool.Path:     this.addPathPoint(pos);                         break;
      case DesignTool.Cone:     this.addObstacleAt(ObstacleType.Cone,     pos); break;
      case DesignTool.Pole:     this.addObstacleAt(ObstacleType.Pole,     pos); break;
      case DesignTool.StopZone: this.addObstacleAt(ObstacleType.StopZone, pos); break;
      case DesignTool.Erase:    this.eraseNearestObstacle(pos);                 break;
      case DesignTool.Sequence: this.toggleSequence(pos);                       break;
    }
  }

  private projectOntoArenaPlane(pos: vec3): vec3 {
    const dist = pos.sub(this.arenaCenter).dot(this.arenaNormal);
    return pos.sub(this.arenaNormal.uniformScale(dist));
  }

  private addPathPoint(pos: vec3) {
    this.pathPoints.push(pos);
    const node = this.pathNodePrefab.instantiate(this.arenaRoot);
    node.getTransform().setWorldPosition(pos.add(this.arenaNormal.uniformScale(0.01)));
    this.pathNodes.push(node);
    if (this.pathPoints.length >= 2) {
      this.pathSegments.push(this.spawnSegment(this.pathPoints[this.pathPoints.length-2], pos));
    }
  }

  clearPath() {
    this.pathNodes.forEach(n => n.destroy());
    this.pathSegments.forEach(s => s.destroy());
    this.pathNodes = []; this.pathSegments = []; this.pathPoints = [];
  }

  private addObstacleAt(type: ObstacleType, pos: vec3) {
    let prefab: ObjectPrefab;
    switch (type) {
      case ObstacleType.Cone:     prefab = this.conePrefab;     break;
      case ObstacleType.Pole:     prefab = this.polePrefab;     break;
      case ObstacleType.StopZone: prefab = this.stopZonePrefab; break;
      default: return;
    }
    const obj = prefab.instantiate(this.arenaRoot);
    obj.getTransform().setWorldPosition(pos.add(this.arenaNormal.uniformScale(0.01)));
    const obs: Obstacle = { id: this.nextObsId++, type, worldPos: pos, sceneObj: obj, seqNum: null, done: false };
    this.obstacles.push(obs);
    this.notifyUI({ obstacleCount: this.obstacles.length });
  }

  private eraseNearestObstacle(pos: vec3) {
    let closest: Obstacle | null = null;
    let minDist = 0.4;
    this.obstacles.forEach(o => { const d = pos.distance(o.worldPos); if (d < minDist) { minDist = d; closest = o; } });
    if (!closest) return;
    this.sequence = this.sequence.filter(id => id !== (closest as Obstacle).id);
    this.reindexSequence();
    (closest as Obstacle).sceneObj.destroy();
    this.obstacles = this.obstacles.filter(o => o.id !== (closest as Obstacle).id);
    this.notifyUI({ obstacleCount: this.obstacles.length, sequence: this.sequence });
  }

  private toggleSequence(pos: vec3) {
    let closest: Obstacle | null = null;
    let minDist = 0.5;
    this.obstacles.forEach(o => { const d = pos.distance(o.worldPos); if (d < minDist) { minDist = d; closest = o; } });
    if (!closest) return;
    const c = closest as Obstacle;
    const idx = this.sequence.indexOf(c.id);
    if (idx >= 0) { this.sequence.splice(idx, 1); c.seqNum = null; }
    else { this.sequence.push(c.id); }
    this.reindexSequence();
    this.updateObstacleLabels();
    this.notifyUI({ sequence: this.sequence });
  }

  private reindexSequence() {
    this.sequence.forEach((id, i) => { const o = this.obstacles.find(o => o.id === id); if (o) o.seqNum = i+1; });
    this.obstacles.forEach(o => { if (!this.sequence.includes(o.id)) o.seqNum = null; });
  }

  private updateObstacleLabels() {
    this.obstacles.forEach(obs => {
      const labelObj = obs.sceneObj.getChild(0);
      if (!labelObj) return;
      const text = labelObj.getComponent('Text') as Text;
      if (text) text.text = obs.seqNum !== null ? String(obs.seqNum) : '';
    });
  }

  private spawnSegment(a: vec3, b: vec3): SceneObject {
    const mid = a.add(b).uniformScale(0.5);
    const seg  = this.pathLinePrefab.instantiate(this.arenaRoot);
    const t    = seg.getTransform();
    t.setWorldPosition(mid.add(this.arenaNormal.uniformScale(0.01)));
    const dir = b.sub(a);
    t.setWorldRotation(quat.lookAt(dir.normalize(), this.arenaNormal));
    t.setWorldScale(new vec3(0.02, 0.02, dir.length));
    return seg;
  }

  resetDesign() {
    this.clearPath();
    this.obstacles.forEach(o => o.sceneObj.destroy());
    this.obstacles = []; this.sequence = []; this.nextObsId = 0;
    this.notifyUI({ obstacleCount: 0, sequence: [] });
  }

  startRide() {
    if (this.sequence.length === 0 && this.obstacles.length > 0) {
      this.notifyUI({ error: 'Set obstacle order first' });
      return;
    }
    this.phase = Phase.Ride;
    this.currentSeqIdx = 0; this.score = 0;
    this.obstacles.forEach(o => { o.done = false; this.setObstacleState(o, 'pending'); });
    this.highlightCurrentTarget();
    if (this.arrowPrefab && !this.arrowObj) this.arrowObj = this.arrowPrefab.instantiate(this.arenaRoot);
    this.notifyUI({ phase: Phase.Ride, score: 0, currentIdx: 0, total: this.sequence.length });
  }

  stopRide() {
    this.phase = Phase.Design;
    if (this.arrowObj) { this.arrowObj.destroy(); this.arrowObj = null; }
    this.obstacles.forEach(o => this.setObstacleState(o, 'pending'));
    this.notifyUI({ phase: Phase.Design });
  }

  resetRide() {
    this.currentSeqIdx = 0; this.score = 0;
    this.obstacles.forEach(o => { o.done = false; this.setObstacleState(o, 'pending'); });
    this.highlightCurrentTarget();
    this.notifyUI({ score: 0, currentIdx: 0 });
  }

  private rideUpdate() {
    try {
      if (this.horseMarker) {
        const pos = this.horseMarker.getTransform().getWorldPosition();
        const riderPos = this.projectOntoArenaPlane(pos);
        this.checkProximity(riderPos);
        this.updateArrow(riderPos);
      }
    } catch (e) {}
  }

  private checkProximity(riderPos: vec3) {
    if (this.currentSeqIdx >= this.sequence.length) return;
    const target = this.obstacles.find(o => o.id === this.sequence[this.currentSeqIdx]);
    if (!target || target.done) return;
    if (riderPos.distance(target.worldPos) < 0.6) {
      target.done = true; this.score++;
      this.setObstacleState(target, 'done');
      this.currentSeqIdx++;
      this.highlightCurrentTarget();
      const finished = this.currentSeqIdx >= this.sequence.length;
      this.notifyUI({ score: this.score, currentIdx: this.currentSeqIdx, total: this.sequence.length,
        flash: finished ? 'Course Complete! 🏆' : '✓ Obstacle done!' });
    }
  }

  private highlightCurrentTarget() {
    this.obstacles.forEach(o => { if (!o.done) this.setObstacleState(o, 'pending'); });
    if (this.currentSeqIdx >= this.sequence.length) return;
    const target = this.obstacles.find(o => o.id === this.sequence[this.currentSeqIdx]);
    if (target && !target.done) this.setObstacleState(target, 'current');
  }

  private setObstacleState(obs: Obstacle, state: 'pending'|'current'|'done') {
    const rmv = obs.sceneObj.getComponent('RenderMeshVisual') as RenderMeshVisual;
    if (!rmv) return;
    switch (state) {
      case 'pending': rmv.mainMaterial = this.matPending; break;
      case 'current': rmv.mainMaterial = this.matCurrent; break;
      case 'done':    rmv.mainMaterial = this.matDone;    break;
    }
  }

  private updateArrow(riderPos: vec3) {
    if (!this.arrowObj) return;
    if (this.currentSeqIdx >= this.sequence.length) { this.arrowObj.enabled = false; return; }
    const target = this.obstacles.find(o => o.id === this.sequence[this.currentSeqIdx]);
    if (!target) { this.arrowObj.enabled = false; return; }
    this.arrowObj.enabled = true;
    this.arrowObj.getTransform().setWorldPosition(riderPos.add(this.arenaNormal.uniformScale(0.4)));
    const flat = target.worldPos.sub(riderPos);
    const flatDir = flat.sub(this.arenaNormal.uniformScale(flat.dot(this.arenaNormal)));
    if (flatDir.length > 0.01) {
      this.arrowObj.getTransform().setWorldRotation(quat.lookAt(flatDir.normalize(), this.arenaNormal));
    }
  }

  private notifyUI(extra?: object) {
    if (!this.uiManager) return;
    try {
      const scripts = this.uiManager.getAllComponents() as any[];
      if (!scripts || scripts.length === 0) return;
      const ui = scripts[0];
      if (ui && typeof ui.onStateChanged === 'function') {
        ui.onStateChanged({
          phase: this.phase, cornerCount: this.corners.length,
          tool: this.designTool, obstacleCount: this.obstacles.length,
          sequence: this.sequence, score: this.score,
          currentIdx: this.currentSeqIdx, total: this.sequence.length,
          ...extra,
        });
      }
    } catch (e) {}
  }
}