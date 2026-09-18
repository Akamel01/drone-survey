"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./PlanNav.module.css";

// The planner's two tabs: the map and the mission console. Real routes, not
// client state, so each is linkable and the deployment has one URL for both.
export default function PlanNav() {
  const pathname = usePathname();
  const onStatus = pathname === "/plan/mission_status";
  return (
    <nav className={styles.nav}>
      <Link href="/plan" className={onStatus ? "" : styles.active}>
        Plan
      </Link>
      <Link href="/plan/mission_status" className={onStatus ? styles.active : ""}>
        Mission status
      </Link>
    </nav>
  );
}
