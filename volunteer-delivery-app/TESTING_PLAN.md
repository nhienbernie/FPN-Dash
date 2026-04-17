# Testing Plan

## Scope

This testing plan is based on the current codebase and the Sprint 1 and Sprint 2 reports. The main features implemented so far are:

- volunteer sign up
- volunteer sign in
- requester verification with phone number, DOB, and demo OTP
- requester food ordering
- volunteer dashboard for viewing and accepting orders
- confirm delivery screen with map link

Since the professor said to focus on unit testing, that should be the main emphasis of the plan. Component testing and a small amount of integration testing should still be included, but they are secondary.

## 1. Unit Testing

Unit testing should target the parts of the app with clear input and output behavior. These are the easiest to test carefully, and they are where boundary conditions matter most.

### A. `validators/volunteerValidators.js`

This file should be the highest priority for unit testing because it contains reusable validation logic used across the sign-up and sign-in flows.

#### `digitsOnly(value)`

What should be tested:

- normal phone number formatting is removed
- letters and symbols are removed
- empty input does not crash
- input with no digits returns an empty string

Example cases:

| Input | Expected output |
| --- | --- |
| `"(740) 555-1111"` | `"7405551111"` |
| `"a1b2c3"` | `"123"` |
| `""` | `""` |
| `"abc"` | `""` |

Boundary conditions:

- completely empty string
- string with only non-digit characters

#### `isValidEmail(value)`

What should be tested:

- valid email is accepted
- missing `@` is rejected
- missing domain is rejected
- surrounding spaces are trimmed correctly
- empty string is rejected

Example cases:

| Input | Expected output |
| --- | --- |
| `"test@example.com"` | `true` |
| `"  test@example.com  "` | `true` |
| `"testexample.com"` | `false` |
| `"test@"` | `false` |
| `""` | `false` |

Boundary conditions:

- empty string
- input that is almost correct but still invalid

#### `isValidZip(value)`

What should be tested:

- exactly 5 digits is accepted
- fewer than 5 digits is rejected
- more than 5 digits is rejected
- letters are rejected

Example cases:

| Input | Expected output |
| --- | --- |
| `"43015"` | `true` |
| `"4301"` | `false` |
| `"430150"` | `false` |
| `"43A15"` | `false` |

Boundary conditions:

- one digit below valid length
- one digit above valid length

#### `buildInitialValues(fields)`

What should be tested:

- normal field list creates an object with all keys set to empty string
- empty field list returns an empty object

Example cases:

| Input | Expected output |
| --- | --- |
| `[{ key: "email" }, { key: "password" }]` | `{ email: "", password: "" }` |
| `[]` | `{}` |

Boundary conditions:

- empty array

#### `validateFieldSet({ fields, values, keys })`

What should be tested:

- required empty fields return errors
- valid filled fields return no errors
- custom validation functions are applied correctly
- the `keys` filter only validates selected fields

Example cases:

| Situation | Expected output |
| --- | --- |
| required `email` left blank | email error returned |
| invalid email format | email error returned |
| valid email | no email error |
| only `email` in `keys`, password blank | password not validated |

Boundary conditions:

- missing values in the values object
- validating only a subset of fields

### B. DOB Formatting Logic in `requester.jsx`

The `formatDobInput` helper is also a good unit test target because it has clear formatting behavior and several edge cases. If possible, this function should be moved into its own helper file so it can be tested more easily.

What should be tested:

- partial input stays valid while typing
- slashes are inserted in the correct places
- extra digits are cut off
- non-digit characters are removed

Example cases:

| Input | Expected output |
| --- | --- |
| `"0"` | `"0"` |
| `"0115"` | `"01/15"` |
| `"01151970"` | `"01/15/1970"` |
| `"01151970123"` | `"01/15/1970"` |
| `"01a15b1970"` | `"01/15/1970"` |

Boundary conditions:

- partial dates
- too many digits
- mixed letters and digits

## 2. Component Testing

After unit tests, component tests should focus on screens and reusable components with important UI behavior.

### A. `AppButton.jsx`

This is a good small component test because it is reused across the app.

What should be tested:

- button text renders correctly
- `onPress` is called when pressed
- disabled button does not call `onPress`

### B. `mode-select.jsx`

This screen is simple, but it is important because it controls routing into the volunteer and requester flows.

What should be tested:

- pressing `Volunteer Mode` routes to `/volunteer-options`
- pressing `Requester Mode` routes to `/requester`

### C. One form screen

If there is time for one larger screen test, the best choices are:

- `volunteer-signup.jsx`, because it has multi-step validation logic
- `requester.jsx`, because it has the disclaimer modal and OTP flow

For `volunteer-signup.jsx`, the most useful checks would be:

- step 1 shows validation errors for empty fields
- valid step 1 input moves to step 2
- mismatched passwords show an error

For `requester.jsx`, the most useful checks would be:

- disclaimer modal appears on load
- invalid phone number shows an error
- invalid DOB shows an error
- verification field appears only after successful code request

## 3. Integration Testing

This should be a smaller part of the plan, since the main focus is unit testing. Still, a few integration tests would help show that the main flows work together.

The most important flows are:

- volunteer sign up leading to dashboard
- volunteer sign in leading to dashboard
- requester verification leading to the order page
- requester placing an order and seeing status update
- volunteer accepting an order and being routed to the confirm delivery screen

These tests would need mocking for Supabase, navigation, and fetch calls.

## 4. Priority Order

If the team is deciding what to implement first, the order should be:

1. unit tests for `volunteerValidators.js`
2. unit tests for DOB formatting logic
3. component tests for `AppButton`
4. component tests for `mode-select`
5. one larger form screen test
6. a few main-flow integration tests

## 5. Final Note

The strongest part of this testing plan should be the unit testing section. That is where the clearest boundary conditions are, and it is where the team can show the most deliberate thought about inputs, outputs, and edge cases. Component and integration tests still matter, but they should support the unit tests rather than replace them.
