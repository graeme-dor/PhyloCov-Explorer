import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import ee

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
