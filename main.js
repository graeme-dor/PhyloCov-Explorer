import './style.css';
import countryBounds from './country_bboxes.json';

const CONTINENT_BOUNDS = {
  "Africa": [[-35.0, -18.0], [38.0, 52.0]],
  "Antarctica": [[-90.0, -180.0], [-60.0, 180.0]],
  "Asia": [[1.0, 26.0], [77.0, 180.0]],
  "Europe": [[34.0, -25.0], [72.0, 45.0]],
  "North America": [[7.0, -168.0], [84.0, -52.0]],
  "Oceania": [[-50.0, 110.0], [0.0, 180.0]],
  "South America": [[-56.0, -82.0], [13.0, -34.0]]
};

document.addEventListener("DOMContentLoaded", () => {
  const BACKEND_URL = "https://phylocov-export-backend-719941553080.europe-west1.run.app";

  const getPastDate = (monthsAgo) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toISOString().split('T')[0];
  };

  const era5End = getPastDate(3);
  const modisEnd = getPastDate(1);
  const chirpsEnd = getPastDate(2);
  
  // Shared Dataset Metadata with Spatial Extents and Native Resolutions
  const datasetMetadata = {
    chirps: { 
      res: 5566, 
      extentDesc: "50°S to 50°N (Quasi-Global)",
      bounds: { minLat: -50.0, maxLat: 50.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: ~5.5km | Extent: 50°S–50°N (Quasi-Global) | Temporal: Daily",
      start: "1981-01-01",
      end: chirpsEnd,
      rangeText: `Available: 1981-01-01 to ${chirpsEnd} (~2 months lag)`
    },
    era5: { 
      res: 27830, 
      extentDesc: "Global (90°S to 90°N)",
      bounds: { minLat: -90.0, maxLat: 90.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: ~27.8km | Extent: Global | Temporal: Daily",
      start: "1979-01-01",
      end: era5End,
      rangeText: `Available: 1979-01-01 to ${era5End} (~3 months lag)`
    },
    era5_land_monthly: { 
      res: 11132, 
      extentDesc: "Global Land (90°S to 90°N)",
      bounds: { minLat: -90.0, maxLat: 90.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: ~11.1km | Extent: Global Land | Temporal: Monthly",
      start: "1950-01-01",
      end: era5End,
      rangeText: `Available: 1950-01-01 to ${era5End} (~2-3 months lag)`
    },
    modis_ndvi: { 
      res: 250, 
      extentDesc: "60°S to 80°N (Global Land)",
      bounds: { minLat: -60.0, maxLat: 80.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: 250m | Extent: 60°S–80°N (Global Land) | Temporal: 16-day",
      start: "2000-02-18",
      end: modisEnd,
      rangeText: `Available: 2000-02-18 to ${modisEnd} (~1 month lag)`
    },
    modis_lst_day: { 
      res: 5600, 
      extentDesc: "Global Land (90°S to 90°N)",
      bounds: { minLat: -90.0, maxLat: 90.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: ~5.6km | Extent: Global Land | Temporal: Monthly",
      start: "2000-03-05",
      end: modisEnd,
      rangeText: `Available: 2000-03-05 to ${modisEnd} (~1 month lag)`
    },
    modis_lst_night: { 
      res: 5600, 
      extentDesc: "Global Land (90°S to 90°N)",
      bounds: { minLat: -90.0, maxLat: 90.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: ~5.6km | Extent: Global Land | Temporal: Monthly",
      start: "2000-03-05",
      end: modisEnd,
      rangeText: `Available: 2000-03-05 to ${modisEnd} (~1 month lag)`
    },
    srtm: { 
      res: 30, 
      extentDesc: "56°S to 60°N (Near-Global)",
      bounds: { minLat: -56.0, maxLat: 60.0, minLon: -180.0, maxLon: 180.0 },
      text: "Native Resolution: 30m | Extent: 56°S–60°N (Near-Global) | Temporal: Static",
      start: null,
      end: null,
      rangeText: "Available: Static topography dataset (Feb 2000)"
    }
  };

  // Fetch real-time available date limits and extents from GEE backend
  async function loadDatasetLimits() {
    try {
      const response = await fetch(`${BACKEND_URL}/datasets/limits`);
      if (response.ok) {
        const limits = await response.json();
        for (const [key, limit] of Object.entries(limits)) {
          if (datasetMetadata[key] && limit) {
            datasetMetadata[key].start = limit.start;
            datasetMetadata[key].end = limit.end;
            if (limit.extent_desc) {
              datasetMetadata[key].extentDesc = limit.extent_desc;
            }
            if (limit.min_lat !== undefined && limit.max_lat !== undefined) {
              datasetMetadata[key].bounds = {
                minLat: limit.min_lat,
                maxLat: limit.max_lat,
                minLon: limit.min_lon ?? -180.0,
                maxLon: limit.max_lon ?? 180.0
              };
            }
            if (key === "srtm") continue;
            datasetMetadata[key].rangeText = `Available: ${limit.start} to ${limit.end} (Real-time GEE)`;
          }
        }
        console.log("Dynamically loaded GEE dataset limits:", datasetMetadata);
      }
    } catch (err) {
      console.warn("Failed to load real-time dataset limits, using fallback estimates:", err);
    }
  }

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

  function setupDualSlider(sliderTrackId, startSliderId, endSliderId, dateLabelId, hiddenStartId, hiddenEndId, baseDate, totalMonths, onChangeCallback, meta = null) {
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

    const prefix = startSliderId.split("_")[0]; // "map" or "export"
    const startPicker = document.getElementById(`${prefix}_start_date_input`);
    const endPicker = document.getElementById(`${prefix}_end_date_input`);

    const minDate = (meta && meta.start) ? meta.start : baseDate;
    const maxDate = (meta && meta.end) ? meta.end : getEndDateFromMonths(baseDate, totalMonths);

    if (startPicker) {
      startPicker.min = minDate;
      startPicker.max = maxDate;
    }
    if (endPicker) {
      endPicker.min = minDate;
      endPicker.max = maxDate;
    }

    function updateSliderColorsAndValues(e, exactStartDate = null, exactEndDate = null, triggerCallback = false) {
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

      let startDateStr = exactStartDate || getDateFromMonths(baseDate, val1);
      let endDateStr = exactEndDate || (val2 === totalMonths && meta && meta.end ? meta.end : getEndDateFromMonths(baseDate, val2));
      
      if (startDateStr < minDate) startDateStr = minDate;
      if (endDateStr > maxDate) endDateStr = maxDate;
      if (startDateStr > endDateStr) startDateStr = endDateStr;

      if (hiddenStart) hiddenStart.value = startDateStr;
      if (hiddenEnd) hiddenEnd.value = endDateStr;

      if (dateLabel) {
        dateLabel.textContent = `${formatMonthLabel(baseDate, val1)} - ${formatMonthLabel(baseDate, val2)}`;
      }

      // Sync slider state to date pickers
      if (startPicker && startPicker.value !== startDateStr) {
        startPicker.value = startDateStr;
      }
      if (endPicker && endPicker.value !== endDateStr) {
        endPicker.value = endDateStr;
      }

      if (triggerCallback && onChangeCallback) {
        onChangeCallback(startDateStr, endDateStr);
      }
    }

    startSlider.oninput = (e) => updateSliderColorsAndValues(e, null, null, false);
    endSlider.oninput = (e) => updateSliderColorsAndValues(e, null, null, false);
    
    startSlider.onchange = (e) => updateSliderColorsAndValues(e, null, null, true);
    endSlider.onchange = (e) => updateSliderColorsAndValues(e, null, null, true);

    // Listen to manual date changes in start picker
    if (startPicker) {
      startPicker.addEventListener("change", () => {
        let dateVal = startPicker.value;
        if (!dateVal) return;

        if (dateVal < minDate) {
          dateVal = minDate;
        }
        if (dateVal > maxDate) {
          dateVal = maxDate;
        }

        const currentEndDate = endPicker ? endPicker.value : getEndDateFromMonths(baseDate, parseInt(endSlider.value));
        if (dateVal > currentEndDate) {
          dateVal = currentEndDate;
        }

        let monthsOffset = calculateTotalMonths(baseDate, dateVal);
        monthsOffset = Math.max(0, Math.min(totalMonths, monthsOffset));

        startSlider.value = monthsOffset;
        updateSliderColorsAndValues(null, dateVal, null, true);
      });
    }

    // Listen to manual date changes in end picker
    if (endPicker) {
      endPicker.addEventListener("change", () => {
        let dateVal = endPicker.value;
        if (!dateVal) return;

        if (dateVal < minDate) {
          dateVal = minDate;
        }
        if (dateVal > maxDate) {
          dateVal = maxDate;
        }

        const currentStartDate = startPicker ? startPicker.value : getDateFromMonths(baseDate, parseInt(startSlider.value));
        if (dateVal < currentStartDate) {
          dateVal = currentStartDate;
        }

        let monthsOffset = calculateTotalMonths(baseDate, dateVal);
        monthsOffset = Math.max(0, Math.min(totalMonths, monthsOffset));

        endSlider.value = monthsOffset;
        updateSliderColorsAndValues(null, null, dateVal, true);
      });
    }

    updateSliderColorsAndValues(null, null, null, true);
  }

  // Representative vs Custom Preview State Management
  const previewState = {
    continuous: {
      isRepresentative: true,
      repStart: null,
      repEnd: null,
      activeStart: null,
      activeEnd: null,
      selectedStart: null,
      selectedEnd: null
    },
    discrete: {
      isRepresentative: true,
      repStart: null,
      repEnd: null,
      activeStart: null,
      activeEnd: null,
      selectedStart: null,
      selectedEnd: null
    }
  };

  function updatePreviewDateUI(type) {
    const isMap = type === "map" || type === "continuous";
    const state = isMap ? previewState.continuous : previewState.discrete;
    const prefix = isMap ? "map" : "glm";
    
    const badge = document.getElementById(`${prefix}PreviewBadge`);
    const note = document.getElementById(`${prefix}PreviewNote`);
    const btn = document.getElementById(`${prefix}RefreshPreviewBtn`);
    const btnText = document.getElementById(`${prefix}RefreshPreviewBtnText`);
    
    if (!badge || !note || !btn) return;
    
    const selectedStart = state.selectedStart || (isMap ? document.getElementById("map_start_date")?.value : document.getElementById("glm_start_date")?.value);
    const selectedEnd = state.selectedEnd || (isMap ? document.getElementById("map_end_date")?.value : document.getElementById("glm_end_date")?.value);
    
    const isShowingCurrentSelection = !state.isRepresentative && 
                                      state.activeStart === selectedStart && 
                                      state.activeEnd === selectedEnd;

    if (state.isRepresentative) {
      badge.textContent = "Representative (12-Mo)";
      badge.classList.remove("custom-active");
      
      const repLabel = (state.repStart && state.repEnd) ? ` (${state.repStart} to ${state.repEnd})` : "";
      if (selectedStart && selectedEnd && (selectedStart !== state.repStart || selectedEnd !== state.repEnd)) {
        note.style.display = "block";
        note.innerHTML = `Map preview shows 12-mo baseline${repLabel}. <strong style="color: #58a6ff;">Selected for ${isMap ? "export" : "point extraction"}:</strong> ${selectedStart} to ${selectedEnd}.`;
        btn.classList.add("needs-refresh");
        if (btnText) btnText.textContent = `Update Map Preview to ${selectedStart} – ${selectedEnd}`;
      } else {
        note.style.display = "none";
        note.innerHTML = "";
        btn.classList.remove("needs-refresh");
        if (btnText) btnText.textContent = "Update Map Preview with Selected Dates";
      }
    } else if (isShowingCurrentSelection) {
      badge.textContent = `Custom Range Active (${selectedStart} to ${selectedEnd})`;
      badge.classList.add("custom-active");
      note.style.display = "none";
      note.innerHTML = "";
      btn.classList.remove("needs-refresh");
      if (btnText) btnText.textContent = "Map Preview Up to Date";
    } else {
      badge.textContent = "Staged Range Differs";
      badge.classList.remove("custom-active");
      note.style.display = "block";
      note.innerHTML = `Map currently shows <strong>${state.activeStart} to ${state.activeEnd}</strong>. <strong style="color: #58a6ff;">Selected for ${isMap ? "export" : "point extraction"}:</strong> ${selectedStart} to ${selectedEnd}.`;
      btn.classList.add("needs-refresh");
      if (btnText) btnText.textContent = `Update Map Preview to ${selectedStart} – ${selectedEnd}`;
    }
  }

  function initDatasetSlider(datasetVal, prefix, customDates = null) {
    const isMap = prefix === "map";
    const isGLM = prefix === "glm";
    const startSliderId = `${prefix}_start_slider`;
    const endSliderId = `${prefix}_end_slider`;
    const trackId = `${prefix}_slider_track`;
    const labelId = `${prefix}_date_range_label`;
    
    let hiddenStartId, hiddenEndId, rowId;
    if (isMap) {
      hiddenStartId = "map_start_date";
      hiddenEndId = "map_end_date";
      rowId = "map_date_row";
    } else if (isGLM) {
      hiddenStartId = "glm_start_date";
      hiddenEndId = "glm_end_date";
      rowId = "glm_date_row";
    } else {
      hiddenStartId = "start_date";
      hiddenEndId = "end_date";
      rowId = "export_date_row";
    }
    
    const row = document.getElementById(rowId);
    if (!row) return;

    if (datasetVal === "srtm") {
      row.style.display = "none";
      if ((isMap || isGLM) && typeof triggerMapUpdate === "function") {
        triggerMapUpdate();
      }
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
      // Set min and max limits first to prevent the browser from clamping the values to the HTML default max (100)
      startSlider.min = 0;
      startSlider.max = totalMonths;
      endSlider.min = 0;
      endSlider.max = totalMonths;

      const defaultStart = Math.max(0, totalMonths - 12); // Default to the last 12 months (most recent year)
      startSlider.value = defaultStart;
      endSlider.value = totalMonths;

      const initialStartStr = getDateFromMonths(meta.start, defaultStart);
      const initialEndStr = (meta.end) ? meta.end : getEndDateFromMonths(meta.start, totalMonths);

      if (isMap) {
        previewState.continuous.isRepresentative = true;
        previewState.continuous.repStart = initialStartStr;
        previewState.continuous.repEnd = initialEndStr;
        previewState.continuous.activeStart = initialStartStr;
        previewState.continuous.activeEnd = initialEndStr;
        previewState.continuous.selectedStart = initialStartStr;
        previewState.continuous.selectedEnd = initialEndStr;
      } else if (isGLM) {
        previewState.discrete.isRepresentative = true;
        previewState.discrete.repStart = initialStartStr;
        previewState.discrete.repEnd = initialEndStr;
        previewState.discrete.activeStart = initialStartStr;
        previewState.discrete.activeEnd = initialEndStr;
        previewState.discrete.selectedStart = initialStartStr;
        previewState.discrete.selectedEnd = initialEndStr;
      }
      
      setupDualSlider(
        trackId, 
        startSliderId, 
        endSliderId, 
        labelId, 
        hiddenStartId, 
        hiddenEndId, 
        meta.start, 
        totalMonths, 
        (startStr, endStr) => {
          if (isMap) {
            previewState.continuous.selectedStart = startStr;
            previewState.continuous.selectedEnd = endStr;
            updatePreviewDateUI("map");
          } else if (isGLM) {
            previewState.discrete.selectedStart = startStr;
            previewState.discrete.selectedEnd = endStr;
            updatePreviewDateUI("glm");
          }
        },
        meta
      );

      if (isMap) updatePreviewDateUI("map");
      if (isGLM) updatePreviewDateUI("glm");
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
        try {
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
              let errorMsg = "Error: The tree file does not contain lat/lon location info. Please ensure you are selecting a continuous phylogeographic tree file (e.g. BEAST Nexus/Newick with 'location' annotations).";
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
                    errorMsg += ` (Detected metadata fields: ${detected}${keys.size > 10 ? '...' : ''})`;
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
        } catch (error) {
          if (statusText) {
            statusText.textContent = "Error parsing file. Please ensure it is a valid coordinate CSV or a continuous BEAST phylogeographic tree file.";
            statusText.style.color = "#f85149";
          }
          console.error("File parsing error:", error);
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
        } else if (e.target.value === "bbox_upload") {
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
      if (roiType === "bbox_upload") {
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
        roi_type: roiType === "bbox_upload" ? "bbox" : roiType,
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
      zoomControl: false,
      scrollWheelZoom: false
    }).setView([20, 0], 2); // Default center (Global)

    function getMapPadding(basePadding = 40) {
      const isMobile = window.innerWidth <= 768;
      return {
        paddingTopLeft: [isMobile ? basePadding : 420, basePadding],
        paddingBottomRight: [basePadding, basePadding]
      };
    }

    // Base Maps (No API key required, watermark-free, high-performance)
    const esriDarkBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxNativeZoom: 16,
      maxZoom: 20
    });
    const esriDarkRef = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      attribution: '',
      maxNativeZoom: 16,
      maxZoom: 20
    });
    const darkCanvas = L.layerGroup([esriDarkBase, esriDarkRef]);

    const esriSatelliteBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and GIS User Community',
      maxNativeZoom: 19,
      maxZoom: 20
    });
    const esriSatelliteRef = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      attribution: '',
      maxNativeZoom: 19,
      maxZoom: 20
    });
    const satellite = L.layerGroup([esriSatelliteBase, esriSatelliteRef]);

    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });

    // Default to Dark Canvas
    darkCanvas.addTo(map);

    // Basemap switcher control in top-right
    const baseMaps = {
      "Dark Canvas": darkCanvas,
      "Satellite": satellite,
      "Street Map": osm
    };
    L.control.layers(baseMaps, null, { position: "topright", collapsed: true }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    let currentEELayer = null;
    let uploadedBBoxLayer = null;
    let uploadedMarkersLayer = null;
    let currentCustomBBox = null;
    
    // Pipeline 2 Discrete GLM state variables
    let activePipeline = "continuous"; // "continuous" or "discrete"
    let glmInputMode = "point"; // "point" or "boundary"
    let glmPointsBBox = null;
    let glmBoundaryBBox = null;
    let glmParsedDatesSpan = null;
    let glmUploadedMarkersLayer = null;
    let glmUploadedBBoxLayer = null;
    let glmUploadedGeoJsonLayer = null;
    let glmDatasetSelect = null;
    let selectedShapefileLayer = null;

    let isDrawingMode = false;
    let drawStartLatLng = null;
    let drawRectangleLayer = null;

    function handleMapMouseDown(e) {
      if (!isDrawingMode) return;
      
      drawStartLatLng = e.latlng;
      map.dragging.disable();
      
      if (drawRectangleLayer) map.removeLayer(drawRectangleLayer);
      if (uploadedBBoxLayer) map.removeLayer(uploadedBBoxLayer);
      if (uploadedMarkersLayer) map.removeLayer(uploadedMarkersLayer);
      
      drawRectangleLayer = L.rectangle([drawStartLatLng, drawStartLatLng], {
        color: "#2ea043",
        weight: 2,
        fillColor: "#2ea043",
        fillOpacity: 0.1,
        dashArray: "4, 4"
      }).addTo(map);
      
      map.on("mousemove", handleMapMouseMove);
    }

    function handleMapMouseMove(e) {
      if (!isDrawingMode || !drawStartLatLng) return;
      
      const currentLatLng = e.latlng;
      if (drawRectangleLayer) {
        drawRectangleLayer.setBounds([drawStartLatLng, currentLatLng]);
      }
    }

    function handleMapMouseUp(e) {
      if (!isDrawingMode || !drawStartLatLng) return;
      
      map.off("mousemove", handleMapMouseMove);
      map.dragging.enable();
      
      const drawEndLatLng = e.latlng;
      const lat1 = drawStartLatLng.lat;
      const lon1 = drawStartLatLng.lng;
      const lat2 = drawEndLatLng.lat;
      const lon2 = drawEndLatLng.lng;
      
      const distance = drawStartLatLng.distanceTo(drawEndLatLng);
      if (distance > 10) {
        currentCustomBBox = {
          minLat: Math.min(lat1, lat2),
          minLon: Math.min(lon1, lon2),
          maxLat: Math.max(lat1, lat2),
          maxLon: Math.max(lon1, lon2)
        };
        
        uploadedBBoxLayer = drawRectangleLayer;
        drawRectangleLayer = null;
        
        triggerMapUpdate();
      } else {
        if (drawRectangleLayer) {
          map.removeLayer(drawRectangleLayer);
          drawRectangleLayer = null;
        }
      }
      
      drawStartLatLng = null;
    }

    map.on("mousedown", handleMapMouseDown);
    map.on("mouseup", handleMapMouseUp);

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
        ], getMapPadding(40));
        
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

    // Spatial extent warning elements
    const spatialExtentBanner = document.getElementById("spatialExtentBanner");
    const spatialExtentIcon = document.getElementById("spatialExtentIcon");
    const spatialExtentTitle = document.getElementById("spatialExtentTitle");
    const spatialExtentText = document.getElementById("spatialExtentText");
    const spatialExtentSuggestion = document.getElementById("spatialExtentSuggestion");
    const spatialExtentCloseBtn = document.getElementById("spatialExtentCloseBtn");
    const roiExtentAlert = document.getElementById("roiExtentAlert");
    const roiExtentAlertText = document.getElementById("roiExtentAlertText");
    const roiExtentAlertIcon = document.getElementById("roiExtentAlertIcon");
    const glmCoverageAlert = document.getElementById("glmCoverageAlert");
    const glmCoverageAlertText = document.getElementById("glmCoverageAlertText");
    const glmCoverageAlertIcon = document.getElementById("glmCoverageAlertIcon");

    if (spatialExtentCloseBtn) {
      spatialExtentCloseBtn.addEventListener("click", () => {
        if (spatialExtentBanner) spatialExtentBanner.style.display = "none";
      });
    }

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

        // Auto-select mode reducer for categorical land cover / classification bands
        if (bandId === "label" || bandId.toLowerCase().includes("landcover") || bandId.toLowerCase().includes("lc")) {
          const reducerSelect = document.getElementById("map_custom_reducer");
          if (reducerSelect) reducerSelect.value = "mode";
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

          if (data.start_date && data.end_date) {
            initDatasetSlider("custom", "map", { start: data.start_date, end: data.end_date });
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
        updateSpatialCoverageAlerts();
        
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
      // Fetch GEE database limits dynamically first, then trigger initial UI slider setup
      loadDatasetLimits().then(() => {
        datasetSelect.dispatchEvent(new Event('change'));
      });
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

    function zoomToSelectedROIs() {
      const type = document.querySelector('input[name="roi_type"]:checked')?.value || "country";
      if (selectedROIs.size === 0) return;
      let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
      let found = false;
      selectedROIs.forEach(name => {
        let b = null;
        if (type === "country" && countryBounds[name]) {
          b = countryBounds[name];
          minLat = Math.min(minLat, b[0]);
          minLon = Math.min(minLon, b[1]);
          maxLat = Math.max(maxLat, b[2]);
          maxLon = Math.max(maxLon, b[3]);
          found = true;
        } else if (type === "region" && CONTINENT_BOUNDS[name]) {
          const cb = CONTINENT_BOUNDS[name];
          minLat = Math.min(minLat, cb[0][0]);
          minLon = Math.min(minLon, cb[0][1]);
          maxLat = Math.max(maxLat, cb[1][0]);
          maxLon = Math.max(maxLon, cb[1][1]);
          found = true;
        }
      });
      if (found) {
        map.fitBounds([[minLat, minLon], [maxLat, maxLon]], {
          ...getMapPadding(40),
          maxZoom: type === "country" ? 7 : 4
        });
      }
    }

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
          if (selectedROIs.size > 0) zoomToSelectedROIs();
          triggerMapUpdate();
        });
        roiTagsContainer.appendChild(tag);
      });
    }

    function formatLatRange(minLat, maxLat) {
      const minStr = minLat < 0 ? `${Math.abs(minLat).toFixed(1)}°S` : `${minLat.toFixed(1)}°N`;
      const maxStr = maxLat < 0 ? `${Math.abs(maxLat).toFixed(1)}°S` : `${maxLat.toFixed(1)}°N`;
      return `${minStr} to ${maxStr}`;
    }

    function checkSpatialCoverage(roiBounds, datasetKey) {
      if (!roiBounds || !datasetKey) return { status: "valid" };
      const meta = datasetMetadata[datasetKey];
      if (!meta || !meta.bounds) return { status: "valid" };

      const db = meta.bounds;
      const extentText = meta.extentDesc || `${db.minLat}° to ${db.maxLat}°`;

      // 1. Check completely outside (disjoint in lat or lon)
      const latDisjoint = (roiBounds.minLat > db.maxLat || roiBounds.maxLat < db.minLat);
      const lonDisjoint = (roiBounds.minLon > db.maxLon || roiBounds.maxLon < db.minLon);

      if (latDisjoint || lonDisjoint) {
        let suggestion = "";
        if (datasetKey === "chirps") {
          suggestion = "Recommendation: Switch to a global dataset such as ERA5 Daily or ERA5-Land Monthly for worldwide precipitation & temperature coverage.";
        } else if (datasetKey === "srtm") {
          suggestion = "Recommendation: For elevation data outside 56°S–60°N, consider Copernicus GLO-30 DEM or custom high-latitude digital elevation models.";
        } else if (datasetKey === "modis_ndvi") {
          suggestion = "Recommendation: Polar and high-latitude zones (>80°N) lack MODIS vegetation coverage.";
        }

        return {
          status: "outside",
          severity: "error",
          title: "Outside Dataset Extent",
          message: `${roiBounds.label || "The selected region"} (${formatLatRange(roiBounds.minLat, roiBounds.maxLat)}) lies completely outside ${datasetKey.toUpperCase()} coverage (${extentText}). No data is available for this area.`,
          suggestion
        };
      }

      // 2. Check partially outside
      const latPartial = (roiBounds.minLat < db.minLat || roiBounds.maxLat > db.maxLat);
      const lonPartial = (roiBounds.minLon < db.minLon || roiBounds.maxLon > db.maxLon);

      if (latPartial || lonPartial) {
        let suggestion = "Note: Map tiles and extracted covariates will only be present for the portion within the dataset extent; areas beyond the boundary will appear blank or contain missing values.";
        if (datasetKey === "chirps") {
          suggestion = "Note: Only areas south of 50°N will show rainfall data. For full coverage across northern regions, consider using ERA5 Daily.";
        }

        return {
          status: "partial",
          severity: "warning",
          title: "Partial Spatial Coverage",
          message: `${roiBounds.label || "The selected region"} (${formatLatRange(roiBounds.minLat, roiBounds.maxLat)}) extends beyond ${datasetKey.toUpperCase()} coverage (${extentText}).`,
          suggestion
        };
      }

      return { status: "valid" };
    }

    function getActiveROIBounds() {
      if (activePipeline === "continuous") {
        const type = document.querySelector('input[name="roi_type"]:checked')?.value || "country";
        if (type === "bbox_upload" || type === "bbox_draw") {
          if (currentCustomBBox) {
            return {
              minLat: currentCustomBBox.minLat,
              minLon: currentCustomBBox.minLon,
              maxLat: currentCustomBBox.maxLat,
              maxLon: currentCustomBBox.maxLon,
              label: type === "bbox_upload" ? "Uploaded Extent" : "Drawn Extent",
              type: type
            };
          }
          return null;
        }

        if (selectedROIs.size === 0) return null;
        let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
        let found = false;
        const names = Array.from(selectedROIs);
        names.forEach(name => {
          let b = null;
          if (type === "country" && countryBounds[name]) {
            b = countryBounds[name];
            minLat = Math.min(minLat, b[0]);
            minLon = Math.min(minLon, b[1]);
            maxLat = Math.max(maxLat, b[2]);
            maxLon = Math.max(maxLon, b[3]);
            found = true;
          } else if (type === "region" && CONTINENT_BOUNDS[name]) {
            const cb = CONTINENT_BOUNDS[name];
            minLat = Math.min(minLat, cb[0][0]);
            minLon = Math.min(minLon, cb[0][1]);
            maxLat = Math.max(maxLat, cb[1][0]);
            maxLon = Math.max(maxLon, cb[1][1]);
            found = true;
          }
        });

        if (found) {
          const label = names.length === 1 ? `"${names[0]}"` : `${names.length} selected ${type}s (${names.slice(0, 3).join(", ")}${names.length > 3 ? "..." : ""})`;
          return {
            minLat,
            minLon,
            maxLat,
            maxLon,
            label,
            type
          };
        }
        return null;
      } else {
        // Discrete pipeline
        if (glmPointsBBox) {
          return {
            minLat: glmPointsBBox.minLat,
            minLon: glmPointsBBox.minLon,
            maxLat: glmPointsBBox.maxLat,
            maxLon: glmPointsBBox.maxLon,
            label: "Uploaded Sample Points",
            type: "points"
          };
        }
        if (glmBoundaryBBox) {
          return {
            minLat: glmBoundaryBBox.minLat,
            minLon: glmBoundaryBBox.minLon,
            maxLat: glmBoundaryBBox.maxLat,
            maxLon: glmBoundaryBBox.maxLon,
            label: "Uploaded Boundary Polygons",
            type: "boundary"
          };
        }
        if (glmUploadedGeoJsonLayer && typeof glmUploadedGeoJsonLayer.getBounds === "function") {
          const b = glmUploadedGeoJsonLayer.getBounds();
          if (b && b.isValid && b.isValid()) {
            return {
              minLat: b.getSouth(),
              minLon: b.getWest(),
              maxLat: b.getNorth(),
              maxLon: b.getEast(),
              label: "Uploaded Boundary Polygons",
              type: "boundary"
            };
          }
        }
        return null;
      }
    }

    function updateSpatialCoverageAlerts() {
      const activeDataset = activePipeline === "continuous" 
        ? (datasetSelect ? datasetSelect.value : "")
        : (glmDatasetSelect ? glmDatasetSelect.value : "");
      
      const roiBounds = getActiveROIBounds();
      const result = checkSpatialCoverage(roiBounds, activeDataset);

      // 1. Update Floating Banner over Map
      if (spatialExtentBanner) {
        if (result.status === "outside" || result.status === "partial") {
          spatialExtentBanner.className = `spatial-extent-banner ${result.status}`;
          if (spatialExtentTitle) spatialExtentTitle.textContent = result.title;
          if (spatialExtentText) spatialExtentText.textContent = result.message;
          if (spatialExtentSuggestion) {
            if (result.suggestion) {
              spatialExtentSuggestion.textContent = result.suggestion;
              spatialExtentSuggestion.style.display = "block";
            } else {
              spatialExtentSuggestion.style.display = "none";
            }
          }
          spatialExtentBanner.style.display = "flex";
        } else {
          spatialExtentBanner.style.display = "none";
        }
      }

      // 2. Update Continuous Pipeline Sidebar Inline Alert
      if (roiExtentAlert && roiExtentAlertText) {
        if (activePipeline === "continuous" && (result.status === "outside" || result.status === "partial")) {
          roiExtentAlert.className = `roi-coverage-alert ${result.status}`;
          roiExtentAlertText.innerHTML = `<strong>${result.title}</strong>${result.message}`;
          roiExtentAlert.style.display = "flex";
        } else {
          roiExtentAlert.style.display = "none";
        }
      }

      // 3. Update Discrete Pipeline Sidebar Inline Alert
      if (activePipeline === "discrete") {
        updateDiscreteCheckboxesAlert(roiBounds);
      }

      return result;
    }

    function updateDiscreteCheckboxesAlert(roiBounds) {
      if (!glmCoverageAlert || !glmCoverageAlertText) return;
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="glm_datasets"]:checked'));
      const previewRadio = document.querySelector('input[name="glm_preview_dataset"]:checked');

      // Check preview dataset first
      if (previewRadio && previewRadio.value && roiBounds) {
        const previewRes = checkSpatialCoverage(roiBounds, previewRadio.value);
        if (previewRes.status === "outside" || previewRes.status === "partial") {
          glmCoverageAlert.className = `roi-coverage-alert ${previewRes.status}`;
          glmCoverageAlertText.innerHTML = `<strong>Map Preview: ${previewRes.title}</strong>${previewRes.message}`;
          glmCoverageAlert.style.display = "flex";
          return;
        }
      }

      if (checkedBoxes.length === 0 || !roiBounds) {
        glmCoverageAlert.style.display = "none";
        return;
      }

      const outsideDatasets = [];
      const partialDatasets = [];

      checkedBoxes.forEach(cb => {
        const res = checkSpatialCoverage(roiBounds, cb.value);
        if (res.status === "outside") outsideDatasets.push(cb.value.toUpperCase());
        else if (res.status === "partial") partialDatasets.push(cb.value.toUpperCase());
      });

      if (outsideDatasets.length > 0) {
        glmCoverageAlert.className = "roi-coverage-alert outside";
        glmCoverageAlertText.innerHTML = `<strong>Coverage Warning for Extraction:</strong> Uploaded coordinates fall outside ${outsideDatasets.join(", ")} coverage. Extraction will yield NaN / empty values for these layers.`;
        glmCoverageAlert.style.display = "flex";
      } else if (partialDatasets.length > 0) {
        glmCoverageAlert.className = "roi-coverage-alert partial";
        glmCoverageAlertText.innerHTML = `<strong>Partial Coverage Notice:</strong> Some points/polygons extend beyond the boundary of ${partialDatasets.join(", ")}.`;
        glmCoverageAlert.style.display = "flex";
      } else {
        glmCoverageAlert.style.display = "none";
      }
    }

    function handleROISelection(e) {
      if (e.target.value) {
        selectedROIs.add(e.target.value);
        e.target.value = ""; // Reset dropdown
        renderROITags();
        zoomToSelectedROIs();
        updateSpatialCoverageAlerts();
        triggerMapUpdate();
      }
    }

    // -------------------------------------------------------------------------
    // Searchable Country Combobox with Alias Matching & Keyboard Navigation
    // -------------------------------------------------------------------------
    const countryComboboxWrapper = document.getElementById("country_combobox_wrapper");
    const countrySearchInput = document.getElementById("map_country_search");
    const countryDropdownBtn = document.getElementById("map_country_dropdown_btn");
    const countryDropdownMenu = document.getElementById("country_dropdown_menu");
    const countryDropdownList = document.getElementById("country_dropdown_list");

    const allCountryList = Object.keys(countryBounds).sort((a, b) => a.localeCompare(b));
    let highlightedCountryIndex = -1;
    let currentFilteredCountries = [];

    const COUNTRY_ALIASES = {
      "uk": "United Kingdom",
      "great britain": "United Kingdom",
      "britain": "United Kingdom",
      "england": "United Kingdom",
      "scotland": "United Kingdom",
      "wales": "United Kingdom",
      "usa": "United States",
      "us": "United States",
      "america": "United States",
      "united states of america": "United States",
      "drc": "Dem Rep of the Congo",
      "dr congo": "Dem Rep of the Congo",
      "democratic republic of the congo": "Dem Rep of the Congo",
      "congo drc": "Dem Rep of the Congo",
      "congo brazzaville": "Rep of the Congo",
      "republic of the congo": "Rep of the Congo",
      "uae": "United Arab Emirates",
      "emirates": "United Arab Emirates",
      "car": "Central African Rep",
      "central african republic": "Central African Rep",
      "south korea": "Korea, South",
      "north korea": "Korea, North",
      "russia": "Russia",
      "russian federation": "Russia",
      "ivory coast": "Cote d'Ivoire",
      "cape verde": "Cabo Verde",
      "eswatini": "Swaziland",
      "tanzania": "Tanzania",
      "syria": "Syria",
      "laos": "Laos",
      "vietnam": "Vietnam",
      "iran": "Iran",
      "bolivia": "Bolivia",
      "venezuela": "Venezuela"
    };

    function escapeHtmlString(text) {
      if (!text) return "";
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function renderCountryDropdown(searchTerm = "") {
      if (!countryDropdownList) return;
      const cleanTerm = searchTerm.trim().toLowerCase();
      
      let matches = [];
      const exactAlias = COUNTRY_ALIASES[cleanTerm];
      
      if (cleanTerm === "") {
        matches = [...allCountryList];
      } else {
        if (exactAlias && allCountryList.includes(exactAlias)) {
          matches.push(exactAlias);
        }
        
        const prefixMatches = allCountryList.filter(c => c.toLowerCase().startsWith(cleanTerm) && c !== exactAlias);
        const substringMatches = allCountryList.filter(c => !c.toLowerCase().startsWith(cleanTerm) && c.toLowerCase().includes(cleanTerm) && c !== exactAlias);
        
        matches = [...matches, ...prefixMatches, ...substringMatches];
      }

      currentFilteredCountries = matches;
      countryDropdownList.innerHTML = "";

      if (matches.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "combobox-empty";
        emptyDiv.textContent = `No countries matching "${searchTerm}"`;
        countryDropdownList.appendChild(emptyDiv);
        highlightedCountryIndex = -1;
        return;
      }

      matches.forEach((country, idx) => {
        const opt = document.createElement("div");
        opt.className = "combobox-option";
        opt.dataset.index = idx;
        opt.dataset.country = country;

        const isSelected = selectedROIs.has(country);

        let labelHtml = escapeHtmlString(country);
        if (cleanTerm) {
          const matchPos = country.toLowerCase().indexOf(cleanTerm);
          if (matchPos !== -1) {
            const before = escapeHtmlString(country.substring(0, matchPos));
            const hit = escapeHtmlString(country.substring(matchPos, matchPos + cleanTerm.length));
            const after = escapeHtmlString(country.substring(matchPos + cleanTerm.length));
            labelHtml = `${before}<mark>${hit}</mark>${after}`;
          }
        }

        opt.innerHTML = `
          <span>${labelHtml}</span>
          ${isSelected ? '<span style="font-size:0.75rem; color:#58a6ff; font-weight:600;">Added</span>' : ''}
        `;

        opt.addEventListener("click", () => {
          selectCountry(country);
        });

        opt.addEventListener("mouseenter", () => {
          setHighlightedIndex(idx, false);
        });

        countryDropdownList.appendChild(opt);
      });

      setHighlightedIndex(0, false);
    }

    function setHighlightedIndex(index, scrollIntoView = true) {
      const options = countryDropdownList?.querySelectorAll(".combobox-option") || [];
      options.forEach(opt => opt.classList.remove("highlighted"));
      
      if (index >= 0 && index < options.length) {
        highlightedCountryIndex = index;
        const target = options[index];
        target.classList.add("highlighted");
        if (scrollIntoView && countryDropdownMenu) {
          target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } else {
        highlightedCountryIndex = -1;
      }
    }

    function showCountryDropdown() {
      if (countryDropdownMenu) {
        countryDropdownMenu.style.display = "block";
      }
    }

    function hideCountryDropdown() {
      if (countryDropdownMenu) {
        countryDropdownMenu.style.display = "none";
      }
      highlightedCountryIndex = -1;
    }

    function selectCountry(countryName) {
      if (!countryName) return;
      selectedROIs.add(countryName);
      if (countrySearchInput) countrySearchInput.value = "";
      hideCountryDropdown();
      renderROITags();
      zoomToSelectedROIs();
      updateSpatialCoverageAlerts();
      triggerMapUpdate();
    }

    if (countrySearchInput) {
      countrySearchInput.addEventListener("focus", () => {
        renderCountryDropdown(countrySearchInput.value);
        showCountryDropdown();
      });

      countrySearchInput.addEventListener("input", (e) => {
        showCountryDropdown();
        renderCountryDropdown(e.target.value);
      });

      countrySearchInput.addEventListener("keydown", (e) => {
        if (countryDropdownMenu && countryDropdownMenu.style.display === "none") {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            showCountryDropdown();
            renderCountryDropdown(countrySearchInput.value);
            return;
          }
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = highlightedCountryIndex + 1;
          if (next < currentFilteredCountries.length) {
            setHighlightedIndex(next, true);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = highlightedCountryIndex - 1;
          if (prev >= 0) {
            setHighlightedIndex(prev, true);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (highlightedCountryIndex >= 0 && currentFilteredCountries[highlightedCountryIndex]) {
            selectCountry(currentFilteredCountries[highlightedCountryIndex]);
          } else if (currentFilteredCountries.length > 0) {
            selectCountry(currentFilteredCountries[0]);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          hideCountryDropdown();
        }
      });
    }

    if (countryDropdownBtn) {
      countryDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (countryDropdownMenu && countryDropdownMenu.style.display === "block") {
          hideCountryDropdown();
        } else {
          renderCountryDropdown(countrySearchInput ? countrySearchInput.value : "");
          showCountryDropdown();
          if (countrySearchInput) countrySearchInput.focus();
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (countryComboboxWrapper && !countryComboboxWrapper.contains(e.target)) {
        hideCountryDropdown();
      }
    });

    // ROI Toggle Logic
    const roiRadios = document.querySelectorAll('input[name="roi_type"]');
    roiRadios.forEach(radio => {
      radio.addEventListener("change", (e) => {
        selectedROIs.clear();
        renderROITags();
        if (countrySearchInput) countrySearchInput.value = "";
        countryInput.value = "";
        regionInput.value = "";
        
        // Clear custom coordinates
        currentCustomBBox = null;
        if (uploadedBBoxLayer) map.removeLayer(uploadedBBoxLayer);
        if (uploadedMarkersLayer) map.removeLayer(uploadedMarkersLayer);
        
        const mapUploadPanel = document.getElementById("map_upload_panel");
        const drawGuidance = document.getElementById("map_draw_guidance");

        // Clear drawing states
        isDrawingMode = false;
        map.getContainer().style.cursor = "";
        if (drawGuidance) drawGuidance.style.display = "none";
        if (drawRectangleLayer) {
          map.removeLayer(drawRectangleLayer);
          drawRectangleLayer = null;
        }
        
        if (e.target.value === "country") {
          if (countryComboboxWrapper) countryComboboxWrapper.style.display = "block";
          countryInput.style.display = "none";
          regionInput.style.display = "none";
          mapUploadPanel.style.display = "none";
          countryInput.required = false;
          regionInput.required = false;
        } else if (e.target.value === "region") {
          if (countryComboboxWrapper) countryComboboxWrapper.style.display = "none";
          countryInput.style.display = "none";
          regionInput.style.display = "block";
          mapUploadPanel.style.display = "none";
          countryInput.required = false;
          regionInput.required = selectedROIs.size === 0;
        } else if (e.target.value === "bbox_upload") {
          if (countryComboboxWrapper) countryComboboxWrapper.style.display = "none";
          countryInput.style.display = "none";
          regionInput.style.display = "none";
          mapUploadPanel.style.display = "flex";
          countryInput.required = false;
          regionInput.required = false;
          
          if (uploadedPoints.length > 0) {
            const swap = document.getElementById("map_swap_coordinates").checked;
            renderUploadedDataOnMap(map, uploadedPoints, swap);
          }
        } else if (e.target.value === "bbox_draw") {
          if (countryComboboxWrapper) countryComboboxWrapper.style.display = "none";
          countryInput.style.display = "none";
          regionInput.style.display = "none";
          mapUploadPanel.style.display = "none";
          countryInput.required = false;
          regionInput.required = false;
          
          isDrawingMode = true;
          map.getContainer().style.cursor = "crosshair";
          if (drawGuidance) drawGuidance.style.display = "block";
        }
        triggerMapUpdate();
      });
    });

    // Reactive Map Update Logic with AbortController & Request Sequence Counter
    let activeMapRequestId = 0;
    let activeMapAbortController = null;

    async function triggerMapUpdate(options = {}) {
      // 1. Cancel previous pending in-flight request to eliminate race conditions & stale errors
      if (activeMapAbortController) {
        activeMapAbortController.abort();
        activeMapAbortController = null;
      }

      const requestId = ++activeMapRequestId;
      const abortController = new AbortController();
      activeMapAbortController = abortController;

      if (mapErrorOverlay) mapErrorOverlay.style.display = "none";
      
      let dataset, startDate, endDate, roiType, roiNames, isBBox = false;
      let isCustom = false;
      let customAsset = "";

      if (activePipeline === "continuous") {
        dataset = datasetSelect.value;
        isCustom = dataset === "custom";
        customAsset = mapCustomAssetInput.value.trim();

        if (isCustom && (!customAsset || !mapCustomBandSelect.value)) {
          if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
          return; // Don't trigger map update until custom ID loaded
        }

        if (isCustom && loadedMapAssetType === "Image") {
          startDate = "2000-01-01";
          endDate = "2000-01-02";
        } else if (options.forceDates) {
          startDate = options.forceDates.start;
          endDate = options.forceDates.end;
        } else if (previewState.continuous.isRepresentative && previewState.continuous.repStart && previewState.continuous.repEnd) {
          startDate = previewState.continuous.repStart;
          endDate = previewState.continuous.repEnd;
        } else {
          startDate = startDateInput.value;
          endDate = endDateInput.value;
        }
        
        roiType = document.querySelector('input[name="roi_type"]:checked').value;
        isBBox = (roiType === "bbox_upload" || roiType === "bbox_draw");

        // Update form required state based on selections
        if (roiType === "country") {
          countryInput.required = false;
        } else if (roiType === "region") {
          regionInput.required = selectedROIs.size === 0;
        } else {
          countryInput.required = false;
          regionInput.required = false;
        }

        // Check spatial coverage before requesting GEE tiles
        const spatialCheck = updateSpatialCoverageAlerts();
        if (spatialCheck.status === "outside") {
          console.warn("[PhyloCov Map] Requested ROI is completely outside dataset coverage. Skipping tile fetch:", spatialCheck);
          if (currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          }
          if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
          return; // Stop here! Prevents waiting on blank transparent tiles!
        }

        if (!dataset || (!isCustom && (!startDate || !endDate)) || (!isBBox && selectedROIs.size === 0) || (isBBox && !currentCustomBBox)) {
          if (currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          }
          if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
          return; // Wait until all required fields are filled
        }

        if (isBBox) {
          roiNames = `${currentCustomBBox.minLat},${currentCustomBBox.minLon},${currentCustomBBox.maxLat},${currentCustomBBox.maxLon}`;
        } else {
          roiNames = Array.from(selectedROIs).join(",");
        }
      } else {
        // activePipeline === "discrete" (Pipeline 2)
        dataset = glmDatasetSelect.value;
        if (!dataset) {
          if (currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          }
          if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
          return;
        }

        if (options.forceDates) {
          startDate = options.forceDates.start;
          endDate = options.forceDates.end;
        } else if (previewState.discrete.isRepresentative && previewState.discrete.repStart && previewState.discrete.repEnd) {
          startDate = previewState.discrete.repStart;
          endDate = previewState.discrete.repEnd;
        } else {
          const dateMode = document.querySelector('input[name="glm_date_mode"]:checked')?.value || "range";
          if (dateMode === "exact" && glmParsedDatesSpan) {
            startDate = glmParsedDatesSpan.start;
            endDate = glmParsedDatesSpan.end;
          } else {
            startDate = document.getElementById("glm_start_date").value;
            endDate = document.getElementById("glm_end_date").value;
          }
        }

        if (!startDate || !endDate) {
          if (currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          }
          if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
          return;
        }

        if (glmPointsBBox) {
          roiType = "bbox";
          roiNames = `${glmPointsBBox.minLat},${glmPointsBBox.minLon},${glmPointsBBox.maxLat},${glmPointsBBox.maxLon}`;
          isBBox = true;
        } else if (glmBoundaryBBox) {
          roiType = "bbox";
          roiNames = `${glmBoundaryBBox.minLat},${glmBoundaryBBox.minLon},${glmBoundaryBBox.maxLat},${glmBoundaryBBox.maxLon}`;
          isBBox = true;
        } else {
          roiType = "";
          roiNames = "";
          isBBox = false;
        }

        // Check spatial coverage in Discrete Pipeline
        const discreteSpatialCheck = updateSpatialCoverageAlerts();
        if (discreteSpatialCheck.status === "outside") {
          console.warn("[PhyloCov Map] Discrete preview coordinates are completely outside dataset coverage:", discreteSpatialCheck);
          if (currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          }
          if (mapLoadingOverlay) mapLoadingOverlay.style.display = "none";
          return;
        }
      }

      console.log("[PhyloCov Map Debug] triggerMapUpdate running:", {
        requestId,
        activePipeline,
        dataset,
        startDate,
        endDate,
        roiType,
        roiNames,
        isBBox,
        isRepresentative: activePipeline === "continuous" ? previewState.continuous.isRepresentative : previewState.discrete.isRepresentative
      });

      if (mapLoadingOverlay) mapLoadingOverlay.style.display = "flex";

      try {
        const queryRoiType = isBBox ? "bbox" : roiType;
        let queryUrl = `${BACKEND_URL}/map?dataset=${encodeURIComponent(isCustom ? customAsset : dataset)}&start_date=${startDate}&end_date=${endDate}&roi_type=${queryRoiType}&roi_names=${encodeURIComponent(roiNames)}`;
        console.log(`[PhyloCov Map Debug] Fetching map layer URL (Request #${requestId}):`, queryUrl);
        
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

          const bandMeta = mapBandsMetadata.find(b => b.id === band);
          if (bandMeta && bandMeta.vis) {
            if (bandMeta.vis.min !== undefined && bandMeta.vis.max !== undefined) {
              queryUrl += `&vis_min=${bandMeta.vis.min}&vis_max=${bandMeta.vis.max}`;
            }
          }
        }

        const response = await fetch(queryUrl, { signal: abortController.signal });
        const data = await response.json();

        // Stale response check: discard if newer request has taken over
        if (requestId !== activeMapRequestId) {
          console.log(`[PhyloCov Map] Discarding stale response for request #${requestId}`);
          return;
        }

        if (!response.ok) throw new Error(data.detail || "Failed to load map tiles");

        // Clear any previous error overlay upon successful tile retrieval
        if (mapErrorOverlay) mapErrorOverlay.style.display = "none";

        // Remove old EE layer if exists
        if (currentEELayer) {
          map.removeLayer(currentEELayer);
        }

        // Add new EE layer
        currentEELayer = L.tileLayer(data.urlFormat, {
          attribution: "Map Data &copy; Google Earth Engine",
          maxZoom: 20
        }).addTo(map);

        // Update active preview state & UI indicators
        if (activePipeline === "continuous") {
          previewState.continuous.activeStart = startDate;
          previewState.continuous.activeEnd = endDate;
          updatePreviewDateUI("map");
        } else {
          previewState.discrete.activeStart = startDate;
          previewState.discrete.activeEnd = endDate;
          updatePreviewDateUI("glm");
        }

        // Auto-zoom to bounds if returned
        if (data.bounds) {
          map.fitBounds(data.bounds, {
            ...getMapPadding(20),
            maxZoom: 8
          });
        }
      } catch (error) {
        if (error.name === "AbortError") {
          console.log(`[PhyloCov Map] Request #${requestId} was aborted by newer request.`);
          return;
        }
        if (requestId !== activeMapRequestId) {
          console.log(`[PhyloCov Map] Ignoring stale error from request #${requestId}:`, error);
          return;
        }
        console.error("Map Update Error:", error);
        if (mapErrorOverlay && mapErrorText) {
          mapErrorText.textContent = error.message;
          mapErrorOverlay.style.display = "flex";
        }
      } finally {
        if (requestId === activeMapRequestId && mapLoadingOverlay) {
          mapLoadingOverlay.style.display = "none";
        }
      }
    }

    [mapCustomBandSelect,
     document.getElementById("map_custom_reducer"),
     document.getElementById("map_custom_multiplier"),
     document.getElementById("map_custom_offset"),
     document.getElementById("map_custom_palette")
    ].forEach(el => {
      if (el) el.addEventListener("change", () => triggerMapUpdate());
    });

    const mapRefreshBtn = document.getElementById("mapRefreshPreviewBtn");
    if (mapRefreshBtn) {
      mapRefreshBtn.addEventListener("click", async () => {
        const selectedStart = document.getElementById("map_start_date")?.value;
        const selectedEnd = document.getElementById("map_end_date")?.value;
        if (!selectedStart || !selectedEnd) return;
        
        mapRefreshBtn.disabled = true;
        mapRefreshBtn.classList.add("loading");
        const btnText = document.getElementById("mapRefreshPreviewBtnText");
        if (btnText) btnText.textContent = "Updating Map Preview...";
        
        previewState.continuous.isRepresentative = false;
        previewState.continuous.activeStart = selectedStart;
        previewState.continuous.activeEnd = selectedEnd;
        
        try {
          await triggerMapUpdate({ forceDates: { start: selectedStart, end: selectedEnd } });
        } finally {
          mapRefreshBtn.disabled = false;
          mapRefreshBtn.classList.remove("loading");
          updatePreviewDateUI("map");
        }
      });
    }

    const glmRefreshBtn = document.getElementById("glmRefreshPreviewBtn");
    if (glmRefreshBtn) {
      glmRefreshBtn.addEventListener("click", async () => {
        const selectedStart = document.getElementById("glm_start_date")?.value;
        const selectedEnd = document.getElementById("glm_end_date")?.value;
        if (!selectedStart || !selectedEnd) return;
        
        glmRefreshBtn.disabled = true;
        glmRefreshBtn.classList.add("loading");
        const btnText = document.getElementById("glmRefreshPreviewBtnText");
        if (btnText) btnText.textContent = "Updating Map Preview...";
        
        previewState.discrete.isRepresentative = false;
        previewState.discrete.activeStart = selectedStart;
        previewState.discrete.activeEnd = selectedEnd;
        
        try {
          await triggerMapUpdate({ forceDates: { start: selectedStart, end: selectedEnd } });
        } finally {
          glmRefreshBtn.disabled = false;
          glmRefreshBtn.classList.remove("loading");
          updatePreviewDateUI("glm");
        }
      });
    }

    // Info button popover toggles for Pipeline 1 & Pipeline 2
    const mapInfoBtn = document.getElementById("mapPreviewInfoBtn");
    const mapInfoPopover = document.getElementById("mapPreviewInfoPopover");
    if (mapInfoBtn && mapInfoPopover) {
      mapInfoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = mapInfoPopover.style.display !== "none";
        mapInfoPopover.style.display = isVisible ? "none" : "block";
        mapInfoBtn.classList.toggle("active", !isVisible);
      });
    }

    const glmInfoBtn = document.getElementById("glmPreviewInfoBtn");
    const glmInfoPopover = document.getElementById("glmPreviewInfoPopover");
    if (glmInfoBtn && glmInfoPopover) {
      glmInfoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = glmInfoPopover.style.display !== "none";
        glmInfoPopover.style.display = isVisible ? "none" : "block";
        glmInfoBtn.classList.toggle("active", !isVisible);
      });
    }

    // Dismiss popovers when clicking outside
    document.addEventListener("click", (e) => {
      if (mapInfoPopover && mapInfoPopover.style.display !== "none") {
        if (!mapInfoPopover.contains(e.target) && !mapInfoBtn?.contains(e.target)) {
          mapInfoPopover.style.display = "none";
          mapInfoBtn?.classList.remove("active");
        }
      }
      if (glmInfoPopover && glmInfoPopover.style.display !== "none") {
        if (!glmInfoPopover.contains(e.target) && !glmInfoBtn?.contains(e.target)) {
          glmInfoPopover.style.display = "none";
          glmInfoBtn?.classList.remove("active");
        }
      }
    });

    if (countryInput) countryInput.addEventListener("change", handleROISelection);
    if (regionInput) regionInput.addEventListener("change", handleROISelection);
    
    // Initial required state setup (countryInput is hidden by searchable combobox)
    countryInput.required = false;

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
        const isBBox = (roiType === "bbox_upload" || roiType === "bbox_draw");

        // Spatial extent pre-export guard
        const spatialCheck = updateSpatialCoverageAlerts();
        if (spatialCheck.status === "outside") {
          mapStatusText.textContent = "BLOCKED";
          mapStatusMessage.textContent = `Export blocked: ${spatialCheck.message}`;
          mapStatusDot.style.backgroundColor = "#f85149";
          mapExportStatus.style.display = "block";
          mapExportBtn.disabled = false;
          mapExportBtn.textContent = "Start Backend Export";
          if (mapTimerInterval) clearInterval(mapTimerInterval);
          mapTimer.style.display = "none";
          return;
        }

        let roiNamesList = [];
        if (isBBox) {
          if (!currentCustomBBox) {
            alert(roiType === "bbox_upload" ? "Please upload a coordinate file first." : "Please draw a bounding box on the map first.");
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
          roi_type: isBBox ? "bbox" : roiType,
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
      
      // ==========================================
      // PIPELINE 2: DISCRETE PHYLODYNAMICS (GLM)
      // ==========================================
      const glmDropzone = document.getElementById("glm_upload_dropzone");
      const glmFileInput = document.getElementById("glm_file_input");
      const glmUploadText = document.getElementById("glm_upload_text");
      const glmUploadStatus = document.getElementById("glm_upload_status");
      glmDatasetSelect = document.getElementById("glm_dataset_select");
      const glmSubmitBtn = document.getElementById("glmSubmitBtn");
      const glmStatusPanel = document.getElementById("glmStatusPanel");
      const glmStatusDot = document.getElementById("glmStatusDot");
      const glmStatusText = document.getElementById("glmStatusText");
      const glmStatusMessage = document.getElementById("glmStatusMessage");
      const glmDownloadContainer = document.getElementById("glmDownloadContainer");
      const glmDownloadLink = document.getElementById("glmDownloadLink");
      const glmExtractionForm = document.getElementById("glmExtractionForm");

      let selectedGLMFile = null;
      let selectedGLMFileToSend = null;

      const glmModePointBtn = document.getElementById("glm_mode_point_btn");
      const glmModePolyBtn = document.getElementById("glm_mode_poly_btn");
      const glmStep1Label = document.getElementById("glm_step1_label");
      const glmBoundaryHint = document.getElementById("glm_boundary_hint");
      const glmExpectedPointsBox = document.getElementById("glm_expected_points_box");
      const glmExpectedPolyBox = document.getElementById("glm_expected_poly_box");

      function setGLMInputMode(mode) {
        glmInputMode = mode;
        if (mode === "point") {
          if (glmModePointBtn) {
            glmModePointBtn.classList.add("active");
            glmModePointBtn.style.background = "var(--accent-color)";
            glmModePointBtn.style.color = "white";
          }
          if (glmModePolyBtn) {
            glmModePolyBtn.classList.remove("active");
            glmModePolyBtn.style.background = "transparent";
            glmModePolyBtn.style.color = "var(--text-muted)";
          }
          if (glmStep1Label) glmStep1Label.textContent = "1. Upload Sample Points";
          if (glmUploadText) glmUploadText.textContent = "Drag & drop CSV, TXT, or Excel here, or click to browse";
          if (glmFileInput) glmFileInput.accept = ".csv,.txt,.tsv,.xlsx,.xls";
          if (glmBoundaryHint) glmBoundaryHint.style.display = "none";
          if (glmExpectedPointsBox) glmExpectedPointsBox.style.display = "block";
          if (glmExpectedPolyBox) glmExpectedPolyBox.style.display = "none";
        } else {
          if (glmModePolyBtn) {
            glmModePolyBtn.classList.add("active");
            glmModePolyBtn.style.background = "var(--accent-color)";
            glmModePolyBtn.style.color = "white";
          }
          if (glmModePointBtn) {
            glmModePointBtn.classList.remove("active");
            glmModePointBtn.style.background = "transparent";
            glmModePointBtn.style.color = "var(--text-muted)";
          }
          if (glmStep1Label) glmStep1Label.textContent = "1. Upload Spatial Boundaries";
          if (glmUploadText) glmUploadText.textContent = "Drag & drop GeoJSON (.geojson, .json) or Zipped Shapefile (.zip) here, or click to browse";
          if (glmFileInput) glmFileInput.accept = ".geojson,.json,.zip";
          if (glmBoundaryHint) glmBoundaryHint.style.display = "block";
          if (glmExpectedPointsBox) glmExpectedPointsBox.style.display = "none";
          if (glmExpectedPolyBox) glmExpectedPolyBox.style.display = "block";
        }
        const zonalGroup = document.getElementById("glm_zonal_stat_group");
        if (zonalGroup) zonalGroup.style.display = mode === "boundary" ? "block" : "none";
        updateGLMSubmitBtnState();
      }

      if (glmModePointBtn) {
        glmModePointBtn.addEventListener("click", () => setGLMInputMode("point"));
      }
      if (glmModePolyBtn) {
        glmModePolyBtn.addEventListener("click", () => setGLMInputMode("boundary"));
      }

      if (glmDropzone && glmFileInput) {
        // Trigger file input click
        glmDropzone.addEventListener("click", () => {
          glmFileInput.click();
        });

        // Prevent defaults for drag events
        ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
          glmDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
          }, false);
        });

        // Add highlight classes
        ["dragenter", "dragover"].forEach(eventName => {
          glmDropzone.addEventListener(eventName, () => {
            glmDropzone.style.borderColor = "var(--accent-color)";
            glmDropzone.style.background = "rgba(88, 166, 255, 0.05)";
          }, false);
        });

        ["dragleave", "drop"].forEach(eventName => {
          glmDropzone.addEventListener(eventName, () => {
            glmDropzone.style.borderColor = "rgba(255,255,255,0.15)";
            glmDropzone.style.background = "rgba(255,255,255,0.01)";
          }, false);
        });

        // Handle drop
        glmDropzone.addEventListener("drop", (e) => {
          const dt = e.dataTransfer;
          const files = dt.files;
          if (files.length > 0) {
            handleGLMFileSelection(files[0]);
          }
        });

        // Handle file select
        glmFileInput.addEventListener("change", (e) => {
          if (e.target.files.length > 0) {
            handleGLMFileSelection(e.target.files[0]);
          }
        });
      }

      function parseCSVClientSide(text) {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) return null;
        
        let delimiter = ",";
        const firstLine = lines[0];
        if (firstLine.includes("\t") && !firstLine.includes(",")) {
          delimiter = "\t";
        } else if (firstLine.includes(";") && !firstLine.includes(",")) {
          delimiter = ";";
        }
        
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
        const latColIdx = headers.findIndex(h => ["latitude", "lat", "lat_deg", "y"].includes(h.toLowerCase()));
        const lonColIdx = headers.findIndex(h => ["longitude", "lon", "lng", "lon_deg", "x"].includes(h.toLowerCase()));
        const dateColIdx = headers.findIndex(h => ["date", "time", "datetime", "year_month_day"].includes(h.toLowerCase()));

        if (latColIdx === -1 || lonColIdx === -1) {
          return { error: "Could not detect latitude and longitude columns. File must contain headers like 'latitude' and 'longitude'." };
        }

        const points = [];
        const dates = [];
        const parsedRows = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const cols = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ""));
          if (cols.length <= Math.max(latColIdx, lonColIdx)) continue;

          const lat = parseFloat(cols[latColIdx]);
          const lon = parseFloat(cols[lonColIdx]);
          if (isNaN(lat) || isNaN(lon)) continue;

          points.push({ lat, lon });

          const rowObj = {};
          headers.forEach((h, hIdx) => {
            rowObj[h] = cols[hIdx] !== undefined ? cols[hIdx] : "";
          });
          parsedRows.push(rowObj);

          if (dateColIdx !== -1 && cols[dateColIdx]) {
            const dateStr = cols[dateColIdx].trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              dates.push(new Date(dateStr));
            } else {
              const d = new Date(dateStr);
              if (!isNaN(d.getTime())) {
                dates.push(d);
              }
            }
          }
        }

        if (points.length === 0) {
          return { error: "No rows with valid numeric coordinates found in the file." };
        }

        const lats = points.map(p => p.lat);
        const lons = points.map(p => p.lon);
        const bbox = {
          minLat: Math.min(...lats),
          minLon: Math.min(...lons),
          maxLat: Math.max(...lats),
          maxLon: Math.max(...lons)
        };

        let dateSpan = null;
        if (dates.length > 0) {
          dates.sort((a, b) => a - b);
          const minDateStr = dates[0].toISOString().split("T")[0];
          const maxDateStr = dates[dates.length - 1].toISOString().split("T")[0];
          dateSpan = { start: minDateStr, end: maxDateStr };
        }

        return { points, bbox, dateSpan, headers, rows: parsedRows };
      }

      function renderGLMPointsOnMap(points) {
        if (glmUploadedBBoxLayer) map.removeLayer(glmUploadedBBoxLayer);
        if (glmUploadedMarkersLayer) map.removeLayer(glmUploadedMarkersLayer);
        if (glmUploadedGeoJsonLayer) map.removeLayer(glmUploadedGeoJsonLayer);

        const markers = points.map(p => L.circleMarker([p.lat, p.lon], {
          radius: 5,
          color: "#58a6ff",
          fillColor: "#58a6ff",
          fillOpacity: 0.8,
          weight: 1
        }));

        glmUploadedMarkersLayer = L.layerGroup(markers).addTo(map);

        if (glmPointsBBox) {
          glmUploadedBBoxLayer = L.rectangle([
            [glmPointsBBox.minLat, glmPointsBBox.minLon],
            [glmPointsBBox.maxLat, glmPointsBBox.maxLon]
          ], {
            color: "#58a6ff",
            weight: 1,
            fillColor: "#58a6ff",
            fillOpacity: 0.05,
            dashArray: "4, 4"
          }).addTo(map);

          map.fitBounds(glmUploadedBBoxLayer.getBounds(), {
            ...getMapPadding(40),
            maxZoom: 10
          });
        }
      }

      function setGLMDateExtractionMode(mode) {
        const dateRow = document.getElementById("glm_date_row");
        const banner = document.getElementById("glm_notice_banner");
        const dataset = glmDatasetSelect.value;
        const isSRTM = dataset === "srtm";

        if (isSRTM) {
          if (dateRow) dateRow.style.display = "none";
          if (banner) {
            banner.textContent = "SRTM is a static elevation dataset and does not require a temporal date window.";
            banner.style.display = "block";
          }
          return;
        }

        if (mode === "exact") {
          if (dateRow) dateRow.style.display = "none";
          if (banner) {
            if (glmParsedDatesSpan) {
              banner.textContent = `Spreadsheet date column detected (spanning ${glmParsedDatesSpan.start} to ${glmParsedDatesSpan.end}). Covariates will be extracted for each point's exact sample date. Leaflet map is displaying the average over this temporal window.`;
            } else {
              banner.textContent = "Extracting covariates for each point's exact date column.";
            }
            banner.style.display = "block";
          }
        } else {
          if (dateRow) dateRow.style.display = "block";
          if (banner) {
            banner.textContent = "Covariates will be extracted as the average over the manually selected date range below for all points.";
            banner.style.display = "block";
          }
          if (dataset) {
            initDatasetSlider(dataset, "glm");
          }
        }
      }

      function renderGLMPolygonsOnMap(geojsonData) {
        if (glmUploadedBBoxLayer) map.removeLayer(glmUploadedBBoxLayer);
        if (glmUploadedMarkersLayer) map.removeLayer(glmUploadedMarkersLayer);
        if (glmUploadedGeoJsonLayer) map.removeLayer(glmUploadedGeoJsonLayer);

        glmUploadedGeoJsonLayer = L.geoJSON(geojsonData, {
          style: function() {
            return {
              color: "#58a6ff",
              weight: 2,
              opacity: 0.85,
              fillColor: "#58a6ff",
              fillOpacity: 0.15
            };
          },
          onEachFeature: function(feature, layer) {
            if (feature.properties) {
              const props = feature.properties;
              const nameKey = Object.keys(props).find(k => ["name", "name_1", "region", "adm1_name", "id", "state", "province"].includes(k.toLowerCase())) || Object.keys(props)[0];
              const title = nameKey ? props[nameKey] : "Boundary Region";
              layer.bindTooltip(`<strong>${title}</strong>`, { sticky: true });
            }
          }
        }).addTo(map);

        const bounds = glmUploadedGeoJsonLayer.getBounds();
        if (bounds && bounds.isValid()) {
          glmBoundaryBBox = {
            minLat: bounds.getSouth(),
            minLon: bounds.getWest(),
            maxLat: bounds.getNorth(),
            maxLon: bounds.getEast()
          };
          map.fitBounds(bounds, {
            ...getMapPadding(40),
            maxZoom: 10
          });
          updateSpatialCoverageAlerts();
        }
      }

      async function inspectAndRenderBoundary(file, requestedLayer = null) {
        setGLMInputMode("boundary");
        glmUploadText.textContent = `Inspecting ${file.name}...`;
        glmUploadStatus.textContent = "Parsing geometries, coordinate reference system, and attributes...";
        glmUploadStatus.style.color = "#58a6ff";
        glmUploadStatus.style.display = "block";

        const formData = new FormData();
        formData.append("file", file);
        if (requestedLayer) {
          formData.append("layer_name", requestedLayer);
        }

        try {
          const resp = await fetch(`${BACKEND_URL}/inspect-boundary`, {
            method: "POST",
            body: formData
          });

          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(errData.detail || `Server error: ${resp.status}`);
          }

          const data = await resp.json();
          selectedGLMFile = file;
          selectedGLMFileToSend = file;
          selectedShapefileLayer = data.selected_layer || data.selected_stem || null;

          const isZip = file.name.toLowerCase().endsWith(".zip");
          const layerTag = (isZip && data.selected_layer) ? ` (Layer: ${data.selected_layer})` : "";
          glmUploadText.textContent = `Selected: ${file.name}${layerTag} (${(file.size / 1024).toFixed(1)} KB)`;
          glmUploadStatus.textContent = `Loaded ${data.feature_count} boundary polygon${data.feature_count > 1 ? "s" : ""} across ${data.property_keys?.length || 0} attributes.`;
          glmUploadStatus.style.color = "#3fb950";

          // Shapefile multi-layer dropdown handling
          const layersGroup = document.getElementById("glm_shapefile_layers_group");
          const layerSelect = document.getElementById("glm_shapefile_layer_select");
          const layerHint = document.getElementById("glm_shapefile_layer_hint");

          if (layersGroup && layerSelect) {
            if (data.layers && data.layers.length > 1) {
              layersGroup.style.display = "block";
              layerSelect.innerHTML = "";
              data.layers.forEach(lName => {
                const opt = document.createElement("option");
                opt.value = lName;
                opt.textContent = lName;
                if (lName === data.selected_layer) opt.selected = true;
                layerSelect.appendChild(opt);
              });
              if (layerHint) {
                layerHint.textContent = `Detected ${data.layers.length} administrative layers in this archive. Switching layer will re-render boundaries and update location attributes.`;
              }
              layerSelect.onchange = (ev) => {
                inspectAndRenderBoundary(selectedGLMFile, ev.target.value);
              };
            } else {
              layersGroup.style.display = "none";
            }
          }

          // Render polygons on map
          if (data.geojson) {
            renderGLMPolygonsOnMap(data.geojson);
          }

          // Date Mode Handling
          const modeGroup = document.getElementById("glm_mode_group");
          const exactRadio = document.querySelector('input[name="glm_date_mode"][value="exact"]');
          const rangeRadio = document.querySelector('input[name="glm_date_mode"][value="range"]');
          if (modeGroup) modeGroup.style.display = "block";

          const sampleProps = data.geojson?.features?.[0]?.properties || {};
          const dateKey = Object.keys(sampleProps).find(k => ["date", "time", "datetime", "year_month_day"].includes(k.toLowerCase()));
          if (dateKey) {
            if (exactRadio) {
              exactRadio.disabled = false;
              exactRadio.checked = true;
            }
            setGLMDateExtractionMode("exact");
          } else {
            if (exactRadio) exactRadio.disabled = true;
            if (rangeRadio) rangeRadio.checked = true;
            setGLMDateExtractionMode("range");
          }

          // Setup BEAST GLM Matrix Options
          const matrixOptionsGroup = document.getElementById("glm_matrix_options_group");
          const matrixCheckbox = document.getElementById("glm_generate_matrices_checkbox");
          const matrixSettings = document.getElementById("glm_matrix_settings");
          const locationSelect = document.getElementById("glm_location_col_select");
          const locationHint = document.getElementById("glm_detected_locations_hint");

          if (matrixOptionsGroup && locationSelect) {
            matrixOptionsGroup.style.display = "block";
            locationSelect.innerHTML = '<option value="" disabled selected>Select location attribute...</option>';

            const candidateCols = data.property_keys || [];
            candidateCols.forEach(col => {
              const opt = document.createElement("option");
              opt.value = col;
              opt.textContent = col;
              locationSelect.appendChild(opt);
            });

            const updateHint = (colName) => {
              if (!colName || !data.geojson?.features) {
                if (locationHint) locationHint.textContent = "";
                return;
              }
              const uniqueLocs = Array.from(new Set(data.geojson.features.map(f => f.properties?.[colName]?.toString().trim()).filter(Boolean)));
              if (locationHint) {
                if (uniqueLocs.length >= 2) {
                  const sampleList = uniqueLocs.slice(0, 4).join(", ") + (uniqueLocs.length > 4 ? `, +${uniqueLocs.length - 4} more` : "");
                  locationHint.textContent = `Found ${uniqueLocs.length} discrete locations (${sampleList})`;
                  locationHint.style.color = "#3fb950";
                } else if (uniqueLocs.length === 1) {
                  locationHint.textContent = `Only 1 location found ("${uniqueLocs[0]}"). BEAST GLMs require at least 2 distinct states.`;
                  locationHint.style.color = "#d29922";
                } else {
                  locationHint.textContent = "No valid values found in this attribute.";
                  locationHint.style.color = "#f85149";
                }
              }
            };

            locationSelect.onchange = (ev) => updateHint(ev.target.value);

            const autoCol = candidateCols.find(col => {
              const lower = col.toLowerCase();
              return ["name", "name_1", "name_0", "admin", "region", "province", "state", "id", "iso_a3"].some(k => lower.includes(k));
            });

            if (autoCol) {
              locationSelect.value = autoCol;
              updateHint(autoCol);
            } else if (candidateCols.length > 0) {
              locationSelect.value = candidateCols[0];
              updateHint(candidateCols[0]);
            }
            if (matrixCheckbox) matrixCheckbox.checked = false;
            if (matrixSettings) matrixSettings.style.display = "none";

            if (matrixCheckbox) {
              matrixCheckbox.onchange = (ev) => {
                if (matrixSettings) {
                  matrixSettings.style.display = ev.target.checked ? "flex" : "none";
                }
              };
            }
          }

          updateGLMSubmitBtnState();
          activePipeline = "discrete";

          // If no covariate is selected, ensure no EE layer is displayed
          if (!glmDatasetSelect.value && currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          } else if (glmDatasetSelect.value) {
            triggerMapUpdate();
          }

        } catch (err) {
          console.error("Boundary inspection error:", err);
          glmUploadStatus.textContent = "Error: " + (err.message || "Failed to parse boundary archive.");
          glmUploadStatus.style.color = "#f85149";
          glmUploadStatus.style.display = "block";
          selectedGLMFile = null;
          selectedGLMFileToSend = null;
          updateGLMSubmitBtnState();
        }
      }

      function handleGLMFileSelection(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const validExtensions = ["csv", "txt", "tsv", "xlsx", "xls", "geojson", "json", "zip"];
        if (!validExtensions.includes(ext)) {
          glmUploadStatus.textContent = "Error: Invalid file format. Please upload CSV/Excel, GeoJSON (.geojson/.json), or Zipped Shapefile (.zip).";
          glmUploadStatus.style.color = "#f85149";
          glmUploadStatus.style.display = "block";
          selectedGLMFile = null;
          selectedGLMFileToSend = null;
          updateGLMSubmitBtnState();
          return;
        }

        const isGeoJSON = ext === "geojson" || ext === "json";
        const isZip = ext === "zip";
        const isExcel = ext === "xlsx" || ext === "xls";

        if (isGeoJSON || isZip) {
          inspectAndRenderBoundary(file);
          return;
        }

        // Tabular Points (CSV / TSV / Excel)
        setGLMInputMode("point");
        selectedShapefileLayer = null;
        const layersGroup = document.getElementById("glm_shapefile_layers_group");
        if (layersGroup) layersGroup.style.display = "none";
        if (glmUploadedGeoJsonLayer) map.removeLayer(glmUploadedGeoJsonLayer);

        const processFileContent = (text, originalFile) => {
          const result = parseCSVClientSide(text);
          if (!result || result.error) {
            glmUploadStatus.textContent = "Error: " + (result?.error || "Failed to parse coordinate file.");
            glmUploadStatus.style.color = "#f85149";
            glmUploadStatus.style.display = "block";
            selectedGLMFile = null;
            selectedGLMFileToSend = null;
            updateGLMSubmitBtnState();
            return;
          }

          selectedGLMFile = originalFile;
          const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
          const csvFileName = originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) + ".csv";
          selectedGLMFileToSend = new File([blob], csvFileName, { type: "text/csv" });

          glmUploadText.textContent = `Selected: ${originalFile.name} (${(originalFile.size / 1024).toFixed(1)} KB)`;
          glmUploadStatus.style.display = "none";

          glmPointsBBox = result.bbox;
          glmParsedDatesSpan = result.dateSpan;

          renderGLMPointsOnMap(result.points);

          const modeGroup = document.getElementById("glm_mode_group");
          const exactRadio = document.querySelector('input[name="glm_date_mode"][value="exact"]');
          const rangeRadio = document.querySelector('input[name="glm_date_mode"][value="range"]');

          if (modeGroup) {
            modeGroup.style.display = "block";
          }

          if (result.dateSpan) {
            if (exactRadio) {
              exactRadio.disabled = false;
              exactRadio.checked = true;
            }
            setGLMDateExtractionMode("exact");
          } else {
            if (exactRadio) {
              exactRadio.disabled = true;
            }
            if (rangeRadio) {
              rangeRadio.checked = true;
            }
            setGLMDateExtractionMode("range");
          }

          // Setup BEAST GLM Matrix Options
          const matrixOptionsGroup = document.getElementById("glm_matrix_options_group");
          const matrixCheckbox = document.getElementById("glm_generate_matrices_checkbox");
          const matrixSettings = document.getElementById("glm_matrix_settings");
          const locationSelect = document.getElementById("glm_location_col_select");
          const locationHint = document.getElementById("glm_detected_locations_hint");

          if (matrixOptionsGroup && locationSelect && result.headers) {
            matrixOptionsGroup.style.display = "block";
            locationSelect.innerHTML = '<option value="" disabled selected>Select location column...</option>';

            const candidateCols = result.headers.filter(h => {
              const lower = h.toLowerCase();
              return !["latitude", "lat", "lat_deg", "y", "longitude", "lon", "lng", "lon_deg", "x", "date", "time", "datetime"].includes(lower);
            });

            candidateCols.forEach(col => {
              const opt = document.createElement("option");
              opt.value = col;
              opt.textContent = col;
              locationSelect.appendChild(opt);
            });

            const updateHint = (colName) => {
              if (!colName || !result.rows) {
                if (locationHint) locationHint.textContent = "";
                return;
              }
              const uniqueLocs = Array.from(new Set(result.rows.map(r => r[colName]?.trim()).filter(Boolean)));
              if (locationHint) {
                if (uniqueLocs.length >= 2) {
                  const sampleList = uniqueLocs.slice(0, 4).join(", ") + (uniqueLocs.length > 4 ? `, +${uniqueLocs.length - 4} more` : "");
                  locationHint.textContent = `Found ${uniqueLocs.length} discrete locations (${sampleList})`;
                  locationHint.style.color = "#3fb950";
                } else if (uniqueLocs.length === 1) {
                  locationHint.textContent = `Only 1 location found ("${uniqueLocs[0]}"). BEAST GLMs require at least 2 distinct states.`;
                  locationHint.style.color = "#d29922";
                } else {
                  locationHint.textContent = "No valid values found in this column.";
                  locationHint.style.color = "#f85149";
                }
              }
            };

            locationSelect.onchange = (e) => {
              updateHint(e.target.value);
            };

            // Auto-detect best column name
            const autoCol = candidateCols.find(col => {
              const lower = col.toLowerCase();
              return ["location", "deme", "admin", "region", "country", "state", "province", "site", "cluster"].some(k => lower.includes(k));
            });

            if (autoCol) {
              locationSelect.value = autoCol;
              if (matrixCheckbox) matrixCheckbox.checked = true;
              if (matrixSettings) matrixSettings.style.display = "flex";
              updateHint(autoCol);
            } else {
              if (matrixCheckbox) matrixCheckbox.checked = false;
              if (matrixSettings) matrixSettings.style.display = "none";
              if (locationHint) locationHint.textContent = "";
            }

            if (matrixCheckbox) {
              matrixCheckbox.onchange = (e) => {
                if (matrixSettings) {
                  matrixSettings.style.display = e.target.checked ? "flex" : "none";
                }
              };
            }
          }

          updateGLMSubmitBtnState();
          activePipeline = "discrete";
          if (!glmDatasetSelect.value && currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          } else if (glmDatasetSelect.value) {
            triggerMapUpdate();
          }
        };

        if (isExcel) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = new Uint8Array(e.target.result);
              const workbook = XLSX.read(data, { type: 'array' });
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const csvText = XLSX.utils.sheet_to_csv(worksheet);
              processFileContent(csvText, file);
            } catch (err) {
              console.error("Excel conversion error:", err);
              glmUploadStatus.textContent = "Error: Failed to read Excel file structure.";
              glmUploadStatus.style.color = "#f85149";
              glmUploadStatus.style.display = "block";
              selectedGLMFile = null;
              selectedGLMFileToSend = null;
              updateGLMSubmitBtnState();
            }
          };
          reader.onerror = () => {
            glmUploadStatus.textContent = "Error reading Excel file.";
            glmUploadStatus.style.color = "#f85149";
            glmUploadStatus.style.display = "block";
          };
          reader.readAsArrayBuffer(file);
        } else {
          const reader = new FileReader();
          reader.onload = (e) => {
            processFileContent(e.target.result, file);
          };
          reader.onerror = () => {
            glmUploadStatus.textContent = "Error reading text file.";
            glmUploadStatus.style.color = "#f85149";
            glmUploadStatus.style.display = "block";
          };
          reader.readAsText(file);
        }
      }

      function getSelectedGLMDatasets() {
        return Array.from(document.querySelectorAll('input[name="glm_datasets"]:checked')).map(cb => cb.value);
      }

      function updateGLMSubmitBtnState() {
        const checked = getSelectedGLMDatasets();
        const countSpan = document.getElementById("glm_selection_count");
        if (countSpan) {
          countSpan.textContent = checked.length === 1 
            ? "1 layer selected for extraction" 
            : `${checked.length} layers selected for extraction`;
          countSpan.style.color = checked.length > 0 ? "#58a6ff" : "#f85149";
        }

        const baseTitle = glmInputMode === "boundary" ? "Extract Boundary Covariates" : "Extract Point Covariates";
        if (selectedGLMFile && checked.length > 0) {
          glmSubmitBtn.disabled = false;
          glmSubmitBtn.style.opacity = "1";
          glmSubmitBtn.style.cursor = "pointer";
          glmSubmitBtn.textContent = checked.length > 1 
            ? `${baseTitle} (${checked.length} Layers)` 
            : baseTitle;
        } else {
          glmSubmitBtn.disabled = true;
          glmSubmitBtn.style.opacity = "0.5";
          glmSubmitBtn.style.cursor = "not-allowed";
          glmSubmitBtn.textContent = baseTitle;
        }
      }

      // Checkbox changes for multi-dataset selection
      document.querySelectorAll('input[name="glm_datasets"]').forEach(cb => {
        cb.addEventListener("change", () => {
          updateGLMSubmitBtnState();
          const previewRadio = document.querySelector('input[name="glm_preview_dataset"]:checked');
          const checked = getSelectedGLMDatasets();
          
          if (cb.checked) {
            // If no preview is currently selected, set preview to this newly checked dataset
            if (!previewRadio || !previewRadio.value) {
              const myRadio = document.querySelector(`input[name="glm_preview_dataset"][value="${cb.value}"]`);
              if (myRadio) {
                myRadio.checked = true;
                if (glmDatasetSelect) {
                  glmDatasetSelect.value = cb.value;
                  glmDatasetSelect.dispatchEvent(new Event("change"));
                }
              }
            }
          } else {
            // If user unchecked the dataset currently being previewed
            if (previewRadio && previewRadio.value === cb.value) {
              if (checked.length > 0) {
                const nextRadio = document.querySelector(`input[name="glm_preview_dataset"][value="${checked[0]}"]`);
                if (nextRadio) {
                  nextRadio.checked = true;
                  if (glmDatasetSelect) {
                    glmDatasetSelect.value = checked[0];
                    glmDatasetSelect.dispatchEvent(new Event("change"));
                  }
                }
              } else {
                // Revert to no preview
                const noneRadio = document.getElementById("glm_preview_none");
                if (noneRadio) noneRadio.checked = true;
                if (glmDatasetSelect) {
                  glmDatasetSelect.value = "";
                  glmDatasetSelect.dispatchEvent(new Event("change"));
                }
                if (currentEELayer) {
                  map.removeLayer(currentEELayer);
                  currentEELayer = null;
                }
              }
            }
          }
        });
      });

      // Radio button changes for active map preview layer
      document.querySelectorAll('input[name="glm_preview_dataset"]').forEach(rb => {
        rb.addEventListener("change", (e) => {
          activePipeline = "discrete";
          const val = e.target.value;
          if (!val) {
            // No preview selected
            if (glmDatasetSelect) {
              glmDatasetSelect.value = "";
              glmDatasetSelect.dispatchEvent(new Event("change"));
            }
            if (currentEELayer) {
              map.removeLayer(currentEELayer);
              currentEELayer = null;
            }
            return;
          }
          const correspondingCb = document.querySelector(`input[name="glm_datasets"][value="${val}"]`);
          if (correspondingCb && !correspondingCb.checked) {
            correspondingCb.checked = true;
            updateGLMSubmitBtnState();
          }
          if (glmDatasetSelect) {
            glmDatasetSelect.value = val;
            glmDatasetSelect.dispatchEvent(new Event("change"));
          }
        });
      });

      // Select All / Clear All buttons
      const selectAllBtn = document.getElementById("glm_select_all_btn");
      const clearAllBtn = document.getElementById("glm_clear_all_btn");
      if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
          document.querySelectorAll('input[name="glm_datasets"]').forEach(cb => cb.checked = true);
          updateGLMSubmitBtnState();
          const previewRadio = document.querySelector('input[name="glm_preview_dataset"]:checked');
          if (!previewRadio || !previewRadio.value) {
            const firstRadio = document.querySelector('input[name="glm_preview_dataset"][value="chirps"]');
            if (firstRadio) {
              firstRadio.checked = true;
              if (glmDatasetSelect) {
                glmDatasetSelect.value = "chirps";
                glmDatasetSelect.dispatchEvent(new Event("change"));
              }
            }
          }
        });
      }
      if (clearAllBtn) {
        clearAllBtn.addEventListener("click", () => {
          document.querySelectorAll('input[name="glm_datasets"]').forEach(cb => cb.checked = false);
          const noneRadio = document.getElementById("glm_preview_none");
          if (noneRadio) noneRadio.checked = true;
          if (glmDatasetSelect) {
            glmDatasetSelect.value = "";
            glmDatasetSelect.dispatchEvent(new Event("change"));
          }
          if (currentEELayer) {
            map.removeLayer(currentEELayer);
            currentEELayer = null;
          }
          updateGLMSubmitBtnState();
        });
      }

      // Add mode change listeners
      document.querySelectorAll('input[name="glm_date_mode"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
          activePipeline = "discrete";
          setGLMDateExtractionMode(e.target.value);
        });
      });

      if (glmDatasetSelect) {
        glmDatasetSelect.addEventListener("change", () => {
          activePipeline = "discrete";
          previewState.discrete.isRepresentative = true;
          updateGLMSubmitBtnState();
          
          const dateMode = document.querySelector('input[name="glm_date_mode"]:checked')?.value || "range";
          setGLMDateExtractionMode(dateMode);
          triggerMapUpdate();
          
          const infoMap = {
            "chirps": "Native Resolution: ~5.5km | Temporal: Daily (Precipitation)",
            "era5": "Native Resolution: ~27.8km | Temporal: Daily (Temperature)",
            "era5_land_monthly": "Native Resolution: ~11.1km | Temporal: Monthly (Temperature)",
            "modis_ndvi": "Native Resolution: ~250m | Temporal: 16-day (Vegetation Index)",
            "modis_lst_day": "Native Resolution: ~5.6km | Temporal: Monthly (Land Surface Temp Day)",
            "modis_lst_night": "Native Resolution: ~5.6km | Temporal: Monthly (Land Surface Temp Night)",
            "srtm": "Native Resolution: ~30m | Temporal: Static (Elevation)"
          };
          const infoText = document.getElementById("glmDatasetInfo");
          if (infoText) {
            infoText.textContent = infoMap[glmDatasetSelect.value] || "Selected dataset details";
          }
        });
      }

      // Switch active pipeline to continuous on map inputs interaction
      [datasetSelect, countryInput, regionInput, mapCustomAssetInput, mapCustomBandSelect].forEach(el => {
        if (el) {
          el.addEventListener("change", () => {
            activePipeline = "continuous";
            if (el === datasetSelect) {
              previewState.continuous.isRepresentative = true;
            }
            triggerMapUpdate();
          });
          el.addEventListener("input", () => {
            activePipeline = "continuous";
            triggerMapUpdate();
          });
        }
      });

      // Date inputs update staged extraction dates and UI without automatically fetching tiles
      [startDateInput, endDateInput].forEach(el => {
        if (el) {
          el.addEventListener("change", () => {
            activePipeline = "continuous";
            if (previewState.continuous) {
              previewState.continuous.selectedStart = startDateInput.value;
              previewState.continuous.selectedEnd = endDateInput.value;
              updatePreviewDateUI("map");
            }
          });
        }
      });
      document.querySelectorAll('input[name="roi_type"]').forEach(radio => {
        radio.addEventListener("change", () => {
          activePipeline = "continuous";
          triggerMapUpdate();
        });
      });

      if (glmExtractionForm) {
        glmExtractionForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!selectedGLMFileToSend) return;

          const checkedDatasets = getSelectedGLMDatasets();
          if (checkedDatasets.length === 0) return;

          // Check if all selected datasets are completely disjoint from sample coordinates
          const roiBounds = getActiveROIBounds();
          if (roiBounds) {
            const allOutside = checkedDatasets.every(d => checkSpatialCoverage(roiBounds, d).status === "outside");
            if (allOutside) {
              glmStatusPanel.style.display = "block";
              glmStatusDot.style.backgroundColor = "#f85149";
              glmStatusText.textContent = "BLOCKED";
              glmStatusMessage.textContent = `Extraction blocked: The selected dataset(s) (${checkedDatasets.map(d => d.toUpperCase()).join(", ")}) fall completely outside the uploaded sample extent. Please select a dataset with coverage for this region (e.g. ERA5).`;
              glmSubmitBtn.disabled = false;
              glmSubmitBtn.textContent = "Extract Covariates";
              glmSubmitBtn.style.opacity = "1";
              glmSubmitBtn.style.cursor = "pointer";
              return;
            }
          }

          // Prepare UI for loading
          glmSubmitBtn.disabled = true;
          glmSubmitBtn.textContent = `Extracting ${checkedDatasets.length} Layer${checkedDatasets.length > 1 ? 's' : ''}...`;
          glmSubmitBtn.style.opacity = "0.5";
          glmSubmitBtn.style.cursor = "not-allowed";

          glmStatusPanel.style.display = "block";
          glmStatusDot.style.backgroundColor = "#58a6ff";
          glmStatusText.textContent = "EXTRACTING";
          glmStatusMessage.textContent = `Uploading data and querying GEE across ${checkedDatasets.length} covariate layer${checkedDatasets.length > 1 ? 's' : ''} (${checkedDatasets.join(', ')})...`;
          glmDownloadContainer.style.display = "none";

          const formData = new FormData();
          formData.append("file", selectedGLMFileToSend);
          formData.append("datasets", checkedDatasets.join(","));
          formData.append("dataset", checkedDatasets[0]); // legacy fallback
          if (selectedShapefileLayer) {
            formData.append("layer_name", selectedShapefileLayer);
          }

          const dateMode = document.querySelector('input[name="glm_date_mode"]:checked')?.value || "range";
          const hasTemporal = checkedDatasets.some(d => d !== "srtm");
          if (dateMode === "range" && hasTemporal) {
            const startVal = document.getElementById("glm_start_date").value;
            const endVal = document.getElementById("glm_end_date").value;
            if (startVal && endVal) {
              formData.append("start_date", startVal);
              formData.append("end_date", endVal);
            }
          }

          const generateMatricesCheckbox = document.getElementById("glm_generate_matrices_checkbox");
          const locationColSelect = document.getElementById("glm_location_col_select");
          const aggSelect = document.getElementById("glm_aggregation_select");
          const zonalStatSelect = document.getElementById("glm_zonal_stat_select");

          const shouldGenerateMatrices = generateMatricesCheckbox && generateMatricesCheckbox.checked && locationColSelect && locationColSelect.value;
          if (shouldGenerateMatrices) {
            formData.append("generate_matrices", "true");
            formData.append("location_col", locationColSelect.value);
          }

          // Aggregation / Zonal reducer
          const chosenAggregation = glmInputMode === "boundary"
            ? (zonalStatSelect ? zonalStatSelect.value : "mean")
            : (aggSelect ? aggSelect.value : "mean");
          formData.append("matrix_aggregation", chosenAggregation);

          try {
            const response = await fetch(`${BACKEND_URL}/extract`, {
              method: "POST",
              body: formData
            });

            if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.detail || "Extraction failed");
            }

            const contentType = response.headers.get("content-type") || "";
            const isZip = contentType.includes("application/zip") || contentType.includes("zip");
            const isGeoJson = contentType.includes("geo+json") || contentType.includes("json");

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);

            // Configure download link
            glmDownloadLink.href = downloadUrl;
            const origStem = selectedGLMFile.name.substring(0, selectedGLMFile.name.lastIndexOf('.')) || "samples";
            const dsTag = checkedDatasets.length > 2 ? `multi_${checkedDatasets.length}_covariates` : checkedDatasets.join("_and_");
            if (isZip) {
              glmDownloadLink.download = `beast_glm_${dsTag}_${origStem}.zip`;
              glmDownloadLink.textContent = "Download BEAST GLM Package (.zip) ⬇";
            } else if (isGeoJson) {
              glmDownloadLink.download = `enriched_${origStem}_${dsTag}.geojson`;
              glmDownloadLink.textContent = "Download Enriched Boundaries (GeoJSON) ⬇";
            } else {
              glmDownloadLink.download = `enriched_${origStem}_${dsTag}.csv`;
              glmDownloadLink.textContent = glmInputMode === "boundary" ? "Download Enriched Polygon CSV ⬇" : "Download Enriched CSV ⬇";
            }

            // Update UI success state
            glmStatusDot.style.backgroundColor = "#238636";
            glmStatusText.textContent = "COMPLETED";
            glmStatusMessage.textContent = isZip 
              ? `BEAST GLM predictor package (.zip) successfully generated with pairwise matrices across ${checkedDatasets.length} covariate layer${checkedDatasets.length > 1 ? 's' : ''}!` 
              : (glmInputMode === "boundary"
                ? `Boundary zonal covariate extraction (${chosenAggregation}) successfully completed across ${checkedDatasets.length} layer${checkedDatasets.length > 1 ? 's' : ''}!`
                : `Point covariate extraction successfully completed across ${checkedDatasets.length} layer${checkedDatasets.length > 1 ? 's' : ''}!`);
            glmDownloadContainer.style.display = "block";

          } catch (error) {
            console.error("GLM Extraction Error:", error);
            glmStatusDot.style.backgroundColor = "#f85149";
            glmStatusText.textContent = "ERROR";
            let msg = error.message || "Failed to extract covariates.";
            if (msg.includes("Load failed") || msg.includes("Failed to fetch")) {
              msg = "Server connection lost or request timed out. This may happen with very large shapefile archives. Please try extracting fewer layers or a narrower date range.";
            }
            glmStatusMessage.textContent = msg;
          } finally {
            glmSubmitBtn.disabled = false;
            updateGLMSubmitBtnState();
          }
        });
      }

      // Switcher Tab Interaction Logic
      const pipelineTabs = document.querySelectorAll(".pipeline-tab");
      const continuousContainer = document.getElementById("continuous_controls_container");
      const discreteContainer = document.getElementById("discrete_controls_container");

      if (pipelineTabs.length > 0) {
        pipelineTabs.forEach(tab => {
          tab.addEventListener("click", () => {
            pipelineTabs.forEach(t => {
              t.classList.remove("active");
              t.style.background = "transparent";
              t.style.color = "var(--text-muted)";
            });

            tab.classList.add("active");
            tab.style.background = "var(--accent-color)";
            tab.style.color = "white";

            const selectedPipeline = tab.dataset.pipeline;
            activePipeline = selectedPipeline;

            if (selectedPipeline === "continuous") {
              if (continuousContainer) continuousContainer.style.display = "block";
              if (discreteContainer) discreteContainer.style.display = "none";
              
              if (uploadedBBoxLayer) uploadedBBoxLayer.addTo(map);
              if (uploadedMarkersLayer) uploadedMarkersLayer.addTo(map);
              if (glmUploadedBBoxLayer) map.removeLayer(glmUploadedBBoxLayer);
              if (glmUploadedMarkersLayer) map.removeLayer(glmUploadedMarkersLayer);
              if (glmUploadedGeoJsonLayer) map.removeLayer(glmUploadedGeoJsonLayer);
            } else {
              if (continuousContainer) continuousContainer.style.display = "none";
              if (discreteContainer) discreteContainer.style.display = "block";

              if (glmUploadedBBoxLayer) glmUploadedBBoxLayer.addTo(map);
              if (glmUploadedMarkersLayer) glmUploadedMarkersLayer.addTo(map);
              if (glmUploadedGeoJsonLayer) glmUploadedGeoJsonLayer.addTo(map);
              if (uploadedBBoxLayer) map.removeLayer(uploadedBBoxLayer);
              if (uploadedMarkersLayer) map.removeLayer(uploadedMarkersLayer);
            }

            triggerMapUpdate();
          });
        });
      }

      // =========================================================================
      // Reproducibility & Script Export Generator
      // =========================================================================
      const codeExportModal = document.getElementById("codeExportModal");
      const closeCodeExportBtn = document.getElementById("closeCodeExportBtn");
      const codeExportPipelineSubtitle = document.getElementById("codeExportPipelineSubtitle");
      const codeEditorFilename = document.getElementById("codeEditorFilename");
      const codeEditorConfigBadge = document.getElementById("codeEditorConfigBadge");
      const codeExportPre = document.getElementById("codeExportPre");
      const copyCodeBtn = document.getElementById("copyCodeBtn");
      const copyCodeBtnText = document.getElementById("copyCodeBtnText");
      const downloadCodeBtn = document.getElementById("downloadCodeBtn");
      const downloadCodeBtnText = document.getElementById("downloadCodeBtnText");
      const langTabs = document.querySelectorAll(".code-lang-tab");

      const navOpenCodeBtn = document.getElementById("navOpenCodeBtn");
      const mapInspectCodeBtn = document.getElementById("mapInspectCodeBtn");
      const glmInspectCodeBtn = document.getElementById("glmInspectCodeBtn");

      let currentCodeModalPipeline = "continuous"; // "continuous" or "discrete"
      let currentCodeModalLang = "python"; // "python", "r", or "javascript"
      let currentRawCode = "";

      const PRESETS = {
        chirps: {
          asset: "UCSB-CHG/CHIRPS/DAILY",
          band: "precipitation",
          reducer: "mean",
          multiplier: 1.0,
          offset: 0.0,
          palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494'],
          vis_min: 0.0,
          vis_max: 50.0
        },
        era5: {
          asset: "ECMWF/ERA5/DAILY",
          band: "mean_2m_air_temperature",
          reducer: "mean",
          multiplier: 1.0,
          offset: -273.15,
          palette: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
          vis_min: 0.0,
          vis_max: 40.0
        },
        era5_land_monthly: {
          asset: "ECMWF/ERA5_LAND/MONTHLY_AGGR",
          band: "temperature_2m",
          reducer: "mean",
          multiplier: 1.0,
          offset: -273.15,
          palette: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
          vis_min: 0.0,
          vis_max: 40.0
        },
        modis_lst_day: {
          asset: "MODIS/061/MOD21C3",
          band: "LST_Day",
          reducer: "mean",
          multiplier: 1.0,
          offset: -273.15,
          palette: ['#313695', '#4575b4', '#74add1', '#ffffbf', '#fee090', '#f46d43', '#a50026'],
          vis_min: 0.0,
          vis_max: 40.0
        },
        modis_lst_night: {
          asset: "MODIS/061/MOD21C3",
          band: "LST_Night",
          reducer: "mean",
          multiplier: 1.0,
          offset: -273.15,
          palette: ['#053061', '#2166ac', '#4393c3', '#f7f7f7', '#fddbc7', '#d6604f', '#b2182b'],
          vis_min: -10.0,
          vis_max: 25.0
        },
        modis_ndvi: {
          asset: "MODIS/061/MOD13Q1",
          band: "NDVI",
          reducer: "mean",
          multiplier: 0.0001,
          offset: 0.0,
          palette: ['#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201', '#004C00', '#023B01', '#012E01', '#011D01', '#011301'],
          vis_min: 0.0,
          vis_max: 1.0
        },
        srtm: {
          asset: "USGS/SRTMGL1_003",
          band: "elevation",
          reducer: "none",
          multiplier: 1.0,
          offset: 0.0,
          palette: ['#000000', '#478FCD', '#86C58E', '#AFC35E', '#8F7131', '#B78D4C', '#E2B8A6', '#FFFFFF'],
          vis_min: 0.0,
          vis_max: 3000.0
        }
      };

      function getActiveROIForScript() {
        const roiType = document.querySelector('input[name="roi_type"]:checked')?.value || "country";
        let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
        let hasCoords = false;
        let label = "";

        if (roiType === "country" || roiType === "region") {
          if (selectedROIs.size > 0) {
            label = Array.from(selectedROIs).join(", ");
            selectedROIs.forEach(name => {
              let b = null;
              if (roiType === "country" && countryBounds[name]) {
                b = countryBounds[name];
                minLat = Math.min(minLat, b[0]);
                minLon = Math.min(minLon, b[1]);
                maxLat = Math.max(maxLat, b[2]);
                maxLon = Math.max(maxLon, b[3]);
                hasCoords = true;
              } else if (roiType === "region" && CONTINENT_BOUNDS[name]) {
                const cb = CONTINENT_BOUNDS[name];
                minLat = Math.min(minLat, cb[0][0]);
                minLon = Math.min(minLon, cb[0][1]);
                maxLat = Math.max(maxLat, cb[1][0]);
                maxLon = Math.max(maxLon, cb[1][1]);
                hasCoords = true;
              }
            });
          }
        } else if ((roiType === "bbox_upload" || roiType === "bbox_draw") && currentCustomBBox) {
          minLat = currentCustomBBox.minLat;
          minLon = currentCustomBBox.minLon;
          maxLat = currentCustomBBox.maxLat;
          maxLon = currentCustomBBox.maxLon;
          hasCoords = true;
          label = currentCustomBBox.label || "Custom Bounding Box";
        }

        if (!hasCoords) {
          minLat = 55.336; minLon = 11.094; maxLat = 69.060; maxLon = 24.152;
          label = "Sweden (Sample ROI)";
        }

        return { minLat, minLon, maxLat, maxLon, label };
      }

      function generateContinuousScript(lang) {
        const roi = getActiveROIForScript();
        const isCustom = datasetSelect?.value === "custom";
        const datasetKey = isCustom ? (mapCustomAssetInput?.value?.trim() || "users/username/my_asset") : (datasetSelect?.value || "chirps");
        const meta = PRESETS[datasetKey] || {};
        const assetId = isCustom ? datasetKey : (meta.asset || "UCSB-CHG/CHIRPS/DAILY");
        const band = isCustom ? (mapCustomBandSelect?.value || "band1") : (meta.band || "precipitation");
        const reducer = isCustom ? (document.getElementById("map_custom_reducer")?.value || "mean") : (meta.reducer === "none" ? "first" : (meta.reducer || "mean"));
        const multiplier = isCustom ? (parseFloat(document.getElementById("map_custom_multiplier")?.value) || 1.0) : (meta.multiplier ?? 1.0);
        const offset = isCustom ? (parseFloat(document.getElementById("map_custom_offset")?.value) || 0.0) : (meta.offset ?? 0.0);
        const startDate = startDateInput?.value || "2020-01-01";
        const endDate = endDateInput?.value || "2020-01-31";
        const scale = parseInt(mapScaleSelect?.value === "custom" ? mapScaleCustom?.value : mapScaleSelect?.value, 10) || 5000;
        const isStatic = datasetKey === "srtm";
        const nowIso = new Date().toISOString().split("T")[0];

        if (lang === "python") {
          return `"""
PhyloCov Explorer - Reproducible Earth Engine Pipeline Script
Pipeline: Continuous Covariate Composite (GeoTIFF)
Dataset: ${datasetKey.toUpperCase()} (${assetId})
Band: ${band} | Reducer: ${reducer} | Scale: ${scale}m
Region of Interest: ${roi.label}
Generated: ${nowIso}
"""

import ee

# 1. Initialize Google Earth Engine
try:
    ee.Initialize()
except Exception:
    ee.Authenticate()
    ee.Initialize()

# 2. Define Region of Interest (BBox: [minLon, minLat, maxLon, maxLat])
roi = ee.Geometry.BBox(${roi.minLon.toFixed(4)}, ${roi.minLat.toFixed(4)}, ${roi.maxLon.toFixed(4)}, ${roi.maxLat.toFixed(4)})

# 3. Load Dataset & Filter
${isStatic ? `# Static Topography Dataset
raw_image = ee.Image('${assetId}').select('${band}').clip(roi)` : `# Filter ImageCollection by Date Range & Spatial Extent
collection = (
    ee.ImageCollection('${assetId}')
    .filterDate('${startDate}', '${endDate}')
    .filterBounds(roi)
    .select('${band}')
)

# 4. Temporal Reduction (${reducer})
raw_image = collection.${reducer}().clip(roi)`}

${multiplier !== 1.0 || offset !== 0.0 ? `# 5. Apply Calibration / Scale & Offset: (raw * ${multiplier}) + (${offset})
composite = raw_image.multiply(${multiplier}).add(${offset})` : `# 5. Processed Composite
composite = raw_image`}

# 6. Submit GeoTIFF Export Task to Google Drive
task = ee.batch.Export.image.toDrive(
    image=composite,
    description='PhyloCov_${datasetKey}_${startDate}_${endDate}',
    folder='PhyloCov_Exports',
    fileNamePrefix='PhyloCov_${datasetKey}_${startDate}_${endDate}',
    scale=${scale},
    region=roi,
    maxPixels=1e13,
    fileFormat='GeoTIFF'
)

task.start()
print(f"Export task submitted! Task ID: {task.id}")
print("Monitor progress at: https://code.earthengine.google.com/tasks")
`;
        } else if (lang === "r") {
          return `# ==============================================================================
# PhyloCov Explorer - Reproducible Earth Engine Pipeline Script
# Pipeline: Continuous Covariate Composite (GeoTIFF)
# Dataset: ${datasetKey.toUpperCase()} (${assetId})
# Band: ${band} | Reducer: ${reducer} | Scale: ${scale}m
# Region of Interest: ${roi.label}
# Generated: ${nowIso}
# ==============================================================================

library(rgee)
library(terra)

# 1. Initialize Earth Engine in R
ee_Initialize(drive = TRUE)

# 2. Define Region of Interest (BBox: minLon, minLat, maxLon, maxLat)
roi <- ee$Geometry$BBox(${roi.minLon.toFixed(4)}, ${roi.minLat.toFixed(4)}, ${roi.maxLon.toFixed(4)}, ${roi.maxLat.toFixed(4)})

# 3. Load Dataset & Filter
${isStatic ? `# Static Elevation/Topography Layer
raw_image <- ee$Image('${assetId}')$select('${band}')$clip(roi)` : `# Filter ImageCollection by Date Range & Spatial Bounds
collection <- ee$ImageCollection('${assetId}')$
  filterDate('${startDate}', '${endDate}')$
  filterBounds(roi)$
  select('${band}')

# 4. Temporal Reduction (${reducer})
raw_image <- collection$${reducer}()$clip(roi)`}

${multiplier !== 1.0 || offset !== 0.0 ? `# 5. Apply Calibration (Multiplier: ${multiplier}, Offset: ${offset})
composite <- raw_image$multiply(${multiplier})$add(${offset})` : `# 5. Final Composite
composite <- raw_image`}

# 6. Export to Google Drive as GeoTIFF
task <- ee_image_to_drive(
  image = composite,
  description = 'PhyloCov_${datasetKey}_${startDate}_${endDate}',
  folder = 'PhyloCov_Exports',
  fileNamePrefix = 'PhyloCov_${datasetKey}_${startDate}_${endDate}',
  scale = ${scale},
  region = roi,
  maxPixels = 1e13,
  fileFormat = 'GeoTIFF'
)

task$start()
message("Export task submitted! Check progress with: ee_monitoring(task)")
`;
        } else {
          // JavaScript (GEE Code Editor)
          return `/**
 * PhyloCov Explorer - Reproducible Earth Engine Pipeline Script
 * Pipeline: Continuous Covariate Composite (GeoTIFF)
 * Dataset: ${datasetKey.toUpperCase()} (${assetId})
 * Band: ${band} | Reducer: ${reducer} | Scale: ${scale}m
 * Region of Interest: ${roi.label}
 * 
 * Paste directly into Google Earth Engine Code Editor:
 * https://code.earthengine.google.com
 */

// 1. Define Region of Interest (Bounding Box)
var roi = ee.Geometry.BBox(${roi.minLon.toFixed(4)}, ${roi.minLat.toFixed(4)}, ${roi.maxLon.toFixed(4)}, ${roi.maxLat.toFixed(4)});

// 2. Load Dataset
${isStatic ? `// Static Elevation / Topography
var composite = ee.Image('${assetId}')
  .select('${band}')
  .clip(roi);` : `// Filter ImageCollection & Reduce
var collection = ee.ImageCollection('${assetId}')
  .filterDate('${startDate}', '${endDate}')
  .filterBounds(roi)
  .select('${band}');

// 3. Temporal Reduction
var composite = collection.${reducer}()${multiplier !== 1.0 ? `\n  .multiply(${multiplier})` : ""}${offset !== 0.0 ? `\n  .add(${offset})` : ""}
  .clip(roi);`}

// 4. Visualize on Interactive Map
Map.centerObject(roi, 6);
Map.addLayer(composite, {
  min: ${meta.vis_min ?? 0},
  max: ${meta.vis_max ?? 50},
  palette: ${JSON.stringify(meta.palette || ['#ffffcc', '#41b6c4', '#253494'])}
}, 'PhyloCov ${datasetKey.toUpperCase()} Composite');

// 5. Submit GeoTIFF Export to Google Drive
Export.image.toDrive({
  image: composite,
  description: 'PhyloCov_${datasetKey}_${startDate}_${endDate}',
  folder: 'PhyloCov_Exports',
  fileNamePrefix: 'PhyloCov_${datasetKey}_${startDate}_${endDate}',
  scale: ${scale},
  region: roi,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
`;
        }
      }

      function generateDiscreteScript(lang) {
        const checkedInputs = Array.from(document.querySelectorAll("#glmDatasetsList input[type='checkbox']:checked"));
        const checkedDatasets = checkedInputs.map(el => el.value);
        if (checkedDatasets.length === 0) checkedDatasets.push("chirps");

        const dateMode = document.querySelector('input[name="glm_date_mode"]:checked')?.value || "range";
        const startDate = document.getElementById("glm_start_date")?.value || "2020-01-01";
        const endDate = document.getElementById("glm_end_date")?.value || "2020-12-31";
        const scale = parseInt(document.getElementById("glm_scale_select")?.value, 10) || 5000;
        const zonalStat = document.getElementById("glm_zonal_stat_select")?.value || document.getElementById("glm_aggregation_select")?.value || "mean";
        const nowIso = new Date().toISOString().split("T")[0];

        if (lang === "python") {
          return `"""
PhyloCov Explorer - Reproducible Earth Engine Pipeline Script
Pipeline: Discrete Covariate Extraction for GLM / Phylogeography
Layers: ${checkedDatasets.join(", ")}
Date Mode: ${dateMode.toUpperCase()} (${startDate} to ${endDate})
Scale: ${scale}m | Aggregation: ${zonalStat}
Generated: ${nowIso}
"""

import ee
import pandas as pd

# 1. Initialize Google Earth Engine
try:
    ee.Initialize()
except Exception:
    ee.Authenticate()
    ee.Initialize()

# 2. Define Sample Points / Polygons
# Example points (Replace with your uploaded CSV coordinates or GEE FeatureCollection)
sample_points = [
    {"id": "Sample_01", "lon": 18.4241, "lat": -33.9249, "date": "${startDate}"},
    {"id": "Sample_02", "lon": 28.0473, "lat": -26.2041, "date": "${startDate}"},
    {"id": "Sample_03", "lon": 31.0218, "lat": -29.8587, "date": "${startDate}"}
]

features = [
    ee.Feature(ee.Geometry.Point([p["lon"], p["lat"]]), {
        "sample_id": p["id"],
        "sample_date": p["date"]
    }) for p in sample_points
]
points = ee.FeatureCollection(features)

# 3. Prepare Covariate Layers
layer_images = []

${checkedDatasets.map(d => {
  const p = PRESETS[d] || {};
  if (d === "srtm") {
    return `# Topography (SRTM)
srtm_img = ee.Image('${p.asset || "USGS/SRTMGL1_003"}').select(['elevation'], ['srtm_elevation'])
layer_images.append(srtm_img)`;
  }
  return `# ${d.toUpperCase()} Composite
${d}_col = ee.ImageCollection('${p.asset || "UCSB-CHG/CHIRPS/DAILY"}').filterDate('${startDate}', '${endDate}').select(['${p.band || "precipitation"}'])
${d}_img = ${d}_col.${p.reducer || "mean"}()${p.multiplier && p.multiplier !== 1 ? `.multiply(${p.multiplier})` : ""}${p.offset ? `.add(${p.offset})` : ""}.rename('${d}_${p.band || "val"}')
layer_images.append(${d}_img)`;
}).join("\n\n")}

# Combine all layers into a single multi-band image
stacked_covariates = ee.Image.cat(layer_images)

# 4. Extract Covariates at Sample Locations
extracted_data = stacked_covariates.reduceRegions(
    collection=points,
    reducer=ee.Reducer.${zonalStat}(),
    scale=${scale}
)

# 5. Export Extracted Attributes to Google Drive as CSV
task = ee.batch.Export.table.toDrive(
    collection=extracted_data,
    description='PhyloCov_Discrete_Covariates',
    folder='PhyloCov_Exports',
    fileNamePrefix='phylocov_discrete_covariates',
    fileFormat='CSV'
)

task.start()
print(f"Extraction task submitted! Task ID: {task.id}")
print("Monitor progress at: https://code.earthengine.google.com/tasks")
`;
        } else if (lang === "r") {
          return `# ==============================================================================
# PhyloCov Explorer - Reproducible Earth Engine Pipeline Script
# Pipeline: Discrete Covariate Extraction for GLM / Phylogeography
# Layers: ${checkedDatasets.join(", ")}
# Date Mode: ${dateMode.toUpperCase()} (${startDate} to ${endDate})
# Generated: ${nowIso}
# ==============================================================================

library(rgee)
library(terra)

# 1. Initialize Earth Engine in R
ee_Initialize(drive = TRUE)

# 2. Define Sample Points
sample_points <- data.frame(
  id = c("Sample_01", "Sample_02", "Sample_03"),
  lon = c(18.4241, 28.0473, 31.0218),
  lat = c(-33.9249, -26.2041, -29.8587)
)

features <- apply(sample_points, 1, function(row) {
  ee$Feature(ee$Geometry$Point(c(as.numeric(row["lon"]), as.numeric(row["lat"]))), list(sample_id = row["id"]))
})
points <- ee$FeatureCollection(features)

# 3. Stack Covariate Layers
${checkedDatasets.map(d => {
  const p = PRESETS[d] || {};
  if (d === "srtm") {
    return `img_${d} <- ee$Image('${p.asset || "USGS/SRTMGL1_003"}')$select('elevation')$rename('srtm_elevation')`;
  }
  return `img_${d} <- ee$ImageCollection('${p.asset || "UCSB-CHG/CHIRPS/DAILY"}')$
  filterDate('${startDate}', '${endDate}')$
  select('${p.band || "precipitation"}')$
  ${p.reducer || "mean"}()$
  rename('${d}_val')`;
}).join("\n\n")}

stacked <- ee$Image$cat(list(${checkedDatasets.map(d => `img_${d}`).join(", ")}))

# 4. Extract Covariates
extracted <- stacked$reduceRegions(
  collection = points,
  reducer = ee$Reducer$${zonalStat}(),
  scale = ${scale}
)

# 5. Export Table to Google Drive (CSV)
task <- ee$batch$Export$table$toDrive(
  collection = extracted,
  description = 'PhyloCov_Discrete_Covariates',
  folder = 'PhyloCov_Exports',
  fileNamePrefix = 'phylocov_discrete_covariates',
  fileFormat = 'CSV'
)

task$start()
message("Extraction task submitted! Check progress with: ee_monitoring(task)")
`;
        } else {
          // JavaScript (GEE Code Editor)
          return `/**
 * PhyloCov Explorer - Reproducible Earth Engine Pipeline Script
 * Pipeline: Discrete Covariate Extraction for GLM / Phylogeography
 * Layers: ${checkedDatasets.join(", ")}
 * Generated: ${nowIso}
 * 
 * Paste directly into Google Earth Engine Code Editor:
 * https://code.earthengine.google.com
 */

// 1. Define Sample Points / Features
var points = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([18.4241, -33.9249]), { sample_id: 'Sample_01' }),
  ee.Feature(ee.Geometry.Point([28.0473, -26.2041]), { sample_id: 'Sample_02' }),
  ee.Feature(ee.Geometry.Point([31.0218, -29.8587]), { sample_id: 'Sample_03' })
]);

// 2. Prepare Covariate Layers
${checkedDatasets.map(d => {
  const p = PRESETS[d] || {};
  if (d === "srtm") {
    return `var img_${d} = ee.Image('${p.asset || "USGS/SRTMGL1_003"}').select(['elevation'], ['srtm_elevation']);`;
  }
  return `var img_${d} = ee.ImageCollection('${p.asset || "UCSB-CHG/CHIRPS/DAILY"}')
  .filterDate('${startDate}', '${endDate}')
  .select(['${p.band || "precipitation"}'])
  .${p.reducer || "mean"}()
  .rename('${d}_val');`;
}).join("\n\n")}

// 3. Stack Layers into Multi-Band Image
var stacked = ee.Image.cat([${checkedDatasets.map(d => `img_${d}`).join(", ")}]);

// 4. Sample Points Across Covariates
var extracted = stacked.reduceRegions({
  collection: points,
  reducer: ee.Reducer.${zonalStat}(),
  scale: ${scale}
});

// 5. Visualize Sample Locations
Map.centerObject(points, 5);
Map.addLayer(points, { color: 'red' }, 'Sample Locations');

// 6. Export Table to Google Drive (CSV)
Export.table.toDrive({
  collection: extracted,
  description: 'PhyloCov_Discrete_Covariates',
  folder: 'PhyloCov_Exports',
  fileNamePrefix: 'phylocov_discrete_covariates',
  fileFormat: 'CSV'
});
`;
        }
      }

      function highlightSyntax(code, lang) {
        const tokens = [];
        const placeholder = (idx) => `___TOK_${idx}___`;

        // Protect block comments & docstrings
        let text = code.replace(/("""[\s\S]*?"""|\/\*[\s\S]*?\*\/)/g, (match) => {
          const idx = tokens.length;
          tokens.push(`<span class="tok-comment">${escapeHtmlString(match)}</span>`);
          return placeholder(idx);
        });

        // Protect line comments
        const commentRegex = (lang === "python" || lang === "r") ? /(#.*$)/gm : /(\/\/.*$)/gm;
        text = text.replace(commentRegex, (match) => {
          const idx = tokens.length;
          tokens.push(`<span class="tok-comment">${escapeHtmlString(match)}</span>`);
          return placeholder(idx);
        });

        // Protect strings
        text = text.replace(/('(?:\\'|[^'\r\n])*'|"(?:\\"|[^"\r\n])*")/g, (match) => {
          const idx = tokens.length;
          tokens.push(`<span class="tok-string">${escapeHtmlString(match)}</span>`);
          return placeholder(idx);
        });

        text = escapeHtmlString(text);

        // Numbers
        text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, (match) => {
          const idx = tokens.length;
          tokens.push(`<span class="tok-number">${match}</span>`);
          return placeholder(idx);
        });

        // Keywords
        const pyKeywords = /\b(import|from|as|def|class|return|try|except|if|else|elif|for|in|True|False|None|print)\b/g;
        const rKeywords = /\b(library|function|return|if|else|for|in|TRUE|FALSE|NULL|message|c)\b/g;
        const jsKeywords = /\b(var|let|const|function|return|try|catch|if|else|for|of|in|true|false|null|new)\b/g;
        const kwRegex = lang === "python" ? pyKeywords : (lang === "r" ? rKeywords : jsKeywords);

        text = text.replace(kwRegex, (match) => {
          const idx = tokens.length;
          tokens.push(`<span class="tok-keyword">${match}</span>`);
          return placeholder(idx);
        });

        // GEE methods & classes
        const geeMethods = /\b(ee|ee_Initialize|ee_image_to_drive|ee_monitoring|ImageCollection|Image|Geometry|BBox|Point|Feature|FeatureCollection|Reducer|Export|image|table|toDrive|filterDate|filterBounds|select|clip|multiply|add|reduceRegions|sampleRegions|start|Map|addLayer|centerObject)\b/g;
        text = text.replace(geeMethods, (match) => {
          const idx = tokens.length;
          tokens.push(`<span class="tok-func">${match}</span>`);
          return placeholder(idx);
        });

        // Restore tokens
        for (let i = tokens.length - 1; i >= 0; i--) {
          text = text.replaceAll(placeholder(i), tokens[i]);
        }

        return text;
      }

      function updateCodeModalContent() {
        let code = "";
        if (currentCodeModalPipeline === "continuous") {
          code = generateContinuousScript(currentCodeModalLang);
          if (codeExportPipelineSubtitle) {
            codeExportPipelineSubtitle.textContent = "Pipeline 1 · Continuous Covariate Raster Composite (GeoTIFF) Export";
          }
          if (codeEditorConfigBadge) {
            codeEditorConfigBadge.textContent = "Pipeline 1 · Continuous Composite";
          }
        } else {
          code = generateDiscreteScript(currentCodeModalLang);
          if (codeExportPipelineSubtitle) {
            codeExportPipelineSubtitle.textContent = "Pipeline 2 · Discrete Point & Polygon Covariate Extraction (CSV)";
          }
          if (codeEditorConfigBadge) {
            codeEditorConfigBadge.textContent = "Pipeline 2 · Discrete GLM Extraction";
          }
        }

        currentRawCode = code;

        // Filename and download labels
        let ext = ".py";
        if (currentCodeModalLang === "r") ext = ".R";
        if (currentCodeModalLang === "javascript") ext = ".js";

        const filename = `phylocov_${currentCodeModalPipeline}_pipeline${ext}`;
        if (codeEditorFilename) codeEditorFilename.textContent = filename;
        if (downloadCodeBtnText) downloadCodeBtnText.textContent = `Download ${ext}`;

        if (codeExportPre) {
          codeExportPre.innerHTML = highlightSyntax(code, currentCodeModalLang);
        }
      }

      function openCodeExportModal(pipelineType = "continuous") {
        currentCodeModalPipeline = pipelineType;
        if (codeExportModal) {
          codeExportModal.style.display = "flex";
        }
        updateCodeModalContent();
      }

      function closeCodeExportModal() {
        if (codeExportModal) {
          codeExportModal.style.display = "none";
        }
      }

      // Tab switching
      if (langTabs.length > 0) {
        langTabs.forEach(tab => {
          tab.addEventListener("click", () => {
            langTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentCodeModalLang = tab.dataset.lang || "python";
            updateCodeModalContent();
          });
        });
      }

      // Copy Code
      if (copyCodeBtn) {
        copyCodeBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(currentRawCode);
            if (copyCodeBtnText) copyCodeBtnText.textContent = "Copied!";
            copyCodeBtn.style.borderColor = "var(--accent-color)";
            copyCodeBtn.style.color = "var(--accent-color)";
            setTimeout(() => {
              if (copyCodeBtnText) copyCodeBtnText.textContent = "Copy Code";
              copyCodeBtn.style.borderColor = "";
              copyCodeBtn.style.color = "";
            }, 2000);
          } catch (err) {
            console.error("Failed to copy code to clipboard", err);
          }
        });
      }

      // Download Code File
      if (downloadCodeBtn) {
        downloadCodeBtn.addEventListener("click", () => {
          let ext = ".py";
          let mime = "text/x-python";
          if (currentCodeModalLang === "r") {
            ext = ".R";
            mime = "text/x-r";
          } else if (currentCodeModalLang === "javascript") {
            ext = ".js";
            mime = "application/javascript";
          }

          const filename = `phylocov_${currentCodeModalPipeline}_pipeline${ext}`;
          const blob = new Blob([currentRawCode], { type: `${mime};charset=utf-8` });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }

      // Modal Triggers
      if (navOpenCodeBtn) {
        navOpenCodeBtn.addEventListener("click", () => {
          openCodeExportModal(activePipeline || "continuous");
        });
      }

      if (mapInspectCodeBtn) {
        mapInspectCodeBtn.addEventListener("click", () => {
          openCodeExportModal("continuous");
        });
      }

      if (glmInspectCodeBtn) {
        glmInspectCodeBtn.addEventListener("click", () => {
          openCodeExportModal("discrete");
        });
      }

      // Modal Close Listeners
      if (closeCodeExportBtn) {
        closeCodeExportBtn.addEventListener("click", closeCodeExportModal);
      }

      if (codeExportModal) {
        codeExportModal.addEventListener("click", (e) => {
          if (e.target === codeExportModal) {
            closeCodeExportModal();
          }
        });
      }

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && codeExportModal && codeExportModal.style.display === "flex") {
          closeCodeExportModal();
        }
      });
    }
  }
});
