"""
Migration: Add Bulk Update Plan Steps Tool

This migration adds the update_plan_steps tool for bulk updating multiple
plan steps in a single operation.

Usage:
    python database/migrations/024_add_update_plan_steps_tool.py
    python database/migrations/024_add_update_plan_steps_tool.py rollback
"""

import os
import sys
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Tool definition
TOOL = {
    "tool_key": "update_plan_steps",
    "tool_name": "Update Plan Steps (Bulk)",
    "tool_type": "backend",
    "description": "Update multiple plan steps in a single operation - more efficient than updating steps one at a time",
    "metadata": {
        "parameters": {
            "type": "object",
            "properties": {
                "plan_identifier": {
                    "type": "string",
                    "description": "Plan name or ID"
                },
                "updates": {
                    "type": "array",
                    "description": "Array of step updates",
                    "items": {
                        "type": "object",
                        "properties": {
                            "step_index": {
                                "type": "integer",
                                "description": "Index of step to update (0-based)"
                            },
                            "description": {
                                "type": "string",
                                "description": "New description (optional)"
                            },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "running", "completed", "failed", "deleted"],
                                "description": "New status (optional)"
                            }
                        },
                        "required": ["step_index"]
                    }
                }
            },
            "required": ["plan_identifier", "updates"]
        },
        "category": "plan_management",
        "examples": [
            {
                "description": "Mark step 0 completed and step 1 running",
                "code": 'update_plan_steps("Build House", [{"step_index": 0, "status": "completed"}, {"step_index": 1, "status": "running"}])'
            },
            {
                "description": "Update multiple step descriptions and statuses",
                "code": 'update_plan_steps("Research ML", [{"step_index": 0, "description": "Complete literature review", "status": "completed"}, {"step_index": 1, "status": "running"}])'
            }
        ]
    },
    "enabled": True,
    "readonly": False
}


def main():
    """Run the migration to add update_plan_steps tool"""
    logger.info("=" * 70)
    logger.info("MIGRATION 024: Add Bulk Update Plan Steps Tool")
    logger.info("=" * 70)
    
    # Get PostgreSQL credentials
    db_host = os.getenv('DB_HOST')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_DATABASE')
    db_user = os.getenv('DB_USERNAME')
    db_password = os.getenv('DB_PASSWORD')
    db_params = os.getenv('DB_OTHER_PARAMS', '')
    
    if not all([db_host, db_name, db_user, db_password]):
        logger.error("\n❌ PostgreSQL credentials not found in .env")
        logger.info("   Required: DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD")
        logger.info(f"\n📝 Tool to add manually: {TOOL['tool_key']}")
        return 1
    
    try:
        import psycopg
        
        # Build connection string
        conn_str = f"host={db_host} port={db_port} dbname={db_name} user={db_user} password={db_password}"
        if db_params:
            params = db_params.replace('&', ' ')
            conn_str += f" {params}"
        
        logger.info(f"Connecting to PostgreSQL at {db_host}...")
        
        with psycopg.connect(conn_str) as conn:
            with conn.cursor() as cursor:
                logger.info("✅ Connected to database\n")
                
                # Check if tool already exists
                cursor.execute(
                    "SELECT id FROM tools WHERE tool_key = %s LIMIT 1",
                    (TOOL['tool_key'],)
                )
                existing = cursor.fetchone()
                
                if existing:
                    logger.info(f"⏭️  Tool '{TOOL['tool_key']}' already exists (ID: {existing[0]})")
                    logger.info("\n✅ Nothing to do")
                    return 0
                
                # Insert new tool
                cursor.execute(
                    """
                    INSERT INTO tools (tool_key, tool_name, tool_type, description, metadata, enabled, readonly)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        TOOL['tool_key'],
                        TOOL['tool_name'],
                        TOOL['tool_type'],
                        TOOL['description'],
                        json.dumps(TOOL['metadata']),
                        TOOL['enabled'],
                        TOOL['readonly']
                    )
                )
                new_id = cursor.fetchone()[0]
                conn.commit()
                
                logger.info(f"\n" + "=" * 70)
                logger.info(f"✅ Added tool: {TOOL['tool_key']} (ID: {new_id})")
                logger.info("=" * 70)
                logger.info("\n🎉 Migration completed successfully!")
                logger.info("\n💡 Next steps:")
                logger.info("   1. Restart the Python agent server")
                logger.info("   2. Agents can now use update_plan_steps() for bulk updates")
                
                return 0
        
    except ImportError:
        logger.error("\n❌ psycopg not installed")
        logger.info("   Install with: pip install psycopg")
        return 1
    except Exception as e:
        logger.error(f"\n❌ Migration failed: {e}")
        logger.exception("Full traceback:")
        return 1


def rollback():
    """Rollback the migration by removing the tool"""
    logger.info("=" * 70)
    logger.info("ROLLBACK 024: Remove Bulk Update Plan Steps Tool")
    logger.info("=" * 70)
    
    # Get PostgreSQL credentials
    db_host = os.getenv('DB_HOST')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_DATABASE')
    db_user = os.getenv('DB_USERNAME')
    db_password = os.getenv('DB_PASSWORD')
    db_params = os.getenv('DB_OTHER_PARAMS', '')
    
    if not all([db_host, db_name, db_user, db_password]):
        logger.error("\n❌ PostgreSQL credentials not found")
        logger.info(f"   Remove tool manually: {TOOL['tool_key']}")
        return 1
    
    try:
        import psycopg
        
        # Build connection string
        conn_str = f"host={db_host} port={db_port} dbname={db_name} user={db_user} password={db_password}"
        if db_params:
            params = db_params.replace('&', ' ')
            conn_str += f" {params}"
        
        logger.info(f"Connecting to PostgreSQL at {db_host}...")
        
        with psycopg.connect(conn_str) as conn:
            with conn.cursor() as cursor:
                logger.info("✅ Connected to database\n")
                
                cursor.execute(
                    "DELETE FROM tools WHERE tool_key = %s RETURNING id",
                    (TOOL['tool_key'],)
                )
                deleted = cursor.fetchone()
                
                if deleted:
                    conn.commit()
                    logger.info(f"✅ Removed tool: {TOOL['tool_key']} (ID: {deleted[0]})")
                else:
                    logger.info(f"⏭️  Tool '{TOOL['tool_key']}' not found")
                
                logger.info(f"\n" + "=" * 70)
                logger.info("📊 ROLLBACK COMPLETE")
                logger.info("=" * 70)
                return 0
        
    except Exception as e:
        logger.error(f"❌ Rollback failed: {e}")
        return 1


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        sys.exit(rollback())
    else:
        sys.exit(main())

