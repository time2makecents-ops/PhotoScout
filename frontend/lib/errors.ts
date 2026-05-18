export function normalizeErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as Record<string, unknown>;
    if (typeof first?.msg === "string") {
      return first.msg;
    }
  }

  if (detail && typeof detail === "object") {
    const maybeDetail = detail as Record<string, unknown>;
    if (typeof maybeDetail.msg === "string") {
      return maybeDetail.msg;
    }
  }

  return fallback;
}

