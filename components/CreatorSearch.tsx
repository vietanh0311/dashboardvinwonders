"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { SOURCE_LABEL, fetchCreatorSearch, type CreatorSearchMatch } from "@/lib/api";

type Props = {
  // creatorId nằm trong knownCreatorIds = creator đang có trong bảng hiện tại
  // (cùng khoảng ngày đang xem) - bấm vào sẽ mở CreatorDrawer luôn thay vì chỉ
  // hiện thông tin cơ bản từ kết quả search.
  knownCreatorIds: Set<string>;
  onSelectKnownCreator: (creatorId: string) => void;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

const MATCH_FIELD_LABEL: Record<string, string> = {
  name: "Tên",
  hashtag: "Hashtag",
  phone: "SĐT",
  video_link: "Link video",
  channel_link: "Link kênh",
};

export default function CreatorSearch({ knownCreatorIds, onSelectKnownCreator }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [input]);

  const shouldSearch = query.length >= MIN_QUERY_LENGTH;
  const { data, isLoading, error } = useSWR(
    shouldSearch ? ["vc-creator-search", query] : null,
    () => fetchCreatorSearch(query),
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const results: CreatorSearchMatch[] = data ?? [];
  const showPanel = input.trim().length > 0;

  return (
    <div className="relative rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <label className="mb-2 block text-sm font-semibold text-gray-800">Tra cứu creator</label>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Tìm theo tên, hashtag, số điện thoại, link kênh hoặc link video..."
        className="w-full rounded-md border border-emerald-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
      />

      {showPanel && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {input.trim().length < MIN_QUERY_LENGTH && (
            <p className="text-sm text-gray-400">Nhập tối thiểu {MIN_QUERY_LENGTH} ký tự để tìm kiếm.</p>
          )}

          {shouldSearch && isLoading && <p className="text-sm text-gray-400">Đang tìm...</p>}

          {shouldSearch && error && (
            <p className="text-sm text-red-600">Lỗi khi tìm kiếm: {error instanceof Error ? error.message : "không xác định"}</p>
          )}

          {shouldSearch && !isLoading && !error && results.length === 0 && (
            <p className="text-sm text-gray-400">Không tìm thấy creator nào khớp &quot;{query}&quot;.</p>
          )}

          {shouldSearch && results.length > 0 && (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {results.map((r) => {
                const isKnown = knownCreatorIds.has(r.creatorId);
                return (
                  <li
                    key={r.creatorId}
                    className="rounded-lg border border-gray-100 px-3 py-2 hover:bg-emerald-50/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-gray-800">{r.name ?? "-"}</span>
                          {r.hashtag && <span className="text-xs text-gray-400">{r.hashtag}</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                          {r.phone && <span>SĐT: {r.phone}</span>}
                          {r.email && <span>Email: {r.email}</span>}
                          {r.city && <span>{r.city}</span>}
                        </div>
                      </div>

                      {isKnown && (
                        <button
                          type="button"
                          onClick={() => onSelectKnownCreator(r.creatorId)}
                          className="whitespace-nowrap rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-50"
                        >
                          Xem chi tiết
                        </button>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.matchedFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        >
                          {MATCH_FIELD_LABEL[field] ?? field}
                        </span>
                      ))}
                      {!isKnown && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          Ngoài khoảng ngày đang xem
                        </span>
                      )}
                    </div>

                    {r.matchedVideos.length > 0 && (
                      <div className="mt-1.5 flex flex-col gap-1">
                        {r.matchedVideos.map((v) => (
                          <a
                            key={v.link}
                            href={v.link}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800"
                            title={v.link}
                          >
                            {v.channelUsername ? `@${v.channelUsername} · ` : ""}
                            {v.source ? SOURCE_LABEL[v.source as keyof typeof SOURCE_LABEL] ?? v.source : ""} ·{" "}
                            {v.link}
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
