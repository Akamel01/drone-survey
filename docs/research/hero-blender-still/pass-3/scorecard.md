# Still scorecard — PASS3

generated 2026-09-29T16:29:30 | azimuth 0 | renders `/private/tmp/claude-501/-Users-akamel-Documents-Drone--claude-worktrees-ui-redesign-video-specs-e0a912/0c6d256f-29d9-41cd-a922-964850cabce8/scratchpad/h223/renders/p3` | measure.py sha256 `26f93fce4bb101c7ff07a1f446636d8bddf51cc36c0fed88b1766c661a495fe7`

hero s0 values: frame_s == 0 rows of measurements.csv (sha256 2df42cf8008bc3f5, the pinned measure.py's own run on the pinned masters); sheet panels are the 960-px hero panels

**Phase caveat:** exact phase is unreachable (independent generations); frame-0 azimuth residual up to ±45°

## 1. Measured, single-frame

still s0 vs hero s0 (fair comparator) vs hero mean (spec target); delta = still - comparator; 4a-4h from measure.py single-frame runs

| framing | attr | metric | unit | still s0 | hero s0 | hero mean | delta vs s0 | delta vs mean |
|---|---|---|---|---|---|---|---|---|
| tall | 4a | haze_deltaE_vs_haze_token | dE76 | 23.3046 | 22.3475 | 22.4196 | 0.957118 | 0.884955 |
| tall | 4a | haze_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.02_best_token | token | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.02_deltaE_min | dE76 | 21.8219 | 21.6886 | 21.655 | 0.133276 | 0.166864 |
| tall | 4a | sky_anchor_0.10_best_token | token | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.10_deltaE_min | dE76 | 4.72199 | 5.13855 | 6.13389 | -0.416559 | -1.4119 |
| tall | 4a | sky_anchor_0.25_best_token | token | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.25_deltaE_min | dE76 | 8.16819 | 7.88745 | 7.93992 | 0.280735 | 0.228261 |
| tall | 4a | sky_anchor_0.40_best_token | token | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.40_deltaE_min | dE76 | 3.45248 | 3.78838 | 4.10831 | -0.335903 | -0.655833 |
| tall | 4a | sky_anchor_0.55_best_token | token | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.55_deltaE_min | dE76 | 7.13275 | 7.1469 | 7.20844 | -0.0141517 | -0.0756924 |
| tall | 4a | sky_anchor_0.68_best_token | token | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_anchor_0.68_deltaE_min | dE76 | 6.44616 | 7.91543 | 7.97991 | -1.46927 | -1.53376 |
| tall | 4a | sky_deltaE_horizon_vs_haze | dE76 | 22.6992 | 21.3229 | 21.4013 | 1.37632 | 1.29798 |
| tall | 4a | sky_deltaE_horizon_vs_sky_low | dE76 | 4.8635 | 3.02427 | 3.09704 | 1.83923 | 1.76646 |
| tall | 4a | sky_deltaE_horizon_vs_sky_mid | dE76 | 18.9422 | 16.9278 | 16.9414 | 2.01436 | 2.00076 |
| tall | 4a | sky_deltaE_horizon_vs_sky_top | dE76 | 36.545 | 34.5959 | 34.6136 | 1.94903 | 1.93138 |
| tall | 4a | sky_deltaE_mid_vs_haze | dE76 | 11.8392 | 12.3733 | 12.4166 | -0.534103 | -0.577409 |
| tall | 4a | sky_deltaE_mid_vs_sky_low | dE76 | 19.5115 | 19.9255 | 19.8396 | -0.414034 | -0.328118 |
| tall | 4a | sky_deltaE_mid_vs_sky_mid | dE76 | 6.05775 | 6.54704 | 6.49184 | -0.489284 | -0.434091 |
| tall | 4a | sky_deltaE_mid_vs_sky_top | dE76 | 13.9869 | 13.8898 | 14.0079 | 0.0970907 | -0.0210656 |
| tall | 4a | sky_deltaE_top_vs_haze | dE76 | 22.1609 | 22.6089 | 22.7338 | -0.447913 | -0.572903 |
| tall | 4a | sky_deltaE_top_vs_sky_low | dE76 | 37.1138 | 37.4601 | 37.4963 | -0.346304 | -0.382515 |
| tall | 4a | sky_deltaE_top_vs_sky_mid | dE76 | 23.217 | 23.5767 | 23.622 | -0.359714 | -0.40499 |
| tall | 4a | sky_deltaE_top_vs_sky_top | dE76 | 6.90962 | 7.3881 | 7.55649 | -0.478481 | -0.646872 |
| tall | 4a | sky_hex_anchor_0.02 | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_anchor_0.10 | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_anchor_0.25 | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_anchor_0.40 | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_anchor_0.55 | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_anchor_0.68 | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_horizon | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_mid | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_hex_top | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4a | sky_r2_B | 1 | 0.994995 | 0.991584 | 0.991617 | 0.00341059 | 0.00337784 |
| tall | 4a | sky_r2_G | 1 | 0.992079 | 0.991546 | 0.991702 | 0.000532555 | 0.00037673 |
| tall | 4a | sky_r2_R | 1 | 0.97654 | 0.978797 | 0.9792 | -0.00225689 | -0.00265997 |
| tall | 4a | sky_slope_B | levels/%H | 1.40595 | 1.38461 | 1.38391 | 0.0213377 | 0.0220319 |
| tall | 4a | sky_slope_G | levels/%H | 1.65624 | 1.61529 | 1.61868 | 0.0409561 | 0.0375663 |
| tall | 4a | sky_slope_R | levels/%H | 1.97969 | 1.93138 | 1.93433 | 0.0483149 | 0.0453621 |
| tall | 4b | contrast_rms_D1 | levels | 14.4572 | 19.2152 | 10.9574 | -4.75806 | 3.49974 |
| tall | 4b | contrast_rms_D2 | levels | 0.837048 | 0.573046 | 0.562069 | 0.264002 | 0.274979 |
| tall | 4b | contrast_rms_D3 | levels | 0.430301 | 0.444952 | 0.427807 | -0.0146511 | 0.0024942 |
| tall | 4b | falloff_rms_D2_D1 | ratio | 0.0578984 | 0.0298225 | 0.0568556 | 0.0280759 | 0.00104284 |
| tall | 4b | falloff_rms_D3_D1 | ratio | 0.0297638 | 0.0231562 | 0.0432543 | 0.00660762 | -0.0134905 |
| tall | 4b | falloff_sat_D2_D1 | ratio | 0.351357 | 0.380825 | 0.424152 | -0.0294686 | -0.072795 |
| tall | 4b | falloff_sat_D3_D1 | ratio | 0.262623 | 0.236206 | 0.262988 | 0.0264177 | -0.000364186 |
| tall | 4b | sat_S_D1 | S | 0.374358 | 0.486467 | 0.438436 | -0.112109 | -0.064078 |
| tall | 4b | sat_S_D2 | S | 0.131533 | 0.185259 | 0.185407 | -0.0537259 | -0.0538737 |
| tall | 4b | sat_S_D3 | S | 0.0983151 | 0.114906 | 0.114958 | -0.0165912 | -0.0166429 |
| tall | 4b | value_V_D1 | levels | 59.7311 | 55.7441 | 53.0047 | 3.98696 | 6.72635 |
| tall | 4b | value_V_D2 | levels | 198.89 | 192.021 | 192.194 | 6.86879 | 6.69607 |
| tall | 4b | value_V_D3 | levels | 209.033 | 208.536 | 208.742 | 0.496611 | 0.291238 |
| tall | 4d | shadow_floor_lifted | bool | 0 | 0 | 0 | 0 | 0 |
| tall | 4d | shadow_min | levels | 0 | 0 | 0.261725 | 0 | -0.261725 |
| tall | 4d | shadow_p0_1 | levels | 1 | 0.6378 | 1.61902 | 0.3622 | -0.619025 |
| tall | 4d | shadow_p1 | levels | 3 | 2.1444 | 2.9681 | 0.8556 | 0.0319 |
| tall | 4d | shadow_p5 | levels | 5.0722 | 5.3702 | 6.634 | -0.298 | -1.5618 |
| tall | 4d | shadow_p50 | levels | 30.4304 | 34.89 | 29.3546 | -4.4596 | 1.07575 |
| tall | 4e | dof_lapvar_D1 | levels2 | 599.58 | 1143.93 | 380.599 | -544.354 | 218.98 |
| tall | 4e | dof_lapvar_D2 | levels2 | 3.3635 | 1.05246 | 1.03648 | 2.31104 | 2.32703 |
| tall | 4e | dof_lapvar_D3 | levels2 | 3.33964 | 0.85657 | 0.832421 | 2.48307 | 2.50722 |
| tall | 4e | dof_ratio_D1_D2 | ratio | 178.26 | 1086.91 | 365.619 | -908.652 | -187.359 |
| tall | 4e | dof_sigma_D2_pctH | %H | 0.0535885 | 0.0856638 | 0.0637194 | -0.0320752 | -0.0101308 |
| tall | 4e | dof_sigma_D2_px | px | 2.0578 | 3.28949 | 2.44682 | -1.23169 | -0.389023 |
| tall | 4e | dof_sigma_D3_pctH | %H | 0.0536839 | 0.0902096 | 0.0678877 | -0.0365257 | -0.0142038 |
| tall | 4e | dof_sigma_D3_px | px | 2.06146 | 3.46405 | 2.60689 | -1.40259 | -0.545425 |
| tall | 4g | palette_basalt_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_basalt_k1_share | fraction | 0.345643 | 0.37533 | 0.415497 | -0.029687 | -0.0698548 |
| tall | 4g | palette_basalt_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_basalt_k2_share | fraction | 0.340095 | 0.344415 | 0.344018 | -0.00431988 | -0.00392283 |
| tall | 4g | palette_basalt_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_basalt_k3_share | fraction | 0.314262 | 0.280255 | 0.240484 | 0.0340069 | 0.0737777 |
| tall | 4g | palette_basalt_meanS | S | 0.189381 | 0.61885 | 0.547085 | -0.429469 | -0.357704 |
| tall | 4g | palette_basalt_meanV | levels | 11.9174 | 16.2599 | 17.5252 | -4.3425 | -5.60778 |
| tall | 4g | palette_basalt_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_basalt_share | fraction | 0.21333 | 0.213129 | 0.248871 | 0.00020053 | -0.0355419 |
| tall | 4g | palette_basalt_vs_474B59_deltaE | dE76 | 30.2533 | 29.8165 | 29.5207 | 0.436704 | 0.732568 |
| tall | 4g | palette_moss_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_moss_k1_share | fraction | 0.444925 | 0.454423 | 0.457188 | -0.00949765 | -0.0122635 |
| tall | 4g | palette_moss_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_moss_k2_share | fraction | 0.347018 | 0.4016 | 0.380094 | -0.0545826 | -0.0330761 |
| tall | 4g | palette_moss_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_moss_k3_share | fraction | 0.208057 | 0.143977 | 0.162718 | 0.0640803 | 0.0453397 |
| tall | 4g | palette_moss_meanS | S | 0.804357 | 0.706625 | 0.633541 | 0.0977319 | 0.170816 |
| tall | 4g | palette_moss_meanV | levels | 62.8237 | 66.8273 | 69.5147 | -4.0036 | -6.69096 |
| tall | 4g | palette_moss_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_moss_share | fraction | 0.165564 | 0.16049 | 0.12327 | 0.00507447 | 0.0422946 |
| tall | 4g | palette_pebble_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_pebble_k1_share | fraction | 0.496208 | 0.568447 | 0.528194 | -0.0722392 | -0.0319855 |
| tall | 4g | palette_pebble_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_pebble_k2_share | fraction | 0.358594 | 0.317705 | 0.343159 | 0.0408892 | 0.0154347 |
| tall | 4g | palette_pebble_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_pebble_k3_share | fraction | 0.145198 | 0.113848 | 0.128647 | 0.03135 | 0.0165508 |
| tall | 4g | palette_pebble_meanS | S | 0.211702 | 0.447859 | 0.510186 | -0.236157 | -0.298484 |
| tall | 4g | palette_pebble_meanV | levels | 35.2939 | 38.6236 | 40.9606 | -3.32969 | -5.66671 |
| tall | 4g | palette_pebble_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_pebble_share | fraction | 0.0313912 | 0.0374553 | 0.0374446 | -0.00606418 | -0.00605341 |
| tall | 4g | palette_soil_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_soil_k1_share | fraction | 0.404515 | 0.645266 | 0.642515 | -0.240751 | -0.238 |
| tall | 4g | palette_soil_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_soil_k2_share | fraction | 0.361551 | 0.275251 | 0.262124 | 0.0862997 | 0.0994269 |
| tall | 4g | palette_soil_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_soil_k3_share | fraction | 0.233934 | 0.0794827 | 0.0953613 | 0.154452 | 0.138573 |
| tall | 4g | palette_soil_meanS | S | 0.137946 | 0.330432 | 0.341651 | -0.192486 | -0.203705 |
| tall | 4g | palette_soil_meanV | levels | 42.8795 | 51.3099 | 45.923 | -8.43038 | -3.04349 |
| tall | 4g | palette_soil_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_soil_share | fraction | 0.3197 | 0.317768 | 0.371961 | 0.00193206 | -0.052261 |
| tall | 4g | palette_turf_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_turf_k1_share | fraction | 0.471572 | 0.602313 | 0.565521 | -0.130741 | -0.0939488 |
| tall | 4g | palette_turf_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_turf_k2_share | fraction | 0.351522 | 0.316723 | 0.321258 | 0.0347988 | 0.0302644 |
| tall | 4g | palette_turf_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_turf_k3_share | fraction | 0.176906 | 0.0809642 | 0.113222 | 0.0959421 | 0.0636844 |
| tall | 4g | palette_turf_meanS | S | 0.517707 | 0.584963 | 0.476944 | -0.0672564 | 0.0407631 |
| tall | 4g | palette_turf_meanV | levels | 66.7482 | 55.4585 | 58.3005 | 11.2897 | 8.44776 |
| tall | 4g | palette_turf_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| tall | 4g | palette_turf_share | fraction | 0.165756 | 0.160523 | 0.123786 | 0.0052331 | 0.0419701 |
| tall | 4g | palette_turf_vs_517046_deltaE | dE76 | 19.9687 | 28.4566 | 28.1006 | -8.48788 | -8.13186 |
| tall | 4h | conifer_dark_area_pct | % | 33.58 | 30.7514 | 28.2344 | 2.82859 | 5.3456 |
| tall | 4h | conifer_edge_density | fraction | 0.574818 | 0.432739 | 0.351717 | 0.142079 | 0.223101 |
| wide | 4a | haze_deltaE_vs_haze_token | dE76 | 22.9213 | 22.6064 | 22.0659 | 0.314931 | 0.855391 |
| wide | 4a | haze_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.02_best_token | token | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.02_deltaE_min | dE76 | 19.2793 | 19.0939 | 19.2985 | 0.185355 | -0.0191512 |
| wide | 4a | sky_anchor_0.10_best_token | token | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.10_deltaE_min | dE76 | 4.37535 | 4.83441 | 4.4938 | -0.459061 | -0.118451 |
| wide | 4a | sky_anchor_0.25_best_token | token | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.25_deltaE_min | dE76 | 9.0255 | 9.30316 | 9.33377 | -0.277666 | -0.308277 |
| wide | 4a | sky_anchor_0.40_best_token | token | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.40_deltaE_min | dE76 | 4.39933 | 4.24577 | 3.81333 | 0.15356 | 0.586003 |
| wide | 4a | sky_anchor_0.55_best_token | token | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.55_deltaE_min | dE76 | 4.16024 | 4.40577 | 4.01078 | -0.245524 | 0.149464 |
| wide | 4a | sky_anchor_0.68_best_token | token | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_anchor_0.68_deltaE_min | dE76 | 6.85112 | 6.89389 | 7.2696 | -0.0427761 | -0.418486 |
| wide | 4a | sky_deltaE_horizon_vs_haze | dE76 | 6.85112 | 6.89389 | 7.2696 | -0.0427761 | -0.418486 |
| wide | 4a | sky_deltaE_horizon_vs_sky_low | dE76 | 23.9397 | 24.1126 | 24.5662 | -0.172908 | -0.626579 |
| wide | 4a | sky_deltaE_horizon_vs_sky_mid | dE76 | 14.6173 | 14.6465 | 14.9968 | -0.0291369 | -0.379421 |
| wide | 4a | sky_deltaE_horizon_vs_sky_top | dE76 | 15.2094 | 14.9555 | 14.762 | 0.253885 | 0.447414 |
| wide | 4a | sky_deltaE_mid_vs_haze | dE76 | 10.6569 | 10.2607 | 9.69409 | 0.396249 | 0.962827 |
| wide | 4a | sky_deltaE_mid_vs_sky_low | dE76 | 14.4204 | 14.5897 | 14.8906 | -0.169303 | -0.470224 |
| wide | 4a | sky_deltaE_mid_vs_sky_mid | dE76 | 2.60086 | 2.43754 | 2.46599 | 0.163322 | 0.134876 |
| wide | 4a | sky_deltaE_mid_vs_sky_top | dE76 | 18.2532 | 17.9623 | 17.5333 | 0.290893 | 0.719841 |
| wide | 4a | sky_deltaE_top_vs_haze | dE76 | 18.6154 | 18.573 | 18.441 | 0.0423884 | 0.174395 |
| wide | 4a | sky_deltaE_top_vs_sky_low | dE76 | 32.9606 | 33.0965 | 33.1882 | -0.135867 | -0.227569 |
| wide | 4a | sky_deltaE_top_vs_sky_mid | dE76 | 19.1387 | 19.255 | 19.3769 | -0.116315 | -0.238225 |
| wide | 4a | sky_deltaE_top_vs_sky_top | dE76 | 4.99527 | 4.71581 | 4.56443 | 0.279462 | 0.430844 |
| wide | 4a | sky_hex_anchor_0.02 | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_anchor_0.10 | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_anchor_0.25 | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_anchor_0.40 | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_anchor_0.55 | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_anchor_0.68 | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_horizon | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_mid | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_hex_top | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4a | sky_r2_B | 1 | 0.978341 | 0.976521 | 0.976414 | 0.0018194 | 0.00192643 |
| wide | 4a | sky_r2_G | 1 | 0.978041 | 0.97367 | 0.973258 | 0.0043707 | 0.00478201 |
| wide | 4a | sky_r2_R | 1 | 0.969477 | 0.965942 | 0.965114 | 0.00353448 | 0.00436315 |
| wide | 4a | sky_slope_B | levels/%H | 1.57694 | 1.5581 | 1.54203 | 0.0188434 | 0.0349083 |
| wide | 4a | sky_slope_G | levels/%H | 1.85311 | 1.83337 | 1.80752 | 0.0197415 | 0.0455943 |
| wide | 4a | sky_slope_R | levels/%H | 2.21972 | 2.14883 | 2.11958 | 0.0708936 | 0.100141 |
| wide | 4b | contrast_rms_D1 | levels | 11.9894 | 16.1002 | 9.99556 | -4.11077 | 1.99382 |
| wide | 4b | contrast_rms_D2 | levels | 0.860098 | 1.51558 | 1.48577 | -0.655484 | -0.625676 |
| wide | 4b | contrast_rms_D3 | levels | 0.464451 | 0.541036 | 0.544276 | -0.0765853 | -0.0798248 |
| wide | 4b | falloff_rms_D2_D1 | ratio | 0.0717383 | 0.0941346 | 0.16176 | -0.0223963 | -0.0900218 |
| wide | 4b | falloff_rms_D3_D1 | ratio | 0.0387385 | 0.0336044 | 0.0593686 | 0.00513411 | -0.0206301 |
| wide | 4b | falloff_sat_D2_D1 | ratio | 0.412527 | 0.336289 | 0.383955 | 0.0762372 | 0.0285716 |
| wide | 4b | falloff_sat_D3_D1 | ratio | 0.374564 | 0.28132 | 0.319789 | 0.0932432 | 0.0547746 |
| wide | 4b | sat_S_D1 | S | 0.313812 | 0.445476 | 0.385911 | -0.131663 | -0.0720989 |
| wide | 4b | sat_S_D2 | S | 0.129456 | 0.149809 | 0.147656 | -0.0203529 | -0.0182005 |
| wide | 4b | sat_S_D3 | S | 0.117543 | 0.125321 | 0.12299 | -0.00777877 | -0.00544757 |
| wide | 4b | value_V_D1 | levels | 105.424 | 99.5446 | 98.4619 | 5.8794 | 6.9621 |
| wide | 4b | value_V_D2 | levels | 204.798 | 204.321 | 202.77 | 0.476827 | 2.02806 |
| wide | 4b | value_V_D3 | levels | 210.354 | 210.029 | 208.211 | 0.324828 | 2.14278 |
| wide | 4d | shadow_floor_lifted | bool | 0 | 0 | 0 | 0 | 0 |
| wide | 4d | shadow_min | levels | 0 | 0 | 0.045125 | 0 | -0.045125 |
| wide | 4d | shadow_p0_1 | levels | 1.0722 | 0 | 1.2469 | 1.0722 | -0.1747 |
| wide | 4d | shadow_p1 | levels | 3.0722 | 0.9278 | 2.72377 | 2.1444 | 0.348425 |
| wide | 4d | shadow_p5 | levels | 6.8596 | 2.7192 | 7.45142 | 4.1404 | -0.591818 |
| wide | 4d | shadow_p50 | levels | 55.004 | 130.065 | 107.29 | -75.0608 | -52.2861 |
| wide | 4e | dof_lapvar_D1 | levels2 | 415.486 | 851.62 | 267.891 | -436.134 | 147.595 |
| wide | 4e | dof_lapvar_D2 | levels2 | 3.52001 | 3.95968 | 3.58642 | -0.439667 | -0.0664089 |
| wide | 4e | dof_lapvar_D3 | levels2 | 3.3765 | 0.970343 | 0.980658 | 2.40616 | 2.39584 |
| wide | 4e | dof_ratio_D1_D2 | ratio | 118.036 | 215.073 | 72.7962 | -97.0376 | 45.2393 |
| wide | 4e | dof_sigma_D2_pctH | %H | 0.0848417 | 0.0973313 | 0.0748811 | -0.0124896 | 0.0099606 |
| wide | 4e | dof_sigma_D2_px | px | 1.83258 | 2.10236 | 1.61743 | -0.269775 | 0.215149 |
| wide | 4e | dof_sigma_D3_pctH | %H | 0.0858024 | 0.146216 | 0.112177 | -0.0604135 | -0.0263744 |
| wide | 4e | dof_sigma_D3_px | px | 1.85333 | 3.15826 | 2.42302 | -1.30493 | -0.569687 |
| wide | 4g | palette_basalt_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_basalt_k1_share | fraction | 0.376227 | 0.531162 | 0.426139 | -0.154935 | -0.0499118 |
| wide | 4g | palette_basalt_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_basalt_k2_share | fraction | 0.325525 | 0.327092 | 0.3623 | -0.00156698 | -0.0367752 |
| wide | 4g | palette_basalt_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_basalt_k3_share | fraction | 0.298248 | 0.141746 | 0.211561 | 0.156502 | 0.0866869 |
| wide | 4g | palette_basalt_meanS | S | 0.184054 | 0.720472 | 0.543165 | -0.536417 | -0.359111 |
| wide | 4g | palette_basalt_meanV | levels | 11.9094 | 9.43904 | 16.4821 | 2.47037 | -4.5727 |
| wide | 4g | palette_basalt_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_basalt_share | fraction | 0.217777 | 0.212173 | 0.249943 | 0.00560372 | -0.0321662 |
| wide | 4g | palette_basalt_vs_474B59_deltaE | dE76 | 30.2533 | 31.777 | 29.8168 | -1.52375 | 0.43646 |
| wide | 4g | palette_moss_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_moss_k1_share | fraction | 0.459699 | 0.46564 | 0.45454 | -0.00594135 | 0.00515825 |
| wide | 4g | palette_moss_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_moss_k2_share | fraction | 0.360781 | 0.398528 | 0.390743 | -0.0377473 | -0.0299616 |
| wide | 4g | palette_moss_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_moss_k3_share | fraction | 0.17952 | 0.135832 | 0.154717 | 0.0436887 | 0.0248033 |
| wide | 4g | palette_moss_meanS | S | 0.795314 | 0.759932 | 0.671062 | 0.0353815 | 0.124252 |
| wide | 4g | palette_moss_meanV | levels | 60.1905 | 62.0735 | 68.8451 | -1.88301 | -8.65458 |
| wide | 4g | palette_moss_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_moss_share | fraction | 0.164494 | 0.155295 | 0.112927 | 0.00919914 | 0.0515667 |
| wide | 4g | palette_pebble_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_pebble_k1_share | fraction | 0.456113 | 0.683787 | 0.5435 | -0.227674 | -0.0873879 |
| wide | 4g | palette_pebble_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_pebble_k2_share | fraction | 0.306465 | 0.264923 | 0.323786 | 0.0415424 | -0.0173209 |
| wide | 4g | palette_pebble_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_pebble_k3_share | fraction | 0.237422 | 0.0512902 | 0.132714 | 0.186132 | 0.104709 |
| wide | 4g | palette_pebble_meanS | S | 0.209878 | 0.528037 | 0.579077 | -0.318159 | -0.369199 |
| wide | 4g | palette_pebble_meanV | levels | 37.3343 | 32.8717 | 52.7909 | 4.46259 | -15.4566 |
| wide | 4g | palette_pebble_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_pebble_share | fraction | 0.0369921 | 0.035234 | 0.0508651 | 0.00175806 | -0.013873 |
| wide | 4g | palette_soil_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_soil_k1_share | fraction | 0.400346 | 0.61997 | 0.634185 | -0.219624 | -0.233839 |
| wide | 4g | palette_soil_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_soil_k2_share | fraction | 0.389224 | 0.275505 | 0.289583 | 0.113719 | 0.0996417 |
| wide | 4g | palette_soil_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_soil_k3_share | fraction | 0.21043 | 0.104525 | 0.076232 | 0.105905 | 0.134198 |
| wide | 4g | palette_soil_meanS | S | 0.13368 | 0.327591 | 0.316067 | -0.193911 | -0.182387 |
| wide | 4g | palette_soil_meanV | levels | 44.2844 | 57.6488 | 57.2025 | -13.3644 | -12.918 |
| wide | 4g | palette_soil_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_soil_share | fraction | 0.326534 | 0.318054 | 0.373691 | 0.00848013 | -0.0471565 |
| wide | 4g | palette_turf_k1_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_turf_k1_share | fraction | 0.528407 | 0.569306 | 0.549083 | -0.0408984 | -0.0206755 |
| wide | 4g | palette_turf_k2_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_turf_k2_share | fraction | 0.323469 | 0.347188 | 0.340429 | -0.0237198 | -0.0169609 |
| wide | 4g | palette_turf_k3_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_turf_k3_share | fraction | 0.148124 | 0.0835059 | 0.110488 | 0.0646182 | 0.0376364 |
| wide | 4g | palette_turf_meanS | S | 0.569254 | 0.692026 | 0.538502 | -0.122772 | 0.030752 |
| wide | 4g | palette_turf_meanV | levels | 70.3478 | 45.0861 | 48.5581 | 25.2617 | 21.7897 |
| wide | 4g | palette_turf_median_hex | hex | n/a | n/a | n/a | n/a | n/a |
| wide | 4g | palette_turf_share | fraction | 0.166665 | 0.156244 | 0.113961 | 0.0104216 | 0.0527046 |
| wide | 4g | palette_turf_vs_517046_deltaE | dE76 | 18.8017 | 32.7351 | 31.2417 | -13.9334 | -12.44 |
| wide | 4h | conifer_dark_area_pct | % | 14.0621 | 13.9738 | 12.3422 | 0.0882316 | 1.71985 |
| wide | 4h | conifer_edge_density | fraction | 0.253511 | 0.200989 | 0.165211 | 0.0525219 | 0.0882998 |

## 2. Not measurable this pass

reasons, never blanks; 4i numbers are still-adapted

| framing | attr | verdict | reason | values |
|---|---|---|---|---|
| tall | 4i | still-adapted (not a pass metric) | 4i needs 8 frames + a cloud volume; drift is undefined for a static still. Numbers are the still-adapted run (the same still copied to all 8 s-slots, S_IDX=[0, 486, 972, 1458, 1944, 2430, 2916, 3402]). | `{"cloud_band_y_pctH": 92.96875, "cloud_texture_zero_x_px": 432.0, "cloud_texture_zero_y_px": 245.0, "drift_dx_px": 4.288864380284283e-21, "drift_dy_px": -0.5, "drift_not_measurable": 1.0}` |
| tall | S2 (union gate) | PASS | union bbox pools s0..s7; the s0-mask gate above is real, the union row cannot be concluded from one still | `{}` |
| tall | 4g (union rows) | n/a | union palette pools stratum pixels over s0..s7; not measurable from one still | `{}` |
| wide | 4i | still-adapted (not a pass metric) | 4i needs 8 frames + a cloud volume; drift is undefined for a static still. Numbers are the still-adapted run (the same still copied to all 8 s-slots, S_IDX=[0, 486, 972, 1458, 1944, 2430, 2916, 3402]). | `{"cloud_band_y_pctH": 65.23148148148148, "cloud_texture_zero_x_px": 768.0, "cloud_texture_zero_y_px": 126.0, "drift_dx_px": -4.890064687355874e-21, "drift_dy_px": 1.99628841440056e-21, "drift_not_measurable": 1.0}` |
| wide | S2 (union gate) | PASS | union bbox pools s0..s7; the s0-mask gate above is real, the union row cannot be concluded from one still | `{}` |
| wide | 4g (union rows) | n/a | union palette pools stratum pixels over s0..s7; not measurable from one still | `{}` |

## 3. TOOL, not chased

measured to confirm absence; do not add (look spec §5)

| framing | attr | reason | values |
|---|---|---|---|
| tall | 4c | TOOL — bloom must stay absent; run only to confirm | `{"bloom_bg_L": 148.427, "bloom_falloff_10_90_px": 0.8347547051303876, "bloom_peak_L": 167.7748, "bloom_peak_bg_ratio": 1.130352294393877, "bloom_r50_pctH": 0.013586502362148214, "bloom_r50_px": 0.5217216907064914}` |
| tall | 4f | TOOL — grain must not be added; run only to confirm | `{"grain_acf_halfmax_x": 1.0, "grain_acf_halfmax_y": 1.0, "grain_acf_zerocross_x": 1.0, "grain_acf_zerocross_y": 1.0, "grain_sigma_B": 0.44284851394749974, "grain_sigma_G": 0.44239855029621666, "grain_sigma_R": 0.442798208206387}` |
| tall | D1 (micro-contrast) | TOOL — D1 micro-contrast is carried by the 4e D1 rows; not chased | `{"dof_lapvar_D1": 599.5796511990629, "dof_ratio_D1_D2": 178.2604307932584}` |
| wide | 4c | TOOL — bloom must stay absent; run only to confirm | `{"bloom_bg_L": 135.0648, "bloom_falloff_10_90_px": 2.0236242705733076, "bloom_peak_L": 174.2642, "bloom_peak_bg_ratio": 1.290226617149694, "bloom_r50_pctH": 0.08762941221697795, "bloom_r50_px": 1.8927953038867238}` |
| wide | 4f | TOOL — grain must not be added; run only to confirm | `{"grain_acf_halfmax_x": 1.0, "grain_acf_halfmax_y": 1.0, "grain_acf_zerocross_x": 1.0, "grain_acf_zerocross_y": 1.0, "grain_sigma_B": 0.44278374566481987, "grain_sigma_G": 0.44306675164544596, "grain_sigma_R": 0.44304103817821094}` |
| wide | D1 (micro-contrast) | TOOL — D1 micro-contrast is carried by the 4e D1 rows; not chased | `{"dof_lapvar_D1": 415.48627225651904, "dof_ratio_D1_D2": 118.03555185427334}` |

## S2 bbox gate (s0 island mask; union gate not measurable)

- tall S2 PASS bbox x 0.480-1.000 y 0.448-0.881 ref x 0.50-1.00 y 0.45-0.88 tol x 0.03 y 0.01 (s0 island mask; union gate needs 8 frames)
- wide S2 PASS bbox x 0.589-0.925 y 0.290-0.866 ref x 0.59-0.93 y 0.29-0.86 tol x 0.03 y 0.01 (s0 island mask; union gate needs 8 frames)

## VRAM (D-223-02)

`{"cycles_peak_mib": 2192, "cycles_peak_source": "Mem high-water (Blender 5.2.2 stats)", "device_baseline_mib": 1503, "device_peak_mib": 4510, "device_total_mib": 12282, "gate_mib": 6144, "gate_warn": false, "note": "our peak = max(cycles leg, vram peak - precheck baseline); cycles leg from Peak memory line if present else max Mem:<n>M high-water; None = unmeasurable in this Blender build (D-223-02)", "our_render_peak_mib": 3007, "vram_log_samples": 118}`
