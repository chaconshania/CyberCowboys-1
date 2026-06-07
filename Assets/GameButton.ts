/**
 * GameButton.ts — Lens Studio 5.x / Spectacles 2024
 *
 * Interactive UI button with idle, hover, pressed, and optional active states.
 * Attach to the same SceneObject as Interactable + PinchButton.
 *
 * Expects an Image component on this object (or buttonImage input).
 * Clones the Image material so each button tints independently.
 */

import { Interactable } from 'SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable';
import { InteractorEvent } from 'SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent';
import animate from 'SpectaclesInteractionKit.lspkg/Utils/animate';

export enum GameButtonStyle {
  FilledYellow  = 0,
  OutlineYellow = 1,
}

type ButtonVisualState = 'idle' | 'hover' | 'pressed' | 'active' | 'disabled';

const STYLE_COLORS: Record<GameButtonStyle, Record<ButtonVisualState, vec4>> = {
  [GameButtonStyle.FilledYellow]: {
    idle:     new vec4(1.00, 1.00, 1.00, 1.00),
    hover:    new vec4(1.10, 1.05, 0.88, 1.00),
    pressed:  new vec4(0.86, 0.78, 0.52, 1.00),
    active:   new vec4(1.05, 0.98, 0.78, 1.00),
    disabled: new vec4(0.70, 0.68, 0.62, 0.45),
  },
  [GameButtonStyle.OutlineYellow]: {
    idle:     new vec4(1.00, 1.00, 1.00, 1.00),
    hover:    new vec4(1.18, 1.08, 0.82, 1.00),
    pressed:  new vec4(0.78, 0.74, 0.66, 1.00),
    active:   new vec4(1.22, 1.10, 0.78, 1.00),
    disabled: new vec4(0.55, 0.53, 0.50, 0.45),
  },
};

const STATE_SCALES: Record<ButtonVisualState, number> = {
  idle:     1.00,
  hover:    1.04,
  pressed:  0.96,
  active:   1.02,
  disabled: 1.00,
};

function lerpVec3(a: vec3, b: vec3, t: number): vec3 {
  return new vec3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
  );
}

function lerpVec4(a: vec4, b: vec4, t: number): vec4 {
  return new vec4(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
    a.w + (b.w - a.w) * t,
  );
}

@component
export class GameButton extends BaseScriptComponent {

  @input
  @widget(new ComboBoxWidget([
    new ComboBoxItem('Filled Yellow', 0),
    new ComboBoxItem('Outline Yellow', 1),
  ]))
  buttonStyle: number = GameButtonStyle.FilledYellow;

  @input
  @allowUndefined
  buttonImage: SceneObject;

  @input
  @allowUndefined
  visualRoot: SceneObject;

  @input
  supportsActiveState: boolean = false;

  @input
  hoverScale: number = 1.04;

  @input
  pressedScale: number = 0.96;

  @input
  animationDuration: number = 0.12;

  @input
  @allowUndefined
  colliderSize: vec3;

  @input
  colliderDepth: number = 5.0;

  @input
  @allowUndefined
  pressHandler: ScriptComponent;

  @input
  @allowUndefined
  pressHandlerMethod: string;

  private interactable       : Interactable | null = null;
  private touchActive        : boolean = false;
  private image              : Image | null = null;
  private buttonMaterial     : Material | null = null;
  private screenTransform    : ScreenTransform | null = null;
  private usesScreenTransform: boolean = false;
  private baseScale          : vec3 = new vec3(1, 1, 1);
  private isActive       : boolean = false;
  private isDisabled     : boolean = false;
  private isHovered      : boolean = false;
  private isPressed      : boolean = false;
  private animToken      : number = 0;

  onAwake() {
    this.ensureCollider();
    this.createEvent('TouchStartEvent').bind(() => this.onTouchStart());
    this.createEvent('TouchEndEvent').bind(() => this.onTouchEnd());
    this.createEvent('OnStartEvent').bind(() => this.init());
    this.createEvent('OnEnableEvent').bind(() => {
      if (this.isInitialized()) this.applyVisualState(this.resolveVisualState(), true);
    });
    this.createEvent('OnDisableEvent').bind(() => {
      if (this.isInitialized()) this.applyVisualState('disabled', true);
    });
  }

  setActive(active: boolean) {
    if (!this.supportsActiveState) return;
    this.isActive = active;
    if (this.isInitialized()) this.applyVisualState(this.resolveVisualState(), false);
  }

  setDisabled(disabled: boolean) {
    this.isDisabled = disabled;
    if (this.isInitialized()) this.applyVisualState(this.resolveVisualState(), false);
  }

  private init() {
    const root = this.visualRoot || this.getSceneObject();
    const imageObj = this.buttonImage || this.getSceneObject();
    this.captureBaseScale(root);
    this.image = imageObj.getComponent('Component.Image') as Image;

    if (!this.image) {
      print('GameButton: no Image component found on ' + imageObj.name);
      return;
    }

    const sourceMaterial = this.image.mainMaterial;
    if (!sourceMaterial) {
      print('GameButton: no material on ' + imageObj.name);
      return;
    }

    this.buttonMaterial = sourceMaterial.clone();
    this.image.mainMaterial = this.buttonMaterial;

    this.interactable = this.getSceneObject().getComponent(Interactable.getTypeName()) as Interactable;
    if (!this.interactable) {
      print('GameButton: Interactable required on ' + this.getSceneObject().name);
      return;
    }

    this.bindInteractable(this.interactable);
    this.applyVisualState(this.resolveVisualState(), true);
  }

  private bindInteractable(interactable: Interactable) {
    interactable.onHoverEnter.add((event: InteractorEvent) => {
      this.isHovered = true;
      this.isPressed = event.interactor.isTriggering;
      this.applyVisualState(this.resolveVisualState(), false);
    });
    interactable.onHoverExit.add(() => {
      this.isHovered = false;
      this.isPressed = false;
      this.applyVisualState(this.resolveVisualState(), false);
    });
    interactable.onTriggerStart.add(() => {
      this.isPressed = true;
      this.applyVisualState(this.resolveVisualState(), false);
    });
    interactable.onTriggerEnd.add(() => {
      this.isPressed = false;
      this.applyVisualState(this.isHovered ? 'hover' : this.resolveVisualState(), false);
    });
    interactable.onTriggerEndOutside.add(() => {
      this.isHovered = false;
      this.isPressed = false;
      this.applyVisualState(this.resolveVisualState(), false);
    });
    interactable.onTriggerCanceled.add(() => {
      this.isHovered = false;
      this.isPressed = false;
      this.applyVisualState(this.resolveVisualState(), false);
    });
  }

  private resolveVisualState(): ButtonVisualState {
    if (this.isDisabled) return 'disabled';
    if (this.isPressed) return 'pressed';
    if (this.isHovered) return 'hover';
    if (this.supportsActiveState && this.isActive) return 'active';
    return 'idle';
  }

  private applyVisualState(state: ButtonVisualState, instant: boolean) {
    if (!this.buttonMaterial) return;

    const style = this.buttonStyle as GameButtonStyle;
    const palette = STYLE_COLORS[style] || STYLE_COLORS[GameButtonStyle.FilledYellow];
    const targetColor = palette[state];
    const targetScale = this.scaleForState(state);

    if (instant || this.animationDuration <= 0) {
      this.buttonMaterial.mainPass.baseColor = targetColor;
      this.setVisualScale(targetScale);
      return;
    }

    const startColor = this.buttonMaterial.mainPass.baseColor;
    const startScale = this.getCurrentScale();
    const token = ++this.animToken;

    animate({
      duration: this.animationDuration,
      easing: 'ease-out-quad',
      update: (t: number) => {
        if (token !== this.animToken || !this.buttonMaterial) return;
        this.buttonMaterial.mainPass.baseColor = lerpVec4(startColor, targetColor, t);
        this.setVisualScale(lerpVec3(startScale, targetScale, t));
      },
      ended: () => {
        if (token !== this.animToken || !this.buttonMaterial) return;
        this.buttonMaterial.mainPass.baseColor = targetColor;
        this.setVisualScale(targetScale);
      },
    });
  }

  private scaleForState(state: ButtonVisualState): vec3 {
    let factor = STATE_SCALES[state];
    if (state === 'hover') factor = this.hoverScale;
    if (state === 'pressed') factor = this.pressedScale;
    return new vec3(
      this.baseScale.x * factor,
      this.baseScale.y * factor,
      this.baseScale.z * factor,
    );
  }

  private captureBaseScale(root: SceneObject) {
    this.screenTransform = root.getComponent('Component.ScreenTransform') as ScreenTransform;
    if (this.screenTransform) {
      this.usesScreenTransform = true;
      this.baseScale = this.screenTransform.scale;
      return;
    }
    this.baseScale = root.getTransform().getLocalScale();
  }

  private getCurrentScale(): vec3 {
    if (this.usesScreenTransform && this.screenTransform) {
      return this.screenTransform.scale;
    }
    return (this.visualRoot || this.getSceneObject()).getTransform().getLocalScale();
  }

  private setVisualScale(scale: vec3) {
    if (this.usesScreenTransform && this.screenTransform) {
      this.screenTransform.scale = scale;
      return;
    }
    (this.visualRoot || this.getSceneObject()).getTransform().setLocalScale(scale);
  }

  private isInitialized(): boolean {
    return this.buttonMaterial !== null;
  }

  private onTouchStart() {
    if (this.isDisabled) return;
    this.touchActive = true;
    this.isHovered = true;
    this.isPressed = true;
    if (this.isInitialized()) {
      this.applyVisualState('pressed', false);
    }
    this.invokePressHandler();
  }

  private onTouchEnd() {
    if (!this.touchActive) return;
    this.touchActive = false;
    this.isPressed = false;
    this.isHovered = false;
    if (this.isInitialized()) {
      this.applyVisualState('idle', false);
    }
  }

  private invokePressHandler() {
    if (!this.pressHandler || !this.pressHandlerMethod) return;
    const handler = this.pressHandler as any;
    const fn = handler[this.pressHandlerMethod];
    if (typeof fn === 'function') {
      fn.call(handler);
    }
  }

  private ensureCollider() {
    const obj = this.getSceneObject();
    let colliders = obj.getComponents('Physics.ColliderComponent') as ColliderComponent[];
    if (colliders.length === 0) {
      colliders = obj.getComponents('Component.ColliderComponent') as ColliderComponent[];
    }
    const collider = colliders.length > 0
      ? colliders[0]
      : obj.createComponent('Physics.ColliderComponent') as ColliderComponent;

    const size = this.getColliderSize();
    const shape = Shape.createBoxShape();
    shape.size = new vec3(size.x, size.y, size.z);
    collider.shape = shape;
    collider.intangible = false;
  }

  private getColliderSize(): vec3 {
    if (this.colliderSize && this.colliderSize.x > 0 && this.colliderSize.y > 0) {
      return new vec3(this.colliderSize.x, this.colliderSize.y, this.colliderDepth);
    }

    return this.estimateColliderSize();
  }

  private estimateColliderSize(): vec3 {
    const imageObj = this.buttonImage || this.getSceneObject();
    const image = imageObj.getComponent('Component.Image') as Image;
    const fitted = this.fittedImageSize(image);
    return new vec3(fitted.x, fitted.y, this.colliderDepth);
  }

  private fittedImageSize(image: Image | null): vec2 {
    const aspect = this.getImageAspect(image);
    const maxSize = 2;
    if (aspect >= 1) {
      return new vec2(maxSize, maxSize / aspect);
    }
    return new vec2(maxSize * aspect, maxSize);
  }

  private getImageAspect(image: Image | null): number {
    if (!image?.mainMaterial) {
      return 4;
    }

    try {
      const tex = image.mainMaterial.mainPass.baseTex as Texture;
      if (tex) {
        const w = tex.getWidth();
        const h = tex.getHeight();
        if (w > 0 && h > 0) {
          return w / h;
        }
      }
    } catch (e) {}

    return 4;
  }
}
