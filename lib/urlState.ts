"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ContentFilters as ContentFiltersValue, ContentSource, DateRangeValue } from "@/lib/api";

const CONTENT_SOURCES: ContentSource[] = ["tiktok", "facebook_reels", "instagram_reels", "threads", "youtube_shorts"];

function applyParams(current: URLSearchParams, updates: Record<string, string | undefined>) {
  const next = new URLSearchParams(current.toString());
  Object.entries(updates).forEach(([key, value]) => {
    if (value) next.set(key, value);
    else next.delete(key);
  });
  return next;
}

// Đồng bộ date range vào query string (?from=&to=) để link giữa các trang
// (vd. "xem creator của campaign X") giữ nguyên khoảng thời gian đang xem,
// và reload/share URL không mất filter. Không ghi default vào URL lúc mới
// vào trang - chỉ ghi khi người dùng thực sự đổi range.
export function useUrlDateRange(defaultRange: () => DateRangeValue): [DateRangeValue, (range: DateRangeValue) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const range = useMemo<DateRangeValue>(() => {
    if (from && to) return { from, to };
    return defaultRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const setRange = useCallback(
    (next: DateRangeValue) => {
      const params = applyParams(searchParams, { from: next.from, to: next.to });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return [range, setRange];
}

// Đồng bộ ContentFilters (nguồn/sự kiện/tag/nhóm cơ sở) vào query string để
// điều hướng giữa các tầng phễu giữ nguyên ngữ cảnh, vd. Campaigns ->
// Creators?event=X sẽ mở Creators đã lọc sẵn sự kiện X.
export function useUrlContentFilters(): [ContentFiltersValue, (filters: ContentFiltersValue) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sourceParam = searchParams.get("source");
  const eventParam = searchParams.get("event");
  const tagParam = searchParams.get("tag");
  const unitParam = searchParams.get("unit");

  const filters = useMemo<ContentFiltersValue>(() => {
    const source = sourceParam && CONTENT_SOURCES.includes(sourceParam as ContentSource) ? (sourceParam as ContentSource) : undefined;
    return {
      source,
      eventName: eventParam || undefined,
      tagName: tagParam || undefined,
      workplaceUnit: unitParam || undefined,
    };
  }, [sourceParam, eventParam, tagParam, unitParam]);

  const setFilters = useCallback(
    (next: ContentFiltersValue) => {
      const params = applyParams(searchParams, {
        source: next.source,
        event: next.eventName,
        tag: next.tagName,
        unit: next.workplaceUnit,
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return [filters, setFilters];
}
