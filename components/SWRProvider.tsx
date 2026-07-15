"use client";

import { SWRConfig } from "swr";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// CLI sync (npm run sync) ghi thẳng vào Supabase, không qua UI nên tab
// dashboard đang mở không có cách nào tự biết để làm mới. Poll định kỳ ở đây
// đảm bảo mọi useSWR trong app (trừ khi tự override refreshInterval) tự bắt
// kịp dữ liệu mới sau tối đa 5 phút mà không cần reload tay.
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ refreshInterval: REFRESH_INTERVAL_MS }}>{children}</SWRConfig>;
}
