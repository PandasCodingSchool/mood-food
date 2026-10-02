# MoodFood Documentation

This folder contains the onboarding and architecture documentation for the MoodFood project.

## Overview

MoodFood is a mood-based food recommendation platform that helps users decide what to eat based on their mood, cravings, context, taste profile, budget, and past behavior. The product spans a web app, a Node API layer, a Python intelligence service, and a mobile app.

## Documentation Index

- [architecture.md](architecture.md) — system architecture, modules, and request flow
- [onboarding.md](onboarding.md) — setup, local run steps, and developer workflow
- [gaps.md](gaps.md) — current architecture gaps and missing pieces
- [mobile-redesign-reference.md](mobile-redesign-reference.md) — full mobile screen map and premium redesign direction

## Product at a Glance

### Core idea

The app moves from “I’m hungry” to “This is what I should eat right now” by combining:

- user mood and context
- gamified preference capture
- recommendation ranking
- live restaurant and menu discovery
- personalization learning from behavior

### Current stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node.js + Express
- AI service: Python + FastAPI
- Data: SQLite locally, PostgreSQL-capable backend
- Mobile: React Native / Expo

### Main product areas

- recommendation engine
- mood and game-based decision flows
- personalization signals and learned user profiles
- Swiggy / Instamart discovery and ordering support
- DIY recipe and cooking sessions
- quests, streaks, and engagement loops
- waitlist and analytics admin flows

## Repository structure

- [../apps/frontend](../apps/frontend) — React web app
- [../apps/backend](../apps/backend) — Express API and database layer
- [../apps/intelligence](../apps/intelligence) — Python recommendation and learning service
- [../apps/mobile](../apps/mobile) — Expo mobile app
- [../build_plan](../build_plan) — planning notes and design docs
- [../README.md](../README.md) — project summary and quick intro

## Suggested reading order

1. Read [architecture.md](architecture.md)
2. Follow [onboarding.md](onboarding.md)
3. Review [gaps.md](gaps.md) before making large changes

## One-sentence architecture summary

MoodFood is a multi-surface food personalization platform where the web and mobile clients collect user intent, the Node backend handles session/auth/data orchestration, and the Python intelligence layer performs recommendation ranking, personalization learning, and grocery/ordering discovery.
