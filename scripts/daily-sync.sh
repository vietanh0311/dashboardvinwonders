#!/bin/bash
# Cào dữ liệu VC -> Supabase, chạy tự động 1 lần/ngày trên máy local.
#
# CÁCH HOẠT ĐỘNG: launchd gọi script này mỗi 30 phút. Script tự quyết định có
# chạy hay không:
#   - Hôm nay đã cào thành công rồi  -> thoát ngay, không làm gì.
#   - Chưa cào + VPN đang tắt        -> thoát im lặng, 30 phút sau thử lại.
#   - Chưa cào + VPN đang bật        -> cào đầy đủ, rồi đánh dấu đã xong hôm nay.
#
# Nhờ vậy không cần hẹn giờ cứng: hôm nào bật VPN lúc nào thì nó cào lúc đó,
# và chỉ cào đúng 1 lần/ngày. Máy tắt/ngủ cả ngày thì hôm đó bỏ qua, hôm sau
# bật VPN nó cào tiếp - dashboard vẫn sống, chỉ là dữ liệu cũ thêm 1 ngày.
#
# Cài đặt: xem README mục "Tự động cào dữ liệu hàng ngày".

set -uo pipefail

PROJECT_DIR="/Users/VietAnh/vcd-clean"
NODE_BIN_DIR="/Users/VietAnh/.nvm/versions/node/v24.18.0/bin"

# Số ngày cào mỗi lần, và có tải lại profile creator cũ hay không.
# --refresh-creators làm chậm hẳn (gọi lại API cho TỪNG creator trong cửa sổ
# ngày) nhưng đảm bảo SĐT/hợp đồng/banned/thống kê tiền luôn mới. Bỏ flag này
# đi nếu muốn chạy nhanh - khi đó chỉ creator MỚI được tải profile.
SYNC_DAYS=90
REFRESH_CREATORS=--refresh-creators

STATE_FILE="$PROJECT_DIR/.sync-state"
LOG_FILE="$PROJECT_DIR/sync.log"
LOCK_DIR="$PROJECT_DIR/.sync-lock"

# launchd chạy với PATH tối thiểu, không có nvm -> phải chỉ đường dẫn node.
export PATH="$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR" || exit 1

# Ngày theo giờ máy (máy đang ở GMT+7, trùng giờ VN mà sync dùng).
TODAY=$(date +%F)

if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE" 2>/dev/null)" = "$TODAY" ]; then
  exit 0 # hôm nay cào rồi
fi

log() {
  echo "[$(date '+%F %H:%M:%S')] $1" >>"$LOG_FILE"
}

# KHOÁ: một lượt cào 90 ngày + refresh-creators mất hơn 10 phút, mà launchd gọi
# script mỗi 30 phút và Việt Anh có thể chạy tay bất cứ lúc nào. Không khoá thì
# nhiều lượt sync chạy chồng lên nhau - đan log vào nhau, bắn API gấp đôi và
# cùng ghi Supabase. Đây là bug đã xảy ra thật, không phải phòng xa.
#
# Dùng mkdir làm khoá vì nó atomic trên mọi filesystem (macOS không có flock).
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0 # đang có lượt sync chạy - im lặng nhường
  fi
  # Khoá mồ côi (máy sập/kill giữa chừng) - thu hồi rồi chạy tiếp.
  log "Phát hiện khoá mồ côi (PID ${LOCK_PID:-?} không còn) - thu hồi."
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi
echo $$ >"$LOCK_DIR/pid"

# Luôn nhả khoá, kể cả khi lỗi hay bị Ctrl-C.
trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM

log "Bắt đầu cào ${SYNC_DAYS} ngày ${REFRESH_CREATORS}..."

# Chạy sync. Nếu VPN tắt, lib/vcAuth.ts sẽ báo lỗi đăng nhập và thoát code 1.
if npm run --silent sync -- "$SYNC_DAYS" $REFRESH_CREATORS >>"$LOG_FILE" 2>&1; then
  echo "$TODAY" >"$STATE_FILE"
  log "XONG - đã đánh dấu hoàn thành cho $TODAY."
else
  # Không đánh dấu -> 30 phút nữa launchd gọi lại, sẽ tự thử lại.
  # KHÔNG đoán nguyên nhân: lỗi thật có thể là VPN tắt, sai mật khẩu, tài khoản
  # thiếu quyền, hay API lỗi - sync đã in lý do cụ thể ngay phía trên trong log
  # này rồi. Đoán bừa "VPN tắt" chỉ khiến người đọc log đi sai hướng.
  log "THẤT BẠI - lý do cụ thể ở ngay phía trên. Sẽ tự thử lại sau 30 phút."
fi

# Giữ log gọn: chỉ giữ 2000 dòng cuối.
if [ -f "$LOG_FILE" ]; then
  tail -n 2000 "$LOG_FILE" >"$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
