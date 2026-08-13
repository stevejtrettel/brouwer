# GitHub Pages — outstanding work

This repo builds all its demos into one static site with a shared three.js chunk
(`npm run build:all` → `dist-pages/`), deployed by
`.github/workflows/pages.yml` on every push to `main`.


## The Pages setup is NOT committed here

`scripts/build-all.mjs`, `.github/workflows/pages.yml` and the `.gitignore`
entries are on disk, and `package.json` has a `build:all` script added. None of
it was committed, because `package.json` also holds uncommitted edits of yours —
committing my one line would have swept those in too.

Commit it yourself once that work settles:

```bash
git add .github/workflows/pages.yml scripts/build-all.mjs .gitignore package.json
git commit -m "Publish demos to GitHub Pages"
git push
```

Then enable Pages:

```bash
gh api -X POST repos/stevejtrettel/<repo>/pages -f build_type=workflow
```

---

Setup mirrored from `stevejtrettel/threejs-demos`. To re-sync the build script
and workflow after a change there:

```bash
node ../threejs-demos/scripts/add-pages.mjs ../brouwer
```
