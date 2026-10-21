# Generation eval: structure

- Date: 2026-10-21. Code: `21ea117daa`, branch `feat/course-structure`.
- Corpora and topics generated: mit-18.05 4, mit-6.006 4. Topics came from: the app's course planner.
- Models: opus:medium. Content types: notes, solved, interactive, quiz.
- Requested per topic: 3 examples of each kind, 10 quiz questions, medium difficulty, comprehensive notes.
- Judge: opus:medium.
- Spend: $4.68 generation, $0.16 topic extraction, $2.17 judge; total $7.01 (caps: $10.00 total, $3.00 judge).

## Cost and latency

Cost uses the app's own price table (`usage.py`) on the token counts the API reported. A topic's cost is the sum of the mean cost of each content type, so the 12-topic projection is for one set of all the types generated here, times 12. Latency is wall time of the app's generator call.

| Model | Per topic | Projected, 12 topics | Notes | Worked examples | Practice problems | Quiz | Seconds per topic | Total spent |
|---|---|---|---|---|---|---|---|---|
| opus:medium | $0.585 | $7.02 | $0.129 (45s) | $0.155 (54s) | $0.161 (54s) | $0.140 (50s) | 204s | $4.679 |

Per-type cells are mean cost per generation and, in brackets, mean seconds.

| Model | Calls | Input tokens | Output tokens | Cache write tokens | Cache read tokens |
|---|---|---|---|---|---|
| opus:medium | 32 | 242,367 | 185,483 | 0 | 0 |

## Automatic checks

No model is involved. These are lexical heuristics: they find things worth reading, they do not prove content right or wrong (see the README for what each can miss). Counts are over every topic generated.

| Check | opus:medium |
|---|---|
| Plain-text fields with `$` or backslash sequences | 38 |
| Fields with unbalanced `$` | 0 |
| Fields with bare currency | 0 |
| MC explanations naming an option letter (any / strict `Option C`, `(B)`) | 0 / 0 of 28 |
| Quiz recall-copy rate (questions whose numbers all come from this model's notes or examples) | 50% (16 of 32) |
| Notes with all expected sections | 0/8 |
| Notes inside the requested word band | 0/8 (mean 1749 words) |
| Notes with 5-8 recap bullets | 8/8 |
| Worked-example sets with the requested count | 8/8 |
| Practice sets with the requested count | 8/8 |
| Quizzes with the requested question count | 8/8 |
| Grounding proxy (share of notes sentences sharing vocabulary with the excerpts) | 65% |
| Near-duplicate example statements across topics (Jaccard > 0.6) | 0 |

## Judge

Judged 32 (topic, type) pairs with opus:medium. Each call saw the excerpts and every model's output as anonymous, shuffled candidates, and scored each 1-5. Means are over all judged items.

| Model | Correctness | Grounding | Teaching | Question quality (quiz) | Mathematical errors | All errors |
|---|---|---|---|---|---|---|
| opus:medium | 4.66 | 4.91 | 4.69 | 4.50 | 1 | 19 |

By content type (correctness / teaching, plus question quality for quizzes):

| Model | Notes | Worked examples | Practice problems | Quiz |
|---|---|---|---|---|
| opus:medium | 4.88 / 5.00 (1 math err) | 5.00 / 4.88 | 3.88 / 4.12 | 4.88 / 4.75 / 4.50 |

### Errors the judge listed

Every error the judge reported, by model. The judge can be wrong; check an error before relying on it.

**opus:medium** (19 errors, 1 mathematical)

- [mit-18.05 / t00-sets-and-counting-principles / interactive] ambiguous_key, Practice problem 2, Step 1 (multiple_choice): The step is labeled multiple choice with the key 'B', but no answer options are shown to the student. The student cannot tell what 'B' refers to. It is also easy to confuse with a set name, since the course uses A and B for sets. The guidance mentions 'all of both circles shaded', which suggests the options were meant to be Venn diagram shadings. The options (for example A: T∩P, B: T∪P, C: (T∪P)^c) must be listed for the key to make sense.
- [mit-18.05 / t00-sets-and-counting-principles / notes] other, Key concepts, Venn diagrams ASCII figure: The text diagram draws two separate, non-overlapping circles with an '(overlap)' label between them, so it does not actually show L ∩ R as a shared region. The shading rules in the text are correct, but the picture could confuse a first-time reader.
- [mit-18.05 / t03-independence-of-events / interactive] ambiguous_key, Problem 1, Steps 3 and 5: Both questions ask 'Are X and Y independent?' and both have key 'A', but the correct verdicts are opposite: A and B are independent, while A and C are not. The options are not shown. If both steps use the same option list, one key is wrong. The other multiple-choice keys (Problem 2 Step 3 = C, Problem 3 Steps 2 and 4) also cannot be checked without their options.
- [mit-18.05 / t03-independence-of-events / interactive] unsupported_by_excerpts, Problem 3, Steps 3-4: The disjoint-versus-independent contrast is not in the excerpts. It is standard and correct, and it follows directly from the formal definition, so this is a minor point.
- [mit-18.05 / t05-random-variables-pmf-and-cdf / interactive] ambiguous_key, Problem 2, Step 1 (multiple_choice): The key says 'B', but no answer options are listed anywhere. The student cannot see what B refers to, and the key cannot be verified. The explanation suggests the intended option is 'a function from the sample space to the reals', but the lettered choices are missing.
- [mit-18.05 / t05-random-variables-pmf-and-cdf / interactive] ambiguous_key, Problem 2, Step 2 (multiple_choice): The key says 'C', but no options are given. From the explanation, the intended answer is {-3,-1,1,3}, but the student is never shown which lettered option that is.
- [mit-18.05 / t05-random-variables-pmf-and-cdf / interactive] ambiguous_key, Problem 3, Step 3 (multiple_choice): The key says 'C' and the guidance refers to distractors (spikes, a straight line, a graph falling back toward 0). None of these choices are actually presented, so the question cannot be answered as written.
- [mit-18.05 / t05-random-variables-pmf-and-cdf / interactive] ambiguous_key, Problem 3, Step 4 (multiple_choice): The key says 'C' (the non-decreasing property), but the list of properties to choose from is not shown, so the lettered answer is unverifiable.
- [mit-18.05 / t08-repeated-updating-and-screening-example / interactive] ambiguous_key, Problem 1, Step 5: The answer key is 'C', but no answer options are listed. The explanation and guidance say the fair coin, type A, has the highest posterior (≈0.467, versus B ≈0.449 and C ≈0.084). Since the hypotheses are themselves labeled A, B and C, a student will read key 'C' as 'type C', which is the lowest posterior. The key either contradicts the explanation or depends on hidden option lettering; it should identify type A.
- [mit-18.05 / t08-repeated-updating-and-screening-example / interactive] ambiguous_key, Problem 3, Step 3: This multiple-choice step gives the key as 'C' without showing the options. The guidance mentions the original prevalence, the sensitivity, the normalizing constant 0.1085 and the first posterior, but there is no visible way to tell which option letter maps to 'first posterior'.
- [mit-18.05 / t08-repeated-updating-and-screening-example / interactive] other, Problem 3, Step 2: The accepted-answer list repeats 0.0876, which is also the main answer. This is harmless but sloppy.
- [mit-6.006 / t00-comparison-model-search-lower-bound / interactive] other, Problem 1 Step 4; Problem 2 Steps 1–2; Problem 3 Steps 1 and 4 (all multiple_choice steps): The answer keys give letters (C, D, C, D, C) but the answer options are never shown. The keys cannot be checked against any choices, and a student would not know what they are picking between. The explanations do make the intended answers clear, and those answers are correct.
- [mit-6.006 / t02-priority-queues-and-pq-sort / interactive] other, All multiple_choice steps (P1 S1, P1 S4, P2 S1, P2 S4, P3 S2–S4): The answer keys are given only as letters (B, A, C, D, D, D, B), but the option texts are never shown. A student cannot answer these steps, and the keys cannot be checked against the choices. The explanations do make the intended answers clear: Set interface; delete_max then reinsert; [5,2,7,1]; selection sort; O(n^2); O(n log n); AVL not in-place.
- [mit-6.006 / t04-heap-sort-and-linear-build / interactive] factual, Problem 2, Step 4 (feedback and explanation): The feedback says the total number of swaps is 'about 1.44n'. The constant lg e ≈ 1.443 comes only from the rough approximation height(i) ≈ lg n − lg i. The true worst-case number of swaps in a bottom-up build is the sum of node heights, which is at most n − 1. The candidate's own n = 8 case gives 7, while the approximation predicts about 10. The O(n) conclusion is right, and lg e is a fine answer to the approximation question as posed, but presenting 1.44n as the actual swap count is misleading.
- [mit-6.006 / t04-heap-sort-and-linear-build / interactive] other, Problem 1 Steps 2, 3, 5; Problem 2 Steps 2, 3, 5; Problem 3 Steps 1, 3, 4: Every multiple-choice step gives a letter key (A, B, C or D), but the answer options are never shown. A student cannot answer these steps, and a reviewer cannot confirm that the letters match the explanations. The explanations themselves are correct.
- [mit-6.006 / t04-heap-sort-and-linear-build / notes] mathematical, Key concepts > Why one-by-one building is Ω(n lg n), example with n = 16: The note says indices 8 to 15 sit at depth 3. With 0-indexed heap storage, depth(i) = floor(lg(i+1)), so depth 3 holds indices 7 to 14, and index 15 is at depth 4. The count of 8 items (half of n) is right, but the index range is off by one.
- [mit-6.006 / t06-lis-and-alternating-coin-game / interactive] ambiguous_key, Problem 1 Step 5; Problem 2 Step 5; Problem 3 Steps 1, 2, 4 (all multiple_choice steps): Each multiple-choice step gives an answer key letter (B, A, D, C, A), but no answer options are shown. A student cannot answer or check these steps. The explanations show the intended content, but the letter keys cannot be verified.
- [mit-6.006 / t06-lis-and-alternating-coin-game / notes] unsupported_by_excerpts, The idea, opening sentence: The notes say 'In SRTBOT and longest common subsequence, the natural subproblems... were already enough.' Longest common subsequence and prior SRTBOT examples do not appear in the excerpts. This is a minor reference to course content outside what was provided.
- [mit-6.006 / t06-lis-and-alternating-coin-game / quiz] other, Question 1 explanation: The explanation says that starting from 2 the 'only increasing chains that follow are 3, 6, 9 or 3, 6, 7'. Taken literally this is false: 2, 8, 9 and 2, 6, 9 are also increasing chains starting from 2. It should say these are the longest chains from 2. The argument also never explicitly rules out starting points other than 2 and 5, though those are obviously shorter. The answer key of 4 is still correct.

## Side by side

Topic `mit-18.05/t00-sets-and-counting-principles`. One notes section and two quiz questions per model, as stored (multiple-choice options already shuffled by the app).

### opus:medium

Notes, section "Key concepts":

> **Set and element.** A set $S$ is a collection of elements. $x \in S$ means $x$ is in $S$.
> *Example:* $3 \in \{1,2,3,4,5\}$.
>
> **Subset.** $A \subset S$ means every element of $A$ is also in $S$.
> *Example:* $\{1,2,3\} \subset \{1,2,3,4,5\}$.
>
> **Union** $A \cup B$. All elements in $A$ **or** $B$, or both.
> *Example:* With $A=\{1,2,3\}$ and $B=\{3,4\}$, $A\cup B = \{1,2,3,4\}$.
>
> **Intersection** $A \cap B$. All elements in **both** $A$ and $B$.
> *Example:* $A \cap B = \{3\}$.
>
> **Complement** $A^c$, also written $S - A$. The elements of $S$ that are **not** in $A$.
> *Example:* In $S=\{1,2,3,4,5\}$, $A^c = \{4,5\}$.
>
> **Difference** $A - B$. Elements in $A$ but not in $B$. It equals $A \cap B^c$.
> *Example:* $A - B = \{1,2\}$.
>
> **Empty set and disjoint sets.** $\emptyset$ is the set with no elements. $A$ and $B$ are *disjoint* if $A \cap B = \emptyset$.
> *Example:* $\{1,2\}$ and $\{4,5\}$ are disjoint.
>
> **DeMorgan's laws.** These connect union, intersection and complement:
> $$(A\cup B)^c = A^c \cap B^c, \qquad (A\cap B)^c = A^c \cup B^c.$$
> In words: "not ($A$ or $B$)" is the same as "(not $A$) and (not $B$)".
> *Example:* With $S=\{1,\dots,5\}$, $A=\{1,2,3\}$ and $B=\{3,4\}$:
> - $(A\cup B)^c = \{5\}$, and $A^c \cap B^c = \{4,5\}\cap\{1,2,5\} = \{5\}$.
> - $(A\cap B)^c = \{1,2,4,5\}$, and $A^c \cup B^c = \{1,2,4,5\}$.
>
> **Venn diagrams.** Draw the whole set $S$ as a rectangle and each subset as ...

Quiz, multiple_choice:

> Let $S = \{1, 2, \dots, 12\}$. Let $A$ be the even numbers in $S$ and $B$ be the multiples of 3 in $S$. What is $A \cap B$?
>   A. $\{2, 4, 8, 10\}$
>   B. $\{6, 12\}$
>   C. $\{2, 3, 4, 6, 8, 9, 10, 12\}$
>   D. $\{3, 9\}$
> Key: B
> Explanation: The intersection contains the elements in **both** sets.

- $A = \{2,4,6,8,10,12\}$
- $B = \{3,6,9,12\}$

The common elements are $\{6, 12\}$.

The other options are wrong for these reasons:

- $\{2,3,4,6,8,9,10,12\}$ is the union $A \cup B$.
- $\{2,4,8,10\}$ is the difference $A - B$.
- $\{3,9\}$ is the difference $B - A$.

Quiz, numerical:

> Let $S = \{1, 2, \dots, 30\}$ and let $A$ be the set of numbers in $S$ that are divisible by 5. How many elements are in the complement $A^c$ (taken in $S$)?
> Key: 24.0
> Explanation: $A = \{5, 10, 15, 20, 25, 30\}$, so $|A| = 6$.

The complement $A^c = S - A$ contains every element of $S$ that is not in $A$. Its size is:

$$|A^c| = |S| - |A| = 30 - 6 = 24$$

