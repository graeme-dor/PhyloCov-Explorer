import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import ee
from google.cloud import storage
from datetime import timedelta
from typing import Optional
app = FastAPI(title="PhyloCov Backend Export Service")

# CORS support for future frontend integration
# TODO: Restrict allowed origins to specific domains before production deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ID = "ee-graemedor"
GCS_BUCKET = "bucket-quickstart_ee-graemedor"

# Initialize Earth Engine with the specified project
try:
    ee.Initialize(project=PROJECT_ID)
except Exception as e:
    print(f"Failed to initialize Earth Engine: {e}")
    # Note: Requires Google Application Default Credentials to be set up in the environment.

class ExportRequest(BaseModel):
    dataset: str
    country: str
    start_date: str
    end_date: str
    scale: int

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/exports")
def create_export(req: ExportRequest):
    """
    Frontend Integration Note:
    Update the frontend to call this endpoint instead of ee.Image.getDownloadURL for large extents.
    POST /exports with a JSON body matching the ExportRequest schema.
    """
    # Validate the dataset
    valid_datasets = ["chirps", "era5", "modis_ndvi", "srtm"]
    if req.dataset not in valid_datasets:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported dataset. Must be one of: {', '.join(valid_datasets)}"
        )

    # Fetch country feature and check if it exists
    try:
        lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
        roi = lsib.filter(ee.Filter.eq("country_na", req.country))
        
        # Warning: roi.size().getInfo() makes a blocking network call to EE
        if roi.size().getInfo() == 0:
            raise HTTPException(
                status_code=404, 
                detail=f"Country '{req.country}' not found in USDOS/LSIB_SIMPLE/2017"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Earth Engine error checking country: {str(e)}"
        )

    try:
        # Create roiMask
        roiMask = ee.Image.constant(1).clip(roi).selfMask()

        # Recreate the selected image based on the dataset
        if req.dataset == "chirps":
            img_col = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY") \
                .filterDate(req.start_date, req.end_date) \
                .select("precipitation")
            img = img_col.mean()
        
        elif req.dataset == "era5":
            img_col = ee.ImageCollection("ECMWF/ERA5/DAILY") \
                .filterDate(req.start_date, req.end_date) \
                .select("mean_2m_air_temperature")
            img = img_col.mean().subtract(273.15) # Kelvin to Celsius
        
        elif req.dataset == "modis_ndvi":
            img_col = ee.ImageCollection("MODIS/061/MOD13Q1") \
                .filterDate(req.start_date, req.end_date) \
                .select("NDVI")
            img = img_col.mean().multiply(0.0001)
        
        elif req.dataset == "srtm":
            img = ee.Image("USGS/SRTMGL1_003").select("elevation")

        # Apply ROI masking logic
        img = img.updateMask(roiMask).clip(roi).rename("value")
        
        # Launch export task
        job_id = str(uuid.uuid4())
        safe_country = req.country.replace(" ", "_").replace("/", "_")
        file_prefix = f"exports/{req.dataset}/PhyloCov_{req.dataset}_{safe_country}_{req.start_date}_to_{req.end_date}_scale{req.scale}m_{job_id}"
        
        task = ee.batch.Export.image.toCloudStorage(
            image=img,
            description=f"Export_{req.dataset}_{safe_country}",
            bucket=GCS_BUCKET,
            fileNamePrefix=file_prefix,
            scale=req.scale,
            crs="EPSG:4326",
            fileFormat="GeoTIFF",
            maxPixels=1e13
        )
        
        task.start()
        
        return {
            "job_id": job_id,
            "ee_task_id": task.id,
            "status": "SUBMITTED",
            "bucket": GCS_BUCKET,
            "file_prefix": file_prefix
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Earth Engine export error: {str(e)}"
        )

@app.get("/exports/{task_id}")
def get_export_status(task_id: str):
    try:
        task_status_list = ee.data.getTaskStatus(task_id)
        if not task_status_list or len(task_status_list) == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        
        task_info = task_status_list[0]
        return {
            "ee_task_id": task_info.get("id"),
            "state": task_info.get("state"),
            "description": task_info.get("description"),
            "error_message": task_info.get("error_message", None)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving task status: {str(e)}")

@app.get("/exports/{task_id}/download")
def get_export_download_url(task_id: str):
    try:
        # 1. Check task status
        task_status_list = ee.data.getTaskStatus(task_id)
        if not task_status_list or len(task_status_list) == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        
        task_info = task_status_list[0]
        if task_info.get("state") != "COMPLETED":
            raise HTTPException(
                status_code=400, 
                detail=f"Task is not completed. Current state: {task_info.get('state')}"
            )
        
        # 2. Reconstruct the GCS prefix based on the task description or id
        # EE batch exports usually create files with the prefix we provided, potentially split if very large.
        # However, for our scale, it's typically one file.
        # We need to list the bucket and find the file that matches the prefix.
        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(GCS_BUCKET)
        
        # The file_prefix was something like exports/dataset/...
        # But we don't have the original file_prefix stored here.
        # Fortunately, Earth Engine stores the destination URIs in the task_info!
        dest_uris = task_info.get("destination_uris", [])
        if not dest_uris:
            raise HTTPException(status_code=404, detail="No output files found for this task")
        
        gcs_uri = dest_uris[0] # e.g. "gs://bucket/..." or "https://console.cloud.google.com/storage/browser/bucket/..."
        
        blob_bucket = None
        blob_prefix = None
        
        if gcs_uri.startswith("gs://"):
            path_parts = gcs_uri.replace("gs://", "").split("/", 1)
            blob_bucket = path_parts[0]
            blob_prefix = path_parts[1] if len(path_parts) > 1 else ""
        elif "storage/browser/" in gcs_uri:
            # Extract bucket and prefix from the console URL
            base_split = gcs_uri.split("storage/browser/")[1]
            path_parts = base_split.split("/", 1)
            blob_bucket = path_parts[0]
            blob_prefix = path_parts[1] if len(path_parts) > 1 else ""
        else:
            raise HTTPException(status_code=500, detail=f"Unknown destination URI format: {gcs_uri}")
            
        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(blob_bucket)
        
        # Earth Engine might return a prefix without .tif, so we list blobs that match the prefix
        blobs = list(bucket.list_blobs(prefix=blob_prefix))
        if not blobs:
            raise HTTPException(status_code=404, detail="Exported file not found in Google Cloud Storage")
            
        # In case it splits into multiple, we just link the first one for now
        blob = blobs[0]
            
        # 3. Generate a signed URL
        # We must provide the service_account_email so Cloud Run uses the IAM Credentials API to sign it
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=1),
            method="GET",
            service_account_email="phylocov-exporter@ee-graemedor.iam.gserviceaccount.com"
        )
        
        return {"download_url": url}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating download URL: {str(e)}")

@app.get("/map")
def get_map_tiles(dataset: str, start_date: str, end_date: str, country: Optional[str] = None):
    """
    Returns the tile URL format for a given dataset and date range to be displayed on a Leaflet map.
    If country is provided, clips the visualization to that country and returns its bounding box.
    """
    valid_datasets = ["chirps", "era5", "modis_ndvi", "srtm"]
    if dataset not in valid_datasets:
        raise HTTPException(status_code=400, detail=f"Unsupported dataset: {dataset}")

    try:
        if dataset == "chirps":
            img_col = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY") \
                .filterDate(start_date, end_date) \
                .select("precipitation")
            img = img_col.mean()
            vis_params = {"min": 0, "max": 50, "palette": ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494']}
            
        elif dataset == "era5":
            img_col = ee.ImageCollection("ECMWF/ERA5/DAILY") \
                .filterDate(start_date, end_date) \
                .select("mean_2m_air_temperature")
            img = img_col.mean().subtract(273.15) # Kelvin to Celsius
            vis_params = {"min": 0, "max": 40, "palette": ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']}
            
        elif dataset == "modis_ndvi":
            img_col = ee.ImageCollection("MODIS/061/MOD13Q1") \
                .filterDate(start_date, end_date) \
                .select("NDVI")
            img = img_col.mean().multiply(0.0001)
            vis_params = {"min": 0.0, "max": 1.0, "palette": ['#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201', '#004C00', '#023B01', '#012E01', '#011D01', '#011301']}
            
        elif dataset == "srtm":
            img = ee.Image("USGS/SRTMGL1_003").select("elevation")
            vis_params = {"min": 0, "max": 3000, "palette": ['#000000', '#478FCD', '#86C58E', '#AFC35E', '#8F7131', '#B78D4C', '#E2B8A6', '#FFFFFF']}

        bounds = None
        if country:
            lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
            roi = lsib.filter(ee.Filter.eq("country_na", country))
            
            if roi.size().getInfo() == 0:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Country '{country}' not found in USDOS/LSIB_SIMPLE/2017"
                )
                
            roiMask = ee.Image.constant(1).clip(roi).selfMask()
            img = img.updateMask(roiMask).clip(roi)
            
            # Extract bounding box to return to the frontend
            geom_dict = roi.geometry().bounds().getInfo()
            coords = geom_dict['coordinates'][0]
            lons = [p[0] for p in coords]
            lats = [p[1] for p in coords]
            # Leaflet bounds format: [[south, west], [north, east]]
            bounds = [[min(lats), min(lons)], [max(lats), max(lons)]]

        # Get the map ID dictionary which contains the tile fetcher URL
        map_id_dict = ee.Image(img).getMapId(vis_params)
        
        return {
            "urlFormat": map_id_dict["tile_fetcher"].url_format,
            "bounds": bounds
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Earth Engine map generation error: {str(e)}")
