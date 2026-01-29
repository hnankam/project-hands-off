# =============================================================================
# Microsoft 365 MCP Server - Dockerfile
# =============================================================================

FROM python:3.11-slim as base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r mcpuser && useradd -r -g mcpuser mcpuser
WORKDIR /app

# -----------------------------------------------------------------------------
# Dependencies
# -----------------------------------------------------------------------------
FROM base as dependencies

COPY shared/ /app/shared/
COPY microsoft365/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# -----------------------------------------------------------------------------
# Production
# -----------------------------------------------------------------------------
FROM dependencies as production

COPY microsoft365/ /app/microsoft365/
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

ENV PYTHONPATH="/app:/app/shared:/app/microsoft365" \
    PORT=8105

EXPOSE 8105

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

WORKDIR /app/microsoft365
CMD ["python", "server.py"]

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------
FROM dependencies as development

RUN pip install --no-cache-dir pytest black ruff ipython
COPY microsoft365/ /app/microsoft365/
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

ENV PYTHONPATH="/app:/app/shared:/app/microsoft365" \
    PORT=8105

EXPOSE 8105

WORKDIR /app/microsoft365
CMD ["python", "server.py"]
