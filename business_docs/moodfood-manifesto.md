# MoodFood: A Manifesto for Food That Meets the Moment

> **From “I’m hungry” to a choice that feels right—and a meal that actually happens.**

## Why this document exists

This manifesto describes the problem MoodFood is being built to solve, what the current product is trying to become, the evidence that supports the underlying direction, and the boundaries we should preserve as we build. It draws on the repository’s product description, architecture, recommendation schema, personalization/game plan, design references, and documented gaps. It is a product thesis—not a claim that MoodFood has already demonstrated clinical, nutritional, or commercial outcomes.

## The problem: choosing food is not just finding food

Food discovery is abundant; useful decisions are still hard. At the moment someone wants to eat, they may be hungry, tired, stressed, celebrating, short on time, watching a budget, eating with other people, or simply unable to articulate what sounds good. Those conditions change from meal to meal. A static preference profile or a long restaurant catalogue cannot fully capture them.

The familiar question “What should I eat?” is deceptively complex. It combines at least four questions:

1. **What do I want right now?** Current appetite, mood, energy, cravings, and occasion.
2. **What will work for me?** Taste, dietary needs, allergies, budget, time, portion, location, and availability.
3. **How do I get it?** Delivery, cooking, groceries, or another practical route.
4. **Will I be glad I chose it?** Satisfaction is only known after the meal, and preferences are personal.

Conventional discovery often makes the person do most of this work: browse, filter, compare, second-guess, and translate a vague feeling into a concrete order. MoodFood’s opportunity is to reduce that cognitive and emotional friction without taking away choice.

## Our purpose

**MoodFood helps people make a satisfying, practical food decision that fits how they feel and what their circumstances allow—then learns, with permission, from whether the choice worked.**

This is not simply another restaurant catalogue, calorie tracker, recipe collection, or chatbot. It is an intent-to-meal companion: it starts with the person’s present state, offers a small and legible set of options, explains the fit, and helps turn a decision into eating—through ordering or cooking.

The product promise in the repository captures the essential shape: a quick mood check-in or short game; context such as time and weather; a few recommendations with reasons; ordering through Swiggy or converting a pick into a recipe and Instamart ingredients. The experience is meant to move someone from indecision to action, not trap them in more browsing.

## The product thesis

A useful recommendation is not “the most popular dish” in the abstract. It is a candidate that balances:

- **State:** mood, energy, hunger, stress, and appetite in this moment.
- **Taste:** known likes, dislikes, cuisine, texture, spice, and comfort-food anchors.
- **Situation:** time of day, weather, occasion, who is eating, time available, and location.
- **Constraints:** budget, dietary pattern, allergies, availability, preparation effort, and delivery feasibility.
- **Learning:** whether the person selected the option and how they felt about the outcome.

MoodFood’s personalization plan explicitly distinguishes temporary state (“why now”) from more durable taste (“what”), situational context (“when, where, with whom”), and outcome calibration (“was that good?”). That distinction matters. A person’s momentary wish for comfort should not silently overwrite their long-term taste profile; declining a dish today should not mean they dislike it forever.

## What MoodFood is building

The repository describes an evolving product, not a finished, validated system. Its intended capabilities include:

- **Low-friction mood and appetite check-ins**, plus optional playful interactions that make preference expression easier than filling out a long form.
- **A small set of contextual recommendations**, with understandable reasons rather than a black-box ranking.
- **Practical alternatives**, including budget or dietary swaps where their claims can be substantiated.
- **Multiple paths to a meal:** discover/order through commerce integrations, or cook from a recipe and source ingredients.
- **A personal learning loop:** check-ins, choices, skips, game responses, orders, and post-meal feedback can improve future suggestions.
- **A responsive experience:** the “living theme” concept reflects time, weather, and mood in the interface; these cues should support the experience, not pretend to diagnose the user.
- **Optional engagement:** quests, streaks, and group or game experiences can make discovery enjoyable, but must serve user value rather than engagement for its own sake.

The current technical direction supports this ambition: an Expo mobile/web product, a NestJS API, a Python intelligence service, persistent user and signal data, and links to commerce and recipe flows. The monorepo also contains earlier, superseded product surfaces and architecture documents that describe previous iterations. The manifesto therefore takes the current README and MoodFood 2.0 product framing as the primary statement of intent, while treating older materials as historical/product thinking rather than proof of shipped capabilities.

## Why mood belongs in food discovery

Food choice is shaped by more than stable preference. Research in psychology and behavioral science treats eating as responsive to internal states and external cues, including hunger, emotion, learned associations, social setting, and food availability. Emotional eating is a real and studied phenomenon, but its direction and meaning vary across individuals and situations. It would be an overreach to claim that a particular emotion universally calls for a particular food—or that an app can infer what someone “needs” psychologically from a few taps.

MoodFood’s responsible interpretation is narrower and more useful: **ask the person what matters now, treat their answer as a preference signal, and learn their own patterns from feedback.** “Comforting” should be a user-described quality, not a diagnosis. Weather and time can be contextual clues, not deterministic rules. A recommendation should be a suggestion that the user can inspect, reject, or refine.

## Scientific and behavioral grounding

The evidence supports the ingredients of the product thesis, but does not yet establish that MoodFood itself improves wellbeing, nutrition, satisfaction, or decision speed. Those are hypotheses to test.

### 1. Eating is influenced by both internal state and context

Reviews of emotional eating describe links between affect, eating behavior, and individual differences, while also emphasizing variation and measurement complexity. This supports taking a person’s current state seriously; it does **not** support a universal mood-to-dish lookup table.

- Macht, M. (2008). “How emotions affect eating: A five-way model.” *Appetite*, 50(1), 1–11. https://doi.org/10.1016/j.appet.2007.07.002
- Evers, C., Dingemans, A., Junghans, A. F., & Boeve, A. (2018). “Feeling bad or feeling good, does emotion affect your consumption of food? A meta-analysis of the experimental evidence.” *Neuroscience & Biobehavioral Reviews*, 92, 195–208. https://doi.org/10.1016/j.neubiorev.2018.05.028

**Product implication:** MoodFood should solicit state in the user’s own terms, represent uncertainty, avoid assigning psychological meaning to food, and distinguish short-lived state from enduring preference.

### 2. Choice architecture can reduce effort, but too much choice can burden people

Research on choice overload finds that the effect of more options depends on context and task; “more choice is always worse” is not a scientifically safe blanket claim. Still, curated shortlists are a reasonable design hypothesis when a person wants a quick answer rather than an exhaustive search.

- Chernev, A., Böckenholt, U., & Goodman, J. (2015). “Choice overload: A conceptual review and meta-analysis.” *Journal of Consumer Psychology*, 25(2), 333–358. https://doi.org/10.1016/j.jcps.2014.08.002
- Iyengar, S. S., & Lepper, M. R. (2000). “When choice is demotivating: Can one desire too much of a good thing?” *Journal of Personality and Social Psychology*, 79(6), 995–1006. https://doi.org/10.1037/0022-3514.79.6.995

**Product implication:** Offering three options is a product hypothesis, not a proven optimal number. Test decision time, confidence, abandonment, satisfaction, and whether users can still find alternatives when they want them.

### 3. Habits and preferences can be learned from repeated behavior—but behavior is ambiguous

Recommender systems commonly use observed interactions to estimate preferences. A click, order, swipe, or skip is not a pure statement of taste: it can reflect price, availability, timing, social context, or interface placement. Research on recommender evaluation highlights the need for careful measurement and user-centered outcomes, beyond offline ranking metrics.

- Ricci, F., Rokach, L., & Shapira, B. (eds.) (2022). *Recommender Systems Handbook*, 3rd ed. Springer. https://doi.org/10.1007/978-1-0716-2197-4
- Knijnenburg, B. P., Willemsen, M. C., Gantner, Z., Soncu, H., & Newell, C. (2012). “Explaining the user experience of recommender systems.” *User Modeling and User-Adapted Interaction*, 22, 441–504. https://doi.org/10.1007/s11257-011-9118-4

**Product implication:** Combine explicit feedback with behavior, record relevant context, keep uncertainty, and let users correct or reset their profile. Avoid treating purchase as satisfaction or non-click as dislike.

### 4. Explanations and user control are part of trust

Recommendation explanations can help people understand why an item appears and whether it fits their needs. Explanations should be faithful to the signals actually used; persuasive-sounding but invented reasoning undermines trust.

- Tintarev, N., & Masthoff, J. (2015). “Explaining recommendations: Design and evaluation.” In *Recommender Systems Handbook*, 3rd ed. https://doi.org/10.1007/978-1-0716-2197-4_21

**Product implication:** Reasons should refer to real inputs (“you chose warm, filling, under ₹500”), not assert unsupported emotional or medical effects (“this will boost dopamine” or “you need this”). Give users a clear way to say “not this,” and explain when a result is based on limited data.

### 5. Food, health, and wellbeing claims require unusually careful evidence

Nutritional needs are individual and depend on many factors. A recommendation system that does not have reliable nutritional data and appropriate safeguards should not present itself as clinical nutrition advice. Likewise, a meal may be comforting or enjoyable for one person without being a treatment for stress, depression, or any health condition.

**Product implication:** Keep “mood-aware food discovery” distinct from mental-health care and dietetic treatment. Treat allergies and medically relevant restrictions as hard constraints where reliable data exists; make limitations visible; do not invent calorie, nutrient, health-score, or “healthier” comparisons. Provide conservative language and a route to professional advice where appropriate.

## What the evidence does—and does not—say

### Supported enough to motivate the product

- Emotional state and context can influence eating behavior, with meaningful individual differences.
- Recommendations can use explicit and behavioral feedback to personalize options.
- Choice presentation and explanations can affect the user experience.
- A small, relevant shortlist is worth testing as a way to make a decision easier.

### Not established by the literature cited here

- That mood-matched food reliably improves mood or mental health.
- That any specific food is a universal response to sadness, stress, low energy, or weather.
- That MoodFood reduces decision time, improves diet quality, or increases meal satisfaction today.
- That three recommendations is always the right number.
- That game engagement necessarily produces valid preference signals.
- That AI-generated nutrition, health, or psychological explanations are accurate without verification.

These distinctions are central to the manifesto. We are building a better way to choose and act—not promising to heal emotions with food.

## Our principles

### 1. Meet the person where they are
Ask only what helps with the decision at hand. A check-in should feel quick, optional, and respectful. Never make emotional disclosure a condition of getting food suggestions.

### 2. Personalize to the individual, not a stereotype
Mood is not destiny. Do not infer that all stressed people want the same cuisine, that rainy weather means soup, or that a demographic implies a taste. Let the user’s own feedback override generic priors.

### 3. Make the next step easier
The core outcome is not a clever recommendation screen. It is a decision the user can confidently act on: order it, cook it, adapt it, or move on.

### 4. Explain without pretending to know more than we do
Show the signals behind a recommendation and make uncertainty legible. Never fabricate why a dish fits or overstate causal benefits.

### 5. Preserve agency and healthy boundaries
No shame, guilt, manipulative streak pressure, or moral ranking of foods. “Healthier” and “better” are contextual, not judgments about the person. Games are optional tools, not compulsory data extraction.

### 6. Learn carefully and reversibly
Separate temporary state from durable preferences. Treat signals as noisy. Provide ways to edit preferences, exclude items, delete data, and opt out of personalization. Retain only data needed for clear user value.

### 7. Be useful across access and circumstance
Budget, cooking equipment, time, connectivity, dietary practices, location, and delivery availability shape what is practical. A good recommendation should not assume premium spend, a fully stocked kitchen, or a single cuisine.

## The learning loop we aspire to

1. **Listen:** Capture a lightweight statement of current intent and relevant constraints.
2. **Suggest:** Rank feasible candidates using explicit preferences and context; return a small set with grounded reasons.
3. **Enable:** Connect the chosen option to ordering or cooking where integrations and data allow.
4. **Check in:** Ask whether the recommendation and meal worked, without requiring feedback.
5. **Update:** Adjust personal preferences cautiously, distinguishing a one-time state from a durable signal.
6. **Be transparent:** Allow correction, preference controls, and deletion; avoid implying certainty where the data is thin.

This loop is a product direction described in the codebase’s signals, taste-vector, mood-food-map, prediction, and post-meal calibration plans. It should be considered an aspiration until each link is implemented, tested, and measured end to end.

## How we should measure whether MoodFood matters

We should measure outcomes that reflect the user’s problem, not just clicks or time in app.

### North-star candidates
- **Time to confident decision:** elapsed time from expressing intent to selecting an option, balanced against satisfaction and the ability to browse when desired.
- **Recommendation usefulness:** post-meal or post-decision rating, including “not quite” reasons.
- **Intent-to-meal completion:** whether a recommendation leads to a completed order or cooking action, with failure reasons (availability, price, effort, delivery).
- **Repeat value:** whether people voluntarily return because the experience helps, not because a streak pressures them.

### Guardrail metrics
- Allergy/dietary constraint violations (target: zero known violations).
- Unsupported or misleading explanation reports.
- Recommendation rejection and abandonment by budget band, dietary pattern, geography, and accessibility needs.
- Privacy opt-out, deletion completion, and complaint rates.
- Evidence that personalization is overfitting to transient signals or narrowing choices into a rut.

### Research questions to answer
- Does a mood check-in improve recommendation usefulness compared with asking only about taste and constraints?
- Which signals add value enough to justify asking for them?
- Do games produce better preference information than direct questions, and for whom?
- How many choices best balance decisiveness with autonomy in different contexts?
- Does post-meal feedback improve future satisfaction, and how much feedback burden is acceptable?
- Can recommendations be made equitable across price, dietary pattern, location, and availability?

Use controlled experiments or well-designed observational analyses, predefine outcomes, and report uncertainty. Do not present engagement uplift as proof of improved wellbeing or nutrition.

## Strategic ambition

The long-term ambition is a trusted personal food companion that understands the difference between **what I like**, **what I feel like now**, and **what is realistically possible**. With enough high-quality, consented feedback, MoodFood could become more helpful over time while requiring less effort from the user.

That ambition is not “AI knows what you need.” It is: **the system remembers what you have told it, notices what tends to work, acknowledges uncertainty, and makes a good next choice easier.**

## The manifesto in one paragraph

People should not have to scroll through an endless catalogue or solve a complicated optimization problem every time they are hungry. MoodFood exists to translate a person’s present feeling, taste, constraints, and context into a few practical food options—with clear reasons and a path to act. It treats mood as useful context, not a diagnosis; personalization as a hypothesis that must learn from the individual, not a stereotype; and AI as a tool that should be transparent, bounded, and easy to correct. Its success is not how long someone stays in the app, but whether they find a meal that fits, feel good about the choice, and trust MoodFood enough to return.

## Sources and further reading

1. Macht, M. (2008). “How emotions affect eating: A five-way model.” *Appetite*, 50(1), 1–11. https://doi.org/10.1016/j.appet.2007.07.002
2. Evers, C., Dingemans, A., Junghans, A. F., & Boeve, A. (2018). “Feeling bad or feeling good, does emotion affect your consumption of food? A meta-analysis of the experimental evidence.” *Neuroscience & Biobehavioral Reviews*, 92, 195–208. https://doi.org/10.1016/j.neubiorev.2018.05.028
3. Chernev, A., Böckenholt, U., & Goodman, J. (2015). “Choice overload: A conceptual review and meta-analysis.” *Journal of Consumer Psychology*, 25(2), 333–358. https://doi.org/10.1016/j.jcps.2014.08.002
4. Iyengar, S. S., & Lepper, M. R. (2000). “When choice is demotivating: Can one desire too much of a good thing?” *Journal of Personality and Social Psychology*, 79(6), 995–1006. https://doi.org/10.1037/0022-3514.79.6.995
5. Ricci, F., Rokach, L., & Shapira, B. (eds.) (2022). *Recommender Systems Handbook*, 3rd ed. Springer. https://doi.org/10.1007/978-1-0716-2197-4
6. Knijnenburg, B. P., et al. (2012). “Explaining the user experience of recommender systems.” *User Modeling and User-Adapted Interaction*, 22, 441–504. https://doi.org/10.1007/s11257-011-9118-4
7. Tintarev, N., & Masthoff, J. (2015). “Explaining recommendations: Design and evaluation.” In *Recommender Systems Handbook*, 3rd ed. https://doi.org/10.1007/978-1-0716-2197-4_21

---

*Prepared from the MoodFood repository’s product and architecture materials. External references are included to ground the product thesis; they are not evidence of MoodFood’s efficacy. Product and technical capabilities described as future-facing should be validated against the live app before being represented as shipped.*
