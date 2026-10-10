import { supabaseOAuthEnabled } from "@/lib/accountEnv";

export const dynamic = "force-dynamic";

/** Whether Sign out must continue to the Papyrus account (#341). */
export function GET() {
  return Response.json({ enabled: supabaseOAuthEnabled() });
}
