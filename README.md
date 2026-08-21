# FPN Dash

FPN Dash helps food pantries coordinate grocery deliveries.

The app supports three roles:

- Requesters place grocery orders and track delivery status.
- Volunteers accept requests, manage active deliveries, and confirm drop-off.
- Pantry staff review orders, reports, and dashboard activity.

The project uses Expo, React Native, Supabase, and a local Node/Express demo
API.

## Main Flows

- Request food with a verified pantry account.
- Choose grocery boxes and items.
- Review and submit an order.
- Track order status.
- Sign up or sign in as a volunteer.
- Accept an available delivery.
- View delivery details and route context.
- Report a delivery concern.
- Upload delivery proof before confirming completion.
- Review pantry operations from the admin dashboard.

## Repository Layout

```text
.
+-- README.md
+-- Sprint5_Report.pptx
`-- volunteer-delivery-app/
    +-- app/                 # Expo Router screens
    +-- assets/              # App icons and map pins
    +-- components/          # Shared UI
    +-- e2e/                 # Playwright tests
    +-- lib/                 # App workflow helpers
    +-- scripts/             # Demo and test scripts
    +-- server/              # Local demo API
    +-- services/            # Supabase and API clients
    +-- supabase/migrations/ # SQL migrations
    `-- validators/          # Form validation and tests
```

## Tech Stack

- Expo
- React Native
- Expo Router
- Supabase
- Node.js
- Express
- Jest
- Playwright

## Setup

Install dependencies:

```bash
cd volunteer-delivery-app
npm install
```

Create `volunteer-delivery-app/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_DEMO_API_URL=http://localhost:4000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only.

Start the demo API:

```bash
npm run server
```

Start the app:

```bash
npm run start
```

Other app targets:

```bash
npm run ios
npm run android
npm run web
```

## Demo Login

The local API runs at `http://localhost:4000`.

Demo requester:

- Phone: `1234567890`
- Date of birth: `01/01/2001`
- Verification code: `123456`

Other demo users live in
`volunteer-delivery-app/server/data/pantry-users.json`.

## API Endpoints

- `GET /api/health`
- `POST /api/food-signup/start`
- `POST /api/food-signup/verify`

## Tests

Run unit tests:

```bash
cd volunteer-delivery-app
npm run test
```

Run coverage:

```bash
npm run test:coverage
```

Run end-to-end tests:

```bash
npm run web:e2e
npm run test:e2e
```

Run the headed demo test flow:

```bash
npm run test:e2e:demo
```
