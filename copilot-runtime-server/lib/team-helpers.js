/**
 * Team Association Helpers
 * Utilities for managing many-to-many team relationships with resources
 * 
 * Provides functions for:
 * - Syncing team associations (with and without transactions)
 * - Querying resources by team access
 * - Building SQL clauses for team-based filtering
 * - Case conversion utilities (camelCase <-> snake_case)
 */

// Valid table/column name pattern (alphanumeric and underscore only)
const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate SQL identifier (table or column name) to prevent SQL injection
 * @param {string} identifier - Table or column name
 * @param {string} type - Type of identifier for error message
 * @throws {Error} If identifier is invalid
 */
function validateSQLIdentifier(identifier, type = 'identifier') {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error(`Invalid ${type}: must be a non-empty string`);
  }
  if (!SQL_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid ${type}: '${identifier}' contains invalid characters`);
  }
}

/**
 * Sync team associations using an existing client (no transaction management)
 * Use this when already inside a transaction
 * 
 * @param {Client} client - PostgreSQL client (from pool.connect() or within transaction)
 * @param {string} junctionTable - Name of junction table (e.g., 'model_teams')
 * @param {string} resourceIdColumn - Name of resource ID column (e.g., 'model_id')
 * @param {string} resourceId - UUID of the resource
 * @param {string[]} teamIds - Array of team IDs to associate
 * @returns {Promise<void>}
 */
async function syncTeamAssociationsWithClient(client, junctionTable, resourceIdColumn, resourceId, teamIds) {
  // Validate SQL identifiers to prevent injection
  validateSQLIdentifier(junctionTable, 'junction table name');
  validateSQLIdentifier(resourceIdColumn, 'resource ID column name');
  
  // Delete existing associations
  await client.query(
    `DELETE FROM ${junctionTable} WHERE ${resourceIdColumn} = $1`,
    [resourceId]
  );

  // Insert new associations if any
  if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
    // Filter out null/undefined values
    const validTeamIds = teamIds.filter(id => id != null);
    
    if (validTeamIds.length > 0) {
      const values = validTeamIds.map((teamId, idx) => 
        `($1, $${idx + 2})`
      ).join(', ');
      
      await client.query(
        `INSERT INTO ${junctionTable} (${resourceIdColumn}, team_id) 
         VALUES ${values}
         ON CONFLICT (${resourceIdColumn}, team_id) DO NOTHING`,
        [resourceId, ...validTeamIds]
      );
    }
  }
}

/**
 * Sync team associations for a resource
 * Deletes existing associations and creates new ones in a transaction
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} junctionTable - Name of junction table (e.g., 'model_teams')
 * @param {string} resourceIdColumn - Name of resource ID column (e.g., 'model_id')
 * @param {string} resourceId - UUID of the resource
 * @param {string[]} teamIds - Array of team IDs to associate
 * @returns {Promise<void>}
 */
async function syncTeamAssociations(pool, junctionTable, resourceIdColumn, resourceId, teamIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await syncTeamAssociationsWithClient(client, junctionTable, resourceIdColumn, resourceId, teamIds);
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // If rollback fails, log it but throw the original error
      console.error('Error during rollback:', rollbackErr);
    }
    throw err;
  } finally {
    try {
      client.release();
    } catch (releaseErr) {
      // If release fails, log it
      console.error('Error releasing client:', releaseErr);
    }
  }
}

/**
 * Get teams for a resource
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} junctionTable - Name of junction table
 * @param {string} resourceIdColumn - Name of resource ID column
 * @param {string} resourceId - UUID of the resource
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
async function getTeamsForResource(pool, junctionTable, resourceIdColumn, resourceId) {
  // Validate SQL identifiers to prevent injection
  validateSQLIdentifier(junctionTable, 'junction table name');
  validateSQLIdentifier(resourceIdColumn, 'resource ID column name');
  
  const result = await pool.query(
    `SELECT t.id, t.name
     FROM ${junctionTable} jt
     JOIN team t ON jt.team_id = t.id
     WHERE jt.${resourceIdColumn} = $1
     ORDER BY t.name`,
    [resourceId]
  );
  return result.rows;
}

/**
 * Build WHERE clause for filtering by user's teams
 * Returns SQL and parameters for filtering resources by team access
 * 
 * @param {string} resourceTable - Name of resource table (e.g., 'models')
 * @param {string} junctionTable - Name of junction table (e.g., 'model_teams')
 * @param {string} resourceIdColumn - Name of resource ID column (e.g., 'model_id')
 * @param {string[]} userTeamIds - Array of team IDs user has access to
 * @param {number} paramOffset - Starting parameter number for SQL (default: 1)
 * @returns {{clause: string, params: any[]}}
 */
function buildTeamAccessClause(resourceTable, junctionTable, resourceIdColumn, userTeamIds, paramOffset = 1) {
  // Validate SQL identifiers to prevent injection
  validateSQLIdentifier(resourceTable, 'resource table name');
  validateSQLIdentifier(junctionTable, 'junction table name');
  validateSQLIdentifier(resourceIdColumn, 'resource ID column name');
  
  // If no teams provided, only show org-wide resources
  if (!userTeamIds || userTeamIds.length === 0) {
    return {
      clause: `NOT EXISTS (SELECT 1 FROM ${junctionTable} WHERE ${resourceIdColumn} = ${resourceTable}.id)`,
      params: []
    };
  }

  // Show resources that are either:
  // 1. Org-wide (no team associations), OR
  // 2. Associated with at least one of user's teams
  return {
    clause: `(
      NOT EXISTS (SELECT 1 FROM ${junctionTable} WHERE ${resourceIdColumn} = ${resourceTable}.id)
      OR EXISTS (
        SELECT 1 FROM ${junctionTable} 
        WHERE ${resourceIdColumn} = ${resourceTable}.id 
          AND team_id = ANY($${paramOffset}::text[])
      )
    )`,
    params: [userTeamIds]
  };
}

/**
 * Get resources with their teams using the helper view
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} viewName - Name of the view (e.g., 'models_with_teams')
 * @param {string} organizationId - Organization ID
 * @param {string[]} userTeamIds - Array of team IDs user has access to
 * @param {string} orderByColumn - Column to order by (default: 'created_at')
 * @returns {Promise<Array>}
 */
async function getResourcesWithTeams(pool, viewName, organizationId, userTeamIds = [], orderByColumn = 'created_at') {
  // Validate SQL identifiers to prevent injection
  validateSQLIdentifier(viewName, 'view name');
  validateSQLIdentifier(orderByColumn, 'order by column name');
  
  // Build team access filter
  let teamFilter = '';
  const params = [organizationId];
  
  if (userTeamIds && userTeamIds.length > 0) {
    // User has team access - show org-wide OR resources in their teams
    teamFilter = `AND (
      teams = '[]'::json
      OR EXISTS (
        SELECT 1 FROM json_array_elements(teams) as team_obj
        WHERE (team_obj->>'id')::text = ANY($2::text[])
      )
    )`;
    params.push(userTeamIds);
  } else {
    // User has no teams - only show org-wide resources
    teamFilter = `AND teams = '[]'::json`;
  }

  const query = `
    SELECT * FROM ${viewName}
    WHERE (organization_id IS NULL OR organization_id = $1)
      ${teamFilter}
    ORDER BY ${orderByColumn}
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Convert camelCase to snake_case
 * @param {string} str - String in camelCase
 * @returns {string} String in snake_case
 * @example toSnakeCase('userId') // 'user_id'
 */
function toSnakeCase(str) {
  if (!str) return str;
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 * @param {string} str - String in snake_case
 * @returns {string} String in camelCase
 * @example toCamelCase('user_id') // 'userId'
 */
function toCamelCase(str) {
  if (!str) return str;
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert database row to camelCase object
 * Transforms all snake_case keys to camelCase
 * @param {Object} row - Database row with snake_case keys
 * @returns {Object} Object with camelCase keys
 * @example rowToCamel({ user_id: '123', user_name: 'John' }) 
 *          // { userId: '123', userName: 'John' }
 */
function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row;
  
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

/**
 * Convert array of database rows to camelCase objects
 * @param {Array<Object>} rows - Array of database rows
 * @returns {Array<Object>} Array of camelCase objects
 */
function rowsToCamel(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => rowToCamel(row));
}

export {
  // Team association management
  syncTeamAssociations,
  syncTeamAssociationsWithClient,
  getTeamsForResource,
  
  // Query building and filtering
  buildTeamAccessClause,
  getResourcesWithTeams,
  
  // Case conversion utilities
  toSnakeCase,
  toCamelCase,
  rowToCamel,
  rowsToCamel,
};

