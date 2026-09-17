"use client";

import { useRouter } from "next/navigation";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import MissionStatus from "@/components/MissionStatus";
import PlanNav from "@/components/PlanNav";
import styles from "./status.module.css";

// The mission console as its own tab: every mission, actionable, identical in
// any browser. Editing a draft hands its Spec to the planner and moves there.
export const EDIT_HANDOFF_KEY = "drone-planner.edit-draft";

export default function MissionStatusPage() {
  const router = useRouter();

  function editInPlanner(spec: MissionSpec) {
    try {
      localStorage.setItem(EDIT_HANDOFF_KEY, JSON.stringify(spec));
    } catch {
      // No storage: the planner still opens, just without the draft.
    }
    router.push("/plan");
  }

  return (
    <div className={styles.page}>
      <PlanNav />
      <div className={styles.body}>
        <MissionStatus spec={DEFAULT_SPEC} onLoadMission={editInPlanner} allowSave={false} />
      </div>
    </div>
  );
}
