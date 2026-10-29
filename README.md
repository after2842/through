# through

Sky blue and warm ivory concept frontend for an AI agent authentication handoff service.

Built with Next.js 16 App Router, TypeScript, React 19, CSS Modules, DM Sans, and Instrument Serif. Exports a static site to `out/`.

## Local development

```sh
npm install
npm run dev
```

## Production build

```sh
npm run build
```

The minimal page includes one interactive login handoff simulation. There are no setup modals, feature cards, or extra marketing sections. This is a frontend demo: no real MCP server, external account login, secret storage, or authentication backend is connected.

Brand, copy, palette, and page composition live in `app/page.tsx` and `app/globals.css`. Interactive components and their styles are in `components/`.
