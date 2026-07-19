# VCreators Dashboard

Dashboard theo dõi video/creator từ VC Creator Admin API, mặc định lọc partner VinWonders.

## Chạy local

```bash
npm install
cp .env.local.example .env.local   # rồi điền DASHBOARD_PASSWORD
npm run dev
```

Mở http://localhost:3000 — nếu đã set `DASHBOARD_PASSWORD`, trang sẽ chuyển tới `/login` để nhập mật khẩu trước.

Nếu **không** set `DASHBOARD_PASSWORD`, middleware sẽ bỏ qua bước xác thực (tiện cho dev local), nhưng **bắt buộc phải set khi deploy** để không bị mở công khai.

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `DASHBOARD_PASSWORD` | Nên có khi deploy | Mật khẩu chung để vào dashboard (trang `/login`). Không set = không khoá trang. |
| `VC_API_BASE_URL` | Không | Override base URL của VC Creator Admin API. Mặc định `https://vcreator-admin-api.koc.com.vn`. |
| `SUPABASE_URL` | Có (để dùng sync/lịch sử) | Project URL của Supabase, ở Project Settings → API. |
| `SUPABASE_SERVICE_KEY` | Có (để dùng sync/lịch sử) | **Service role key** (không phải `anon` key) - chỉ dùng server-side, không thêm tiền tố `NEXT_PUBLIC_`. |
| `VC_STAFF_EMAIL` | Chỉ ở máy chạy sync | Email tài khoản VC để sync tự đăng nhập. Phải là tài khoản **`isRoot: true`** (xem bên dưới). **Không cần** set trên Vercel. |
| `VC_STAFF_PASSWORD` | Chỉ ở máy chạy sync | Mật khẩu tài khoản VC. **Không cần** set trên Vercel. |

> **Tài khoản sync bắt buộc phải có `isRoot: true`.** Tài khoản thường (`isRoot: false`) đọc được `/contents` và `/users` (danh sách) nhưng bị **401 "Bạn không có quyền!"** ở `/users/<id>` - tức không lấy được profile creator (SĐT, hợp đồng, banned, thống kê tiền). Danh sách `/users` có `banned`/`statistic`/`contract` nhưng thiếu `phone`/`email`/`info`/`lastActivatedAt`, nên không thay thế được. Sync sẽ **dừng và báo lỗi rõ** nếu tài khoản thiếu quyền, không âm thầm bỏ qua.

## Kiến trúc: ai gọi VC API?

Đây là điểm quan trọng nhất của dự án:

> **Chỉ có sync gọi VC API. Dashboard KHÔNG bao giờ gọi.**

Lý do: VC API (kể cả endpoint đăng nhập `/staffs/login`) chỉ nhận IP đã whitelist hoặc khi bật VPN. Người xem dashboard không có VPN, và IP của Vercel thì động nên không whitelist được. Vì vậy:

| Thành phần | Chạy ở đâu | Gọi VC API? | Cần VPN? |
| --- | --- | --- | --- |
| Sync (`npm run sync`) | Máy local của Việt Anh | Có - tự đăng nhập | **Có** |
| Dashboard (Next.js) | Vercel | Không - chỉ đọc Supabase | Không |

Sync cào **toàn bộ** dữ liệu (video + profile creator đầy đủ: SĐT, hợp đồng, banned, thống kê tiền, kênh TikTok đã resolve) vào Supabase. Dashboard chỉ đọc Supabase và lo phần phân tích/insight. Nhờ vậy ai cũng xem được dashboard mà không cần token hay VPN.

### Token gọi VC API (JWT)

Không còn phải dán token tay nữa. Token VC sống vài tiếng và không có refresh token, nên `lib/vcAuth.ts` tự đăng nhập bằng `VC_STAFF_EMAIL`/`VC_STAFF_PASSWORD` và tự lấy token mới khi sắp hết hạn.

Cú pháp: `npm run sync -- [số-ngày] [--refresh-creators] [--token=<jwt>]`. Token là **flag** `--token=`, không phải tham số vị trí — tham số vị trí duy nhất là số ngày. Chỉ dùng `--token` khi cần debug bằng token dán tay.

## Tự động cào dữ liệu hàng ngày

`scripts/daily-sync.sh` + launchd lo việc này. launchd gọi script mỗi 30 phút, script tự quyết định:

- Hôm nay cào xong rồi → thoát ngay.
- Chưa cào, VPN đang tắt → thoát im lặng, 30 phút sau thử lại.
- Chưa cào, VPN đang bật → cào đầy đủ rồi đánh dấu xong.

Nghĩa là **hôm nào bật VPN lúc nào thì nó cào lúc đó**, đúng 1 lần/ngày - không cần nhớ hẹn giờ.

Cài đặt:

```bash
cp scripts/com.vietanh.vcd-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.vietanh.vcd-sync.plist
```

Xem log: `tail -f sync.log`. Chạy thử ngay: `launchctl start com.vietanh.vcd-sync`.
Gỡ: `launchctl unload ~/Library/LaunchAgents/com.vietanh.vcd-sync.plist`.

Ép cào lại trong ngày (khi đã đánh dấu xong): `rm .sync-state`.

## Thiết lập Supabase (lưu lịch sử snapshot)

Dashboard mặc định đọc dữ liệu từ Supabase (nhanh, không cần token mỗi lần mở trang) thay vì gọi thẳng VC API. Cần 1 project Supabase (free tier là đủ):

1. Tạo project mới trên [supabase.com](https://supabase.com).
2. Vào **SQL Editor** → dán toàn bộ nội dung file [`supabase-schema.sql`](./supabase-schema.sql) → **Run**. File này tạo 3 bảng `snapshots`, `videos`, `creators` (xem comment trong file để biết chi tiết từng cột) và bật RLS nhưng không thêm policy nào - chỉ service role key mới đọc/ghi được.
3. Vào **Project Settings → API** → copy **Project URL** và **`service_role` secret key** (không phải `anon` key).
4. Dán vào `.env.local` (local) hoặc Environment Variables trên Vercel (production):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   ```
5. Chạy lại `npm run dev` (hoặc redeploy) để áp dụng.

### Đồng bộ dữ liệu (nút "Cập nhật dữ liệu")

Nút này nằm cạnh nút **Token API** ở mọi trang (trừ `/trends`). Cách dùng:

1. Dán token vào ô **Token API** như quy trình hằng ngày ở trên.
2. Bấm **Cập nhật dữ liệu** → dashboard gọi `POST /api/sync` (server-side), fetch video **3 ngày gần nhất** từ VC API thật (view của video mới còn biến động nên cần re-sync mỗi ngày), resolve kênh cho video mới, tạo profile cho creator mới, rồi upsert tất cả vào Supabase. Tiến độ hiện ngay trên nút (đang tải video → đang resolve kênh → đang lưu), kết quả hiện dạng toast góc dưới phải.
3. Header mọi trang hiện dòng **"Dữ liệu cập nhật lúc: ..."** lấy từ lần sync gần nhất.

Nên bấm **Cập nhật dữ liệu** đều đặn (khuyến nghị: mỗi ngày, hoặc đầu ca làm việc) - trang `/trends` (view velocity, so sánh tuần) chỉ có số liệu ý nghĩa khi đã sync ít nhất 2 lần vào 2 ngày khác nhau. Vì token JWT hết hạn theo phiên đăng nhập cá nhân, việc này hiện chưa tự động hoá được bằng cron - cần một người bấm tay mỗi ngày (hoặc tự thêm Vercel Cron gọi `/api/sync` kèm 1 token dịch vụ nếu VC API hỗ trợ service account).

### Toggle "Realtime"

Mỗi trang dữ liệu (Dashboard/Creators/Campaigns) có checkbox **Realtime** cạnh bộ chọn ngày:

- **Tắt (mặc định)**: đọc từ Supabase - nhanh, không cần token, nhưng số liệu chỉ mới bằng lần sync gần nhất.
- **Bật**: gọi thẳng VC API thật qua proxy nội bộ (cần token hợp lệ) - dùng khi cần soi số **mới nhất trong ngày**, chưa kịp sync.

Lựa chọn được lưu ở `localStorage` (`vc-data-source`), áp dụng cho cả 3 trang.

## Deploy lên Vercel

```bash
npm i -g vercel   # nếu chưa có CLI
vercel login
vercel            # lần đầu: liên kết project, chọn scope/tên
vercel --prod     # deploy production
```

Sau lần deploy đầu, vào **Project Settings → Environment Variables** trên Vercel dashboard (hoặc `vercel env add DASHBOARD_PASSWORD production`) để set `DASHBOARD_PASSWORD`, rồi `vercel --prod` lại để áp dụng.

## Quy trình dùng hằng ngày

1. Đăng nhập `admin.gen-green.global` như bình thường.
2. Mở DevTools (F12) → tab **Application** → **Local Storage** → chọn domain `admin.gen-green.global` → copy giá trị key `access-token`.
3. Mở dashboard này → nếu chưa đăng nhập, nhập `DASHBOARD_PASSWORD`.
4. Bấm nút **Token API** ở góc phải header → dán JWT vừa copy vào ô textarea → **Lưu token**.
5. Chọn khoảng ngày cần xem (preset Hôm nay/Hôm qua/7 ngày/30 ngày hoặc tự chọn) → dashboard tự tải dữ liệu.
6. Khi thấy banner đỏ báo token hết hạn/thiếu (lỗi 401), lặp lại bước 1–4 để lấy token mới.

Token JWT thường có hạn dùng ngắn — nên lặp lại quy trình lấy token mỗi khi dashboard báo hết hạn, hoặc đầu mỗi ca làm việc.
