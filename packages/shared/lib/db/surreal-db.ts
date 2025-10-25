// Dynamic imports to avoid build-time evaluation
type Surreal = any;

// Debug logging toggle (development only)
const DEBUG = true;

/**
 * SurrealDB instance for the Chrome extension
 * Uses WebAssembly engine with IndexedDB for persistent storage
 */
class SurrealDBManager {
  private db: Surreal | null = null;
  private isConnected = false;

  /**
   * Initialize and connect to SurrealDB
   * @param dbName - Name of the IndexedDB database (default: 'chrome_ext_db')
   * @param useMemory - Use in-memory storage instead of IndexedDB (default: false)
   */
  async connect(dbName = 'chrome_ext_db', useMemory = false): Promise<void> {
    if (this.isConnected && this.db) {
      DEBUG && console.log('SurrealDB already connected');
      return;
    }

    try {
      // Dynamic imports to avoid build-time issues
      const { Surreal } = await import('surrealdb');
      const { surrealdbWasmEngines } = await import('@surrealdb/wasm');

      // Initialize SurrealDB with WebAssembly engines
      this.db = new Surreal({
        engines: surrealdbWasmEngines(),
      });

      // Connect to either memory or IndexedDB
      const connectionString = useMemory ? 'mem://' : `indxdb://${dbName}`;
      await this.db.connect(connectionString);

      // Set namespace and database
      await this.db.use({
        namespace: 'app',
        database: 'main',
      });

      this.isConnected = true;
      DEBUG && console.log(`SurrealDB connected: ${connectionString}`);
    } catch (error) {
      console.error('Failed to connect to SurrealDB:', error);
      throw error;
    }
  }

  /**
   * Get the SurrealDB instance
   */
  getInstance(): Surreal {
    if (!this.db || !this.isConnected) {
      throw new Error('SurrealDB not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Check if database is connected
   */
  isDBConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.isConnected = false;
      this.db = null;
      DEBUG && console.log('SurrealDB connection closed');
    }
  }

  // Helper methods for common operations

  /**
   * Create a new record
   */
  async create<T = unknown>(table: string, data: Record<string, unknown>): Promise<T> {
    const db = this.getInstance();
    return (await db.create(table, data)) as T;
  }

  /**
   * Select all records from a table
   */
  async select<T = unknown>(table: string): Promise<T> {
    const db = this.getInstance();
    return (await db.select(table)) as T;
  }

  /**
   * Select a specific record by ID
   */
  async selectById<T = unknown>(table: string, id: string): Promise<T> {
    const db = this.getInstance();
    return (await db.select(`${table}:${id}`)) as T;
  }

  /**
   * Update a record
   */
  async update<T = unknown>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const db = this.getInstance();
    return (await db.update(`${table}:${id}`, data)) as T;
  }

  /**
   * Delete a record
   */
  async delete(table: string, id: string): Promise<void> {
    const db = this.getInstance();
    await db.delete(`${table}:${id}`);
  }

  /**
   * Execute a custom SurrealQL query
   */
  async query<T>(sql: string, vars?: Record<string, unknown>): Promise<T> {
    const db = this.getInstance();
    const result = await db.query(sql, vars);
    return result as T;
  }
}

// Export singleton instance
export const surrealDB = new SurrealDBManager();

// Export types for better TypeScript support
export interface MessageRecord {
  id?: string;
  content: string;
  sender: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface DownloadRecord {
  id?: string;
  filename: string;
  contentType: string;
  data: string; // Base64 encoded
  size: number;
  url: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Initialize database schema for messages and downloads
 */
export async function initializeSchema(): Promise<void> {
  const db = surrealDB.getInstance();

  await db.query(`
    -- Define messages table
    DEFINE TABLE IF NOT EXISTS messages SCHEMALESS;
    DEFINE FIELD IF NOT EXISTS content ON messages TYPE string;
    DEFINE FIELD IF NOT EXISTS sender ON messages TYPE string;
    DEFINE FIELD IF NOT EXISTS timestamp ON messages TYPE datetime;
    DEFINE FIELD IF NOT EXISTS metadata ON messages TYPE option<object>;
    DEFINE INDEX IF NOT EXISTS messages_timestamp ON messages FIELDS timestamp;

    -- Define downloads table
    DEFINE TABLE IF NOT EXISTS downloads SCHEMALESS;
    DEFINE FIELD IF NOT EXISTS filename ON downloads TYPE string;
    DEFINE FIELD IF NOT EXISTS contentType ON downloads TYPE string;
    DEFINE FIELD IF NOT EXISTS data ON downloads TYPE string;
    DEFINE FIELD IF NOT EXISTS size ON downloads TYPE number;
    DEFINE FIELD IF NOT EXISTS url ON downloads TYPE string;
    DEFINE FIELD IF NOT EXISTS timestamp ON downloads TYPE datetime;
    DEFINE FIELD IF NOT EXISTS metadata ON downloads TYPE option<object>;
    DEFINE INDEX IF NOT EXISTS downloads_timestamp ON downloads FIELDS timestamp;
  `);

  DEBUG && console.log('Database schema initialized');
}

