# Installer visual design

The user requested a bento redesign inspired by Bento Chan and Component Bento Finance, using Taste and locally generated imagery.

## Audit and direction

The original installer used a centered 850px system-font page, teal buttons, a single white form, and minimal hierarchy. Its routes, form names, CSRF handling, host-only cookies, install state, security copy, and Cloudflare flow remain authoritative. There are no existing analytics events or structured-data fixtures to migrate.

Reading this as a playful landing page for people publishing from chat: asymmetric bento composition, porcelain surfaces, blue accents, rounded material illustration, and concise typography. Design variance 8, motion intensity 4, visual density 4. CSS Grid and native HTML fit this server-rendered Worker; introducing React or a client-side animation library would add weight without helping the forms. Taste is applied to the landing page, not as a replacement for the installation state machine.

Taste was installed globally through `npx skills add Leonxlnx/taste-skill --skill design-taste-frontend --global --agent codex --yes`, at `~/.agents/skills/design-taste-frontend`. It is not vendored into this project.

## Implementation

- Separate installer renderer; the installed Publisher's owner UI and signed release archive are unchanged.
- Self-hosted Outfit variable font (SIL Open Font License) and Tabler outline icons (MIT), with licenses alongside the assets.
- Existing Publisher logo retained and optimized for small screens.
- Blue/cool-neutral semantic tokens, system dark mode, visible keyboard focus, a skip link, reduced-motion support, and single-column mobile layouts.
- Native disclosures explain eligibility, the API-token fallback, and credential lifetime.
- Account selection, progress, resumable errors, completion, and standalone errors receive the same visual language. No extra permission or authentication step is introduced.
- No client JavaScript. CSP permits same-origin images, fonts, and CSS while preserving self-only forms, no frames, and no base override.

## Image provenance

The publishing sculpture was generated at the user-specified ComfyUI endpoint, using the installed FLUX.2 Klein 9B workflow, seed `2026100509`. Prompt ID: `ccd4ff67-84fc-4de2-bf49-4aee0a06fa22`. The prompt and API workflow are in `assets/publisher-bento-launch.*`. The generated PNG was optimized to `public/design/publisher-launch.webp` (900px, about 20 KB). It is decorative artwork, not product evidence or a screenshot.

References:

- https://dribbble.com/shots/25213098-Get-charged-up-with-Bento-Chan
- https://dribbble.com/shots/25638984-Component-Bento-Finance
- https://github.com/Leonxlnx/taste-skill

Dribbble's exact preview media could not be retrieved reliably in this session. The result interprets the user's bento direction and the available page information rather than claiming a pixel-matched reproduction.

The matching dark-mode image was generated with the same model and seed against a navy studio background, prompt ID `a0a1ee87-b6f3-4bf4-b947-39c704aa44b7`. Its workflow is `assets/publisher-bento-launch-dark.comfy-api.json`; the optimized 900px WebP is about 22 KB. A native picture source follows the system color scheme.

## Validation

- TypeScript, formatting, installer build, and all 26 automated tests passed. Form tests cover account selection, CSRF, escaped error/account text, retries, completion, and security headers.
- Chromium checked 48 combinations: 320, 390, 768, and 1440px; light and dark; initial, account selection, progress, retry, complete, and error states. No horizontal overflow or broken images. Native disclosures, form fields, and reduced motion were checked.
- Local mobile Lighthouse: performance 99, accessibility 100, best practices 100, SEO 92; LCP 2.0s and CLS 0. The preview server's catch-all HTML response for robots.txt accounts for the SEO finding. An additional accessible-name diagnostic on the brand link was resolved by using its native visible text.
