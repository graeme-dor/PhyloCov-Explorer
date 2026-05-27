# PhyloCov Backend Export Service

This backend service handles large-scale data exports from Google Earth Engine directly to Google Cloud Storage. It circumvents the download size limitations of direct browser downloads by launching asynchronous batch export tasks.

## Local Development Setup

1. **Install Python dependencies:**
   Ensure you have Python 3.10+ installed.
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Authenticate with Google Cloud:**
   You must authenticate your local environment using Google Application Default Credentials (ADC) to interact with Earth Engine and Cloud Storage.
   ```bash
   gcloud auth application-default login
   gcloud config set project ee-graemedor
   ```

3. **Run the server locally:**
   ```bash
   uvicorn main:app --reload
   ```
   The service will run at `http://127.0.0.1:8000`.

## Endpoints

### 1. `GET /health`
Returns a simple health check status.

### 2. `POST /exports`
Launches an Earth Engine batch export task.

**Example Request:**
```bash
curl -X POST http://127.0.0.1:8000/exports \
  -H "Content-Type: application/json" \
  -d '{
    "dataset": "modis_ndvi",
    "country": "South Africa",
    "start_date": "2020-01-01",
    "end_date": "2020-01-31",
    "scale": 5000
  }'
```

**Example Response:**
```json
{
  "job_id": "b93c52d4-1a35-46a2-9e8a-8a1a9e8a9a2a",
  "ee_task_id": "ABC123DEF456GHI789",
  "status": "SUBMITTED",
  "bucket": "bucket-quickstart_ee-graemedor",
  "file_prefix": "exports/modis_ndvi/PhyloCov_modis_ndvi_South_Africa_2020-01-01_to_2020-01-31_scale5000m_b93c52d4-1a35-46a2-9e8a-8a1a9e8a9a2a"
}
```

### 3. `GET /exports/{task_id}`
Checks the status of an Earth Engine task.

**Example Request:**
```bash
curl http://127.0.0.1:8000/exports/ABC123DEF456GHI789
```

**Example Response:**
```json
{
  "ee_task_id": "ABC123DEF456GHI789",
  "state": "COMPLETED",
  "description": "Export_modis_ndvi_South_Africa",
  "error_message": null
}
```

## Deployment to Cloud Run

The service is designed to be deployed to Google Cloud Run, utilizing a specific service account that has the required permissions for Earth Engine and Cloud Storage.

Run the following command from the root of the repository:

```bash
gcloud run deploy phylocov-export-backend \
  --source backend \
  --project ee-graemedor \
  --region europe-west1 \
  --service-account phylocov-exporter@ee-graemedor.iam.gserviceaccount.com \
  --allow-unauthenticated
```
