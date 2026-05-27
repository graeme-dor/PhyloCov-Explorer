FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run the web service on container startup.
# Using uvicorn to serve the FastAPI application.
# Bind to 0.0.0.0 and port 8080 (Cloud Run default).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
