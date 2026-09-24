import { redirect } from "next/navigation";

// Mission status was its own tab until the planner became one screen (#151).
// Kept as an address so a bookmark still lands somewhere useful.
export default function MissionStatus() {
  redirect("/plan");
}
