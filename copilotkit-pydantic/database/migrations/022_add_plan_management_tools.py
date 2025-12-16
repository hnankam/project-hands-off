"""
Migration: Add Plan Management Tools to Database

This migration adds the new plan management tools to the database:
- update_plan_status
- rename_plan
- list_plans
- delete_plan

These tools were added as part of the multi-instance named plans architecture
but were not initially included in the database.

Usage:
    python database/migrations/022_add_plan_management_tools.py
    python database/migrations/022_add_plan_management_tools.py rollback
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

# Tool definitions matching database schema
PLAN_TOOLS = [
    {
        "tool_key": "update_plan_status",
        "tool_name": "Update Plan Status",
        "tool_type": "backend",
        "description": "Update the status of a plan (pause, resume, complete, cancel)",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "plan_identifier": {
                        "type": "string",
                        "description": "Plan name or ID"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["active", "paused", "completed", "cancelled"],
                        "description": "New status for the plan"
                    }
                },
                "required": ["plan_identifier", "status"]
            },
            "category": "plan_management"
        },
        "enabled": True,
        "readonly": False
    },
    {
        "tool_key": "rename_plan",
        "tool_name": "Rename Plan",
        "tool_type": "backend",
        "description": "Rename a plan for easier reference",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "plan_identifier": {
                        "type": "string",
                        "description": "Current plan name or ID"
                    },
                    "new_name": {
                        "type": "string",
                        "description": "New name for the plan"
                    }
                },
                "required": ["plan_identifier", "new_name"]
            },
            "category": "plan_management"
        },
        "enabled": True,
        "readonly": False
    },
    {
        "tool_key": "list_plans",
        "tool_name": "List Plans",
        "tool_type": "backend",
        "description": "List all plans in the current session with their status and progress",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            },
            "category": "plan_management"
        },
        "enabled": True,
        "readonly": False
    },
    {
        "tool_key": "delete_plan",
        "tool_name": "Delete Plan",
        "tool_type": "backend",
        "description": "Delete a plan from the session permanently",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "plan_identifier": {
                        "type": "string",
                        "description": "Plan name or ID to delete"
                    }
                },
                "required": ["plan_identifier"]
            },
            "category": "plan_management"
        },
        "enabled": True,
        "readonly": False
    }
]


def main():
    """Run the migration to add plan management tools"""
    logger.info("=" * 70)
    logger.info("MIGRATION 022: Add Plan Management Tools")
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
        logger.info("\n📝 Tool definitions to add manually:")
        for tool in PLAN_TOOLS:
            logger.info(f"\n  - {tool['tool_key']}: {tool['description']}")
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
                
                added_count = 0
                skipped_count = 0
                
                for tool in PLAN_TOOLS:
                    try:
                        # Check if tool already exists
                        cursor.execute(
                            "SELECT id FROM tools WHERE tool_key = %s LIMIT 1",
                            (tool['tool_key'],)
                        )
                        existing = cursor.fetchone()
                        
                        if existing:
                            logger.info(f"⏭️  Tool '{tool['tool_key']}' already exists (ID: {existing[0]})")
                            skipped_count += 1
                            continue
                        
                        # Insert new tool
                        cursor.execute(
                            """
                            INSERT INTO tools (tool_key, tool_name, tool_type, description, metadata, enabled, readonly)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                tool['tool_key'],
                                tool['tool_name'],
                                tool['tool_type'],
                                tool['description'],
                                json.dumps(tool['metadata']),
                                tool['enabled'],
                                tool['readonly']
                            )
                        )
                        new_id = cursor.fetchone()[0]
                        conn.commit()
                        logger.info(f"✅ Added tool: {tool['tool_key']} (ID: {new_id})")
                        added_count += 1
                        
                    except Exception as e:
                        logger.error(f"❌ Error adding tool '{tool['tool_key']}': {e}")
                        conn.rollback()
                
                logger.info(f"\n" + "=" * 70)
                logger.info(f"📊 MIGRATION SUMMARY:")
                logger.info(f"   ✅ Added: {added_count} tools")
                logger.info(f"   ⏭️  Skipped: {skipped_count} tools (already exist)")
                logger.info(f"   📝 Total: {len(PLAN_TOOLS)} tools")
                logger.info("=" * 70)
                
                if added_count > 0:
                    logger.info("\n🎉 Migration completed successfully!")
                    logger.info("\n💡 Next steps:")
                    logger.info("   1. Restart the Python agent server")
                    logger.info("   2. The new tools should now be available to agents")
                else:
                    logger.info("\n✅ All tools already exist - nothing to do")
                
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
    """Rollback the migration by removing plan management tools"""
    logger.info("=" * 70)
    logger.info("ROLLBACK 022: Remove Plan Management Tools")
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
        logger.info("   Remove these tools manually:")
        for tool in PLAN_TOOLS:
            logger.info(f"   - {tool['tool_key']}")
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
                
                removed_count = 0
                
                for tool in PLAN_TOOLS:
                    try:
                        cursor.execute(
                            "DELETE FROM tools WHERE tool_key = %s RETURNING id",
                            (tool['tool_key'],)
                        )
                        deleted = cursor.fetchone()
                        
                        if deleted:
                            conn.commit()
                            logger.info(f"✅ Removed tool: {tool['tool_key']} (ID: {deleted[0]})")
                            removed_count += 1
                        else:
                            logger.info(f"⏭️  Tool '{tool['tool_key']}' not found")
                            
                    except Exception as e:
                        logger.error(f"❌ Error removing tool '{tool['tool_key']}': {e}")
                        conn.rollback()
                
                logger.info(f"\n" + "=" * 70)
                logger.info(f"📊 ROLLBACK SUMMARY:")
                logger.info(f"   ✅ Removed: {removed_count} tools")
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

