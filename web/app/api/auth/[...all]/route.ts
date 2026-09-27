// Better Auth's endpoints under /api/auth/* (D6). The env gate and the lazy
// instance live in the helper, so each method is one delegation.
import { accountAuthHandler } from "@/lib/accountAccess";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return accountAuthHandler(request);
}

export async function POST(request: Request) {
  return accountAuthHandler(request);
}
