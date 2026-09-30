import uuid
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import io
import csv
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
from concurrent.futures import ThreadPoolExecutor
import math
import statistics
import zipfile
import shapefile
try:
    from shapely.geometry import shape as shapely_shape, mapping as shapely_mapping
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False


def simplify_geojson_geometry(geom: dict, max_coords_str: int = 8000) -> dict:
    """
    Client-side geometric simplification using Shapely before sending to Earth Engine.
    Ensures that high-resolution surveying shapefiles (e.g. GADM Level 1-4) do not
    exceed Google Earth Engine's 10MB API request payload limit.
    """
    if not HAS_SHAPELY or not geom or not geom.get("coordinates"):
        return geom
    try:
        coords_str_len = len(str(geom.get("coordinates", "")))
        if coords_str_len <= max_coords_str:
            return geom

        s = shapely_shape(geom)
        if not s.is_valid:
            s = s.buffer(0)

        # Adaptive tolerance in WGS84 degrees:
        # 0.0015 deg is ~165m; 0.003 deg is ~330m; 0.005 deg is ~550m
        # For remote sensing grids of 5km - 28km, 165m - 500m is virtually imperceptible (< 1-2% of a pixel).
        if coords_str_len > 250000:
            tol = 0.005
        elif coords_str_len > 60000:
            tol = 0.003
        else:
            tol = 0.0015

        simplified = s.simplify(tol, preserve_topology=True)
        if not simplified.is_empty:
            return shapely_mapping(simplified)
        return geom
    except Exception as e:
        print(f"Geometry simplification warning: {e}")
        return geom


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
    offset: float = 0.0,
    downsample_large_ranges: bool = False
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
            

        if is_monthly:
            adjusted_start, adjusted_end = adjust_monthly_dates(start_date, end_date)
        else:
            adjusted_start, adjusted_end = start_date, end_date
            
        img_col = ee.ImageCollection(asset_id).filterDate(adjusted_start, adjusted_end)

        # Downsample large ranges for daily map visualization to prevent Google EE timeouts
        if downsample_large_ranges and not is_monthly:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                days_span = (end_dt - start_dt).days
                if days_span > 1095: # Spans > 3 years
                    # Filter to only the 1st day of each month
                    img_col = img_col.filter(ee.Filter.calendarRange(1, 1, 'day_of_month'))
            except Exception as e_ds:
                print(f"Downsampling failed: {e_ds}")
        if img_col.limit(1).size().getInfo() == 0:
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

            # Downsample large ranges for daily map visualization to prevent Google EE timeouts
            if downsample_large_ranges and not is_monthly:
                try:
                    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                    days_span = (end_dt - start_dt).days
                    if days_span > 1095: # Spans > 3 years
                        img_col = img_col.filter(ee.Filter.calendarRange(1, 1, 'day_of_month'))
                except Exception as e_ds:
                    print(f"Downsampling failed: {e_ds}")

            if img_col.limit(1).size().getInfo() == 0:
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
            elif reducer == "mode":
                img = img_col.reduce(ee.Reducer.mode())
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

@app.get("/datasets/limits")
def get_dataset_limits():
    """
    Query Earth Engine in parallel for the actual first and last image timestamps in each preset collection.
    """
    limits = {}
    
    def fetch_limit(key):
        if key == "srtm":
            return key, {"start": None, "end": None}
        info = PRESETS[key]
        asset_id = info["asset"]
        try:
            col = ee.ImageCollection(asset_id)
            earliest = col.sort("system:time_start", True).first()
            earliest_time = earliest.get("system:time_start").getInfo()
            
            latest = col.sort("system:time_start", False).first()
            latest_time = latest.get("system:time_start").getInfo()
            
            if earliest_time and latest_time:
                start_date = datetime.utcfromtimestamp(earliest_time / 1000.0).strftime("%Y-%m-%d")
                end_date = datetime.utcfromtimestamp(latest_time / 1000.0).strftime("%Y-%m-%d")
                return key, {"start": start_date, "end": end_date}
        except Exception as e:
            print(f"Error querying GEE limits for {key}: {e}")
        return key, None

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = executor.map(fetch_limit, PRESETS.keys())
        for key, val in results:
            if val:
                limits[key] = val
                
    return limits

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

    # 1. Fast Path: Check Earth Engine STAC Catalog First (<200ms, no server-side sorting)
    stac_data = fetch_stac_metadata(asset_id)
    
    asset_type = None
    direct_bands = []
    start_date = None
    end_date = None
    stac_bands = {}
    gee_vis = []
    native_res = 5000

    if stac_data:
        gee_type = stac_data.get("gee:type", "").lower()
        asset_type = "ImageCollection" if "collection" in gee_type else "Image"
        
        # Temporal range from STAC interval
        temp_interval = stac_data.get("extent", {}).get("temporal", {}).get("interval", [[]])[0]
        if len(temp_interval) > 0 and temp_interval[0]:
            start_date = temp_interval[0][:10]
        if len(temp_interval) > 1 and temp_interval[1]:
            end_date = temp_interval[1][:10]
            
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
        direct_bands = list(stac_bands.keys())
        gee_vis = summaries.get("gee:visualizations", [])
        
        # Estimate resolution from asset name / STAC
        asset_lower = asset_id.lower()
        if any(k in asset_lower for k in ("10m", "dynamicworld", "s2", "worldcover")):
            native_res = 10
        elif any(k in asset_lower for k in ("30m", "landsat", "srtm")):
            native_res = 30
        elif any(k in asset_lower for k in ("250m", "mod13q1")):
            native_res = 250
        elif "500m" in asset_lower:
            native_res = 500
        elif any(k in asset_lower for k in ("1000m", "1km")):
            native_res = 1000

    # 2. Fallback to Earth Engine API only if STAC metadata wasn't available
    if not direct_bands:
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
                
                # Fetch starting date cheaply without unbounded reverse sort
                try:
                    start_ms = first_img.get("system:time_start").getInfo()
                    if start_ms:
                        start_date = datetime.fromtimestamp(start_ms / 1000.0).strftime("%Y-%m-%d")
                        end_date = datetime.now().strftime("%Y-%m-%d")
                except Exception as e_dates:
                    print(f"Failed to fetch date range for custom asset: {e_dates}")
            except Exception as e_col:
                err_msg = str(e_img) if "not found" in str(e_img) else str(e_col)
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to load GEE asset '{asset_id}'. Error: {err_msg}"
                )

    # 3. Parse visualization recommendations
    for vis in gee_vis:
        band_vis = vis.get("image_visualization", {}).get("band_vis", {})
        vis_bands = band_vis.get("bands", [])
        if vis_bands:
            primary_band = vis_bands[0]
            if primary_band in stac_bands and not stac_bands[primary_band]["vis"]:
                raw_palette = band_vis.get("palette", [])
                formatted_palette = ["#" + p.lstrip("#") for p in raw_palette]
                stac_bands[primary_band]["vis"] = {
                    "min": band_vis.get("min", [0.0])[0],
                    "max": band_vis.get("max", [100.0])[0],
                    "palette": formatted_palette
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
            elif b_id in ("temperature_2m", "mean_2m_air_temperature"):
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

    # Retrieve nominal scale resolution dynamically from GEE projection info if not set
    if native_res == 5000 and direct_bands and not stac_data:
        try:
            first_band = [b for b in direct_bands if b != "range"][0]
            if asset_type == "Image":
                native_res = int(round(ee.Image(asset_id).select(first_band).projection().nominalScale().getInfo()))
            else:
                first_img = ee.ImageCollection(asset_id).first()
                if first_img:
                    native_res = int(round(first_img.select(first_band).projection().nominalScale().getInfo()))
        except Exception:
            pass

    # Snap commonly found nominal scales to standard GEE catalog resolutions
    if 8 <= native_res <= 15:
        native_res = 10
    elif 25 <= native_res <= 35:
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
        "bands": rich_bands,
        "start_date": start_date,
        "end_date": end_date
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
        if req.roi_type == "bbox":
            coords = [float(x) for x in req.roi_names[0].split(",")] # format: minLat,minLon,maxLat,maxLon
            # ee.Geometry.Rectangle coordinates are: [west, south, east, north]
            # minLon, minLat, maxLon, maxLat -> [coords[1], coords[0], coords[3], coords[2]]
            roi = ee.Geometry.Rectangle([coords[1], coords[0], coords[3], coords[2]])
        else:
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
        
        if req.roi_type == "bbox":
            safe_roi = "Uploaded_Extent"
        elif len(req.roi_names) > 3:
            safe_roi = f"Multiple_{req.roi_type.capitalize()}s"
        else:
            safe_roi = "_and_".join([name.replace(" ", "_").replace("/", "_") for name in req.roi_names])
            
        file_prefix = f"exports/{req.dataset}/PhyloCov_{req.dataset}_{safe_roi}_{req.start_date}_to_{req.end_date}_scale{req.scale}m_{job_id}"
        
        # Sanitize Earth Engine task description: only a-zA-Z0-9.,:;_- allowed, max 100 characters.
        raw_description = f"Export_{req.dataset}_{safe_roi}_{job_id}"
        safe_description = "".join([c if c.isalnum() or c in ".,:;-_" else "_" for c in raw_description])
        if len(safe_description) > 100:
            safe_description = safe_description[:63] + "_" + job_id

        task = ee.batch.Export.image.toCloudStorage(
            image=img,
            description=safe_description,
            bucket=GCS_BUCKET,
            fileNamePrefix=file_prefix,
            scale=req.scale,
            region=roi if isinstance(roi, ee.Geometry) else roi.geometry().bounds(),
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
            offset=offset,
            downsample_large_ranges=True
        )

        if preset_key in PRESETS:
            preset = PRESETS[preset_key]
            vis_params = {
                "min": preset["vis_min"],
                "max": preset["vis_max"],
                "palette": preset["palette"]
            }
        else:
            v_min = vis_min if vis_min is not None else 0.0
            v_max = vis_max if vis_max is not None else 1.0
            
            # If band is categorical (e.g. Dynamic World label), default to class index range 0-8
            if (band == "label" or "dynamicworld" in dataset.lower()) and vis_min is None and vis_max is None:
                v_min = 0.0
                v_max = 8.0
            elif roi_names and (vis_min is None or vis_max is None):
                # Automatically calculate dynamic min and max over the ROI bounding box only if not specified
                try:
                    has_roi = False
                    if roi_type == "bbox":
                        coords = [float(x) for x in roi_names.split(",")]
                        bounds_geom = ee.Geometry.Rectangle([coords[1], coords[0], coords[3], coords[2]])
                        has_roi = True
                    else:
                        names_list = roi_names.split(",")
                        lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
                        if roi_type == "region":
                            roi_feat = lsib.filter(ee.Filter.inList("wld_rgn", names_list))
                        else:
                            roi_feat = lsib.filter(ee.Filter.inList("country_na", names_list))
                        if roi_feat.limit(1).size().getInfo() > 0:
                            bounds_geom = roi_feat.geometry().bounds()
                            has_roi = True
                            
                    if has_roi:
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
            if roi_type == "bbox":
                coords = [float(x) for x in roi_names.split(",")]
                roi = ee.Geometry.Rectangle([coords[1], coords[0], coords[3], coords[2]])
                bounds = [[coords[0], coords[1]], [coords[2], coords[3]]]
                roiMask = ee.Image.constant(1).clip(roi).selfMask()
                img = img.updateMask(roiMask).clip(roi)
            else:
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


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two points in kilometers using Haversine formula."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def standardize_matrix_off_diagonal(matrix: List[List[float]], n: int) -> List[List[float]]:
    """Standardizes off-diagonal elements of an n x n matrix to mean 0, variance 1. Diagonal remains 0.0."""
    off_diag = []
    for i in range(n):
        for j in range(n):
            if i != j and matrix[i][j] is not None:
                off_diag.append(matrix[i][j])
    if len(off_diag) < 2:
        return matrix
    mean_val = statistics.mean(off_diag)
    std_val = statistics.stdev(off_diag) if len(off_diag) > 1 else 0.0
    
    std_matrix = [[0.0 for _ in range(n)] for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                std_matrix[i][j] = 0.0
            elif matrix[i][j] is not None:
                std_matrix[i][j] = round((matrix[i][j] - mean_val) / std_val, 6) if std_val > 0 else 0.0
            else:
                std_matrix[i][j] = 0.0
    return std_matrix

def matrix_to_csv(locations: List[str], matrix: List[List[float]]) -> str:
    """Formats an n x n matrix into a comma-delimited string for BEAUti GLM import."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([""] + locations)
    for i, loc in enumerate(locations):
        row_vals = [f"{v:.6f}".rstrip('0').rstrip('.') if isinstance(v, float) else str(v) for v in matrix[i]]
        writer.writerow([loc] + row_vals)
    return out.getvalue()


def compute_geojson_centroid(geometry: dict) -> tuple[float, float]:
    """
    Computes unbiased (lat, lon) centroid for GeoJSON Point, Polygon, MultiPolygon, or GeometryCollection.
    GeoJSON coordinates are [longitude, latitude].
    """
    if not geometry:
        return 0.0, 0.0
    gtype = geometry.get("type", "")
    coords = geometry.get("coordinates", [])
    if gtype == "Point":
        if len(coords) >= 2:
            return float(coords[1]), float(coords[0])
        return 0.0, 0.0

    all_pts = []
    if gtype == "Polygon":
        for ring in coords:
            ring_pts = ring[:-1] if len(ring) > 3 and ring[0] == ring[-1] else ring
            for pt in ring_pts:
                if len(pt) >= 2:
                    all_pts.append((float(pt[1]), float(pt[0])))
    elif gtype == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                ring_pts = ring[:-1] if len(ring) > 3 and ring[0] == ring[-1] else ring
                for pt in ring_pts:
                    if len(pt) >= 2:
                        all_pts.append((float(pt[1]), float(pt[0])))
    elif gtype == "GeometryCollection":
        for geom in geometry.get("geometries", []):
            clat, clon = compute_geojson_centroid(geom)
            if clat != 0.0 or clon != 0.0:
                all_pts.append((clat, clon))

    if not all_pts:
        return 0.0, 0.0
    avg_lat = sum(p[0] for p in all_pts) / len(all_pts)
    avg_lon = sum(p[1] for p in all_pts) / len(all_pts)
    return avg_lat, avg_lon


def compute_bbox_from_features(features: list[dict]) -> Optional[dict]:
    """Computes [minLat, minLon, maxLat, maxLon] bounding box from GeoJSON features."""
    all_lats, all_lons = [], []
    def extract_pts(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            all_lons.append(c[0])
            all_lats.append(c[1])
        else:
            for sub in c:
                extract_pts(sub)
    for f in features:
        geom = f.get("geometry") or {}
        extract_pts(geom.get("coordinates", []))
    if all_lats and all_lons:
        return {
            "minLat": round(min(all_lats), 5),
            "minLon": round(min(all_lons), 5),
            "maxLat": round(max(all_lats), 5),
            "maxLon": round(max(all_lons), 5)
        }
    return None


def parse_spatial_file(contents: bytes, filename: str, layer_name: Optional[str] = None) -> tuple[str, Optional[list[dict]], Optional[list[str]]]:
    """
    Parses an uploaded spatial or tabular file.
    Returns (mode, features, property_keys).
    mode can be 'polygon', 'point_geojson', or 'tabular'.
    Supports layer_name selection for multi-layer zipped shapefile archives.
    """
    lower_name = filename.lower()
    if lower_name.endswith(".zip"):
        # Zipped Shapefile
        try:
            with zipfile.ZipFile(io.BytesIO(contents)) as z:
                all_shps = [n for n in z.namelist() if n.lower().endswith(".shp") and not n.startswith("__MACOSX")]
                if not all_shps:
                    raise HTTPException(
                        status_code=400,
                        detail="Zipped shapefile must contain at least one .shp file."
                    )

                layers_info = []
                for s in all_shps:
                    stem = s.rsplit(".", 1)[0]
                    base_name = stem.rsplit("/", 1)[-1]
                    layers_info.append({"full_path": s, "stem": stem, "name": base_name})

                # Determine target layer
                chosen = None
                if layer_name and isinstance(layer_name, str):
                    for l in layers_info:
                        if layer_name.lower() in [l["name"].lower(), l["stem"].lower(), l["full_path"].lower()]:
                            chosen = l
                            break
                if not chosen:
                    chosen = layers_info[0]

                shp_name = chosen["full_path"]
                target_stem_lower = chosen["stem"].lower()
                dbf_name = next((n for n in z.namelist() if n.lower() == f"{target_stem_lower}.dbf" and not n.startswith("__MACOSX")), None)
                shx_name = next((n for n in z.namelist() if n.lower() == f"{target_stem_lower}.shx" and not n.startswith("__MACOSX")), None)
                cpg_name = next((n for n in z.namelist() if n.lower() == f"{target_stem_lower}.cpg" and not n.startswith("__MACOSX")), None)

                if not dbf_name:
                    base_dbf = chosen["name"].lower() + ".dbf"
                    dbf_name = next((n for n in z.namelist() if n.rsplit("/", 1)[-1].lower() == base_dbf and not n.startswith("__MACOSX")), None)

                if not dbf_name:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Shapefile layer '{chosen['name']}' is missing its matching .dbf attribute table."
                    )

                encoding = "utf-8"
                if cpg_name:
                    try:
                        encoding = z.read(cpg_name).decode("utf-8", errors="ignore").strip()
                    except Exception:
                        pass

                shp_io = io.BytesIO(z.read(shp_name))
                dbf_io = io.BytesIO(z.read(dbf_name))
                shx_io = io.BytesIO(z.read(shx_name)) if shx_name else None

                sf = shapefile.Reader(shp=shp_io, dbf=dbf_io, shx=shx_io, encoding=encoding, encodingErrors="replace")
                features = sf.__geo_interface__.get("features", [])
                if not features:
                    raise HTTPException(status_code=400, detail=f"No valid features found in layer '{chosen['name']}'.")

                prop_keys = []
                if sf.fields:
                    prop_keys = [f[0] for f in sf.fields if f[0] != "DeletionFlag"]
                elif features and features[0].get("properties"):
                    prop_keys = list(features[0]["properties"].keys())

                # Validate coordinates are geographic (WGS84 degrees)
                sample_geom = features[0].get("geometry", {})
                sample_lat, sample_lon = compute_geojson_centroid(sample_geom)
                if abs(sample_lat) > 90 or abs(sample_lon) > 180:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"The uploaded shapefile coordinates appear to be in a projected coordinate system "
                            f"(centroid: {sample_lon:.1f}, {sample_lat:.1f}) rather than WGS84 geographic degrees (EPSG:4326). "
                            "Please reproject your shapefile to EPSG:4326 (WGS84) before uploading."
                        )
                    )

                return "polygon", features, prop_keys
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read zipped shapefile: {str(e)}")

    elif lower_name.endswith(".geojson") or lower_name.endswith(".json"):
        try:
            text = contents.decode("utf-8")
        except Exception:
            text = contents.decode("latin-1", errors="replace")

        try:
            data = json.loads(text)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON/GeoJSON: {str(e)}")

        if data.get("type") == "FeatureCollection":
            features = data.get("features", [])
        elif data.get("type") == "Feature":
            features = [data]
        elif data.get("type") == "GeometryCollection":
            features = [{"type": "Feature", "geometry": g, "properties": {}} for g in data.get("geometries", [])]
        else:
            raise HTTPException(status_code=400, detail="Uploaded JSON must be a GeoJSON FeatureCollection or Feature.")

        if not features:
            raise HTTPException(status_code=400, detail="GeoJSON contains no features.")

        prop_keys = list(features[0].get("properties", {}).keys()) if features[0].get("properties") else []
        first_geom_type = (features[0].get("geometry") or {}).get("type", "")
        mode = "polygon" if "Polygon" in first_geom_type else "point_geojson"

        sample_lat, sample_lon = compute_geojson_centroid(features[0].get("geometry", {}))
        if abs(sample_lat) > 90 or abs(sample_lon) > 180:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"GeoJSON coordinates appear to be projected (sample centroid: {sample_lon:.1f}, {sample_lat:.1f}). "
                    "Earth Engine requires WGS84 geographic coordinates (longitude -180 to 180, latitude -90 to 90)."
                )
            )

        return mode, features, prop_keys

    else:
        return "tabular", None, None


def build_beast_glm_matrices(
    locations: List[str],
    loc_centroids: dict,
    loc_cov_values: dict,
    new_col_names: List[str]
) -> tuple[dict, dict, list[list], list[str]]:
    """
    Computes all K x K pairwise distance and environmental predictor matrices for BEAST GLM.
    Returns (dist_matrices, cov_matrices, edge_rows, edge_headers).
    """
    n = len(locations)

    # 1. Geographic distance matrices
    dist_km = [[0.0 for _ in range(n)] for _ in range(n)]
    dist_log = [[0.0 for _ in range(n)] for _ in range(n)]
    for i in range(n):
        loc_i = locations[i]
        lat_i, lon_i = loc_centroids[loc_i]
        for j in range(n):
            if i == j:
                continue
            loc_j = locations[j]
            lat_j, lon_j = loc_centroids[loc_j]
            d = calculate_haversine_distance(lat_i, lon_i, lat_j, lon_j)
            dist_km[i][j] = round(d, 4)
            dist_log[i][j] = round(math.log(d), 4) if d > 0 else 0.0

    dist_km_std = standardize_matrix_off_diagonal(dist_km, n)
    dist_log_std = standardize_matrix_off_diagonal(dist_log, n)

    dist_matrices = {
        "km": dist_km,
        "km_std": dist_km_std,
        "log": dist_log,
        "log_std": dist_log_std
    }

    # 2. Covariate matrices for each layer
    cov_matrices = {}
    for c in new_col_names:
        orig = [[0.0 for _ in range(n)] for _ in range(n)]
        dest = [[0.0 for _ in range(n)] for _ in range(n)]
        diff = [[0.0 for _ in range(n)] for _ in range(n)]
        avg = [[0.0 for _ in range(n)] for _ in range(n)]

        for i in range(n):
            ci = loc_cov_values[c].get(locations[i], 0.0)
            for j in range(n):
                if i == j:
                    continue
                cj = loc_cov_values[c].get(locations[j], 0.0)
                orig[i][j] = round(ci, 6)
                dest[i][j] = round(cj, 6)
                diff[i][j] = round(abs(ci - cj), 6)
                avg[i][j] = round((ci + cj) / 2.0, 6)

        cov_matrices[c] = {
            "origin": orig,
            "origin_std": standardize_matrix_off_diagonal(orig, n),
            "destination": dest,
            "destination_std": standardize_matrix_off_diagonal(dest, n),
            "abs_diff": diff,
            "abs_diff_std": standardize_matrix_off_diagonal(diff, n),
            "average": avg,
            "average_std": standardize_matrix_off_diagonal(avg, n)
        }

    # 3. Long-format pairwise edge list
    edge_headers = [
        "origin", "destination",
        "origin_lat", "origin_lon", "dest_lat", "dest_lon",
        "distance_km", "distance_log", "distance_log_std"
    ]
    for c in new_col_names:
        edge_headers.extend([
            f"{c}_origin", f"{c}_destination", f"{c}_abs_diff", f"{c}_average",
            f"{c}_origin_std", f"{c}_destination_std", f"{c}_abs_diff_std", f"{c}_average_std"
        ])

    edge_rows = []
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            loc_i, loc_j = locations[i], locations[j]
            lat_i, lon_i = loc_centroids[loc_i]
            lat_j, lon_j = loc_centroids[loc_j]
            row_vals = [
                loc_i, loc_j,
                round(lat_i, 5), round(lon_i, 5), round(lat_j, 5), round(lon_j, 5),
                dist_km[i][j], dist_log[i][j], dist_log_std[i][j]
            ]
            for c in new_col_names:
                m = cov_matrices[c]
                row_vals.extend([
                    m["origin"][i][j], m["destination"][i][j],
                    m["abs_diff"][i][j], m["average"][i][j],
                    m["origin_std"][i][j], m["destination_std"][i][j],
                    m["abs_diff_std"][i][j], m["average_std"][i][j]
                ])
            edge_rows.append(row_vals)

    return dist_matrices, cov_matrices, edge_rows, edge_headers


def extract_single_dataset_values(
    features_input,
    preset_key: str,
    use_manual_range: bool,
    start_date: Optional[str],
    end_date: Optional[str],
    has_date_col: bool,
    spatial_reducer: str = "mean"
) -> tuple[str, str, dict]:
    """
    Extracts covariate values for a given preset from Earth Engine.
    Operates seamlessly on both point and polygon geometries using zonal reduction.
    Chunks features into batches of 40 to ensure request payloads stay under 200KB.
    Returns (preset_key, column_name, {row_idx: val}).
    """
    preset = PRESETS[preset_key]
    asset_id = preset["asset"]
    target_band = preset["band"]
    target_reducer = preset["reducer"]
    target_multiplier = preset["multiplier"]
    target_offset = preset["offset"]
    is_monthly = preset["is_monthly"]

    native_res = 1000
    if preset_key == "chirps":
        native_res = 5566
    elif preset_key == "era5":
        native_res = 27830
    elif preset_key == "era5_land_monthly":
        native_res = 11132
    elif preset_key.startswith("modis"):
        native_res = 250 if preset_key == "modis_ndvi" else 5566
    elif preset_key == "srtm":
        native_res = 30

    ee_reducer = ee.Reducer.median() if (spatial_reducer and spatial_reducer.lower() == "median") else ee.Reducer.mean()
    reducer_tag = "median" if (spatial_reducer and spatial_reducer.lower() == "median") else "mean"
    col_name = f"{preset_key}_{target_band}_{reducer_tag}"

    CHUNK_SIZE = 40
    if isinstance(features_input, list):
        chunks = [features_input[i:i + CHUNK_SIZE] for i in range(0, len(features_input), CHUNK_SIZE)]
    else:
        chunks = [features_input]

    val_map = {}

    for chunk in chunks:
        fc = ee.FeatureCollection(chunk) if isinstance(chunk, list) else chunk

        if preset_key == "srtm":
            img = ee.Image(asset_id).select(target_band)
            if target_multiplier != 1.0:
                img = img.multiply(target_multiplier)
            if target_offset != 0.0:
                img = img.add(target_offset)

            def extract_srtm(feature):
                val = img.reduceRegion(
                    reducer=ee_reducer,
                    geometry=feature.geometry(),
                    scale=native_res,
                    maxPixels=1e9,
                    bestEffort=True,
                    tileScale=4
                ).get(target_band)
                return feature.set("extracted_val", val)

            extracted_fc = fc.map(extract_srtm)

        elif use_manual_range or not has_date_col:
            img = process_gee_image(
                dataset=preset_key,
                start_date=start_date,
                end_date=end_date,
                band=target_band,
                reducer=target_reducer,
                multiplier=target_multiplier,
                offset=target_offset,
                downsample_large_ranges=False
            )

            def extract_range(feature):
                val = img.reduceRegion(
                    reducer=ee_reducer,
                    geometry=feature.geometry(),
                    scale=native_res,
                    maxPixels=1e9,
                    bestEffort=True,
                    tileScale=4
                ).get(target_band)
                return feature.set("extracted_val", val)

            extracted_fc = fc.map(extract_range)

        else:
            def extract_temporal(feature):
                date_str = feature.get("date")
                date_val = ee.Date(date_str)
                if is_monthly:
                    img_col = ee.ImageCollection(asset_id).filterDate(date_val, date_val.advance(1, "month"))
                else:
                    img_col = ee.ImageCollection(asset_id).filterDate(date_val, date_val.advance(1, "day"))

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

                val = img.reduceRegion(
                    reducer=ee_reducer,
                    geometry=feature.geometry(),
                    scale=native_res,
                    maxPixels=1e9,
                    bestEffort=True,
                    tileScale=4
                ).get(target_band)
                return feature.set("extracted_val", val)

            extracted_fc = fc.map(extract_temporal)

        # Crucial memory & payload optimization: drop geometries before pulling JSON over HTTP
        res = extracted_fc.select(["row_idx", "extracted_val"], retainGeometry=False).getInfo()
        features_out = res.get("features", [])
        for f in features_out:
            props = f.get("properties", {})
            idx = props.get("row_idx")
            v = props.get("extracted_val")
            if idx is not None:
                val_map[idx] = v

    return preset_key, col_name, val_map


@app.post("/inspect-boundary")
async def inspect_boundary(
    file: UploadFile = File(...),
    layer_name: Optional[str] = Form(None)
):
    """
    Inspects an uploaded spatial boundary file (GeoJSON or Zipped ESRI Shapefile).
    Detects available layers in ZIP archives, extracts attribute columns, calculates bounding box,
    and returns GeoJSON features for client-side Leaflet map rendering.
    """
    contents = await file.read()
    orig_filename = file.filename or "boundary.zip"
    lower_name = orig_filename.lower()

    if lower_name.endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(contents)) as z:
                all_shps = [n for n in z.namelist() if n.lower().endswith(".shp") and not n.startswith("__MACOSX")]
                if not all_shps:
                    raise HTTPException(status_code=400, detail="No .shp file found in uploaded ZIP archive.")

                layers_info = []
                for s in all_shps:
                    stem = s.rsplit(".", 1)[0]
                    base_name = stem.rsplit("/", 1)[-1]
                    layers_info.append({"full_path": s, "stem": stem, "name": base_name})

                # Determine target layer
                chosen = None
                if layer_name and isinstance(layer_name, str):
                    for l in layers_info:
                        if layer_name.lower() in [l["name"].lower(), l["stem"].lower(), l["full_path"].lower()]:
                            chosen = l
                            break
                if not chosen:
                    chosen = layers_info[0]

                shp_name = chosen["full_path"]
                target_stem_lower = chosen["stem"].lower()
                dbf_name = next((n for n in z.namelist() if n.lower() == f"{target_stem_lower}.dbf" and not n.startswith("__MACOSX")), None)
                shx_name = next((n for n in z.namelist() if n.lower() == f"{target_stem_lower}.shx" and not n.startswith("__MACOSX")), None)
                cpg_name = next((n for n in z.namelist() if n.lower() == f"{target_stem_lower}.cpg" and not n.startswith("__MACOSX")), None)

                if not dbf_name:
                    base_dbf = chosen["name"].lower() + ".dbf"
                    dbf_name = next((n for n in z.namelist() if n.rsplit("/", 1)[-1].lower() == base_dbf and not n.startswith("__MACOSX")), None)

                if not dbf_name:
                    raise HTTPException(status_code=400, detail=f"Layer '{chosen['name']}' is missing its matching .dbf attribute table.")

                encoding = "utf-8"
                if cpg_name:
                    try:
                        encoding = z.read(cpg_name).decode("utf-8", errors="ignore").strip()
                    except Exception:
                        pass

                sf = shapefile.Reader(
                    shp=io.BytesIO(z.read(shp_name)),
                    dbf=io.BytesIO(z.read(dbf_name)),
                    shx=io.BytesIO(z.read(shx_name)) if shx_name else None,
                    encoding=encoding,
                    encodingErrors="replace"
                )
                features = sf.__geo_interface__.get("features", [])
                if not features:
                    raise HTTPException(status_code=400, detail=f"No valid features found in layer '{chosen['name']}'.")

                prop_keys = []
                if sf.fields:
                    prop_keys = [f[0] for f in sf.fields if f[0] != "DeletionFlag"]
                elif features and features[0].get("properties"):
                    prop_keys = list(features[0]["properties"].keys())

                sample_geom = features[0].get("geometry", {})
                sample_lat, sample_lon = compute_geojson_centroid(sample_geom)
                if abs(sample_lat) > 90 or abs(sample_lon) > 180:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"The uploaded shapefile coordinates appear to be in a projected coordinate system "
                            f"(centroid: {sample_lon:.1f}, {sample_lat:.1f}) rather than WGS84 geographic degrees (EPSG:4326). "
                            "Please reproject your shapefile to EPSG:4326 (WGS84) before uploading."
                        )
                    )

                bbox = compute_bbox_from_features(features)

                return {
                    "file_type": "shapefile_zip",
                    "layers": [l["name"] for l in layers_info],
                    "layer_stems": [l["stem"] for l in layers_info],
                    "selected_layer": chosen["name"],
                    "selected_stem": chosen["stem"],
                    "feature_count": len(features),
                    "property_keys": prop_keys,
                    "bbox": bbox,
                    "geojson": {
                        "type": "FeatureCollection",
                        "features": features
                    }
                }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to inspect shapefile: {str(e)}")

    elif lower_name.endswith(".geojson") or lower_name.endswith(".json"):
        try:
            text = contents.decode("utf-8")
        except Exception:
            text = contents.decode("latin-1", errors="replace")

        try:
            data = json.loads(text)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON/GeoJSON: {str(e)}")

        features = []
        if data.get("type") == "FeatureCollection":
            features = data.get("features", [])
        elif data.get("type") == "Feature":
            features = [data]
        elif data.get("type") == "GeometryCollection":
            features = [{"type": "Feature", "geometry": g, "properties": {}} for g in data.get("geometries", [])]

        if not features:
            raise HTTPException(status_code=400, detail="No valid features found in GeoJSON.")

        prop_keys = []
        if features and features[0].get("properties"):
            prop_keys = list(features[0]["properties"].keys())

        bbox = compute_bbox_from_features(features)

        return {
            "file_type": "geojson",
            "layers": [],
            "layer_stems": [],
            "selected_layer": None,
            "selected_stem": None,
            "feature_count": len(features),
            "property_keys": prop_keys,
            "bbox": bbox,
            "geojson": {
                "type": "FeatureCollection",
                "features": features
            }
        }
    else:
        raise HTTPException(status_code=400, detail="Unsupported boundary file format. Please upload .zip (shapefile) or .geojson/.json.")


@app.post("/extract")
async def extract_glm_covariates(
    file: UploadFile = File(...),
    dataset: Optional[str] = Form(None),
    datasets: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    generate_matrices: bool = Form(False),
    location_col: Optional[str] = Form(None),
    matrix_aggregation: str = Form("mean"),
    layer_name: Optional[str] = Form(None)
):
    """
    Endpoint for Pipeline 2 (Discrete Phylodynamics GLM covariate extraction).
    Accepts:
    - Tabular sample points (CSV/TSV/Excel) with coordinates and dates
    - Spatial boundaries (GeoJSON or Zipped ESRI Shapefile) with polygons/multipolygons
    Queries GEE across one or multiple environmental datasets concurrently,
    and returns either an enriched file or a full BEAST GLM predictor package (.zip).
    """
    target_datasets = []
    if datasets:
        target_datasets = [d.strip().lower() for d in datasets.split(",") if d.strip()]
    elif dataset:
        target_datasets = [dataset.strip().lower()]

    if not target_datasets:
        raise HTTPException(status_code=400, detail="No dataset specified for extraction.")

    for d in target_datasets:
        if d not in PRESETS:
            raise HTTPException(status_code=400, detail=f"Unsupported dataset: '{d}'. Must be one of: {list(PRESETS.keys())}")

    contents = await file.read()
    orig_filename = file.filename or "samples.csv"
    orig_stem = orig_filename.rsplit(".", 1)[0]
    ds_tag = "_and_".join(target_datasets[:2])
    if len(target_datasets) > 2:
        ds_tag = f"multi_{len(target_datasets)}_covariates"

    # Detect file type: spatial (shapefile / GeoJSON) vs tabular (CSV/Excel)
    file_type, spatial_features, spatial_prop_keys = parse_spatial_file(contents, orig_filename, layer_name=layer_name)

    # =========================================================================
    # BRANCH A: SPATIAL BOUNDARIES (POLYGONS / GEOJSON / ZIPPED SHAPEFILES)
    # =========================================================================
    if file_type in ["polygon", "point_geojson"]:
        temporal_datasets = [d for d in target_datasets if d != "srtm"]
        date_prop = next((k for k in spatial_prop_keys if k.lower() in ["date", "time", "datetime", "year_month_day"]), None)
        use_manual_range = bool(temporal_datasets and start_date and end_date)

        if temporal_datasets and not use_manual_range and not date_prop:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Datasets {temporal_datasets} are temporal and require either a date property in the spatial file "
                    "or manual start_date and end_date selections."
                )
            )

        # Build Earth Engine FeatureCollection
        ee_features = []
        valid_indices = []
        for idx, f in enumerate(spatial_features):
            geom = f.get("geometry")
            if not geom or not geom.get("coordinates"):
                continue
            props = f.get("properties") or {}
            date_val = str(props.get(date_prop, "")).strip() if date_prop else ""
            try:
                clean_geom = simplify_geojson_geometry(geom)
                ee_geom = ee.Geometry(clean_geom)
                ee_features.append(ee.Feature(ee_geom, {"row_idx": idx, "date": date_val}))
                valid_indices.append(idx)
            except Exception as e_geom:
                print(f"Skipping geometry index {idx}: {e_geom}")
                continue

        if not ee_features:
            raise HTTPException(status_code=400, detail="No features with valid geometric coordinates found in spatial file.")

        # Query all requested datasets in parallel
        results_per_dataset = {}
        with ThreadPoolExecutor(max_workers=min(len(target_datasets), 4)) as executor:
            future_to_ds = {
                executor.submit(
                    extract_single_dataset_values,
                    ee_features,
                    ds,
                    use_manual_range,
                    start_date,
                    end_date,
                    bool(date_prop),
                    matrix_aggregation
                ): ds
                for ds in target_datasets
            }
            for future in future_to_ds:
                ds = future_to_ds[future]
                try:
                    p_key, col_name, val_map = future.result()
                    results_per_dataset[col_name] = (p_key, val_map)
                except Exception as e_ds:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Earth Engine query error for dataset '{ds}': {str(e_ds)}"
                    )

        new_col_names = list(results_per_dataset.keys())

        # Enrich GeoJSON features with extracted values and centroids
        enriched_features = []
        for idx in valid_indices:
            f = spatial_features[idx]
            props = dict(f.get("properties") or {})
            for col_name, (p_key, val_map) in results_per_dataset.items():
                v = val_map.get(idx)
                props[col_name] = round(v, 6) if v is not None else None

            # Compute centroid
            c_lat, c_lon = compute_geojson_centroid(f.get("geometry", {}))
            props["centroid_lat"] = round(c_lat, 6)
            props["centroid_lon"] = round(c_lon, 6)
            f["properties"] = props
            enriched_features.append(f)

        enriched_geojson = {
            "type": "FeatureCollection",
            "features": enriched_features
        }

        # Tabular CSV of enriched boundaries
        all_prop_keys = list(spatial_prop_keys)
        for c in ["centroid_lat", "centroid_lon"] + new_col_names:
            if c not in all_prop_keys:
                all_prop_keys.append(c)

        csv_out = io.StringIO()
        csv_writer = csv.DictWriter(csv_out, fieldnames=all_prop_keys)
        csv_writer.writeheader()
        for f in enriched_features:
            p = f.get("properties", {})
            row = {k: p.get(k, "") for k in all_prop_keys}
            csv_writer.writerow(row)

        # If BEAST GLM matrices are requested
        if generate_matrices:
            # Determine location attribute
            matched_loc_prop = None
            if location_col:
                matched_loc_prop = next((k for k in spatial_prop_keys if k.lower() == location_col.lower()), None)
            if not matched_loc_prop:
                matched_loc_prop = next(
                    (k for k in spatial_prop_keys if k.lower() in [
                        "name", "name_1", "name_0", "name_2", "adm1_name", "adm0_name", 
                        "admin", "region", "province", "district", "state", "id", "iso_a3"
                    ]), 
                    None
                )

            loc_data = {}
            for idx, f in enumerate(enriched_features):
                props = f.get("properties", {})
                if matched_loc_prop and props.get(matched_loc_prop):
                    loc_val = str(props.get(matched_loc_prop)).strip()
                else:
                    loc_val = f"Boundary_{idx + 1}"

                if not loc_val:
                    loc_val = f"Boundary_{idx + 1}"

                if loc_val not in loc_data:
                    loc_data[loc_val] = {
                        "lats": [],
                        "lons": [],
                        "covs": {c: [] for c in new_col_names}
                    }

                c_lat = props.get("centroid_lat", 0.0)
                c_lon = props.get("centroid_lon", 0.0)
                loc_data[loc_val]["lats"].append(c_lat)
                loc_data[loc_val]["lons"].append(c_lon)

                for c in new_col_names:
                    v = props.get(c)
                    if v is not None:
                        loc_data[loc_val]["covs"][c].append(float(v))

            locations = sorted(list(loc_data.keys()))
            if len(locations) < 2:
                raise HTTPException(
                    status_code=400,
                    detail=f"BEAST GLM matrix generation requires at least 2 distinct spatial locations. Found {len(locations)}: {locations}"
                )

            loc_centroids = {}
            loc_cov_values = {c: {} for c in new_col_names}
            for loc in locations:
                lats = loc_data[loc]["lats"]
                lons = loc_data[loc]["lons"]
                loc_centroids[loc] = (statistics.mean(lats), statistics.mean(lons))
                for c in new_col_names:
                    vals = loc_data[loc]["covs"][c]
                    if not vals:
                        loc_val = 0.0
                    elif matrix_aggregation.lower() == "median":
                        loc_val = statistics.median(vals)
                    else:
                        loc_val = statistics.mean(vals)
                    loc_cov_values[c][loc] = loc_val

            dist_mats, cov_mats, edge_rows, edge_headers = build_beast_glm_matrices(
                locations, loc_centroids, loc_cov_values, new_col_names
            )

            # Edge list CSV
            edge_out = io.StringIO()
            edge_writer = csv.writer(edge_out)
            edge_writer.writerow(edge_headers)
            for r in edge_rows:
                edge_writer.writerow(r)

            # Location summary CSV
            loc_summary_out = io.StringIO()
            loc_writer = csv.writer(loc_summary_out)
            summary_headers = ["location", "polygon_count", "centroid_lat", "centroid_lon"]
            for c in new_col_names:
                summary_headers.append(f"{c}_zonal_{matrix_aggregation}")
            loc_writer.writerow(summary_headers)

            for loc in locations:
                lat, lon = loc_centroids[loc]
                cnt = len(loc_data[loc]["lats"])
                row_vals = [loc, cnt, round(lat, 5), round(lon, 5)]
                for c in new_col_names:
                    row_vals.append(round(loc_cov_values[c][loc], 6))
                loc_writer.writerow(row_vals)

            readme_text = f"""========================================================================
PHYLOCOV-EXPLORER: BEAST GLM BOUNDARY PREDICTOR PACKAGE
========================================================================
Input Mode: Spatial Boundaries ({file_type.upper()})
Extracted Datasets ({len(target_datasets)}): {", ".join(target_datasets)}
Covariate Columns: {", ".join(new_col_names)}
Discrete Locations ({len(locations)}): {", ".join(locations)}
Polygon Aggregation Reducer: Zonal Mean across boundaries
Location Aggregation Function: {matrix_aggregation}

HOW TO USE IN BEAST / BEAUti:
------------------------------------------------------------------------
1. In BEAUti (BEAST v1.10.x / v1.11.x), configure your discrete location trait.
2. In 'Discrete Traits' or 'Sites', enable the Generalized Linear Model (GLM) extension.
3. Import any of the K x K square matrix CSV files in this directory.
4. Standardization:
   - BEAST GLM diffusion models assume predictor values are standardized (mean=0, variance=1).
   - Use the *_std.csv matrices (e.g. matrix_distance_log_std.csv).

FILE DESCRIPTIONS:
------------------------------------------------------------------------
- enriched_boundaries.geojson:
  Original boundaries with all extracted zonal covariate values and centroids embedded.
- enriched_boundaries.csv:
  Tidy tabular export of all polygon boundaries, centroids, and covariate values.
- location_summary.csv:
  Summary table of discrete locations, centroid coordinates, and zonal environmental stats.
- glm_pairwise_edge_list.csv:
  Tidy edge list of all pairwise location transitions (ideal for R / ggplot2 / Seraphim).

K x K SQUARE PREDICTOR MATRICES:
- matrix_great_circle_distance_km.csv & _std.csv:
  Great-circle geographic distance between polygon centroids.
- matrix_great_circle_distance_log.csv & _std.csv:
  Log-transformed geographic distance (recommended baseline GLM predictor).

For each extracted environmental covariate layer:
- matrix_{{cov}}_origin.csv & _std.csv: Emigration driver (origin value).
- matrix_{{cov}}_destination.csv & _std.csv: Immigration driver (destination value).
- matrix_{{cov}}_abs_difference.csv & _std.csv: Ecological distance / barrier effect.
- matrix_{{cov}}_average.csv & _std.csv: Overall pairwise habitat suitability.

Citation:
Lemey, P., Rambaut, A., Bedford, T., Faria, N., Bieleman, M. A., Baele, G., ... & Suchard, M. A. (2014).
Unifying viral genetics and human transportation data to predict the global transmission dynamics 
of human influenza H3N2. PLoS Pathogens, 10(2), e1003932.
========================================================================
"""

            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("enriched_boundaries.geojson", json.dumps(enriched_geojson, indent=2))
                zf.writestr("enriched_boundaries.csv", csv_out.getvalue())
                zf.writestr("location_summary.csv", loc_summary_out.getvalue())
                zf.writestr("glm_pairwise_edge_list.csv", edge_out.getvalue())
                zf.writestr("README_BEAST_GLM.txt", readme_text)

                zf.writestr("matrix_great_circle_distance_km.csv", matrix_to_csv(locations, dist_mats["km"]))
                zf.writestr("matrix_great_circle_distance_log.csv", matrix_to_csv(locations, dist_mats["log"]))
                zf.writestr("matrix_great_circle_distance_log_std.csv", matrix_to_csv(locations, dist_mats["log_std"]))

                for c in new_col_names:
                    m = cov_mats[c]
                    zf.writestr(f"matrix_{c}_origin.csv", matrix_to_csv(locations, m["origin"]))
                    zf.writestr(f"matrix_{c}_origin_std.csv", matrix_to_csv(locations, m["origin_std"]))
                    zf.writestr(f"matrix_{c}_destination.csv", matrix_to_csv(locations, m["destination"]))
                    zf.writestr(f"matrix_{c}_destination_std.csv", matrix_to_csv(locations, m["destination_std"]))
                    zf.writestr(f"matrix_{c}_abs_difference.csv", matrix_to_csv(locations, m["abs_diff"]))
                    zf.writestr(f"matrix_{c}_abs_difference_std.csv", matrix_to_csv(locations, m["abs_diff_std"]))
                    zf.writestr(f"matrix_{c}_average.csv", matrix_to_csv(locations, m["average"]))
                    zf.writestr(f"matrix_{c}_average_std.csv", matrix_to_csv(locations, m["average_std"]))

            zip_buf.seek(0)
            return StreamingResponse(
                zip_buf,
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="beast_glm_{ds_tag}_{orig_stem}.zip"'}
            )

        # Non-matrix output: return enriched CSV directly
        return StreamingResponse(
            io.BytesIO(csv_out.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="enriched_{orig_stem}.csv"'}
        )

    # =========================================================================
    # BRANCH B: TABULAR SAMPLE POINTS (CSV / TSV / EXCEL)
    # =========================================================================
    try:
        csv_text = contents.decode("utf-8")
    except Exception:
        try:
            csv_text = contents.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to decode file. Please ensure it is UTF-8 or Latin-1 encoded.")

    f_in = io.StringIO(csv_text)
    reader = csv.DictReader(f_in)
    fieldnames = reader.fieldnames
    if not fieldnames:
        raise HTTPException(status_code=400, detail="The uploaded tabular file has no headers.")

    lat_col = next((c for c in fieldnames if c.lower() in ["latitude", "lat", "lat_deg", "y"]), None)
    lon_col = next((c for c in fieldnames if c.lower() in ["longitude", "lon", "lng", "lon_deg", "x"]), None)
    date_col = next((c for c in fieldnames if c.lower() in ["date", "time", "datetime", "year_month_day"]), None)

    if not lat_col or not lon_col:
        raise HTTPException(
            status_code=400, 
            detail="Could not detect latitude and longitude columns. CSV must have columns like 'latitude' and 'longitude'."
        )

    temporal_datasets = [d for d in target_datasets if d != "srtm"]
    use_manual_range = bool(temporal_datasets and start_date and end_date)
    if temporal_datasets and not use_manual_range and not date_col:
        raise HTTPException(
            status_code=400,
            detail=f"Datasets {temporal_datasets} are temporal and require either a date column in the CSV (e.g. 'date') or manual start_date and end_date parameters."
        )

    rows = []
    features = []
    for idx, row in enumerate(reader):
        try:
            lat = float(row[lat_col])
            lon = float(row[lon_col])
        except (ValueError, TypeError):
            continue

        date_val = ""
        if date_col:
            date_val = (row[date_col] or "").strip()

        rows.append(row)
        geom = ee.Geometry.Point([lon, lat])
        features.append(ee.Feature(geom, {"row_idx": idx, "date": date_val}))

    if not features:
        raise HTTPException(status_code=400, detail="No rows with valid numeric coordinates found in the CSV.")

    fc = ee.FeatureCollection(features)

    # Query all requested datasets in parallel
    results_per_dataset = {}
    with ThreadPoolExecutor(max_workers=min(len(target_datasets), 4)) as executor:
        future_to_ds = {
            executor.submit(
                extract_single_dataset_values,
                features,
                ds,
                use_manual_range,
                start_date,
                end_date,
                bool(date_col)
            ): ds
            for ds in target_datasets
        }
        for future in future_to_ds:
            ds = future_to_ds[future]
            try:
                p_key, col_name, val_map = future.result()
                results_per_dataset[col_name] = (p_key, val_map)
            except Exception as e_ds:
                raise HTTPException(
                    status_code=500,
                    detail=f"Earth Engine query error for dataset '{ds}': {str(e_ds)}"
                )

    new_col_names = list(results_per_dataset.keys())

    # Append all extracted covariate columns to rows
    for col_name, (p_key, val_map) in results_per_dataset.items():
        for idx, row in enumerate(rows):
            v = val_map.get(idx)
            row[col_name] = v if v is not None else ""

    # Build output CSV text
    output = io.StringIO()
    writer_out = csv.DictWriter(output, fieldnames=fieldnames + new_col_names)
    writer_out.writeheader()
    for row in rows:
        writer_out.writerow(row)

    output.seek(0)

    # BEAST GLM Matrix Package for points
    if generate_matrices and location_col:
        matched_loc_col = next((c for c in fieldnames if c.lower() == location_col.lower()), None)
        if not matched_loc_col:
            raise HTTPException(
                status_code=400,
                detail=f"Specified location column '{location_col}' not found in CSV headers: {fieldnames}"
            )

        loc_data = {}
        for r in rows:
            loc_val = str(r.get(matched_loc_col, "")).strip()
            if not loc_val:
                continue
            if loc_val not in loc_data:
                loc_data[loc_val] = {
                    "lats": [],
                    "lons": [],
                    "covs": {c: [] for c in new_col_names}
                }
            try:
                lat = float(r[lat_col])
                lon = float(r[lon_col])
                loc_data[loc_val]["lats"].append(lat)
                loc_data[loc_val]["lons"].append(lon)
            except (ValueError, TypeError):
                continue

            for c in new_col_names:
                c_val = r.get(c)
                if c_val is not None and c_val != "":
                    try:
                        loc_data[loc_val]["covs"][c].append(float(c_val))
                    except (ValueError, TypeError):
                        pass

        locations = sorted(list(loc_data.keys()))
        if len(locations) < 2:
            raise HTTPException(
                status_code=400,
                detail=f"BEAST GLM matrix generation requires at least 2 distinct discrete locations in '{matched_loc_col}'. Found {len(locations)}: {locations}"
            )

        loc_centroids = {}
        loc_cov_values = {c: {} for c in new_col_names}
        for loc in locations:
            lats = loc_data[loc]["lats"]
            lons = loc_data[loc]["lons"]
            loc_centroids[loc] = (statistics.mean(lats), statistics.mean(lons))
            for c in new_col_names:
                c_list = loc_data[loc]["covs"][c]
                if not c_list:
                    loc_val = 0.0
                elif matrix_aggregation.lower() == "median":
                    loc_val = statistics.median(c_list)
                else:
                    loc_val = statistics.mean(c_list)
                loc_cov_values[c][loc] = loc_val

        dist_mats, cov_mats, edge_rows, edge_headers = build_beast_glm_matrices(
            locations, loc_centroids, loc_cov_values, new_col_names
        )

        edge_out = io.StringIO()
        edge_writer = csv.writer(edge_out)
        edge_writer.writerow(edge_headers)
        for r in edge_rows:
            edge_writer.writerow(r)

        loc_summary_out = io.StringIO()
        loc_writer = csv.writer(loc_summary_out)
        summary_headers = ["location", "sample_count", "centroid_lat", "centroid_lon"]
        for c in new_col_names:
            summary_headers.append(f"{c}_aggregated_{matrix_aggregation}")
        loc_writer.writerow(summary_headers)

        for loc in locations:
            lat, lon = loc_centroids[loc]
            count = len(loc_data[loc]["lats"])
            row_vals = [loc, count, round(lat, 5), round(lon, 5)]
            for c in new_col_names:
                row_vals.append(round(loc_cov_values[c][loc], 6))
            loc_writer.writerow(row_vals)

        readme_text = f"""========================================================================
PHYLOCOV-EXPLORER: BEAST GLM PREDICTOR PACKAGE
========================================================================
Input Mode: Sample Coordinates (CSV)
Extracted Datasets ({len(target_datasets)}): {", ".join(target_datasets)}
Covariate Columns: {", ".join(new_col_names)}
Discrete Locations ({len(locations)}): {", ".join(locations)}
Sample Aggregation Function: {matrix_aggregation}

HOW TO USE IN BEAST / BEAUti:
------------------------------------------------------------------------
1. In BEAUti (BEAST v1.10.x / v1.11.x), configure your discrete location trait.
2. In 'Discrete Traits' or 'Sites', enable the Generalized Linear Model (GLM) extension.
3. Import any of the K x K square matrix CSV files in this directory.
4. Standardization:
   - BEAST GLM diffusion models assume predictor values are standardized (mean=0, variance=1).
   - Use the *_std.csv matrices (e.g. matrix_distance_log_std.csv).

FILE DESCRIPTIONS:
------------------------------------------------------------------------
- enriched_points.csv:
  Your original sample table with all extracted environmental covariate columns.
- location_summary.csv:
  Per-location centroids and aggregated environmental values across all layers.
- glm_pairwise_edge_list.csv:
  Tidy tabular edge-list of all pairwise transitions (ideal for R / ggplot2 / Seraphim).

K x K SQUARE PREDICTOR MATRICES:
- matrix_great_circle_distance_km.csv & _std.csv:
  Great-circle geographic distance between point centroids.
- matrix_great_circle_distance_log.csv & _std.csv:
  Log-transformed geographic distance (recommended baseline GLM predictor).

For each extracted environmental covariate layer:
- matrix_{{cov}}_origin.csv & _std.csv: Emigration driver (origin value).
- matrix_{{cov}}_destination.csv & _std.csv: Immigration driver (destination value).
- matrix_{{cov}}_abs_difference.csv & _std.csv: Ecological distance / barrier effect.
- matrix_{{cov}}_average.csv & _std.csv: Overall pairwise habitat suitability.

Citation:
Lemey, P., Rambaut, A., Bedford, T., Faria, N., Bieleman, M. A., Baele, G., ... & Suchard, M. A. (2014).
Unifying viral genetics and human transportation data to predict the global transmission dynamics 
of human influenza H3N2. PLoS Pathogens, 10(2), e1003932.
========================================================================
"""

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("enriched_points.csv", output.getvalue())
            zf.writestr("location_summary.csv", loc_summary_out.getvalue())
            zf.writestr("glm_pairwise_edge_list.csv", edge_out.getvalue())
            zf.writestr("README_BEAST_GLM.txt", readme_text)

            zf.writestr("matrix_great_circle_distance_km.csv", matrix_to_csv(locations, dist_mats["km"]))
            zf.writestr("matrix_great_circle_distance_log.csv", matrix_to_csv(locations, dist_mats["log"]))
            zf.writestr("matrix_great_circle_distance_log_std.csv", matrix_to_csv(locations, dist_mats["log_std"]))

            for c in new_col_names:
                m = cov_mats[c]
                zf.writestr(f"matrix_{c}_origin.csv", matrix_to_csv(locations, m["origin"]))
                zf.writestr(f"matrix_{c}_origin_std.csv", matrix_to_csv(locations, m["origin_std"]))
                zf.writestr(f"matrix_{c}_destination.csv", matrix_to_csv(locations, m["destination"]))
                zf.writestr(f"matrix_{c}_destination_std.csv", matrix_to_csv(locations, m["destination_std"]))
                zf.writestr(f"matrix_{c}_abs_difference.csv", matrix_to_csv(locations, m["abs_diff"]))
                zf.writestr(f"matrix_{c}_abs_difference_std.csv", matrix_to_csv(locations, m["abs_diff_std"]))
                zf.writestr(f"matrix_{c}_average.csv", matrix_to_csv(locations, m["average"]))
                zf.writestr(f"matrix_{c}_average_std.csv", matrix_to_csv(locations, m["average_std"]))

        zip_buf.seek(0)
        return StreamingResponse(
            zip_buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="beast_glm_{ds_tag}_{orig_stem}.zip"'}
        )

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=extracted_{orig_stem}.csv"}
    )

