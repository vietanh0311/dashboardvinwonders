#!/bin/bash
# Điền VC_STAFF_PASSWORD vào .env.local mà không phải mở editor, rồi kiểm tra
# đăng nhập luôn.
#
# Dùng: bash scripts/set-vc-password.sh
#
# Mật khẩu được nhập ở chế độ ẩn (không hiện trên màn hình), truyền cho node
# qua biến môi trường chứ không qua tham số dòng lệnh - nên không lọt vào
# `ps` hay lịch sử shell.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"

cd "$PROJECT_DIR" || exit 1

if [ ! -f "$ENV_FILE" ]; then
  echo "Không thấy $ENV_FILE - tạo mới từ .env.local.example trước đã."
  exit 1
fi

echo "Điền mật khẩu VC cho tài khoản dùng để cào dữ liệu."
echo "(gõ/dán xong bấm Enter - màn hình sẽ không hiện gì, đó là bình thường)"
echo

printf "Mật khẩu VC: "
read -rs VC_PW
echo

if [ -z "$VC_PW" ]; then
  echo "✗ Mật khẩu rỗng - không thay đổi gì."
  exit 1
fi

# Dùng node để ghi file: xử lý được mọi ký tự đặc biệt trong mật khẩu, thứ mà
# sed/awk rất dễ làm hỏng (dấu &, |, /, nháy...).
VC_PW="$VC_PW" ENV_FILE="$ENV_FILE" node -e '
const fs = require("fs");
const file = process.env.ENV_FILE;
const pw = process.env.VC_PW;
const line = `VC_STAFF_PASSWORD=${pw}`;
let text = fs.readFileSync(file, "utf8");

if (/^VC_STAFF_PASSWORD=.*$/m.test(text)) {
  // Dùng HÀM thay thế, không dùng chuỗi: trong chuỗi thay thế thì $&, $`, $"
  // là ký hiệu đặc biệt, nên mật khẩu chứa $ sẽ bị ghi sai một cách âm thầm.
  text = text.replace(/^VC_STAFF_PASSWORD=.*$/m, () => line);
} else {
  if (!text.endsWith("\n")) text += "\n";
  text += line + "\n";
}
fs.writeFileSync(file, text);
' || {
  echo "✗ Ghi file thất bại."
  unset VC_PW
  exit 1
}

unset VC_PW
chmod 600 "$ENV_FILE" 2>/dev/null

echo "✓ Đã lưu vào .env.local (file này đã được .gitignore, không lên git)."
echo

echo "Đang kiểm tra đăng nhập - nhớ BẬT VPN..."
echo
npm run --silent verify-login
