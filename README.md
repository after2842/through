# through

Mint and warm ivory concept frontend for an AI agent authentication handoff service.

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

The landing page includes an interactive login handoff simulation and a keyboard-accessible agent setup dialog with working configuration copy. These are frontend demos: no real MCP server, external account login, secret storage, or authentication backend is connected. Example configuration uses the reserved `.example` domain.

Brand, copy, palette, and page composition live in `app/page.tsx` and `app/globals.css`. Interactive components and their styles are in `components/`.
