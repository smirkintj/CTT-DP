type TelemetryPayload = Record<string, unknown>;

export function logPilotEvent(event: string, payload: TelemetryPayload = {}) {
  const safePayload = {
    ...payload,
    at: new Date().toISOString()
  };
  console.info(`[pilot] ${event}`, safePayload);
}
