#!/usr/bin/env python3
"""Per-stage table from odm-stage-profile.sh output. Issue #40.

Usage: odm-stage-metrics.py <results/recon-NAME dir>  -> writes metrics.json, prints table
Stage wall time = first sample of a stage to first sample of the next stage, summed
over repeats (split-merge runs every stage once per submodel).
"""
import csv, json, re, sys, os

UNITS = {"B": 1, "KiB": 2**10, "MiB": 2**20, "GiB": 2**30, "kB": 1e3, "MB": 1e6, "GB": 1e9}


def docker_bytes(s):
    m = re.match(r"([\d.]+)\s*([A-Za-z]+)", s or "")
    return float(m.group(1)) * UNITS[m.group(2)] if m else None


def main(d):
    rows = list(csv.DictReader(open(os.path.join(d, "samples.csv"))))
    run = dict(kv.split("=", 1) for kv in open(os.path.join(d, "run.txt")).read().split() if "=" in kv)
    end = float(run["end"])
    disk0 = int(rows[0]["disk_used_bytes"])
    # consecutive runs of the same stage tag; split-merge repeats stage names per submodel
    segs = []
    for r in rows:
        if not segs or segs[-1][0] != r["stage"]:
            segs.append((r["stage"], []))
        segs[-1][1].append(r)
    wall = {}
    for i, (s, rs) in enumerate(segs):
        t_end = float(segs[i + 1][1][0]["epoch"]) if i + 1 < len(segs) else end
        wall[s] = wall.get(s, 0) + t_end - float(rs[0]["epoch"])
    order, stages = [], {}
    for s, rs in segs:
        if s not in stages:
            order.append(s)
            stages[s] = []
        stages[s] += rs
    gib = lambda b: round(b / 2**30, 2)
    out = []
    for s in order:
        rs = stages[s]
        mem = [int(r["mem_cgroup_bytes"]) for r in rs if r["mem_cgroup_bytes"]]
        dmem = [docker_bytes(r["mem_docker"]) for r in rs if docker_bytes(r["mem_docker"])]
        cpu = [float(r["cpu_container_pct"].rstrip("%")) for r in rs if r["cpu_container_pct"]]
        out.append({
            "stage": s,
            "segments": sum(1 for x, _ in segs if x == s),
            "samples": len(rs),
            "wall_s": round(wall[s]),
            "peak_ram_gib_cgroup": gib(max(mem)) if mem else None,
            "peak_ram_gib_docker_stats": gib(max(dmem)) if dmem else None,
            "peak_gpu_mem_mib": max(int(r["gpu_mem_used_mib"]) for r in rs),
            "max_gpu_util_pct": max(int(r["gpu_util_pct"]) for r in rs),
            "mean_container_cpu_pct": round(sum(cpu) / len(cpu)) if cpu else None,
            "mean_host_cpu_pct": round(sum(float(r["host_cpu_pct"]) for r in rs) / len(rs), 1),
            "peak_project_gib": gib(max(int(r["project_bytes"] or 0) for r in rs)),
            "peak_host_disk_delta_gib": gib(max(int(r["disk_used_bytes"]) for r in rs) - disk0),
        })
    total = {
        "wall_s": round(end - float(run["start"])),
        "exit_code": int(run["exit_code"]),
        "oom_killed": run["oom_killed"] == "true",
        "peak_ram_gib_cgroup": max(x["peak_ram_gib_cgroup"] or 0 for x in out),
        "peak_ram_gib_docker_stats": max(x["peak_ram_gib_docker_stats"] or 0 for x in out),
        "peak_gpu_mem_mib": max(x["peak_gpu_mem_mib"] for x in out),
        "peak_project_gib": max(x["peak_project_gib"] for x in out),
    }
    old = {}
    p = os.path.join(d, "metrics.json")
    if os.path.exists(p):
        old = json.load(open(p))
    old.update({"stages": out, "total": total})
    json.dump(old, open(p, "w"), indent=1)
    print(f"{'stage':20} {'wall_s':>6} {'RAM GiB':>8} {'dstat GiB':>9} {'VRAM MiB':>8} {'CPU%':>6} {'host%':>6} {'proj GiB':>8}")
    for x in out:
        print(f"{x['stage']:20} {x['wall_s']:>6} {x['peak_ram_gib_cgroup']!s:>8} {x['peak_ram_gib_docker_stats']!s:>9} {x['peak_gpu_mem_mib']:>8} "
              f"{x['mean_container_cpu_pct']!s:>6} {x['mean_host_cpu_pct']:>6} {x['peak_project_gib']:>8}")
    print(json.dumps(total))


if __name__ == "__main__":
    main(sys.argv[1])
