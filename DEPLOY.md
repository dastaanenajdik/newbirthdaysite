# Deployment Guide (`DEPLOY.md`)

This repository is a **static site served directly from the repository root (`/`)**. No bundler or build step is required to deploy the full birthday experience.

---

## Vercel Project Settings (Required)

In your Vercel Dashboard (**Project Settings → Build and Deployment** & **General**), configure the following exact settings:

- **Framework=Other** *(Framework Preset: `Other`)*
- **Root Directory=blank** *(leave empty so Vercel serves from the repository root `.`)*
- **Build/Install/Output=blank**
  - **Build Command:** `blank` *(Override off / empty)*
  - **Install Command:** `blank` *(Override off / empty)*
  - **Output Directory:** `blank` *(Override off / empty — handled by root `vercel.json` as `.`)*
- **Redeploy without cache:** Go to **Deployments**, click the **`⋯`** menu on the latest deployment → **Redeploy**, and make sure **"Use existing Build Cache" is UNCHECKED** (*redeploy without cache*).

---

## ⚠️ Warning: Do NOT Set the Nested Vite Folder as Root

> **WARNING:** Never set **Root Directory** to `Interactive Birthday Gift/Interactive Birthday Gift` (the nested Vite folder).
>
> - If the nested Vite folder is set as Root Directory (or auto-detected via Vite), Vercel will build and serve **only** the standalone heart+arrow animation at `/` instead of the actual birthday website.
> - To prevent Vercel from auto-detecting the nested folder as a Vite app, `Interactive Birthday Gift/Interactive Birthday Gift/package.json` has been renamed to `package.json.vite-backup` (with an adapter step in its `.github/workflows/deploy.yml` so its GitHub Pages workflow still works if needed, or you can restore `package.json.vite-backup` → `package.json` locally and run `npm run build` from that folder).
> - The main site at the repository root already serves the bundler-free reveal film from `/reveal/index.html` on **Slide 9**.

---

## Root `vercel.json`

The repository root includes `vercel.json` to explicitly instruct Vercel to treat the root as a static site:

```json
{
  "framework": null,
  "buildCommand": null,
  "installCommand": null,
  "outputDirectory": "."
}
```

---

## Local Verification (`python3 -m http.server`)

Run a static HTTP server from the repository root:

```bash
python3 -m http.server 8000
```

Verify the following routes and flows:

1. **`/` (`http://localhost:8000/`)** — Returns `200 OK`; first screen is the **Crystal Heart** intro (`#heartIntro` loading `heart/index.html`), **NOT** the standalone heart+arrow film.
2. **`/heart/index.html`** — Returns `200 OK` (Crystal Heart WebGL animation).
3. **`/reveal/index.html`** — Returns `200 OK` (Heart + arrow birthday film with vendored GSAP).
4. **`/pawaniya.jpg`** — Returns `200 OK` (Memory photo).
5. **Slide 8 (Cake Cut)** — Cake builds, candles light, and cutting the cake (`#cakeCutBtn` or dragging `#pawKnife`) slices the cake and reveals `#cakeContinue`.
6. **Slide 9 (Birthday Reveal Film)** — Plays the reveal video and then loads the heart+arrow film inside `#rvAnimFrame` (`reveal/index.html`), followed by the birthday wish screen.
