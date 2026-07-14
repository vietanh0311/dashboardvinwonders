// Supabase client dùng SERVICE ROLE KEY - CHỈ được import từ code chạy trên
// server (route handlers app/api/**/route.ts). Không import file này từ bất
// kỳ component "use client" nào, và không thêm tiền tố NEXT_PUBLIC_ cho 2 biến
// env bên dưới - service key có toàn quyền đọc/ghi DB, lộ ra client là mất an
// toàn dữ liệu creator (email, SĐT, hợp đồng...).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export class SupabaseConfigError extends Error {
  constructor() {
    super("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong biến môi trường server.");
    this.name = "SupabaseConfigError";
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new SupabaseConfigError();
  }

  if (!cachedClient) {
    cachedClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cachedClient;
}
