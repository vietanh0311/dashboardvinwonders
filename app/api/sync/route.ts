import { NextRequest, NextResponse } from "next/server";
import { extractChannelSync, runWithConcurrency, vnDaysAgo, vnToday, type ContentItem } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { resolveTikTokLink } from "@/lib/linkResolver";
import {
  contentItemToVideoRow,
  fetchExistingChannelMap,
  fetchExistingCreatorIds,
  markLatestSnapshot,
  upsertCreatorRows,
  upsertSnapshotMeta,
  upsertVideoRows,
  type CreatorRow,
} from "@/lib/supabaseData";
import { fetchContentsRangeServer, fetchUserDetailServer } from "@/lib/vcServer";

// Đồng bộ 90 ngày (3 tháng) gần nhất từ VC API thật vào Supabase - stream tiến
// độ dạng NDJSON (mỗi dòng 1 JSON object) để UI hiện progress bar theo từng
// bước thay vì chỉ đợi 1 response duy nhất ở cuối. Video/creator đã có sẵn
// trong DB được bỏ qua ở bước resolve kênh/tải profile nên các lần sync sau
// không bị chậm lại dù cửa sổ ngày dài.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNC_WINDOW_DAYS = 90;

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-vc-token");
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }
  // Mặc định chỉ tải profile cho creator MỚI (nhanh, tránh gọi lại API thật
  // cho hàng nghìn creator đã có sẵn). Bật cờ này để tải lại profile của TẤT
  // CẢ creator xuất hiện trong cửa sổ ngày đang sync - dùng khi cần cập nhật
  // SĐT/xác minh SĐT/hợp đồng mới nhất cho creator đã có trong DB (các trường
  // này chỉ có ở API live /users/<id>, không tự cập nhật nếu không refresh).
  const refreshCreators = request.headers.get("x-vc-refresh-creators") === "1";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      const startedAt = Date.now();

      try {
        const snapshotDate = vnToday();
        const fromDate = vnDaysAgo(SYNC_WINDOW_DAYS - 1);
        const toDate = vnToday();

        send({
          type: "stage",
          stage: "fetch_contents",
          message: `Đang tải video ${SYNC_WINDOW_DAYS} ngày gần nhất...`,
        });
        const items: ContentItem[] = await fetchContentsRangeServer(token, fromDate, toDate);
        send({ type: "stage", stage: "fetch_contents", message: `Đã tải ${items.length} video.`, done: true });

        // --- Kênh: chỉ resolve cho video chưa từng có dòng nào trong DB (kênh của
        // 1 video không đổi theo thời gian nên không cần resolve lại). ---
        const existingChannelMap = await fetchExistingChannelMap(items.map((it) => it._id));
        const newVideoIds = new Set(items.map((it) => it._id).filter((id) => !existingChannelMap.has(id)));

        const channelUsernameMap = new Map<string, string | null>();
        const toResolve: ContentItem[] = [];

        items.forEach((item) => {
          if (existingChannelMap.has(item._id)) {
            channelUsernameMap.set(item._id, existingChannelMap.get(item._id) ?? null);
            return;
          }
          const sync = extractChannelSync(item.link, item.source);
          if (sync.needsResolve) {
            toResolve.push(item);
          } else {
            channelUsernameMap.set(item._id, sync.username);
          }
        });

        send({
          type: "stage",
          stage: "resolve_channels",
          message: `Đang resolve kênh cho ${toResolve.length} video mới...`,
          total: toResolve.length,
        });

        let resolvedDone = 0;
        await runWithConcurrency(toResolve, 4, async (item) => {
          const result = await resolveTikTokLink(item.link);
          const username = result.finalUrl ? extractChannelSync(result.finalUrl, item.source).username : null;
          channelUsernameMap.set(item._id, username);
          resolvedDone += 1;
          send({ type: "progress", stage: "resolve_channels", done: resolvedDone, total: toResolve.length });
        });

        // --- Creators: fetch profile đầy đủ qua /users/<id> để upsert vào bảng
        // creators. Mặc định chỉ fetch creator MỚI; nếu refreshCreators=true thì
        // fetch lại toàn bộ creator xuất hiện trong cửa sổ ngày (để cập nhật
        // SĐT/xác minh SĐT/hợp đồng mới nhất cho cả creator đã có trong DB). ---
        const creatorIds = Array.from(
          new Set(items.map((it) => it.createdBy?._id).filter((id): id is string => !!id))
        );
        const existingCreatorIds = await fetchExistingCreatorIds(creatorIds);
        const creatorIdsToFetch = refreshCreators
          ? creatorIds
          : creatorIds.filter((id) => !existingCreatorIds.has(id));

        send({
          type: "stage",
          stage: "creators",
          message: refreshCreators
            ? `Đang tải lại profile cho ${creatorIdsToFetch.length} creator...`
            : `Đang tải profile cho ${creatorIdsToFetch.length} creator mới...`,
          total: creatorIdsToFetch.length,
        });

        const creatorRows: CreatorRow[] = [];
        let creatorsDone = 0;
        await runWithConcurrency(creatorIdsToFetch, 5, async (creatorId) => {
          try {
            const profile = await fetchUserDetailServer(token, creatorId);
            const fallbackItem = items.find((it) => it.createdBy?._id === creatorId);
            creatorRows.push({
              creator_id: creatorId,
              name: fallbackItem?.createdBy?.name ?? null,
              hashtag: profile?.hashtag ?? fallbackItem?.createdBy?.hashtag ?? null,
              email: profile?.email ?? null,
              phone: profile?.phone?.full ?? null,
              phone_verified: profile?.phone?.verified ?? null,
              city: profile?.info?.cityName ?? null,
              tiktok_username: profile?.tiktok?.username ?? null,
              contract_status: profile?.contract?.status ?? null,
              contract_name: profile?.contract?.name ?? null,
              account_type: profile?.accountType ?? null,
              last_activated_at: profile?.lastActivatedAt ?? null,
              updated_at: new Date().toISOString(),
            });
          } catch {
            // Bỏ qua creator lỗi (vd tài khoản đã bị xoá) - video của họ vẫn
            // được lưu vào bảng videos, chỉ thiếu profile trong bảng creators.
          } finally {
            creatorsDone += 1;
            send({ type: "progress", stage: "creators", done: creatorsDone, total: creatorIdsToFetch.length });
          }
        });

        // --- Upsert vào Supabase ---
        send({ type: "stage", stage: "upsert", message: "Đang lưu vào Supabase..." });

        const videoRows = items.map((item) =>
          contentItemToVideoRow(item, snapshotDate, channelUsernameMap.get(item._id) ?? null)
        );
        await upsertVideoRows(videoRows);
        await markLatestSnapshot(videoRows.map((r) => r.content_id), snapshotDate);
        await upsertCreatorRows(creatorRows);
        const { syncedAt } = await upsertSnapshotMeta(snapshotDate);

        send({
          type: "done",
          summary: {
            totalVideosFetched: items.length,
            newVideos: newVideoIds.size,
            newCreators: creatorRows.length,
            durationMs: Date.now() - startedAt,
            snapshotDate,
            syncedAt,
          },
        });
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        console.error("[api/sync]", err);
        send({ type: "error", message: getErrorMessage(err), status });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
