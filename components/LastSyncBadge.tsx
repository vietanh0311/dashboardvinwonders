"use client";

import { format, parseISO } from "date-fns";
import useSWR from "swr";
import { fetchLastSync } from "@/lib/api";

// Key SWR dùng chung - SyncButton gọi mutate(LAST_SYNC_SWR_KEY) sau khi sync
// xong để badge này tự cập nhật ngay, không cần refresh trang.
export const LAST_SYNC_SWR_KEY = "vc-last-sync";

export default function LastSyncBadge() {
  const { data, isLoading, error } = useSWR(LAST_SYNC_SWR_KEY, fetchLastSync, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <span className="text-xs text-gray-400">Đang kiểm tra dữ liệu Supabase...</span>;
  }

  if (error) {
    return <span className="text-xs text-gray-400">Chưa kết nối được Supabase</span>;
  }

  if (!data) {
    return <span className="text-xs text-amber-600">Chưa đồng bộ dữ liệu lần nào</span>;
  }

  let formatted = data.syncedAt;
  try {
    formatted = format(parseISO(data.syncedAt), "dd/MM/yyyy HH:mm");
  } catch {
    // giữ nguyên chuỗi gốc nếu parse lỗi
  }

  return <span className="text-xs text-gray-400">Dữ liệu cập nhật lúc: {formatted}</span>;
}
