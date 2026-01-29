# =============================================================================
# Confluence MCP Server - Dockerfile
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
COPY confluence/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# -----------------------------------------------------------------------------
# Production
# -----------------------------------------------------------------------------
FROM dependencies as production

COPY confluence/ /app/confluence/
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

ENV PYTHONPATH="/app:/app/shared:/app/confluence" \
    PORT=8103

EXPOSE 8103

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

WORKDIR /app/confluence
CMD ["fastmcp", "run", "server.py", "--transport", "sse", "--host", "0.0.0.0", "--port", "8000"]

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------
FROM dependencies as development

RUN pip install --no-cache-dir pytest black ruff ipython
COPY confluence/ /app/confluence/
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

ENV PYTHONPATH="/app:/app/shared:/app/confluence" \
    PORT=8103

EXPOSE 8103

WORKDIR /app/confluence
CMD ["fastmcp", "run", "server.py", "--transport", "sse", "--host", "0.0.0.0", "--port", "8000"]
