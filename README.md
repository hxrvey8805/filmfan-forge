# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/fc3d7687-7c1e-47f1-8ebf-4ac5e131eb86

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/fc3d7687-7c1e-47f1-8ebf-4ac5e131eb86) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Private iPhone and Android builds

The native apps bundle the React application and connect to the same CineGeek accounts as the website. The sample Home Screen preview is separate and can stay installed. Native builds do not use the preview account, service worker or a local preview server.

With Node 22 or newer, run `npm ci` and `npm run native:sync` from this directory. The native bundle uses the project's public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep provider keys on the backend.

- **iPhone:** `npm run native:ios` opens the project in Xcode. Select the **App** target → **Signing & Capabilities**, choose your Personal Team, select your connected iPhone as the run destination, and press **Run**. Enable Developer Mode on the phone if Xcode asks. No store upload is needed.
- **Android:** `npm run native:android` opens the project in Android Studio. With Android SDK 36 installed, run **app** on a connected phone or emulator. To produce a private debug APK, run `./gradlew assembleDebug` from `android/` with Java 21.

After changing the React app, repeat `npm run native:sync` before building in either IDE. Email confirmation opens in the browser; return to the native app to sign in. The device install does not publish the website or change the companion backend.

### Watch Focus on iPhone

Start focus never changes the companion's viewing position. The private Personal Team build runs a timer and reflects an existing iOS Guided Access lock; it does not send viewers to Settings. Android and the website have the timer only.

Selective app blocking is a separate, opt-in iOS 16+ feature. Leave `CINEGEEK_FOCUS_ENTITLEMENTS` unset for the Personal Team. For an eligible team, configure the [Family Controls capability](https://developer.apple.com/documentation/xcode/configuring-family-controls) and provisioning profile for the app, then set `CINEGEEK_FOCUS_ENTITLEMENTS=App/WatchFocus.entitlements` in the signed build. Distribution also requires [Apple approval](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement).

The first protected start opens the system permission and app picker in CineGeek. Start focus reuses the saved choices on later sessions. Edit apps can change them or clear the selection for a timer-only default. The native app saves only opaque app tokens per viewer, excluding them from backup; revoking authorization discards the saved choices.

Before releasing selective blocking, test on an entitled physical iPhone: deny and grant individual authorization, select a disposable app, confirm its system shield appears and an unselected streaming app still opens, switch to Ask and back, then end focus and confirm access returns. Relaunch, start another title without opening a picker, edit the saved set, and test revocation and switching viewer accounts. Repeat with an episode switch and with a force-quit followed by reopening CineGeek. The app only applies shields to an explicit selection; there is no scheduled end. Selections stay on device, and only a count reaches the UI.

## Testing the timestamp-only companion

```sh
npm ci --ignore-scripts
npm run test:companion
npx tsc -p tsconfig.app.json --noEmit
npm run build
deno check supabase/functions/spoiler-free-companion/index.ts supabase/functions/process-subtitles/index.ts supabase/functions/annotate-speakers/index.ts
```

The regression suite uses synthetic subtitles and conversations, React interface tests, and an isolated PostgreSQL database with pgvector. It runs the actual companion migration and retrieval/payment functions without contacting production or paid AI providers. Tests cover exact cue boundaries, CRLF subtitle parsing, movie retrieval, rewinds, episode/title/account changes, delayed responses, model memory, answer verification, and retry-safe charging.

Both companion screens use server-owned conversation records scoped to the title, episode and viewing timestamp. Rewinding hides later records immediately; they become available again only when the viewing position permits them. Legacy conversations and subtitle caches remain stored but are excluded from the new companion. Cache misses import raw timed cues on demand. Earlier assistant answers help resolve conversational references but cannot serve as plot evidence.

The current paid companion is an enrolled private beta using OpenRouter, the pinned GPT-6.1 Sol model and a server-enforced $5 total production budget. Keep the existing model, owner enrollment, per-question timestamp boundaries and independent answer review. Provider keys stay in backend secrets. Do not reset the budget, replay historical migrations or enable paid fallbacks during deployment.

New deployments must apply only their outstanding reviewed migrations before deploying the affected functions. The optional Smart List interpreter uses a separate zero-price route with no paid fallback; it proposes a rule for the user to confirm, and catalogue facts determine which titles match. Its cache and rate limits are private and server-enforced.

Automated tests do not establish real-model answer quality or subtitle alignment for every streaming edition. Keep release receipts for representative questions, requested recap ranges, rewinds and episode switches. Only verified timestamped visual notes can support silent scene details; the model must not fill gaps with future story knowledge.

The onboarding subscription screens are a design preview: they do not activate subscriptions or implement paid-tier entitlements. Existing accounts bypass new-account onboarding. Commercial StoreKit billing, final allowances and the XP migration remain separate release work. Native private builds and backend deployments do not publish the public website or submit an App Store release.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/fc3d7687-7c1e-47f1-8ebf-4ac5e131eb86) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
