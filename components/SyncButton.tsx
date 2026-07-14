"use client";

import { useState } from "react";
import { mutate as globalMutate } from "swr";
import { getStoredToken } from "@/lib/api";
import { LAST_SYNC_SWR_KEY } from "@/components/LastSyncBadge";

type SyncSummary = {
  totalVideosFetched: number;
  newVideos: number;
  newCreators: number;
  durationMs: number;
  snapshotDate: string;
  syncedAt: string;
};

type SyncEvent =
  | { type: "stage"; stage: string; message?: string; total?: number; done?: boolean }
  | { type: "progress"; stage: string; done: number; total: number }
  | { type: "done"; summary: SyncSummary }
  | { type: "error"; message: string; status?: number };

type ToastState = { kind: "success" | "error"; message: string };

type Props = {
  onSynced?: () => void;
};

export default function SyncButton({ onSynced }: Props) {
  const [running, setRunning] = useState(false);
  const [stageMessage, setStageMessage] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const handleSync = async () => {
    if (running) return;

    const token = getStoredToken();
    if (!token) {
      setToast({ kind: "error", message: "Chưa có token. Dán token ở mục Token API rồi thử lại." });
      window.setTimeout(() => setToast(null), 5000);
      return;
    }

    setRunning(true);
    setProgress(null);
    setStageMessage("Đang bắt đầu đồng bộ...");

    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "x-vc-token": token } });

      if (!res.ok || !res.body) {
        let message = `Lỗi ${res.status}`;
        try {
          const body = await res.json();
          message = body?.error ?? message;
        } catch {
          // giữ message mặc định
        }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let summary: SyncSummary | null = null;

      // Stream NDJSON - mỗi dòng là 1 SyncEvent - cập nhật progress theo thời
      // gian thực thay vì chỉ đợi 1 response duy nhất ở cuối.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as SyncEvent;

          if (evt.type === "stage") {
            setStageMessage(evt.message ?? "");
            if (typeof evt.total === "number") setProgress({ done: 0, total: evt.total });
          } else if (evt.type === "progress") {
            setProgress({ done: evt.done, total: evt.total });
          } else if (evt.type === "done") {
            summary = evt.summary;
          } else if (evt.type === "error") {
            throw new Error(evt.message || "Lỗi khi đồng bộ dữ liệu.");
          }
        }
      }

      if (!summary) throw new Error("Không nhận được kết quả từ server.");

      setToast({
        kind: "success",
        message: `Đồng bộ xong: ${summary.totalVideosFetched} video (${summary.newVideos} mới), ${
          summary.newCreators
        } creator mới, mất ${(summary.durationMs / 1000).toFixed(1)}s.`,
      });

      globalMutate(LAST_SYNC_SWR_KEY);
      onSynced?.();
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Lỗi không xác định khi đồng bộ dữ liệu.",
      });
    } finally {
      setRunning(false);
      setStageMessage("");
      setProgress(null);
      window.setTimeout(() => setToast(null), 6000);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={running}
        className="whitespace-nowrap rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
      >
        {running ? stageMessage || "Đang đồng bộ..." : "Cập nhật dữ liệu"}
      </button>

      {running && progress && progress.total > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-xs text-gray-400">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${
            toast.kind === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
