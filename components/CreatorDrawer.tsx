"use client";

import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import { SOURCE_META } from "@/components/DailyChart";
import {
  CHANNEL_PLATFORM_LABEL,
  CREATOR_TIER_LABEL,
  daysSince,
  formatCurrency,
  formatNumber,
  type ContentItem,
  type CreatorChannelsSummary,
  type CreatorWithTier,
  type UserDetail,
} from "@/lib/api";

type Props = {
  creator: CreatorWithTier;
  profile: UserDetail | null | undefined; // undefined = chưa tải profile
  isLoadingProfile: boolean;
  channels: CreatorChannelsSummary | undefined;
  videos: ContentItem[];
  onClose: () => void;
};

function formatDate(value?: string) {
  if (!value) return "-";
  try {
    return format(parseISO(value), "dd/MM/yyyy HH:mm");
  } catch {
    return value;
  }
}

function formatBirthDay(value?: string) {
  if (!value) return "-";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm text-gray-800">{value}</div>
    </div>
  );
}

export default function CreatorDrawer({ creator, profile, isLoadingProfile, channels, videos, onClose }: Props) {
  const lastActiveDays = daysSince(profile?.lastActivatedAt);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">Chi tiết creator</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            Đóng ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4">
          <div className="flex items-center gap-3">
            {profile?.tiktok?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.tiktok.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-700">
                {initials(creator.name)}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-gray-900">{creator.name}</div>
              <div className="text-xs text-gray-500">{profile?.hashtag ?? creator.workplaceUnitName ?? "-"}</div>
              <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                {CREATOR_TIER_LABEL[creator.tier]}
              </span>
            </div>
          </div>

          {!profile && !isLoadingProfile && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Chưa tải profile chi tiết cho creator này. Quay lại trang danh sách, bấm &quot;Tải profile&quot; rồi mở
              lại.
            </div>
          )}

          {isLoadingProfile && (
            <div className="space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-emerald-50/60" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-emerald-50/60" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-emerald-50/60" />
            </div>
          )}

          {profile && (
            <>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Kênh</div>
                <div className="flex flex-wrap gap-1.5">
                  {channels?.linkedChannel ? (
                    <a
                      href={channels.linkedChannel.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      🔗 @{channels.linkedChannel.username} (đã liên kết)
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Chưa liên kết kênh TikTok</span>
                  )}
                  {channels?.postedChannels
                    .filter((c) => c.username !== channels.linkedChannel?.username || c.platform !== "tiktok")
                    .map((c) =>
                      c.identified ? (
                        <a
                          key={`${c.platform}-${c.username}`}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                        >
                          @{c.username} · {c.videos} video
                        </a>
                      ) : (
                        <span
                          key={`${c.platform}-unidentified`}
                          title="Chưa biết chính xác kênh của những video này"
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400"
                        >
                          {CHANNEL_PLATFORM_LABEL[c.platform]} · {c.videos} video (chưa rõ kênh)
                        </span>
                      )
                    )}
                </div>
                {channels?.offChannelWarning && (
                  <div className="mt-1.5 text-xs font-medium text-amber-700">
                    ⚠ Creator đăng video bằng kênh TikTok khác kênh đã liên kết.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Email"
                  value={
                    <span className="inline-flex items-center gap-1">
                      {profile.email ?? "-"}
                      {profile.emailVerified && <span className="text-emerald-600">✓</span>}
                    </span>
                  }
                />
                <Field
                  label="Số điện thoại"
                  value={
                    <span className="inline-flex items-center gap-1">
                      {profile.phone?.full ?? "-"}
                      {profile.phone?.verified && <span className="text-emerald-600">✓</span>}
                    </span>
                  }
                />
                <Field label="Ngày sinh" value={formatBirthDay(profile.info?.birthDay)} />
                <Field label="Giới tính" value={profile.info?.gender ?? "-"} />
                <Field label="Thành phố" value={profile.info?.cityName ?? "-"} />
                <Field label="Loại tài khoản" value={profile.accountType ?? "-"} />
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Hợp đồng</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tên hợp đồng" value={profile.contract?.name ?? "-"} />
                  <Field label="Mã số thuế" value={profile.contract?.taxNumber ?? "-"} />
                  <Field label="Trạng thái" value={profile.contract?.status ?? "-"} />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Trạng thái tài khoản</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Bị khoá (banned)"
                    value={
                      profile.banned ? (
                        <span className="font-medium text-red-600">Có{profile.bannedReason ? ` - ${profile.bannedReason}` : ""}</span>
                      ) : (
                        "Không"
                      )
                    }
                  />
                  <Field
                    label="Hoạt động gần nhất"
                    value={
                      <>
                        {formatDate(profile.lastActivatedAt)}
                        {lastActiveDays !== null && (
                          <span className={lastActiveDays > 30 ? "ml-1 text-amber-600" : "ml-1 text-gray-400"}>
                            ({lastActiveDays} ngày trước)
                          </span>
                        )}
                      </>
                    }
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Thống kê tiền</div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Tổng cash" value={formatCurrency(profile.statistic?.cashTotal ?? 0)} />
                  <Field label="Còn lại" value={formatCurrency(profile.statistic?.cashRemaining ?? 0)} />
                  <Field label="Đã rút" value={formatCurrency(profile.statistic?.withdrawTotal ?? 0)} />
                </div>
              </div>
            </>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-gray-400">
                Video trong kỳ ({formatNumber(videos.length)})
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {videos.length === 0 && <div className="text-sm text-gray-400">Không có video nào trong kỳ.</div>}
              {videos.map((v) => (
                <a
                  key={v._id}
                  href={v.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 rounded-lg border border-gray-100 p-2 hover:bg-emerald-50/40"
                >
                  {v.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.cover} alt="" className="h-12 w-9 flex-shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="h-12 w-9 flex-shrink-0 rounded bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium text-emerald-700">
                      {v.title || "(không có tiêu đề)"}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {SOURCE_META[v.source]?.label ?? v.source} · {formatNumber(v.statistic?.view?.total ?? 0)} views
                      · {formatDate(v.publishedAt)}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
