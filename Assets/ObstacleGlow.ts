/**
 * ObstacleGlow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Equestrian Arena Trainer — Obstacle Glow / Ring Animator
 * Lens Studio 5.x / Spectacles (2024)
 *
 * Attach to each obstacle prefab root.
 * Call setState('pending' | 'current' | 'done') from ArenaManager.
 *
 * Expects:
 *   Child 0 — main mesh (RenderMeshVisual)
 *   Child 1 — ring/halo mesh (RenderMeshVisual), shown only when 'current'
 *   Child 2 — checkmark mesh, shown only when 'done'
 *   Child 3 — number Text SceneObject
 * ─────────────────────────────────────────────────────────────────────────────
 */

@component
export class ObstacleGlow extends BaseScriptComponent {

  @input ringMesh    : SceneObject;   // halo ring child
  @input checkMesh   : SceneObject;   // ✓ child
  @input numberLabel : SceneObject;   // sequence number text child

  @input glowFrequency: number = 2.4;
  @input glowAmplitude: number = 0.18;

  private state      : string = 'pending';
  private updateEvent: SceneEvent;
  private ringBase   : vec3;

  onAwake() {
    this.updateEvent = this.createEvent('UpdateEvent');
    this.updateEvent.bind(() => this.onUpdate());
    if (this.ringMesh) {
      this.ringBase  = this.ringMesh.getTransform().getLocalScale();
      this.ringMesh.enabled  = false;
    }
    if (this.checkMesh) this.checkMesh.enabled = false;
  }

  setState(s: 'pending' | 'current' | 'done') {
    this.state = s;
    if (this.ringMesh)  this.ringMesh.enabled  = (s === 'current');
    if (this.checkMesh) this.checkMesh.enabled = (s === 'done');
    if (this.numberLabel) this.numberLabel.enabled = (s !== 'done');
  }

  setSequenceNumber(n: number | null) {
    if (!this.numberLabel) return;
    const text = this.numberLabel.getComponent('Component.Text') as Text;
    if (!text) return;
    this.numberLabel.enabled = n !== null;
    if (n !== null) text.text = String(n);
  }

  private onUpdate() {
    if (this.state !== 'current' || !this.ringMesh) return;

    const pulse = 1.0 + Math.sin(getTime() * this.glowFrequency * Math.PI * 2) * this.glowAmplitude;
    this.ringMesh.getTransform().setLocalScale(new vec3(
      this.ringBase.x * pulse,
      this.ringBase.y,
      this.ringBase.z * pulse
    ));
  }
}
