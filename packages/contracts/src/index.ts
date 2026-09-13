export type ServiceStatus = 'ok' | 'degraded' | 'unavailable';

export interface HealthResponse {
  service: string;
  status: ServiceStatus;
  timestamp: string;
  version?: string;
}

export interface ReadinessDependency {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
}

export interface ReadinessResponse extends HealthResponse {
  dependencies: ReadinessDependency[];
}

export interface ApiErrorShape {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}
