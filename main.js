import './style.css';

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split('T')[0];
  
  // Shared Dataset Metadata
  const datasetMetadata = {
    chirps: { 
      res: 5566, 
      text: "Native Resolution: ~5.5km | Temporal: Daily",
      start: "1981-01-01",
      end: today,
      rangeText: "Available: 1981-01-01 to Present"
    },
    era5: { 
      res: 27830, 
      text: "Native Resolution: ~27.8km | Temporal: Daily",
      start: "1979-01-01",
      end: today,
      rangeText: "Available: 1979-01-01 to Present (~3 months lag)"
    },
    era5_land_monthly: { 
      res: 11132, 
      text: "Native Resolution: ~11.1km | Temporal: Monthly",
      start: "1950-01-01",
      end: today,
      rangeText: "Available: 1950-01-01 to Present (~2-3 months lag)"
    },
    modis_ndvi: { 
      res: 250, 
      text: "Native Resolution: 250m | Temporal: 16-day",
      start: "2000-02-18",
      end: today,
      rangeText: "Available: 2000-02-18 to Present"
    },
    modis_lst_day: { 
      res: 5600, 
      text: "Native Resolution: ~5.6km | Temporal: Monthly",
      start: "2000-03-05",
      end: today,
      rangeText: "Available: 2000-03-05 to Present"
    },
    modis_lst_night: { 
      res: 5600, 
      text: "Native Resolution: ~5.6km | Temporal: Monthly",
      start: "2000-03-05",
      end: today,
      rangeText: "Available: 2000-03-05 to Present"
    },
    modis_lst_range: { 
      res: 5600, 
      text: "Native Resolution: ~5.6km | Temporal: Monthly",
      start: "2000-03-05",
      end: today,
      rangeText: "Available: 2000-03-05 to Present"
    },
    srtm: { 
      res: 30, 
      text: "Native Resolution: 30m | Temporal: Static",
      start: null,
      end: null,
      rangeText: "Available: Static topography dataset (Feb 2000)"
    }
  };

  function updateDatasetUI(datasetVal, infoBox, startDateInput, endDateInput, dateRow) {
    if (datasetVal === "custom") {
      if (infoBox) {
        infoBox.textContent = "Custom Google Earth Engine Dataset (enter Asset ID below)";
      }
      if (dateRow) dateRow.style.display = "flex";
      return;
    }

    const meta = datasetMetadata[datasetVal];
    if (!meta) return;

    if (infoBox) {
      infoBox.textContent = `${meta.text} | ${meta.rangeText}`;
    }

    if (meta.start && meta.end) {
      if (dateRow) dateRow.style.display = "flex";
      if (startDateInput) {
        startDateInput.min = meta.start;
        startDateInput.max = meta.end;
      }
      if (endDateInput) {
        endDateInput.min = meta.start;
        endDateInput.max = meta.end;
      }
    } else {
      // Static dataset, hide dates
      if (dateRow) dateRow.style.display = "none";
    }
  }

  // (Old iframe logic removed for Native Map Architecture)
  // Intersection Observer for fade-in elements
  const sections = document.querySelectorAll(".fade-in-section");

  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));

  // --- Large Scale Export Logic ---
  const exportForm = document.getElementById("exportForm");
  if (exportForm) {
    const exportBtn = document.getElementById("exportBtn");
    const exportDatasetSelect = document.getElementById("dataset");
    const exportStartDateInput = document.getElementById("start_date");
    const exportEndDateInput = document.getElementById("end_date");
    const exportDateRow = document.getElementById("export_date_row");
    const exportDatasetInfoBox = document.getElementById("exportDatasetInfoBox");

    const exportCustomPanel = document.getElementById("export_custom_panel");
    const exportCustomAssetInput = document.getElementById("export_custom_asset");
    const exportCustomLoadBtn = document.getElementById("export_custom_load_btn");
    const exportCustomError = document.getElementById("export_custom_error");
    const exportCustomBandSelect = document.getElementById("export_custom_band");
    const exportCustomBandGroup = document.getElementById("export_custom_band_group");
    const exportCustomReducerGroup = document.getElementById("export_custom_reducer_group");
    const exportCustomScalePresetGroup = document.getElementById("export_custom_scale_preset_group");
    const exportCustomScalingRow = document.getElementById("export_custom_scaling_row");
    const exportCustomMultiplier = document.getElementById("export_custom_multiplier");
    const exportCustomOffset = document.getElementById("export_custom_offset");
    const exportCustomScalePreset = document.getElementById("export_custom_scale_preset");

    let loadedExportAssetType = "ImageCollection";
    let exportBandsMetadata = [];

    if (exportCustomScalePreset) {
      exportCustomScalePreset.addEventListener("change", () => {
        const val = exportCustomScalePreset.value;
        if (val === "none") {
          exportCustomMultiplier.value = 1.0;
          exportCustomOffset.value = 0.0;
          exportCustomScalingRow.style.display = "none";
        } else if (val === "kelvin_to_celsius") {
          exportCustomMultiplier.value = 1.0;
          exportCustomOffset.value = -273.15;
          exportCustomScalingRow.style.display = "none";
        } else if (val === "modis_ndvi") {
          exportCustomMultiplier.value = 0.0001;
          exportCustomOffset.value = 0.0;
          exportCustomScalingRow.style.display = "none";
        } else if (val === "percentage") {
          exportCustomMultiplier.value = 100.0;
          exportCustomOffset.value = 0.0;
          exportCustomScalingRow.style.display = "none";
        } else if (val === "custom") {
          exportCustomScalingRow.style.display = "flex";
        }
      });
    }

    if (exportCustomBandSelect) {
      exportCustomBandSelect.addEventListener("change", () => {
        const bandId = exportCustomBandSelect.value;
        const band = exportBandsMetadata.find(b => b.id === bandId);
        if (!band) return;

        // Auto-configure unit scaling preset
        if (band.units === "K" || band.id.toLowerCase().includes("temp")) {
          exportCustomScalePreset.value = "kelvin_to_celsius";
        } else if (band.scale !== 1.0 || band.offset !== 0.0) {
          exportCustomScalePreset.value = "custom";
          exportCustomMultiplier.value = band.scale;
          exportCustomOffset.value = band.offset;
        } else {
          exportCustomScalePreset.value = "none";
        }
        exportCustomScalePreset.dispatchEvent(new Event("change"));
      });
    }

    if (exportCustomLoadBtn) {
      exportCustomLoadBtn.addEventListener("click", async () => {
        const assetId = exportCustomAssetInput.value.trim();
        if (!assetId) {
          showExportError("Please enter a GEE Asset ID");
          return;
        }

        exportCustomLoadBtn.disabled = true;
        exportCustomLoadBtn.textContent = "Loading...";
        exportCustomError.style.display = "none";

        try {
          const res = await fetch(`${BACKEND_URL}/datasets/info?id=${encodeURIComponent(assetId)}`);
          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.detail || "Failed to load GEE asset metadata");
          }

          exportBandsMetadata = data.bands;
          exportCustomBandSelect.innerHTML = "";
          exportBandsMetadata.forEach(band => {
            const opt = document.createElement("option");
            opt.value = band.id;
            let label = band.id;
            if (band.description) {
              label += ` - ${band.description}`;
            }
            if (band.units) {
              label += ` (${band.units})`;
            }
            opt.textContent = label;
            exportCustomBandSelect.appendChild(opt);
          });

          loadedExportAssetType = data.type;
          if (data.type === "Image") {
            if (exportDateRow) exportDateRow.style.display = "none";
            if (exportCustomReducerGroup) exportCustomReducerGroup.style.display = "none";
          } else {
            if (exportDateRow) exportDateRow.style.display = "flex";
            if (exportCustomReducerGroup) exportCustomReducerGroup.style.display = "flex";
          }

          if (exportCustomBandGroup) exportCustomBandGroup.style.display = "flex";
          if (exportCustomScalePresetGroup) exportCustomScalePresetGroup.style.display = "flex";
          
          // Trigger initial band change to set default scaling presets
          exportCustomBandSelect.dispatchEvent(new Event("change"));
          
        } catch (err) {
          showExportError(err.message);
        } finally {
          exportCustomLoadBtn.disabled = false;
          exportCustomLoadBtn.textContent = "Load";
        }
      });
    }

    function showExportError(msg) {
      if (exportCustomError) {
        exportCustomError.textContent = msg;
        exportCustomError.style.display = "block";
      }
    }

    if (exportDatasetSelect) {
      exportDatasetSelect.addEventListener("change", () => {
        updateDatasetUI(exportDatasetSelect.value, exportDatasetInfoBox, exportStartDateInput, exportEndDateInput, exportDateRow);
        if (exportDatasetSelect.value === "custom") {
          if (exportCustomPanel) exportCustomPanel.style.display = "flex";
        } else {
          if (exportCustomPanel) exportCustomPanel.style.display = "none";
        }
      });
      // Trigger initial load
      exportDatasetSelect.dispatchEvent(new Event('change'));
    }
    const exportStatus = document.getElementById("exportStatus");
    const statusText = document.getElementById("statusText");
    const statusMessage = document.getElementById("statusMessage");
    const downloadContainer = document.getElementById("downloadContainer");
    const downloadLink = document.getElementById("downloadLink");
    const statusDot = document.querySelector(".status-dot");

    // The base URL for your local FastAPI backend.
    // In production, this should be the URL of your Cloud Run service.
    const BACKEND_URL = "https://phylocov-export-backend-719941553080.europe-west1.run.app";

    exportForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Reset UI
      exportBtn.disabled = true;
      exportBtn.textContent = "Starting...";
      exportStatus.style.display = "block";
      downloadContainer.style.display = "none";
      statusText.textContent = "SUBMITTED";
      statusMessage.textContent = "Submitting task to Earth Engine...";
      statusDot.style.backgroundColor = "#d2a8ff"; // Purple

      const formData = new FormData(exportForm);
      const datasetVal = formData.get("dataset");
      const isCustom = datasetVal === "custom";

      const payload = {
        dataset: isCustom ? exportCustomAssetInput.value.trim() : datasetVal,
        roi_type: "country",
        roi_names: [formData.get("country")],
        start_date: isCustom && loadedExportAssetType === "Image" ? "2000-01-01" : formData.get("start_date"),
        end_date: isCustom && loadedExportAssetType === "Image" ? "2000-01-02" : formData.get("end_date"),
        scale: parseInt(formData.get("scale"), 10)
      };

      if (isCustom) {
        payload.band = exportCustomBandSelect.value;
        payload.reducer = document.getElementById("export_custom_reducer").value;
        payload.multiplier = parseFloat(document.getElementById("export_custom_multiplier").value) || 1.0;
        payload.offset = parseFloat(document.getElementById("export_custom_offset").value) || 0.0;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/exports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Failed to start export");
        }

        const taskId = data.ee_task_id;
        pollTaskStatus(taskId);

      } catch (error) {
        statusText.textContent = "FAILED";
        statusMessage.textContent = error.message;
        statusDot.style.backgroundColor = "#f85149"; // Red
        exportBtn.disabled = false;
        exportBtn.textContent = "Start Export";
      }
    });

    async function pollTaskStatus(taskId) {
      try {
        const response = await fetch(`${BACKEND_URL}/exports/${taskId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Failed to fetch status");
        }

        statusText.textContent = data.state;

        if (data.state === "READY" || data.state === "RUNNING") {
          statusMessage.textContent = "Task is running in Earth Engine. This may take several minutes...";
          statusDot.style.backgroundColor = "#e3b341"; // Yellow/Orange
          // Poll again in 10 seconds
          setTimeout(() => pollTaskStatus(taskId), 10000);
        } else if (data.state === "COMPLETED") {
          statusMessage.textContent = "Task completed! Generating secure download link...";
          statusDot.style.backgroundColor = "#2ea043"; // Green
          fetchDownloadLink(taskId);
        } else {
          // FAILED, CANCELLED, etc.
          statusMessage.textContent = `Task ended with state: ${data.state}. ${data.error_message || ""}`;
          statusDot.style.backgroundColor = "#f85149"; // Red
          exportBtn.disabled = false;
          exportBtn.textContent = "Start Export";
        }
      } catch (error) {
        statusText.textContent = "ERROR";
        statusMessage.textContent = `Error polling status: ${error.message}`;
        statusDot.style.backgroundColor = "#f85149";
        exportBtn.disabled = false;
        exportBtn.textContent = "Start Export";
      }
    }

    async function fetchDownloadLink(taskId) {
      try {
        const response = await fetch(`${BACKEND_URL}/exports/${taskId}/download`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Failed to generate download link");
        }

        statusMessage.textContent = "Ready for download!";
        downloadLink.href = data.download_url;
        downloadContainer.style.display = "block";

        exportBtn.disabled = false;
        exportBtn.textContent = "Start Export";

      } catch (error) {
        statusText.textContent = "ERROR";
        statusMessage.textContent = `Failed to get download URL: ${error.message}`;
        statusDot.style.backgroundColor = "#f85149";
        exportBtn.disabled = false;
        exportBtn.textContent = "Start Export";
      }
    }
  }

  // --- Native Map Logic (index.html) ---
  const mapElement = document.getElementById("map");
  if (mapElement && typeof L !== "undefined") {
    // Initialize Leaflet Map
    const map = L.map("map", {
      zoomControl: false // Custom position later if needed
    }).setView([20, 0], 2); // Default center (Global)

    // Add Dark Base Map (CartoDB Dark Matter)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    let currentEELayer = null;
    const BACKEND_URL = "https://phylocov-export-backend-719941553080.europe-west1.run.app"; // Update for local dev if needed: http://127.0.0.1:8000
    
    const datasetSelect = document.getElementById("map_dataset");
    const startDateInput = document.getElementById("map_start_date");
    const endDateInput = document.getElementById("map_end_date");
    const countryInput = document.getElementById("map_country");
    const regionInput = document.getElementById("map_region");
    const datasetInfoBox = document.getElementById("datasetInfoBox");
    const mapScaleSelect = document.getElementById("map_scale_select");
    const mapScaleCustom = document.getElementById("map_scale_custom");
    const mapLoadingOverlay = document.getElementById("mapLoadingOverlay");
    const mapErrorOverlay = document.getElementById("mapErrorOverlay");
    const mapErrorText = document.getElementById("mapErrorText");
    const mapErrorCloseBtn = document.getElementById("mapErrorCloseBtn");
    const mapDateRow = document.getElementById("map_date_row");

    if (mapErrorCloseBtn) {
      mapErrorCloseBtn.addEventListener("click", () => {
        if (mapErrorOverlay) mapErrorOverlay.style.display = "none";
      });
    }

    const mapCustomPanel = document.getElementById("map_custom_panel");
    const mapCustomAssetInput = document.getElementById("map_custom_asset");
    const mapCustomLoadBtn = document.getElementById("map_custom_load_btn");
    const mapCustomError = document.getElementById("map_custom_error");
    const mapCustomBandSelect = document.getElementById("map_custom_band");
    const mapCustomBandGroup = document.getElementById("map_custom_band_group");
    const mapCustomReducerGroup = document.getElementById("map_custom_reducer_group");
    const mapCustomScalePresetGroup = document.getElementById("map_custom_scale_preset_group");
    const mapCustomScalingRow = document.getElementById("map_custom_scaling_row");
    const mapCustomVisRow = document.getElementById("map_custom_vis_row");
    const mapCustomPaletteGroup = document.getElementById("map_custom_palette_group");
    const mapCustomScalePreset = document.getElementById("map_custom_scale_preset");
    const mapCustomMultiplier = document.getElementById("map_custom_multiplier");
    const mapCustomOffset = document.getElementById("map_custom_offset");
    const mapCustomVisMin = document.getElementById("map_custom_vis_min");
    const mapCustomVisMax = document.getElementById("map_custom_vis_max");
    const mapCustomPalette = document.getElementById("map_custom_palette");

    let loadedMapAssetType = "ImageCollection";
    let mapBandsMetadata = [];

    if (mapCustomScalePreset) {
      mapCustomScalePreset.addEventListener("change", () => {
        const val = mapCustomScalePreset.value;
        if (val === "none") {
          mapCustomMultiplier.value = 1.0;
          mapCustomOffset.value = 0.0;
          mapCustomScalingRow.style.display = "none";
        } else if (val === "kelvin_to_celsius") {
          mapCustomMultiplier.value = 1.0;
          mapCustomOffset.value = -273.15;
          mapCustomScalingRow.style.display = "none";
        } else if (val === "modis_ndvi") {
          mapCustomMultiplier.value = 0.0001;
          mapCustomOffset.value = 0.0;
          mapCustomScalingRow.style.display = "none";
        } else if (val === "percentage") {
          mapCustomMultiplier.value = 100.0;
          mapCustomOffset.value = 0.0;
          mapCustomScalingRow.style.display = "none";
        } else if (val === "custom") {
          mapCustomScalingRow.style.display = "flex";
        }
        triggerMapUpdate();
      });
    }

    if (mapCustomBandSelect) {
      mapCustomBandSelect.addEventListener("change", () => {
        const bandId = mapCustomBandSelect.value;
        const band = mapBandsMetadata.find(b => b.id === bandId);
        if (!band) return;

        // 1. Auto-configure unit scaling preset
        if (band.units === "K" || band.id.toLowerCase().includes("temp")) {
          mapCustomScalePreset.value = "kelvin_to_celsius";
        } else if (band.scale !== 1.0 || band.offset !== 0.0) {
          mapCustomScalePreset.value = "custom";
          mapCustomMultiplier.value = band.scale;
          mapCustomOffset.value = band.offset;
        } else {
          mapCustomScalePreset.value = "none";
        }
        mapCustomScalePreset.dispatchEvent(new Event("change"));

        // 2. Auto-configure recommended visualization parameters
        if (band.vis) {
          // If Kelvin units are auto-converted to Celsius, scale down min/max bounds as well!
          const isKelvinConversion = mapCustomScalePreset.value === "kelvin_to_celsius";
          const shift = isKelvinConversion ? -273.15 : 0.0;
          
          mapCustomVisMin.value = (band.vis.min + shift).toFixed(2);
          mapCustomVisMax.value = (band.vis.max + shift).toFixed(2);
          
          if (band.vis.palette && band.vis.palette.length > 0) {
            let recOpt = document.getElementById("map_custom_palette_recommended");
            if (!recOpt) {
              recOpt = document.createElement("option");
              recOpt.id = "map_custom_palette_recommended";
              recOpt.value = "recommended";
              mapCustomPalette.appendChild(recOpt);
            }
            recOpt.textContent = `Recommended (${band.id} Palette)`;
            recOpt.style.display = "block";
            mapCustomPalette.value = "recommended";
            mapCustomPalette.dataset.customPalette = band.vis.palette.join(",");
          } else {
            hideRecommendedPalette();
          }
        } else {
          // Defaults if no recommended vis parameters
          mapCustomVisMin.value = 0;
          mapCustomVisMax.value = 100;
          hideRecommendedPalette();
        }
        triggerMapUpdate();
      });
    }

    function hideRecommendedPalette() {
      const recOpt = document.getElementById("map_custom_palette_recommended");
      if (recOpt) recOpt.style.display = "none";
      if (mapCustomPalette.value === "recommended") {
        mapCustomPalette.value = "viridis";
      }
    }

    if (mapCustomLoadBtn) {
      mapCustomLoadBtn.addEventListener("click", async () => {
        const assetId = mapCustomAssetInput.value.trim();
        if (!assetId) {
          showMapError("Please enter a GEE Asset ID");
          return;
        }

        mapCustomLoadBtn.disabled = true;
        mapCustomLoadBtn.textContent = "Loading...";
        mapCustomError.style.display = "none";

        try {
          const res = await fetch(`${BACKEND_URL}/datasets/info?id=${encodeURIComponent(assetId)}`);
          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.detail || "Failed to load GEE asset metadata");
          }

          mapBandsMetadata = data.bands;
          mapCustomBandSelect.innerHTML = "";
          mapBandsMetadata.forEach(band => {
            const opt = document.createElement("option");
            opt.value = band.id;
            let label = band.id;
            if (band.description) {
              label += ` - ${band.description}`;
            }
            if (band.units) {
              label += ` (${band.units})`;
            }
            opt.textContent = label;
            mapCustomBandSelect.appendChild(opt);
          });

          loadedMapAssetType = data.type;
          if (data.type === "Image") {
            if (mapDateRow) mapDateRow.style.display = "none";
            if (mapCustomReducerGroup) mapCustomReducerGroup.style.display = "none";
          } else {
            if (mapDateRow) mapDateRow.style.display = "flex";
            if (mapCustomReducerGroup) mapCustomReducerGroup.style.display = "flex";
          }

          if (mapCustomBandGroup) mapCustomBandGroup.style.display = "flex";
          if (mapCustomScalePresetGroup) mapCustomScalePresetGroup.style.display = "flex";
          if (mapCustomVisRow) mapCustomVisRow.style.display = "flex";
          if (mapCustomPaletteGroup) mapCustomPaletteGroup.style.display = "flex";
          
          // Trigger band select change to auto-load ranges & units
          mapCustomBandSelect.dispatchEvent(new Event("change"));
          
        } catch (err) {
          showMapError(err.message);
        } finally {
          mapCustomLoadBtn.disabled = false;
          mapCustomLoadBtn.textContent = "Load";
        }
      });
    }

    function showMapError(msg) {
      if (mapCustomError) {
        mapCustomError.textContent = msg;
        mapCustomError.style.display = "block";
      }
    }

    if (datasetSelect) {
      datasetSelect.addEventListener("change", () => {
        updateDatasetUI(datasetSelect.value, datasetInfoBox, startDateInput, endDateInput, mapDateRow);
        
        if (datasetSelect.value === "custom") {
          if (mapCustomPanel) mapCustomPanel.style.display = "flex";
        } else {
          if (mapCustomPanel) mapCustomPanel.style.display = "none";
        }
        
        // Map scale update logic
        const meta = datasetMetadata[datasetSelect.value];
        if (meta && mapScaleCustom) {
          mapScaleCustom.value = meta.res;
          
          if (mapScaleSelect) {
            const nativeOption = mapScaleSelect.querySelector('option[value="native"]');
            if (nativeOption) {
              nativeOption.textContent = `${meta.res.toLocaleString()}m (Native)`;
            }
          }
        } else if (datasetSelect.value === "custom" && mapScaleCustom) {
          mapScaleCustom.value = 5000;
          if (mapScaleSelect) {
            const nativeOption = mapScaleSelect.querySelector('option[value="native"]');
            if (nativeOption) {
              nativeOption.textContent = "5,000m (Default Custom)";
            }
          }
        }
      });
      // Trigger initial load
      datasetSelect.dispatchEvent(new Event('change'));
    }

    if (mapScaleSelect && mapScaleCustom) {
      mapScaleSelect.addEventListener("change", (e) => {
        if (e.target.value === "custom") {
          mapScaleCustom.style.display = "block";
          mapScaleCustom.required = true;
        } else {
          mapScaleCustom.style.display = "none";
          mapScaleCustom.required = false;
          if (e.target.value === "native") {
            const meta = datasetMetadata[datasetSelect.value];
            if (meta) mapScaleCustom.value = meta.res;
          } else {
            mapScaleCustom.value = parseInt(e.target.value, 10);
          }
        }
      });
    }

    const roiTagsContainer = document.getElementById("roi_tags_container");
    let selectedROIs = new Set();

    function renderROITags() {
      if (!roiTagsContainer) return;
      roiTagsContainer.innerHTML = "";
      selectedROIs.forEach(roi => {
        const tag = document.createElement("div");
        tag.style.cssText = "background: rgba(88, 166, 255, 0.15); border: 1px solid rgba(88, 166, 255, 0.4); color: #58a6ff; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;";
        tag.innerHTML = `<span>${roi}</span><button type="button" style="background: none; border: none; color: #58a6ff; cursor: pointer; padding: 0; font-size: 1rem; line-height: 1;">&times;</button>`;
        tag.querySelector("button").addEventListener("click", () => {
          selectedROIs.delete(roi);
          renderROITags();
          triggerMapUpdate();
        });
        roiTagsContainer.appendChild(tag);
      });
    }

    function handleROISelection(e) {
      if (e.target.value) {
        selectedROIs.add(e.target.value);
        e.target.value = ""; // Reset dropdown
        renderROITags();
        triggerMapUpdate();
      }
    }

    // ROI Toggle Logic
    const roiRadios = document.querySelectorAll('input[name="roi_type"]');
    roiRadios.forEach(radio => {
      radio.addEventListener("change", (e) => {
        selectedROIs.clear();
        renderROITags();
        countryInput.value = "";
        regionInput.value = "";
        triggerMapUpdate();
        
        if (e.target.value === "country") {
          countryInput.style.display = "block";
          regionInput.style.display = "none";
          countryInput.required = selectedROIs.size === 0;
          regionInput.required = false;
        } else {
          countryInput.style.display = "none";
          regionInput.style.display = "block";
          countryInput.required = false;
          regionInput.required = selectedROIs.size === 0;
        }
      });
    });

    // Reactive Map Update Logic
    async function triggerMapUpdate() {
      if (mapErrorOverlay) mapErrorOverlay.style.display = "none";
      const dataset = datasetSelect.value;
      const isCustom = dataset === "custom";
      const customAsset = mapCustomAssetInput.value.trim();

      if (isCustom && (!customAsset || !mapCustomBandSelect.value)) {
        return; // Don't trigger map update until custom ID loaded
      }

      const startDate = isCustom && loadedMapAssetType === "Image" ? "2000-01-01" : startDateInput.value;
      const endDate = isCustom && loadedMapAssetType === "Image" ? "2000-01-02" : endDateInput.value;
      
      const roiType = document.querySelector('input[name="roi_type"]:checked').value;
      
      // Update form required state based on selections
      if (roiType === "country") {
        countryInput.required = selectedROIs.size === 0;
      } else {
        regionInput.required = selectedROIs.size === 0;
      }

      if (!dataset || (!isCustom && (!startDate || !endDate)) || selectedROIs.size === 0) {
        if (currentEELayer) {
          map.removeLayer(currentEELayer);
          currentEELayer = null;
        }
        return; // Wait until all required fields are filled
      }

      const roiNames = Array.from(selectedROIs).join(",");

      if (mapLoadingOverlay) mapLoadingOverlay.style.display = "flex";

      try {
        let queryUrl = `${BACKEND_URL}/map?dataset=${encodeURIComponent(isCustom ? customAsset : dataset)}&start_date=${startDate}&end_date=${endDate}&roi_type=${roiType}&roi_names=${encodeURIComponent(roiNames)}`;
        
        if (isCustom) {
          const band = mapCustomBandSelect.value;
          const reducer = document.getElementById("map_custom_reducer").value;
          const multiplier = parseFloat(document.getElementById("map_custom_multiplier").value) || 1.0;
          const offset = parseFloat(document.getElementById("map_custom_offset").value) || 0.0;
          const vis_min = parseFloat(document.getElementById("map_custom_vis_min").value) || 0.0;
          const vis_max = parseFloat(document.getElementById("map_custom_vis_max").value) || 100.0;
          let palette = document.getElementById("map_custom_palette").value;
          if (palette === "recommended" && mapCustomPalette.dataset.customPalette) {
            palette = mapCustomPalette.dataset.customPalette;
          }
          
          queryUrl += `&band=${encodeURIComponent(band)}&reducer=${encodeURIComponent(reducer)}&multiplier=${multiplier}&offset=${offset}&vis_min=${vis_min}&vis_max=${vis_max}&palette=${encodeURIComponent(palette)}`;
        }

        const response = await fetch(queryUrl);
        const data = await response.json();

        if (!response.ok) throw new Error(data.detail || "Failed to load map tiles");

        // Remove old EE layer if exists
        if (currentEELayer) {
          map.removeLayer(currentEELayer);
        }

        // Add new EE layer
        currentEELayer = L.tileLayer(data.urlFormat, {
          attribution: "Map Data &copy; Google Earth Engine",
          maxZoom: 20
        }).addTo(map);

        // Auto-zoom to bounds if returned
        if (data.bounds) {
          map.fitBounds(data.bounds, { padding: [20, 20], maxZoom: 8 });
        }
      } catch (error) {
        console.error("Map Update Error:", error);
        if (mapErrorOverlay && mapErrorText) {
          mapErrorText.textContent = error.message;
          mapErrorOverlay.style.display = "flex";
        }
      } finally {
        if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
      }
    }

    [datasetSelect, startDateInput, endDateInput,
     mapCustomBandSelect,
     document.getElementById("map_custom_reducer"),
     document.getElementById("map_custom_multiplier"),
     document.getElementById("map_custom_offset"),
     document.getElementById("map_custom_vis_min"),
     document.getElementById("map_custom_vis_max"),
     document.getElementById("map_custom_palette")
    ].forEach(el => {
      if (el) el.addEventListener("change", triggerMapUpdate);
    });

    if (countryInput) countryInput.addEventListener("change", handleROISelection);
    if (regionInput) regionInput.addEventListener("change", handleROISelection);
    
    // Initial required state setup
    countryInput.required = true;

    // Handle Map Interface Export
    const mapForm = document.getElementById("nativeMapForm");
    if (mapForm) {
      const mapExportBtn = document.getElementById("mapExportBtn");
      const mapExportStatus = document.getElementById("mapExportStatus");
      const mapStatusText = document.getElementById("mapStatusText");
      const mapStatusMessage = document.getElementById("mapStatusMessage");
      const mapDownloadContainer = document.getElementById("mapDownloadContainer");
      const mapDownloadLink = document.getElementById("mapDownloadLink");
      const mapStatusDot = document.getElementById("mapStatusDot");
      const mapTimer = document.getElementById("mapTimer");

      let mapTimerInterval = null;
      let mapStartTime = null;
      let mapEstimatedText = "";

      function estimateExportTime(startDateStr, endDateStr, scale) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        const days = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        
        // Base time for a 30-day average at 5000m (approx 1.5 mins compute)
        let baseSeconds = 90;
        
        // Scale factor: Pixel count grows quadratically as scale decreases.
        // Earth Engine parallelizes well, so time growth is sub-linear to pixel count.
        const scaleMultiplier = Math.pow(5000 / scale, 1.2); 
        
        // Temporal factor: Time scales linearly with number of days to average
        const timeMultiplier = Math.max(0.5, days / 30);
        
        let estimatedSeconds = baseSeconds * scaleMultiplier * timeMultiplier;
        
        // Add Earth Engine queue buffer (tasks usually sit in READY for ~30-60s)
        estimatedSeconds += 45;
        
        // Convert to broad minute ranges
        const minMins = Math.max(1, Math.floor((estimatedSeconds * 0.6) / 60));
        const maxMins = Math.ceil((estimatedSeconds * 1.4) / 60);
        
        if (maxMins > 60) {
          return "> 1 hour (depending on country size)";
        }
        return `~ ${minMins} - ${maxMins} mins`;
      }

      function updateMapTimer() {
        if (!mapStartTime) return;
        const elapsedSecs = Math.floor((Date.now() - mapStartTime) / 1000);
        const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
        const secs = (elapsedSecs % 60).toString().padStart(2, '0');
        mapTimer.textContent = `Time Elapsed: ${mins}:${secs} | ETA: ${mapEstimatedText}`;
      }

      mapForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        mapExportBtn.disabled = true;
        mapExportBtn.textContent = "Starting...";
        mapExportStatus.style.display = "block";
        mapExportStatus.scrollIntoView({ behavior: 'smooth', block: 'end' });
        mapDownloadContainer.style.display = "none";
        mapStatusText.textContent = "SUBMITTED";
        mapStatusMessage.textContent = "Submitting task to Earth Engine...";
        mapStatusDot.style.backgroundColor = "#d2a8ff";

        const formData = new FormData(mapForm);
        const datasetVal = formData.get("dataset");
        const isCustom = datasetVal === "custom";

        const startDate = isCustom && loadedMapAssetType === "Image" ? "2000-01-01" : formData.get("start_date");
        const endDate = isCustom && loadedMapAssetType === "Image" ? "2000-01-02" : formData.get("end_date");
        const scale = parseInt(formData.get("scale"), 10);

        mapEstimatedText = estimateExportTime(startDate, endDate, scale);

        mapTimer.style.display = "block";
        mapStartTime = Date.now();
        updateMapTimer();
        if (mapTimerInterval) clearInterval(mapTimerInterval);
        mapTimerInterval = setInterval(updateMapTimer, 1000);

        const roiType = document.querySelector('input[name="roi_type"]:checked').value;
        const payload = {
          dataset: isCustom ? mapCustomAssetInput.value.trim() : datasetVal,
          roi_type: roiType,
          roi_names: Array.from(selectedROIs),
          start_date: startDate,
          end_date: endDate,
          scale: scale
        };

        if (isCustom) {
          payload.band = mapCustomBandSelect.value;
          payload.reducer = document.getElementById("map_custom_reducer").value;
          payload.multiplier = parseFloat(document.getElementById("map_custom_multiplier").value) || 1.0;
          payload.offset = parseFloat(document.getElementById("map_custom_offset").value) || 0.0;
        }

        try {
          const response = await fetch(`${BACKEND_URL}/exports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to start export");

          pollMapTaskStatus(data.ee_task_id);
        } catch (error) {
          mapStatusText.textContent = "FAILED";
          mapStatusMessage.textContent = error.message;
          mapStatusDot.style.backgroundColor = "#f85149";
          mapExportBtn.disabled = false;
          mapExportBtn.textContent = "Start Backend Export";
          if (mapTimerInterval) clearInterval(mapTimerInterval);
        }
      });

      async function pollMapTaskStatus(taskId) {
        try {
          const response = await fetch(`${BACKEND_URL}/exports/${taskId}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to fetch status");

          mapStatusText.textContent = data.state;

          if (data.state === "READY" || data.state === "RUNNING") {
            mapStatusMessage.textContent = "Running in Earth Engine. This may take a while...";
            mapStatusDot.style.backgroundColor = "#e3b341";
            setTimeout(() => pollMapTaskStatus(taskId), 10000);
          } else if (data.state === "COMPLETED") {
            mapStatusMessage.textContent = "Completed! Generating link...";
            mapStatusDot.style.backgroundColor = "#2ea043";
            if (mapTimerInterval) clearInterval(mapTimerInterval);
            fetchMapDownloadLink(taskId);
          } else {
            mapStatusMessage.textContent = `Task ended: ${data.state}`;
            mapStatusDot.style.backgroundColor = "#f85149";
            mapExportBtn.disabled = false;
            mapExportBtn.textContent = "Start Backend Export";
            if (mapTimerInterval) clearInterval(mapTimerInterval);
          }
        } catch (error) {
          mapStatusText.textContent = "ERROR";
          mapStatusMessage.textContent = error.message;
          mapStatusDot.style.backgroundColor = "#f85149";
          mapExportBtn.disabled = false;
          mapExportBtn.textContent = "Start Backend Export";
          if (mapTimerInterval) clearInterval(mapTimerInterval);
        }
      }

      async function fetchMapDownloadLink(taskId) {
        try {
          const response = await fetch(`${BACKEND_URL}/exports/${taskId}/download`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to get download URL");

          mapStatusMessage.textContent = "Ready!";
          mapDownloadLink.href = data.download_url;
          mapDownloadContainer.style.display = "block";
          
          mapExportBtn.disabled = false;
          mapExportBtn.textContent = "Start Backend Export";
        } catch (error) {
          mapStatusText.textContent = "ERROR";
          mapStatusMessage.textContent = error.message;
          mapStatusDot.style.backgroundColor = "#f85149";
          mapExportBtn.disabled = false;
          mapExportBtn.textContent = "Start Backend Export";
        }
      }
    }
  }
});
