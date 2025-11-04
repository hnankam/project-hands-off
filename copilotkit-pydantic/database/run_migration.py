#!/usr/bin/env python3
"""
Database Migration Runner
Runs migration scripts using credentials from .env file
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime
import psycopg

# Add parent directory to path to import from config
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import get_connection_string
from config import logger


async def run_migration(migration_file: Path, dry_run: bool = False):
    """Run a database migration script.
    
    Args:
        migration_file: Path to the SQL migration file
        dry_run: If True, only print what would be done without executing
    """
    # Verify migration file exists
    if not migration_file.exists():
        logger.error(f"❌ Migration file not found: {migration_file}")
        return False
    
    logger.info("=" * 80)
    logger.info("DATABASE MIGRATION RUNNER")
    logger.info("=" * 80)
    logger.info(f"Migration file: {migration_file.name}")
    logger.info(f"Timestamp: {datetime.now().isoformat()}")
    
    # Read migration SQL
    logger.info(f"Reading migration file...")
    with open(migration_file, 'r') as f:
        migration_sql = f.read()
    
    logger.info(f"Migration size: {len(migration_sql)} characters")
    
    # Get database connection string
    try:
        connection_string = get_connection_string()
        logger.info("✓ Database credentials loaded from .env")
        
        # Mask password in connection string for logging
        masked_conn = connection_string.split('@')[0].split(':')[0] + ':****@' + connection_string.split('@')[1] if '@' in connection_string else connection_string
        logger.info(f"Connection: {masked_conn}")
    except ValueError as e:
        logger.error(f"❌ Failed to load database credentials: {e}")
        logger.error("Make sure .env file contains: DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD")
        return False
    
    if dry_run:
        logger.info("\n" + "=" * 80)
        logger.info("DRY RUN MODE - No changes will be made")
        logger.info("=" * 80)
        logger.info("\nMigration SQL Preview (first 500 chars):")
        logger.info("-" * 80)
        logger.info(migration_sql[:500] + "..." if len(migration_sql) > 500 else migration_sql)
        logger.info("-" * 80)
        return True
    
    # Confirm before proceeding
    logger.info("\n" + "⚠️  " * 20)
    logger.warning("IMPORTANT: This will modify your database schema!")
    logger.warning("Make sure you have a backup before proceeding.")
    logger.info("⚠️  " * 20 + "\n")
    
    # Connect and execute migration
    logger.info("Connecting to database...")
    try:
        async with await psycopg.AsyncConnection.connect(connection_string) as conn:
            logger.info("✓ Connected to database")
            
            async with conn.cursor() as cur:
                logger.info("\n" + "=" * 80)
                logger.info("EXECUTING MIGRATION")
                logger.info("=" * 80)
                
                # Execute migration
                await cur.execute(migration_sql)
                
                # Commit changes
                await conn.commit()
                
                logger.info("\n" + "=" * 80)
                logger.info("✅ MIGRATION COMPLETED SUCCESSFULLY!")
                logger.info("=" * 80)
                
                # Run verification queries
                logger.info("\n" + "=" * 80)
                logger.info("VERIFYING MIGRATION")
                logger.info("=" * 80)
                
                # Check if usage table exists
                await cur.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'usage'
                    )
                """)
                usage_exists = (await cur.fetchone())[0]
                logger.info(f"✓ 'usage' table exists: {usage_exists}")
                
                # Check if usage_logs table still exists
                await cur.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'usage_logs'
                    )
                """)
                usage_logs_exists = (await cur.fetchone())[0]
                logger.info(f"✓ 'usage_logs' table removed: {not usage_logs_exists}")
                
                # Check for new columns in providers
                await cur.execute("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'providers' 
                    AND column_name IN ('organization_id', 'team_id')
                    ORDER BY column_name
                """)
                provider_cols = [row[0] for row in await cur.fetchall()]
                logger.info(f"✓ Providers columns: {', '.join(provider_cols) if provider_cols else 'MISSING!'}")
                
                # Check for new columns in models
                await cur.execute("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'models' 
                    AND column_name IN ('organization_id', 'team_id')
                    ORDER BY column_name
                """)
                model_cols = [row[0] for row in await cur.fetchall()]
                logger.info(f"✓ Models columns: {', '.join(model_cols) if model_cols else 'MISSING!'}")
                
                # Check for new columns in agents
                await cur.execute("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'agents' 
                    AND column_name IN ('organization_id', 'team_id')
                    ORDER BY column_name
                """)
                agent_cols = [row[0] for row in await cur.fetchall()]
                logger.info(f"✓ Agents columns: {', '.join(agent_cols) if agent_cols else 'MISSING!'}")
                
                # Check data counts
                try:
                    await cur.execute("SELECT COUNT(*) FROM providers")
                    provider_count = (await cur.fetchone())[0]
                    
                    await cur.execute("SELECT COUNT(*) FROM models")
                    model_count = (await cur.fetchone())[0]
                    
                    await cur.execute("SELECT COUNT(*) FROM agents")
                    agent_count = (await cur.fetchone())[0]
                    
                    await cur.execute("SELECT COUNT(*) FROM usage")
                    usage_count = (await cur.fetchone())[0]
                    
                    logger.info(f"\nData Counts:")
                    logger.info(f"  - Providers: {provider_count}")
                    logger.info(f"  - Models: {model_count}")
                    logger.info(f"  - Agents: {agent_count}")
                    logger.info(f"  - Usage Records: {usage_count}")
                except Exception as e:
                    logger.warning(f"Could not verify data counts: {e}")
                
                logger.info("\n" + "=" * 80)
                logger.info("NEXT STEPS")
                logger.info("=" * 80)
                logger.info("1. Restart your application services")
                logger.info("2. Test that agents and models still load correctly")
                logger.info("3. Verify multi-tenancy filtering works as expected")
                logger.info("4. Check application logs for any schema-related errors")
                logger.info("=" * 80 + "\n")
                
                return True
                
    except psycopg.Error as e:
        logger.error("\n" + "=" * 80)
        logger.error("❌ MIGRATION FAILED!")
        logger.error("=" * 80)
        logger.error(f"PostgreSQL Error: {e}")
        logger.error(f"Error Code: {e.pgcode if hasattr(e, 'pgcode') else 'Unknown'}")
        logger.error("\nThe database was not modified.")
        logger.error("Please review the error and try again.")
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
    """Main entry point for migration runner."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Run database migration using credentials from .env",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run the migration
  python database/run_migration.py
  
  # Dry run (preview without executing)
  python database/run_migration.py --dry-run
  
  # Run a specific migration file
  python database/run_migration.py --file migrations/002_some_migration.sql
        """
    )
    
    parser.add_argument(
        '--file', '-f',
        type=Path,
        default=Path(__file__).parent / 'migrations' / '001_add_multi_tenancy_and_rename_usage.sql',
        help='Path to migration SQL file (default: migrations/001_add_multi_tenancy_and_rename_usage.sql)'
    )
    
    parser.add_argument(
        '--dry-run', '-d',
        action='store_true',
        help='Preview the migration without executing it'
    )
    
    args = parser.parse_args()
    
    # Run migration
    success = await run_migration(args.file, dry_run=args.dry_run)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())

