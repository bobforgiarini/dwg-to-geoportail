import type { CadDocument } from '@flyfish-dev/cad-viewer';
import type { CadSpatialFilterReport } from './luxembourgSpatialFilter';

export type CadBlockKind = 'named' | 'anonymous' | 'xref';

export type CadEntityCategory =
  | 'paper-space'
  | 'xref'
  | 'image'
  | 'ole'
  | 'proxy'
  | '3d'
  | 'text'
  | 'leader'
  | 'hatch';

export interface CadOverlayBlock {
  id: string;
  name: string;
  kind: CadBlockKind;
  visible: boolean;
  instanceCount: number;
  directInstanceCount: number;
  directEntityCount: number;
  recursiveEntityCount: number;
  expandedEntityCount: number;
  textCount: number;
  hatchCount: number;
  primaryLayer: string | null;
  referencedBlockNames: string[];
  isNested: boolean;
  hasCycle: boolean;
  estimatedCost: number;
}

export interface CadLoadProfile {
  mode: 'full' | 'filtered';
  hiddenLayerIds: string[];
  hiddenBlockNames: string[];
  hiddenEntityCategories: CadEntityCategory[];
}

export type CadLoadDecision = 'full' | 'filtered' | 'cancel';
export type DwgRiskLevel = 'low' | 'elevated' | 'high';

export type CadAnnotationScaleSource = 'saved' | 'context' | 'fallback';

/** A validated AutoCAD annotation scale. `ratio` is drawingUnits / paperUnits. */
export interface CadAnnotationScale {
  id: string;
  name: string;
  paperUnits: number;
  drawingUnits: number;
  ratio: number;
  source: CadAnnotationScaleSource;
  isDefault: boolean;
}

export interface CadAnnotationScaleSelection {
  mode: 'saved' | 'manual';
  savedScaleId: string | null;
  selectedScaleId: string | null;
  availableScales: CadAnnotationScale[];
  /** Number of native annotation context objects found before convertEx(). */
  contextObjectCount: number;
  /** True when native context data was incomplete and no representation was pruned. */
  failOpen: boolean;
}

export type DwgExternalReferenceKind = 'attachment' | 'overlay';
export type DwgExternalReferenceStatus =
  | 'missing'
  | 'resolved'
  | 'ambiguous'
  | 'cycle'
  | 'invalid';

export interface CadFileDescriptor {
  id: string;
  name: string;
  size: number;
  lastModified: number;
}

/** Browser-session-only bundle. Files remain local and are structured-cloned to the worker. */
export interface CadFileBundle {
  root: File;
  xrefs: File[];
}

export interface DwgExternalReference {
  id: string;
  name: string;
  normalizedName: string;
  sourcePath: string | null;
  kind: DwgExternalReferenceKind;
  status: DwgExternalReferenceStatus;
  parentFileId: string;
  resolvedFileId: string | null;
  candidateFileIds: string[];
  /** Session-local candidate metadata used only to disambiguate equal base names. */
  candidateFiles?: CadFileDescriptor[];
  depth: number;
  path: string[];
}

export type DwgProfileEffectKind = 'layer' | 'block' | 'category' | 'boundary' | 'xref';
export type DwgProfileEffectPolicy = 'required' | 'recommended' | 'user';
export type DwgProfileEffectReason =
  | 'layer-off'
  | 'layer-frozen'
  | 'layer-no-plot'
  | 'paper-space'
  | 'unsupported-image'
  | 'unsupported-ole'
  | 'unsupported-proxy'
  | 'unsupported-3d'
  | 'unresolved-xref'
  | 'outside-luxembourg-buffer'
  | 'user-selection';

/** One concrete exclusion shown by the preparation UI. */
export interface DwgProfileEffect {
  id: string;
  kind: DwgProfileEffectKind;
  policy: DwgProfileEffectPolicy;
  reason: DwgProfileEffectReason;
  label: string;
  affectedEntityCount: number;
  /** Weighted performance estimate; never presented as an entity count. */
  estimatedCost: number;
  selected: boolean;
}

export interface DwgProfileImpact {
  before: {
    entityCount: number;
    estimatedCost: number;
  };
  recommended: {
    entityCount: number;
    estimatedCost: number;
  };
}

export type DwgRiskReason =
  | 'render-cost'
  | 'entity-count'
  | 'block-expansion'
  | 'text-density'
  | 'hatch-density'
  | 'polyline-density'
  | 'layer-count'
  | 'file-size-pressure'
  | 'limited-device-memory';

export type DwgPreflightWarningCode =
  | 'missing-block'
  | 'cyclic-block'
  | 'max-depth'
  | 'annotation-context-invalid'
  | 'annotation-scale-unresolved'
  | 'xref-missing'
  | 'xref-ambiguous'
  | 'xref-cycle'
  | 'xref-invalid'
  | 'font-substitution';

export interface DwgPreflightWarning {
  code: DwgPreflightWarningCode;
  blockName?: string;
  path?: string[];
  detail?: string;
  fontName?: string;
  affectedCharacterCount?: number;
}

export interface CadPreflightLayer {
  id: string;
  name: string;
  visible: boolean;
  frozen: boolean;
  noPlot: boolean;
  expandedEntityCount: number;
}

export interface DwgPreflightEntityCounts {
  modelEntities: number;
  insertInstances: number;
  texts: number;
  leaders: number;
  mleaders: number;
  hatches: number;
  solids: number;
  polylineVertices: number;
  paperSpaceEntities: number;
  images: number;
  oleObjects: number;
  proxyObjects: number;
  threeDimensional: number;
  xrefs: number;
}

export interface DwgPreflightRisk {
  level: DwgRiskLevel;
  shouldPrepare: boolean;
  estimatedRenderCost: number;
  deviceBudget: number;
  reasons: DwgRiskReason[];
}

export interface DwgPreflightReport {
  /** Producers emit 2. Version 1 remains readable during the 0.5.0 UI migration. */
  schemaVersion: 1 | 2;
  file: {
    name: string | null;
    size: number | null;
    lastModified: number | null;
  };
  format: CadDocument['format'];
  documentVersion: string | null;
  layers: CadPreflightLayer[];
  blocks: CadOverlayBlock[];
  entityCounts: DwgPreflightEntityCounts;
  definedBlockCount: number;
  reachableBlockCount: number;
  maxBlockDepth: number;
  risk: DwgPreflightRisk;
  recommendedProfile: CadLoadProfile;
  warnings: DwgPreflightWarning[];
  /** Present on schema 2 reports. Optional only for reading 0.4.x session fixtures. */
  effects?: DwgProfileEffect[];
  impact?: DwgProfileImpact;
  annotationScale?: CadAnnotationScaleSelection;
  externalReferences?: DwgExternalReference[];
  spatialFilter?: CadSpatialFilterReport;
}

export interface DwgPreflightOptions {
  file?: {
    name?: string;
    size?: number;
    lastModified?: number;
  };
  device?: {
    mobile?: boolean;
    memoryGiB?: number;
  };
  maxBlockDepth?: number;
  /** Entities reported by LibreDWG but not represented in its converted database. */
  unknownEntityCount?: number;
  annotationScale?: CadAnnotationScaleSelection;
  externalReferences?: DwgExternalReference[];
  spatialFilter?: CadSpatialFilterReport;
}

export interface CadDocumentFilterResult {
  document: CadDocument;
  removedEntityCount: number;
  removedBlockNames: string[];
  remainingBlockNames: string[];
  warnings: DwgPreflightWarning[];
}
