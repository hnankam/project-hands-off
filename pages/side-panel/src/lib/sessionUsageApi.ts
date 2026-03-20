/**
 * Fetches session usage totals from the same admin API as UsagePopup (`range=all`).
 */

export interface SessionUsageSummary {
  requestCount: number;
  request: number;
  response: number;
  total: number;
}

interface TimeseriesPoint {
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  callCount: number;
}

/**
 * All-time session aggregates for a sessionId (same contract as UsagePopup session card).
 */
export async function fetchSessionUsageSummary(
  apiBaseUrl: string,
  sessionId: string,
): Promise<SessionUsageSummary | null> {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/api/admin/usage?sessionId=${encodeURIComponent(sessionId)}&range=all`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;

  const summary = data.summary as Record<string, number> | undefined;
  if (summary) {
    return {
      request: summary.requestTokens ?? 0,
      response: summary.responseTokens ?? 0,
      total: summary.totalTokens ?? 0,
      requestCount: summary.callCount ?? 0,
    };
  }

  const totals = data.totals as Record<string, number> | undefined;
  if (totals) {
    return {
      request: totals.requestTokens ?? 0,
      response: totals.responseTokens ?? 0,
      total: totals.totalTokens ?? 0,
      requestCount: totals.callCount ?? 0,
    };
  }

  const ts = data.timeseries as TimeseriesPoint[] | undefined;
  if (Array.isArray(ts) && ts.length > 0) {
    const acc = ts.reduce(
      (a, p) => ({
        total: a.total + (p.totalTokens ?? 0),
        request: a.request + (p.requestTokens ?? 0),
        response: a.response + (p.responseTokens ?? 0),
        requestCount: a.requestCount + (p.callCount ?? 0),
      }),
      { total: 0, request: 0, response: 0, requestCount: 0 },
    );
    return acc;
  }

  return null;
}
