"use client";

import { useRouter } from "next/navigation";
import type { MissionRow } from "@/lib/missionRecords";
import MissionList from "@/components/MissionList";
import PlanNav from "@/components/PlanNav";
import styles from "./status.module.css";

// The Mission list as its own tab.
//
// It is the same component the Plan tab renders, from the same store read, so
// the two can never disagree again: the screen that failed was two renderings
// of three joined files, and a Dispatched Mission appeared on each of them
// under a different name and state (ADR 0021). Merging the two tabs into one
// screen is #151, not this.
//
// Editing hands the Mission to the planner and moves there. It carries the
// Mission's id and Name as well as its Spec, because a Mission is the thing
// being edited -- the Spec alone was what let a Dispatched Mission come back
// as an unrelated draft.
export const EDIT_HANDOFF_KEY = "drone-planner.edit-mission";

export default function MissionStatusPage() {
  const router = useRouter();

  function editInPlanner(row: MissionRow) {
    try {
      localStorage.setItem(
        EDIT_HANDOFF_KEY,
        JSON.stringify({ spec: row.spec, id: row.id, name: row.name }),
      );
    } catch {
      // No storage: the planner still opens, just without the Mission.
    }
    router.push("/plan");
  }

  return (
    <div className={styles.page}>
      <PlanNav />
      <div className={styles.body}>
        <MissionList onEdit={editInPlanner} />
      </div>
    </div>
  );
}
