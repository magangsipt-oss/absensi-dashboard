export function parseConnectionStatus(rawText = "") {
  const normalized = String(rawText ?? "").trim();

  if (!normalized) {
    return "Offline";
  }

  const lower = normalized.toLowerCase();

  if (/ok|online|connected|success/i.test(lower)) {
    return "Connected";
  }

  try {
    const parsed = JSON.parse(normalized);

    if (parsed && typeof parsed === "object") {
      const statusValue = String(
        parsed.status ?? parsed.state ?? parsed.message ?? ""
      ).toLowerCase();

      if (
        /online|connected|ok|success/i.test(statusValue) ||
        parsed.online === true ||
        parsed.connected === true
      ) {
        return "Connected";
      }

      if (/offline|timeout|error|failed|fail/i.test(statusValue)) {
        return "Offline";
      }
    }
  } catch {
    // Ignore invalid JSON and fall through to plain-text checks below.
  }

  if (/offline|timeout|error|failed|fail|not found|denied/i.test(lower)) {
    return "Offline";
  }

  return "Connection Failed";
}
