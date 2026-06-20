# Overcooked IRL

> A digital game-management platform that turned *Overcooked* into a real-life communication challenge for more than 80 youth participants.

Built for **ZO Camp Jun 2026**, a youth camp for ages 11–15 organised by **BW Monastery 吉祥宝聚寺**.

## The idea

How do you teach communication and active listening without giving another lecture?

We built a game around them.

In this real-life, Overcooked-inspired experience, players receive voice-only food orders and must pass the details through a physical production line. Their teams use Play-Doh to manufacture each dish while coordinating:

1. Order collection
2. Colour selection
3. Food preparation
4. Cooking
5. Assembly and plating
6. Delivery to the correct customer

Every order includes an order number, food items, colour requirements, and plating zones. Success depends on listening carefully, communicating precisely, and working together under time pressure.

This repository contains the platform used to coordinate that experience.

## What the platform does

The application provides separate interfaces for each role in the game:

| Station | Purpose |
| --- | --- |
| **Order** | Assigns a new order to a group and plays its voice instructions. The order details are deliberately audio-only. |
| **Cooking** | Tracks active dishes, cooking times, and whether food was undercooked, correctly cooked, or overcooked. |
| **Customer** | Displays the expected dish and lets facilitators approve, reject, or flag an order delivered to the wrong customer. |
| **Display** | Runs the shared game board with round controls, timers, scores, active orders, sound effects, and Rush Hour. |

The homepage at `/` links to all four station selectors.

## Features

- AI-generated voice orders using Kokoro
- Easy and hard order pools
- Multiple voices assigned across orders
- Six concurrent player groups and customer stations
- Real-time updates through Supabase Realtime
- Group-specific order assignment with duplicate-order protection
- Audio replay tracking
- Multi-stage order statuses from assignment to customer judgement
- Cooking timers with configurable target and buffer times
- Undercooked, correct, and overcooked validation
- Customer verification and wrong-customer handling
- Automatic score and penalty calculation
- Double points during the final Rush Hour period
- Dynamic ingredient recolouring with CSS filters
- Shared display with music, sound effects, match controls, and live scores
- Separate animated leaderboard view
- Seeded game, round, group, customer, ingredient, and order data

## Gameplay flow

```text
Order station
    │
    │ Voice-only order
    ▼
Player group ──► Preparation ──► Cooking station ──► Assembly
                                                        │
                                                        ▼
                                                Customer station
                                                        │
                                         Approve / Reject / Wrong customer
                                                        │
                                                        ▼
                                           Score and display update
```

Supabase stores the shared game state and broadcasts changes to every connected station. Database constraints prevent the same active order from being assigned to multiple groups, while server-side routes handle order assignment, cooking, judging, and scoring.

## The Smart Stove experiment

One feature never made it into the live game: a computer vision-powered **Smart Stove** that automatically detected when cooking began.

The prototype worked, but the deployment environment did not offer the consistency it needed. Changing lighting, camera reliability, device positioning, and the operational burden on facilitators made it too fragile for an event with more than 80 participants.

It was replaced with a simpler timer-based workflow.

That decision became one of the most important lessons from the project:

> Good engineering is not about building the most features. It is about building the right features.

For a live event, reliability and ease of operation mattered more than technical novelty.

## Tech stack

- [Next.js](https://nextjs.org/) and React
- [TypeScript](https://www.typescriptlang.org/)
- [Supabase](https://supabase.com/) for PostgreSQL and realtime state
- [Kokoro.js](https://github.com/hexgrad/kokoro) for local text-to-speech generation
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Lucide](https://lucide.dev/) icons
- [Codex](https://openai.com/codex/) as an AI development collaborator

## Project structure

```text
src/
├── app/
│   ├── order/          # Group order stations
│   ├── cooking/        # Cooking timers and validation
│   ├── customer/       # Customer verification stations
│   ├── display/        # Main game-control display
│   ├── leaderboard/    # Final score reveal
│   └── api/            # Gameplay API routes
├── lib/
│   ├── game-data/      # Ingredients and easy/hard order definitions
│   └── overcooked-26/  # Database configuration and table names
└── seed-overcooked-26.ts

public/
├── ingredients/        # Ingredient artwork
├── order-audio/        # Pre-generated order narration
└── *.mp3               # Music and gameplay sound effects

supabase/
└── migrations/         # Schema and incremental database migrations
```

## Running locally

### Prerequisites

- Node.js 20 or later
- npm
- A Supabase project

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

The service-role key is used only by the local seed script. Never expose it in client-side code or commit it to source control.

### 3. Create the database

Run the SQL files in `supabase/migrations` against your Supabase project, beginning with `create.sql`, followed by the timestamped migrations in chronological order.

> **Warning:** `create.sql` contains development reset statements that drop existing `overcooked_26_*` tables. Review it before running it against any database containing data you need.

### 4. Seed the game

```bash
npm run seed
```

This creates the game rounds, six groups, six customers, food items, and easy and hard order templates.

### 5. Start the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful routes

| Route | Interface |
| --- | --- |
| `/` | Station launcher |
| `/order` | Order station selector |
| `/cooking` | Cooking station selector |
| `/customer` | Customer station selector |
| `/display` | Main display and game controls |
| `/leaderboard` | Leaderboard reveal |

The selector pages generate station-specific URLs using the relevant group or customer number.

## Order audio

Generated WAV files are stored in `public/order-audio` and tracked by a manifest. To regenerate them locally:

```bash
npm run generate:order-audio
```

The first run downloads the Kokoro ONNX model and performs generation on the CPU, so it may take some time.

Optional arguments can be passed after `--`:

```bash
npm run generate:order-audio -- --dry-run
npm run generate:order-audio -- --only=4829,7316
npm run generate:order-audio -- --force
npm run generate:order-audio -- --voices=af_heart,am_puck
```

## Other scripts

```bash
npm run lint                 # Run ESLint
npm run build                # Create a production build
npm run validate:game-data   # Validate ingredients and order definitions
```

## Why this project matters

This was not built as a screen-based game. The software existed to support a physical experience: people listening, moving, making, misunderstanding, recovering, and learning to communicate as a team.

Watching an idea from a planning committee discussion become a deployed experience for more than 80 participants was one of the most rewarding parts of the project.

## Acknowledgements

Huge thanks to the ZO Camp Jun 2026 planning committee, facilitators, and everyone at **BW Monastery 吉祥宝聚寺** who helped bring the game to life.
