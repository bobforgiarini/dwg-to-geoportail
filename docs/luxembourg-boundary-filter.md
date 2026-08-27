# Luxembourg boundary filter

## Data source

The CAD spatial filter uses the official **Limites administratives du Grand-Duché de Luxembourg** dataset published by the Administration du cadastre et de la topographie (ACT):

- Dataset: <https://data.public.lu/en/datasets/limites-administratives-du-grand-duche-de-luxembourg/>
- Stable resource permalink: <https://data.public.lu/en/datasets/r/39af91a6-9ce4-4c18-8271-313b3ad7c7f5>
- Source file used for the generated asset: `limadmin.geojson`, retrieved 2026-08-27
- Source SHA-256: `86f02293e9e41d5874611a37fbd153e86a5e7b170e19a71fcfd7f3caefaad5b0`
- Licence: CC0 1.0

The source file is not shipped and is never fetched by the application. The committed `src/lib/cad/data/luxembourgBoundary.epsg2169.json` contains only the national `pays` geometry transformed to LUREF (`EPSG:2169`) and simplified with a five-metre tolerance.

## Reproduction

Download the file behind the stable resource permalink, then run:

```cmd
node scripts\build-luxembourg-boundary.mjs C:\path\to\limadmin.geojson
```

The generator records the source hash, projection, simplification tolerance and configured 1,000-metre buffer in the output. It has no network access and therefore cannot silently replace the reviewed source.

## Filtering semantics

The application does not clip CAD geometry. It computes a conservative world-coordinate AABB for every model-space root entity after INSERT transformations and recursive block expansion.

- An entity is removed only when its complete AABB neither intersects Luxembourg nor lies within 1,000 metres of its boundary.
- Objects touching or crossing the buffered boundary are retained whole.
- Missing blocks, cyclic block graphs, unsupported geometry and invalid extents fail open: the root object is retained and reported.
- Once root objects are filtered, block definitions that are no longer reachable are discarded.
- The distance-based buffer calculation is performed in metres in `EPSG:2169`; no runtime geometry package or data request is required.

This conservative policy can retain an unusually large or damaged object, but it cannot silently delete one whose position cannot be proven to be outside the accepted area.
