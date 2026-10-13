# Interactive Birthday Gift (Standalone Vite Source)

> **Warning — Do NOT set this nested folder as your Vercel Root Directory.**
> The main birthday site lives at the **repository root (`/`)** and already serves a static, bundler-free copy of this film from `/reveal/index.html` (with GSAP vendored at `/reveal/vendor/gsap.min.js`) inside **Slide 9**.

## Why `package.json` is stored as `package.json.vite-backup`

Vercel scans repositories for `package.json` files during project import and build detection. When `package.json` existed inside `Interactive Birthday Gift/Interactive Birthday Gift/`, Vercel misidentified this nested directory as the main Vite application and deployed only the heart+arrow film at `/` instead of the full root website.

Renaming `package.json` to `package.json.vite-backup` prevents Vercel from auto-detecting this nested folder as the app root.

## Building or Running Locally (Standalone Vite)

If you want to run or build this standalone Vite project directly from this folder:

```bash
cd "Interactive Birthday Gift/Interactive Birthday Gift"
cp package.json.vite-backup package.json
npm ci
npm run build   # or: npm run dev
```

*(Remember to remove the temporary `package.json` before committing so Vercel continues to treat the repository root as a static site.)*

## GitHub Pages Workflow Compatibility

The GitHub Actions workflow in `.github/workflows/deploy.yml` includes an adapter step that automatically copies `package.json.vite-backup` to `package.json` in CI before running `npm ci` and `npm run build`, so the standalone GitHub Pages build remains unbroken.
