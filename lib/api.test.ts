import { describe, expect, test } from "vitest";
import {
  CAMPAIGN_INSIGHT_RULES,
  computeCampaignHealth,
  computeCampaignStats,
  computeCampaignWatchlist,
  filterContentItems,
  generateCampaignInsights,
  type CampaignInsightContext,
  type CampaignStat,
  type CampaignWatchlistRow,
  type ContentItem,
  type CreatorPostReward,
  type EngagementCompliance,
  type HeatmapCell,
  type TagAnalysis,
  type ViewDistribution,
} from "./api";

let seq = 0;
function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  seq += 1;
  return {
    _id: `item-${seq}`,
    title: `Video ${seq}`,
    link: `https://example.com/${seq}`,
    cover: "",
    desc: "",
    status: "approved",
    source: "tiktok",
    publishedAt: "2026-07-10T03:00:00.000Z",
    createdAt: "2026-07-10T03:00:00.000Z",
    event: { _id: "evt-1", name: "Campaign mẫu" },
    partner: null,
    createdBy: { _id: "creator-1", name: "Creator mẫu" },
    warningTags: [],
    statistic: {
      view: { total: 0 },
      like: { total: 0 },
      comment: { total: 0 },
      point: { total: 0 },
      cash: { total: 0 },
    },
    ...overrides,
  };
}

const emptyViewDist: ViewDistribution = {
  median: 0,
  mean: 0,
  flopCount: 0,
  flopPct: 0,
  viralCount: 0,
  viralPct: 0,
  histogram: [],
};

const emptyCompliance: EngagementCompliance = {
  checkedCount: 0,
  atRiskCount: 0,
  atRiskPct: 0,
  atRiskItems: [],
};

const emptyCtx: CampaignInsightContext = {
  campaigns: [],
  heatmap: [],
  viewDist: emptyViewDist,
  tagAnalysis: [],
  capRisks: [],
  timelines: [],
  compliance: emptyCompliance,
  postRewards: [],
};

function ruleById(id: string) {
  const rule = CAMPAIGN_INSIGHT_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`rule not found: ${id}`);
  return rule;
}

function makeCampaignStat(overrides: Partial<CampaignStat>): CampaignStat {
  return {
    eventId: "evt",
    eventName: "Campaign",
    videos: 1,
    totalViews: 1000,
    uniqueCreators: 1,
    totalCash: 100,
    totalPoint: 0,
    cpv: 0.1,
    viewsPerCreator: 1000,
    rejectedPct: 0,
    firstPublishedAt: "",
    lastPublishedAt: "",
    ...overrides,
  };
}

describe("computeCampaignStats", () => {
  test("gộp đúng theo event, sort tăng dần theo CPV", () => {
    const items = [
      makeItem({
        event: { _id: "evtA", name: "Campaign A" },
        createdBy: { _id: "c1", name: "Creator 1" },
        status: "approved",
        statistic: {
          view: { total: 1000 },
          like: { total: 0 },
          comment: { total: 0 },
          point: { total: 0 },
          cash: { total: 500 },
        },
      }),
      makeItem({
        event: { _id: "evtA", name: "Campaign A" },
        createdBy: { _id: "c2", name: "Creator 2" },
        status: "rejected",
        statistic: {
          view: { total: 3000 },
          like: { total: 0 },
          comment: { total: 0 },
          point: { total: 0 },
          cash: { total: 1500 },
        },
      }),
      makeItem({
        event: { _id: "evtB", name: "Campaign B" },
        createdBy: { _id: "c1", name: "Creator 1" },
        status: "approved",
        statistic: {
          view: { total: 2000 },
          like: { total: 0 },
          comment: { total: 0 },
          point: { total: 0 },
          cash: { total: 200 },
        },
      }),
    ];

    const stats = computeCampaignStats(items);
    expect(stats.map((s) => s.eventId)).toEqual(["evtB", "evtA"]); // CPV thấp lên đầu

    const campaignA = stats.find((s) => s.eventId === "evtA")!;
    expect(campaignA.videos).toBe(2);
    expect(campaignA.totalViews).toBe(4000);
    expect(campaignA.totalCash).toBe(2000);
    expect(campaignA.uniqueCreators).toBe(2);
    expect(campaignA.rejectedPct).toBeCloseTo(50);
    expect(campaignA.cpv).toBeCloseTo(0.5);

    const campaignB = stats.find((s) => s.eventId === "evtB")!;
    expect(campaignB.cpv).toBeCloseTo(0.1);
    expect(campaignB.rejectedPct).toBe(0);
  });

  test("bỏ qua video không có event", () => {
    expect(computeCampaignStats([makeItem({ event: null })])).toEqual([]);
  });
});

describe("filterContentItems", () => {
  const items = [
    makeItem({
      source: "tiktok",
      event: { _id: "e1", name: "Event 1" },
      warningTags: [{ _id: "t1", name: "Tag A" }],
      createdBy: { _id: "c1", name: "C1", workplaceUnitName: "Miền Bắc" },
    }),
    makeItem({
      source: "facebook_reels",
      event: { _id: "e2", name: "Event 2" },
      warningTags: [],
      createdBy: { _id: "c2", name: "C2", workplaceUnitName: "Miền Nam" },
    }),
  ];

  test("không filter nào -> trả về nguyên danh sách", () => {
    expect(filterContentItems(items, {})).toEqual(items);
  });

  test("lọc theo source", () => {
    expect(filterContentItems(items, { source: "tiktok" })).toEqual([items[0]]);
  });

  test("lọc theo eventName", () => {
    expect(filterContentItems(items, { eventName: "Event 2" })).toEqual([items[1]]);
  });

  test("lọc theo tagName", () => {
    expect(filterContentItems(items, { tagName: "Tag A" })).toEqual([items[0]]);
  });

  test("lọc theo workplaceUnit", () => {
    expect(filterContentItems(items, { workplaceUnit: "Miền Nam" })).toEqual([items[1]]);
  });

  test("kết hợp nhiều filter (AND)", () => {
    expect(filterContentItems(items, { source: "tiktok", eventName: "Event 2" })).toEqual([]);
    expect(filterContentItems(items, { source: "tiktok", eventName: "Event 1" })).toEqual([items[0]]);
  });
});

describe("computeCampaignHealth", () => {
  const baseStat = makeCampaignStat({ eventName: "Campaign A", rejectedPct: 5, cpv: 0.1 });

  const baseWatch: CampaignWatchlistRow = {
    eventName: "Campaign A",
    label: "Campaign A",
    endDate: "2026-08-01",
    daysRemaining: 30,
    isEnded: false,
    possiblyExtended: false,
    viewCapPerVideo: 500_000,
    videosOverCap: 0,
    totalVideos: 10,
    viewsBeyondCap: 0,
  };

  test("stable khi không có tín hiệu rủi ro nào", () => {
    const map = new Map([[baseWatch.eventName, baseWatch]]);
    expect(computeCampaignHealth(baseStat, map, 0.1)).toBe("stable");
  });

  test("at_risk khi vượt cap đối soát", () => {
    const map = new Map([[baseWatch.eventName, { ...baseWatch, videosOverCap: 2 }]]);
    expect(computeCampaignHealth(baseStat, map, 0.1)).toBe("at_risk");
  });

  test("at_risk khi sắp hết hạn trong 7 ngày", () => {
    const map = new Map([[baseWatch.eventName, { ...baseWatch, daysRemaining: 3 }]]);
    expect(computeCampaignHealth(baseStat, map, 0.1)).toBe("at_risk");
  });

  test("at_risk khi rejectedPct > 20%, kể cả không có trong watchlist", () => {
    const map = new Map<string, CampaignWatchlistRow>();
    expect(computeCampaignHealth(makeCampaignStat({ rejectedPct: 25 }), map, 0.1)).toBe("at_risk");
  });

  test("watch khi có thể đã gia hạn (possiblyExtended)", () => {
    const map = new Map([[baseWatch.eventName, { ...baseWatch, possiblyExtended: true }]]);
    expect(computeCampaignHealth(baseStat, map, 0.1)).toBe("watch");
  });

  test("watch khi CPV cao hơn 1.5x campaign tốt nhất trong kỳ", () => {
    const map = new Map([[baseWatch.eventName, baseWatch]]);
    expect(computeCampaignHealth(makeCampaignStat({ eventName: "Campaign A", cpv: 0.2 }), map, 0.1)).toBe("watch");
  });

  test("campaign không nằm trong watchlist (không khớp thể lệ nào) vẫn tính được", () => {
    const map = new Map<string, CampaignWatchlistRow>();
    expect(computeCampaignHealth(baseStat, map, 0.1)).toBe("stable");
  });
});

describe("CAMPAIGN_INSIGHT_RULES", () => {
  test("rule cần hành động (priority 0-4) luôn đứng trước rule thống kê (priority 5-9)", () => {
    const actionIds = new Set([
      "cap-risk",
      "ending-soon",
      "recently-ended",
      "engagement-compliance",
      "post-reward-estimate",
    ]);
    const actionPriorities = CAMPAIGN_INSIGHT_RULES.filter((r) => actionIds.has(r.id)).map((r) => r.priority);
    const statPriorities = CAMPAIGN_INSIGHT_RULES.filter((r) => !actionIds.has(r.id)).map((r) => r.priority);
    expect(Math.max(...actionPriorities)).toBeLessThan(Math.min(...statPriorities));
  });

  test("post-reward-estimate: im lặng khi không có campaign trả theo bài", () => {
    expect(ruleById("post-reward-estimate").evaluate(emptyCtx)).toBeNull();
  });

  test("post-reward-estimate: 1 dòng/campaign, gộp theo label, báo creator vượt cap", () => {
    const postRewards: CreatorPostReward[] = [
      {
        eventName: "[Thread] Đất Nước Thiên Hùng Ca",
        label: "[Thread] Đất Nước Thiên Hùng Ca",
        creatorId: "c1",
        creatorName: "Creator 1",
        totalPosts: 35,
        validPosts: 35,
        paidPosts: 30, // cap postsCapPerCycle = 30
        payRate: 150_000,
        estimatedReward: 4_500_000,
        overCap: true,
      },
      {
        eventName: "Wonder Summer - Viral Threads",
        label: "Wonder Summer - Viral Threads",
        creatorId: "c2",
        creatorName: "Creator 2",
        totalPosts: 10,
        validPosts: 10,
        paidPosts: 10,
        payRate: 150_000,
        estimatedReward: 1_500_000,
        overCap: false,
      },
    ];
    const result = ruleById("post-reward-estimate").evaluate({ ...emptyCtx, postRewards });
    expect(Array.isArray(result)).toBe(true);
    const lines = result as string[];
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes("Đất Nước Thiên Hùng Ca") && l.includes("vượt cap"))).toBe(true);
    expect(lines.some((l) => l.includes("Wonder Summer - Viral Threads") && !l.includes("vượt cap"))).toBe(true);
  });

  test("cap-risk: im lặng khi không campaign nào vượt cap", () => {
    expect(ruleById("cap-risk").evaluate(emptyCtx)).toBeNull();
  });

  test("cap-risk: báo khi có campaign vượt cap", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      capRisks: [
        {
          eventName: "Campaign A",
          label: "Campaign A",
          viewCapPerVideo: 500_000,
          videosOverCap: 3,
          totalVideos: 10,
          viewsBeyondCap: 900_000,
        },
      ],
    };
    const text = ruleById("cap-risk").evaluate(ctx);
    expect(text).toContain("Campaign A");
    expect(text).toContain("3 video");
  });

  test("ending-soon: im lặng khi campaign gần nhất còn hơn 7 ngày", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      timelines: [
        { eventName: "e", label: "Campaign X", endDate: "2026-09-01", daysRemaining: 30, isEnded: false, possiblyExtended: false },
      ],
    };
    expect(ruleById("ending-soon").evaluate(ctx)).toBeNull();
  });

  test("ending-soon: báo khi còn <=7 ngày", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      timelines: [
        { eventName: "e", label: "Campaign X", endDate: "2026-07-25", daysRemaining: 4, isEnded: false, possiblyExtended: false },
      ],
    };
    expect(ruleById("ending-soon").evaluate(ctx)).toContain("Campaign X");
  });

  test("recently-ended: báo bình thường khi vừa kết thúc, không possiblyExtended", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      timelines: [
        { eventName: "e", label: "Campaign Y", endDate: "2026-07-15", daysRemaining: -6, isEnded: true, possiblyExtended: false },
      ],
    };
    const text = ruleById("recently-ended").evaluate(ctx);
    expect(text).toContain("Campaign Y");
    expect(text).toContain("bình thường");
  });

  test("recently-ended: cảnh báo có thể đã gia hạn khi possiblyExtended", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      timelines: [
        { eventName: "e", label: "Campaign Y", endDate: "2026-07-15", daysRemaining: -6, isEnded: true, possiblyExtended: true },
      ],
    };
    expect(ruleById("recently-ended").evaluate(ctx)).toContain("gia hạn");
  });

  test("engagement-compliance: báo khi đủ ngưỡng (>=3 video, >=10%)", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      compliance: { checkedCount: 20, atRiskCount: 4, atRiskPct: 20, atRiskItems: [] },
    };
    expect(ruleById("engagement-compliance").evaluate(ctx)).toContain("4 video");
  });

  test("engagement-compliance: im lặng khi dưới ngưỡng", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      compliance: { checkedCount: 20, atRiskCount: 1, atRiskPct: 5, atRiskItems: [] },
    };
    expect(ruleById("engagement-compliance").evaluate(ctx)).toBeNull();
  });

  test("cpv-spread: im lặng khi chênh lệch dưới 1.5x", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      campaigns: [makeCampaignStat({ eventId: "a", eventName: "A", cpv: 0.1 }), makeCampaignStat({ eventId: "b", eventName: "B", cpv: 0.12, totalCash: 120 })],
    };
    expect(ruleById("cpv-spread").evaluate(ctx)).toBeNull();
  });

  test("cpv-spread: báo khi chênh lệch trên 1.5x", () => {
    const ctx: CampaignInsightContext = {
      ...emptyCtx,
      campaigns: [makeCampaignStat({ eventId: "a", eventName: "A", cpv: 0.1 }), makeCampaignStat({ eventId: "b", eventName: "B", cpv: 0.2, totalCash: 200 })],
    };
    const text = ruleById("cpv-spread").evaluate(ctx);
    expect(text).toContain("A");
    expect(text).toContain("B");
  });

  test("best-heatmap-slot: im lặng khi không có ô đủ mẫu", () => {
    expect(ruleById("best-heatmap-slot").evaluate(emptyCtx)).toBeNull();
  });

  test("best-heatmap-slot: báo khi có khung giờ vượt trội (>=1.5x trung bình)", () => {
    const heatmap: HeatmapCell[] = [{ dayOfWeek: 0, hour: 20, videos: 5, totalViews: 10000, avgViews: 2000 }];
    const ctx: CampaignInsightContext = { ...emptyCtx, heatmap, viewDist: { ...emptyViewDist, mean: 1000 } };
    expect(ruleById("best-heatmap-slot").evaluate(ctx)).toContain("20h");
  });

  test("flop-pct: im lặng khi flopPct = 0", () => {
    expect(ruleById("flop-pct").evaluate(emptyCtx)).toBeNull();
  });

  test("flop-pct: báo khi có video flop", () => {
    const ctx: CampaignInsightContext = { ...emptyCtx, viewDist: { ...emptyViewDist, flopPct: 12.5 } };
    expect(ruleById("flop-pct").evaluate(ctx)).toContain("12.5%");
  });

  test("tag-anomaly: chỉ báo tag có isAnomalous = true", () => {
    const tagAnalysis: TagAnalysis[] = [
      { name: "Bình thường", videos: 5, avgViews: 100, thisWeekVideos: 1, priorAvgWeeklyVideos: 1, isAnomalous: false },
      { name: "Bất thường", videos: 5, avgViews: 100, thisWeekVideos: 10, priorAvgWeeklyVideos: 1, isAnomalous: true },
    ];
    const text = ruleById("tag-anomaly").evaluate({ ...emptyCtx, tagAnalysis });
    expect(text).toContain("Bất thường");
    expect(text).not.toContain("Bình thường");
  });

  test("view-skew: báo khi mean lệch hơn 2x median", () => {
    const ctx: CampaignInsightContext = { ...emptyCtx, viewDist: { ...emptyViewDist, median: 100, mean: 300 } };
    expect(ruleById("view-skew").evaluate(ctx)).toContain("viral");
  });

  test("view-skew: im lặng khi không lệch nhiều", () => {
    const ctx: CampaignInsightContext = { ...emptyCtx, viewDist: { ...emptyViewDist, median: 100, mean: 150 } };
    expect(ruleById("view-skew").evaluate(ctx)).toBeNull();
  });
});

describe("generateCampaignInsights", () => {
  test("giới hạn tối đa 6 insight", () => {
    const viewDist: ViewDistribution = { median: 100, mean: 500, flopCount: 5, flopPct: 20, viralCount: 1, viralPct: 5, histogram: [] };
    const tagAnalysis: TagAnalysis[] = [
      { name: "Tag lạ", videos: 5, avgViews: 100, thisWeekVideos: 10, priorAvgWeeklyVideos: 1, isAnomalous: true },
    ];
    const campaigns: CampaignStat[] = [
      makeCampaignStat({ eventId: "a", eventName: "A", cpv: 0.1 }),
      makeCampaignStat({ eventId: "b", eventName: "B", cpv: 0.3, totalCash: 300 }),
    ];
    // items rỗng: cap-risk/timeline/compliance sẽ im lặng (cần event khớp CAMPAIGN_RULES), nhưng
    // cpv-spread/flop-pct/tag-anomaly/view-skew vẫn kích hoạt từ campaigns/viewDist/tagAnalysis
    // truyền trực tiếp - đủ để kiểm tra hành vi giới hạn của generateCampaignInsights.
    const insights = generateCampaignInsights(campaigns, [], viewDist, tagAnalysis, [], "2026-07-21");
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(6);
  });

  test("không có dữ liệu -> mảng rỗng, không throw", () => {
    expect(generateCampaignInsights([], [], emptyViewDist, [], [], "2026-07-21")).toEqual([]);
  });
});

describe("computeCampaignWatchlist", () => {
  test("gộp đúng cap-risk + timeline theo 1 thể lệ đã cấu hình (dnthc-10d, cap 500.000 views/video)", () => {
    const items: ContentItem[] = [
      makeItem({
        event: { _id: "evt-10d", name: "[10Đ] Đất Nước Thiên Hùng Ca" },
        statistic: { view: { total: 600_000 }, like: { total: 0 }, comment: { total: 0 }, point: { total: 0 }, cash: { total: 0 } },
      }),
      makeItem({
        event: { _id: "evt-10d", name: "[10Đ] Đất Nước Thiên Hùng Ca" },
        statistic: { view: { total: 100_000 }, like: { total: 0 }, comment: { total: 0 }, point: { total: 0 }, cash: { total: 0 } },
      }),
    ];

    const watchlist = computeCampaignWatchlist(items, "2026-07-21");
    const row = watchlist.find((w) => w.eventName === "[10Đ] Đất Nước Thiên Hùng Ca");
    expect(row).toBeDefined();
    expect(row?.viewCapPerVideo).toBe(500_000);
    expect(row?.videosOverCap).toBe(1);
    expect(row?.viewsBeyondCap).toBe(100_000);
    expect(row?.isEnded).toBe(false); // referenceDate 2026-07-21 < endDate 2026-07-31
  });

  test("campaign không khớp thể lệ nào -> không xuất hiện trong watchlist", () => {
    const items = [makeItem({ event: { _id: "evt-x", name: "Sự kiện không có thể lệ" } })];
    expect(computeCampaignWatchlist(items, "2026-07-21")).toEqual([]);
  });
});
