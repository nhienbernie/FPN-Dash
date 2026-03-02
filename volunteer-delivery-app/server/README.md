# Demo Food Signup API

Simple Node/Express demo server for food user signup verification.

## Run

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

## Sample Requests

Start verification:

```bash
curl -X POST http://localhost:4000/api/food-signup/start \
  -H "Content-Type: application/json" \
  -d '{"phone":"(123) 456-789"}'
```

Verify code and get address:

```bash
curl -X POST http://localhost:4000/api/food-signup/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"123456789","code":"123456"}'
```

Expected success response includes:

- `status: "verified"`
- `address` object
- `deliveryRestriction: "You can only request delivery to this registered address."`
