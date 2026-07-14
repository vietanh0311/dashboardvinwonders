// Trích message người-đọc-được từ 1 lỗi bất kỳ - dùng ở mọi route handler khi
// trả lỗi ra JSON. Không phải mọi lỗi đều là instance của Error (vd lỗi
// PostgREST/Supabase, hoặc object bị throw thẳng) - nếu chỉ check
// `err instanceof Error` sẽ rơi vào "unknown error" chung chung, không giúp
// ích gì cho người dùng lẫn debug.
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "Lỗi không xác định.";

  if (typeof err === "string") return err;

  if (typeof err === "object" && err !== null) {
    const anyErr = err as { message?: unknown; error?: unknown; details?: unknown };
    if (typeof anyErr.message === "string" && anyErr.message) return anyErr.message;
    if (typeof anyErr.error === "string" && anyErr.error) return anyErr.error;
    if (typeof anyErr.details === "string" && anyErr.details) return anyErr.details;
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      // không serialize được - rơi xuống fallback bên dưới
    }
  }

  return "Lỗi không xác định.";
}
