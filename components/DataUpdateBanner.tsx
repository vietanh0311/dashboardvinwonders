"use client";

import { format, parseISO } from "date-fns";
import useSWR from "swr";
import { LAST_SYNC_SWR_KEY } from "@/components/LastSyncBadge";
import { fetchLastSync } from "@/lib/api";

const CONTACT_EMAIL = "nguyenvietanh0311@gmail.com";

// Dashboard không còn nút "Cập nhật dữ liệu"/Token API trên UI - Việt Anh tự
// đồng bộ bằng `npm run sync` (xem scripts/sync.ts). Banner này thay thế các
// nút đó, chỉ báo cho người xem biết dữ liệu tính đến ngày nào và cần liên hệ
// ai nếu muốn có dữ liệu mới hơn.
export default function DataUpdateBanner() {
  const { data, isLoading } = useSWR(LAST_SYNC_SWR_KEY, fetchLastSync, { revalidateOnFocus: false });

  let dateLabel = "chưa có dữ liệu";
  if (data?.snapshotDate) {
    try {
      dateLabel = format(parseISO(data.snapshotDate), "dd/MM/yyyy");
    } catch {
      dateLabel = data.snapshotDate;
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <span>📌</span>
      <span>
        Dashboard cập nhật dữ liệu thủ công. Dữ liệu hiện tại tính đến{" "}
        <span className="font-medium">{isLoading ? "đang kiểm tra..." : dateLabel}</span>. Cần cập nhật dữ liệu mới,
        vui lòng liên hệ{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium underline underline-offset-2 hover:text-amber-900"
        >
          Việt Anh
        </a>
        .
      </span>
    </div>
  );
}
