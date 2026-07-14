"use client";

// Error boundary cho lỗi xảy ra trong chính root layout (app/layout.tsx) -
// trường hợp app/error.tsx không bắt được vì nó nằm bên trong layout. Phải tự
// render <html>/<body> vì layout gốc coi như đã hỏng. Dùng inline style thay
// vì class Tailwind vì globals.css có thể chưa kịp áp dụng ở tầng này.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            background: "#ecfdf5",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              textAlign: "center",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #fecaca",
              padding: 24,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "#b91c1c", margin: 0 }}>Đã có lỗi nghiêm trọng</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "#4b5563" }}>
              Trang không thể tải. Vui lòng thử lại; nếu vẫn lỗi, tải lại toàn bộ trang (F5).
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 16,
                borderRadius: 6,
                background: "#059669",
                color: "#fff",
                padding: "8px 16px",
                fontSize: 14,
                border: "none",
                cursor: "pointer",
              }}
            >
              Thử lại
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
