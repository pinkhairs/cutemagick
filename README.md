# Cute Magick

**A personal web runtime with Git-powered time travel.**

Cute Magick is an open source system for hosting small websites with server-side power—counters, guestbooks, APIs, tools, experiments—without the complexity of traditional deployment. Write HTML & CSS, add PHP or Node.js when you need it, and get automatic versioning with every change.

🌐 **[cutemagick.com](https://cutemagick.com)**  
📧 **[me@diana.nu](mailto:me@diana.nu)**

---

## Status

Active development is happening on the `dev` branch. The `main` branch will receive stable releases starting February 2026.

This is a work in progress. If you're interested in following along or want to be notified when it's ready for real projects, watch this repo or email me.

---

## What it does

Cute Magick runs your websites with **per-request execution**: one HTTP request spawns a fresh PHP or Node.js process, runs your script, returns the response, and exits. No daemons, no port management, no background processes. Files on disk are your database—read and write them directly.

Every file change is automatically snapshotted with Git. Rewind to any previous version, preview past states, or branch off to experiment. Nothing is ever lost.

**Supported languages:** PHP 8.3, Node.js 22.x, Python 3.12, Go 1.23, Rust 1.83, Ruby 3.3, Bash 5.2  
**Built-in:** SQLite databases, HTTPS/SSL, custom domains, file browser/editor, one-click time travel

**Constraints:**
- ~100-200ms overhead per request (process spawning)
- No background jobs, cron, WebSockets, or long-running servers
- Not suitable for high traffic (>10 req/sec sustained)

These aren't limitations—they're features. Constraints create clarity. Cause-and-effect becomes visible. Entire categories of failure disappear.

---

## Why it exists

Most people give up on web development when they hit deployment. Servers feel scary, irreversible, and hostile. Cute Magick makes server-side programming safe (time travel = rewindable history), understandable (per-request execution), and reversible (automatic snapshots).

This isn't about making backend development "easy"—it's about making it **humane**. Technology can be joyful. Learning doesn't have to be punishing. Infrastructure can support creativity instead of gatekeeping it.

**Computer literacy as mutual aid.**

---

## What you can build

- Personal sites with dynamic features
- Guestbooks, visitor counters, contact forms
- Tarot readers, decision engines, generators
- APIs for your own tools
- Resource libraries, glossaries, reference collections
- Simple CMSes, blogs, knowledge bases
- Anything that runs on the web and doesn't need background jobs

Perfect for experiments, tools for friends, learning how backends work, or small projects you want to own completely.

---

## Ownership

Your files live on disk as plain text. Your site is a real Git repository. Export everything with one click. The code is MIT licensed—run it, modify it, fork it. No lock-in, no proprietary formats. If Cute Magick vanished tomorrow, you'd still have your code and full Git history.

---

## Self-hosting & managed hosting

Self-hosting is fully supported (documentation coming with stable release). If you'd rather focus on building than maintaining infrastructure, **magick.host** offers managed hosting:

- **Free tier:** 1 site, 1 file, perfect for trying it out
- **$10/month:** Unlimited sites, custom domains, email support

Either way, your sites are portable. You own your work completely.

---

## Getting involved

Development happens on the `dev` branch. Contributions, feedback, and questions are welcome—though the codebase is still in flux.

- Watch this repo for updates
- Check [cutemagick.com](https://cutemagick.com) for context
- Email [me@diana.nu](mailto:me@diana.nu) if you want to be notified when it's ready

Cute Magick will be ready for real projects in **February 2026**.

---

✨ Built by [Diana Lopez](mailto:me@diana.nu) with care, constraints, and a belief that infrastructure can be kind.