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

## Screenshots

### Login Screen

<img width="1814" height="906" alt="image" src="https://github.com/user-attachments/assets/9888eba5-a4e3-49e6-ac1a-711993465668" />

### Room selection

<img width="1813" height="911" alt="image" src="https://github.com/user-attachments/assets/13cb9b02-ca87-464a-96fd-b0751f26fda9" />

### Manage multiple matrix accounts

A swarm is a group of synchronized Matrix accounts that operate as a single logical identity. Each swarm member (account) joins rooms together, shares encryption keys, and can send or receive messages on behalf of the swarm. This setup allows users to continue communicating even if one or more home servers become unavailable.

<details>
<summary>Motivation (click to reveal)</summary>

Matrix currently ties user availability and message continuity to the uptime of a single home server. If that server goes down, users lose access to their rooms, and communication is interrupted. Swarms solve this by creating redundant, synchronized identities capable of message failover and shared state synchronization.

</details>

<img width="1811" height="889" alt="image" src="https://github.com/user-attachments/assets/aba8b663-73a8-4aff-8455-400f40689917" />

### Favourites

Working across several chats and need to keep important messages in one place? **Favourites** let you collect messages from any room into named lists. Create lists (e.g. "London Project", "Meeting notes"), turn on select mode in any chat, choose the messages you care about, and add them to one or more lists. Each list is a timeline of links to those messages: when you open a list, Masi resolves each link and shows the actual message content, so you get a single view of your saved snippets from different conversations - like a shared board of references without leaving the app.

### Playlist

Turn any favourites list into a **playlist**: a fullscreen, auto-advancing slideshow. Hit play on a list (from the sidebar or the list’s header) to step through its items-images and, if you enable it in settings, text messages-with configurable durations. Handy for review sessions, standups, or any time you want to cycle through saved content hands-free.

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

