import HomeScreen from "@/components/HomeScreen";
import { getAccount } from "@/lib/accountAccess";
import { accountEnv, supabaseOAuthEnabled } from "@/lib/accountEnv";
import { emailSignInEnabled } from "@/lib/accountMail";
import { homeState } from "@/lib/home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = accountEnv().missing.length === 0;
  const account = configured ? await getAccount() : null;
  const supabaseOnly = supabaseOAuthEnabled();
  return (
    <HomeScreen
      state={homeState({ configured, account })}
      emailEnabled={configured && emailSignInEnabled() && !supabaseOnly}
      email={account?.email}
      name={account?.name}
      supabaseOnly={supabaseOnly}
    />
  );
}
