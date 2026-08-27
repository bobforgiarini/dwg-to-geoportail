import type { Material, Object3D, ShaderMaterial } from 'three';
import { normalizeFillOpacity } from '../cad/appearance';

interface MaterialState {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

interface MaterialCarrier extends Object3D {
  material?: Material | Material[];
  isMesh?: boolean;
}

interface PatchedShaderMaterial extends ShaderMaterial {
  userData: Record<string, unknown> & {
    cadFillOpacityPatched?: boolean;
  };
}

const FILL_OPACITY_UNIFORM = 'u_cadFillOpacity';

function materialsOf(object: MaterialCarrier): Material[] {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function isShader(material: Material): material is ShaderMaterial {
  return (material as ShaderMaterial & { isShaderMaterial?: boolean }).isShaderMaterial === true;
}

/**
 * MLightCAD assigns negative renderer tiers exclusively to hatch/solid fill
 * meshes. Text glyphs and wide polylines are meshes as well, but use the
 * linework tier (`drawOrder >= 0`) and therefore remain fully opaque.
 */
export function isCadFillMaterial(material: Material, carrierIsMesh = true): boolean {
  if (!carrierIsMesh) return false;
  const drawOrder = material.userData?.drawOrder;
  return typeof drawOrder === 'number' && drawOrder < 0;
}

function patchShaderOpacity(material: PatchedShaderMaterial): boolean {
  material.uniforms[FILL_OPACITY_UNIFORM] ??= { value: 1 };
  if (material.userData.cadFillOpacityPatched) return true;

  let replaced = false;
  const fragmentShader = material.fragmentShader
    .split('\n')
    .map((line) => {
      if (!line.includes('gl_FragColor')) return line;
      const next = line.replace(/,\s*1\.0\s*\);/, `, ${FILL_OPACITY_UNIFORM});`);
      replaced ||= next !== line;
      return next;
    })
    .join('\n');

  // Unknown custom shaders remain untouched rather than risking broken CAD
  // rendering. MLightCAD's hatch shaders all use the supported alpha literal.
  if (!replaced) return false;

  material.fragmentShader = `uniform float ${FILL_OPACITY_UNIFORM};\n${fragmentShader}`;
  material.userData.cadFillOpacityPatched = true;
  material.needsUpdate = true;
  return true;
}

function applyOpacity(material: Material, fraction: number) {
  material.opacity = fraction;
  material.transparent = fraction < 1;
  material.depthWrite = fraction >= 1;

  if (isShader(material)) {
    const shader = material as PatchedShaderMaterial;
    if (patchShaderOpacity(shader)) {
      shader.uniforms[FILL_OPACITY_UNIFORM].value = fraction;
    }
  }
}

/**
 * Applies one global fill opacity without touching the scene graph structure or
 * scheduling render work. The adapter can call this after load/reorder and set
 * `view.isDirty` exactly once outside this helper.
 */
export class CadFillOpacityController {
  private readonly originalStates = new Map<Material, MaterialState>();

  apply(root: Object3D, percent: number): number {
    const fraction = normalizeFillOpacity(percent) / 100;
    const visited = new Set<Material>();

    root.traverse((object) => {
      const carrier = object as MaterialCarrier;
      for (const material of materialsOf(carrier)) {
        if (visited.has(material) || !isCadFillMaterial(material, carrier.isMesh === true)) continue;
        visited.add(material);
        if (!this.originalStates.has(material)) {
          this.originalStates.set(material, {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
          });
        }
        applyOpacity(material, fraction);
      }
    });

    return visited.size;
  }

  restore() {
    for (const [material, state] of this.originalStates) {
      material.opacity = state.opacity;
      material.transparent = state.transparent;
      material.depthWrite = state.depthWrite;
      if (isShader(material)) {
        const shader = material as PatchedShaderMaterial;
        if (shader.uniforms[FILL_OPACITY_UNIFORM]) {
          shader.uniforms[FILL_OPACITY_UNIFORM].value = state.opacity;
        }
      }
    }
    this.originalStates.clear();
  }
}
