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

For rollout, apply `supabase/migrations/20261013120000_companion_evidence_and_memory.sql`, deploy `process-subtitles`, `annotate-speakers`, and `spoiler-free-companion` with their shared modules, then publish the frontend. The backend requires the existing Supabase, OpenSubtitles and Groq environment secrets; OpenAI embeddings are optional because keyword and timestamp retrieval also work. The schema, functions, and frontend must be released together through the project's deployment workflow.

Automated checks do not measure live model accuracy or subtitle alignment with a particular streaming edition. Validate representative films and episodes against the actual playback timestamps after deployment, including rewind, episode switch and follow-up questions. Subtitles cannot establish every silent visual action; unsupported questions receive an uncertainty response without consuming a free question or coins. A later scene-understanding data source would be needed to answer those visual questions reliably while retaining timestamp-only input.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/fc3d7687-7c1e-47f1-8ebf-4ac5e131eb86) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
