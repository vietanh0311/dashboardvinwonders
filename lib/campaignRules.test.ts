import { describe, expect, test } from "vitest";
import { CAMPAIGN_RULES, matchCampaignRule } from "./campaignRules";

describe("matchCampaignRule", () => {
  test("trả về null khi không có tên sự kiện", () => {
    expect(matchCampaignRule(undefined)).toBeNull();
    expect(matchCampaignRule(null)).toBeNull();
    expect(matchCampaignRule("")).toBeNull();
  });

  test("trả về null khi tên không khớp thể lệ nào đã cấu hình", () => {
    expect(matchCampaignRule("Sự kiện chưa từng thấy trong CAMPAIGN_RULES")).toBeNull();
  });

  test("phân biệt đúng biến thể 10Đ / 0.5Đ / Thread của cùng gốc Thiên Hùng Ca", () => {
    expect(matchCampaignRule("[10Đ] Đất Nước Thiên Hùng Ca - Đợt 2")?.id).toBe("dnthc-10d");
    expect(matchCampaignRule("[0.5Đ] Đất Nước Thiên Hùng Ca")?.id).toBe("dnthc-05d");
    expect(matchCampaignRule("[Thread] Đất Nước Thiên Hùng Ca")?.id).toBe("dnthc-thread");
  });

  test("không phân biệt hoa/thường và có dấu/không dấu", () => {
    expect(matchCampaignRule("dat nuoc thien hung ca - thread")?.id).toBe("dnthc-thread");
    expect(matchCampaignRule("ĐẤT NƯỚC THIÊN HÙNG CA - THREAD")?.id).toBe("dnthc-thread");
  });

  test("khớp FAM Trip Nha Trang", () => {
    expect(matchCampaignRule("Green Creator FAM Trip Nha Trang - Tháng 7")?.id).toBe("famtrip-nha-trang");
  });

  test("mọi rule trong CAMPAIGN_RULES tự khớp được với chính từ khoá của nó", () => {
    // Bảo vệ khỏi hồi quy khi có ai đó sửa matchKeywords/excludeKeywords khiến rule không còn tự
    // nhận diện được tên của chính nó.
    for (const rule of CAMPAIGN_RULES) {
      // dnthc-05d có thêm điều kiện riêng ngoài matchKeywords: phải chứa literal "0.5"/"0,5"
      // (xem ghi chú trong matchCampaignRule()).
      const selfName =
        rule.id === "dnthc-05d" ? `${rule.matchKeywords.join(" ")} 0.5` : rule.matchKeywords.join(" ");
      expect(matchCampaignRule(selfName)?.id).toBe(rule.id);
    }
  });
});
