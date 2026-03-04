/**
 * Backend Health Check Utility
 * 
 * Validates connectivity to backend services on application startup.
 * Provides graceful degradation and user-friendly error messages.
 */

import { API_CONFIG } from '@src/constants';

export interface HealthCheckResult {
  service: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latency?: number;
  error?: string;
}

export interface BackendHealthStatus {
  runtimeServer: HealthCheckResult;
  pydanticBackend: HealthCheckResult;
  allHealthy: boolean;
  timestamp: number;
}

/**
 * Check health of a single backend service
 */
async function checkServiceHealth(
  serviceName: string,
  baseUrl: string,
  healthEndpoint: string = '/health',
  timeoutMs: number = 5000
): Promise<HealthCheckResult> {
  const url = `${baseUrl}${healthEndpoint}`;
  const startTime = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      // Don't send credentials for health checks
      credentials: 'omit',
    });

    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);

    if (response.ok) {
      return {
        service: serviceName,
        url: baseUrl,
        status: 'healthy',
        latency,
      };
    } else {
      return {
        service: serviceName,
        url: baseUrl,
        status: 'unhealthy',
        latency,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    const latency = Math.round(performance.now() - startTime);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          service: serviceName,
          url: baseUrl,
          status: 'unhealthy',
          latency,
          error: `Timeout after ${timeoutMs}ms`,
        };
      }
      
      return {
        service: serviceName,
        url: baseUrl,
        status: 'unhealthy',
        latency,
        error: error.message,
      };
    }

    return {
      service: serviceName,
      url: baseUrl,
      status: 'unknown',
      latency,
      error: 'Unknown error occurred',
    };
  }
}

/**
 * Check health of all backend services
 */
export async function checkBackendHealth(): Promise<BackendHealthStatus> {
  const runtimeServerUrl = API_CONFIG.BASE_URL;
  const pydanticBackendUrl = API_CONFIG.BACKEND_URL;

  // Check both services in parallel
  const [runtimeServer, pydanticBackend] = await Promise.all([
    checkServiceHealth('Runtime Server', runtimeServerUrl),
    checkServiceHealth('Pydantic Backend', pydanticBackendUrl),
  ]);

  const allHealthy = runtimeServer.status === 'healthy' && pydanticBackend.status === 'healthy';

  return {
    runtimeServer,
    pydanticBackend,
    allHealthy,
    timestamp: Date.now(),
  };
}

/**
 * Log health check results to console
 */
export function logHealthCheckResults(health: BackendHealthStatus): void {
  const { runtimeServer, pydanticBackend, allHealthy } = health;

  if (allHealthy) {
    console.log(
      '%c✓ Backend Services Healthy',
      'color: #10b981; font-weight: bold; font-size: 12px;'
    );
    console.log(`  Runtime Server: ${runtimeServer.url} (${runtimeServer.latency}ms)`);
    console.log(`  Pydantic Backend: ${pydanticBackend.url} (${pydanticBackend.latency}ms)`);
  } else {
    console.warn(
      '%c⚠ Backend Service Issues Detected',
      'color: #f59e0b; font-weight: bold; font-size: 12px;'
    );

    if (runtimeServer.status !== 'healthy') {
      console.error(
        `  ✗ Runtime Server (${runtimeServer.url}): ${runtimeServer.error || 'Unhealthy'}`
      );
    } else {
      console.log(`  ✓ Runtime Server: ${runtimeServer.url} (${runtimeServer.latency}ms)`);
    }

    if (pydanticBackend.status !== 'healthy') {
      console.error(
        `  ✗ Pydantic Backend (${pydanticBackend.url}): ${pydanticBackend.error || 'Unhealthy'}`
      );
    } else {
      console.log(`  ✓ Pydantic Backend: ${pydanticBackend.url} (${pydanticBackend.latency}ms)`);
    }
  }
}

/**
 * Get user-friendly error message for health check failures
 */
export function getHealthCheckErrorMessage(health: BackendHealthStatus): string | null {
  const { runtimeServer, pydanticBackend } = health;

  const failedServices: string[] = [];
  
  if (runtimeServer.status !== 'healthy') {
    failedServices.push(`Runtime Server (${runtimeServer.url})`);
  }
  
  if (pydanticBackend.status !== 'healthy') {
    failedServices.push(`Pydantic Backend (${pydanticBackend.url})`);
  }

  if (failedServices.length === 0) {
    return null;
  }

  if (failedServices.length === 1) {
    return `Unable to connect to ${failedServices[0]}. Please ensure the service is running.`;
  }

  return `Unable to connect to backend services:\n${failedServices.join('\n')}.\n\nPlease ensure all services are running.`;
}

/**
 * Perform health check and handle results
 * Returns true if all services are healthy, false otherwise
 */
export async function performStartupHealthCheck(): Promise<boolean> {
  try {
    const health = await checkBackendHealth();
    logHealthCheckResults(health);
    
    // Store health status in sessionStorage for debugging
    sessionStorage.setItem('backend_health_status', JSON.stringify(health));
    
    return health.allHealthy;
  } catch (error) {
    console.error('Failed to perform health check:', error);
    return false;
  }
}
