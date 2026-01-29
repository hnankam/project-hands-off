# =============================================================================
# Jira MCP Server - Dockerfile
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
COPY jira/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# -----------------------------------------------------------------------------
# Production
# -----------------------------------------------------------------------------
FROM dependencies as production

COPY jira/ /app/jira/
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

ENV PYTHONPATH="/app:/app/shared:/app/jira" \
    PORT=8102

EXPOSE 8102

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

WORKDIR /app/jira
CMD ["fastmcp", "run", "server.py", "--transport", "sse", "--host", "0.0.0.0"]

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------
FROM dependencies as development

RUN pip install --no-cache-dir pytest black ruff ipython
COPY jira/ /app/jira/
RUN chown -R mcpuser:mcpuser /app
USER mcpuser

ENV PYTHONPATH="/app:/app/shared:/app/jira" \
    PORT=8102

EXPOSE 8102

WORKDIR /app/jira
CMD ["fastmcp", "run", "server.py", "--transport", "sse", "--host", "0.0.0.0"]
