# MoodFood — Social Media Marketing

Plans and creative briefs for MoodFood's social channels. Right now we have two: **Instagram** and **LinkedIn**.

| File | What it is |
| --- | --- |
| [week-1-plan.md](week-1-plan.md) | The launch week, day by day: what goes out, on which channel, and at what time |
| [creatives.md](creatives.md) | A brief for every creative in week 1: format, size, copy, visual direction, and who makes it |

## The one thing week 1 has to do

**Fill the 100 founding-member spots on the waitlist** (`EARLY_ACCESS_SPOTS` in `apps/site/lib/config.ts`), and find out which message gets people to sign up.

Every post points to one link: the waitlist on the marketing site, with UTM tags so we can see which post worked (see "Tracking" below).

## Who each channel is for

| | Instagram | LinkedIn |
| --- | --- | --- |
| **Audience** | 20–32, cities, orders on Swiggy 2+ times a week, gets stuck on "what should we eat?" | Founders, PMs, engineers, investors, the Swiggy Builders Club crowd, possible hires |
| **What they want from us** | To laugh, to feel seen, to try the thing | A founder's story, how it was built, what we're learning |
| **Voice** | Hinglish is fine. Short, funny, meme-aware. Talk like a friend | First person from the founder. Plain, honest, specific. No hype |
| **What we ask them to do** | Join the waitlist, find their house, tag a friend | Follow the build, reshare, give feedback, join as a founding member |
| **Where the post goes** | Company page | **The founder's personal profile first**, then reshared from the company page. Personal posts reach far more people than page posts |

## What we say

**The line:** *Tell us how you feel. We'll handle dinner.*

**The promise:** from "I'm hungry" to eating in 90 seconds. Four taps or a 30-second game, then three dishes, each with a reason. Order on Swiggy inside the app, or cook it and get the ingredients from Instamart.

**Hooks we're testing in week 1** (we'll find out which one wins):

1. **The pain:** "40 minutes on Swiggy. Ordered the same biryani." Everyone has done this.
2. **Identity:** the six food houses. People love personality quizzes and sharing their result.
3. **Play:** the games (This or That, Swipe the Vibe, Spin the Wheel, Mind Reader).
4. **Founder story (LinkedIn):** why we built it and how.

**The six houses** (from `apps/intelligence/app/brain/houses.py`). These are our most shareable asset. Each one gets its own creative:

| House | Crest | Motto |
| --- | --- | --- |
| Dal Chawal Gang | 🍛 | Nothing beats ghar ka khana. |
| Safar Squad | 🧭 | Every plate is a new place. |
| Mirchi Gang | 🌶️ | Bring the heat. |
| Midnight Munchies | 🌙 | The best meals happen after midnight. |
| Dawat Club | 🎉 | Food tastes better shared. |
| Taaza Tribe | 🥗 | Fresh, light, balanced. |

## Rules for every post

These come from the business model doc (`business_docs/moodfood-business-model-and-moat.md`, section 9). They are not optional.

- **Never target sadness or stress.** No "Feeling low? Order now." Moods in our posts should be playful (lazy, rainy-day, celebratory, hangry), not distress.
- **No health or clinical claims.** We don't say food fixes your mood. We say we help you decide.
- **The scarcity has to be real.** "100 founding spots" is true. Only post a "spots left" number that the site actually shows.
- **Swiggy and Instamart:** say "order on Swiggy" in text, but don't use their logos or brand colours in our creatives until we've checked their brand guidelines and the Builders Club terms.
- **Paid or gifted creator posts must be labelled** (#ad / Paid partnership), following the ASCI guidelines.
- **Use real app screens.** Don't show features that don't work yet.

## Tracking

Tag every link like this:

```
?utm_source=instagram|linkedin&utm_medium=social&utm_campaign=launch_w1&utm_content=<creative-id>
```

`<creative-id>` is the ID in [creatives.md](creatives.md) (`IG-01`, `LI-02` and so on). Instagram only allows one link in the bio, so use a link-in-bio page with one button per post, or update the bio link every day.

**Check these every day at 10pm** and write them in a simple sheet:

| Metric | Week 1 target |
| --- | --- |
| Waitlist sign-ups (total) | 100 (all founding spots filled) |
| Instagram followers gained | +300 |
| Instagram saves + shares per post | 3% or more of reach |
| Instagram story poll votes | 50 or more per poll |
| LinkedIn founder post impressions | 5,000 or more on the launch post |
| LinkedIn comments | 30 or more on the launch post |

The targets are guesses for a brand-new account. Change them after week 1 using the real numbers.
