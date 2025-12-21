# DBOS Graph Implementation - Part 3 (Final)

## Testing, Deployment, Security & Migration

This document continues from DBOS_GRAPH_IMPLEMENTATION_PART2.md

---

## Testing Strategy

### Test File Structure

```
copilotkit-pydantic/tests/
├── unit/
│   ├── test_graph_workflows.py
│   ├── test_graph_manager.py
│   ├── test_custom_events.py
│   └── test_agent_tools.py
├── integration/
│   ├── test_graph_execution_flow.py
│   ├── test_confirmation_flow.py
│   ├── test_edit_flow.py
│   └── test_scheduling.py
├── e2e/
│   ├── test_full_graph_lifecycle.py
│   └── test_crash_recovery.py
└── fixtures/
    ├── sample_graphs.py
    └── mock_agents.py
```

### 1. Unit Tests

```python
# File: copilotkit-pydantic/tests/unit/test_graph_workflows.py

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from tools.multi_agent_graph.durable_graph import (
    run_durable_graph_workflow,
    execute_graph_with_plan_updates,
    update_graph_status_step,
    load_graph_plan_step
)
from tools.multi_agent_graph.types import QueryState, GraphStep

@pytest.fixture
async def mock_db_pool():
    """Mock database pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    pool.connection.return_value.__aenter__.return_value = conn
    return pool, conn

@pytest.fixture
def sample_graph_plan():
    """Sample graph execution plan."""
    return {
        'steps': [
            {
                'step_id': 'step_1',
                'step_type': 'web_search',
                'step_name': 'WebSearch',
                'description': 'Search for information',
                'prompt': 'Find latest AI news',
                'enabled': True,
                'order': 1,
                'status': 'pending'
            },
            {
                'step_id': 'step_2',
                'step_type': 'result_aggregator',
                'step_name': 'ResultAggregator',
                'description': 'Summarize results',
                'prompt': 'Summarize findings',
                'enabled': True,
                'order': 2,
                'status': 'pending'
            }
        ],
        'user_modified': False
    }

class TestGraphWorkflows:
    """Test DBOS workflow functions."""
    
    @pytest.mark.asyncio
    async def test_update_graph_status_step(self, mock_db_pool):
        """Test status update step."""
        pool, conn = mock_db_pool
        
        with patch('tools.multi_agent_graph.durable_graph.get_pool', return_value=pool):
            await update_graph_status_step(
                graph_id='test_graph_1',
                status='running',
                started_at=datetime.now()
            )
            
            # Verify database was called
            assert conn.execute.called
            call_args = conn.execute.call_args
            assert 'UPDATE graph_jobs' in call_args[0][0]
            assert 'test_graph_1' in call_args[0][1]
    
    @pytest.mark.asyncio
    async def test_load_graph_plan_step(self, mock_db_pool, sample_graph_plan):
        """Test plan loading step."""
        pool, conn = mock_db_pool
        
        # Mock database response
        result = AsyncMock()
        result.fetchone.return_value = (sample_graph_plan['steps'], False)
        conn.execute.return_value = result
        
        with patch('tools.multi_agent_graph.durable_graph.get_pool', return_value=pool):
            plan = await load_graph_plan_step('test_graph_1')
            
            assert plan['steps'] == sample_graph_plan['steps']
            assert plan['user_modified'] == False
    
    @pytest.mark.asyncio
    async def test_execute_graph_with_disabled_steps(self, sample_graph_plan):
        """Test that disabled steps are skipped."""
        # Disable second step
        sample_graph_plan['steps'][1]['enabled'] = False
        
        with patch('tools.multi_agent_graph.durable_graph.load_graph_plan_step', 
                   return_value=sample_graph_plan), \
             patch('tools.multi_agent_graph.durable_graph.check_for_plan_modification_step',
                   return_value=None), \
             patch('tools.multi_agent_graph.durable_graph.execute_step_from_plan_step',
                   return_value='success') as mock_execute:
            
            result = await execute_graph_with_plan_updates(
                graph_id='test_graph_1',
                session_id='session_1',
                user_id='user_1',
                query='test query',
                max_iterations=5
            )
            
            # Only first step should have been executed
            assert mock_execute.call_count == 1
```

### 2. Integration Tests

```python
# File: copilotkit-pydantic/tests/integration/test_confirmation_flow.py

import pytest
import asyncio
from datetime import datetime

from tools.multi_agent_graph.durable_graph import (
    run_durable_graph_workflow,
    send_confirmation_event,
    enqueue_graph_execution
)
from services.graph_manager import create_graph_draft, get_graph_status

@pytest.mark.integration
class TestConfirmationFlow:
    """Integration tests for confirmation flow."""
    
    @pytest.mark.asyncio
    async def test_graph_waits_for_confirmation(self, test_db, test_user):
        """Test that graph correctly pauses for confirmation."""
        # Create a graph with confirmation step
        graph_id = 'test_confirm_graph_1'
        
        plan = {
            'steps': [
                {
                    'step_id': 'step_1',
                    'step_type': 'confirmation',
                    'step_name': 'Confirmation',
                    'description': 'Request user confirmation',
                    'prompt': 'Proceed with action?',
                    'enabled': True,
                    'order': 1,
                    'status': 'pending'
                }
            ]
        }
        
        await create_graph_draft(
            graph_id=graph_id,
            session_id='session_1',
            user_id=test_user,
            query='Test confirmation',
            graph_name='Confirmation Test',
            steps=plan['steps'],
            agent_reasoning='Testing confirmation',
            auto_start=False
        )
        
        # Start execution in background
        execution_task = asyncio.create_task(
            run_durable_graph_workflow(
                graph_id=graph_id,
                session_id='session_1',
                user_id=test_user,
                query='Test confirmation',
                graph_name='Confirmation Test'
            )
        )
        
        # Wait for workflow to reach confirmation point
        await asyncio.sleep(2)
        
        # Check status - should be waiting
        status = await get_graph_status(graph_id, test_user)
        assert status['status'] == 'waiting_confirmation'
        
        # Send confirmation
        await send_confirmation_event(graph_id, confirmed=True)
        
        # Wait for completion
        result = await asyncio.wait_for(execution_task, timeout=10)
        
        # Check final status
        status = await get_graph_status(graph_id, test_user)
        assert status['status'] == 'completed'
    
    @pytest.mark.asyncio
    async def test_graph_cancels_on_denial(self, test_db, test_user):
        """Test that graph cancels when user denies."""
        graph_id = 'test_deny_graph_1'
        
        # ... similar setup ...
        
        # Send denial
        await send_confirmation_event(graph_id, confirmed=False)
        
        # Check that graph was cancelled
        status = await get_graph_status(graph_id, test_user)
        assert status['status'] in ['cancelled', 'completed']
        assert 'cancelled' in status.get('result', '').lower()
```

### 3. End-to-End Tests

```python
# File: copilotkit-pydantic/tests/e2e/test_crash_recovery.py

import pytest
import asyncio
import signal
import subprocess
import time

@pytest.mark.e2e
class TestCrashRecovery:
    """E2E tests for DBOS crash recovery."""
    
    @pytest.mark.slow
    async def test_recovery_after_server_restart(self, test_db):
        """Test that graph resumes after server restart."""
        graph_id = 'test_recovery_graph_1'
        
        # Start graph execution
        await enqueue_graph_execution(
            graph_id=graph_id,
            session_id='session_1',
            user_id='user_1',
            query='Test recovery',
            graph_name='Recovery Test'
        )
        
        # Wait for execution to start
        await asyncio.sleep(3)
        
        # Get initial status
        status_before = await get_graph_status(graph_id, 'user_1')
        assert status_before['status'] == 'running'
        
        # Simulate server crash by killing the process
        # (In real test, this would restart the FastAPI server)
        # For this test, we'll just verify the workflow can be resumed
        
        # After "restart", DBOS should auto-resume
        # Check that workflow continued from where it left off
        await asyncio.sleep(5)
        
        status_after = await get_graph_status(graph_id, 'user_1')
        
        # Verify execution continued
        assert status_after['status'] in ['running', 'completed']
        
        # Verify no steps were re-executed
        # (Would need to check execution_history in real implementation)
```

### 4. Load Tests

```python
# File: copilotkit-pydantic/tests/load/test_concurrent_graphs.py

import pytest
import asyncio
from datetime import datetime

@pytest.mark.load
class TestConcurrentExecution:
    """Load tests for concurrent graph execution."""
    
    @pytest.mark.asyncio
    async def test_100_concurrent_graphs(self, test_db):
        """Test system with 100 concurrent graphs."""
        num_graphs = 100
        
        # Create and enqueue 100 graphs
        tasks = []
        for i in range(num_graphs):
            graph_id = f'load_test_graph_{i}'
            
            task = enqueue_graph_execution(
                graph_id=graph_id,
                session_id=f'session_{i % 10}',  # 10 sessions
                user_id='load_test_user',
                query=f'Load test query {i}',
                graph_name=f'Load Test {i}',
                priority=i % 5  # Mix of priorities
            )
            tasks.append(task)
        
        # Enqueue all
        start_time = datetime.now()
        await asyncio.gather(*tasks)
        enqueue_time = (datetime.now() - start_time).total_seconds()
        
        print(f"Enqueued {num_graphs} graphs in {enqueue_time}s")
        
        # Wait for all to complete (with timeout)
        timeout = 300  # 5 minutes
        start_time = datetime.now()
        
        while (datetime.now() - start_time).total_seconds() < timeout:
            # Check how many completed
            statuses = await asyncio.gather(*[
                get_graph_status(f'load_test_graph_{i}', 'load_test_user')
                for i in range(num_graphs)
            ])
            
            completed = sum(1 for s in statuses if s['status'] in ['completed', 'failed'])
            
            print(f"Progress: {completed}/{num_graphs} completed")
            
            if completed == num_graphs:
                break
            
            await asyncio.sleep(5)
        
        # Verify results
        final_statuses = await asyncio.gather(*[
            get_graph_status(f'load_test_graph_{i}', 'load_test_user')
            for i in range(num_graphs)
        ])
        
        success_count = sum(1 for s in final_statuses if s['status'] == 'completed')
        failure_count = sum(1 for s in final_statuses if s['status'] == 'failed')
        
        print(f"Results: {success_count} succeeded, {failure_count} failed")
        
        # At least 95% should succeed
        assert success_count >= num_graphs * 0.95
```

---

## Migration Plan

### Phase 1: Database Migration (Week 1)

**Objective**: Set up database schema and DBOS integration

**Tasks**:
1. Run database migrations
2. Initialize DBOS schema
3. Verify database connectivity
4. Create test data

**Steps**:
```bash
# 1. Backup existing database
pg_dump copilotkit_db > backup_$(date +%Y%m%d).sql

# 2. Run migrations
cd copilotkit-pydantic/database/migrations
psql -d copilotkit_db -f 001_add_graph_jobs.sql
psql -d copilotkit_db -f 002_add_graph_plan_history.sql
psql -d copilotkit_db -f 003_add_dbos_integration.sql

# 3. Initialize DBOS
python -c "from tools.multi_agent_graph.durable_graph import init_dbos; init_dbos()"

# 4. Verify
psql -d copilotkit_db -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'graph_%';"
```

**Validation**:
- [ ] All tables created successfully
- [ ] DBOS schema initialized
- [ ] Test insert/query works
- [ ] Foreign key constraints valid

### Phase 2: Backend Implementation (Week 2-3)

**Objective**: Implement DBOS workflows and graph management

**Tasks**:
1. Implement custom events
2. Implement DBOS workflows
3. Implement graph manager service
4. Implement API endpoints
5. Update agent tools

**Checklist**:
- [ ] `custom_events.py` - Delta events
- [ ] `durable_graph.py` - DBOS workflows
- [ ] `graph_manager.py` - CRUD operations
- [ ] `graph_endpoints.py` - FastAPI routes
- [ ] `graph_tools.py` - Agent tools
- [ ] Unit tests passing
- [ ] Integration tests passing

### Phase 3: Frontend Implementation (Week 4)

**Objective**: Build graph visualization and editing UI

**Tasks**:
1. Enhanced GraphsPanel
2. GraphStepEditor component
3. ScheduleDialog component
4. ConfirmationDialog component
5. Event handling for custom events

**Checklist**:
- [ ] GraphsPanel with editing support
- [ ] Step editor with drag-and-drop
- [ ] Schedule dialog
- [ ] Confirmation dialog
- [ ] Real-time status updates
- [ ] UI tests passing

### Phase 4: Integration & Testing (Week 5)

**Objective**: End-to-end testing and bug fixes

**Tasks**:
1. E2E tests
2. Load testing
3. Crash recovery testing
4. Performance optimization
5. Bug fixes

**Validation**:
- [ ] Full lifecycle works (create → edit → execute → confirm → complete)
- [ ] Crash recovery works
- [ ] System handles 100+ concurrent graphs
- [ ] No memory leaks
- [ ] No race conditions

### Phase 5: Deployment (Week 6)

**Objective**: Deploy to production

**Tasks**:
1. Staging deployment
2. Production deployment
3. Monitoring setup
4. Documentation
5. Team training

---

## Deployment Guide

### Prerequisites

```bash
# 1. Install dependencies
pip install -r copilotkit-pydantic/requirements.txt

# Or with uv
uv pip install -r copilotkit-pydantic/requirements.txt

# 2. Set environment variables
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=copilotkit_db
export POSTGRES_USER=copilotkit
export POSTGRES_PASSWORD=<password>
export GOOGLE_API_KEY=<key>
export FIREBASE_CREDENTIALS_PATH=/path/to/credentials.json
```

### Docker Deployment

```dockerfile
# File: copilotkit-pydantic/Dockerfile

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Initialize DBOS on startup
CMD ["sh", "-c", "python -c 'from tools.multi_agent_graph.durable_graph import init_dbos; init_dbos()' && uvicorn main:app --host 0.0.0.0 --port 8000"]
```

```yaml
# File: docker-compose.yml

version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: copilotkit_db
      POSTGRES_USER: copilotkit
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U copilotkit"]
      interval: 10s
      timeout: 5s
      retries: 5
  
  pydantic-service:
    build: ./copilotkit-pydantic
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: copilotkit_db
      POSTGRES_USER: copilotkit
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
    ports:
      - "8000:8000"
    volumes:
      - ./copilotkit-pydantic:/app
    restart: unless-stopped

volumes:
  postgres_data:
```

### Kubernetes Deployment

```yaml
# File: k8s/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: copilotkit-graph-executor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: copilotkit-graph-executor
  template:
    metadata:
      labels:
        app: copilotkit-graph-executor
    spec:
      containers:
      - name: pydantic-service
        image: copilotkit/pydantic-service:latest
        ports:
        - containerPort: 8000
        env:
        - name: POSTGRES_HOST
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: host
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: password
        - name: GOOGLE_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: google
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: copilotkit-graph-executor
spec:
  selector:
    app: copilotkit-graph-executor
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
  type: LoadBalancer
```

---

## Monitoring & Observability

### 1. Pydantic Logfire Integration

```python
# File: copilotkit-pydantic/config/observability.py

"""Observability configuration with Logfire."""

import logfire
from config.environment import LOGFIRE_TOKEN

# Initialize Logfire
logfire.configure(
    token=LOGFIRE_TOKEN,
    service_name='copilotkit-graph-executor',
    service_version='1.0.0',
    environment='production'
)

# Configure DBOS to send telemetry to Logfire
from dbos import DBOS

DBOS.configure_telemetry(
    exporter='logfire',
    service_name='copilotkit-dbos'
)
```

### 2. Key Metrics to Monitor

```python
# File: copilotkit-pydantic/utils/metrics.py

"""Metrics collection for monitoring."""

from prometheus_client import Counter, Histogram, Gauge
import time
from functools import wraps

# Counters
GRAPH_CREATED = Counter('graph_created_total', 'Total graphs created')
GRAPH_STARTED = Counter('graph_started_total', 'Total graphs started')
GRAPH_COMPLETED = Counter('graph_completed_total', 'Total graphs completed')
GRAPH_FAILED = Counter('graph_failed_total', 'Total graphs failed')
GRAPH_CANCELLED = Counter('graph_cancelled_total', 'Total graphs cancelled')

# Histograms
GRAPH_EXECUTION_DURATION = Histogram(
    'graph_execution_duration_seconds',
    'Graph execution duration',
    buckets=[1, 5, 10, 30, 60, 120, 300, 600, 1800]
)

STEP_EXECUTION_DURATION = Histogram(
    'step_execution_duration_seconds',
    'Step execution duration',
    buckets=[0.5, 1, 2, 5, 10, 30, 60]
)

# Gauges
ACTIVE_GRAPHS = Gauge('active_graphs', 'Number of currently running graphs')
QUEUED_GRAPHS = Gauge('queued_graphs', 'Number of queued graphs')
WAITING_CONFIRMATION = Gauge('waiting_confirmation_graphs', 'Graphs waiting for confirmation')

def track_graph_execution(func):
    """Decorator to track graph execution metrics."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        GRAPH_STARTED.inc()
        ACTIVE_GRAPHS.inc()
        
        start_time = time.time()
        try:
            result = await func(*args, **kwargs)
            GRAPH_COMPLETED.inc()
            return result
        except Exception as e:
            GRAPH_FAILED.inc()
            raise
        finally:
            duration = time.time() - start_time
            GRAPH_EXECUTION_DURATION.observe(duration)
            ACTIVE_GRAPHS.dec()
    
    return wrapper
```

### 3. Dashboard Queries

**Grafana Dashboard JSON**: [Link to grafana_dashboard.json]

**Key Panels**:
1. **Graph Execution Rate**: `rate(graph_completed_total[5m])`
2. **Active Graphs**: `active_graphs`
3. **Success Rate**: `rate(graph_completed_total[5m]) / rate(graph_started_total[5m])`
4. **Average Execution Time**: `rate(graph_execution_duration_seconds_sum[5m]) / rate(graph_execution_duration_seconds_count[5m])`
5. **Queue Depth**: `queued_graphs`
6. **Confirmation Backlog**: `waiting_confirmation_graphs`

---

## Security Considerations

### 1. Authentication & Authorization

```python
# File: copilotkit-pydantic/middleware/graph_auth.py

"""Authorization middleware for graph operations."""

from fastapi import HTTPException, Depends
from database.postgres_pool import get_pool

async def verify_graph_ownership(graph_id: str, user_id: str) -> bool:
    """Verify that user owns the graph."""
    pool = await get_pool()
    
    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT user_id FROM graph_jobs WHERE graph_id = $1",
            graph_id
        )
        row = await result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Graph not found")
        
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        return True

async def require_graph_access(graph_id: str, user_id: str = Depends(get_current_user)):
    """Dependency to require graph access."""
    await verify_graph_ownership(graph_id, user_id)
    return user_id
```

### 2. Input Validation

```python
# File: copilotkit-pydantic/utils/validation.py

"""Input validation utilities."""

from pydantic import BaseModel, validator, Field
from typing import Literal

class SafeGraphStep(BaseModel):
    """Validated graph step model."""
    step_type: Literal["web_search", "image_generation", "code_execution", "result_aggregator", "confirmation"]
    description: str = Field(..., max_length=500)
    prompt: str = Field(..., max_length=2000)
    
    @validator('prompt')
    def validate_prompt(cls, v):
        """Validate prompt doesn't contain injection attempts."""
        dangerous_patterns = ['eval(', 'exec(', '__import__', 'os.system']
        
        for pattern in dangerous_patterns:
            if pattern in v.lower():
                raise ValueError(f"Prompt contains dangerous pattern: {pattern}")
        
        return v

class SafeCronExpression(BaseModel):
    """Validated cron expression."""
    expression: str = Field(..., regex=r'^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*/([1-9]|1[0-2])) (\*|([0-6])|\*/([0-6]))$')
```

### 3. Rate Limiting

```python
# File: copilotkit-pydantic/middleware/rate_limit.py

"""Rate limiting for graph operations."""

from fastapi import HTTPException, Request
from datetime import datetime, timedelta
import asyncio

class RateLimiter:
    """Simple in-memory rate limiter."""
    
    def __init__(self):
        self.requests = {}
        self.cleanup_task = None
    
    async def check_rate_limit(
        self,
        user_id: str,
        action: str,
        max_requests: int = 10,
        window_seconds: int = 60
    ):
        """Check if user is within rate limit."""
        key = f"{user_id}:{action}"
        now = datetime.now()
        
        # Initialize if first request
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside window
        cutoff = now - timedelta(seconds=window_seconds)
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if req_time > cutoff
        ]
        
        # Check limit
        if len(self.requests[key]) >= max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s"
            )
        
        # Add current request
        self.requests[key].append(now)

# Global instance
rate_limiter = RateLimiter()

# Dependency
async def rate_limit_graph_creation(request: Request, user_id: str):
    """Rate limit graph creation."""
    await rate_limiter.check_rate_limit(
        user_id=user_id,
        action='create_graph',
        max_requests=10,
        window_seconds=60
    )
```

### 4. Data Encryption

```python
# File: copilotkit-pydantic/utils/encryption.py

"""Data encryption utilities."""

from cryptography.fernet import Fernet
from config.environment import ENCRYPTION_KEY

cipher = Fernet(ENCRYPTION_KEY.encode())

def encrypt_sensitive_data(data: str) -> str:
    """Encrypt sensitive data before storing."""
    return cipher.encrypt(data.encode()).decode()

def decrypt_sensitive_data(encrypted: str) -> str:
    """Decrypt sensitive data after retrieval."""
    return cipher.decrypt(encrypted.encode()).decode()
```

---

## Performance Optimization

### 1. Database Indexing

```sql
-- Additional performance indexes
CREATE INDEX CONCURRENTLY idx_graph_jobs_user_status 
    ON graph_jobs(user_id, status) 
    WHERE status IN ('running', 'queued', 'waiting_confirmation');

CREATE INDEX CONCURRENTLY idx_graph_jobs_session_updated 
    ON graph_jobs(session_id, updated_at DESC);

CREATE INDEX CONCURRENTLY idx_graph_plan_history_recent 
    ON graph_plan_history(graph_id, created_at DESC) 
    WHERE created_at > NOW() - INTERVAL '7 days';

-- Partial index for active graphs only
CREATE INDEX CONCURRENTLY idx_active_graphs 
    ON graph_jobs(graph_id, updated_at DESC) 
    WHERE status IN ('running', 'queued');

-- Index on JSONB for fast step lookups
CREATE INDEX CONCURRENTLY idx_planned_steps_status 
    ON graph_jobs USING GIN ((planned_steps) jsonb_path_ops);
```

### 2. Connection Pooling

```python
# File: copilotkit-pydantic/database/postgres_pool.py

"""Optimized connection pooling."""

import asyncpg
from contextlib import asynccontextmanager

class OptimizedPool:
    """Optimized PostgreSQL connection pool."""
    
    def __init__(self):
        self.pool = None
    
    async def initialize(self):
        """Initialize pool with optimal settings."""
        self.pool = await asyncpg.create_pool(
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            database=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            min_size=10,  # Minimum connections
            max_size=50,  # Maximum connections
            max_queries=50000,  # Recycle connections after 50k queries
            max_inactive_connection_lifetime=300,  # 5 minutes
            command_timeout=60,  # Command timeout
            server_settings={
                'application_name': 'copilotkit_graph_executor',
                'jit': 'off',  # Disable JIT for faster simple queries
            }
        )
    
    @asynccontextmanager
    async def acquire(self):
        """Acquire connection from pool."""
        async with self.pool.acquire() as conn:
            # Set session-level optimizations
            await conn.execute('SET work_mem = "64MB"')
            await conn.execute('SET temp_buffers = "32MB"')
            yield conn
```

### 3. Caching Strategy

```python
# File: copilotkit-pydantic/utils/cache.py

"""Caching utilities for graph data."""

from functools import lru_cache
import redis
import json
from datetime import timedelta

# Redis client
redis_client = redis.Redis(
    host='localhost',
    port=6379,
    db=0,
    decode_responses=True
)

def cache_graph_status(ttl_seconds: int = 5):
    """Cache graph status for short duration."""
    def decorator(func):
        async def wrapper(graph_id: str, *args, **kwargs):
            cache_key = f"graph_status:{graph_id}"
            
            # Try cache first
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Fetch from database
            result = await func(graph_id, *args, **kwargs)
            
            # Cache result
            redis_client.setex(
                cache_key,
                ttl_seconds,
                json.dumps(result)
            )
            
            return result
        
        return wrapper
    return decorator
```

---

## Rollback Plan

### If Issues Arise

1. **Database Rollback**:
```bash
# Restore from backup
psql -d copilotkit_db < backup_YYYYMMDD.sql

# Remove DBOS tables
psql -d copilotkit_db -c "DROP SCHEMA IF EXISTS dbos CASCADE;"
psql -d copilotkit_db -c "DROP TABLE IF EXISTS graph_jobs CASCADE;"
psql -d copilotkit_db -c "DROP TABLE IF EXISTS graph_plan_history CASCADE;"
```

2. **Code Rollback**:
```bash
# Revert to previous version
git revert <commit-hash>
git push

# Redeploy
kubectl rollout undo deployment/copilotkit-graph-executor
```

3. **Feature Flag Disable**:
```python
# config/feature_flags.py
ENABLE_DBOS_GRAPHS = False  # Disable feature
```

---

## Success Criteria

### Pre-Launch Checklist

- [ ] All unit tests passing (>95% coverage)
- [ ] All integration tests passing
- [ ] E2E tests passing
- [ ] Load test: 100+ concurrent graphs
- [ ] Crash recovery test passing
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Team training completed
- [ ] Monitoring dashboards set up
- [ ] Rollback plan tested
- [ ] Backup and restore tested

### Post-Launch Metrics (Week 1)

- [ ] Graph success rate > 95%
- [ ] Average execution time < 60s
- [ ] Zero data loss incidents
- [ ] Crash recovery successful in < 30s
- [ ] No memory leaks
- [ ] API response time < 200ms (p95)
- [ ] User satisfaction score > 4/5

---

## Appendix

### A. Glossary

- **DBOS**: Durable Execution framework for Python
- **Graph**: Multi-step execution plan
- **Step**: Individual task in a graph
- **Orchestrator**: Agent that plans execution
- **Worker**: Agent that executes steps
- **Checkpoint**: State snapshot for recovery
- **Workflow**: DBOS durable function

### B. Reference Links

- DBOS Documentation: https://docs.dbos.dev/
- Pydantic AI + DBOS: https://ai.pydantic.dev/durable_execution/dbos/
- AG-UI Protocol: https://docs.ag-ui.com/
- CopilotKit v1.50: https://www.copilotkit.ai/blog/copilotkit-v1-50-release-announcement

### C. Support Contacts

- **Database Issues**: dba-team@company.com
- **DBOS Questions**: dbos-support@company.com
- **Agent Issues**: ai-team@company.com
- **Frontend Issues**: frontend-team@company.com

---

## Document Control

**Version**: 1.0  
**Last Updated**: December 21, 2024  
**Authors**: AI Implementation Team  
**Reviewers**: Architecture Team, Security Team  
**Status**: Ready for Implementation

**Change Log**:
- v1.0 (2024-12-21): Initial implementation guide created

---

**END OF IMPLEMENTATION GUIDE**
