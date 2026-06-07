/**
 * GameButton.ts — Lens Studio 5.x / Spectacles 2024
 *
 * Interactive UI button with idle, hover, pressed, and optional active states.
 * Attach to the button visual object. Interactable + PinchButton + Collider
 * can live on a child named "HitTarget" when using pivot-split layouts.
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

    this.interactable = this.findInteractable();
    if (!this.interactable) {
      print('GameButton: Interactable required on ' + this.getSceneObject().name);
      return;
    }

    this.bindInteractable(this.interactable);
    this.setupHitTarget();
    this.applyVisualState(this.resolveVisualState(), true);
  }

  private findInteractable(): Interactable | null {
    const hitTarget = this.getHitTargetChild();
    if (hitTarget) {
      const onChild = hitTarget.getComponent(Interactable.getTypeName()) as Interactable;
      if (onChild) {
        return onChild;
      }
    }
    return this.getSceneObject().getComponent(Interactable.getTypeName()) as Interactable;
  }

  private getHitTargetChild(): SceneObject | null {
    const parent = this.getSceneObject();
    const childCount = parent.getChildrenCount();
    for (let i = 0; i < childCount; i++) {
      const child = parent.getChild(i);
      if (child.name === 'HitTarget') {
        return child;
      }
    }
    return null;
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

  private setupHitTarget() {
    const parent = this.getSceneObject();
    const hitTarget = this.getHitTargetChild();
    const colliderObject = hitTarget || parent;

    this.removeColliders(parent);

    const st = this.screenTransform
      || parent.getComponent('Component.ScreenTransform') as ScreenTransform;
    const usesSplitHit = !!st && Math.abs(st.pivot.x) > 0.05;

    if (usesSplitHit && hitTarget) {
      this.positionSplitHitTarget(hitTarget, st);
      const fullSize = this.getScreenTransformColliderSize(st, parent);
      this.applyCollider(colliderObject, new vec3(
        fullSize.x * 0.5,
        fullSize.y,
        fullSize.z,
      ));
      return;
    }

    if (hitTarget) {
      hitTarget.getTransform().setLocalPosition(new vec3(0, 0, 0));
    }

    this.applyCollider(colliderObject, this.getColliderSize(st, parent));
  }

  private positionSplitHitTarget(hitTarget: SceneObject, st: ScreenTransform) {
    const isLeftVisual = st.pivot.x > 0;
    const localHitCenter = new vec2(isLeftVisual ? -0.5 : 0.5, 0);
    const worldHitCenter = st.localPointToWorldPoint(localHitCenter);
    const worldRectCenter = st.localPointToWorldPoint(new vec2(0, 0));
    const worldOffset = worldHitCenter.sub(worldRectCenter);
    const parentScale = this.getSceneObject().getTransform().getLocalScale();

    hitTarget.getTransform().setLocalPosition(new vec3(
      worldOffset.x / Math.max(Math.abs(parentScale.x), 0.001),
      worldOffset.y / Math.max(Math.abs(parentScale.y), 0.001),
      worldOffset.z / Math.max(Math.abs(parentScale.z), 0.001),
    ));
  }

  private applyCollider(obj: SceneObject, size: vec3) {
    let colliders = obj.getComponents('Physics.ColliderComponent') as ColliderComponent[];
    if (colliders.length === 0) {
      colliders = obj.getComponents('Component.ColliderComponent') as ColliderComponent[];
    }
    const collider = colliders.length > 0
      ? colliders[0]
      : obj.createComponent('Physics.ColliderComponent') as ColliderComponent;

    const shape = Shape.createBoxShape();
    shape.size = new vec3(size.x, size.y, size.z);
    collider.shape = shape;
    collider.intangible = false;
  }

  private removeColliders(obj: SceneObject) {
    const physicsColliders = obj.getComponents('Physics.ColliderComponent') as ColliderComponent[];
    const legacyColliders = obj.getComponents('Component.ColliderComponent') as ColliderComponent[];
    [...physicsColliders, ...legacyColliders].forEach((collider) => {
      collider.enabled = false;
    });
  }

  private getColliderSize(st: ScreenTransform | null, parent: SceneObject): vec3 {
    if (this.colliderSize && this.colliderSize.x > 0 && this.colliderSize.y > 0) {
      return new vec3(this.colliderSize.x, this.colliderSize.y, this.colliderDepth);
    }

    if (st) {
      const fromScreenTransform = this.getScreenTransformColliderSize(st, parent);
      if (fromScreenTransform) {
        return fromScreenTransform;
      }
    }

    return this.estimateColliderSize();
  }

  private getScreenTransformColliderSize(st: ScreenTransform, parent: SceneObject): vec3 | null {
    const bottomLeft = st.localPointToWorldPoint(new vec2(-1, -1));
    const bottomRight = st.localPointToWorldPoint(new vec2(1, -1));
    const topLeft = st.localPointToWorldPoint(new vec2(-1, 1));

    const worldWidth = bottomRight.distance(bottomLeft);
    const worldHeight = topLeft.distance(bottomLeft);
    if (worldWidth <= 0 || worldHeight <= 0) {
      return null;
    }

    const objScale = parent.getTransform().getLocalScale();
    const safeScaleX = Math.max(Math.abs(objScale.x), 0.001);
    const safeScaleY = Math.max(Math.abs(objScale.y), 0.001);

    return new vec3(
      worldWidth / safeScaleX,
      worldHeight / safeScaleY,
      this.colliderDepth,
    );
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
