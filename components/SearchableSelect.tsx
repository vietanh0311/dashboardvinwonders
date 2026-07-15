"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: string | undefined;
  options: string[];
  placeholder: string; // hiện khi chưa chọn gì, vd "Tất cả tag"
  onChange: (value: string | undefined) => void;
  className?: string;
};

// Bỏ dấu tiếng Việt để search không phân biệt có dấu/không dấu (vd gõ "vinwonders"
// vẫn khớp "VinWonders", gõ "khong dau" khớp "Không dấu").
function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// Combobox có ô search - thay cho <select> khi danh sách option có thể dài (tag,
// sự kiện, nhóm cơ sở...) vì cuộn 1 list dài trong <select> native rất khó dùng.
export default function SearchableSelect({ value, options, placeholder, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter((o) => normalize(o).includes(q));
  }, [options, query]);

  const openPanel = () => {
    setQuery("");
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const select = (option: string | undefined) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-emerald-200 bg-white px-2 py-2 text-left text-sm text-gray-600 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      >
        <span className={value ? "text-gray-800" : "text-gray-500"}>{value || placeholder}</span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                select(undefined);
              }}
              className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Xoá lựa chọn"
            >
              ×
            </span>
          )}
          <span className="text-gray-400">▾</span>
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-56 rounded-md border border-emerald-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length > 0) select(filtered[0]);
              }}
              placeholder="Tìm kiếm..."
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => select(undefined)}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-emerald-50 ${
                !value ? "font-medium text-emerald-700" : "text-gray-600"
              }`}
            >
              {placeholder}
            </button>
            {filtered.length === 0 && <p className="px-3 py-1.5 text-sm text-gray-400">Không tìm thấy</p>}
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => select(option)}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-emerald-50 ${
                  option === value ? "font-medium text-emerald-700" : "text-gray-600"
                }`}
                title={option}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
