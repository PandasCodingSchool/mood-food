# MoodFood Mobile Redesign Reference

## 1. Objective

This document is a design reference for redesigning the MoodFood mobile app with a more premium, immersive, and dynamic experience. It maps the current feature set and screens to a modern app design language inspired by leading food delivery and grocery apps, while keeping the product distinct through mood-aware personalization.

The redesign goal is to make the app feel:

- premium and polished
- emotionally intelligent
- dynamic based on time, weather, and mood
- engaging enough that users stay in the app and explore
- rich without feeling noisy or cluttered

## 2. Design direction

### Core product promise

MoodFood is not just an ordering app. It helps users answer:

- What should I eat now?
- What suits my mood right now?
- What fits my budget, time, and context?

### Premium app feel

The redesign should aim for:

- layered glassmorphism and soft gradients
- large hero cards with motion and depth
- soft shadows and subtle blur
- ambient background motion tied to weather/time
- premium food photography with overlays
- highly readable typography with strong hierarchy
- tactile, high-contrast action buttons

### Dynamic theme system

The app should adapt to context in a smart, stylish way.

#### Time-of-day themes

- Morning: warm sunrise palette, golden oranges, soft peach, crisp UI; highlight breakfast, fresh, light meals
- Afternoon: bright citrus / energetic orange and teal; highlight lunch and mid-day boosts
- Evening: deeper amber, dusk purple, cozy warm lighting; highlight comfort food and treat meals
- Night: deep navy, plum, and charcoal with moody lighting; highlight cravings, late-night comfort picks

#### Weather themes

- Rainy: cool slate blue, misty gradients, raindrop-inspired overlays and soft animations
- Sunny: brighter golds, warm whites, airy atmosphere
- Cloudy: muted grey-blue balance, calm composition
- Stormy: deeper contrast, rich dark tones with dynamic accent flashes

#### Mood-based accents

- Happy: vibrant fruit-like colors, cheerful gradients, playful motion
- Tired: softer neutrals, warm browns, reassuring UI weights
- Stressed: grounding colors, calm layouts, low-noise hierarchy
- Adventurous: bold gradients, brighter accent pops, unexpected flavor cards

## 3. Existing mobile feature inventory to preserve

The current mobile app already includes the following major areas:

- onboarding and account flows
- mood check-in
- home dashboard
- game-based recommendation experiences
- recommendation cards and AI reasoning
- meal detail views
- restaurant menu and order entry flow
- quest and streak tracking
- profile preferences and personalization
- notifications feed
- history / past orders
- connect-to-Swiggy flow
- DIY cooking / recipe journey
- group decision flow
- waitlist / early access onboarding

The redesign should preserve these functions while making them feel elevated and more immersive.

## 4. Screen-by-screen feature map

## Screen 1: App launch / ambient loading state

### Goal

Create a premium first impression that immediately communicates mood and time.

### Experience

- full-screen ambient background with animated gradient and subtle weather effect
- large MoodFood logo or wordmark
- contextual tagline based on time/day:
  - “Good morning, hungry soul.”
  - “Lunch deserves a better mood.”
  - “What are you craving tonight?”
- animated food icon or floating dish cards
- optional raindrop / sunrise / sunset motion layer depending on time/weather

### Functionality

- app initialization
- fetch current weather and local time context
- choose adaptive theme palette
- show loading progress while preparing recommendation context

### Design notes

- use a cinematic, full-bleed intro rather than a plain splash screen
- keep motion subtle and premium, not cartoonish

---

## Screen 2: Onboarding / welcome flow

### Goal

Give the user a fast but compelling preview of the emotional value proposition.

### Experience

- 3-slide onboarding or “welcome ribbon” flow
- each slide has a large hero visual and short headline
- examples:
  1. “Pick your mood”
  2. “Let the app read your craving”
  3. “Save time, eat better”

### Functionality

- app introduction
- explain why MoodFood is different from normal food apps
- sign-in CTA and create account CTA

### Design notes

- use layered cards and value-focused storytelling
- avoid generic “food app” onboarding clichés

---

## Screen 3: Login / signup screen

### Goal

Create a clean, trust-building auth experience.

### Experience

- large premium card with warm gradient or weather-based backdrop
- phone number field with strong validation states
- password or OTP entry flow
- social proof small text like “No spam. Just better food ideas.”

### Functionality

- sign in via phone number + password
- OTP login option
- sign up flow with name and password
- support sign in via guest or continue mode if relevant

### Design notes

- keep auth extremely minimal and friction-free
- use contextual accent colors based on current time/weather

---

## Screen 4: Mood check-in screen

### Goal

This is a key conversion screen and should feel smart, quick, and delightful.

### Experience

- large mood card with 4 sliders or quick-tap intensity controls
- questions: energy, stress, hunger, social context
- “what is tonight for?” step with mood states such as treat / reward / fuel
- dynamic visual background reacting to user mood selections

### Functionality

- save daily mood state
- capture occasion and context
- feed the recommendation engine with contextual learning data
- create a pattern for later personalization

### Design notes

- make this feel like a quick personality check, not a survey
- include small animated mood icons or energy meter

---

## Screen 5: Home dashboard

### Goal

Main discovery home for the user.

### Experience

- ambient weather/time hero section at top
- greeting header with user name and time-based messaging
- top recommendation module with large featured dish card
- personalized “For you” section
- game shortlist section with cards like Mood Scoop, Swipe Vibe, Meal Roulette, Story mode
- quick action chips such as “Quick pick”, “Feel-good”, “Healthy”, “Treat me”
- contextual insights such as “It’s raining, so warm comfort picks are trending”

### Functionality

- show the today’s best recommendation intent
- surface recent game activity and streaks
- allow immediate access to the decision engine
- maintain user trust via personalization label like “Based on your mood and last orders”

### Design notes

- this screen should visually feel premium but not too busy
- use a layered card system and strong spacing rhythm
- hero card should be the flagship element

---

## Screen 6: Game picker / decision mode selector

### Goal

Let users choose a playful way to decide what to eat.

### Experience

- card grid or horizontal strips of game options
- each card includes:
  - emoji or icon
  - title
  - short description
  - time estimate
  - “Popular”, “Quick”, “For rainy days” labels
- cards have different gradients depending on mood or theme

### Functionality

- Mood Scoop
- Swipe Vibe
- Meal Roulette
- This or That
- Craving Radar
- Bracket
- Story mode
- Pantry mode
- Group decision mode

### Design notes

- make the cards feel like premium mini-experiences
- use motion and interactivity for each card without overwhelming the user

---

## Screen 7: Recommendation feed

### Goal

This is the core conversion screen of the app.

### Experience

- horizontally scrollable recommendation cards with large imagery
- each card includes dish name, cuisine, match score, “why it fits your mood” explanation
- top pick spotlight card with large CTA
- alternative strip with healthier swap and budget alternative
- dynamic badges such as 93% match, top for rain, comfort pick, low effort

### Functionality

- show AI-ranked recommendations
- allow refresh for new suggestions
- allow like / save / veto / share
- view healthier swap and lower-priced alternatives

### Design notes

- present the feed like premium commerce, not a plain list
- use strong visual hierarchy and emotional copy

---

## Screen 8: Meal detail screen

### Goal

Give users confidence before ordering.

### Experience

- large dish hero image
- dish name, cuisine, rating, delivery ETA, estimated price
- contextual chips like “great in rain”, “good for stress relief”, “top match”
- AI explanation section: “This fits your mood because…”
- health score and calories area
- ingredients summary
- restaurant info and live availability
- call to action buttons: Order now, Save, Share, Explore alternatives

### Functionality

- show dish details and why it was recommended
- navigate to restaurant menu and checkout
- compare alternative options

### Design notes

- keep this screen rich and premium, but avoid clutter by organizing sections into cards

---

## Screen 9: Restaurant menu / order screen

### Goal

Turn recommendation into action.

### Experience

- restaurant header with delivery ETA, star rating, open/closed status
- dish categories and menu sections
- quick add button on items
- dynamic cart summary bottom sheet
- live pricing and recommendations for add-ons

### Functionality

- browse restaurant menu
- add featured dish to cart
- review order totals and selected items
- navigate to checkout

### Design notes

- should feel like premium food ordering, not a generic list
- use sticky cart bar and smooth item interaction

---

## Screen 10: Checkout / payment summary

### Goal

Keep the order flow confident and frictionless.

### Experience

- order summary card
- delivery address and ETA
- savings / discount chips
- payment method selector
- order confirmation button

### Functionality

- confirm check out
- complete order via Swiggy or internal flow
- show final confirmation state

### Design notes

- clean, secure, low-friction; avoid too many steps

---

## Screen 11: Group decision screen

### Goal

Allow multiple users to decide on a meal together.

### Experience

- shared room / invite card
- voting cards for options
- real-time progress bars
- final winner reveal

### Functionality

- create group session
- allow voting and swiping
- identify consensus food

### Design notes

- this should feel fun and collaborative, more social than utilitarian

---

## Screen 12: Quests / streaks screen

### Goal

Encourage habit and discovery while keeping engagement playful.

### Experience

- streak metrics card
- challenge cards with progress bars
- weekly goals and newly unlocked rewards
- style should feel lighter and more playful than the core recommendation flow

### Functionality

- active challenges
- streak tracking
- progress state
- quest completion notifications

### Design notes

- use soft gradients and celebratory moments when completed

---

## Screen 13: Notifications screen

### Goal

Keep users informed without overwhelming them.

### Experience

- stacked notification cards with icons, timestamps, and clear categories
- examples:
  - “Your mood streak is still alive”
  - “Weather pick: warm comfort meals are trending”
  - “Quest complete”
  - “Your saved dish is back in stock”

### Functionality

- unread state
- mark as read
- deep link to specific recommendation or quest

### Design notes

- notifications should feel helpful and service-oriented, not promotional

---

## Screen 14: Profile and preferences screen

### Goal

Let the app feel personal and adaptive.

### Experience

- profile header with avatar
- saved preferences chips such as vegetarian, vegan, gluten-free, Indian, Japanese, etc.
- budget selector
- allergies section
- “taste profile” summary showing learned preferences and eccentricity

### Functionality

- edit diets and allergies
- set food budget
- save favorite cuisines
- review personalization profile

### Design notes

- this should feel like a premium customization center, not a raw settings list

---

## Screen 15: Order history / saved meals

### Goal

Build trust and recurrence.

### Experience

- saved meals cards and past order list
- one-tap “order again” actions
- favorites and last ordered dishes

### Functionality

- revisit prior decisions
- show what the user tends to pick
- create recommendation loops based on actual user behavior

### Design notes

- use warm, memory-rich cards that feel personal

---

## Screen 16: Swiggy connect / commerce integration

### Goal

Create trust and reduce friction around real-world ordering.

### Experience

- premium connection card with a clean “connect account” CTA
- visual linking states
- “Your food preferences are ready to order” messaging

### Functionality

- connect Swiggy account
- save address
- use connected user context for ordering

### Design notes

- make this feel like a convenience layer, not a login wall

---

## Screen 17: DIY recipe / cooking session

### Goal

Turn a recommendation into an action if the user wants to cook.

### Experience

- recipe card with steps and ingredient checklist
- paused or completed step states
- item cart with Instamart suggestions
- photo upload and wall memory area

### Functionality

- create recipe session
- mark ingredients as purchased or in pantry
- track cooking steps
- upload a finished dish photo for memory wall

### Design notes

- warm, kitchen-like palette with premium recipe cards

---

## Screen 18: Settings and theme controls

### Goal

Expose personalization in a polished way.

### Experience

- dark mode toggle
- adaptive theme settings for weather/time mood UI
- notification preferences
- push alerts and food reminders

### Functionality

- control app behavior and UI tone
- manage privacy and notification preferences

### Design notes

- keep configuration subtle and elegant

## 5. Suggested premium redesign system

### Layout language

- 16–20px outer padding
- 12–20px card radius
- strong gradient hero blocks
- soft boundaries and subtle blur overlays
- bottom tab bar with elevated floating center action

### Motion language

- 260–420ms for most transitions
- cards slide upward on reveal
- ambient fog and weather particles on background
- soft parallax on recommendation hero cards
- a slight shimmer for featured picks

### Typography

- use bold headings and expressive subheads
- large display text for hero mood statement
- medium text for section titles
- accessible contrast for all cards

### Color strategy

Use a contextual palette system instead of a fixed one:

- morning: peach / gold / warm white
- rain: slate blue / mist / cool silver
- evening: plum / orange / golden amber
- night: midnight blue / deep charcoal / purple accents

## 6. Recommended interaction principles

- Keep first-time experience under 30–60 seconds
- Make the mood check-in feel like a game and not a form
- Use weather and time as ambient design cues, not intrusive UI elements
- Keep personalization visible but not noisy
- Show “why this matches you” in everyday language
- Build retention with small wins: streaks, quests, and surprise “good match” moments

## 7. Recommended redesign concept

The app should feel like a premium “smart food companion” rather than a standard catalog app.

Think of the product as a blend of:

- food delivery app elegance
- grocery app warmth
- AI companion personality
- lifestyle app emotional nuance

The best version of MoodFood will not just show food. It will create a feeling of momentum, comfort, and delight from the moment the user opens the app.

## 8. Final direction

The redesign should make the mobile app feel like a premium, adaptive food companion that responds to:

- current time
- current weather
- user mood
- eating occasion
- learned behavior

This is the core differentiator. The app should not feel static; it should feel alive.
