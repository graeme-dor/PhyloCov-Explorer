# PhyloCov-Explorer

**PhyloCov-Explorer** is an interactive, web-based framework built on Google Earth Engine (GEE) designed to host, explore, and extract time-varying ecological covariates relevant to pathogen transmission modeling.

This platform bridges the gap in integrated phylodynamic modeling by providing streamlined access to high-resolution Earth observation datasets (e.g., climate, land use, vector distributions) directly in the browser.

![PhyloCov Web Application Preview](https://github.com/graeme-dor/PhyloCov-Explorer/assets/placeholder-if-you-want-to-add-one)

## Analytical Pipelines

PhyloCov focuses on accommodating two distinct paths for downstream analysis:

1. **Continuous Phylodynamics (GeoJSON)**: Extract covariate data in GeoJSON format. This environmental data is instantly ready for post-hoc and landscape analyses tools, such as Seraphim.
2. **Discrete Phylodynamics (Shapefile / GLM)**: Supply custom point or polygon shapefiles to extract specific covariate data. PhyloCov formats these cleanly into pairwise or origin-destination CSV matrices perfectly formatted for Generalized Linear Model (GLM) integration within software like BEAST.

## Development Setup

This website is built with vanilla HTML, CSS, and JS, and bundled via [Vite](https://vitejs.dev/) for blazing fast performance and simple, dependency-free Github Pages deployment.

### Prerequisites

You need [Node.js](https://nodejs.org/) installed on your machine.

### Installation

Clone the repository and install the Vite dependencies:

```bash
git clone https://github.com/graeme-dor/PhyloCov-Explorer.git
cd PhyloCov-Explorer
npm install
```

### Local Development

Run the local development server (with instant hot-reloading):

```bash
npm run dev
```

The site will now be running locally at `http://localhost:5173/`.

## Deployment

The live website is completely automated. Any code pushed to the `main` branch triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`), which automatically builds and updates the site on GitHub Pages.

## Citing PhyloCov

If you use PhyloCov in your research, please refer to the website's **About & Methods** tab for up-to-date citation instructions concerning the related publication.
