# backend-oauth/Dockerfile
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY oauth_backend.py .

ENV PYTHONUNBUFFERED=1    
CMD ["python", "oauth_backend.py"]
