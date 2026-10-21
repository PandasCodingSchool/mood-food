# MoodFood — Play Store & App Store Launch Guide

Last updated 21 Oct 2026 · Living version: https://claude.ai/artifact/7ozyn33g3LGkEFF4sh4L2G

## Overview

MoodFood 2.0 can reach both stores in about 4–5 weeks. The long pole is Google Play's mandatory 14-day closed test, not the engineering. Start that test, the legal pages and SMS DLT registration this week, and do the config fixes alongside them.

**What we're shipping:** the Expo app in `apps/mobile` (Expo SDK 57, React Native 0.86, expo-router), built and submitted with EAS. It ships as version **2.0.0** on the existing listing `com.pank1999.moodfood` (iOS bundle ID and Android package are the same). The production API is `https://api.moodfood.fun/api`.

**Where the repo stands today (checked 21 Oct 2026):**

| Area | Status | Notes |
| --- | --- | --- |
| EAS project, `eas.json` profiles | Ready | `development` / `preview` / `production` exist; production points at the live API |
| Native folders | Ready | `ios/` and `android/` are gitignored, so EAS runs prebuild from `app.json` (Continuous Native Generation) |
| In-app account deletion | Ready | Settings → Delete account → `DELETE /api/user/me` |
| Privacy policy page | Draft | `moodfood.fun/privacy` exists; needs real legal text plus the AI and Swiggy disclosures |
| Terms of service page | Missing | The login screen links to terms, but there is no `/terms` page on the site |
| iOS camera permission text | **Blocker** | `app/diy/wall.tsx` opens the camera, but `app.json` has no `expo-image-picker` plugin and no `NSCameraUsageDescription`. On iOS the app crashes when the camera opens, and Apple rejects it |
| Android permissions | **Blocker** | `RECORD_AUDIO` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` are declared, but the app only plays short sounds. Play would ask for a foreground-service declaration video and a microphone data disclosure |
| Versioning | **Fix** | `app.json` says 1.0.0. There is no build-number strategy and no `runtimeVersion` |
| EAS Update (OTA) | Not set up | Needed before the first store build, or every JS fix needs a new review |
| Crash reporting | Not set up | No Sentry yet. You need it for the closed test's quality signal |
| SMS OTP in India | Pending | Needs DLT registration. Reviewers must use password login regardless |

The path in one line: **fix config → production builds → internal testing → Play closed test (14 days) + TestFlight beta → store listings and policy forms → submit for review → staged rollout.**

**Launch plan: the 14-day Play closed test sets the launch date** (suggested, in weeks from kickoff; both stores run in parallel)

| Lane | Week 1 | Week 2 | Week 3 | Week 4 | Week 5 |
| --- | --- | --- | --- | --- | --- |
| Both stores | Accounts, legal, config fixes | Prod builds, device QA | | | |
| Google Play | | Closed test: 12+ testers for 14 days → | → | → (production access) | Review, staged rollout |
| App Store | | TestFlight internal + external → | → | Listing, submit | Review, manual release |

Apple's track has slack, so submit iOS in week 4 and release it once Play production access lands. Then both stores go live on the same day.

## Accounts and prerequisites

You need three paid or verified accounts before the first store build. Identity verification can take several days on both stores, so start it first.

| Account | Cost | What it needs | Watch out for |
| --- | --- | --- | --- |
| Apple Developer Program | $99 / year (about ₹8,700) | Apple ID with 2FA. An organisation account also needs a D-U-N-S number and a legal entity | An individual account shows your personal name as the seller. An organisation account shows the company name but takes 1–2 weeks longer because of D-U-N-S |
| Google Play Console | $25 one-time | Google account, government ID, verified phone and email. An organisation account also needs a D-U-N-S number | **New personal accounts must run a closed test with at least 12 testers for 14 continuous days** before they can apply for production access |
| Expo / EAS (`pank1999`) | Free to start; Starter $19/mo if builds queue | Already set up, with project ID `4d3edd59-…` | The free tier has a monthly build cap and slow queues |

**Also have ready:**

- A support email such as `support@moodfood.fun` (shown on both listings) and a support or contact page URL.
- Legal pages on `moodfood.fun`: privacy policy (required by both stores) and terms of service.
- A reviewer test account: an email and password login with saved taste data, so reviewers never need an SMS OTP.
- A Swiggy-linked test account, or a written explanation of the Swiggy flow for reviewers (see Privacy, compliance and policy risks).
- A Mac is **not** required. EAS builds and signs iOS in the cloud, and `eas submit` uploads to App Store Connect.
- Bank and tax details in both consoles. These are needed only for paid apps or in-app purchases, which MoodFood doesn't have, so they can wait.

**Decide now:** an individual or organisation developer account on each store. If the Play account already exists as a personal account and production access isn't granted yet, the 12-tester rule applies to us.

## App configuration

All native config lives in `apps/mobile/app.json`, because `ios/` and `android/` are regenerated on every EAS build. Any change made directly in those folders is lost.

**1. Version and build numbers.** Set `"version": "2.0.0"`. Let EAS own the build numbers so that every upload is unique:

```json
// eas.json
"cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
"build": { "production": { "autoIncrement": true, "channel": "production", ... } }
```

Run `eas build:version:set` once per platform so the numbers start above anything already uploaded to the existing listing.

**2. Permissions: declare only what the app uses, with specific reasons.**

```json
"plugins": [
  ["expo-image-picker", {
    "cameraPermission": "MoodFood uses the camera so you can snap a photo of the dish you cooked and pin it to your DIY wall.",
    "photosPermission": false,
    "microphonePermission": false
  }],
  ["expo-audio", { "microphonePermission": false, "recordAudioAndroid": false, "enableBackgroundPlayback": false }],
  ...
],
"android": {
  "blockedPermissions": [
    "android.permission.RECORD_AUDIO",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
  ]
}
```

Then remove those four entries from `android.permissions`. Apple rejects vague text such as "needs camera access". Each usage string must say what the feature does with the data. The location string we already have is a good example.

**3. OTA updates.** Run `eas update:configure`, then set `"runtimeVersion": { "policy": "appVersion" }` and add a `channel` to each build profile. A JS-only fix then ships without a store review, while native changes still need a new build.

**4. Icons and splash.** iOS needs a 1024×1024 PNG `icon.png` with no transparency and no rounded corners. Android uses the adaptive foreground, background and monochrome layers we already have. Add an `expo-splash-screen` plugin entry so the splash isn't the default.

**5. iPad.** `supportsTablet: true` means Apple requires 13-inch iPad screenshots and reviews the iPad layout. If iPad isn't a target, set it to `false`.

**6. Production env.** The `production` profile sets `EXPO_PUBLIC_API_URL=https://api.moodfood.fun/api` and `EXPO_PUBLIC_SWIGGY_LIVE=true`. `EXPO_PUBLIC_*` values are bundled into the app, so never put secrets in them.

**7. Already fine:** `ITSAppUsesNonExemptEncryption: false` (HTTPS only, so no export-compliance prompt), `scheme: moodfood` for deep links, and a single bundle ID/package across both platforms.

## Builds and signing

Let EAS manage all signing credentials. Then back up the Android upload keystore, because losing it is the one mistake that's hard to undo.

**Android**

- The production profile builds an **AAB** (the default). Play rejects APKs for store releases. The `preview` APK is only for sideloading.
- Turn on **Play App Signing** (the default for new apps). Google holds the app signing key and EAS holds the *upload* key. If the upload key is lost, Google support can reset it.
- Run `eas credentials -p android` and download a backup of the keystore to the team password manager.
- Push notifications: `google-services.json` is already in the repo. Upload the FCM V1 service-account key with `eas credentials` → Google Service Account, or pushes won't arrive on Android.
- For `eas submit`, create a Google Play service-account JSON with "Release manager" access in Play Console → Users and permissions. **The very first upload must be done manually** in the Play Console, because the API can't create the first release.

**iOS**

- `eas build -p ios --profile production` asks you to sign in with your Apple ID once. It then creates the distribution certificate and provisioning profile and stores them in EAS.
- Push notifications need an **APNs key** (`.p8`). EAS offers to create one during the build, so say yes. Without it, `expo-notifications` gets no token on iOS.
- `eas submit -p ios` uploads to App Store Connect and creates the app record if it doesn't exist. Set `ascAppId` in `eas.json` → `submit.production.ios` once the record exists. An App Store Connect API key avoids 2FA prompts in CI.
- Apple requires builds made with the current Xcode SDK. EAS's default image for SDK 57 satisfies this, so pin the image only if you need to.

**Commands**

```bash
# from repo root
pnpm --filter @moodfood/mobile exec eas build --platform all --profile production
pnpm --filter @moodfood/mobile exec eas submit --platform all --profile production --latest

# JS-only hotfix after launch (no review)
pnpm --filter @moodfood/mobile exec eas update --channel production --message "fix: …"
```

**Rule for OTA updates:** never use EAS Update to change what the app *does* in a way reviewers didn't see, such as new features, payments or data collection. Both stores allow bug fixes and content tweaks over the air, and treat feature changes as needing review.

## Privacy, compliance and policy risks

MoodFood's review risk comes from three places: AI recommendations, ordering through Swiggy, and personal data (phone, location, mood). Each one needs a clear disclosure in the privacy policy, the store forms and the review notes.

**Data we collect: map this into Play Data safety and Apple App Privacy**

| Data | Why | Linked to user | Shared with third parties |
| --- | --- | --- | --- |
| Name, email, phone number | Account, login, OTP | Yes | SMS provider (Twilio or Indian DLT provider), Resend (email) |
| Approximate location | Local weather to theme picks | Yes | Open-Meteo (coordinates only) |
| Mood inputs, taste preferences, game answers | Recommendations ("other user content" / "app activity") | Yes | OpenAI (for generating picks) |
| Order history, delivery address via Swiggy | Placing and tracking orders | Yes | Swiggy |
| Photos (camera, DIY wall) | User posts | Yes | None, unless posted publicly in the app |
| Push token, device IDs | Notifications | Yes | Expo push service, FCM, APNs |
| Crash logs (once Sentry is added) | Diagnostics | No | Sentry |

Tell both stores that data is encrypted in transit, that users can request deletion, and that we don't track users or sell data. Don't declare data we don't collect, and do declare everything the SDKs collect.

**Privacy policy (`moodfood.fun/privacy`) must cover:** each row above, the sharing with OpenAI and Swiggy by name, retention periods, the deletion path (in-app plus email), a contact address, and India DPDP Act 2023 rights. Also publish `/terms`, because the login screen links to it.

**Account deletion.** This is built in-app. Play also requires a **web URL** where a user can request deletion without the app, such as `moodfood.fun/delete-account` with a form or instructions. Make sure deletion also revokes the Swiggy token (the API already calls Swiggy logout).

**AI features**

- Apple (guideline 5.1.2): get the user's explicit consent before sending personal data to a third-party AI. Add a one-time consent line during onboarding that names OpenAI, and add it to the privacy policy.
- Google Play AI-Generated Content policy: give users an in-app way to **report or flag** an offensive AI answer, such as a "Report this pick" action on a recommendation card.
- Neither store wants medical claims. Keep the mood copy about food and comfort, not mental health treatment.

**Payments and Swiggy**

- Food is a physical good, so we must **not** use Apple or Google in-app purchase. Payment through Swiggy is allowed (Apple 3.1.3(e) and 3.1.5; Play's payments policy exempts physical goods).
- Reviewers sit outside India and can't place a real Swiggy order. The review notes must explain the flow and include a screen recording of linking Swiggy, building a cart and checking out. That prevents a "couldn't complete core functionality" rejection.
- Don't use Swiggy's name or logo as if MoodFood were an official Swiggy app. Say "order via Swiggy" and keep their written approval on file in case review asks (Apple 5.2.1, Play impersonation policy).

**Other**

- **Sign in with Apple** isn't required, because we offer only our own email/password and phone OTP logins. If Google sign-in is ever added, Apple sign-in (or an equivalent private login) becomes mandatory.
- **User-generated content:** if DIY wall photos are visible to other users, Apple 1.2 requires a way to report content, block users, filter objectionable material, and a published contact. If they're private to the user, say so in the review notes.
- **Age rating:** expect 12+/13+ on Apple (new 2025 questionnaire) and "Everyone" or Teen on IARC, depending on how we answer the AI chat and UGC questions. Answer honestly about user interaction.

## Store listing assets

One set of copy and five to eight screenshots covers both stores. The sizes differ, so capture once on a large phone and export each size.

| Asset | App Store | Google Play |
| --- | --- | --- |
| App name | 30 chars, e.g. "MoodFood: Food for your mood" | 30 chars |
| Subtitle / short description | Subtitle, 30 chars | Short description, 80 chars |
| Full description | Up to 4,000 chars | Up to 4,000 chars |
| Keywords | 100 chars, comma-separated, no spaces | None (taken from the description) |
| Promotional text | 170 chars, editable without review | None |
| App icon | 1024×1024 PNG, no alpha (from the build) | 512×512 PNG, up to 1 MB |
| Feature graphic | None | **1024×500 PNG/JPG, required** |
| Phone screenshots | 6.9" (1320×2868) required; 3–10 | 2–8 per type, 16:9 or 9:16, min 320 px, 1080×1920+ recommended |
| Tablet screenshots | 13" iPad (2064×2752) required if `supportsTablet` | Optional (7" and 10") |
| Preview video | Optional, 15–30 s | Optional YouTube link |
| Category | Food & Drink (secondary: Lifestyle) | Food & Drink |
| Support URL | Required | Website + email required |
| Privacy policy URL | Required | Required |
| Marketing URL | Optional: `moodfood.fun` | Website field |
| Copyright | "2026 \<legal name>" | None |

**Screenshot story (suggested order):** pick your mood → personalised picks → dish detail with choices → Swiggy cart and offers → order tracking → cook-it-yourself (DIY) → weather-aware theme. Put a short caption on each frame. Use the design-system tokens so the screenshots match the app.

**Copy rules:** don't use "best" or "#1", competitor names, Swiggy's logo or price promises. Don't mention other platforms ("also on Android") in the Apple listing. Keep the content of the first three screenshots in sync with the description, because that's all most people read.

**Localization:** start with English (India) on Play and English (U.K.) or English (U.S.) on Apple, with availability limited to **India**, where Swiggy delivers. Restricting countries also keeps reviewers' expectations clear.

## Google Play submission

On Play, MoodFood moves through internal testing, then a closed test of at least 14 days, then production. Expect about three weeks from the first upload to the first public user.

1. **Create or open the app** in Play Console (`com.pank1999.moodfood`). Set the default language, app name, "App" (not game) and "Free".
2. **Upload the first AAB by hand** to the Internal testing track. After that, `eas submit` can upload. Add the team as internal testers (up to 100) and confirm the build installs from the Play link.
3. **Fill App content** (Policy → App content). Every item must be green before you can publish to any track beyond internal:
    - Privacy policy URL
    - App access: "Some functionality is restricted", plus the reviewer email and password and steps to reach the Swiggy flow
    - Ads: "No ads" (if true)
    - Content rating (IARC questionnaire)
    - Target audience: 18+ is simplest, because 13–17 triggers Families policy checks
    - News app: No
    - Data safety form (from the table in Privacy, compliance and policy risks)
    - Government app: No. Financial features: No
    - Health apps declaration: No, if mood is framed as food preference
    - Account deletion: the in-app path plus the web URL
    - Foreground service and sensitive permissions: none, once the config fixes land
4. **Start the closed test.** Create a Closed testing track and a Google Group or email list of **at least 12 testers**, ideally 20+ as a buffer. Testers must opt in via the link and **stay opted in for 14 consecutive days**. Ask them to open the app on several days, because Google looks at engagement.
5. **Iterate during the test.** Push fixes as new closed-test builds, or as OTA updates for JS. Read Android vitals and the pre-launch report (Play runs the app on real devices automatically).
6. **Apply for production access** (Dashboard → "Apply for production"). Google asks how testing went, what you changed and why the app is ready. Review takes up to 7 days.
7. **Complete the store listing** (Grow → Store presence → Main store listing). Set countries to India only.
8. **Create the production release** with a **staged rollout**: 10% → 25% → 50% → 100% over about a week, watching crash rate and ANRs. First reviews take from a few hours to 7 days.

**Play vitals limits that trigger visibility penalties:** user-perceived crash rate above 1.09% and ANR rate above 0.47% (overall).

## Apple App Store submission

Apple has no mandatory test period, but review is stricter on the first submission. Budget one rejection round and 1–3 days per review.

1. **Create the app record** in App Store Connect (or let `eas submit` do it): name, primary language, bundle ID `com.pank1999.moodfood` and SKU `moodfood-ios`.
2. **Upload a build** with `eas submit -p ios`. Processing takes 10–30 minutes, after which the build appears under TestFlight.
3. **TestFlight internal** (up to 100 App Store Connect users, no review). Smoke-test on real iPhones, including camera, location, push and the Swiggy flow.
4. **TestFlight external** (up to 10,000 testers via a public link). The first build needs Beta App Review, usually under a day. Use this for the closed beta in parallel with Play's closed test.
5. **Fill App Information and the version page:** subtitle, category, age rating questionnaire, privacy policy URL, App Privacy "nutrition label" (from the data table), screenshots, description, keywords, support URL and copyright.
6. **App Review Information.** Give the demo account (email + password), a contact phone and email, and the notes below.
7. **Pricing and availability:** Free, India only.
8. **Submit for review.** Choose **manual release** so you can launch at a time you pick after approval. Optionally use **phased release** (automatic updates reach users over 7 days).

**Draft review notes (edit before sending):**

> MoodFood suggests food based on your mood, the weather and your taste, then lets you order it through Swiggy (India's food-delivery service) or cook it yourself. Demo login: [email] / [password] (Sign in → Email). Ordering needs a Swiggy account and an Indian delivery address, so it can't be completed outside India. We've attached a screen recording of the full flow: link Swiggy → add a dish → checkout → track. Payment happens inside Swiggy for physical goods; the app sells no digital content. Location is used only for local weather. The camera is used only to photograph a home-cooked dish for the user's DIY wall. Recommendations are generated with OpenAI after the user consents in onboarding.

**Common first-submission rejections to pre-empt**

| Guideline | Trigger for us | Prevention |
| --- | --- | --- |
| 2.1 App completeness | Reviewer can't log in or the Swiggy flow fails | Working demo account, recording, no OTP-only path |
| 5.1.1 Data collection | Vague permission strings; login forced before showing any value | Specific usage strings. Consider letting people browse picks before sign-up |
| 5.1.1(v) Account deletion | Deletion hard to find | Already in Settings. Mention it in the notes |
| 5.1.2 Third-party AI | Personal data sent to OpenAI without consent | Onboarding consent line plus privacy policy |
| 4.2 Minimum functionality | Feels like a web wrapper | Native touches we already have: haptics, push, camera |
| 5.2.1 Intellectual property | Swiggy branding | "Order via Swiggy" wording, written approval on file |
| 2.3 Accurate metadata | Screenshots show features not in the build | Capture screenshots from the submitted build |

## QA, launch day and after

Test the production build (not dev-client), on real devices, against the production API. Most store-only bugs come from missing permission strings, push credentials or env values that only exist in release builds.

**Device matrix (minimum):** one low-end Android (Android 10–11, 3 GB RAM), one recent Android (14+), the oldest iPhone the SDK supports, and a current iPhone. Add an iPad if `supportsTablet` stays on.

**Release-build smoke test**

- Fresh install → onboarding → sign up with email and password, and with phone OTP (where DLT is live)
- Deny each permission (location, camera, notifications) and confirm the app still works and explains why
- Mood → picks → dish → choice picker → Swiggy cart → offers → place order → track
- Link Swiggy, unlink Swiggy, delete the account (confirm the data is gone and Swiggy is logged out)
- Push notification received in foreground, background and killed state, on both platforms
- Airplane mode and flaky network: offline banners, no crashes, no infinite spinners
- Dark mode on the OS (the app forces light, so check that system UI still looks right), large font sizes, small screens
- Deep link `moodfood://` and the Swiggy OAuth redirect back into the app
- An OTA update applied to a store build (the channel and runtime version match)

**Launch-day runbook**

1. Backend: confirm Railway health, Postgres backups, OpenAI spend limit and Swiggy bootstrap token freshness.
2. Release the approved iOS build manually and start the Play rollout at 10%, at the same time.
3. Watch Sentry, Play vitals, App Store Connect crashes, API p95 and order success rate for the first 2 hours.
4. Hold the rollout if crash-free sessions drop below 99% or order success drops below 95% (the beta gates in `DEPLOYMENT.md`).
5. Update `moodfood.fun` with the store badges and links. Then email the waitlist in batches.

**After launch**

- Reply to store reviews within 48 hours, especially 1–2 star ones about Swiggy or ordering.
- Ship JS fixes via `eas update`. Native changes need a new build with an auto-incremented build number, then a review.
- Keep target SDK current. Play requires a new target API level every August, and Apple a new Xcode SDK every April, so plan an Expo SDK upgrade for each.
- Renew the Apple membership yearly. If it lapses, the app is removed from sale.
- Rollback: halt the Play staged rollout, remove the iOS version from sale or expedite a fix, and republish the previous OTA update.

## Master checklist

Tick these off in order. Within a phase, tasks can run in parallel.

### Phase 0: Start this week (long lead times)

- [ ] Choose an individual or organisation account. If organisation, request a D-U-N-S number
- [ ] Enrol in the Apple Developer Program ($99/yr)
- [ ] Create or verify the Google Play Console account ($25) and complete identity verification
- [ ] Recruit 20+ closed-test testers (waitlist, friends) with Google accounts on Android phones
- [ ] Start SMS DLT registration (sender ID + OTP template), or decide on password-only at launch
- [ ] Commission or write the privacy policy and terms (DPDP Act, OpenAI and Swiggy disclosures)
- [ ] Get Swiggy's written OK for the "order via Swiggy" wording and confirm the OAuth redirect URI

### Phase 1: App fixes

- [ ] `app.json`: version → 2.0.0
- [ ] `eas.json`: `appVersionSource: remote`, `autoIncrement: true`, a channel per profile
- [ ] `eas build:version:set` above the existing listing's numbers
- [ ] Add the `expo-image-picker` plugin with a specific camera usage string (iOS blocker)
- [ ] Remove `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`; configure the `expo-audio` plugin
- [ ] `eas update:configure` + `runtimeVersion` policy; test one OTA end to end
- [ ] Configure the splash screen plugin; check the 1024 icon has no alpha
- [ ] Decide on `supportsTablet` (true = iPad screenshots and QA)
- [ ] Add Sentry to mobile, API and intelligence
- [ ] OpenAI consent line in onboarding
- [ ] "Report this pick" action on AI recommendations
- [ ] Report/block on the DIY wall if photos are public; otherwise confirm they're private
- [ ] Publish `/privacy`, `/terms` and `/delete-account` on moodfood.fun
- [ ] Create the reviewer demo account (email + password, data pre-filled)

### Phase 2: Builds and credentials

- [ ] Production AAB + IPA via `eas build --profile production`
- [ ] Back up the Android upload keystore to the password manager
- [ ] Upload the FCM V1 key and create the APNs key in EAS credentials
- [ ] Play service-account JSON for `eas submit`; set `ascAppId` for iOS
- [ ] First AAB uploaded manually to Play Internal testing
- [ ] iOS build in TestFlight internal
- [ ] Full release-build smoke test on the device matrix

### Phase 3: Beta (14+ days)

- [ ] Play App content: all declarations green (privacy, access, ads, rating, audience, data safety, deletion)
- [ ] Play closed test live with 12+ opted-in testers. Day 1 date noted: ____
- [ ] TestFlight external group + Beta App Review passed
- [ ] Fix rounds shipped (OTA or new build); crash-free sessions ≥ 99%
- [ ] 14 consecutive days completed → apply for Play production access

### Phase 4: Listings and submission

- [ ] Copy: name, subtitle/short description, description, keywords, promo text
- [ ] Screenshots: iPhone 6.9", iPad 13" (if tablet), Android phone; Play feature graphic 1024×500
- [ ] App Privacy (Apple) and Data safety (Play) match the privacy policy
- [ ] Age rating questionnaires (Apple + IARC)
- [ ] Availability: India only; price Free
- [ ] Review notes + Swiggy flow screen recording attached
- [ ] Submit iOS for review (manual release)
- [ ] Play production release created as a staged rollout (held at draft until iOS is approved, if launching together)

### Phase 5: Launch and after

- [ ] Backend checks (health, backups, spend limits, Swiggy token)
- [ ] Release iOS + start Play at 10%
- [ ] Monitor for 2 hours; expand rollout 25% → 50% → 100% over a week
- [ ] Store badges on moodfood.fun; waitlist emails in batches
- [ ] Review-reply routine and on-call rota set
- [ ] Calendar reminders: Apple renewal, yearly Play target-API deadline (August), Expo SDK upgrade
