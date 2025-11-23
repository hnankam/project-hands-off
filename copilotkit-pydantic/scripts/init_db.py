#!/usr/bin/env python3
"""Initialize and seed the database."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import init_database, seed_database, test_connection, drop_all_tables
from config import logger


async def main():
    """Main database initialization workflow."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Initialize and seed the database')
    parser.add_argument('--test', action='store_true', help='Test database connection only')
    parser.add_argument('--drop', action='store_true', help='Drop all tables before init (DANGEROUS)')
    parser.add_argument('--seed', action='store_true', help='Seed database after initialization')
    parser.add_argument('--reset', action='store_true', help='Drop, init, and seed (DANGEROUS)')
    
    args = parser.parse_args()
    
    try:
        # Test connection
        logger.info("Testing database connection...")
        if not await test_connection():
            logger.error("Database connection failed. Check your .env configuration")
            return 1
        
        if args.test:
            logger.info("Database connection successful!")
            return 0
        
        # Drop tables if requested
        if args.drop or args.reset:
            response = input("This will DROP ALL TABLES. Are you sure? (type 'yes' to confirm): ")
            if response.lower() != 'yes':
                logger.info("Operation cancelled")
                return 1
            await drop_all_tables()
        
        # Initialize schema
        if not args.test:
            logger.info("Initializing database schema...")
            await init_database()
            logger.info("Database schema created successfully!")
        
        # Seed data if requested
        if args.seed or args.reset:
            logger.info("Seeding database...")
            result = await seed_database()
            logger.info("Database seeded successfully!")
            logger.info(f"Summary: {result}")
        
        logger.info("=" * 60)
        logger.info("Database setup complete!")
        logger.info("=" * 60)
        
        return 0
        
    except Exception as e:
        logger.error(f"Error during database setup: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

