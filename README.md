# VCreators Dashboard

Dashboard theo dõi video/creator từ VC Creator Admin API, mặc định lọc partner VinWonders.

5 trang theo mô hình phễu, cùng đọc 1 nguồn dữ liệu (Supabase, xem kiến trúc bên dưới), chỉ khác cách tổng hợp:

| Trang | Route | Trả lời câu hỏi |
| --- | --- | --- |
| Dashboard | `/` | Tuần này thế nào? (KPI, xu hướng, so sánh tuần) |
| Content | `/campaigns` | View đến từ đâu, tối ưu sản xuất gì? (nguồn, campaign, tag, giờ đăng) |
| Creators | `/creators` | Ai tạo ra giá trị, nên tập trung/tuyển ai? |
| Signals | `/trends` | Cái gì đang tăng tốc thật, cái gì bất thường? (chỉ trang này đọc lịch sử snapshot) |
| Cần xử lý | `/actions` | Việc gì cần làm hôm nay? (gộp cảnh báo từ mọi trang) |

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
3. Chạy tiếp từng file `supabase-migration-*.sql` ở thư mục gốc repo (mỗi file 1 lần, theo bất kỳ thứ tự nào - đều idempotent nên chạy lại vẫn an toàn). File mới nhất, [`supabase-migration-anomaly.sql`](./supabase-migration-anomaly.sql), thêm function chấm điểm video/creator nghi mua view cho trang Signals - xem comment đầu file để biết chi tiết 5 chỉ số + ngưỡng.
4. Vào **Project Settings → API** → copy **Project URL** và **`service_role` secret key** (không phải `anon` key).
5. Dán vào `.env.local` (local) hoặc Environment Variables trên Vercel (production):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   ```
6. Chạy lại `npm run dev` (hoặc redeploy) để áp dụng.

### Cập nhật dữ liệu

Dashboard chỉ ĐỌC Supabase, không có nút đồng bộ thủ công từ trình duyệt - toàn bộ dữ liệu đến từ `scripts/sync.ts` chạy ở máy local (xem mục "Tự động cào dữ liệu hàng ngày" ở trên). Mỗi trang có nút **Làm mới** để tải lại dữ liệu mới nhất đang có trong Supabase (không tự chạy sync mới, chỉ đọc lại) - hữu ích ngay sau khi biết sync vừa chạy xong.

Header mọi trang hiện dòng **"Dữ liệu cập nhật lúc: ..."** lấy từ lần sync gần nhất. Trang Signals (view velocity, so sánh tuần, cảnh báo bất thường) chỉ có số liệu ý nghĩa khi đã sync ít nhất 2 lần vào 2 ngày khác nhau, và baseline cảnh báo bất thường cần khoảng ~7 ngày sync liên tục để đáng tin.

## Deploy lên Vercel

```bash
npm i -g vercel   # nếu chưa có CLI
vercel login
vercel            # lần đầu: liên kết project, chọn scope/tên
vercel --prod     # deploy production
```

Sau lần deploy đầu, vào **Project Settings → Environment Variables** trên Vercel dashboard (hoặc `vercel env add DASHBOARD_PASSWORD production`) để set `DASHBOARD_PASSWORD`, rồi `vercel --prod` lại để áp dụng.

## Quy trình dùng hằng ngày

Người XEM dashboard không cần token hay VPN gì cả - chỉ cần:

1. Mở dashboard → nếu chưa đăng nhập, nhập `DASHBOARD_PASSWORD`.
2. Nhìn dòng "Dữ liệu cập nhật lúc: ..." ở header - nếu quá cũ (quá 1 ngày), báo cho người phụ trách sync (xem mục "Tự động cào dữ liệu hàng ngày" ở trên - cần máy local đang bật VPN).
3. Chọn khoảng ngày cần xem (preset Hôm nay/Hôm qua/7 ngày/30 ngày hoặc tự chọn) → dashboard tự tải dữ liệu từ Supabase.
4. Bấm **Làm mới** ở trang bất kỳ nếu vừa biết sync mới chạy xong và muốn thấy số liệu mới ngay.

Việc lấy token/bật VPN chỉ liên quan đến người CHẠY sync (`npm run sync`, hoặc launchd tự động) - xem `VC_STAFF_EMAIL`/`VC_STAFF_PASSWORD` ở mục Biến môi trường, không phải việc của người xem dashboard.

## Nhân bản cho advertiser khác

Dashboard này gắn cứng với 1 advertiser (VinWonders) trên nền tảng VC Creator Admin API. Để dùng cho advertiser khác trên CÙNG nền tảng - kiến trúc sync/Supabase/proxy giữ nguyên, không cần đổi gì (xem "Kiến trúc: ai gọi VC API?" ở trên) - cần đổi đúng 5 chỗ sau:

1. **Partner ID** - hằng số `VINWONDERS_PARTNER_ID` trong [`lib/api.ts`](./lib/api.ts) (dùng làm mặc định lọc partner ở `fetchContentsRange`/`fetchContentsSmart`, và ở [`lib/vcServer.ts`](./lib/vcServer.ts) khi sync cào toàn bộ creator). Lấy ID mới bằng cách đăng nhập `admin.gen-green.global` với tài khoản advertiser mới rồi soi network tab, hoặc hỏi bên vận hành nền tảng.
2. **Thể lệ campaign** - [`lib/campaignRules.ts`](./lib/campaignRules.ts) phải viết lại HOÀN TOÀN: đơn giá/cap/thời gian trong `CAMPAIGN_RULES`, và các ngưỡng tương tác/comment tối thiểu ở đầu file, đều là số cụ thể đọc từ thể lệ VinWonders - không dùng chung được cho advertiser khác. Không đổi thì các insight/cảnh báo cap/countdown sẽ tính sai hoặc im lặng (không throw, nhưng cũng không cảnh báo đúng).
3. **Branding hiển thị** - chuỗi `"- VinWonders"` trong tiêu đề `<h1>` của 5 trang (`app/page.tsx`, `app/creators/page.tsx`, `app/campaigns/page.tsx`, `app/trends/page.tsx`, `app/actions/page.tsx`) và `app/login/page.tsx`, cùng dòng mô tả đầu README này.
4. **Supabase project riêng** - tạo project Supabase MỚI (không dùng chung với VinWonders) rồi làm lại từ đầu mục "Thiết lập Supabase" ở trên. Schema hiện không có cột `partner_id` để phân biệt nhiều advertiser trong cùng 1 bảng `videos`/`creators`, nên 2 advertiser bắt buộc phải 2 project Supabase riêng.
5. **Tài khoản sync riêng** - `VC_STAFF_EMAIL`/`VC_STAFF_PASSWORD` phải là tài khoản `isRoot: true` trên đúng partner mới (xem mục Biến môi trường ở trên).

Những phần GIỮ NGUYÊN, không cần đổi: toàn bộ cơ chế sync (`scripts/sync.ts`, `daily-sync.sh`, launchd), schema Supabase (`supabase-schema.sql` + các `supabase-migration-*.sql`), proxy VC API (`app/api/vc/[...path]/route.ts`), và kiến trúc 5 trang theo mô hình phễu.
