# Demo Food Signup API

Simple Node/Express demo server for food user signup verification.

## Run

Add this to `volunteer-delivery-app/.env` before starting the server:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The server reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
from the existing app `.env`, and uses the service-role key only on the server.

Then run:

```bash
npm run server
```

Server runs on `http://localhost:4000` by default.

## Endpoints

- `GET /api/health`
- `POST /api/food-signup/start`
- `POST /api/food-signup/verify`

## Demo Notes

- Verification code is fixed to `123456`.
- Pantry database is local JSON at `server/data/pantry-users.json`.
- Verification state is in-memory and resets when the server restarts.
- Requesters must match both phone number and DOB before verification starts.

## Sample Requests

Start verification:

```bash
curl -X POST http://localhost:4000/api/food-signup/start \
  -H "Content-Type: application/json" \
  -d '{"phone":"5550000001","dob":"01/15/1970"}'
```

Verify code, sign in, and get a session:

```bash
curl -X POST http://localhost:4000/api/food-signup/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"5550000001","dob":"01/15/1970","code":"123456"}'
```

Expected success response includes:

- `status: "verified"`
- `normalizedPhone`
- `firstName`
- `lastName`
- `address` object
- `deliveryRestriction: "You can only request delivery to this registered address."`
- `session` object with Supabase access and refresh tokens
