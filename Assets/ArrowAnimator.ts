/**
 * ArrowAnimator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Equestrian Arena Trainer — Floating Direction Arrow
 * Lens Studio 5.x / Spectacles (2024)
 *
 * Attach to the Arrow prefab root.
 * ArenaManager positions and rotates this object each frame.
 * This script handles the idle bob + pulse animation locally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

@component
export class ArrowAnimator extends BaseScriptComponent {

  @input bobAmplitude  : number = 0.04;  // metres up/down
  @input bobFrequency  : number = 1.8;   // Hz
  @input pulseAmplitude: number = 0.12;  // scale +/-
  @input pulseFrequency: number = 2.2;   // Hz

  private baseY    : number = 0;
  private baseScale: vec3;
  private t        : Transform;
  private updateEvent: SceneEvent;

  onAwake() {
    this.t         = this.getTransform();
    this.baseScale = this.t.getLocalScale();
    this.baseY     = this.t.getLocalPosition().y;

    this.updateEvent = this.createEvent('UpdateEvent');
    this.updateEvent.bind(() => this.onUpdate());
  }

  private onUpdate() {
    const time = getTime();

    // Bob up/down
    const pos = this.t.getLocalPosition();
    pos.y = this.baseY + Math.sin(time * this.bobFrequency * Math.PI * 2) * this.bobAmplitude;
    this.t.setLocalPosition(pos);

    // Pulse scale
    const pulse = 1.0 + Math.sin(time * this.pulseFrequency * Math.PI * 2) * this.pulseAmplitude;
    this.t.setLocalScale(new vec3(
      this.baseScale.x * pulse,
      this.baseScale.y * pulse,
      this.baseScale.z * pulse
    ));
  }
}
