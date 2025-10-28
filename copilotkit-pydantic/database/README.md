# Database Setup

This directory contains the database schema, migrations, and seeding scripts for the AI Agent Platform.

## Prerequisites

- PostgreSQL database (Neon or standard PostgreSQL)
- Python 3.12+
- psycopg[binary] >= 3.1

## Installation

```bash
pip install psycopg[binary]
```

## Configuration

Add the following to your `.env` file:

```bash
DB_CONNECTION=pgsql
DB_HOST=your-neon-host.neon.tech
DB_PORT=5432
DB_DATABASE=your_database_name
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_OTHER_PARAMS=sslmode=require&channel_binding=require
```

## Database Schema

The schema includes the following tables:

### Core Tables
- **providers**: AI provider configurations (Google, Anthropic, OpenAI, etc.)
- **models**: AI models available in the system
- **agents**: Agent types and prompts
- **base_instructions**: Reusable prompt components

### Tracking Tables
- **config_versions**: Version history for configurations
- **usage_logs**: Track API usage and costs
- **audit_logs**: Audit trail for configuration changes

## Quick Start

### 1. Test Connection

```bash
python scripts/init_db.py --test
```

### 2. Initialize Schema

```bash
python scripts/init_db.py
```

### 3. Initialize and Seed

```bash
python scripts/init_db.py --seed
```

### 4. Reset Database (DANGEROUS)

```bash
python scripts/init_db.py --reset
```

This will:
1. Drop all existing tables
2. Create fresh schema
3. Seed with data from `config/models.json` and `config/agents.json`

## Manual Commands

### Initialize Database

```python
import asyncio
from database import init_database

asyncio.run(init_database())
```

### Seed Database

```python
import asyncio
from database import seed_database

asyncio.run(seed_database())
```

### Test Connection

```python
import asyncio
from database import test_connection

asyncio.run(test_connection())
```

## Schema Details

### Providers Table

Stores AI provider configurations with credentials:

```sql
CREATE TABLE providers (
    id UUID PRIMARY KEY,
    provider_key VARCHAR(100) UNIQUE,
    provider_type VARCHAR(50),  -- google, anthropic_bedrock, azure_openai
    credentials JSONB,           -- Encrypted credentials
    model_settings JSONB,
    bedrock_model_settings JSONB,
    enabled BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Models Table

Stores individual AI models:

```sql
CREATE TABLE models (
    id UUID PRIMARY KEY,
    provider_id UUID REFERENCES providers(id),
    model_key VARCHAR(100) UNIQUE,
    model_name VARCHAR(255),
    display_name VARCHAR(255),
    model_settings_override JSONB,
    enabled BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Agents Table

Stores agent configurations:

```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY,
    agent_type VARCHAR(100) UNIQUE,
    agent_name VARCHAR(255),
    description TEXT,
    prompt_template TEXT,
    enabled BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Base Instructions Table

Stores reusable prompt components:

```sql
CREATE TABLE base_instructions (
    id UUID PRIMARY KEY,
    instruction_key VARCHAR(100) UNIQUE,
    instruction_value TEXT,
    description TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Seeding

The seed script reads from:
- `config/models.json` - Providers and models configuration
- `config/agents.json` - Agents and base instructions

Data is inserted with `ON CONFLICT DO UPDATE`, so running the seed multiple times is safe.

## Usage Tracking

Track API usage per model/agent:

```sql
INSERT INTO usage_logs (
    agent_type, model_key, session_id,
    request_tokens, response_tokens, total_tokens,
    cost, duration_ms, status
) VALUES (
    'general', 'gemini-2.5-flash', 'session-123',
    100, 200, 300,
    0.001, 1500, 'success'
);
```

## Audit Logging

Track configuration changes:

```sql
INSERT INTO audit_logs (
    user_id, action, resource_type, resource_id,
    old_data, new_data
) VALUES (
    'admin@example.com', 'UPDATE', 'model', '123e4567-...',
    '{"enabled": true}'::jsonb, '{"enabled": false}'::jsonb
);
```

## Multi-Tenancy (Future)

The current schema is designed for single-organization use. When adding multi-tenancy support:

1. Add `tenants` table
2. Add `tenant_id` foreign key to all configuration tables
3. Add `tenant_id` to all unique constraints
4. Update seed script to support multiple tenants

## Troubleshooting

### Connection Issues

```bash
# Test connection
python scripts/init_db.py --test

# Check .env file
cat .env | grep DB_

# Verify Neon connection
psql "postgresql://username:password@host:5432/database?sslmode=require"
```

### Permission Errors

Ensure your database user has:
- CREATE permission on database
- CREATE EXTENSION permission for uuid-ossp

### Reset Database

If you encounter schema issues:

```bash
python scripts/init_db.py --reset
```

This drops and recreates everything.

## Security

### Credentials Storage

- Credentials are stored in JSONB format
- **TODO**: Add encryption at rest
- **TODO**: Add encryption key management

### Best Practices

1. Use environment variables for database credentials
2. Rotate database passwords regularly
3. Use read-only replicas for reporting
4. Enable audit logging for sensitive operations
5. Encrypt credentials before storing in database

## Backup and Recovery

### Backup

```bash
pg_dump "postgresql://user:pass@host:5432/db" > backup.sql
```

### Restore

```bash
psql "postgresql://user:pass@host:5432/db" < backup.sql
```

## Performance

### Indexes

All critical queries are indexed:
- Lookup by key (providers, models, agents)
- Time-based queries (usage_logs, audit_logs)
- Foreign key relationships

### Query Optimization

Use EXPLAIN ANALYZE for slow queries:

```sql
EXPLAIN ANALYZE
SELECT m.*, p.provider_type
FROM models m
JOIN providers p ON m.provider_id = p.id
WHERE m.enabled = true;
```

## Future Enhancements

- [ ] Add multi-tenancy support
- [ ] Implement credential encryption
- [ ] Add database migrations framework (Alembic)
- [ ] Add connection pooling
- [ ] Add read replicas support
- [ ] Add caching layer (Redis)
- [ ] Add API rate limiting per agent/model

