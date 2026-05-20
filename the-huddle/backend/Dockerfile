# --- Stage 1: Build Stage ---
    FROM python:3.12-slim AS builder

    WORKDIR /app
    
    # Install build dependencies (needed for some python packages like psycopg2)
    RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        python3-dev \
        && rm -rf /var/lib/apt/lists/*
    
    COPY requirements.txt .
    # Install to a local directory so we can copy it easily
    RUN pip install --user --no-cache-dir -r requirements.txt
    
    # --- Stage 2: Final Runtime Stage ---
    FROM python:3.12-slim
    
    WORKDIR /app
    
    # Only install the runtime library for Postgres (not the full dev kit)
    RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        && rm -rf /var/lib/apt/lists/*
    
    # Copy installed packages from builder
    COPY --from=builder /root/.local /root/.local
    COPY app ./app
    
    # Set path to include local bin
    ENV PATH=/root/.local/bin:$PATH
    ENV PYTHONUNBUFFERED=1
    
    EXPOSE 8000
    
    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]