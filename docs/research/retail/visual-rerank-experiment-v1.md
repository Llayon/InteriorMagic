# Visual Reranking Experiment v1

> Track F3 Phase 3 — research only. No production AI service, no embeddings infra, no vector DB.
> Script: `scripts/research/retail/simulateVisualRerank.mjs` (deterministic, offline, seeded by data).
> Dataset: `golden-dataset-v1/golden-matching-v1.json` (42 assets; 22 with positives).

---

## 1. What was actually run (and what was not)

Per constraints this phase could **not** install CLIP/SigLIP weights, spin up a vision LLM, or build
embedding infrastructure. Instead of pretending, three tiers were measured:

| Tier | Meaning | Result (22 assets with positives) |
|---|---|---|
| **Baseline** | deterministic matcher (Phase 2) | Top-1 A 27% · Top-1 A+B 91% · Hit@3 A+B 100% · MRR_A 0.30 |
| **Proxy rerank** | visual agreement simulated from gold reason strings (silhouette/material/style penalties); 0.65·baseline + 0.35·visual | **≈ zero delta** on every metric and every difficulty tier |
| **Oracle ceiling** | perfect visual knowledge (gold-informed ordering) | Top-1 A **32%** · Top-1 A+B **100%** · hard-tier Top-1 A+B 80%→**100%** · medium Top-1 A 17%→33% |

The null result of the middle tier is itself informative: a reranker whose "visual" signal is
reconstructed from text already consumed by the baseline adds nothing. The gap between baseline and
oracle is exactly the value of *genuinely new information* — pixels.

## 2. Pipeline being validated (architecture invariant)

```
Asset Semantic Core
      ↓
Candidate Retrieval
      ↓
Deterministic Filters        ← never bypassed (category gate, dimension tolerance)
      ↓  top-10
Visual Reranker              ← this phase's subject
      ↓  final top-3
Confidence / RetailMatch
```

Visual model may only reorder within the safe set; it cannot rescue a category or dimension failure.
This matches the binding principle: dimensions/category define candidate safety; visual defines desirability.

## 3. Option comparison (for the future real experiment)

| Option | Pros | Cons | Verdict for F4 pilot |
|---|---|---|---|
| **SigLIP/CLIP embeddings** (asset canonical renders ↔ retailer hero images, cosine kNN in top-10) | fast, cheap at inference, standard tooling; multi-view averaging known to help furniture | needs image download rights (**UNKNOWN per F0 for all retailers**); embedding storage = new infra (currently prohibited); domain gap render-vs-photo is real but manageable with 4–6 views + background whitening | preferred, gated on rights |
| **Multimodal LLM judging pairs** ("same chair family? yes/no + why") | zero index infra, strong prior on shape/style language, handles long-tail wording | cost/latency per pair (~10 candidates × assets), non-deterministic, prompt-injection surface, same image-rights question | good as offline labeler for benchmark calibration, not runtime |
| **Classic CV (silhouette IoU + color histograms)** on masks | no ML deps, fully explainable | brittle to pose/background; weak on upholstery detail | keep as cheap prefilter feature, not primary |

Recommendation: **SigLIP-style multi-view embeddings as the F4 pilot**, VLM as the offline auditor,
classic CV features folded into the baseline. All of it blocked behind the same DATA-GO legal
question: storing/proxying retailer images for embedding generation is unresolved for every
retailer investigated (F0 §D).

## 4. Measured headroom (what visual buys us)

From oracle tier:

- **+5pp strict Top-1 A** overall (27→32%), concentrated in medium difficulty (+17pp).
- **+9pp Top-1 A+B overall** (91→100%) — visual fixes the two false-positive negatives
  (`chair_027`, `chair_162`: dimension-compatible but wrong silhouette class).
- **Hard tier**: Top-1 A+B reaches 100% under oracle — i.e., where a true analogue exists in the
  pool, visual ordering finds it even when dimensions are loose.
- Where NO analogue exists in the pool (20 negative assets), no reranker helps; abstention logic
  (confidence threshold) remains the correct behavior — baseline already produces 0 high-confidence
  false tops ≥0.75 except those two silhouette cases.

Realized gains will land between baseline and oracle proportionally to reranker accuracy; the F4
pilot target should be ≥70% of the oracle delta before productionization is discussed.

## 5. Required inputs for the real experiment

1. Rights confirmation for retailer image use (DATA GO dependency).
2. Canonical multi-view renders for the 42 golden assets (front/left-¾/right-¾/side/top-ish +
   silhouette mask) from existing GLBs — pure local rendering task, no new asset authoring.
3. A tiny evaluation harness reusing `evaluateBaseline.mjs` metrics with reranker plugged after the
   deterministic filters.

## 6. Conclusion

Visual reranking is **the only lever that moves strict-A metrics**, and its ceiling is material but
bounded (Top-1 A ≈ one-third on this pool). It does NOT relax deterministic filters, and it does NOT
change DATA GO. Proceed to a rights-gated SigLIP pilot; do not build infrastructure now.
