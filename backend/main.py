import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import ee
from google.cloud import storage
from datetime import datetime, timedelta
from typing import Optional, List
import google.auth
from google.auth.transport import requests
import urllib.request
import json
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

def adjust_monthly_dates(start_date_str: str, end_date_str: str):
    try:
        start = datetime.strptime(start_date_str, "%Y-%m-%d")
        end = datetime.strptime(end_date_str, "%Y-%m-%d")
        
        # First day of the start month
        adjusted_start = start.replace(day=1)
        
        # First day of the month after the end month (since end is exclusive)
        if end.month == 12:
            adjusted_end = end.replace(year=end.year + 1, month=1, day=1)
        else:
            adjusted_end = end.replace(month=end.month + 1, day=1)
            
        return adjusted_start.strftime("%Y-%m-%d"), adjusted_end.strftime("%Y-%m-%d")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format. Must be YYYY-MM-DD. Error: {str(e)}"
        )

PRESETS = {
    "chirps": {
        "asset": "UCSB-CHG/CHIRPS/DAILY",
        "band": "precipitation",
        "reducer": "mean",
        "multiplier": 1.0,
        "offset": 0.0,
        "is_monthly": False,
        "palette": ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494'],
        "vis_min": 0.0,
        "vis_max": 50.0
    },
    "era5": {
        "asset": "ECMWF/ERA5/DAILY",
        "band": "mean_2m_air_temperature",
        "reducer": "mean",
        "multiplier": 1.0,
        "offset": -273.15,
        "is_monthly": False,
        "palette": ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
        "vis_min": 0.0,
        "vis_max": 40.0
    },
    "era5_land_monthly": {
        "asset": "ECMWF/ERA5_LAND/MONTHLY_AGGR",
        "band": "temperature_2m",
        "reducer": "mean",
        "multiplier": 1.0,
        "offset": -273.15,
        "is_monthly": True,
        "palette": ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
        "vis_min": 0.0,
        "vis_max": 40.0
    },
    "modis_lst_day": {
        "asset": "MODIS/061/MOD21C3",
        "band": "LST_Day",
        "reducer": "mean",
        "multiplier": 1.0,
        "offset": -273.15,
        "is_monthly": True,
        "palette": ['#313695', '#4575b4', '#74add1', '#ffffbf', '#fee090', '#f46d43', '#a50026'],
        "vis_min": 0.0,
        "vis_max": 40.0
    },
    "modis_lst_night": {
        "asset": "MODIS/061/MOD21C3",
        "band": "LST_Night",
        "reducer": "mean",
        "multiplier": 1.0,
        "offset": -273.15,
        "is_monthly": True,
        "palette": ['#053061', '#2166ac', '#4393c3', '#f7f7f7', '#fddbc7', '#d6604f', '#b2182b'],
        "vis_min": -10.0,
        "vis_max": 25.0
    },
    "modis_lst_range": {
        "asset": "MODIS/061/MOD21C3",
        "band": "range",
        "reducer": "mean",
        "multiplier": 1.0,
        "offset": -273.15,
        "is_monthly": True,
        "palette": ['#ffffd9', '#edf8b1', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#081d58'],
        "vis_min": 5.0,
        "vis_max": 25.0
    },
    "modis_ndvi": {
        "asset": "MODIS/061/MOD13Q1",
        "band": "NDVI",
        "reducer": "mean",
        "multiplier": 0.0001,
        "offset": 0.0,
        "is_monthly": False,
        "palette": ['#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201', '#004C00', '#023B01', '#012E01', '#011D01', '#011301'],
        "vis_min": 0.0,
        "vis_max": 1.0
    },
    "srtm": {
        "asset": "USGS/SRTMGL1_003",
        "band": "elevation",
        "reducer": "none",
        "multiplier": 1.0,
        "offset": 0.0,
        "is_monthly": False,
        "palette": ['#000000', '#478FCD', '#86C58E', '#AFC35E', '#8F7131', '#B78D4C', '#E2B8A6', '#FFFFFF'],
        "vis_min": 0.0,
        "vis_max": 3000.0
    }
}

def process_gee_image(
    dataset: str,
    start_date: str,
    end_date: str,
    band: Optional[str] = None,
    reducer: str = "mean",
    multiplier: float = 1.0,
    offset: float = 0.0
) -> ee.Image:
    preset_key = dataset.lower()
    
    if preset_key in PRESETS:
        preset = PRESETS[preset_key]
        asset_id = preset["asset"]
        target_band = preset["band"]
        target_reducer = preset["reducer"]
        target_multiplier = preset["multiplier"]
        target_offset = preset["offset"]
        is_monthly = preset["is_monthly"]
        
        if preset_key == "srtm":
            return ee.Image(asset_id).select(target_band)
            
        if preset_key == "modis_lst_range":
            adjusted_start, adjusted_end = adjust_monthly_dates(start_date, end_date)
            img_col = ee.ImageCollection(asset_id).filterDate(adjusted_start, adjusted_end)
            if img_col.size().getInfo() == 0:
                raise HTTPException(
                    status_code=400, 
                    detail="No data available in this date range for MODIS LST Day-Night Range."
                )
            day = img_col.select("LST_Day").mean().subtract(273.15)
            night = img_col.select("LST_Night").mean().subtract(273.15)
            return day.subtract(night)
            
        if is_monthly:
            adjusted_start, adjusted_end = adjust_monthly_dates(start_date, end_date)
        else:
            adjusted_start, adjusted_end = start_date, end_date
            
        img_col = ee.ImageCollection(asset_id).filterDate(adjusted_start, adjusted_end)
        if img_col.size().getInfo() == 0:
            msg = "No data available in this date range."
            if "era5" in preset_key:
                msg += " Note: ERA5 reanalysis datasets typically have a 2-3 month processing lag."
            elif "modis" in preset_key:
                msg += " Note: MODIS datasets may have a short lag."
            raise HTTPException(status_code=400, detail=msg)
            
        img = img_col.select(target_band)
        
        if target_reducer == "sum":
            img = img.sum()
        elif target_reducer == "min":
            img = img.min()
        elif target_reducer == "max":
            img = img.max()
        elif target_reducer == "median":
            img = img.median()
        else:
            img = img.mean()
            
        if target_multiplier != 1.0:
            img = img.multiply(target_multiplier)
        if target_offset != 0.0:
            img = img.add(target_offset)
            
        return img
        
    else:
        asset_id = dataset
        is_image = False
        try:
            temp_img = ee.Image(asset_id)
            temp_img.bandNames().getInfo()
            is_image = True
        except Exception:
            is_image = False
            
        if is_image:
            img = ee.Image(asset_id)
            if band:
                img = img.select(band)
        else:
            is_monthly = "monthly" in asset_id.lower()
            if is_monthly:
                adjusted_start, adjusted_end = adjust_monthly_dates(start_date, end_date)
            else:
                adjusted_start, adjusted_end = start_date, end_date
                
            img_col = ee.ImageCollection(asset_id).filterDate(adjusted_start, adjusted_end)
            if img_col.size().getInfo() == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data available for custom GEE asset '{asset_id}' in the selected date range."
                )
            if band:
                img_col = img_col.select(band)
                
            if reducer == "sum":
                img = img_col.sum()
            elif reducer == "min":
                img = img_col.min()
            elif reducer == "max":
                img = img_col.max()
            elif reducer == "median":
                img = img_col.median()
            else:
                img = img_col.mean()
                
        if multiplier is not None and multiplier != 1.0:
            img = img.multiply(multiplier)
        if offset is not None and offset != 0.0:
            img = img.add(offset)
            
        return img

class ExportRequest(BaseModel):
    dataset: str
    roi_type: str = "country"
    roi_names: List[str]
    start_date: str
    end_date: str
    scale: int
    band: Optional[str] = None
    reducer: str = "mean"
    multiplier: float = 1.0
    offset: float = 0.0

@app.get("/health")
def health_check():
    return {"status": "ok"}

def fetch_stac_metadata(asset_id: str) -> Optional[dict]:
    try:
        parts = asset_id.split("/")
        if not parts:
            return None
        first_part = parts[0]
        underscored = asset_id.replace("/", "_")
        url = f"https://storage.googleapis.com/earthengine-stac/catalog/{first_part}/{underscored}.json"
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=2.0) as response:
            return json.loads(response.read().decode())
    except Exception:
        return None

@app.get("/datasets/info")
def get_dataset_info(id: str):
    """
    Given a GEE Asset ID, queries whether it is an Image or ImageCollection,
    and returns its available bands with detailed descriptions, recommended scaling, 
    and visualization parameters when available from Earth Engine STAC metadata catalog.
    """
    if not id:
        raise HTTPException(status_code=400, detail="Missing asset 'id' parameter.")
    
    preset_key = id.lower()
    if preset_key in PRESETS:
        asset_id = PRESETS[preset_key]["asset"]
    else:
        asset_id = id

    asset_type = None
    direct_bands = []
    
    try:
        img = ee.Image(asset_id)
        direct_bands = img.bandNames().getInfo()
        asset_type = "Image"
    except Exception as e_img:
        try:
            col = ee.ImageCollection(asset_id)
            first_img = col.first()
            if first_img is None:
                raise HTTPException(status_code=404, detail=f"Asset '{asset_id}' is an empty ImageCollection.")
            direct_bands = first_img.bandNames().getInfo()
            asset_type = "ImageCollection"
        except Exception as e_col:
            err_msg = str(e_img) if "not found" in str(e_img) else str(e_col)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to load GEE asset '{asset_id}'. Error: {err_msg}"
            )

    if preset_key == "modis_lst_range":
        if "range" not in direct_bands:
            direct_bands.append("range")

    stac_data = fetch_stac_metadata(asset_id)
    stac_bands = {}
    gee_vis = []
    
    if stac_data:
        summaries = stac_data.get("summaries", {})
        for b in summaries.get("eo:bands", []):
            name = b.get("name")
            if name:
                stac_bands[name] = {
                    "description": b.get("description", ""),
                    "scale": b.get("gee:scale", 1.0),
                    "offset": b.get("gee:offset", 0.0),
                    "units": b.get("gee:units", ""),
                    "vis": None
                }
        gee_vis = summaries.get("gee:visualizations", [])

    for vis in gee_vis:
        band_vis = vis.get("image_visualization", {}).get("band_vis", {})
        vis_bands = band_vis.get("bands", [])
        if vis_bands:
            primary_band = vis_bands[0]
            if primary_band in stac_bands and not stac_bands[primary_band]["vis"]:
                stac_bands[primary_band]["vis"] = {
                    "min": band_vis.get("min", [0.0])[0],
                    "max": band_vis.get("max", [100.0])[0],
                    "palette": band_vis.get("palette", [])
                }

    rich_bands = []
    for b_id in direct_bands:
        if b_id in stac_bands:
            rich_bands.append({
                "id": b_id,
                "description": stac_bands[b_id]["description"],
                "scale": stac_bands[b_id]["scale"],
                "offset": stac_bands[b_id]["offset"],
                "units": stac_bands[b_id]["units"],
                "vis": stac_bands[b_id]["vis"]
            })
        else:
            desc = ""
            units = ""
            scale = 1.0
            offset = 0.0
            if b_id == "range":
                desc = "Diurnal LST Range (LST_Day - LST_Night)"
                units = "C"
            elif b_id == "elevation":
                desc = "Elevation"
                units = "m"
            elif b_id == "precipitation":
                desc = "Precipitation"
                units = "mm/day"
            elif b_id == "temperature_2m" or b_id == "mean_2m_air_temperature":
                desc = "Temperature"
                units = "C"
                offset = -273.15
            elif b_id == "NDVI":
                desc = "Normalized Difference Vegetation Index"
                scale = 0.0001
                
            rich_bands.append({
                "id": b_id,
                "description": desc,
                "scale": scale,
                "offset": offset,
                "units": units,
                "vis": None
            })

    # Retrieve nominal scale resolution dynamically from GEE projection info
    native_res = 5000
    try:
        if direct_bands:
            first_band = [b for b in direct_bands if b != "range"][0] # exclude virtual range band
            if asset_type == "Image":
                native_res = int(round(img.select(first_band).projection().nominalScale().getInfo()))
            else:
                first_img = col.first()
                if first_img:
                    native_res = int(round(first_img.select(first_band).projection().nominalScale().getInfo()))
    except Exception:
        pass

    # Snap commonly found nominal scales to standard GEE catalog resolutions
    if 25 <= native_res <= 35:
        native_res = 30
    elif 80 <= native_res <= 100:
        native_res = 90
    elif 220 <= native_res <= 260:
        native_res = 250
    elif 450 <= native_res <= 510:
        native_res = 500
    elif 900 <= native_res <= 1050:
        native_res = 1000
    elif 4000 <= native_res <= 4900:
        native_res = 4638
    elif 5000 <= native_res <= 6000:
        native_res = 5566
    elif 11000 <= native_res <= 11300:
        native_res = 11132
    elif 27000 <= native_res <= 28500:
        native_res = 27830


    return {
        "type": asset_type,
        "asset_id": asset_id,
        "resolution": native_res,
        "bands": rich_bands
    }

@app.post("/exports")
def create_export(req: ExportRequest):
    """
    Frontend Integration Note:
    Update the frontend to call this endpoint instead of ee.Image.getDownloadURL for large extents.
    POST /exports with a JSON body matching the ExportRequest schema.
    """
    # Validate the dataset
    preset_key = req.dataset.lower()
    if preset_key not in PRESETS:
        if not ("/" in req.dataset or req.dataset.startswith("projects/") or req.dataset.startswith("users/")):
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported dataset or invalid GEE Asset ID: '{req.dataset}'"
            )

    # Fetch ROI feature and check if it exists
    try:
        lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
        if req.roi_type == "region":
            roi = lsib.filter(ee.Filter.inList("wld_rgn", req.roi_names))
        else:
            roi = lsib.filter(ee.Filter.inList("country_na", req.roi_names))
        
        # Warning: roi.size().getInfo() makes a blocking network call to EE
        if roi.size().getInfo() == 0:
            raise HTTPException(
                status_code=404, 
                detail=f"{req.roi_type.capitalize()}s '{req.roi_names}' not found in USDOS/LSIB_SIMPLE/2017"
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
        img = process_gee_image(
            dataset=req.dataset,
            start_date=req.start_date,
            end_date=req.end_date,
            band=req.band,
            reducer=req.reducer,
            multiplier=req.multiplier,
            offset=req.offset
        )

        # Apply ROI masking logic
        img = img.updateMask(roiMask).clip(roi).rename("value")
        
        # Launch export task
        job_id = str(uuid.uuid4())
        
        if len(req.roi_names) > 3:
            safe_roi = f"Multiple_{req.roi_type.capitalize()}s"
        else:
            safe_roi = "_and_".join([name.replace(" ", "_").replace("/", "_") for name in req.roi_names])
            
        file_prefix = f"exports/{req.dataset}/PhyloCov_{req.dataset}_{safe_roi}_{req.start_date}_to_{req.end_date}_scale{req.scale}m_{job_id}"
        
        task = ee.batch.Export.image.toCloudStorage(
            image=img,
            description=f"Export_{req.dataset}_{safe_roi}_{job_id}",
            bucket=GCS_BUCKET,
            fileNamePrefix=file_prefix,
            scale=req.scale,
            region=roi.geometry().bounds(),
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
        
        job_id = task_info.get("description", "").split("_")[-1]
        
        # Earth Engine might return a prefix without .tif, so we list blobs that match the prefix
        all_blobs = list(bucket.list_blobs(prefix=blob_prefix))
        blobs = [b for b in all_blobs if job_id in b.name]
        
        if not blobs:
            raise HTTPException(status_code=404, detail="Exported file not found in Google Cloud Storage")
            
        # In case it splits into multiple, we just link the first one for now
        blob = blobs[0]
            
        # 3. Generate a signed URL
        # We must provide the service_account_email and access_token so Cloud Run uses the IAM Credentials API to sign it
        credentials, _ = google.auth.default()
        if not credentials.valid:
            credentials.refresh(requests.Request())
            
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=1),
            method="GET",
            service_account_email="phylocov-exporter@ee-graemedor.iam.gserviceaccount.com",
            access_token=credentials.token,
            response_disposition=f'attachment; filename="{blob.name.split("/")[-1]}"'
        )
        
        return {"download_url": url}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating download URL: {str(e)}")



@app.get("/map")
def get_map_tiles(
    dataset: str,
    start_date: str,
    end_date: str,
    roi_type: str = "country",
    roi_names: Optional[str] = None,
    band: Optional[str] = None,
    reducer: str = "mean",
    multiplier: float = 1.0,
    offset: float = 0.0,
    vis_min: Optional[float] = None,
    vis_max: Optional[float] = None,
    palette: Optional[str] = None
):
    """
    Returns the tile URL format for a given dataset and date range to be displayed on a Leaflet map.
    If roi_names is provided (comma-separated), clips the visualization to those regions/countries and returns their bounding box.
    """
    preset_key = dataset.lower()
    if preset_key not in PRESETS:
        if not ("/" in dataset or dataset.startswith("projects/") or dataset.startswith("users/")):
            raise HTTPException(status_code=400, detail=f"Unsupported dataset or invalid GEE Asset ID: {dataset}")

    try:
        img = process_gee_image(
            dataset=dataset,
            start_date=start_date,
            end_date=end_date,
            band=band,
            reducer=reducer,
            multiplier=multiplier,
            offset=offset
        )

        if preset_key in PRESETS:
            preset = PRESETS[preset_key]
            vis_params = {
                "min": preset["vis_min"],
                "max": preset["vis_max"],
                "palette": preset["palette"]
            }
        else:
            v_min = 0.0
            v_max = 1.0
            
            # Automatically calculate dynamic min and max over the ROI bounding box
            if roi_names:
                try:
                    names_list = roi_names.split(",")
                    lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
                    if roi_type == "region":
                        roi_feat = lsib.filter(ee.Filter.inList("wld_rgn", names_list))
                    else:
                        roi_feat = lsib.filter(ee.Filter.inList("country_na", names_list))
                        
                    if roi_feat.size().getInfo() > 0:
                        bounds_geom = roi_feat.geometry().bounds()
                        calc_scale = 50000 if roi_type == "region" else 25000
                        stats = img.reduceRegion(
                            reducer=ee.Reducer.minMax(),
                            geometry=bounds_geom,
                            scale=calc_scale,
                            maxPixels=1e9
                        ).getInfo()
                        
                        if stats:
                            min_val = None
                            max_val = None
                            for k, val in stats.items():
                                if val is None:
                                    continue
                                if k.endswith("_min"):
                                    min_val = val
                                elif k.endswith("_max"):
                                    max_val = val
                                    
                            if min_val is not None and max_val is not None:
                                if min_val == max_val:
                                    min_val -= 1.0
                                    max_val += 1.0
                                v_min = float(min_val)
                                v_max = float(max_val)
                            else:
                                values = [v for v in stats.values() if v is not None]
                                if len(values) >= 2:
                                    v_min = float(min(values))
                                    v_max = float(max(values))
                                    if v_min == v_max:
                                        v_min -= 1.0
                                        v_max += 1.0
                except Exception as e_range:
                    print(f"Dynamic map scaling range calculation failed: {e_range}")
                    v_min = 0.0
                    v_max = 100.0
            
            palette_list = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'] # Default viridis
            if palette:
                if "," in palette:
                    palette_list = [f"#{c.strip().lstrip('#')}" for c in palette.split(",") if c.strip()]
                elif palette == "coolwarm":
                    palette_list = ['#313695', '#4575b4', '#74add1', '#ffffbf', '#fee090', '#f46d43', '#a50026']
                elif palette == "grayscale":
                    palette_list = ['#000000', '#ffffff']
                elif palette == "terrain":
                    palette_list = ['#000000', '#478FCD', '#86C58E', '#AFC35E', '#8F7131', '#B78D4C', '#E2B8A6', '#FFFFFF']
                elif palette == "ndvi":
                    palette_list = ['#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201', '#004C00', '#023B01', '#012E01', '#011D01', '#011301']
                
            vis_params = {
                "min": v_min,
                "max": v_max,
                "palette": palette_list
            }

        bounds = None
        if roi_names:
            names_list = roi_names.split(",")
            lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
            if roi_type == "region":
                roi = lsib.filter(ee.Filter.inList("wld_rgn", names_list))
            else:
                roi = lsib.filter(ee.Filter.inList("country_na", names_list))
            
            if roi.size().getInfo() == 0:
                raise HTTPException(
                    status_code=404, 
                    detail=f"{roi_type.capitalize()}s '{roi_names}' not found in USDOS/LSIB_SIMPLE/2017"
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
