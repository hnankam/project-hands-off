#!/usr/bin/env python3
"""
MCP Configuration Migration Script
Migrates existing MCP servers from mcp_config.json to the database
"""

import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path to import from config
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import get_connection_string
from config import logger
import psycopg


async def migrate_mcp_config(dry_run: bool = False):
    """Migrate MCP servers from JSON config to database.
    
    Args:
        dry_run: If True, only print what would be done without executing
    """
    logger.info("=" * 80)
    logger.info("MCP CONFIGURATION MIGRATION")
    logger.info("=" * 80)
    logger.info(f"Timestamp: {datetime.now().isoformat()}")
    
    # Load existing JSON config
    config_path = Path(__file__).parent.parent / "tools" / "mcp_config.json"
    
    if not config_path.exists():
        logger.warning(f"No MCP config file found at: {config_path}")
        logger.info("Nothing to migrate.")
        return True
    
    logger.info(f"Reading MCP config from: {config_path}")
    
    with open(config_path, 'r') as f:
        config_data = json.load(f)
    
    mcp_servers = config_data.get('mcpServers', {})
    
    if not mcp_servers:
        logger.info("No MCP servers found in config.")
        return True
    
    logger.info(f"Found {len(mcp_servers)} MCP server(s) in config:")
    for server_key in mcp_servers.keys():
        logger.info(f"  - {server_key}")
    
    if dry_run:
        logger.info("\n" + "=" * 80)
        logger.info("DRY RUN MODE - No changes will be made")
        logger.info("=" * 80)
        logger.info("\nServers that would be migrated:")
        for server_key, server_config in mcp_servers.items():
            logger.info(f"\n  {server_key}:")
            logger.info(f"    Command: {server_config.get('command')}")
            logger.info(f"    Args: {server_config.get('args', [])}")
            logger.info(f"    Env vars: {len(server_config.get('env', {}))}")
            logger.info(f"    Max retries: {server_config.get('max_retries', 3)}")
            logger.info(f"    Disabled: {server_config.get('disabled', False)}")
        logger.info("=" * 80)
        return True
    
    # Get database connection
    try:
        connection_string = get_connection_string()
        logger.info("✓ Database credentials loaded from .env")
    except ValueError as e:
        logger.error(f"❌ Failed to load database credentials: {e}")
        return False
    
    # Connect and migrate
    logger.info("\nConnecting to database...")
    try:
        async with await psycopg.AsyncConnection.connect(connection_string) as conn:
            logger.info("✓ Connected to database")
            
            async with conn.cursor() as cur:
                migrated_count = 0
                skipped_count = 0
                error_count = 0
                
                for server_key, server_config in mcp_servers.items():
                    try:
                        # Check if server already exists
                        await cur.execute(
                            """
                            SELECT id FROM mcp_servers 
                            WHERE server_key = %s 
                              AND organization_id IS NULL 
                              AND team_id IS NULL
                            LIMIT 1
                            """,
                            (server_key,)
                        )
                        existing = await cur.fetchone()
                        
                        if existing:
                            logger.info(f"⊘ Skipping '{server_key}' (already exists with id: {existing[0]})")
                            skipped_count += 1
                            continue
                        
                        # Extract config values
                        command = server_config.get('command')
                        args = server_config.get('args', [])
                        env = server_config.get('env', {})
                        disabled = server_config.get('disabled', False)
                        max_retries = server_config.get('max_retries', 3)
                        
                        # Generate display name from server key
                        display_name = server_key.replace('-', ' ').replace('_', ' ').title()
                        
                        # Store max_retries in metadata
                        metadata = {'max_retries': max_retries}
                        
                        # Insert server
                        await cur.execute(
                            """
                            INSERT INTO mcp_servers (
                                server_key,
                                display_name,
                                transport,
                                command,
                                args,
                                env,
                                metadata,
                                organization_id,
                                team_id,
                                enabled
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                server_key,
                                display_name,
                                'stdio',  # All JSON servers use stdio
                                command,
                                args,
                                json.dumps(env),
                                json.dumps(metadata),
                                None,  # Global scope (no org)
                                None,  # Global scope (no team)
                                not disabled,  # enabled = !disabled
                            )
                        )
                        
                        server_id = (await cur.fetchone())[0]
                        logger.info(f"✓ Migrated '{server_key}' (id: {server_id})")
                        migrated_count += 1
                        
                    except Exception as e:
                        logger.error(f"✗ Failed to migrate '{server_key}': {e}")
                        error_count += 1
                
                # Commit all changes
                await conn.commit()
                
                logger.info("\n" + "=" * 80)
                logger.info("MIGRATION SUMMARY")
                logger.info("=" * 80)
                logger.info(f"✓ Migrated: {migrated_count} server(s)")
                logger.info(f"⊘ Skipped: {skipped_count} server(s) (already exist)")
                logger.info(f"✗ Errors: {error_count} server(s)")
                logger.info("=" * 80)
                
                if migrated_count > 0:
                    logger.info("\n" + "=" * 80)
                    logger.info("NEXT STEPS")
                    logger.info("=" * 80)
                    logger.info("1. Verify migrated servers in the admin UI (Tools tab)")
                    logger.info("2. Create MCP tool mappings for these servers")
                    logger.info("3. Assign tools to agents as needed")
                    logger.info("4. Optional: Back up and remove mcp_config.json")
                    logger.info("=" * 80 + "\n")
                
                return error_count == 0
                
    except psycopg.Error as e:
        logger.error("\n" + "=" * 80)
        logger.error("❌ MIGRATION FAILED!")
        logger.error("=" * 80)
        logger.error(f"PostgreSQL Error: {e}")
        logger.error("=" * 80 + "\n")
        return False
    except Exception as e:
        logger.error("\n" + "=" * 80)
        logger.error("❌ UNEXPECTED ERROR!")
        logger.error("=" * 80)
        logger.error(f"Error: {e}")
        logger.error(f"Type: {type(e).__name__}")
        logger.error("=" * 80 + "\n")
        return False


async def main():
    """Main entry point for MCP config migration."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Migrate MCP servers from JSON config to database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run the migration
  python database/migrate_mcp_config.py
  
  # Dry run (preview without executing)
  python database/migrate_mcp_config.py --dry-run
        """
    )
    
    parser.add_argument(
        '--dry-run', '-d',
        action='store_true',
        help='Preview the migration without executing it'
    )
    
    args = parser.parse_args()
    
    # Run migration
    success = await migrate_mcp_config(dry_run=args.dry_run)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())

