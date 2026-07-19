// Copy bảng ra clipboard dạng cả text/plain (TSV) lẫn text/html (<table>) cùng
// lúc - Google Sheets/Excel đọc text/html khi có (giữ đúng từng ô, số dán vào
// vẫn là số) và fallback về TSV cho nơi chỉ nhận plain text (Slack, chat...).

type CellValue = string | number;

function cellToText(value: CellValue): string {
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildTsv(headers: string[], rows: CellValue[][]): string {
  const lines = [headers.map(cellToText).join("\t")];
  rows.forEach((row) => lines.push(row.map(cellToText).join("\t")));
  return lines.join("\n");
}

function buildHtmlTable(headers: string[], rows: CellValue[][]): string {
  const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(cellToText(h))}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cellToText(cell))}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${thead}${tbody}</table>`;
}

// Fallback cho trình duyệt cũ/không có Clipboard API (hoặc context không secure
// khiến navigator.clipboard undefined) - dùng textarea ẩn + execCommand("copy").
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

// Copy 1 bảng (headers + rows) vào clipboard, dán được thẳng vào Google Sheets
// hoặc Excel (mỗi ô dữ liệu vào đúng 1 cell, số vẫn là số). Trả về false nếu
// mọi phương án copy đều thất bại (vd trình duyệt chặn clipboard permission).
export async function copyRowsToClipboard(headers: string[], rows: CellValue[][]): Promise<boolean> {
  const tsv = buildTsv(headers, rows);

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const html = buildHtmlTable(headers, rows);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([tsv], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(tsv);
      return true;
    }
  } catch {
    // Rơi xuống fallback bên dưới - vd Safari chặn write() ngoài user gesture
    // trực tiếp, hoặc trang chưa được cấp quyền clipboard-write.
  }

  return legacyCopy(tsv);
}
