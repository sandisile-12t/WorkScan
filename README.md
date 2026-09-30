# WorkScan

Attendance tracking for a small company. Staff scan a QR code on the office door to
sign in and out; managers get a dashboard and a downloadable Excel register.

Built with Expo SDK 57, Expo Router, TypeScript, Firebase Authentication and Firestore.

## How it works

A single printed QR code on the office door handles both directions:

- **First scan of the day** records check-in.
- **Second scan** records check-out and calculates hours.
- **Further scans** are ignored and reported as "day complete".

The code rotates every morning, so a photo of yesterday's code is worthless. A manager
can also replace the code on demand if the printed copy is damaged or leaks.

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure Firebase

The app targets the existing Firebase project `workscan-3dad8`.

1. Go to the [Firebase console](https://console.firebase.google.com/) and open
   **Project settings → General → Your apps**.
2. If there is no web app, click **Add app → Web** and copy the config values.
3. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_FIREBASE_API_KEY`,
   `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` and `EXPO_PUBLIC_FIREBASE_APP_ID`.

```bash
cp .env.example .env    # Windows: copy .env.example .env
```

`.env` is gitignored. A Firebase web API key is not a secret — it is only scoped by
your security rules — but never commit a service account private key.

### 3. Create the Firestore database

> As of the last check, project `workscan-3dad8` had **never had Firestore enabled**.
> Reading a document returned `SERVICE_DISABLED`, so this step has to be done once.

In the console: **Firestore Database → Create database**. Pick a location — it is
**permanent** and cannot be changed later. `africa-south1` (Johannesburg) is the
closest option for South Africa; otherwise pick the one nearest your users.

Leave the mode as **production mode**. The rules in step 4 are then the only thing
granting access, so nothing is readable before you deploy them.

### 4. Enable Email sign-in

> Authentication was also uninitialised: the Identity Toolkit returned
> `CONFIGURATION_NOT_FOUND`, which makes every auth call fail.

In the console: **Authentication → Get started** (this initialises Identity Platform),
then **Sign-in method → Email/Password → Enable**.

Verify:

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$EXPO_PUBLIC_FIREBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"probe@example.invalid","password":"xxxxxxxx","returnSecureToken":true}'
```

`INVALID_EMAIL` or `INVALID_LOGIN_CREDENTIALS` means Email/Password is on.
`CONFIGURATION_NOT_FOUND` or `PASSWORD_LOGIN_DISABLED` means it is still off.

### 5. Deploy the security rules

A fresh Firestore project denies all reads and writes, so the app cannot work until
the rules in `firestore.rules` are deployed.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

`.firebaserc` already pins the default project to `workscan-3dad8`, so no
`firebase use` is needed. If you get `401 Unauthenticated` after logging in, run
`firebase login --reauth` — stale CLI tokens are a common cause.

`firestore.indexes.json` is intentionally empty — every query in the app is filtered on
a single field and sorted on the client, so no composite index is needed.

### 6. Run

```bash
npm start
```

**Expo Go works.** All four native modules this app uses are bundled in Expo Go for
SDK 57 — `expo-camera`, `expo-print` and `expo-sharing` all list `expo-go` in their
supported platforms, and `expo-file-system` does too. So `npm start` plus a scan from
your phone is enough to try it:

```bash
npm start        # then scan the QR code with the Expo Go app
```

A development build is only needed if you want to test custom native configuration,
or to ship a standalone binary:

```bash
npx expo run:android      # or: npx expo run:ios
```

**The web target is not usable.** `expo-file-system` has no web implementation, so
Excel export and QR printing will fail in a browser. `expo-camera` does work on web
via the browser BarcodeDetector API, but everything else is native-only. Treat web as
a layout-preview convenience, not a test platform.

### 7. First run

The **first account to register always becomes a manager** — this is what guarantees
somebody can reach the admin screen on a fresh install. From then on, anyone choosing
"Manager" at sign-up must supply the manager code, which a manager can change under
**Admin → Manager code**.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the dev server |
| `npm run lint` | ESLint via `expo lint` |
| `npm run typecheck` | TypeScript, generating router types first |
| `npm run router-types` | Regenerate `.expo/types/router.d.ts` by itself |

`npm run typecheck` runs `router-types` first because Expo only writes the typed-routes
declaration while the dev server is running, and replaces it with a stub on shutdown.
The stub makes every `router.push('/…')` a type error, so a bare `tsc --noEmit` would
report dozens of false failures. Rerun `npm run router-types` after adding a route.

## How the data is stored

| Path | Contents |
| --- | --- |
| `users/{uid}` | Name, email, employee number, role |
| `config/app` | Manager code and bootstrap state |
| `config/employeeSeq` | The employee number sequence (a single counter) |
| `offices/{officeId}` | Office name and location |
| `officeTokens/{officeId}` | The current day's rotating token |
| `attendance/{uid}_{YYYY-MM-DD}` | One row per person per day |

### Employee numbers

Nobody types an employee number. The signup form allocates one automatically from
`config/employeeSeq`, so the first person is `01`, the second `02`, and so on. Managers
are numbered too.

The counter is read and written inside the same transaction that creates the profile,
which means a signup that fails never burns a number and two people registering at the
same instant can never be given the same one. The `config/employeeSeq` security rule
allows the counter to move by exactly one and nothing else, so no client can choose its
own number, rewind the sequence, or reset it.

Numbers are treated as permanent. They are copied onto each attendance record and show
up in Excel reports, so a number is never reissued or changed — if someone leaves, the
number stays with their history.

To restart the sequence from `01`, delete the `config/employeeSeq` document in the
Firestore console while no one is signing up.

A QR payload looks like:

```
WORKSCAN|head-office|K3F9QX2M|2026-09-27|1789941120000
```

office id, token, date and issue time. On scan the token is compared against the live
`officeTokens` document inside a transaction, so an old screenshot cannot be reused.

## Notes and limitations

- Role checks in the UI are a convenience. The real boundary is `firestore.rules`,
  which decides "is this account a manager" from the server-side copy of the user's own
  profile.
- Anyone holding the manager code can see everyone's attendance and export the
  register. Treat it like a password and change it if it leaks.
- The Excel export is written by a small hand-rolled workbook writer
  (`src/lib/xlsx.ts`) using `fflate`, so there is no heavyweight spreadsheet
  dependency in the app bundle.
- Times are stored as UTC ISO strings and rendered in the device's local timezone. A
  phone with a wrong clock will record wrong times.
- There is no payroll integration; the register is a `.xlsx` you send on.

## Project layout

```
src/app/          Expo Router screens (index, login, signup, dashboard,
                  scan, history, admin, qr-code) and the root _layout
src/components/   Screen shell and the shared UI kit
src/lib/          Firebase, auth, attendance, QR, XLSX and report logic
src/types/        Ambient type augmentations
scripts/          Helper scripts (router type generation)
firestore.rules   Security rules — deploy these
```
