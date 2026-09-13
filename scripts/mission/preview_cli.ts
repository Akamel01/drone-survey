// Runs the planner's own preview maths from the command line, so the end-to-end
// test can compare what the operator was shown on the map with what the writer
// actually put in the KMZ. Node strips the types; there is no build step.
//
//   node scripts/mission/preview_cli.ts spec.json
import { readFileSync } from "node:fs";
import { preview, areaHectares } from "../../web/lib/mission.ts";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
process.stdout.write(JSON.stringify({ ...preview(spec), area_ha: areaHectares(spec.aoi) }));
