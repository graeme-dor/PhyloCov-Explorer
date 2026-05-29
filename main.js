import './style.css';

document.addEventListener("DOMContentLoaded", () => {
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
      const payload = {
        dataset: formData.get("dataset"),
        country: formData.get("country"),
        start_date: formData.get("start_date"),
        end_date: formData.get("end_date"),
        scale: parseInt(formData.get("scale"), 10)
      };

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
    }).setView([-28.479, 24.672], 5); // Default center (South Africa)

    // Add Dark Base Map (CartoDB Dark Matter)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    let currentEELayer = null;
    const BACKEND_URL = "https://phylocov-export-backend-719941553080.europe-west1.run.app"; // Update for local dev if needed: http://127.0.0.1:8000
    
    const updateMapBtn = document.getElementById("updateMapBtn");
    const datasetSelect = document.getElementById("map_dataset");
    const startDateInput = document.getElementById("map_start_date");
    const endDateInput = document.getElementById("map_end_date");
    const countryInput = document.getElementById("map_country");
    const regionInput = document.getElementById("map_region");
    const datasetInfoBox = document.getElementById("datasetInfoBox");
    const mapScaleInput = document.getElementById("map_scale");
    
    // Dataset Metadata
    const datasetMetadata = {
      chirps: { res: 5566, text: "Native Resolution: ~5.5km | Temporal: Daily" },
      era5: { res: 27830, text: "Native Resolution: ~27.8km | Temporal: Daily" },
      modis_ndvi: { res: 250, text: "Native Resolution: 250m | Temporal: 16-day" },
      srtm: { res: 30, text: "Native Resolution: 30m | Temporal: Static" }
    };

    if (datasetSelect) {
      datasetSelect.addEventListener("change", () => {
        const meta = datasetMetadata[datasetSelect.value];
        if (meta && datasetInfoBox && mapScaleInput) {
          datasetInfoBox.textContent = meta.text;
          mapScaleInput.value = meta.res;
        }
      });
    }

    // ROI Toggle Logic
    const roiRadios = document.querySelectorAll('input[name="roi_type"]');
    roiRadios.forEach(radio => {
      radio.addEventListener("change", (e) => {
        if (e.target.value === "country") {
          countryInput.style.display = "block";
          regionInput.style.display = "none";
          countryInput.required = true;
          regionInput.required = false;
        } else {
          countryInput.style.display = "none";
          regionInput.style.display = "block";
          countryInput.required = false;
          regionInput.required = true;
        }
      });
    });

    // Update Map visualization
    if (updateMapBtn) {
      updateMapBtn.addEventListener("click", async () => {
        const dataset = datasetSelect.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        
        const roiType = document.querySelector('input[name="roi_type"]:checked').value;
        const roiName = roiType === "country" ? countryInput.value : regionInput.value;

        updateMapBtn.disabled = true;
        updateMapBtn.textContent = "Loading tiles...";

        try {
          const response = await fetch(`${BACKEND_URL}/map?dataset=${dataset}&start_date=${startDate}&end_date=${endDate}&roi_type=${roiType}&roi_name=${encodeURIComponent(roiName)}`);
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

          // Auto-zoom to country bounds if returned
          if (data.bounds) {
            map.fitBounds(data.bounds, { padding: [20, 20], maxZoom: 8 });
          }

        } catch (error) {
          console.error("Map Update Error:", error);
          alert("Error loading map layer: " + error.message);
        } finally {
          updateMapBtn.disabled = false;
          updateMapBtn.textContent = "Update Map";
        }
      });
    }

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
        mapDownloadContainer.style.display = "none";
        mapStatusText.textContent = "SUBMITTED";
        mapStatusMessage.textContent = "Submitting task to Earth Engine...";
        mapStatusDot.style.backgroundColor = "#d2a8ff";

        const formData = new FormData(mapForm);
        const startDate = formData.get("start_date");
        const endDate = formData.get("end_date");
        const scale = parseInt(formData.get("scale"), 10);

        mapEstimatedText = estimateExportTime(startDate, endDate, scale);

        mapTimer.style.display = "block";
        mapStartTime = Date.now();
        updateMapTimer();
        if (mapTimerInterval) clearInterval(mapTimerInterval);
        mapTimerInterval = setInterval(updateMapTimer, 1000);

        const roiType = document.querySelector('input[name="roi_type"]:checked').value;
        const roiName = roiType === "country" ? formData.get("country") : formData.get("region");
        const payload = {
          dataset: formData.get("dataset"),
          roi_type: roiType,
          roi_name: roiName,
          start_date: formData.get("start_date"),
          end_date: formData.get("end_date"),
          scale: parseInt(formData.get("scale"), 10)
        };

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
