// Cache LRU nhỏ, dùng chung cho các route /api/data/** đọc dữ liệu sync từ
// Supabase (chỉ đổi khi bấm sync, ~1 lần/ngày) - key nên gồm cả syncedAt để tự
// invalidate mỗi khi có sync mới, không bao giờ dính dữ liệu cũ. Cache theo
// process nên chỉ có tác dụng khi request sau lặp lại trúng cùng 1 server
// instance - xem giải thích đầy đủ ở app/api/data/contents/route.ts (route đầu
// tiên dùng pattern này).
export function createLruCache<T>(maxEntries: number) {
  const cache = new Map<string, T>();

  return {
    get(key: string): T | undefined {
      const hit = cache.get(key);
      if (hit !== undefined) {
        // refresh vị trí LRU
        cache.delete(key);
        cache.set(key, hit);
      }
      return hit;
    },
    set(key: string, value: T) {
      cache.set(key, value);
      while (cache.size > maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    },
  };
}
