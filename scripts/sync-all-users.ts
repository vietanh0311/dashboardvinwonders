// Cào TOÀN BỘ user đã đăng ký dưới partner VinWonders (kể cả user CHƯA từng
// đăng video) vào bảng creators trên Supabase. CHẠY 1 LẦN (backfill), không
// phải job định kỳ - khác scripts/sync.ts (chạy hàng ngày qua launchd, chỉ
// phát hiện creator qua createdBy của video trong cửa sổ ngày đang sync nên bỏ
// sót user đã đăng ký nhưng chưa từng đăng video, khiến phân loại creator
// mới/cũ không chính xác).
//
// Dùng: npm run sync-users -- [--token=<jwt>]
//
// Mặc định KHÔNG cần token: tự đăng nhập bằng VC_STAFF_EMAIL/VC_STAFF_PASSWORD
// (xem lib/vcAuth.ts) - nhớ bật VPN. --token chỉ để debug bằng token dán tay.
//
// Mặc định chỉ tải profile cho user CHƯA có sẵn trong Supabase - creator đã có
// (vd đã đăng video, được scripts/sync.ts cập nhật hàng ngày) được bỏ qua để
// chạy nhanh và không ghi đè bằng dữ liệu cũ hơn.

import { runWithConcurrency } from "../lib/api";
import {
  fetchExistingCreatorIds,
  upsertCreatorRows,
  userDetailToCreatorRow,
  type CreatorRow,
} from "../lib/supabaseData";
import { getCachedTokenExpiry, getVcToken } from "../lib/vcAuth";
import { fetchAllUsersServer, fetchUserDetailServer, VcServerError } from "../lib/vcServer";

async function main() {
  const args = process.argv.slice(2);
  const tokenArg = args.find((a) => a.startsWith("--token="))?.slice("--token=".length);

  let token = tokenArg || process.env.VC_TOKEN;
  if (!token) {
    console.log("Đang tự đăng nhập VC API...");
    try {
      token = await getVcToken();
    } catch (err) {
      console.error(`\n${err instanceof Error ? err.message : err}\n`);
      console.error("Hoặc chạy với token dán tay: npm run sync-users -- --token=<jwt>");
      process.exit(1);
    }
    const expiry = getCachedTokenExpiry();
    console.log(`Đăng nhập OK${expiry ? ` (token hết hạn lúc ${expiry.toLocaleString("vi-VN")})` : ""}.`);
  }

  const startedAt = Date.now();

  console.log("Đang tải danh sách toàn bộ user VinWonders...");
  const allUsers = await fetchAllUsersServer(token);
  console.log(`Đã tải ${allUsers.length} user.`);

  const userIds = Array.from(new Set(allUsers.map((u) => u._id).filter((id): id is string => !!id)));
  const existingIds = await fetchExistingCreatorIds(userIds);
  const idsToFetch = userIds.filter((id) => !existingIds.has(id));
  const userById = new Map(allUsers.map((u) => [u._id, u]));

  console.log(
    `${existingIds.size} user đã có sẵn trong Supabase (bỏ qua) - đang tải profile cho ${idsToFetch.length} user mới...`
  );

  const creatorRows: CreatorRow[] = [];
  let done = 0;

  // 401/403 áp dụng cho MỌI user (tài khoản không có quyền đọc /users/<id>),
  // nên dừng cả pool ngay thay vì bắn hỏng hàng loạt request rồi vẫn báo "✓
  // Xong" - xem lý do đầy đủ ở scripts/sync.ts (bug tương tự từng xảy ra thật).
  let authError: VcServerError | null = null;
  let failedCount = 0;

  await runWithConcurrency(idsToFetch, 5, async (userId) => {
    if (authError) return;
    try {
      const profile = await fetchUserDetailServer(token, userId);
      creatorRows.push(userDetailToCreatorRow(userId, profile, userById.get(userId)));
    } catch (err) {
      if (err instanceof VcServerError && (err.status === 401 || err.status === 403)) {
        authError = authError ?? err;
        return;
      }
      // Lỗi lẻ tẻ (vd tài khoản đã bị xoá) - bỏ qua nhưng vẫn đếm để báo cáo.
      failedCount += 1;
    } finally {
      done += 1;
      if (done % 50 === 0 || done === idsToFetch.length) {
        console.log(`  profile: ${done}/${idsToFetch.length}`);
      }
    }
  });

  if (authError) {
    const e: VcServerError = authError;
    console.error(`\n✗ DỪNG: không đọc được profile - ${e.message} (HTTP ${e.status}).`);
    console.error("  Tài khoản VC đang dùng không có quyền đọc /users/<id> (cần tài khoản isRoot).");
    console.error("  Đổi tài khoản rồi chạy lại:  bash scripts/set-vc-password.sh");
    console.error("\n  KHÔNG ghi gì vào Supabase - dữ liệu cũ giữ nguyên.");
    process.exit(1);
  }

  // Vài user lỗi là bình thường; hỏng quá nửa thì gần như chắc chắn là sự cố
  // hệ thống, không được im lặng cho qua.
  if (idsToFetch.length > 0 && failedCount > idsToFetch.length / 2) {
    console.error(
      `\n✗ DỪNG: ${failedCount}/${idsToFetch.length} user lỗi khi tải profile - quá nhiều để coi là lỗi lẻ tẻ.`
    );
    console.error("  KHÔNG ghi gì vào Supabase - dữ liệu cũ giữ nguyên.");
    process.exit(1);
  }

  if (failedCount > 0) {
    console.log(`  (${failedCount} user lỗi, đã bỏ qua - thường là tài khoản đã bị xoá)`);
  }

  console.log("Đang lưu vào Supabase...");
  await upsertCreatorRows(creatorRows);

  console.log("");
  console.log(
    `✓ Xong: ${allUsers.length} user (danh sách), ${existingIds.size} đã có sẵn, ${creatorRows.length} user mới đã lưu, ` +
      `${((Date.now() - startedAt) / 1000).toFixed(1)}s.`
  );
}

main().catch((err) => {
  console.error("✗ Lỗi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
