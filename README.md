# PhyloCov-Explorer

[![Website Status](https://img.shields.io/website?url=https%3A%2F%2Fgraeme-dor.github.io%2FPhyloCov-Explorer%2F&up_message=online&down_message=offline)](https://graeme-dor.github.io/PhyloCov-Explorer/)

**[Access the Live Application Here](https://graeme-dor.github.io/PhyloCov-Explorer/)**

**PhyloCov-Explorer** is an interactive, web-based framework built on Google Earth Engine (GEE) designed to host, explore, and extract time-varying ecological covariates relevant to pathogen transmission modeling.

This platform bridges the gap in integrated phylodynamic modeling by providing streamlined access to high-resolution Earth observation datasets (e.g., climate, land use, vector distributions) directly in the browser—fully alleviating the need for complex local GIS/remote sensing setups.

![PhyloCov Web Application Preview](https://github.com/graeme-dor/PhyloCov-Explorer/assets/placeholder-if-you-want-to-add-one)

## Analytical Pipelines

PhyloCov focuses on accommodating two distinct paths for downstream analysis:

### 1. Continuous Phylodynamics (Interactive Extraction)
Extract covariate data in **GeoJSON** format directly from the interactive map interface. This environmental data is instantly ready for post-hoc and landscape analyses using tools such as Seraphim. 

### 2. Discrete Phylodynamics (Shapefile / GLM)
Supply custom point or polygon shapefiles to extract specific covariate data. PhyloCov automatically aggregates and formats these inputs into pairwise or origin-destination **CSV matrices**, constructed to exactly match the Generalized Linear Model (GLM) integration requirements for software like BEAST.

## How to Use

1. Navigate to the **[PhyloCov-Explorer Application](https://graeme-dor.github.io/PhyloCov-Explorer/)**.
2. **App:** Use the interactive mapping tools to select your region of interest, timeframes, and desired environmental layers.
3. **Datasets:** Browse the comprehensive catalog of currently hosted ecological covariates (including resolution, sources, and temporality).
4. **Extraction:** Export the generated GeoJSON or CSV matrices directly to your local machine for immediate deployment in your phylodynamic inference pipelines.

## Citing PhyloCov

If you utilize PhyloCov-Explorer for your research, please refer to the website's **[About & Methods](https://graeme-dor.github.io/PhyloCov-Explorer/about.html)** tab for up-to-date citation instructions concerning the associated publication.
