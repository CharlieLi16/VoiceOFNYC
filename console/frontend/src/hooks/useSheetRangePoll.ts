import { useCallback, useEffect, useState } from "react";
import { fetchSheetRange } from "@/api/sheetsClient";
import { getSheetsPollConfig } from "@/config/sheetsEnv";

export function useSheetRangePoll(range: string, enabled = true) {
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const { sheetId, apiKey, pollMs } = getSheetsPollConfig();

  const tick = useCallback(async () => {
    if (!enabled || !sheetId || !apiKey) {
      setError(
        !sheetId || !apiKey
          ? "请在 .env 中配置 VITE_GOOGLE_SHEET_ID 与 VITE_GOOGLE_SHEETS_API_KEY"
          : null
      );
      return;
    }
    try {
      const data = await fetchSheetRange(sheetId, apiKey, range);
      if (data.error) {
        setError(data.error.message ?? JSON.stringify(data.error));
        return;
      }
      setError(null);
      setRows(data.values ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, [enabled, sheetId, apiKey, range]);

  useEffect(() => {
    void tick();
    if (!enabled || !sheetId || !apiKey) return;
    const id = window.setInterval(() => void tick(), pollMs);
    return () => window.clearInterval(id);
  }, [tick, enabled, sheetId, apiKey, pollMs]);

  return { rows, error, refresh: tick };
}
