// Thể lệ chương trình VinWonders (đọc từ creator.gen-green.global/vinwonders/*/the-le,
// đối chiếu lần gần nhất: 15/07/2026) - dùng để tính các insight bám sát quy tắc thật thay vì
// chỉ số liệu thống kê chung chung.
//
// QUAN TRỌNG - thể lệ có thể đổi bất kỳ lúc nào: BTC có quyền cập nhật đơn giá/cap/thời gian
// giữa chừng chiến dịch (đã thấy thực tế: thể lệ "quaychupthaga1" có mục "Bổ sung mới điều
// khoản nội dung 26/5"), gia hạn thời gian, hoặc launch campaign mới không nằm trong danh sách
// dưới đây. CAMPAIGN_RULES là bản chụp tại thời điểm đối chiếu ở trên, KHÔNG tự cập nhật -
// cần định kỳ mở lại link thể lệ gốc và sửa tay khi:
//   - computeCampaignTimelines() báo `possiblyExtended: true` (còn video mới sau endDate đã cấu
//     hình - dấu hiệu rõ nhất là chương trình đã gia hạn).
//   - Có campaign mới trong `event.name` mà matchCampaignRule() không nhận diện được (insight
//     cap/countdown sẽ tự im lặng cho campaign đó, không throw, nhưng cũng không cảnh báo gì).
//   - Đến gần/qua endDate của 1 rule mà chưa xác nhận chiến dịch có gia hạn hay không.
//
// Các insight dùng file này (cap đối soát, countdown) CHỈ mang tính tham khảo/nhắc nhở - KHÔNG
// được dùng để cắt/điều chỉnh số liệu views/CPV/... hiển thị ở nơi khác trên dashboard. Cap
// views/video chỉ ảnh hưởng khi BTC đối soát trả thưởng cho creator, không có nghĩa là view
// "không tồn tại" - dashboard vẫn phải hiển thị đúng số liệu gốc mọi lúc.
//
// Lưu ý riêng về matching: `event.name` là chuỗi tự do do người tạo campaign trên VC Creator
// Admin API gõ vào - không có enum/ID cố định để map chắc chắn. matchCampaignRule() chỉ so khớp
// từ khoá (đã bỏ dấu, viết thường) nên nếu ai đó đổi cách đặt tên campaign, rule sẽ không khớp
// được nữa và các insight liên quan tự động im lặng (không throw) - chấp nhận đánh đổi này.

// ---------------------------------------------------------------------------
// Ngưỡng tương tác/comment áp dụng chung cho MỌI campaign dạng video (giống hệt nhau ở cả 5
// thể lệ dạng video đã đọc: 10Đ/0.5Đ Đất Nước Thiên Hùng Ca, FAM Trip Nha Trang, Wonder Summer
// 10đ/0.5đ) - video dưới ngưỡng có nguy cơ bị BTC từ chối/không tính thưởng.
// ---------------------------------------------------------------------------

// "Tỷ lệ tương tác / Tổng view của video phải từ trên 0.5% trở lên (like + comment)."
export const VIDEO_ENGAGEMENT_MIN_RATE = 0.005;

// "Tỉ lệ comment/view: 10,000-dưới 1,000,000 view -> từ 0,02%; từ 1,000,000 view -> từ 0,01%."
export const VIDEO_COMMENT_RATIO_TIERS = [
  { minViews: 10_000, maxViews: 1_000_000, minRatio: 0.0002 },
  { minViews: 1_000_000, maxViews: Infinity, minRatio: 0.0001 },
] as const;

// Ngưỡng views tối thiểu để bắt đầu áp dụng check tương tác/comment - tránh báo động giả trên
// video vài chục view (tỉ lệ dao động cực mạnh, không có ý nghĩa thống kê).
export const ENGAGEMENT_CHECK_MIN_VIEWS = 10_000;

// Threads: "đạt tối thiểu 1.000 lượt xem trong vòng 05 ngày"; bài dạng thảo luận cần thêm
// "tối thiểu 10 bình luận hợp lệ và tỉ lệ bình luận hợp lệ tối thiểu bằng 0,1% tổng lượt xem."
export const THREADS_MIN_VIEWS = 1_000;
export const THREADS_DISCUSSION_MIN_COMMENT_RATIO = 0.001;

// ---------------------------------------------------------------------------
// Cấu hình từng chương trình cụ thể (đơn giá, cap đối soát/video hoặc /kỳ, thời gian).
// ---------------------------------------------------------------------------

export type CampaignRuleUnit = "view" | "post";

export type CampaignRule = {
  id: string;
  label: string;
  // Tất cả từ khoá trong matchKeywords phải xuất hiện trong event.name (đã chuẩn hoá) thì mới
  // khớp; nếu có excludeKeywords mà 1 trong số đó xuất hiện thì loại (dùng để tách các biến thể
  // cùng gốc tên, vd "10Đ" vs "0.5Đ" vs "Thread" của cùng 1 chiến dịch).
  matchKeywords: string[];
  excludeKeywords?: string[];
  unit: CampaignRuleUnit;
  payRate: number; // VNĐ/view hoặc VNĐ/bài tuỳ unit
  viewCapPerVideo?: number; // chỉ áp dụng khi unit === "view"
  postsCapPerCycle?: number; // chỉ áp dụng khi unit === "post"
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
};

export const CAMPAIGN_RULES: CampaignRule[] = [
  {
    id: "dnthc-thread",
    label: "[Threads] Đất Nước Thiên Hùng Ca",
    matchKeywords: ["thien hung ca", "thread"],
    unit: "post",
    payRate: 150_000,
    postsCapPerCycle: 30,
    startDate: "2026-06-25",
    endDate: "2026-07-31",
  },
  {
    id: "dnthc-10d",
    label: "[10Đ] Đất Nước Thiên Hùng Ca",
    matchKeywords: ["thien hung ca", "10"],
    excludeKeywords: ["thread", "0.5", "0,5"],
    unit: "view",
    payRate: 10,
    viewCapPerVideo: 500_000,
    startDate: "2026-06-25",
    endDate: "2026-07-31",
  },
  {
    id: "dnthc-05d",
    label: "[0.5Đ] Đất Nước Thiên Hùng Ca",
    matchKeywords: ["thien hung ca"],
    excludeKeywords: ["thread"],
    // riêng biến thể 0.5đ cần match rõ "0.5"/"0,5" (không dùng chung excludeKeywords "10" vì
    // "10" gần như luôn xuất hiện đâu đó trong tên dài) - check thêm ở matchCampaignRule().
    unit: "view",
    payRate: 0.5,
    viewCapPerVideo: 2_000_000,
    startDate: "2026-06-25",
    endDate: "2026-07-31",
  },
  {
    id: "famtrip-nha-trang",
    label: "Green Creator FAM Trip Nha Trang",
    matchKeywords: ["fam trip", "nha trang"],
    unit: "view",
    payRate: 15,
    // Chỉ gắn cap của nhóm nội dung chính (trải nghiệm) - nhóm "viral ngắn" có cap thấp hơn
    // (50k) nhưng dữ liệu hiện không phân biệt được 2 nhóm nội dung, nên dùng cap cao hơn để
    // tránh flag oan video hợp lệ (đánh đổi: có thể bỏ sót vài video nhóm viral ngắn vượt cap).
    viewCapPerVideo: 500_000,
    startDate: "2026-06-15",
    endDate: "2026-07-31",
  },
  {
    id: "wonder-summer-thread",
    label: "Wonder Summer - Viral Threads",
    matchKeywords: ["thread"],
    unit: "post",
    payRate: 150_000,
    postsCapPerCycle: 30,
    startDate: "2026-04-13",
    endDate: "2026-08-31",
  },
  {
    id: "wonder-summer-10d",
    label: "Wonder Summer - Ngày vui bất ngờ (10đ)",
    matchKeywords: ["ngay vui bat ngo"],
    unit: "view",
    payRate: 10,
    viewCapPerVideo: 500_000,
    startDate: "2026-04-13",
    endDate: "2026-08-31",
  },
  {
    id: "wonder-summer-05d",
    label: "Wonder Summer - Quay chụp thả ga (0.5đ)",
    matchKeywords: ["quay chup tha ga"],
    unit: "view",
    payRate: 0.5,
    viewCapPerVideo: 1_000_000,
    startDate: "2026-04-13",
    endDate: "2026-08-31",
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

// So khớp event.name với 1 trong 7 thể lệ đã cấu hình ở trên. Trả về null nếu không khớp
// (campaign không nằm trong danh sách đã biết, hoặc tên đã đổi khác đi) - các hàm gọi
// matchCampaignRule() phải xử lý null gracefully, không throw.
export function matchCampaignRule(eventName: string | null | undefined): CampaignRule | null {
  if (!eventName) return null;
  const norm = normalize(eventName);

  for (const rule of CAMPAIGN_RULES) {
    const hasAllKeywords = rule.matchKeywords.every((kw) => norm.includes(normalize(kw)));
    if (!hasAllKeywords) continue;

    const hasExcluded = (rule.excludeKeywords ?? []).some((kw) => norm.includes(normalize(kw)));
    if (hasExcluded) continue;

    // dnthc-05d cần match rõ "0.5"/"0,5" trong tên (không đưa vào matchKeywords chung vì dấu
    // chấm/phẩy dễ lệch khi chuẩn hoá) - kiểm tra thủ công cho riêng rule này.
    if (rule.id === "dnthc-05d" && !/0[.,]5/.test(norm)) continue;

    return rule;
  }

  return null;
}
