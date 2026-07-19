// Kiểm tra VC_STAFF_EMAIL/VC_STAFF_PASSWORD trong .env.local có đăng nhập
// được không, KHÔNG in token ra màn hình (chỉ in hạn dùng + tài khoản).
//
// Dùng: npm run verify-login   (nhớ bật VPN)

import { getCachedTokenExpiry, getVcToken } from "../lib/vcAuth";

async function main() {
  const email = process.env.VC_STAFF_EMAIL;
  if (!email) {
    console.error("✗ Chưa có VC_STAFF_EMAIL trong .env.local. Chạy: bash scripts/set-vc-password.sh");
    process.exit(1);
  }

  console.log(`Đang thử đăng nhập bằng ${email}...`);

  let token: string;
  try {
    token = await getVcToken();
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }

  const expiry = getCachedTokenExpiry();
  console.log("✓ Đăng nhập THÀNH CÔNG.");
  if (expiry) {
    const hours = (expiry.getTime() - Date.now()) / 3600000;
    console.log(`  Token hết hạn lúc ${expiry.toLocaleString("vi-VN")} (còn ${hours.toFixed(1)} giờ).`);
    console.log("  Sync sẽ tự đăng nhập lại khi token sắp hết hạn - không cần làm gì thêm.");
  }

  // Kiểm tra QUYỀN, không chỉ "login OK". Tài khoản isRoot:false vẫn đăng nhập
  // được và vẫn đọc được /contents - nó chỉ gãy ở /users/<id>. Nếu chỉ test
  // /contents thì tài khoản thiếu quyền vẫn "pass", rồi sync mới lòi ra sau
  // vài phút. Vì vậy phải thử đúng endpoint đã từng gãy.
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  console.log(`  Tài khoản: ${payload.name ?? "?"} | isRoot: ${payload.isRoot}`);
  console.log();

  const base = (process.env.VC_API_BASE_URL || "https://vcreator-admin-api.koc.com.vn").replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${token}` };

  const contents = await fetch(`${base}/contents?page=0&limit=1`, { headers: auth, cache: "no-store" });
  if (!contents.ok) {
    console.error(`✗ Không đọc được /contents (${contents.status}) - tài khoản không đủ quyền đọc video.`);
    process.exit(1);
  }
  console.log("✓ Đọc được /contents (danh sách video).");

  // Lấy 1 creator_id thật từ chính response trên để thử /users/<id>.
  const firstCreatorId = (await contents.json())?.data?.data?.[0]?.createdBy?._id;
  if (!firstCreatorId) {
    console.error("✗ Không lấy được creator_id mẫu để thử quyền - bỏ qua bước kiểm tra /users/<id>.");
    process.exit(1);
  }

  const user = await fetch(`${base}/users/${firstCreatorId}`, { headers: auth, cache: "no-store" });
  if (!user.ok) {
    const body = await user.text();
    console.error(`\n✗ KHÔNG đọc được /users/<id> (${user.status}): ${body.slice(0, 80)}`);
    console.error("  Tài khoản này KHÔNG dùng được để sync: không lấy được profile creator");
    console.error("  (SĐT, hợp đồng, banned, thống kê tiền). Cần tài khoản isRoot: true.");
    console.error("\n  Đổi tài khoản khác rồi chạy lại: bash scripts/set-vc-password.sh");
    process.exit(1);
  }
  console.log("✓ Đọc được /users/<id> (profile creator) - tài khoản ĐỦ QUYỀN để sync.");

  console.log("\nSẵn sàng cào:  npm run sync -- 90 --refresh-creators");
}

main();
