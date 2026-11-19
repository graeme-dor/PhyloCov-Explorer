import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");

test("All static getElementById calls in main.js match existing IDs in index.html", () => {
  const htmlIds = new Set();
  const idAttrRegex = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = idAttrRegex.exec(indexHtml)) !== null) {
    htmlIds.add(m[1]);
  }

  // Dynamic IDs created at runtime in main.js or optional legacy elements guarded by if(el)
  const runtimeOrOptionalIds = new Set([
    "map_custom_palette_recommended",
    "map_draw_guidance",
    "glmDatasetInfo",
    "spatialExtentIcon",
    "roiExtentAlertIcon",
    "glmCoverageAlertIcon"
  ]);

  const jsGetByIdRegex = /getElementById\(\s*["']([^"'${}]+)["']\s*\)/g;
  const missing = [];
  while ((m = jsGetByIdRegex.exec(mainJs)) !== null) {
    const id = m[1];
    if (!htmlIds.has(id) && !runtimeOrOptionalIds.has(id)) {
      missing.push(id);
    }
  }
  assert.deepEqual(missing, [], `Missing DOM IDs in index.html referenced by main.js: ${missing.join(", ")}`);
});

test("All #id querySelector / querySelectorAll selectors in main.js match index.html", () => {
  const htmlIds = new Set();
  const idAttrRegex = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = idAttrRegex.exec(indexHtml)) !== null) {
    htmlIds.add(m[1]);
  }

  const queryIdRegex = /querySelector(?:All)?\(\s*["'`]#([a-zA-Z0-9_-]+)/g;
  const missing = [];
  while ((m = queryIdRegex.exec(mainJs)) !== null) {
    const id = m[1];
    if (!htmlIds.has(id)) {
      missing.push(id);
    }
  }
  assert.deepEqual(missing, [], `Missing #id querySelector targets in index.html: ${missing.join(", ")}`);
});

test("Phase 2 UI controls exist in index.html and are wired in main.js", () => {
  const requiredPhase2Ids = [
    "map_load_demo_btn",
    "glm_load_demo_btn",
    "glm_toggle_custom_btn",
    "glm_custom_panel",
    "glm_custom_asset",
    "glm_custom_load_btn",
    "glm_custom_band",
    "glm_custom_reducer",
    "glm_custom_scale_preset",
    "glm_custom_add_layer_btn",
    "glm_lag_window_group",
    "glm_temporal_window_select",
    "glm_lag_days_input",
    "glm_window_days_input"
  ];

  for (const id of requiredPhase2Ids) {
    assert.ok(indexHtml.includes(`id="${id}"`), `index.html missing id="${id}"`);
    assert.ok(mainJs.includes(id), `main.js does not wire id="${id}"`);
  }

  // Ensure top-level pipeline tabs are strictly scoped so Points/Boundaries sub-tabs don't collide
  assert.ok(
    mainJs.includes('querySelectorAll(".pipeline-tab[data-pipeline]")'),
    "Top-level pipeline tab listener must be scoped to .pipeline-tab[data-pipeline]"
  );
  // Ensure custom_datasets FormData payload is sent during GLM extraction
  assert.ok(
    mainJs.includes('formData.append("custom_datasets"'),
    "handleGLMExtraction must append custom_datasets to FormData"
  );
  assert.ok(
    mainJs.includes('formData.append("lag_days"') && mainJs.includes('formData.append("window_days"'),
    "handleGLMExtraction must append lag_days and window_days to FormData"
  );
});
