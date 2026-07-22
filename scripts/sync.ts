// Cào dữ liệu VinWonders từ VC Creator Admin API vào Supabase. Logic giống hệt
// app/api/sync/route.ts (dùng chung lib/vcServer.ts + lib/supabaseData.ts) nên
// không cần chạy `npm run dev`.
//
// Dùng: npm run sync -- [số-ngày] [--refresh-creators] [--token=<jwt>]
//
// Mặc định KHÔNG cần token: tự đăng nhập bằng VC_STAFF_EMAIL/VC_STAFF_PASSWORD
// (xem lib/vcAuth.ts) - nhớ bật VPN. --token chỉ để debug bằng token dán tay.
//
// Mặc định cào 90 ngày gần nhất - video/creator đã có sẵn trong DB được bỏ qua
// ở bước resolve kênh/tải profile nên các lần chạy sau không bị chậm lại.
//
// --refresh-creators: tải lại profile đầy đủ (SĐT, trạng thái xác minh SĐT,
// tên hợp đồng...) cho TẤT CẢ creator xuất hiện trong cửa sổ ngày đang sync,
// kể cả creator đã có sẵn trong DB (mặc định các creator này bị bỏ qua để
// chạy nhanh). Dùng khi cần cập nhật lại thông tin creator đã cũ - chạy chậm
// hơn hẳn vì gọi lại API thật cho từng creator.

import { Client } from "pg";
import { extractChannelSync, runWithConcurrency, vnDaysAgo, vnToday, type ContentItem } from "../lib/api";
import { resolveTikTokLink } from "../lib/linkResolver";
import {
  cleanupOldSnapshots,
  contentItemToVideoRow,
  fetchExistingChannelMap,
  fetchExistingCreatorIds,
  markLatestSnapshot,
  upsertCreatorRows,
  upsertSnapshotMeta,
  upsertVideoRows,
  userDetailToCreatorRow,
  type CreatorRow,
} from "../lib/supabaseData";
import { getCachedTokenExpiry, getVcToken } from "../lib/vcAuth";
import { fetchContentsRangeServer, fetchUserDetailServer, VcServerError } from "../lib/vcServer";

const DEFAULT_SYNC_WINDOW_DAYS = 90;
const ANOMALY_CACHE_WINDOW_DAYS = 14; // khớp mặc định của computeAnomalies()/AnomalyTable

// refresh_anomaly_cache() (xem supabase-migration-anomaly.sql) mất ~25-30s -
// vượt xa statement_timeout 8s mà Supabase áp cho mọi request qua PostgREST
// (kể cả dùng service role key, vì kết nối luôn đăng nhập bằng role
// `authenticator` trước, statement_timeout gắn ở CẤP KẾT NỐI đó chứ không đổi
// theo SET ROLE sau này). Vì vậy KHÔNG gọi qua supabase.rpc() (getSupabaseAdmin)
// như các bước khác trong file này - phải mở kết nối Postgres trực tiếp bằng
// SUPABASE_DB_URL. Không có biến này thì bỏ qua bước này (cảnh báo, không dừng
// sync) - dữ liệu core (video/creator) đã lưu xong trước đó rồi.
async function refreshAnomalyCache() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log("  (Bỏ qua cập nhật anomaly cache - thiếu SUPABASE_DB_URL trong .env.local)");
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query("select refresh_anomaly_cache($1)", [ANOMALY_CACHE_WINDOW_DAYS]);
    console.log("Đã cập nhật anomaly cache (Signals - nghi mua view).");
  } catch (err) {
    console.error(
      "  Cảnh báo: không cập nhật được anomaly cache -",
      err instanceof Error ? err.message : err
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const refreshCreators = args.includes("--refresh-creators");
  const positional = args.filter((a) => !a.startsWith("--"));

  // Token là FLAG --token=<jwt>, không phải tham số vị trí. Trước đây token là
  // positional[0] nên `sync -- 90` hiểu "90" là token và gửi thẳng lên API
  // (lỗi Unauthorized khó hiểu). Giờ tham số vị trí duy nhất là số ngày.
  const tokenArg = args.find((a) => a.startsWith("--token="))?.slice("--token=".length);

  const daysArg = Number(positional[0]);
  if (positional[0] !== undefined && !(Number.isFinite(daysArg) && daysArg > 0)) {
    console.error(`Tham số "${positional[0]}" không phải số ngày hợp lệ.`);
    console.error("Dùng: npm run sync -- [số-ngày] [--refresh-creators] [--token=<jwt>]");
    process.exit(1);
  }
  const SYNC_WINDOW_DAYS = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : DEFAULT_SYNC_WINDOW_DAYS;

  // Thứ tự ưu tiên: --token (debug) -> VC_TOKEN -> tự đăng nhập bằng
  // VC_STAFF_EMAIL/VC_STAFF_PASSWORD. Đường mặc định là tự đăng nhập, nên job
  // chạy theo lịch không cần ai dán token.
  let token = tokenArg || process.env.VC_TOKEN;
  if (!token) {
    console.log("Đang tự đăng nhập VC API...");
    try {
      token = await getVcToken();
    } catch (err) {
      console.error(`\n${err instanceof Error ? err.message : err}\n`);
      console.error("Hoặc chạy với token dán tay: npm run sync -- [số-ngày] --token=<jwt>");
      process.exit(1);
    }
    const expiry = getCachedTokenExpiry();
    console.log(`Đăng nhập OK${expiry ? ` (token hết hạn lúc ${expiry.toLocaleString("vi-VN")})` : ""}.`);
  }

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
  const creatorIdsToFetch = refreshCreators ? creatorIds : creatorIds.filter((id) => !existingCreatorIds.has(id));

  console.log(
    refreshCreators
      ? `Đang tải lại profile cho ${creatorIdsToFetch.length} creator (--refresh-creators)...`
      : `Đang tải profile cho ${creatorIdsToFetch.length} creator mới...`
  );
  const creatorRows: CreatorRow[] = [];
  let creatorsDone = 0;

  // 401/403 áp dụng cho MỌI creator (tài khoản không có quyền đọc /users/<id>),
  // nên dừng cả pool ngay thay vì bắn hỏng 1504 request rồi vẫn báo "✓ Xong".
  // Đây từng là bug thật: catch {} nuốt sạch lỗi quyền, sync in "0 creator đã
  // tải lại" mà thoát code 0 - job chạy theo lịch hỏng âm thầm hàng ngày.
  let authError: VcServerError | null = null;
  let failedCount = 0;

  await runWithConcurrency(creatorIdsToFetch, 5, async (creatorId) => {
    if (authError) return; // đã biết lỗi quyền - khỏi thử tiếp
    try {
      const profile = await fetchUserDetailServer(token, creatorId);
      const fallbackItem = items.find((it) => it.createdBy?._id === creatorId);
      creatorRows.push(userDetailToCreatorRow(creatorId, profile, fallbackItem?.createdBy));
    } catch (err) {
      if (err instanceof VcServerError && (err.status === 401 || err.status === 403)) {
        authError = authError ?? err;
        return;
      }
      // Lỗi lẻ tẻ (vd tài khoản đã bị xoá) - bỏ qua nhưng vẫn đếm để báo cáo.
      failedCount += 1;
    } finally {
      creatorsDone += 1;
      if (creatorsDone % 20 === 0 || creatorsDone === creatorIdsToFetch.length) {
        console.log(`  profile creator: ${creatorsDone}/${creatorIdsToFetch.length}`);
      }
    }
  });

  if (authError) {
    const e: VcServerError = authError;
    console.error(`\n✗ DỪNG: không đọc được profile creator - ${e.message} (HTTP ${e.status}).`);
    console.error("  Tài khoản VC đang dùng không có quyền đọc /users/<id> (cần tài khoản isRoot).");
    console.error("  Đổi tài khoản rồi chạy lại:  bash scripts/set-vc-password.sh");
    console.error("\n  KHÔNG ghi gì vào Supabase - dữ liệu cũ giữ nguyên.");
    process.exit(1);
  }

  // Vài creator lỗi là bình thường; hỏng quá nửa thì gần như chắc chắn là sự
  // cố hệ thống, không được im lặng cho qua.
  if (creatorIdsToFetch.length > 0 && failedCount > creatorIdsToFetch.length / 2) {
    console.error(
      `\n✗ DỪNG: ${failedCount}/${creatorIdsToFetch.length} creator lỗi khi tải profile - ` +
        "quá nhiều để coi là lỗi lẻ tẻ."
    );
    console.error("  KHÔNG ghi gì vào Supabase - dữ liệu cũ giữ nguyên.");
    process.exit(1);
  }

  if (failedCount > 0) {
    console.log(`  (${failedCount} creator lỗi, đã bỏ qua - thường là tài khoản đã bị xoá)`);
  }

  console.log("Đang lưu vào Supabase...");
  const videoRows = items.map((item) =>
    contentItemToVideoRow(item, snapshotDate, channelUsernameMap.get(item._id) ?? null)
  );
  await upsertVideoRows(videoRows);
  await markLatestSnapshot(videoRows.map((r) => r.content_id), snapshotDate);
  await upsertCreatorRows(creatorRows);
  const { syncedAt } = await upsertSnapshotMeta(snapshotDate);

  // Dọn lịch sử snapshot cũ (giữ theo ngày 14 ngày gần nhất, xa hơn 1
  // snapshot/tuần) - không dọn thì bảng videos phình ~1M dòng/tháng.
  const deletedRows = await cleanupOldSnapshots();
  if (deletedRows > 0) console.log(`Đã dọn ${deletedRows} dòng snapshot cũ.`);

  // Tính trước danh sách video/creator nghi mua view (Signals) - trang
  // /trends chỉ đọc lại bảng anomaly_cache, không tự tính real-time (xem
  // computeAnomalies() trong lib/supabaseData.ts).
  await refreshAnomalyCache();

  console.log("");
  console.log(
    `✓ Xong: ${items.length} video (${newVideoIds.size} mới), ${creatorRows.length} creator ` +
      `${refreshCreators ? "đã tải lại" : "mới"}, ${((Date.now() - startedAt) / 1000).toFixed(1)}s, synced lúc ${syncedAt}.`
  );
}

main().catch((err) => {
  console.error("✗ Lỗi khi sync:", err instanceof Error ? err.message : err);
  process.exit(1);
});
