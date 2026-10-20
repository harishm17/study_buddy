# baseline (2026-10-20) -> rrf (2026-10-20)

Code: `32c1110cb7` -> `b2736684ab`; search.py `4440987e7b` -> `23a968b9fa`

## Overall

| System | recall | precision | MRR | nDCG | hit@5 |
|---|---|---|---|---|---|
| app: hybrid_search_chunks (current) | 0.989 (+0.053) | 0.265 (+0.016) | 0.961 (+0.130) | 0.932 (+0.156) | 1.000 (+0.105) |
| reference: vector cosine, query = name + description | 0.967 (+0.061) | 0.258 (+0.020) | 0.947 (+0.020) | 0.895 (+0.062) | 1.000 (+0.000) |
| reference: vector cosine, query = name + description + keywords | 0.984 (+0.057) | 0.263 (+0.019) | 0.934 (-0.013) | 0.917 (+0.047) | 1.000 (+0.000) |

## python-loops-functions

| System | recall | precision | MRR | nDCG | hit@5 |
|---|---|---|---|---|---|
| app: hybrid_search_chunks (current) | 1.000 (+0.053) | 0.254 (+0.015) | 0.955 (+0.214) | 0.935 (+0.226) | 1.000 (+0.182) |
| reference: vector cosine, query = name + description | 0.990 (+0.071) | 0.250 (+0.023) | 0.864 (-0.023) | 0.874 (+0.062) | 1.000 (+0.000) |
| reference: vector cosine, query = name + description + keywords | 1.000 (+0.080) | 0.254 (+0.023) | 0.909 (-0.045) | 0.911 (+0.063) | 1.000 (+0.000) |

## biology-cellular-respiration

| System | recall | precision | MRR | nDCG | hit@5 |
|---|---|---|---|---|---|
| app: hybrid_search_chunks (current) | 0.985 (+0.045) | 0.231 (+0.008) | 0.955 (+0.118) | 0.921 (+0.166) | 1.000 (+0.182) |
| reference: vector cosine, query = name + description | 1.000 (+0.095) | 0.235 (+0.023) | 0.955 (+0.000) | 0.935 (+0.087) | 1.000 (+0.000) |
| reference: vector cosine, query = name + description + keywords | 1.000 (+0.056) | 0.235 (+0.015) | 0.909 (+0.000) | 0.925 (+0.054) | 1.000 (+0.000) |

## psychology-learning-memory

| System | recall | precision | MRR | nDCG | hit@5 |
|---|---|---|---|---|---|
| app: hybrid_search_chunks (current) | 0.983 (+0.059) | 0.297 (+0.023) | 0.969 (+0.081) | 0.939 (+0.101) | 1.000 (+0.000) |
| reference: vector cosine, query = name + description | 0.928 (+0.031) | 0.279 (+0.016) | 1.000 (+0.062) | 0.882 (+0.045) | 1.000 (+0.000) |
| reference: vector cosine, query = name + description + keywords | 0.963 (+0.041) | 0.289 (+0.018) | 0.969 (+0.000) | 0.915 (+0.031) | 1.000 (+0.000) |

## Topics that moved most (app retrieval)

| Topic | recall before | recall after | nDCG before | nDCG after | first rank before | first rank after |
|---|---|---|---|---|---|---|
| bio-other-fuels | 0.667 | 0.833 | 0.358 | 0.801 | 8 | 1 |
| psy-forgetting | 0.667 | 1.000 | 0.697 | 0.967 | 1 | 1 |
| py-define | 0.667 | 1.000 | 0.590 | 0.816 | 2 | 1 |
| bio-redox | 0.667 | 1.000 | 0.671 | 0.896 | 1 | 1 |
| bio-krebs | 1.000 | 1.000 | 0.473 | 0.937 | 13 | 1 |
| psy-encoding | 0.833 | 1.000 | 0.697 | 0.993 | 2 | 1 |
| py-nested | 0.857 | 1.000 | 0.776 | 1.000 | 1 | 1 |
| py-params | 1.000 | 1.000 | 0.609 | 0.962 | 6 | 1 |
