# Current Architecture Gaps and Missing Pieces

This document lists the strongest gaps in the current architecture. These are not necessarily bugs; they are the main areas where the product would benefit from stronger standardization, clearer ownership, or more operational maturity.

## 1. No single source of truth for API contracts

### Status: High

The repo has multiple client/server boundaries, but the API contracts between:

- web frontend
- backend
- Python intelligence service
- mobile app

are not centralized in a single shared contract layer.

### Why it matters

- Frontend and backend can drift apart over time.
- AI service payloads and backend payloads can diverge without clear validation.
- It becomes harder to add new diagnostics or maintain cross-service feature parity.

### Recommended direction

- define shared request/response schemas
- enforce validation at API boundaries
- add contract tests for critical flows

## 2. Weak cross-service testing strategy

### Status: High

The repo has many feature modules and service boundaries, but the architecture is not obviously built around a strong end-to-end cross-layer test strategy.

### Why it matters

- recommendation logic may be correct in isolation but fail in real request flow
- mobile, web, and backend can drift without a shared integration contract
- personalization flows are tricky to validate without regression coverage

### Recommended direction

- add smoke tests for UI → API → AI flow
- test recommendation output shape and critical feature toggles
- add DB-backed integration tests around signals and profile flows

## 3. Lacking a clear operational observability model

### Status: High

The app appears to have logging and analytics, but there is no clear centralized observability pipeline for:

- request latencies
- AI recommendation latency and error rate
- DB errors
- failed Swiggy / Instamart requests
- learning pipeline failures

### Why it matters

- production debugging will become harder as features expand
- AI-service failures can be difficult to trace back to the originating user flow
- personalization bugs may silently degrade without monitoring

### Recommended direction

- add structured logs and request IDs across services
- centralize metrics for AI calls and database/user events
- create dashboards for recommendation quality and error rates

## 4. Configuration and environment management is still fragmented

### Status: High

The project uses environment variables, local SQLite, and multiple services, but there is not yet a fully clear environment model for:

- local dev
- staging
- production
- secrets handling
- DB migration strategy

### Why it matters

- service misconfiguration is one of the biggest sources of slowdowns in multi-service apps
- AI and backend authentication may be inconsistent across environments
- production drift becomes likely over time

### Recommended direction

- define a standard env contract for each service
- centralize secret management
- document environment-specific deployment assumptions

## 5. Recommendation, learning, and business logic are tightly coupled in the AI service

### Status: Medium-High

The Python service contains recommendation ranking, service integration, learning logic, and user modeling in the same domain surface.

### Why it matters

- core logic may become difficult to reason about as the model grows
- changing ranking logic can accidentally affect personalization and live discovery behavior
- testing is harder because multiple concerns are bundled together

### Recommended direction

- separate domain layers such as:
  - ranking
  - personalization
  - data enrichment
  - live discovery
  - learning state management

## 6. No obvious unified auth and identity design across all surfaces

### Status: Medium-High

There is authentication, OTP flow, session IDs, Swiggy tokens, and user profiles. The current structure suggests many user identity concepts are spread through the stack.

### Why it matters

- identity and profile state can become inconsistent across web, mobile, and backend
- cross-surface session behavior may be hard to reason about
- real-world user actions can get mis-attributed without a sharper identity model

### Recommended direction

- define a single user identity and session model across all clients
- make token and session boundaries explicit
- document when a session is user-scoped vs anonymous-scoped

## 7. Data durability and migration strategy is not fully documented

### Status: Medium

The backend uses a DB bootstrap pattern and supports both SQLite and Postgres. This is useful for local dev, but the project does not seem to have a strong migration-first workflow visible in the repo.

### Why it matters

- schema evolution becomes risky as more user data is added
- local and production environments can drift
- personalization tables and user features are especially sensitive to schema change

### Recommended direction

- establish explicit DB migrations
- define evolution rules for tables like signals, predictions, and DIY sessions
- treat schema changes as first-class engineering changes

## 8. Personalization engine appears powerful but not yet operationally governed

### Status: Medium

The learning and personalization layer is one of the strongest parts of the architecture, but it may become unstable without rules for:

- model versioning
- profile refresh policies
- signal replay reliability
- drift handling
- fallback when learning data is sparse

### Why it matters

- learning pipelines often create “black box” behavior without governance
- recommendation quality can degrade silently
- expensive AI and learning logic needs controlled rollout policies

### Recommended direction

- add profile versioning and model version tracking
- capture training and inference metadata
- add fallback logic when learning signal quality is low

## 9. No clear product feature flag framework

### Status: Medium

The product contains many feature areas already: quests, group sessions, DIY cooking, Swiggy flows, recommendation modes, prompt-based assistance, etc.

### Why it matters

- rollout becomes harder as features overlap
- experiments and staged launches require governance
- mobile/web parity is harder to manage without feature gating

### Recommended direction

- add feature flags for engagement and AI-driven features
- track experiment states and rollout windows

## 10. The architecture is broad but not yet stabilized around ownership boundaries

### Status: Medium

The repo clearly envisions a rich product, but the current structure still mixes product experimentation with foundational services.

### Why it matters

- ambiguous ownership leads to slow decision-making
- product work may accidentally cross service boundaries without clear review expectations
- team scaling will require clearer module ownership

### Recommended direction

- define team ownership by domain:
  - recommendation engine
  - personalization
  - mobile UX
  - backend API/data
  - commerce integrations
  - DIY recipe workflows

## 11. Strongest current strengths despite the gaps

Even with these concerns, the project already has several architectural strengths:

- multi-layer separation is present and understandable
- personalization is treated as a first-class concern
- the product scope is broader and more realistic than a basic MVP
- the AI service and backend are already intentionally separated
- the repo contains the foundations for a serious food-discovery product

## 12. Summary

The biggest missing pieces are not about product vision—they are about operational maturity, cross-service standards, and clear product governance. The app already has a compelling architecture foundation; the next step is to harden it with stronger contracts, testing, observability, and rollout controls.
