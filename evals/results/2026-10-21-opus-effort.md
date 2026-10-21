# Generation eval: model-choice

- Date: 2026-10-20. Code: `09fa368b1b`, branch `feat/gen-eval`.
- Corpora and topics generated: mit-18.05 4, mit-6.006 4. Topics came from: fixed topics file.
- Models: opus:low, opus:medium. Content types: notes, solved, interactive, quiz.
- Requested per topic: 3 examples of each kind, 10 quiz questions, medium difficulty, comprehensive notes.
- Judge: opus:medium.
- Spend: $7.91 generation, $0.00 topic extraction, $2.72 judge; total $10.63 (caps: $16.00 total, $6.00 judge).

**Stopped early:** generation spend cap reached: $11.8840 spent, next call estimated at $0.1186, cap $12.00

## Cost and latency

Cost uses the app's own price table (`usage.py`) on the token counts the API reported. A topic's cost is the sum of the mean cost of each content type, so the 12-topic projection is for one set of all the types generated here, times 12. Latency is wall time of the app's generator call.

| Model | Per topic | Projected, 12 topics | Notes | Worked examples | Practice problems | Quiz | Seconds per topic | Total spent |
|---|---|---|---|---|---|---|---|---|
| opus:low | $0.523 | $6.28 | $0.131 (29s) | $0.128 (27s) | $0.134 (28s) | $0.131 (25s) | 109s | $0.916 |
| opus:medium | $0.620 | $7.44 | $0.137 (35s) | $0.162 (46s) | $0.178 (51s) | $0.143 (37s) | 169s | $4.961 |

Per-type cells are mean cost per generation and, in brackets, mean seconds.

| Model | Calls | Input tokens | Output tokens | Cache write tokens | Cache read tokens |
|---|---|---|---|---|---|
| opus:low | 7 | 1,513 | 23,978 | 86,014 | 2,582 |
| opus:medium | 32 | 7,519 | 159,220 | 348,043 | 30,009 |

## Automatic checks

No model is involved. These are lexical heuristics: they find things worth reading, they do not prove content right or wrong (see the README for what each can miss). Counts are over every topic generated.

| Check | opus:low | opus:medium |
|---|---|---|
| Plain-text fields with `$` or backslash sequences | 7 | 41 |
| Fields with unbalanced `$` | 0 | 0 |
| Fields with bare currency | 0 | 0 |
| MC explanations naming an option letter (any / strict `Option C`, `(B)`) | 3 / 3 of 3 | 5 / 2 of 26 |
| Quiz recall-copy rate (questions whose numbers all come from this model's notes or examples) | 100% (5 of 5) | 84% (16 of 19) |
| Notes with all expected sections | 2/2 | 8/8 |
| Notes inside the requested word band | 1/2 (mean 1310 words) | 3/8 (mean 1462 words) |
| Notes with 5-8 recap bullets | 1/2 | 4/8 |
| Worked-example sets with the requested count | 2/2 | 8/8 |
| Practice sets with the requested count | 2/2 | 8/8 |
| Quizzes with the requested question count | 1/1 | 8/8 |
| Grounding proxy (share of notes sentences sharing vocabulary with the excerpts) | 68% | 76% |
| Near-duplicate example statements across topics (Jaccard > 0.6) | 0 | 0 |

## Judge

Judged 32 (topic, type) pairs with opus:medium. Each call saw the excerpts and every model's output as anonymous, shuffled candidates, and scored each 1-5. Means are over all judged items.

| Model | Correctness | Grounding | Teaching | Question quality (quiz) | Mathematical errors | All errors |
|---|---|---|---|---|---|---|
| opus:low | 4.57 | 5.00 | 4.00 | 2.00 | 4 | 8 |
| opus:medium | 4.72 | 4.91 | 4.62 | 3.75 | 3 | 15 |

By content type (correctness / teaching, plus question quality for quizzes):

| Model | Notes | Worked examples | Practice problems | Quiz |
|---|---|---|---|---|
| opus:low | 5.00 / 4.50 | 5.00 / 4.00 | 5.00 / 4.00 | 2.00 / 3.00 / 2.00 (4 math err) |
| opus:medium | 4.75 / 4.75 (2 math err) | 4.88 / 4.88 (1 math err) | 4.75 / 4.75 | 4.50 / 4.12 / 3.75 |

### Errors the judge listed

Every error the judge reported, by model. The judge can be wrong; check an error before relying on it.

**opus:low** (8 errors, 4 mathematical)

- [mit-18.05 / t00-counting-and-sets / interactive] other, Problem 1 Step 4; Problem 3 Step 2: These steps are labeled multiple_choice but list no options; they are really yes/no and permutation/combination free responses.
- [mit-18.05 / t00-counting-and-sets / interactive] other, Problem 1 Step 4 hint: The hint gives A^c and B^c outright, so the student only intersects two given sets. This removes most of the work of verifying DeMorgan's law.
- [mit-18.05 / t00-counting-and-sets / quiz] mathematical, Question 1 explanation: The explanation says 'Option A is M^c', but option A, {Antelope, Elephant, Hyena, Jaguar}, is M∩W. M^c is option D.
- [mit-18.05 / t00-counting-and-sets / quiz] mathematical, Question 1 explanation: The explanation says 'Option C is M∩W', but option C, {Cat, Dog, Bee, Frog, Gnat, Iguana}, is (M∩W)^c. M∩W is option A.
- [mit-18.05 / t00-counting-and-sets / quiz] other, Question 7 explanation: The explanation says 'Option D gives the right number for the wrong reason: 4C2'. D is the correct key; the 4C2 distractor is option C.
- [mit-18.05 / t00-counting-and-sets / quiz] mathematical, Question 8 explanation: The explanation says 'Option B counts combinations', but B (4!/2!=12) is the correct permutation answer. The combination count 4!/(2!2!)=6 is option D.
- [mit-18.05 / t00-counting-and-sets / quiz] mathematical, Question 8 explanation: The explanation says 'Option C allows repeated elements'. Lists with repetition give 4^2=16, which is option A. Option C, 2^4, is unrelated: it counts subsets of a 4-element set.
- [mit-18.05 / t01-conditional-probability-and-independence / solved] other, Example 1 title: The title 'Urn with Replacement Rule' is mildly misleading, since the drawn ball is explicitly not returned. A clearer title would be something like 'urn with an add-ball rule'. The mathematics is unaffected.

**opus:medium** (15 errors, 3 mathematical)

- [mit-18.05 / t03-random-variables-and-distributions / notes] mathematical, Exam-Ready Recap, last bullet (Max of two dice): The formula F(a) = a^2/36 is stated without restriction. It holds only for integer a = 1,...,6. For other values it fails: for example F(2.5) = 4/36, not 6.25/36, and F(8) = 1, not 64/36. This contradicts the candidate's own correct values earlier in the notes. The general form is F(a) = ⌊a⌋^2/36 for 1 ≤ a ≤ 6, with F(a) = 0 for a < 1 and F(a) = 1 for a ≥ 6.
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / interactive] other, Practice problem 2, Step 2: The step is labeled multiple_choice but lists no answer options. As written, the student must produce a free-text answer that is matched against a list of accepted phrasings. The step should either list the options or be relabeled as a text step.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / quiz] other, Question 1, explanation: The distractor rebuttals use the wrong letters. It says 'Indexing (A)', but option A is hashing and indexing is option B. It says 'Hashing (C) is also outside the model', but C is the correct answer (pairwise comparisons) and hashing is A. A student checking the explanation against the options would be confused.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / quiz] other, Question 5, explanation: It says 'A is false: a comparison is an internal node', but A is the correct answer. That rebuttal belongs to option D ('Each comparison creates exactly one new leaf'). The explanation therefore appears to contradict the answer key.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / quiz] other, Question 9, explanation: The labels are shifted. It says 'B is binary search', but B is swapping toward the root, a heap operation, and recursive halving is C. It says 'D is a heap operation', but D is the correct answer (Word-RAM indexing). The explanation should say C is binary search and B is a heap operation.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / solved] mathematical, Example 3, Step 4 (order-root case): The order-root splits are listed as '3/1, 2/3, or similar'. A 3/1 split never occurs. With keys a0<a1<a2 and outputs including 'none', k<a0 gives 1/4, k<a1 gives 2/3, k<a2 gives 3/2, and k≤a2 gives 4/1. The conclusion still holds: every root leaves a side with ≥3 outputs, so h ≥ 3. Only the enumerated split sizes are imprecise.
- [mit-6.006 / t03-collision-resolution-with-chaining / interactive] ambiguous_key, Problem 1, Step 5, option D: The distractor reads 'Θ(n/m) with m fixed, which is constant'. With m fixed, Θ(n/m) is Θ(n), the same as the correct answer C. The option is only wrong because of its false 'which is constant' clause. A careful student could see D as partly equivalent to C, so the distractor is muddled.
- [mit-6.006 / t03-collision-resolution-with-chaining / interactive] other, Problem 2, Step 2 explanation: It says 'Collisions cannot be avoided because m < u (pigeonhole principle)'. Pigeonhole only guarantees that some pair of keys collides, as the notes put it ('always exists keys a, b'). It does not guarantee that keys 5 and 7 in particular collide. The wording is slightly loose, but it is unlikely to mislead.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] other, Problem 1, Step 3: The step is labeled multiple_choice but lists no answer options. It reads as a free-text question, so the format does not match the answer key.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 1, Step 3 accepted answers: The question asks for both the running time and the algorithm name. The accepted forms include 'insertion sort' alone, which gives no running time, and 'O(n^2)' alone, which gives no algorithm.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 1, Step 4 accepted answers: The question asks for the running time and whether the sort is in-place. The accepted list includes bare 'n log n', which does not address in-placeness. It should be rejected or marked incomplete.
- [mit-6.006 / t06-balanced-bst-priority-queues / quiz] other, Question 6, explanation: The explanation begins 'Why A is correct', but the answer key, and the correct choice, is B (build(A) in O(n)). The heading should read 'Why B is correct'. The reasoning that follows does justify B, but the mislabel could confuse a student.
- [mit-6.006 / t09-exam-practice-and-review / notes] mathematical, Worked example 3: Triple Sum, sorting approach: It says to sort only C and then, for each a, sweep B and C with two pointers. A two-pointer sweep for b + c = −a needs both B and C sorted: one pointer moves up one array and the other moves down. With only C sorted the sweep is not valid. The correct method sorts both B and C in O(n log n), then runs an O(n) two-pointer pass for each a, giving O(n²) worst-case.
- [mit-6.006 / t09-exam-practice-and-review / notes] unsupported_by_excerpts, Worked example 4(b): Sorting Sock, the scale: It says the decision-tree argument shows comparison sorts need Ω(log n) per item. The excerpts only apply the decision tree to search, where it gives Ω(log n) for one find. The standard sorting result is Ω(n log n) in total, which comes from n! leaves, and that is not derived in the excerpts. The phrasing is loose rather than wrong.
- [mit-6.006 / t09-exam-practice-and-review / quiz] other, Question 7, explanation: The explanation says independent, non-repeating subproblems are 'option A', but option A is 'The input must be sorted before recursing'. The divide-and-conquer distractor it describes is option C. The answer key (B) is still correct.

## Side by side

Topic `mit-18.05/t00-counting-and-sets`. One notes section and two quiz questions per model, as stored (multiple-choice options already shuffled by the app).

### opus:low

Notes, section "Key Concepts":

> ### Set notation
>
> A **set** $S$ is a collection of elements.
>
> - **Element:** $x \in S$ means $x$ is in $S$.
> - **Subset:** $A \subset S$ if every element of $A$ is in $S$.
> - **Complement:** $A^c$ (or $S - A$) is the set of elements of $S$ *not* in $A$.
> - **Union:** $A \cup B$ is the set of elements in $A$ **or** $B$ (or both).
> - **Intersection:** $A \cap B$ is the set of elements in **both** $A$ and $B$.
> - **Empty set:** $\emptyset$, the set with no elements.
> - **Disjoint:** $A$ and $B$ have no common elements, so $A \cap B = \emptyset$.
> - **Difference:** $A - B$ is the set of elements in $A$ that are not in $B$.
>
> **Example (animals).** Take the set of 10 animals
>
> $$S = \{\text{Antelope, Bee, Cat, Dog, Elephant, Frog, Gnat, Hyena, Iguana, Jaguar}\}.$$
>
> Let $M$ be the mammals and $W$ the animals that live in the wild. Then:
>
> - $M \cap W = \{\text{Antelope, Elephant, Hyena, Jaguar}\}$ (the wild mammals)
> - $M \cup W = S$ (every animal is a mammal or wild)
> - $M^c = \{\text{Bee, Frog, Gnat, Iguana}\}$
> - $M - W = \{\text{Cat, Dog}\}$
>
> The same set can often be written in several ways. For example, $M^c = S - M$ and $M - W = M \cap W^c$.
>
> ### DeMorgan's laws
>
> $$(A \cup B)^c = A^c \cap B^c, \qquad (A \cap B)^c = A^c \cup B^c$$
>
> In words, the first law says: "not in ($A$ or $B$)" is the same as "(not in $A$) and (not in $B$)." Taking a complement swaps $\cup$ and $\cap$.
>
> **Check.** Let ...

Quiz, multiple_choice:

> Using the animal example: $S$ = {Antelope, Bee, Cat, Dog, Elephant, Frog, Gnat, Hyena, Iguana, Jaguar}, $M$ = mammals = {Antelope, Cat, Dog, Elephant, Hyena, Jaguar}, $W$ = wild = {Antelope, Bee, Elephant, Frog, Gnat, Hyena, Iguana, Jaguar}. What is $M - W$?
>   A. {Antelope, Elephant, Hyena, Jaguar}
>   B. {Cat, Dog}
>   C. {Cat, Dog, Bee, Frog, Gnat, Iguana}
>   D. {Bee, Frog, Gnat, Iguana}
> Key: B
> Explanation: $M - W$ is the set of elements in $M$ that are not in $W$, which equals $M \cap W^c$. Only Cat and Dog are mammals that do not live in the wild.

- Option A is $M^c$.
- Option C is $M \cap W$.

Quiz, true_false:

> By DeMorgan's laws, $(A \cup B)^c = A^c \cup B^c$.
> Key: False
> Explanation: The correct law is $(A \cup B)^c = A^c \cap B^c$: everything not in ($A$ or $B$) is everything that is (not in $A$) **and** (not in $B$). The union of complements, $A^c \cup B^c$, equals $(A \cap B)^c$ instead.

### opus:medium

Notes, section "Key Concepts":

> ### Set definitions
>
> A **set** $S$ is a collection of elements.
>
> - **Element:** $x \in S$ means $x$ is in $S$.
> - **Subset:** $A \subset S$ if every element of $A$ is in $S$.
> - **Complement:** $A^c$ (or $S - A$) is the set of elements of $S$ that are *not* in $A$.
> - **Union:** $A \cup B$ is the set of elements in $A$ **or** $B$ (or both).
> - **Intersection:** $A \cap B$ is the set of elements in **both** $A$ and $B$.
> - **Empty set:** $\emptyset$ is the set with no elements.
> - **Disjoint:** $A$ and $B$ are disjoint if $A \cap B = \emptyset$.
> - **Difference:** $A - B$ is the set of elements in $A$ that are not in $B$.
>
> ### Worked example: animals
>
> Take
> $$S = \{\text{Antelope, Bee, Cat, Dog, Elephant, Frog, Gnat, Hyena, Iguana, Jaguar}\}.$$
>
> Let $M$ be the mammals, $\{\text{Antelope, Cat, Dog, Elephant, Hyena, Jaguar}\}$, and $W$ the animals that live in the wild, $\{\text{Antelope, Bee, Elephant, Frog, Gnat, Hyena, Iguana, Jaguar}\}$.
>
> - $M \cap W = \{\text{Antelope, Elephant, Hyena, Jaguar}\}$, the wild mammals.
> - $M \cup W = S$, since every animal is a mammal or wild.
> - $M^c = \{\text{Bee, Frog, Gnat, Iguana}\}$.
> - $M - W = \{\text{Cat, Dog}\}$.
>
> The same set can often be written in several ways. For instance, $M^c = S - M$ and $M - W = M \cap W^c$.
>
> ### DeMorgan's laws
>
> $$(A \cup B)^c = A^c \cap B^c \qquad (A \cap B)^c = A^c \cup B^c$$
>
> The first law says that anything not in ...

Quiz, multiple_choice:

> Which set is equal to $(A \cup B)^c$ according to DeMorgan's laws?
>   A. $(A \cap B)^c$
>   B. $A^c \cup B^c$
>   C. $A \cap B$
>   D. $A^c \cap B^c$
> Key: D
> Explanation: DeMorgan's first law states $(A \cup B)^c = A^c \cap B^c$.

Everything **not** in ($A$ or $B$) is exactly what is (not in $A$) **and** (not in $B$).

- $A^c \cup B^c$ is equal to $(A \cap B)^c$, which is the second law.
- $A \cap B$ is not a complement of anything here.

Quiz, numerical:

> In a group of students, 20 take a math class, 15 take a physics class, and 8 take both. How many students take **at least one** of the two classes?
> Key: 27.0
> Explanation: Use the inclusion-exclusion principle:

$$|M \cup P| = |M| + |P| - |M \cap P| = 20 + 15 - 8 = 27.$$

Adding $|M| + |P|$ counts the 8 students in both classes twice, so they are subtracted once.

