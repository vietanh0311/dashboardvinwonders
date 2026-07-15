// Cào nhanh dữ liệu VinWonders từ VC Creator Admin API vào Supabase, chạy
// thẳng bằng token dán ở terminal - không cần mở trình duyệt / bấm "Cập nhật
// dữ liệu" trên UI. Logic giống hệt app/api/sync/route.ts (dùng chung
// lib/vcServer.ts + lib/supabaseData.ts) nên không cần chạy `npm run dev`.
//
// Dùng: npm run sync -- <vc-token> [số-ngày]
// (token hết hạn sau vài tiếng - lấy token mới mỗi lần chạy; mặc định cào 90
// ngày/3 tháng gần nhất - video/creator đã có sẵn trong DB được bỏ qua ở bước
// resolve kênh/tải profile nên các lần chạy sau không bị chậm lại)

import { extractChannelSync, runWithConcurrency, vnDaysAgo, vnToday, type ContentItem } from "../lib/api";
import { resolveTikTokLink } from "../lib/linkResolver";
import {
  contentItemToVideoRow,
  fetchExistingChannelMap,
  fetchExistingCreatorIds,
  upsertCreatorRows,
  upsertSnapshotMeta,
  upsertVideoRows,
  type CreatorRow,
} from "../lib/supabaseData";
import { fetchContentsRangeServer, fetchUserDetailServer } from "../lib/vcServer";

const DEFAULT_SYNC_WINDOW_DAYS = 90;

async function main() {
  const token = process.argv[2] || process.env.VC_TOKEN;
  if (!token) {
    console.error("Thiếu token. Dùng: npm run sync -- <vc-token> [số-ngày]");
    process.exit(1);
  }

  const daysArg = Number(process.argv[3]);
  const SYNC_WINDOW_DAYS = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : DEFAULT_SYNC_WINDOW_DAYS;

  const startedAt = Date.now();
  const snapshotDate = vnToday();
  const fromDate = vnDaysAgo(SYNC_WINDOW_DAYS - 1);
  const toDate = vnToday();

  console.log(`Đang tải video ${SYNC_WINDOW_DAYS} ngày gần nhất (${fromDate} → ${toDate})...`);
  const items: ContentItem[] = await fetchContentsRangeServer(token, fromDate, toDate);
  console.log(`Đã tải ${items.length} video.`);

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

  console.log(`Đang resolve kênh cho ${toResolve.length} video mới...`);
  let resolvedDone = 0;
  await runWithConcurrency(toResolve, 4, async (item) => {
    const result = await resolveTikTokLink(item.link);
    const username = result.finalUrl ? extractChannelSync(result.finalUrl, item.source).username : null;
    channelUsernameMap.set(item._id, username);
    resolvedDone += 1;
    if (resolvedDone % 20 === 0 || resolvedDone === toResolve.length) {
      console.log(`  resolve kênh: ${resolvedDone}/${toResolve.length}`);
    }
  });

  const creatorIds = Array.from(new Set(items.map((it) => it.createdBy?._id).filter((id): id is string => !!id)));
  const existingCreatorIds = await fetchExistingCreatorIds(creatorIds);
  const newCreatorIds = creatorIds.filter((id) => !existingCreatorIds.has(id));

  console.log(`Đang tải profile cho ${newCreatorIds.length} creator mới...`);
  const creatorRows: CreatorRow[] = [];
  let creatorsDone = 0;
  await runWithConcurrency(newCreatorIds, 5, async (creatorId) => {
    try {
      const profile = await fetchUserDetailServer(token, creatorId);
      const fallbackItem = items.find((it) => it.createdBy?._id === creatorId);
      creatorRows.push({
        creator_id: creatorId,
        name: fallbackItem?.createdBy?.name ?? null,
        hashtag: profile?.hashtag ?? fallbackItem?.createdBy?.hashtag ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone?.full ?? null,
        city: profile?.info?.cityName ?? null,
        tiktok_username: profile?.tiktok?.username ?? null,
        contract_status: profile?.contract?.status ?? null,
        account_type: profile?.accountType ?? null,
        last_activated_at: profile?.lastActivatedAt ?? null,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Bỏ qua creator lỗi (vd tài khoản đã bị xoá).
    } finally {
      creatorsDone += 1;
      if (creatorsDone % 20 === 0 || creatorsDone === newCreatorIds.length) {
        console.log(`  profile creator: ${creatorsDone}/${newCreatorIds.length}`);
      }
    }
  });

  console.log("Đang lưu vào Supabase...");
  const videoRows = items.map((item) =>
    contentItemToVideoRow(item, snapshotDate, channelUsernameMap.get(item._id) ?? null)
  );
  await upsertVideoRows(videoRows);
  await upsertCreatorRows(creatorRows);
  const { syncedAt } = await upsertSnapshotMeta(snapshotDate);

  console.log("");
  console.log(
    `✓ Xong: ${items.length} video (${newVideoIds.size} mới), ${creatorRows.length} creator mới, ` +
      `${((Date.now() - startedAt) / 1000).toFixed(1)}s, synced lúc ${syncedAt}.`
  );
}

main().catch((err) => {
  console.error("✗ Lỗi khi sync:", err instanceof Error ? err.message : err);
  process.exit(1);
});
