/**
 * Renderer-neutral CAD structures used by the local preflight and filtering
 * pipeline. They intentionally describe only the normalized fields consumed by
 * this application; the original parser object remains available through
 * `raw` while the worker is running.
 */
export type CadFormat = 'dwg' | 'dxf' | 'dwf' | 'dwfx' | 'xps' | 'unknown';

export interface CadPoint2D {
  x: number;
  y: number;
}

export interface CadPoint3D extends CadPoint2D {
  z?: number;
}

export interface CadPathCommand {
  cmd: 'M' | 'L' | 'C' | 'Q' | 'Z';
  points: CadPoint2D[];
}

export type CadEntityKind =
  | 'line'
  | 'circle'
  | 'arc'
  | 'polyline'
  | 'ellipse'
  | 'text'
  | 'point'
  | 'insert'
  | 'solid'
  | 'hatch'
  | 'spline'
  | 'path'
  | 'image'
  | 'viewport'
  | 'table'
  | 'unsupported';

export interface CadEntity {
  id?: string;
  type: string;
  kind?: CadEntityKind;
  handle?: string;
  layer?: string;
  isVisible?: boolean;
  isInPaperSpace?: boolean;
  startPoint?: CadPoint3D;
  endPoint?: CadPoint3D;
  center?: CadPoint3D;
  radius?: number;
  majorAxisEndPoint?: CadPoint3D;
  axisRatio?: number;
  vertices?: Array<CadPoint3D & { bulge?: number; startWidth?: number; endWidth?: number }>;
  points?: CadPoint3D[];
  controlPoints?: CadPoint3D[];
  fitPoints?: CadPoint3D[];
  isClosed?: boolean;
  constantWidth?: number;
  thickness?: number;
  insertionPoint?: CadPoint3D;
  text?: string;
  value?: string;
  height?: number;
  textHeight?: number;
  xScale?: number;
  rotation?: number;
  scale?: CadPoint3D;
  name?: string;
  blockName?: string;
  effectiveBlockName?: string;
  insertRowCount?: number;
  insertColumnCount?: number;
  insertRowSpacing?: number;
  insertColumnSpacing?: number;
  attribs?: CadEntity[];
  loops?: Array<{
    vertices?: CadPoint3D[];
    commands?: CadPathCommand[];
    isClosed?: boolean;
  }>;
  commands?: CadPathCommand[];
  width?: number;
  lineweight?: number;
  raw?: unknown;
  [key: string]: unknown;
}

export interface CadLayer {
  name: string;
  color?: string | number;
  colorIndex?: number;
  lineType?: string;
  lineweight?: number;
  isVisible?: boolean;
  isLocked?: boolean;
  isFrozen?: boolean;
  raw?: unknown;
}

export interface CadBlock {
  name: string;
  basePoint?: CadPoint3D;
  entities: CadEntity[];
  raw?: unknown;
}

export interface CadPage {
  index: number;
  name?: string;
  width: number;
  height: number;
  entities: CadEntity[];
}

export interface CadDocument {
  format: CadFormat;
  sourceName?: string;
  header?: Record<string, unknown>;
  layers: Record<string, CadLayer>;
  blocks: Record<string, CadBlock>;
  entities: CadEntity[];
  pages?: CadPage[];
  metadata: Record<string, unknown>;
  warnings: string[];
  raw?: unknown;
}
