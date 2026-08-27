import { describe, expect, it } from 'vitest';
import { Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial } from 'three';
import { CadFillOpacityController, isCadFillMaterial } from './fillOpacity';

describe('CadFillOpacityController', () => {
  it('changes only negative-tier mesh fills', () => {
    const root = new Group();
    const fill = new MeshBasicMaterial();
    fill.userData.drawOrder = -20;
    const glyph = new MeshBasicMaterial();
    glyph.userData.drawOrder = 0;
    const line = new LineBasicMaterial();
    line.userData.drawOrder = -20;
    root.add(
      new Mesh(new PlaneGeometry(1, 1), fill),
      new Mesh(new PlaneGeometry(1, 1), glyph),
      new LineSegments(new PlaneGeometry(1, 1), line),
    );

    const changed = new CadFillOpacityController().apply(root, 35);

    expect(changed).toBe(1);
    expect(fill.opacity).toBe(0.35);
    expect(fill.transparent).toBe(true);
    expect(fill.depthWrite).toBe(false);
    expect(glyph.opacity).toBe(1);
    expect(line.opacity).toBe(1);
  });

  it('patches MLightCAD-style hatch shaders with a dedicated alpha uniform', () => {
    const root = new Group();
    const hatch = new ShaderMaterial({
      fragmentShader: 'void main() { gl_FragColor = vec4(vec3(1.0), 1.0); }',
    });
    hatch.userData.drawOrder = -10;
    root.add(new Mesh(new PlaneGeometry(1, 1), hatch));

    const controller = new CadFillOpacityController();
    controller.apply(root, 42);

    expect(hatch.fragmentShader).toContain('uniform float u_cadFillOpacity;');
    expect(hatch.fragmentShader).toContain('u_cadFillOpacity);');
    expect(hatch.uniforms.u_cadFillOpacity.value).toBe(0.42);

    controller.apply(root, 100);
    expect(hatch.uniforms.u_cadFillOpacity.value).toBe(1);
    expect(hatch.transparent).toBe(false);
  });

  it('restores original material flags', () => {
    const root = new Group();
    const fill = new MeshBasicMaterial({ opacity: 0.8, transparent: true, depthWrite: false });
    fill.userData.drawOrder = -1;
    root.add(new Mesh(new PlaneGeometry(1, 1), fill));
    const controller = new CadFillOpacityController();

    controller.apply(root, 20);
    controller.restore();

    expect(fill.opacity).toBe(0.8);
    expect(fill.transparent).toBe(true);
    expect(fill.depthWrite).toBe(false);
  });
});

describe('isCadFillMaterial', () => {
  it('fails closed for foreign or non-mesh renderer materials', () => {
    const material = new MeshBasicMaterial();
    material.userData.drawOrder = -1;
    expect(isCadFillMaterial(material, false)).toBe(false);
    delete material.userData.drawOrder;
    expect(isCadFillMaterial(material)).toBe(false);
  });
});

