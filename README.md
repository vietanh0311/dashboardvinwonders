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

Token gọi VC API (JWT) **không** cấu hình qua env — mỗi người dùng tự dán token cá nhân vào ô "Token API" trên dashboard, token lưu ở `localStorage` của trình duyệt (key `vc-token`), không gửi lên server ngoài proxy nội bộ.

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
