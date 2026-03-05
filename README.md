# Matrix Single HTML Client

A minimalistic, mobile-friendly Matrix chat client that builds to a single HTML file.

## Features

- Login via username, password, and server URL
- Room list with search, unread badges, and last message preview
- Send and receive text messages
- Send and view images (with lightbox)
- Send and view videos (inline player + lightbox)
- Session persistence (stays logged in across refreshes)
- Mobile-friendly responsive layout
- Dark theme

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The output is a single self-contained HTML file at `docs/index.html`. You can open it directly in a browser or host it anywhere.
