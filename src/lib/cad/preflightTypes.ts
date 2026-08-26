import type { CadDocument } from '@flyfish-dev/cad-viewer';

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

export type DwgPreflightWarningCode = 'missing-block' | 'cyclic-block' | 'max-depth';

export interface DwgPreflightWarning {
  code: DwgPreflightWarningCode;
  blockName?: string;
  path?: string[];
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
  schemaVersion: 1;
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
}

export interface CadDocumentFilterResult {
  document: CadDocument;
  removedEntityCount: number;
  removedBlockNames: string[];
  remainingBlockNames: string[];
  warnings: DwgPreflightWarning[];
}
