# Session Cube

Visual analysis tool for the Lead Edge Ash Tree Reflex. The live app is the static build in `templates/session-cube/`, published with the rest of the site from `templates/`.

Edit the source in this folder, then:

```
npm install
npm run build
```

Copy the contents of `dist-pages/` (flatten `pages/index.html` to `index.html`) into `templates/session-cube/` and push `main`. GitHub Pages deploys `templates/` to radicaldeepscale.com. The app is served at `/session-cube/`.
