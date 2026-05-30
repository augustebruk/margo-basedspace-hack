# Margo-Figma-design

Activate Agent screen — a React + Vite + TypeScript implementation of the Figma
mobile mockup, styled with Tailwind CSS v4.

The `Frame` component renders the "Activate Agent" onboarding screen and is laid
out to fill the full mobile viewport so the elements land in the same positions
as the design:

- **Title** near the top
- **Gradient blob** vertically centered
- **Continue** button in the lower third
- **Legal copy** pinned to the bottom (respecting the safe-area inset)

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
npm run preview  # preview the production build
```

The app is best viewed at a mobile viewport (e.g. 390 × 844). On wider screens
the content is constrained to a phone-width column centered on a light
background.
