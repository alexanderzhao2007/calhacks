# tot

**Get taught, not told.** tot is a Chrome extension for [claude.ai](https://claude.ai) that helps students think first, then use AI.

It's easy to hand your thinking to AI. When you ask Claude to do a learning task for you without showing an attempt, tot asks one quick question about how you'd start. Your answer goes into the chat, and Claude coaches your next step instead of handing you the solution.

> Hackathon prototype. Works on claude.ai in Chrome only, and isn't on the Chrome Web Store yet, so you run it from this repo.

## How it works

1. **Ask Claude like normal.** Your message sends right away. tot never blocks Send or makes you wait.
2. **Answer one question.** If you're handing over the thinking ("solve this for me"), tot holds the answer back and asks one short question about your approach. Wrong guesses count, and you can always skip.
3. **Claude builds on you.** tot puts your reasoning in Claude's message box and asks Claude to check your approach and guide the next step. You decide whether to send it.

Most of the time you won't see tot at all. If you've already shown your work, you're asking what something means, or it's not a learning task (an email, a recipe), tot stays out of the way.

### Think with friends (optional)

Click the tot icon in Chrome's toolbar to start a group or join one with a 6-character code. You can also go solo. Your group shares one train that moves toward a weekly goal:

| What happened | Miles |
|---|---|
| Your message already showed your own attempt, so tot didn't need to ask | 12 |
| Real thinking on your first answer | 10 |
| Real thinking after one follow-up question | 6 |
| You answered, but without real thinking yet | 1 |
| Skip | 0 (not recorded) |

The train resets every Monday. Whoever earns the most miles today is the conductor 🎩.

## Privacy

- tot does nothing until you click **Turn on tot** on the welcome page. That's your OK for tot to check your Claude messages.
- To decide whether to ask a question, tot sends your message to its classifier server, which you run yourself (see below). The server calls the Anthropic API. Nothing you type is stored.
- The friends train is opt-in and stores only your name, your group, and daily counts (messages sent, questions asked, answers, miles). It never stores what you asked Claude or what you wrote. Your group sees your name and miles. Your other counts are visible only to you.
- The friends train runs on this project's shared [SpacetimeDB](https://spacetimedb.com) database. If you'd rather not use it, just don't join; tot works the same on Claude without it.

## Install

### You'll need

- Google Chrome
- [Node.js](https://nodejs.org) 22 or newer
- An Anthropic API key, from [console.anthropic.com](https://console.anthropic.com/settings/keys). tot makes one small API call per message you send to Claude, plus one per answer you give, and those calls are billed to your key.

### Steps

1. Get the code and install dependencies:

   ```sh
   git clone https://github.com/alexanderzhao2007/calhacks.git
   cd calhacks
   npm install
   ```

2. Add your API key. Copy the example settings file:

   ```sh
   cp .env.example .env
   ```

   Then open `.env` and set `ANTHROPIC_API_KEY=` to your key. The file stays on your computer and is ignored by git.

3. Start tot:

   ```sh
   npm start
   ```

   This runs tot's question server on `http://localhost:8787` and builds the extension. Leave it running while you use tot.

4. Load the extension in Chrome:
   1. Go to `chrome://extensions`.
   2. Turn on **Developer mode** (top right).
   3. Click **Load unpacked** and choose the `extension/.output/chrome-mv3-dev` folder inside the repo.

5. A welcome page opens. Click **Turn on tot**.

6. Open [claude.ai](https://claude.ai) and try a message with no attempt, like:

   > Solve this integral for me: ∫ x² sin x dx

   tot should hold the answer back and ask how you'd start.

Next time, just run `npm start` again. The extension stays loaded in Chrome.

## Troubleshooting

- **tot never asks anything.**
  1. Check that `npm start` is still running; tot can't ask without its server.
  2. Check that you clicked **Turn on tot**. The toolbar popup shows "Turn it on" if not.
  3. Refresh any claude.ai tab that was open before you loaded or reloaded the extension.
  4. Remember that tot only asks when a message skips your own thinking. Try the integral example above.
- **The terminal shows no `classify` line when you send a message.** The message isn't reaching the server. Reload tot in `chrome://extensions`, then refresh claude.ai.
- **Your miles or counts don't change.** Join a group or go solo from the toolbar popup first. Nothing is counted before that. A **Join** badge on the tot icon means you haven't joined yet.

## Project layout

| Folder | What's in it |
|---|---|
| `extension/` | The Chrome extension: WXT, React, TypeScript, Manifest V3 |
| `api/` | The question server: classifies messages and writes questions with Claude |
| `db/` | The SpacetimeDB module for the friends train (see [db/README.md](db/README.md)) |
| `shared/` | Types shared by the extension and the server |
| `landing/` | The landing page |

For development commands (tests, typecheck, production build), see [extension/README.md](extension/README.md).
