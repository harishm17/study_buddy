# Generation eval: model-choice

- Date: 2026-10-20. Code: `09fa368b1b`, branch `feat/gen-eval`.
- Corpora and topics generated: mit-18.05 4, mit-6.006 4. Topics came from: the app's extract_topics_from_materials.
- Models: opus:medium, sonnet:medium, haiku:medium. Content types: notes, solved, interactive, quiz.
- Requested per topic: 3 examples of each kind, 10 quiz questions, medium difficulty, comprehensive notes.
- Judge: opus:medium.
- Spend: $7.00 generation, $0.00 topic extraction, $3.97 judge; total $10.97 (caps: $25.00 total, $10.00 judge).

## Cost and latency

Cost uses the app's own price table (`usage.py`) on the token counts the API reported. A topic's cost is the sum of the mean cost of each content type, so the 12-topic projection is for one set of all the types generated here, times 12. Latency is wall time of the app's generator call.

| Model | Per topic | Projected, 12 topics | Notes | Worked examples | Practice problems | Quiz | Seconds per topic | Total spent |
|---|---|---|---|---|---|---|---|---|
| opus:medium | $0.620 | $7.44 | $0.137 (35s) | $0.162 (46s) | $0.178 (51s) | $0.143 (37s) | 169s | $4.961 |
| sonnet:medium | $0.238 | $2.86 | $0.062 (23s) | $0.060 (21s) | $0.061 (22s) | $0.055 (17s) | 82s | $1.908 |
| haiku:medium | $0.016 | $0.19 | $0.003 (16s) | $0.004 (23s) | $0.005 (27s) | $0.004 (23s) | 88s | $0.128 |

Per-type cells are mean cost per generation and, in brackets, mean seconds.

| Model | Calls | Input tokens | Output tokens | Cache write tokens | Cache read tokens |
|---|---|---|---|---|---|
| opus:medium | 32 | 7,519 | 159,220 | 348,043 | 30,009 |
| sonnet:medium | 32 | 7,519 | 101,644 | 348,043 | 30,009 |
| haiku:medium | 32 | 7,519 | 166,555 | 346,338 | 31,714 |

## Automatic checks

No model is involved. These are lexical heuristics: they find things worth reading, they do not prove content right or wrong (see the README for what each can miss). Counts are over every topic generated.

| Check | opus:medium | sonnet:medium | haiku:medium |
|---|---|---|---|
| Plain-text fields with `$` or backslash sequences | 41 | 20 | 47 |
| Fields with unbalanced `$` | 0 | 0 | 0 |
| Fields with bare currency | 0 | 0 | 0 |
| MC explanations naming an option letter (any / strict `Option C`, `(B)`) | 5 / 2 of 26 | 2 / 1 of 29 | 14 / 14 of 27 |
| Quiz recall-copy rate (questions whose numbers all come from this model's notes or examples) | 84% (16 of 19) | 87% (13 of 15) | 60% (9 of 15) |
| Notes with all expected sections | 8/8 | 8/8 | 8/8 |
| Notes inside the requested word band | 3/8 (mean 1462 words) | 8/8 (mean 1283 words) | 8/8 (mean 1115 words) |
| Notes with 5-8 recap bullets | 4/8 | 7/8 | 8/8 |
| Worked-example sets with the requested count | 8/8 | 8/8 | 8/8 |
| Practice sets with the requested count | 8/8 | 8/8 | 8/8 |
| Quizzes with the requested question count | 8/8 | 8/8 | 3/8 |
| Grounding proxy (share of notes sentences sharing vocabulary with the excerpts) | 76% | 80% | 79% |
| Near-duplicate example statements across topics (Jaccard > 0.6) | 0 | 0 | 0 |

## Judge

Judged 32 (topic, type) pairs with opus:medium. Each call saw the excerpts and every model's output as anonymous, shuffled candidates, and scored each 1-5. Means are over all judged items.

| Model | Correctness | Grounding | Teaching | Question quality (quiz) | Mathematical errors | All errors |
|---|---|---|---|---|---|---|
| opus:medium | 4.81 | 4.88 | 4.84 | 4.38 | 0 | 9 |
| sonnet:medium | 4.53 | 4.91 | 3.84 | 3.25 | 6 | 26 |
| haiku:medium | 4.19 | 4.66 | 3.75 | 2.62 | 7 | 43 |

By content type (correctness / teaching, plus question quality for quizzes):

| Model | Notes | Worked examples | Practice problems | Quiz |
|---|---|---|---|---|
| opus:medium | 5.00 / 4.88 | 5.00 / 4.88 | 4.88 / 5.00 | 4.38 / 4.62 / 4.38 |
| sonnet:medium | 4.50 / 4.62 (2 math err) | 4.75 / 3.88 (3 math err) | 4.25 / 3.25 | 4.62 / 3.62 / 3.25 (1 math err) |
| haiku:medium | 4.12 / 3.88 (3 math err) | 4.62 / 4.12 | 4.25 / 3.62 | 3.75 / 3.38 / 2.62 (4 math err) |

### Errors the judge listed

Every error the judge reported, by model. The judge can be wrong; check an error before relying on it.

**opus:medium** (9 errors, 0 mathematical)

- [mit-18.05 / t03-random-variables-and-distributions / interactive] other, Practice problem 2, Step 2: The prompt asks a 'why' question but then wants only the number C(5,2). The conceptual part cannot be graded. This is minor; the explanation does supply the reasoning.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / quiz] other, Question 1 explanation: The distractor labels are wrong. It says 'Indexing (A)' and 'Hashing (C)', but option A is hashing, B is indexing, and C is the correct answer. A student would see the correct option C described as outside the model.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / quiz] other, Question 5 explanation: It says 'A is false: a comparison is an internal node', but A is the answer key. That rebuttal applies to option D ('Each comparison creates exactly one new leaf'). The explanation contradicts its own key.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / quiz] other, Question 9 explanation: The distractors are mislabeled. It says 'B is binary search' and 'D is a heap operation', but B (swapping toward the root) is the heap operation, C (recursive halving) is binary search, and D is the correct answer.
- [mit-6.006 / t03-collision-resolution-with-chaining / notes] unsupported_by_excerpts, Example: Quiz 1, 'Frequentest': The excerpts give only the problem statement, not the answers. The expected O(n) answer for the dict version and the worst-case reasoning are standard and correct, but they are not supported by the course materials. The code also silently replaces the OCR'd '-' with '>', which is a reasonable reading but an interpretation.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 1, Step 3 (multiple_choice): This is labelled multiple choice, but no options are given. The key is a compound free-text answer, and the accepted forms include 'insertion sort' alone, which drops the O(n^2) part that the question asks for.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 1, Step 4: The accepted answers include bare 'n log n', which omits the in-place half of the question that the prompt explicitly requires.
- [mit-6.006 / t06-balanced-bst-priority-queues / quiz] other, Question 6 explanation: The explanation is headed 'Why A is correct:' but the answer key is B (build in O(n)), and the reasoning that follows is about B. The heading should read 'Why B is correct'. A student could be briefly confused.
- [mit-6.006 / t09-exam-practice-and-review / quiz] other, Question 7 explanation: It says 'Independent, non-repeating subproblems (option A) describe plain divide and conquer.' The independent/non-repeating distractor is option C. Option A is 'The input must be sorted before recursing.' The key (B) is still correct.

**sonnet:medium** (26 errors, 6 mathematical)

- [mit-18.05 / t00-counting-and-sets / interactive] ambiguous_key, Practice problem 1, Step 4: The step asks the student to give the set A^c ∩ B^c. The accepted forms include 'yes', which does not answer that request, so a student could pass without computing the set. The list also repeats '{6}'. Only '{6}' or equivalent forms should be accepted.
- [mit-18.05 / t00-counting-and-sets / interactive] other, Practice problem 2, Step 3: The step is labelled multiple choice, but no answer options are shown to the student. The explanation mentions 'other options' that never appear.
- [mit-18.05 / t00-counting-and-sets / interactive] ambiguous_key, Practice problem 1, Step 1: The question is numeric and asks for the number of elements, yet '{3,4}' is accepted as an answer. This is a minor inconsistency in the key.
- [mit-18.05 / t01-conditional-probability-and-independence / interactive] ambiguous_key, Problem 2, Step 1: The question asks for P(S1∩S2) 'as a fraction in lowest terms', but the listed correct answer is 3/51, which is not reduced. The lowest-terms answer is 1/17. It is accepted as an alternate, but the primary key contradicts the prompt.
- [mit-18.05 / t03-random-variables-and-distributions / interactive] other, Practice problem 3, Step 4: This step is labeled multiple_choice, but the options (Y = X, Y = X + 1, Y = 2X) appear only in the guidance shown after a wrong answer. The student never sees the choices when answering.
- [mit-18.05 / t03-random-variables-and-distributions / interactive] ambiguous_key, Practice problem 3, Step 1: The answer is a free-text formula, (1-p)^k p. Many equivalent ways of writing it, such as p*(1-p)^k or (1−p)^k·p, could be marked wrong by string matching.
- [mit-18.05 / t03-random-variables-and-distributions / interactive] other, Problem 1 Steps 2–4; Problem 2 Step 3: Fraction answers are typed as 'text' instead of numeric. This makes grading of equivalent forms fragile; for example, 0.1111 is not accepted for F(2.5).
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / interactive] ambiguous_key, Problem 1, Step 1 accepted answers: The accepted-answer list is itself comma-separated. The entry '2/5, 2/5, 1/5' therefore cannot be told apart from three separate accepted answers, which could cause wrong grading of a three-value answer.
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / interactive] ambiguous_key, Problem 3, Step 4 (text): This is a free-text 'why' question with a long model answer and loose accepted forms such as 'the prior'. Automatic grading of student explanations is unreliable here.
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / quiz] mathematical, Question 8: The answer key is 0.4122, but the correct posterior is 0.162/0.406 ≈ 0.3990, which the explanation itself computes. A student who answers correctly would be marked wrong under the 0.002 tolerance, and the explanation contradicts the key.
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / quiz] other, Question 4 explanation: It says 'Only the posterior column sums to 1'. The prior column also sums to 1, as the source notes that prior and posterior both define pmfs. This is a minor misstatement.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / interactive] ambiguous_key, Problem 1 Step 4; Problem 2 Steps 3 and 4; Problem 3 Step 4 (multiple_choice): These multiple-choice steps list no options. The keys are long sentences, so the student has to guess the wording, which makes them effectively free-text.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / interactive] other, Problem 1, Step 3: The step reuses n: it is first 15 items, then becomes 16 'nodes'. It also bounds a 16-leaf tree using only 16 nodes, when such a tree actually has at least 31 nodes. The answer of 4 is still a valid bound and equals the true minimum (lg 16 = 4), but the reasoning is confusing.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / interactive] ambiguous_key, Problem 2, Step 1: The question asks for an exact formula, ceil(lg(n+1)) - 1, but the key also accepts 'Omega(log n)', which is only an asymptotic bound and not the requested formula.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / solved] mathematical, Example 1, Step 4: The step plugs the leaf count n+1 = 1024 into the notes' node-count formula ⌈lg N⌉−1 and gets a bound of 9. That formula applies to the number of tree nodes, not leaves. A tree with ≥1024 leaves has ≥2047 nodes, so the node formula also gives 10. The muddled '9 for node count' line is confusing, although the step does settle on the correct value of 10.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / solved] other, Example 2, Step 1: The step states that binary search uses about ⌈lg(n+1)⌉ comparisons. That count assumes three-way compares. With strictly binary True/False comparisons, the worst case can be slightly higher. This is a minor imprecision with no effect on the O(log n) conclusion.
- [mit-6.006 / t03-collision-resolution-with-chaining / interactive] other, Problem 1 Step 3 and Problem 3 Step 3: These steps are labeled multiple_choice but list no options, so the student must guess the expected form. The keys themselves (O(1), expected amortized O(1)) are correct.
- [mit-6.006 / t03-collision-resolution-with-chaining / notes] mathematical, How It Works > Why universality gives short chains (intuition paragraph): Says a given key 'expects fewer than (n-1)/m other keys' in its slot. Universality only gives an upper bound, so the correct statement is 'at most (n-1)/m'. This is a minor slip.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 1, Step 3 and Problem 2, Step 3 (multiple_choice): These are labelled multiple choice, but no options are presented to the student.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 2, Steps 1-2; Problem 3, Steps 1, 3 and 4: These steps have compound free-text answers that combine two costs or a long explanation, and only a few accepted forms are listed. Correct student answers are likely to be marked wrong.
- [mit-6.006 / t06-balanced-bst-priority-queues / quiz] other, Question 1 explanation: The explanation says 'Option C describes the unordered array', but C is the correct answer (all operations O(log n)). It is option B (insert O(1) amortized, delete max O(n)) that describes the unordered array. This mislabelling could confuse students.
- [mit-6.006 / t06-balanced-bst-priority-queues / solved] mathematical, Example 2, Step 1: The step says node.max is the best of three candidates using '3 comparisons'. Finding the maximum of three items takes 2 comparisons. The conclusion that this is O(1) work is still correct.
- [mit-6.006 / t06-balanced-bst-priority-queues / solved] other, Example 1, title vs. problem: The title promises four data structures, but the problem asks about only three (unordered array, sorted array, Set AVL). The heap appears only briefly in Step 5 and is left out of the final answer.
- [mit-6.006 / t06-balanced-bst-priority-queues / solved] mathematical, Example 1, Step 3 / Final answer: The sorted dynamic array sort is stated as Θ(n^2). That is only the worst case: if the input arrives already sorted, each insert needs no swaps, so the sort is O(n). The lecture states the bound as O(n^2) / n^2 in the table, which is an upper bound.
- [mit-6.006 / t09-exam-practice-and-review / notes] mathematical, How It Works, Problem 5(c): It claims that extracting with the O(1) 'bravest of a set' oracle gives O(n log n) with a heap or O(n^2) naively. Because the oracle returns the maximum of any set in O(1), selection sort with it runs in O(n).
- [mit-6.006 / t09-exam-practice-and-review / notes] factual, How It Works, Problem 5(d): It says lineage values are bounded by 3⌈log n⌉+4. That expression is the number of generations, not the count. Ancestors number up to about 2^(3⌈log n⌉+5) = O(n^3), so counting sort alone is not O(n); radix sort is needed to get O(n).

**haiku:medium** (43 errors, 7 mathematical)

- [mit-18.05 / t00-counting-and-sets / notes] mathematical, How It Works, section 1 (set operations), M ∪ W bullet: The bullet first says M ∪ W is 'all animals except Cat and Dog', then 'every animal in S except none', then tells the student to check. The first claim is wrong because Cat and Dog are mammals and so belong to M ∪ W. The correct statement is M ∪ W = S, all 10 animals, as the source shows. The self-correcting wording is confusing and could mislead.
- [mit-18.05 / t00-counting-and-sets / quiz] mathematical, Question 2 explanation: Says 'Option A forgets the subtraction', but option A is 9. Forgetting the subtraction gives 12+5=17, which is option D.
- [mit-18.05 / t00-counting-and-sets / quiz] ambiguous_key, Question 4: The statement contradicts itself: 'the number of ways to do action 2 depends on … action 1, as long as the number of ways for action 2 stays the same.' The course says the specific ways may depend on action 1, while the number must not. As written, the True key is ill-posed.
- [mit-18.05 / t00-counting-and-sets / quiz] mathematical, Question 5 explanation: Says 'Option D, 56', but option D is 24. The value 56 (=8C3) is option A.
- [mit-18.05 / t00-counting-and-sets / quiz] other, Question 6 explanation: Calls option B the second-law distractor, but option B is A ∪ B^c. The second-law expression A^c ∪ B^c is option D.
- [mit-18.05 / t01-conditional-probability-and-independence / interactive] other, Problem 1, Step 5 explanation: The explanation says 'Step 6 then checks independence', but there is no Step 6. The independence question posed in the problem statement is never asked as a step; its conclusion is only tucked into the Step 5 explanation.
- [mit-18.05 / t01-conditional-probability-and-independence / interactive] other, Problem 2, Step 4 prompt; Problem 1, Step 4 hint: The prompts and hints give the answer away. Problem 2 Step 4 embeds 'Hint: the event consists of HHT and HTH' in the question itself, duplicating the hint field. Problem 1 Step 4's hint states that the urn has 5 red and 1 green, so the student does nothing.
- [mit-18.05 / t01-conditional-probability-and-independence / quiz] mathematical, Question 3 explanation: The explanation correctly computes P(A)=0.23 and keys option A. It then says 'Option A comes from averaging the three conditional probabilities without weighting them by P(B_i).' That labels the correct answer as the error. An unweighted average gives (0.5+0.2+0.1)/3≈0.267, which is not among the options. The distractor diagnosis is wrong and contradicts the key, which could confuse a student.
- [mit-18.05 / t01-conditional-probability-and-independence / solved] other, Examples 1–3, Work fields: Literal '\n' sequences appear in place of line breaks (e.g., '$\Omega=...$\n$H_1=...$'). This garbles the display for the student. Content is unaffected.
- [mit-18.05 / t03-random-variables-and-distributions / interactive] other, Practice problem 2, Step 4: The problem statement already says X ~ Binomial(5, p) with p = 1/2, so asking which distribution X follows only checks copying, not understanding.
- [mit-18.05 / t03-random-variables-and-distributions / interactive] other, Practice problem 3, Step 4: The stem already gives the geometric pmf (1-p)^k p and p = 1/3, so naming the distribution geometric(1/3) is trivial and teaches nothing new.
- [mit-18.05 / t03-random-variables-and-distributions / notes] other, Key Concepts, Payoff functions: Unescaped dollar signs in 'win $500 if $i+j=7$, otherwise lose $100' will break math rendering. This is a formatting issue, not a content error.
- [mit-18.05 / t03-random-variables-and-distributions / quiz] mathematical, Question 1 explanation: The distractor analysis is mislabeled. It says Option A is the pmf at 4 (7/36), but A is 9/36 and C is 7/36. It calls Option C the pmf at 5 (9/36), but C is 7/36. It calls Option D F(5), but D (16/36) is the correct answer and B (25/36) is F(5).
- [mit-18.05 / t03-random-variables-and-distributions / quiz] other, Question 4 explanation: The distractors are mislabeled. The explanation says Option A describes a Bernoulli variable, but A is {1,...,n} and B ('only 0 and 1') is the Bernoulli case. It says Option D describes the geometric distribution, but D is the correct answer and C (all nonnegative integers) is geometric.
- [mit-18.05 / t03-random-variables-and-distributions / quiz] other, Question 9 explanation: The distractors are mislabeled. The explanation says Option B multiplies the trial counts, but B is Uniform(n+m) and C is Binomial(nm,1/2). It says Option C changes the success probability, but that is Option D, Binomial(n+m,1/4).
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / notes] other, How It Works – Updating repeatedly: The text says to multiply the first posterior by the new likelihood. The column headed 'Prior (after H1)' lists 0.2, 0.24, 0.18, but those are the unnormalized first Bayes numerators, not the posterior (0.3226, 0.3871, 0.2903). The final posteriors are still correct because only the ratios matter. The labeling is inconsistent and could confuse a student.
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / notes] other, How It Works – Step 2: It writes the likelihood as P(H|A), using H for heads. This clashes with the hypothesis notation ℋ used elsewhere and in the course.
- [mit-18.05 / t04-bayesian-updating-with-discrete-priors / notes] unsupported_by_excerpts, Overview: It claims this topic is 'the first place the course applies' Bayes' theorem as inferential statistics. The excerpts do not establish this; Class 10 already introduces statistics and likelihood.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / interactive] ambiguous_key, Practice problem 1, Step 3 (multiple_choice): The step is labelled multiple choice and accepts 'B' as an answer, but no options are listed. A student cannot know what 'B' refers to.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / interactive] ambiguous_key, Practice problem 3, Step 3: Options are given only inline ('Choose A) Yes or B) No'), which works. The format is inconsistent with Problem 1 Step 3, where no options appear at all. This is a minor issue.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / notes] mathematical, Key Concepts, Minimum height: The notes say the −1 comes from 'subtracting one for the number of edges in the lecture's convention.' That is wrong. A tree with L leaves already has edge-height ≥ ⌈lg L⌉. The lecture's ⌈lg(n+1)⌉−1 is the minimum height of a binary tree on ≥ n nodes, not on n+1 leaves. Subtracting 1 from the leaf bound is not a convention change; it gives a weaker but still valid bound.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / notes] mathematical, How It Works, Worked illustration (n=7): The notes claim that a median-comparison search achieves exactly 3 comparisons for 7 items plus 'not found', so the bound is tight. This is false. Each 'found' output must be certified by an equality test, or by matching ≤ and ≥ tests. With only 3 binary comparisons, you cannot produce 7 distinct found-leaves plus not-found leaves. Real comparison search needs more than 3 comparisons here. The bound is tight only asymptotically.
- [mit-6.006 / t00-comparison-model-and-lower-bounds / notes] other, Key Concepts, Running time as a count of comparisons: The notes say 'every operation the algorithm performs is a comparison.' The lecture claims only that running time ≥ number of comparisons. The notes contradict themselves later in Pitfall 2.
- [mit-6.006 / t03-collision-resolution-with-chaining / interactive] ambiguous_key, Problem 1 Step 4 and Problem 3 Step 4: These multiple-choice steps give answer keys 'B' and 'C' and discuss options A–D in the explanation, but the options never appear in the question. The student cannot answer meaningfully.
- [mit-6.006 / t03-collision-resolution-with-chaining / interactive] factual, Problem 1 Step 4 explanation: It claims the Θ(n) worst case applies to a bad hash function and 'not for a universal family'. Even with a universal family, an unlucky choice of h can produce a Θ(n) chain; the O(1) guarantee is only in expectation.
- [mit-6.006 / t03-collision-resolution-with-chaining / interactive] other, Problem 3 Step 4 explanation, option B: The justification 'the question only asks for a constant-size bound' is confusing. m ≫ n also gives O(1) expected time; the real objection is wasted space.
- [mit-6.006 / t03-collision-resolution-with-chaining / quiz] other, Question 1 explanation: The explanation says 'Option D is wrong because n/m is the average chain length...'. That reasoning applies to option B (Θ(n/m)), not option D (Θ(log n)).
- [mit-6.006 / t03-collision-resolution-with-chaining / quiz] other, Question 3 explanation: The explanation says 'Options A and B do not describe why collisions are unavoidable'. A is the correct answer, so the incorrect options are B, C and D.
- [mit-6.006 / t03-collision-resolution-with-chaining / quiz] other, Question 6 explanation: The explanation says 'Option C is wrong because the guarantee for find is expected, not worst-case'. C is the answer key. That reasoning refutes option A.
- [mit-6.006 / t03-collision-resolution-with-chaining / quiz] ambiguous_key, Question 8: The key is False, but the explanation itself states that insert takes O(1) at the front of the chain and find takes Θ(n). That is exactly what the statement claims, so the explanation contradicts its own key. The explanation also says the excerpts claim 'all operations on a chain of size Θ(n) are slow', which they do not say explicitly. Whether insert must first check for duplicates is left unresolved, so the key is wrong or at best ambiguous.
- [mit-6.006 / t03-collision-resolution-with-chaining / quiz] other, Question 1 stem: The stem asks for the 'expected' running time under a deterministic constant hash function. The randomness this expectation refers to is unclear; the intended quantity is the cost determined by the chain length.
- [mit-6.006 / t03-collision-resolution-with-chaining / solved] other, Example 3, Step 2 (Why): It says rebuilding 'brings the load factor back to Θ(1)'. Load factor 4 was already Θ(1) asymptotically. The course's rule is about n/m being far from 1, not about leaving Θ(1). The justification is imprecise, though the arithmetic is correct.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 1, Step 3 (multiple_choice): The key is 'B', but no answer options are shown. A student cannot know that B means 'No'.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] ambiguous_key, Problem 3, Step 2 (multiple_choice): The key is 'B', but the options are never listed, so the letter answer has no referent for the student.
- [mit-6.006 / t06-balanced-bst-priority-queues / interactive] other, Problem 2, Step 4: The prompt asks 'which ... and why' but then says to answer with the structure name only. The 'why' part is never assessed.
- [mit-6.006 / t06-balanced-bst-priority-queues / notes] factual, How It Works – 'Why sorting cannot beat n log n with these structures': Misstates the Lecture 4 result. Excerpt 15 gives an Ω(log n) lower bound for comparison search, not 'Ω(log n) work per operation in a balanced tree'. The paragraph also concludes the sort 'cannot do better than O(n log n)', where a lower bound needs Ω(n log n). The reasoning is garbled and would mislead a student.
- [mit-6.006 / t06-balanced-bst-priority-queues / notes] other, How It Works – Worked contrast, unordered array: The text says delete max swaps the max to the end and removes it. Applied to [3,1,2], that leaves [2,1], not the [1,2] shown. The mismatch is minor and does not change the outputs.
- [mit-6.006 / t06-balanced-bst-priority-queues / notes] unsupported_by_excerpts, Comparison of costs – goal sentence: States the goal as 'log n (or 1)' for insert and delete max. The excerpt's goal row lists log n (amortized), with no O(1) option.
- [mit-6.006 / t06-balanced-bst-priority-queues / solved] factual, Example 3, Step 2 (Why): The step says Sequence AVL linear build is 'the same trick used for heap construction: work done at higher nodes is bounded by the sizes of their subtrees.' The mechanisms differ. Sequence AVL build is a recursive middle-split, T(n)=2T(n/2)+O(1)=O(n). Heap build sums node heights, which is Θ(lg(n^n/n!))=O(n). Bounding each node's work by its subtree size would only give O(n log n), so the stated justification does not yield linear time. The lecture only notes that both structures share a linear build time.
- [mit-6.006 / t09-exam-practice-and-review / interactive] factual, Practice problem 1, Step 3 explanation: It claims 'The max(X) call is only used in the first function', but frequentest_b also begins with k = max(X). It costs O(n), so the O(n) answer is unchanged, but the description of the code is wrong.
- [mit-6.006 / t09-exam-practice-and-review / interactive] other, Practice problem 3, Step 1: The step is labelled multiple_choice and says 'Choose one', but no options are listed.
- [mit-6.006 / t09-exam-practice-and-review / notes] unsupported_by_excerpts, Overview: It says the quiz covers dynamic programming. No Quiz 1 problem in the excerpts involves DP; DP appears only in the Lecture 16 review excerpt.
- [mit-6.006 / t09-exam-practice-and-review / solved] other, Example 3, Steps 1 and 4: Hash table insertion is described as plain expected O(1), and the candidate says amortized bounds are not needed. The lecture table lists dynamic insert as expected amortized O(1) (1(a)(e)), so inserting n^2 sums one at a time is expected amortized per operation. The final expected O(n^2) total is still correct, but the stated qualifier is imprecise.

## Side by side

Topic `mit-18.05/t00-counting-and-sets`. One notes section and two quiz questions per model, as stored (multiple-choice options already shuffled by the app).

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

### sonnet:medium

Notes, section "Key Concepts":

> ### Set notation
>
> A **set** $S$ is a collection of elements.
>
> - **Element:** $x \in S$ means $x$ is in $S$.
> - **Subset:** $A \subset S$ means every element of $A$ is in $S$.
> - **Complement:** $A^c$ (or $S - A$) is everything in $S$ that is **not** in $A$.
> - **Union:** $A \cup B$ is everything in $A$ **or** $B$ (or both).
> - **Intersection:** $A \cap B$ is everything in both $A$ **and** $B$.
> - **Empty set:** $\emptyset$ has no elements.
> - **Disjoint:** $A$ and $B$ are disjoint if $A \cap B = \emptyset$.
> - **Difference:** $A - B$ is the elements of $A$ not in $B$; equivalently $A \cap B^c$.
>
> **Worked example (animals).** Let $S$ be 10 animals, $M$ the mammals, $W$ the wild animals. Then:
>
> - $M \cap W$ = wild mammals = {Antelope, Elephant, Hyena, Jaguar}
> - $M^c$ = {Bee, Frog, Gnat, Iguana}
> - $M - W$ = {Cat, Dog}, which equals $M \cap W^c$
>
> The same set can often be written several ways, e.g. $M^c = S - M$.
>
> ### DeMorgan's laws
>
> $$(A \cup B)^c = A^c \cap B^c \qquad (A \cap B)^c = A^c \cup B^c$$
>
> Intuition: "not (A or B)" means "not A **and** not B". The second law is the mirror image: "not (A and B)" means "not A **or** not B". Complementing swaps union and intersection.
>
> Check with $S=\{1,2,3,4,5\}$, $A=\{1,2,3\}$, $B=\{3,4\}$: $(A\cup B)^c=\{5\}$ and $A^c\cap B^c=\{4,5\}\cap\{1,2,5\}=\{5\}$. Also $(A\cap B)^c=\{3\}^c=\{1,2,4,5\}=A^c\cup B^c$.
>
> ### Product of sets
>
> $S \times T = ...

Quiz, multiple_choice:

> Let $S=\{1,2,3,4,5\}$, $A=\{1,2,3\}$ and $B=\{3,4\}$. What is $(A\cup B)^c$?
>   A. $\{4,5\}$
>   B. $\{1,2,4,5\}$
>   C. $\{5\}$
>   D. $\{3\}$
> Key: C
> Explanation: $A\cup B=\{1,2,3,4\}$, so its complement in $S$ is $\{5\}$. This matches $A^c\cap B^c=\{4,5\}\cap\{1,2,5\}=\{5\}$ by DeMorgan's first law.

Quiz, numerical:

> In a band, seven people sing, four play guitar, and two do both. Using inclusion-exclusion, how many people are in the band?
> Key: 9.0
> Explanation: $|S\cup G|=|S|+|G|-|S\cap G|=7+4-2=9$. Adding 7 and 4 double-counts the two who do both.

### haiku:medium

Notes, section "Key Concepts":

> **Basic set notation**
>
> - **Element:** $x \in S$ means $x$ is in the set $S$.
> - **Subset:** $A \subset S$ means every element of $A$ is in $S$.
> - **Complement:** $A^c$ (or $S - A$) is the set of elements of $S$ that are *not* in $A$.
> - **Union:** $A \cup B$ is the set of elements in $A$ **or** $B$ (or both).
> - **Intersection:** $A \cap B$ is the set of elements in **both** $A$ and $B$.
> - **Difference:** $A - B$ is the set of elements in $A$ that are *not* in $B$.
> - **Disjoint:** $A$ and $B$ are disjoint if $A \cap B = \emptyset$.
> - **Empty set:** $\emptyset$ is the set with no elements.
>
> **Counting notation**
>
> For a finite set $S$, $|S|$ (or $\#S$) is the number of elements of $S$.
>
> **Permutations and combinations**
>
> - A **permutation** is an ordered list. The number of ordered lists of $k$ distinct elements from a set of size $n$ is ${}_nP_k$.
> - A **combination** is an unordered subset. The number of subsets of size $k$ from a set of size $n$ is ${}_nC_k$, read "$n$ choose $k$."
>
> **Products of sets**
>
> $S \times T = \{(s,t) \mid s \in S,\ t \in T\}$ is the set of ordered pairs. For example, $\{1,2,3\} \times \{1,2,3,4\}$ has $3 \cdot 4 = 12$ elements.

Quiz, multiple_choice:

> Let the set of animals be S = {Antelope, Bee, Cat, Dog, Elephant, Frog, Gnat, Hyena, Iguana, Jaguar}, with M = mammals and W = animals that live in the wild. Which set is M − W (the difference)?
>   A. {Antelope, Elephant, Hyena, Jaguar}
>   B. {Cat, Dog}
>   C. {Bee, Frog, Gnat, Iguana}
>   D. {Cat, Dog, Bee, Frog, Gnat, Iguana}
> Key: B
> Explanation: M − W contains the elements of M that are not in W. The mammals are {Antelope, Cat, Dog, Elephant, Hyena, Jaguar}. Removing the wild animals {Antelope, Elephant, Hyena, Jaguar} leaves {Cat, Dog}. Option A is M ∩ W, the wild mammals.

Quiz, short_answer:

> Explain in 1 to 3 sentences why the number of ordered lists of 2 items from 4 things (4P2 = 12) is twice the number of 2-element subsets (4C2 = 6).
> Sample answer: Each 2-element subset can be listed in 2! = 2 orders, so each combination corresponds to two permutations. Hence 4P2 = 4C2 × 2! = 6 × 2 = 12. Permutations count ordered lists while combinations count subsets, where order does not matter.
> Explanation: The key relation is that every subset of size k can be ordered in k! ways. Permutations therefore equal combinations multiplied by k!. This is the same reason 3-element combinations of {a,b,c,d} each correspond to 6 permutations.

