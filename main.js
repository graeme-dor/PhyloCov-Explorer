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

    srtm: { 
      res: 30, 
      text: "Native Resolution: 30m | Temporal: Static",
      start: null,
      end: null,
      rangeText: "Available: Static topography dataset (Feb 2000)"
    }
  };

  // Calculate total months between two YYYY-MM-DD dates
  function calculateTotalMonths(startStr, endStr) {
    const s = new Date(startStr);
    const e = new Date(endStr);
    return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  }

  // Get date string (first of month) from base date and months offset
  function getDateFromMonths(baseStr, months) {
    const s = new Date(baseStr);
    s.setUTCMonth(s.getUTCMonth() + months);
    const y = s.getUTCFullYear();
    const m = String(s.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  // Get date string (last of month) from base date and months offset
  function getEndDateFromMonths(baseStr, months) {
    const s = new Date(baseStr);
    s.setUTCMonth(s.getUTCMonth() + months + 1);
    s.setUTCDate(0); // set to last day of previous month
    const y = s.getUTCFullYear();
    const m = String(s.getUTCMonth() + 1).padStart(2, '0');
    const d = String(s.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatMonthLabel(baseStr, months) {
    const s = new Date(baseStr);
    s.setUTCMonth(s.getUTCMonth() + months);
    return `${monthNames[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  }

  function setupDualSlider(sliderTrackId, startSliderId, endSliderId, dateLabelId, hiddenStartId, hiddenEndId, baseDate, totalMonths, onChangeCallback) {
    const sliderTrack = document.getElementById(sliderTrackId);
    const startSlider = document.getElementById(startSliderId);
    const endSlider = document.getElementById(endSliderId);
    const dateLabel = document.getElementById(dateLabelId);
    const hiddenStart = document.getElementById(hiddenStartId);
    const hiddenEnd = document.getElementById(hiddenEndId);

    if (!startSlider || !endSlider || !sliderTrack) return;

    startSlider.min = 0;
    startSlider.max = totalMonths;
    endSlider.min = 0;
    endSlider.max = totalMonths;

    function updateSliderColorsAndValues(e) {
      let val1 = parseInt(startSlider.value);
      let val2 = parseInt(endSlider.value);

      if (val1 > val2) {
        if (e && e.target === startSlider) {
          startSlider.value = val2;
          val1 = val2;
        } else {
          endSlider.value = val1;
          val2 = val1;
        }
      }

      const pct1 = (val1 / totalMonths) * 100;
      const pct2 = (val2 / totalMonths) * 100;
      sliderTrack.style.background = `linear-gradient(to right, #30363d 0%, #30363d ${pct1}%, var(--accent-color) ${pct1}%, var(--accent-color) ${pct2}%, #30363d ${pct2}%, #30363d 100%)`;

      const startDateStr = getDateFromMonths(baseDate, val1);
      const endDateStr = getEndDateFromMonths(baseDate, val2);
      
      if (hiddenStart) hiddenStart.value = startDateStr;
      if (hiddenEnd) hiddenEnd.value = endDateStr;

      if (dateLabel) {
        dateLabel.textContent = `${formatMonthLabel(baseDate, val1)} - ${formatMonthLabel(baseDate, val2)}`;
      }

      if (onChangeCallback) onChangeCallback(startDateStr, endDateStr);
    }

    startSlider.oninput = updateSliderColorsAndValues;
    endSlider.oninput = updateSliderColorsAndValues;

    updateSliderColorsAndValues();
  }

  function initDatasetSlider(datasetVal, prefix, customDates = null) {
    const isMap = prefix === "map";
    const startSliderId = `${prefix}_start_slider`;
    const endSliderId = `${prefix}_end_slider`;
    const trackId = `${prefix}_slider_track`;
    const labelId = `${prefix}_date_range_label`;
    const hiddenStartId = isMap ? "map_start_date" : "start_date";
    const hiddenEndId = isMap ? "map_end_date" : "end_date";
    const rowId = isMap ? "map_date_row" : "export_date_row";
    
    const row = document.getElementById(rowId);
    if (!row) return;

    if (datasetVal === "srtm") {
      row.style.display = "none";
      return;
    }

    let meta = datasetMetadata[datasetVal];
    if (datasetVal === "custom") {
      if (customDates && customDates.start && customDates.end) {
        meta = { start: customDates.start, end: customDates.end };
      } else {
        row.style.display = "none";
        return;
      }
    }

    if (!meta || !meta.start || !meta.end) {
      row.style.display = "none";
      return;
    }

    row.style.display = "flex";
    const totalMonths = calculateTotalMonths(meta.start, meta.end);

    const startSlider = document.getElementById(startSliderId);
    const endSlider = document.getElementById(endSliderId);
    if (startSlider && endSlider) {
      const defaultStart = Math.max(0, totalMonths - 12);
      startSlider.value = defaultStart;
      endSlider.value = totalMonths;
      
      setupDualSlider(
        trackId, 
        startSliderId, 
        endSliderId, 
        labelId, 
        hiddenStartId, 
        hiddenEndId, 
        meta.start, 
        totalMonths, 
        () => {
          if (isMap && typeof triggerMapUpdate === "function") {
            triggerMapUpdate();
          }
        }
      );
    }
  }

  function updateDatasetUI(datasetVal, infoBox, prefix) {
    if (datasetVal === "custom") {
      if (infoBox) {
        infoBox.textContent = "Custom Google Earth Engine Dataset (enter Asset ID below)";
      }
      const rowId = prefix === "map" ? "map_date_row" : "export_date_row";
      const row = document.getElementById(rowId);
      if (row) row.style.display = "none";
      return;
    }

    const meta = datasetMetadata[datasetVal];
    if (!meta) return;

    if (infoBox) {
      infoBox.textContent = `${meta.text} | ${meta.rangeText}`;
    }

    initDatasetSlider(datasetVal, prefix);
  }

  function parseBeastCoordinates(text) {
    const coords = [];
    const annotations = text.match(/\[&([^\]]+)\]/g);
    if (!annotations) return coords;

    for (const ann of annotations) {
      const dict = {};
      const kvRegex = /([a-zA-Z_0-9%.]+)\s*=\s*({[^}]+}|[-0-9.eE+]+|"[^"]*"|'[^']*')/g;
      let kvMatch;
      while ((kvMatch = kvRegex.exec(ann)) !== null) {
        dict[kvMatch[1].toLowerCase()] = kvMatch[2];
      }
      
      let lat = NaN;
      let lon = NaN;
      
      // 1. Try vector format: location={1.23, 4.56}
      for (const key in dict) {
        const keyLower = key.toLowerCase();
        if (keyLower.endsWith("location") || keyLower === "xy" || keyLower === "coordinates" || keyLower === "coords" || keyLower === "geographic") {
          const val = dict[key];
          const vecMatch = val.match(/\{?\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*\}?/);
          if (vecMatch) {
            lat = parseFloat(vecMatch[1]);
            lon = parseFloat(vecMatch[2]);
          }
        }
      }
      
      // 2. Try split scalar format: location1=-6.705, location2=-5.084
      if (isNaN(lat) || isNaN(lon)) {
        for (const key in dict) {
          const keyLower = key.toLowerCase();
          if (keyLower.endsWith("location1") || keyLower.endsWith("location_1") || keyLower === "lat" || keyLower === "latitude" || keyLower === "y" || keyLower.endsWith("coord1") || keyLower.endsWith("coord_1")) {
            lat = parseFloat(dict[key]);
          }
          if (keyLower.endsWith("location2") || keyLower.endsWith("location_2") || keyLower === "lon" || keyLower === "longitude" || keyLower === "lng" || keyLower === "x" || keyLower.endsWith("coord2") || keyLower.endsWith("coord_2")) {
            lon = parseFloat(dict[key]);
          }
        }
      }
      
      if (!isNaN(lat) && !isNaN(lon)) {
        coords.push({ lat, lon });
      }
    }
    return coords;
  }

  function parseCsvCoordinates(text) {
    const coords = [];
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return coords;
    
    const header = lines[0].toLowerCase().split(/[,\t]/);
    let latIdx = header.findIndex(h => h.includes("lat") || h === "y");
    let lonIdx = header.findIndex(h => h.includes("lon") || h.includes("lng") || h === "x");
    
    if (latIdx === -1 || lonIdx === -1) {
      latIdx = 0;
      lonIdx = 1;
    }
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,\t]/);
      if (cols.length > Math.max(latIdx, lonIdx)) {
        const lat = parseFloat(cols[latIdx]);
        const lon = parseFloat(cols[lonIdx]);
        if (!isNaN(lat) && !isNaN(lon)) {
          coords.push({ lat, lon });
        }
      }
    }
    return coords;
  }

  function parseGeoJsonCoordinates(text) {
    const coords = [];
    try {
      const geojson = JSON.parse(text);
      function traverse(obj) {
        if (!obj) return;
        if (obj.type === "Point") {
          coords.push({ lat: obj.coordinates[1], lon: obj.coordinates[0] });
        } else if (obj.type === "Feature") {
          traverse(obj.geometry);
        } else if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
          obj.features.forEach(traverse);
        } else if (obj.coordinates && Array.isArray(obj.coordinates)) {
          flattenCoordinates(obj.coordinates, obj.type).forEach(c => {
            coords.push({ lat: c[1], lon: c[0] });
          });
        }
      }
      traverse(geojson);
    } catch (e) {
      console.error("GeoJSON parse error", e);
    }
    return coords;
  }

  function flattenCoordinates(coords, type) {
    if (!Array.isArray(coords)) return [];
    if (typeof coords[0] === 'number') {
      return [coords];
    }
    if (type === "LineString" || type === "MultiPoint") {
      return coords;
    }
    if (type === "Polygon" || type === "MultiLineString") {
      return coords.flat(1);
    }
    if (type === "MultiPolygon") {
      return coords.flat(2);
    }
    return coords.flat(5);
  }

  function getPaddedBoundingBox(points, bufferPercent = 5) {
    if (points.length === 0) return null;
    let lats = points.map(p => p.lat);
    let lons = points.map(p => p.lon);
    
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLon = Math.min(...lons);
    let maxLon = Math.max(...lons);
    
    let latDiff = maxLat - minLat;
    let lonDiff = maxLon - minLon;
    
    let latBuffer = latDiff * (bufferPercent / 100);
    let lonBuffer = lonDiff * (bufferPercent / 100);
    
    if (latDiff === 0) latBuffer = 0.25;
    if (lonDiff === 0) lonBuffer = 0.25;
    
    return {
      minLat: Math.max(-90, minLat - latBuffer),
      maxLat: Math.min(90, maxLat + latBuffer),
      minLon: Math.max(-180, minLon - lonBuffer),
      maxLon: Math.min(180, maxLon + lonBuffer)
    };
  }

  function setupFileUpload(prefix, onParsedCallback) {
    const dropzone = document.getElementById(`${prefix}_upload_dropzone`);
    const fileInput = document.getElementById(`${prefix}_beast_upload`);
    const statusText = document.getElementById(`${prefix}_upload_status`);
    const swapCheckbox = document.getElementById(`${prefix}_swap_coordinates`);

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });

    if (swapCheckbox) {
      swapCheckbox.addEventListener("change", () => {
        if (onParsedCallback && uploadedPoints.length > 0) {
          onParsedCallback(uploadedPoints, swapCheckbox.checked);
        }
      });
    }

    function handleFile(file) {
      if (statusText) {
        statusText.style.display = "block";
        statusText.textContent = `Reading file: ${file.name}...`;
        statusText.style.color = "var(--text-muted)";
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        let points = [];
        
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === "json" || extension === "geojson" || text.trim().startsWith("{")) {
          points = parseGeoJsonCoordinates(text);
        } else if (extension === "csv" || extension === "tsv") {
          points = parseCsvCoordinates(text);
        } else {
          points = parseBeastCoordinates(text);
        }

        if (points.length === 0) {
          if (statusText) {
            let errorMsg = "Error: No coordinates found. Check format.";
            if (extension !== "json" && extension !== "geojson" && extension !== "csv" && extension !== "tsv") {
              const matches = text.match(/\[&([^\]]+)\]/g);
              if (matches) {
                const keys = new Set();
                const kvRegex = /([a-zA-Z_0-9%.]+)\s*=/g;
                for (const m of matches) {
                  let kv;
                  while ((kv = kvRegex.exec(m)) !== null) {
                    keys.add(kv[1]);
                  }
                }
                if (keys.size > 0) {
                  const detected = Array.from(keys).slice(0, 10).join(", ");
                  errorMsg += ` (Detected keys: ${detected}${keys.size > 10 ? '...' : ''})`;
                }
              }
            }
            statusText.textContent = errorMsg;
            statusText.style.color = "#f85149";
          }
          return;
        }

        uploadedPoints = points;
        
        if (statusText) {
          statusText.textContent = `Successfully parsed ${points.length} locations.`;
          statusText.style.color = "var(--accent-secondary)";
        }

        const swap = swapCheckbox ? swapCheckbox.checked : false;
        if (onParsedCallback) {
          onParsedCallback(points, swap);
        }
      };

      reader.onerror = function() {
        if (statusText) {
          statusText.textContent = "Error reading file.";
          statusText.style.color = "#f85149";
        }
      };

      reader.readAsText(file);
    }
  }

  let uploadedPoints = [];

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

    const exportScaleSelect = document.getElementById("export_scale_select");
    const exportScaleCustom = document.getElementById("scale");

    if (exportCustomScalePreset) {
      exportCustomScalePreset.addEventListener("change", () => {
        const val = exportCustomScalePreset.value;
        if (val === "none") {
          exportCustomMultiplier.value = 1.0;
          exportCustomOffset.value = 0.0;
          exportCustomScalingRow.style.display = "none";
        } else if (val === "custom") {
          exportCustomScalingRow.style.display = "flex";
        }
      });
    }

    if (exportCustomBandSelect) {
      exportCustomBandSelect.addEventListener("change", () => {
        // Reset scale preset to original values (no scaling)
        exportCustomScalePreset.value = "none";
        exportCustomScalePreset.dispatchEvent(new Event("change"));
      });
    }

    if (exportScaleSelect && exportScaleCustom) {
      exportScaleSelect.addEventListener("change", (e) => {
        if (e.target.value === "custom") {
          exportScaleCustom.style.display = "block";
          exportScaleCustom.required = true;
        } else {
          exportScaleCustom.style.display = "none";
          exportScaleCustom.required = false;
          if (e.target.value === "native") {
            const val = exportDatasetSelect.value;
            if (val === "custom") {
              exportScaleCustom.value = exportScaleCustom.dataset.nativeResolution || 5000;
            } else {
              const meta = datasetMetadata[val];
              if (meta) exportScaleCustom.value = meta.res;
            }
          } else {
            exportScaleCustom.value = parseInt(e.target.value, 10);
          }
        }
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
          exportScaleCustom.dataset.nativeResolution = data.resolution;
          exportScaleCustom.value = data.resolution;
          if (exportScaleSelect) {
            const nativeOption = exportScaleSelect.querySelector('option[value="native"]');
            if (nativeOption) {
              nativeOption.textContent = `${data.resolution.toLocaleString()}m (Native)`;
            }
            exportScaleSelect.value = "native";
            exportScaleCustom.style.display = "none";
            exportScaleCustom.required = false;
          }

          if (data.type === "Image") {
            if (exportDateRow) exportDateRow.style.display = "none";
            if (exportCustomReducerGroup) exportCustomReducerGroup.style.display = "none";
          } else {
            if (exportDateRow) exportDateRow.style.display = "flex";
            if (exportCustomReducerGroup) exportCustomReducerGroup.style.display = "flex";
            if (data.start_date && data.end_date) {
              initDatasetSlider("custom", "export", { start: data.start_date, end: data.end_date });
            } else {
              initDatasetSlider("custom", "export");
            }
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

    const exportRoiRadios = document.querySelectorAll('input[name="export_roi_type"]');
    const exportCountryInput = document.getElementById("country");
    const exportRegionInput = document.getElementById("export_region");
    const exportUploadPanel = document.getElementById("export_upload_panel");
    let currentExportBBox = null;

    exportRoiRadios.forEach(radio => {
      radio.addEventListener("change", (e) => {
        exportCountryInput.value = "";
        exportRegionInput.value = "";
        currentExportBBox = null;
        
        if (e.target.value === "country") {
          exportCountryInput.style.display = "block";
          exportRegionInput.style.display = "none";
          exportUploadPanel.style.display = "none";
          exportCountryInput.required = true;
          exportRegionInput.required = false;
        } else if (e.target.value === "region") {
          exportCountryInput.style.display = "none";
          exportRegionInput.style.display = "block";
          exportUploadPanel.style.display = "none";
          exportCountryInput.required = false;
          exportRegionInput.required = true;
        } else if (e.target.value === "bbox") {
          exportCountryInput.style.display = "none";
          exportRegionInput.style.display = "none";
          exportUploadPanel.style.display = "flex";
          exportCountryInput.required = false;
          exportRegionInput.required = false;
        }
      });
    });

    setupFileUpload("export", (points, swap) => {
      const mappedPoints = swap ? points.map(p => ({ lat: p.lon, lon: p.lat })) : points;
      const bbox = getPaddedBoundingBox(mappedPoints, 5);
      if (bbox) {
        currentExportBBox = bbox;
      }
    });

    if (exportDatasetSelect) {
      exportDatasetSelect.addEventListener("change", () => {
        updateDatasetUI(exportDatasetSelect.value, exportDatasetInfoBox, "export");
        if (exportDatasetSelect.value === "custom") {
          if (exportCustomPanel) exportCustomPanel.style.display = "flex";
          exportScaleCustom.value = exportScaleCustom.dataset.nativeResolution || 5000;
          if (exportScaleSelect) {
            const nativeOption = exportScaleSelect.querySelector('option[value="native"]');
            if (nativeOption) {
              const resText = exportScaleCustom.dataset.nativeResolution ? `${parseInt(exportScaleCustom.dataset.nativeResolution).toLocaleString()}m` : "5,000m";
              nativeOption.textContent = `${resText} (Native)`;
            }
            exportScaleSelect.value = "native";
            exportScaleCustom.style.display = "none";
            exportScaleCustom.required = false;
          }
        } else {
          if (exportCustomPanel) exportCustomPanel.style.display = "none";
          const meta = datasetMetadata[exportDatasetSelect.value];
          if (meta && exportScaleCustom) {
            exportScaleCustom.value = meta.res;
            if (exportScaleSelect) {
              const nativeOption = exportScaleSelect.querySelector('option[value="native"]');
              if (nativeOption) {
                nativeOption.textContent = `${meta.res.toLocaleString()}m (Native)`;
              }
              exportScaleSelect.value = "native";
              exportScaleCustom.style.display = "none";
              exportScaleCustom.required = false;
            }
          }
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

      const roiType = document.querySelector('input[name="export_roi_type"]:checked').value;
      let roiNamesList = [];
      if (roiType === "bbox") {
        if (!currentExportBBox) {
          alert("Please upload a coordinate file first.");
          exportBtn.disabled = false;
          exportBtn.textContent = "Start Export";
          return;
        }
        roiNamesList = [`${currentExportBBox.minLat},${currentExportBBox.minLon},${currentExportBBox.maxLat},${currentExportBBox.maxLon}`];
      } else if (roiType === "region") {
        roiNamesList = [exportRegionInput.value];
      } else {
        roiNamesList = [exportCountryInput.value];
      }

      const payload = {
        dataset: isCustom ? exportCustomAssetInput.value.trim() : datasetVal,
        roi_type: roiType,
        roi_names: roiNamesList,
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
    let uploadedBBoxLayer = null;
    let uploadedMarkersLayer = null;
    let currentCustomBBox = null;

    function renderUploadedDataOnMap(map, points, swap = false) {
      if (uploadedBBoxLayer) map.removeLayer(uploadedBBoxLayer);
      if (uploadedMarkersLayer) map.removeLayer(uploadedMarkersLayer);
      
      if (points.length === 0) return;
      
      const mappedPoints = swap ? points.map(p => ({ lat: p.lon, lon: p.lat })) : points;
      
      // Plot markers
      const markers = mappedPoints.map(p => L.circleMarker([p.lat, p.lon], {
        radius: 4,
        fillColor: "#58a6ff",
        color: "#161b22",
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6
      }));
      uploadedMarkersLayer = L.layerGroup(markers).addTo(map);
      
      // Calculate bounding box
      const bbox = getPaddedBoundingBox(mappedPoints, 5);
      if (bbox) {
        // Draw rectangle
        uploadedBBoxLayer = L.rectangle([
          [bbox.minLat, bbox.minLon],
          [bbox.maxLat, bbox.maxLon]
        ], {
          color: "#2ea043",
          weight: 2,
          fillColor: "#2ea043",
          fillOpacity: 0.1,
          dashArray: "4, 4"
        }).addTo(map);
        
        // Fit map bounds
        map.fitBounds([
          [bbox.minLat, bbox.minLon],
          [bbox.maxLat, bbox.maxLon]
        ], { padding: [40, 40] });
        
        currentCustomBBox = bbox;
        
        // Trigger map tiles update
        triggerMapUpdate();
      }
    }

    setupFileUpload("map", (points, swap) => {
      renderUploadedDataOnMap(map, points, swap);
    });

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
    const mapCustomPaletteGroup = document.getElementById("map_custom_palette_group");
    const mapCustomScalePreset = document.getElementById("map_custom_scale_preset");
    const mapCustomMultiplier = document.getElementById("map_custom_multiplier");
    const mapCustomOffset = document.getElementById("map_custom_offset");
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

        // Reset scale preset to original values (no scaling)
        mapCustomScalePreset.value = "none";
        mapCustomScalePreset.dispatchEvent(new Event("change"));

        // 2. Configure recommended visualization palette parameters
        if (band.vis && band.vis.palette && band.vis.palette.length > 0) {
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
          mapScaleCustom.dataset.nativeResolution = data.resolution;
          mapScaleCustom.value = data.resolution;
          if (mapScaleSelect) {
            const nativeOption = mapScaleSelect.querySelector('option[value="native"]');
            if (nativeOption) {
              nativeOption.textContent = `${data.resolution.toLocaleString()}m (Native)`;
            }
            mapScaleSelect.value = "native";
            mapScaleCustom.style.display = "none";
            mapScaleCustom.required = false;
          }

          if (data.type === "Image") {
            if (mapDateRow) mapDateRow.style.display = "none";
            if (mapCustomReducerGroup) mapCustomReducerGroup.style.display = "none";
          } else {
            if (mapDateRow) mapDateRow.style.display = "flex";
            if (mapCustomReducerGroup) mapCustomReducerGroup.style.display = "flex";
          }

          if (mapCustomBandGroup) mapCustomBandGroup.style.display = "flex";
          if (mapCustomScalePresetGroup) mapCustomScalePresetGroup.style.display = "flex";
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
        updateDatasetUI(datasetSelect.value, datasetInfoBox, "map");
        
        if (datasetSelect.value === "custom") {
          if (mapCustomPanel) mapCustomPanel.style.display = "flex";
          mapScaleCustom.value = mapScaleCustom.dataset.nativeResolution || 5000;
          if (mapScaleSelect) {
            const nativeOption = mapScaleSelect.querySelector('option[value="native"]');
            if (nativeOption) {
              const resText = mapScaleCustom.dataset.nativeResolution ? `${parseInt(mapScaleCustom.dataset.nativeResolution).toLocaleString()}m` : "5,000m";
              nativeOption.textContent = `${resText} (Native)`;
            }
            mapScaleSelect.value = "native";
            mapScaleCustom.style.display = "none";
            mapScaleCustom.required = false;
          }
        } else {
          if (mapCustomPanel) mapCustomPanel.style.display = "none";
          
          // Map scale update logic
          const meta = datasetMetadata[datasetSelect.value];
          if (meta && mapScaleCustom) {
            mapScaleCustom.value = meta.res;
            
            if (mapScaleSelect) {
              const nativeOption = mapScaleSelect.querySelector('option[value="native"]');
              if (nativeOption) {
                nativeOption.textContent = `${meta.res.toLocaleString()}m (Native)`;
              }
              mapScaleSelect.value = "native";
              mapScaleCustom.style.display = "none";
              mapScaleCustom.required = false;
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
        
        // Clear custom coordinates
        currentCustomBBox = null;
        if (uploadedBBoxLayer) map.removeLayer(uploadedBBoxLayer);
        if (uploadedMarkersLayer) map.removeLayer(uploadedMarkersLayer);
        
        const mapUploadPanel = document.getElementById("map_upload_panel");
        
        if (e.target.value === "country") {
          countryInput.style.display = "block";
          regionInput.style.display = "none";
          mapUploadPanel.style.display = "none";
          countryInput.required = selectedROIs.size === 0;
          regionInput.required = false;
        } else if (e.target.value === "region") {
          countryInput.style.display = "none";
          regionInput.style.display = "block";
          mapUploadPanel.style.display = "none";
          countryInput.required = false;
          regionInput.required = selectedROIs.size === 0;
        } else if (e.target.value === "bbox") {
          countryInput.style.display = "none";
          regionInput.style.display = "none";
          mapUploadPanel.style.display = "flex";
          countryInput.required = false;
          regionInput.required = false;
          
          if (uploadedPoints.length > 0) {
            const swap = document.getElementById("map_swap_coordinates").checked;
            renderUploadedDataOnMap(map, uploadedPoints, swap);
          }
        }
        triggerMapUpdate();
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
      } else if (roiType === "region") {
        regionInput.required = selectedROIs.size === 0;
      } else {
        countryInput.required = false;
        regionInput.required = false;
      }

      if (!dataset || (!isCustom && (!startDate || !endDate)) || (roiType !== "bbox" && selectedROIs.size === 0) || (roiType === "bbox" && !currentCustomBBox)) {
        if (currentEELayer) {
          map.removeLayer(currentEELayer);
          currentEELayer = null;
        }
        return; // Wait until all required fields are filled
      }

      let roiNames = "";
      if (roiType === "bbox") {
        roiNames = `${currentCustomBBox.minLat},${currentCustomBBox.minLon},${currentCustomBBox.maxLat},${currentCustomBBox.maxLon}`;
      } else {
        roiNames = Array.from(selectedROIs).join(",");
      }

      if (mapLoadingOverlay) mapLoadingOverlay.style.display = "flex";

      try {
        let queryUrl = `${BACKEND_URL}/map?dataset=${encodeURIComponent(isCustom ? customAsset : dataset)}&start_date=${startDate}&end_date=${endDate}&roi_type=${roiType}&roi_names=${encodeURIComponent(roiNames)}`;
        
        if (isCustom) {
          const band = mapCustomBandSelect.value;
          const reducer = document.getElementById("map_custom_reducer").value;
          const multiplier = parseFloat(document.getElementById("map_custom_multiplier").value) || 1.0;
          const offset = parseFloat(document.getElementById("map_custom_offset").value) || 0.0;
          let palette = document.getElementById("map_custom_palette").value;
          if (palette === "recommended" && mapCustomPalette.dataset.customPalette) {
            palette = mapCustomPalette.dataset.customPalette;
          }
          
          queryUrl += `&band=${encodeURIComponent(band)}&reducer=${encodeURIComponent(reducer)}&multiplier=${multiplier}&offset=${offset}&palette=${encodeURIComponent(palette)}`;
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
        let roiNamesList = [];
        if (roiType === "bbox") {
          if (!currentCustomBBox) {
            alert("Please upload a coordinate file first.");
            mapExportBtn.disabled = false;
            mapExportBtn.textContent = "Start Backend Export";
            if (mapTimerInterval) clearInterval(mapTimerInterval);
            return;
          }
          roiNamesList = [`${currentCustomBBox.minLat},${currentCustomBBox.minLon},${currentCustomBBox.maxLat},${currentCustomBBox.maxLon}`];
        } else {
          roiNamesList = Array.from(selectedROIs);
        }

        const payload = {
          dataset: isCustom ? mapCustomAssetInput.value.trim() : datasetVal,
          roi_type: roiType,
          roi_names: roiNamesList,
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
