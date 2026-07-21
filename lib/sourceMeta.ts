import type { ContentSource } from "@/lib/api";

// Nhãn + màu hiển thị theo nền tảng - dùng chung cho mọi chart/bảng liên quan tới source
// (DailyChart, PublishHeatmap, SourceComparisonTable, TopVideosCard...).
export const SOURCE_META: Record<ContentSource, { label: string; color: string }> = {
  tiktok: { label: "TikTok", color: "#059669" },
  facebook_reels: { label: "Facebook Reels", color: "#3b82f6" },
  instagram_reels: { label: "Instagram Reels", color: "#f97316" },
  threads: { label: "Threads", color: "#6366f1" },
  youtube_shorts: { label: "YouTube Shorts", color: "#ef4444" },
};
