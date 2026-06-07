/**
 * SIKBootstrap.ts — Lens Studio 5.x / Spectacles 2024
 *
 * Instantiates the SpectaclesInteractionKit prefab at scene start so
 * Interactable / PinchButton components receive hand and mouse input.
 */

@component
export class SIKBootstrap extends BaseScriptComponent {

  @input
  sikPrefab: ObjectPrefab;

  private spawned: boolean = false;

  onAwake() {
    const delay = this.createEvent('DelayedCallbackEvent');
    delay.bind(() => this.spawnSIK());
    delay.reset(0.25);
  }

  private spawnSIK() {
    if (this.spawned) {
      return;
    }

    if (!this.sikPrefab) {
      print('SIKBootstrap: assign SpectaclesInteractionKit prefab from Packages/SpectaclesInteractionKit');
      return;
    }

    try {
      const instance = this.sikPrefab.instantiate(null);
      if (!instance) {
        print('SIKBootstrap: failed to instantiate SpectaclesInteractionKit');
        return;
      }

      instance.name = 'SpectaclesInteractionKit';
      this.spawned = true;
      print('SIKBootstrap: SpectaclesInteractionKit ready');
    } catch (e) {
      print('SIKBootstrap: spawn failed — drag SpectaclesInteractionKit.prefab from Packages into the scene instead');
    }
  }
}
