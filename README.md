# PhyloCov-Explorer

[![Website Status](https://img.shields.io/website?url=https%3A%2F%2Fgraeme-dor.github.io%2FPhyloCov-Explorer%2F&up_message=online&down_message=offline)](https://graeme-dor.github.io/PhyloCov-Explorer/)

**[Access the Live Application Here](https://graeme-dor.github.io/PhyloCov-Explorer/)**

**PhyloCov-Explorer** is an interactive, web-based framework built on Google Earth Engine (GEE) designed to host, explore, and extract time-varying environmental covariates relevant to modeling the transmission of climate-sensitive pathogens.

This platform bridges the gap in integrated phylodynamic modeling by providing streamlined access to high-resolution Earth observation datasets (climate, vegetation, land surface temperature, topography, and custom GEE assets) directly in the browser—removing the need for complex local GIS and remote-sensing preprocessing pipelines.

## Analytical Pipelines

PhyloCov supports two complementary workflows for downstream phylodynamic inference:

### 1. Continuous Phylodynamics (Cloud GeoTIFF Raster Export)
Define regions of interest by country, continent, drawn bounding box, or spatial extents parsed directly from continuous BEAST `.tree`/`.tre`, CSV, or GeoJSON files, and export georeferenced **GeoTIFF** environmental composites directly from Google Earth Engine. Exported rasters are immediately ready for post-hoc continuous phylogeographic and landscape movement analyses using tools such as `seraphim` in R.

### 2. Discrete Phylodynamics (Sample Points & Boundary GLM Extraction)
Upload discrete sample tables (`CSV`, `TSV`, `Excel`) or administrative/ecological boundary geometries (`GeoJSON` or multi-layer zipped ESRI `Shapefiles`) to extract multi-layer environmental covariates concurrently. PhyloCov optionally aggregates and standardizes covariates across off-diagonal elements into $K \times K$ pairwise predictor **CSV matrices** (Haversine raw/log distances, origin, destination, absolute difference, and pairwise average) formatted for direct Generalized Linear Model (GLM) import in BEAST / BEAUti.

## Reproducibility

Every pipeline configuration in PhyloCov can be inspected and exported as standalone, reproducible code in **Python (`earthengine-api`)**, **R (`rgee` / `terra`)**, or **Google Earth Engine JavaScript** via the **Export Script** modal.

## Navigation

1. **[Live Application](https://graeme-dor.github.io/PhyloCov-Explorer/)**: Interactive map workspace for Pipeline 1 & Pipeline 2 exploration and export.
2. **[Datasets Catalog](https://graeme-dor.github.io/PhyloCov-Explorer/datasets.html)**: Specifications for curated presets (`CHIRPS`, `ERA5`, `ERA5-Land`, `MODIS NDVI`, `MODIS LST`, `SRTM`) and custom GEE catalog assets.
3. **[About & Methods](https://graeme-dor.github.io/PhyloCov-Explorer/about.html)**: Mathematical derivations of GLM predictors, off-diagonal standardization, BEAST/BEAUti & `seraphim` guides, and [Publication Workflow Schema](https://graeme-dor.github.io/PhyloCov-Explorer/workflow_diagram.html).

## Citing PhyloCov

If you utilize PhyloCov-Explorer for your research, please refer to the **[About & Methods](https://graeme-dor.github.io/PhyloCov-Explorer/about.html#citations)** page for citation instructions and primary dataset references.
