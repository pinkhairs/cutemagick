# Cute Magick

Cute Magick is a self-hosted, Git-backed website environment with **built-in infinite undo**.

![Cute Magick screenshot](https://raw.githubusercontent.com/pinkhairs/cutemagick/refs/heads/main/screenshot.png)

It’s for people who want to build real websites—but don’t want to fight platforms, config, and SaaS billing just to experiment, learn, or keep infinite projects alive.

You get a real server, real files, real URLs, and the ability to rewind your site’s entire history at any time.

📚 **Full documentation:**  
https://pixelswithin.notion.site/Cute-Magick-Docs-2fdb91326d968024b11cc40c73a18e90

---

## What is Cute Magick?

Cute Magick starts from a simple idea:

> Your computer is already a server, and the web is already accessible.

Cute Magick makes that feel true again.

It gives you a place to:
- create and run websites immediately  
- use HTML, CSS, JavaScript, PHP, Python, Node, Lua, Bash  
- experiment without fear of breaking things  
- time-travel through every change you make  

Every site has:
- files  
- a URL  
- a complete history  
- a private draft state and a live state  
- optional Git remotes for backup  

Your sites are just folders and files. Your history is just Git.

---

## Why Cute Magick?

If you:
- learned HTML/CSS once and drifted away  
- know how to code but hate deployment rituals  
- want server power without server culture  
- miss personal websites and creative freedom  

Cute Magick is designed for you.

It’s a **workspace** where websites are allowed to be unfinished, experimental, and reversible.

---

## Getting Started

You need:
- Docker
- a terminal
- ~5 minutes

Cute Magick is open source. You can self-host it anywhere Docker runs. Cute Magick does not phone home and does not require an external service to function.

Basic requirements:
- 512 MB RAM (1 GB recommended)
- ~1 GB disk space
- any CPU from the last decade

A Raspberry Pi 4 can run it.  
The cheapest VPS is usually overkill.  
Your laptop won’t notice it’s running.

📖 **Installation and setup:**  
See the full docs for self-hosting and hosted options.

---

## Core Concepts (Short Version)

### Sites
A site is just a folder.

Inside:
- HTML, CSS, JS, images
- server-side code (PHP, Python, Node, Lua, Bash)
- SQLite databases
- secrets via environment variables

Each site has infinite versions across a few clear states:
- **working** (private working files)
- **preview#123** (on-demand, disposable private version render)
- **live** (what the world sees)

---

### Versions (Time Machine)

Every file save, upload, delete, rename creates a snapshot automatically.

You can:
- preview any past version
- restore old versions without deleting newer ones
- recover deleted files
- undo mistakes from months ago

Under the hood, this is Git—but you don’t need to know Git to use it.

---

### Secrets

Secrets are stored as environment variables in a hidden `.env` file:
- API keys
- passwords
- tokens

They are:
- not committed to Git
- not included in exports
- injected at runtime only

---

### Databases

Each site can use SQLite databases.

SQLite is:
- zero-config
- portable
- stored as files

Databases persist across previews and versions.  
Your site history rewinds; your data does not—by design.

---

### Remotes (Optional)

You can connect a Git remote (GitHub, GitLab, your own server) to:
- back up your site history
- collaborate
- work locally and sync back

Secrets and database contents are never pushed.

---

## Under the Hood

Cute Magick stores all persistent state in `/data`.

Key directories:
- `/data/sites` — your sites and their Git history
- `/data/databases` — live SQLite data
- `/data/renders` — ephemeral preview output
- `/data/.ssh` — generated SSH keys

Everything is transparent.

If you understand `/data`, you understand Cute Magick.

---

## Runtime

Cute Magick executes server-side code per request.

File extensions determine runtime automatically:
- `.php` → PHP
- `.py` → Python
- `.js` (with shebang) → Node
- `.lua` → Lua
- `.sh` → Bash
- `.html`, `.css` → served as-is

No configuration. No build step. Just save a file.

---

## Philosophy

Cute Magick favors:
- stacking reversible actions over destructive ones
- explicit version control over auto-deploy
- transparency over abstraction
- ownership over lock-in

You can’t permanently break your site. And if you ever want to leave, you can.

---

## Feedback

If you’re using it and have thoughts—especially confusion or friction—that feedback is actively shaping the project, particularly around:

- UX
- docs clarity
- edge cases
- things that felt confusing or "too magical" (read: implicit)

Contact:  
**Diana Lopez** — me@diana.nu
