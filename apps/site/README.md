# @moodfood/site

The MoodFood marketing site: Next.js 16 (App Router, Turbopack), fully static.

It wears the app's design system. `lib/theme.ts` turns `@moodfood/tokens` (the same `createTheme()` the app uses) into CSS variables. The site also uses the app's fonts (Bricolage Grotesque, Geist, Geist Mono) and its Material Symbols subset from `packages/ui`. When the tokens change, the app and the site change together.

```bash
cp apps/site/.env.example apps/site/.env.local   # site + API URLs
pnpm site                                        # http://localhost:3002
pnpm --filter @moodfood/site build               # static pages + standalone server in .next/standalone
```

| Env | Used for |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL, sitemap, Open Graph |
| `NEXT_PUBLIC_API_URL` | Early-access form and spots-left counter (`POST /waitlist`, `GET /waitlist/count`) |

Pages: `/` (food-photo hero with an auto-playing phone mock you can re-theme by mood, "first 100 get free early access" offer, how it reads the room, how it works, games, Powered by Swiggy, early-access form, FAQ), `/about`, `/privacy`, a 404, plus generated `sitemap.xml`, `robots.txt`, the icon, and the Open Graph image.

The design source is `docs/design/marketing-website/` (Claude Design handoff). Food photos in `public/food` are from Unsplash.

Not built yet: a terms page. The privacy policy still needs legal review and a named grievance officer before launch.
