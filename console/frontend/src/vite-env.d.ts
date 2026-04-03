/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选：静态站托管时后端地址，如 http://127.0.0.1:8765 */
  readonly VITE_API_BASE?: string;
  readonly VITE_GOOGLE_SHEET_ID?: string;
  readonly VITE_GOOGLE_SHEETS_API_KEY?: string;
  readonly VITE_ROUND1_AUDIENCE_RANGE?: string;
  readonly VITE_ROUND2_AUDIENCE_RANGE?: string;
  readonly VITE_FINAL_AUDIENCE_RANGE?: string;
  readonly VITE_AUDIENCE_POLL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

