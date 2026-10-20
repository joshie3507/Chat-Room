# Chatroom

A real-time chat app built with Node.js, Express, Socket.IO and MySQL. Users create accounts, log in, and talk in separate rooms. Messages are saved to a database, so history is there when you come back.

## Features

### Chat
- **Real-time messaging.** Messages reach everyone in a room instantly over WebSockets (Socket.IO), with no page refresh or polling.
- **Multiple rooms.** General, Study group, Gaming and Random. Each room is its own conversation, and switching rooms moves you out of the old one.
- **Persistent history.** Every message is stored in MySQL. When you join a room, the last 50 messages load first (oldest at the top), then new ones arrive live.
- **Automatic reconnect.** If the connection drops, the client rejoins its current room and reloads history without duplicating messages.
- **Message bubbles.** Your messages are right-aligned and teal. Everyone else's are left-aligned with their name above.

### Accounts and security
- **Registration and login** on their own pages, with validation on both the client and the server.
- **Password hashing.** Passwords are hashed with bcrypt before storage. Plain text passwords are never saved or logged.
- **Sessions.** Logging in creates a server-side session (express-session) with an `HttpOnly`, `SameSite` cookie.
- **Protected chat page.** Visiting the chat while logged out redirects to the login page. The chat file is not publicly served.
- **Authenticated sockets.** A WebSocket connection is refused unless it carries a valid session, so logged-out users cannot read or send messages even by skipping the page.
- **Server-side identity.** The server decides who sent a message from the session. The browser cannot claim to be someone else.
- **Ownership by user ID.** Messages are linked to a unique user ID, not a name. Two users with the same display name never see each other's messages as their own.
- **Safe database access.** All queries use placeholders, which protects against SQL injection.
- **Input validation.** Message text is trimmed, checked for type, and capped at 500 characters. Rooms are checked against an allowed list.
- **Error handling.** Database failures are logged on the server and only a short, generic message reaches the browser. A failed save never crashes the server or gets broadcast.
- **Logout.** Destroys the session and clears the cookie.

### Interface
- Responsive layout with a collapsible room list on mobile.
- Automatic dark mode that follows the system setting.
- Consistent look across the chat, login and register pages through shared colour variables.
- Keyboard focus styles, labelled form fields, and screen-reader announcements for messages and errors.
- Messages are rendered with `textContent`, so nobody can inject HTML through a message.

## Tech stack

| Area | Tools |
| --- | --- |
| Server | Node.js, Express |
| Real-time | Socket.IO |
| Database | MySQL (via `mysql2`, connection pool) |
| Auth | `express-session`, `bcrypt` |
| Config | `dotenv` |
| Frontend | Plain HTML, CSS and JavaScript |

## Project structure

```
Chat-Room/
├── server.js            # Express app, Socket.IO, routes, database access
├── views/
│   └── index.html       # Chat page (only served to logged-in users)
├── public/
│   ├── login.html
│   ├── register.html
│   └── js/
│       └── showMessage.js
├── .env                 # Your private settings (not committed)
├── .gitignore
└── package.json
```

## Getting started

### Prerequisites
- Node.js (LTS version)
- MySQL (for example through MAMP)

### Install
```bash
git clone <your-repo-url>
cd Chat-Room
npm install
```

### Set up the database
Create a database called `chatroom` using the `utf8mb4` character set (so emoji work), then run:

```sql
CREATE TABLE tbl_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE tbl_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room VARCHAR(30) NOT NULL,
    sender_id INT NOT NULL,
    msg VARCHAR(500) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (sender_id) REFERENCES tbl_users(id)
);

CREATE INDEX idx_room_id ON tbl_messages (room, id);
```

### Configure environment variables
Create a `.env` file in the project root:

```
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=chatroom
DB_PORT=3306
SESSION_SECRET=a_long_random_string
```

Notes:
- MAMP on macOS usually runs MySQL on port **8889**, not 3306.
- Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Never commit `.env`. It is already listed in `.gitignore`.

### Run
```bash
node server.js
```
Open `http://localhost:3000`, create an account, and log in.

### Using it from another device
- **Same Wi-Fi:** open `http://<your-computer-ip>:3000` on the other device. Some campus and guest networks block device-to-device traffic.
- **Different networks:** use a tunnelling tool such as Cloudflare Tunnel, or deploy the app.

## How it works

1. A user registers. The password is hashed and the account is stored.
2. On login, the server checks the hash and stores the user's ID in a session.
3. The browser opens a WebSocket. The server reads the same session cookie, rejects the connection if there is no valid user, and attaches the user's ID and name to the socket.
4. When the user joins a room, the server sends the last 50 messages (joined with the users table to get names), then the socket receives live messages for that room.
5. When the user sends a message, the server validates it, saves it with the sender's ID, and broadcasts it to the room.
6. Each browser compares the sender's ID with its own ID to decide whether a message is "mine".

## Known limitations and ideas

- Sessions are stored in memory, so everyone is logged out when the server restarts. A database-backed session store would fix this.
- No rate limiting on login or messages yet.
- The session cookie needs the `secure` flag switched on when deployed over HTTPS.
- Not yet added: display-name changes, typing indicators, online counts, unread badges, loading older messages, and private messages.

## What I learned

- Building a real-time system: why WebSockets suit chat, and how the server stays the single source of truth.
- Designing a schema with a foreign key and a composite index for the main query.
- Authentication end to end: hashing, sessions, and sharing a session with WebSockets.
- Defensive habits: parameterised queries, server-side validation, and not trusting anything the browser sends.