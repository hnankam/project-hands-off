"""
Migration: Add Graph Lifecycle and Control Tools

This migration adds the new graph lifecycle and control tools to the database:
- create_graph: Initialize a new graph instance
- resume_graph: Resume a paused/waiting graph after user interaction
- pause_graph: Temporarily pause a running graph execution
- cancel_graph: Permanently cancel a graph execution

Usage:
    python database/migrations/025_add_pause_cancel_graph_tools.py
    python database/migrations/025_add_pause_cancel_graph_tools.py rollback
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

# Tool definitions
TOOLS = [
    {
        "tool_key": "create_graph",
        "tool_name": "Create Graph",
        "tool_type": "backend",
        "description": "Initialize a new graph instance ready for execution. The graph is NOT executed - use run_graph() after creation. The orchestrator will determine the execution plan based on the query.",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The query for the graph to process"
                    },
                    "name": {
                        "type": "string",
                        "description": "Display name (auto-generated from query if not provided)"
                    },
                    "max_iterations": {
                        "type": "integer",
                        "description": "Max orchestrator routing iterations (default: 5)",
                        "default": 5
                    }
                },
                "required": ["query"]
            },
            "category": "graph_lifecycle",
            "examples": [
                {
                    "description": "Create a graph for complex query",
                    "code": 'create_graph("Generate 3 images of mountains and search for hiking trails", name="Mountain Research")'
                }
            ]
        },
        "enabled": True,
        "readonly": False
    },
    {
        "tool_key": "resume_graph",
        "tool_name": "Resume Graph",
        "tool_type": "backend",
        "description": "Resume a paused or waiting graph. Reconstructs the graph state and prepares it for continued execution.",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "graph_id": {
                        "type": "string",
                        "description": "Graph ID to resume (e.g., 'abc123def456')"
                    }
                },
                "required": ["graph_id"]
            },
            "category": "graph_lifecycle",
            "examples": [
                {
                    "description": "Resume a waiting graph after user confirmation",
                    "code": 'resume_graph("abc123def456")'
                }
            ]
        },
        "enabled": True,
        "readonly": False
    },
    {
        "tool_key": "pause_graph",
        "tool_name": "Pause Graph",
        "tool_type": "backend",
        "description": "Temporarily pause a running graph execution. Can be resumed later with resume_graph().",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "graph_id": {
                        "type": "string",
                        "description": "Graph ID (e.g., 'abc123def456')"
                    }
                },
                "required": ["graph_id"]
            },
            "category": "graph_management",
            "examples": [
                {
                    "description": "Pause a running graph",
                    "code": 'pause_graph("abc123def456")'
                }
            ]
        },
        "enabled": True,
        "readonly": False
    },
    {
        "tool_key": "cancel_graph",
        "tool_name": "Cancel Graph",
        "tool_type": "backend",
        "description": "Permanently cancel a graph execution. Cannot be resumed.",
        "metadata": {
            "parameters": {
                "type": "object",
                "properties": {
                    "graph_id": {
                        "type": "string",
                        "description": "Graph ID (e.g., 'abc123def456')"
                    }
                },
                "required": ["graph_id"]
            },
            "category": "graph_management",
            "examples": [
                {
                    "description": "Cancel a graph execution",
                    "code": 'cancel_graph("abc123def456")'
                }
            ]
        },
        "enabled": True,
        "readonly": False
    }
]


def main():
    """Run the migration to add graph lifecycle and control tools"""
    logger.info("=" * 70)
    logger.info("MIGRATION 025: Add Graph Lifecycle and Control Tools")
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
        for tool in TOOLS:
            logger.info(f"   - {tool['tool_key']}: {tool['description']}")
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
                
                for tool in TOOLS:
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
                logger.info(f"   📝 Total: {len(TOOLS)} tools")
                logger.info("=" * 70)
                
                if added_count > 0:
                    logger.info("\n🎉 Migration completed successfully!")
                    logger.info("\n💡 Next steps:")
                    logger.info("   1. Restart the Python agent server")
                    logger.info("   2. Agents can now use:")
                    logger.info("      - create_graph() to initialize graphs")
                    logger.info("      - resume_graph() to continue paused/waiting graphs")
                    logger.info("      - pause_graph() to pause execution")
                    logger.info("      - cancel_graph() to cancel execution")
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
    """Rollback the migration by removing the tools"""
    logger.info("=" * 70)
    logger.info("ROLLBACK 025: Remove Graph Lifecycle and Control Tools")
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
        for tool in TOOLS:
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
                
                for tool in TOOLS:
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

