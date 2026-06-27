"""
Cliona Database Initializer script: Dynamic LangGraph Checkpoints Table Creator.
This module uses AsyncConnectionPool to run the checkpoint setups asynchronously.

Usage:
    python init_db_async.py
"""

import asyncio
import os
import logging
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

# Configure clear logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("init_db_async")

SUPABASE_DATABASE_URL = os.environ.get(
    "SUPABASE_DATABASE_URL", 
    "postgresql://postgres:your-supabase-password@your-supabase-host:5432/postgres?sslmode=require"
)

async def init_db():
    logger.info("Initializing async execution pool and establishing connection with Supabase server...")
    
    # We use 'autocommit' true to ensure tables can be compiled successfully
    async with AsyncConnectionPool(
        conninfo=SUPABASE_DATABASE_URL, 
        kwargs={"autocommit": True}
    ) as pool:
        # Bind connection pool directly into the AsyncPostgresSaver
        checkpointer = AsyncPostgresSaver(pool)
        
        logger.info("Running checkpointer setup program...")
        # setup() will automatically CREATE required tables if they don't already exist
        await checkpointer.setup()
        
    logger.info("⚡ Success! Async PostgresSaver tables compilation completed successfully. Database setup is fully done and ready for high-concurrency connections. ⚡")

if __name__ == "__main__":
    asyncio.run(init_db())
