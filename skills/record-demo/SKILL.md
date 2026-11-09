---
name: record-demo
description: Record a short video of a Bead's change working, by running the project from the Run's worktree and driving it in Chrome with Playwright, then cut the idle stretches so the Human can judge taste and fit from a phone. Use in a Workflow's demo node before a Human gate, or when a Project Manager needs a demo of a pull request that has none.
---

The Human watches each project being built piece by piece, and checks each piece's taste and fit from Telegram without running anything, so a Human gate needs a video of the new piece working, not just a pull request. Errors are never a matter of taste: they are defects in every project, and this skill's script fails on them so they never reach the Human. This skill makes that video. Bead, Run, Human gate and Project Manager mean what the Factory's glossary says.

## What to show

Read the Bead and the pull request's diff. Show the piece the Bead added, as a person would meet it: start from the state before the change matters (an empty list, a blank form), then do each thing the Bead promises and let each result stay on screen. Stay on the paths a person takes by clicking and typing on the page. Do not stage an error by sending a request by hand or naming an item that is not there: the Human reads any error on screen as a bug (a staged "error: no item 9" was rejected twice as one, 2026-10-18). Leave out everything the Bead did not touch. A good demo runs 5 to 30 seconds after trimming.

## How

1. **Start the app from this worktree**, in the background, on a port nobody else uses (try 8700 to 8799 until one is free), with its data in a fresh temporary folder so the demo starts clean and never touches the Human's real data. Use the project's own start command, as its README, `--help` or the Bead says. Wait until the port answers.
2. **Write a Playwright script** in a temporary folder, as an ES module (`demo.mjs`), and run it with `NODE_PATH=~/.local/share/factory/demo/node_modules node demo.mjs`. It imports `chromium` from `playwright-core` and launches the Human's installed Chrome:

   ```js
   import { chromium } from 'playwright-core';
   const browser = await chromium.launch({ channel: 'chrome', headless: true });
   const context = await browser.newContext({
     viewport: { width: 1000, height: 640 },
     recordVideo: { dir: VIDEO_DIR, size: { width: 1000, height: 640 } },
   });
   const page = await context.newPage();
   // Any error the app shows or throws fails the demo: errors are defects, not something to show.
   const errors = [];
   page.on('pageerror', e => errors.push(`page error: ${e.message}`));
   page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
   page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
   // ... the steps, with a pause of about 1.5 s after each visible result ...
   await context.close();          // the video is written on close
   console.log(await page.video().path());
   await browser.close();
   if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
   ```

   Also fail the script when error text appears on the page (`await page.getByText(/error/i).count()`), since a page can show an error with a normal status. When the script fails because of the app, not the script, the change is broken: say what failed and save no video.

   Click and type the way a person would (`page.click`, `page.fill` with `{ delay: 60 }` so typing shows), not by calling the page's code. When the change has no screen of its own, such as a new command, show it working in the page or output it affects.
3. **Stop the app** and remove its temporary data folder, whatever happened.
4. **Cut the idle stretches** and convert to MP4: `~/.local/share/factory/demo/trim-idle <the .webm> <output .mp4>`. It keeps the first 1.5 seconds of every still stretch and prints the result's length in seconds.
5. **Check it as the Human will see it.** Make contact sheets of the whole video, four frames a second, 24 frames to a sheet, and look at every frame of every sheet:

   ```bash
   ffmpeg -v error -y -i <mp4> -vf "fps=4,scale=480:-1,tile=4x6" sheet-%02d.png
   ```

   Every frame must show the change working and looking finished. These fail the check, even when the code meant them: an error message, a raw error page, a blank screen, a wrong state, text that runs past its box or overlaps other text, content cut off at the edge, internal names or ids on screen (ticket ids, node ids, names with underscores), and controls that exist only for testing. When the script caused it, fix the script and record again. When the app itself is broken, do not save a video: report the defect and the frame that shows it, so the Project Manager reworks the Bead instead of asking the Human. After three failed tries, report what went wrong instead of a video.

## Where it goes

Save the MP4 at the path the Workflow gives (in a Run, `$FACTORY_DEMOS/$WORKFLOW_ID.mp4`). FactoryClaw attaches it to the Human gate message on Telegram. Keep it under 16 MB; at this size a demo is usually well under 1 MB.
