# Generation eval: structure

- Date: 2026-10-21. Code: `2f592c383a`, branch `feat/course-structure`.
- Corpora and topics generated: mit-18.05 4, mit-6.006 4. Topics came from: the app's course planner.
- Models: opus:medium. Content types: notes, solved, interactive, quiz.
- Requested per topic: 3 examples of each kind, 10 quiz questions, medium difficulty, comprehensive notes.
- Judge: opus:medium.
- Spend: $4.68 generation, $0.16 topic extraction, $2.16 judge; total $6.99 (caps: $12.00 total, $4.00 judge).

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
| opus:medium | 4.88 | 4.91 | 4.78 | 4.50 | 2 | 8 |

By content type (correctness / teaching, plus question quality for quizzes):

| Model | Notes | Worked examples | Practice problems | Quiz |
|---|---|---|---|---|
| opus:medium | 4.88 / 5.00 (1 math err) | 5.00 / 4.88 | 4.75 / 4.50 (1 math err) | 4.88 / 4.75 / 4.50 |

### Errors the judge listed

Every error the judge reported, by model. The judge can be wrong; check an error before relying on it.

**opus:medium** (8 errors, 2 mathematical)

- [mit-18.05 / t00-sets-and-counting-principles / notes] other, Key concepts, Venn diagrams ASCII figure: The text diagram draws two separate, non-overlapping circles with an '(overlap)' label between them, so it does not actually show L ∩ R as a shared region. The shading rules in the text are correct, but the picture could confuse a first-time reader.
- [mit-18.05 / t03-independence-of-events / interactive] ambiguous_key, Problem 3, Step 1 (text): The free-text answer key is 'A', with alternates 'the event A' and 'A itself'. A correct response written as 'A∩A = A', or with set notation, may not match, so the student could be marked wrong for a right answer. The mathematics itself is correct.
- [mit-18.05 / t08-repeated-updating-and-screening-example / interactive] ambiguous_key, Problem 1, Step 5: The option letters A/B/C collide with the coin type names A/B/C. Option A is 'Type C', and the key 'C' means 'Type A'. The key is correct, since Type A has the highest posterior at about 0.467. However, the labeling invites a student to answer 'A' meaning Type A and be marked wrong. Use distinct labels or matching order.
- [mit-18.05 / t08-repeated-updating-and-screening-example / interactive] other, Problem 1, Step 4: The step asks for 3 decimal places, but 0.08 is also accepted. This is a minor inconsistency in the accepted forms; the value 0.084 itself is correct.
- [mit-6.006 / t04-heap-sort-and-linear-build / interactive] mathematical, Problem 2, Step 4 (feedback and explanation): The feedback says the build makes 'about 1.44n' swaps in total. That figure comes from the approximation height(i) ≈ lg n − lg i, which overestimates the real heights. The exact sum of node heights in a complete binary tree is at most n − 1; Step 1's n = 8 case already shows this, with a sum of 7. The Θ(n) conclusion is correct. The constant 1.44 should be presented as an artifact of the approximation, not as the actual swap count.
- [mit-6.006 / t04-heap-sort-and-linear-build / notes] mathematical, Key concepts > Why one-by-one building is Ω(n lg n), example with n = 16: The note says indices 8 to 15 sit at depth 3. With 0-indexed heap storage, depth(i) = floor(lg(i+1)), so depth 3 holds indices 7 to 14, and index 15 is at depth 4. The count of 8 items (half of n) is right, but the index range is off by one.
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

