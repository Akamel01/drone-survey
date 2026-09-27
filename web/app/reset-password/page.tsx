import ResetPassword from "@/components/ResetPassword";

export const dynamic = "force-dynamic";

/** Where the reset link lands (#247): Better Auth checks the link and sends
 *  the browser here with ?token=…, or with ?error=INVALID_TOKEN. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <ResetPassword token={token ?? null} linkError={error ?? null} />;
}
