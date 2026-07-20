# NOBE Attendance Portal: In-Depth Debugging & Testing Checklist

Use this checklist to verify, test, and debug the entire application flow in the logical order of operations. Since downstream features (like check-ins, absences, and strikes) depend on upstream states (like database seeds, invited users, and active events), running tests in this exact order will help isolate errors quickly.

---

## Phase 1: Database & Environment Prerequisites
*Ensure the foundation is fully operational before executing client actions.*

### 1.1 Environment Configuration Check
- [ ] **Supabase Credentials**: Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` are defined in `.env.local` for the client.
- [ ] **Supabase Admin Role**: Verify `SUPABASE_SERVICE_ROLE_KEY` is present (critical for `createAdminClient` functions that bypass Row Level Security during onboarding and strike processing).
- [ ] **GAS Email Credentials**: Confirm `GAS_EMAIL_URL` and `GAS_EMAIL_SECRET` are set.
- [ ] **Origin Domain**: Verify `NEXT_PUBLIC_SITE_URL` matches your local hosting address (e.g., `http://localhost:3000`) so callback URLs don't redirect to production environments.

### 1.2 Table & Storage Bucket Validation
- [ ] **Required Tables**: Verify the following tables exist in your Supabase database:
  - `People` (Stores user profile information, roles, point totals, and Google Calendar tokens)
  - `events` (Stores calendar events, points, check-in window offsets, and QR secrets)
  - `attendance` (Links users to attended events and records points awarded)
  - `excused_absences` (Stores member excuse requests, statuses, and image proof URLs)
  - `strikes` (Tracks manual and automatic infractions)
  - `point_requirements` (Defines thresholds for professional, service, and social events)
  - `weekly_reminder_note` (Stores custom announcement text for weekly digests)
- [ ] **Storage Bucket**: Ensure an public/authenticated storage bucket named `absence-images` exists in Supabase for user documentation uploads.

### 1.3 Database Seeding
- [ ] **Point Requirements**: Insert a row with `id = 1` in `point_requirements` (e.g. `professional_goal = 7`, `service_goal = 3`, `social_goal = 5`). If missing, verify the code falls back gracefully.
- [ ] **Weekly Reminder Note**: Insert a row with `id = 1` in `weekly_reminder_note` (even if empty) to prevent `.single()` query errors on the weekly digest endpoint.

---

## Phase 2: Onboarding & Account Provisioning
*Verify how users are registered and added to the system.*

### 2.1 Bulk User Onboarding (CSV Upload)
- [ ] **Header Format Check**: Upload a CSV with headers: `Name`, `First Name`, `Last Name`, `Illinois Email`, `Year`, `College`, `Major`, `Committee`. Try uploading with incorrect headers and ensure it returns a `400` error with specific missing header labels.
- [ ] **Validation Checks**: Verify that rows containing empty fields are skipped and listed in the API return JSON under `missingRows`.
- [ ] **Duplicate Filtering**: Upload a CSV containing users already stored in `People`. Ensure the database counts them under `existing` and does not insert duplicate rows.
- [ ] **Onboarding Email Trigger**: After a successful upload, verify that:
  - An invite link is generated with format `/auth/callback?token_hash=...&type=invite`.
  - An email is received by the target user via the GAS service with the setup link.
  - A bare-bones record is created in the `People` table linked to the newly generated `auth_id`.

### 2.2 Single User Invitation (Admin Console)
- [ ] **Email Constraint**: Attempt to invite a non-Illinois email (e.g., `@gmail.com`). Verify that the API rejects it with a `400` validation error ("A valid @illinois.edu email is required").
- [ ] **Credentials Generation**: Check that a random 12-character temporary password is created and emailed to the user, instructing them to set a custom password.

### 2.3 Account Setup Flow
- [ ] **Verification Page**: Click the link in the received invite email. Verify it routes through `/auth/callback` and successfully redirects to `/auth/setup-account` with the `token_hash` and `type=invite` parameters.
- [ ] **Security Handshake**: Click **"Set Up My Account"** to trigger `supabase.auth.verifyOtp`. Ensure no errors occur.
- [ ] **Password Constraints**: 
  - Attempt to enter a password shorter than 8 characters. Verify the validator blocks it.
  - Enter non-matching passwords in the confirmation box. Verify validation blocks it.
- [ ] **Profile Setup Completion**: Submit a valid password. Verify the app updates the password in Supabase Auth, updates the member details in the `People` table, and redirects the user to their dashboard.

---

## Phase 3: Authentication & Route Protection
*Verify logins, session caching, and role boundaries.*

### 3.1 Regular Sign In & Signup
- [ ] **Illinois Email Restriction**: Attempt a regular signup using a standard email provider. Verify it blocks registration unless the **"Testing features (allow non-illinois emails)"** checkbox is ticked.
- [ ] **Unconfirmed Email State**: Attempt to sign in with an unconfirmed signup email. Ensure it throws an "Email not confirmed" error and displays a working **"Resend confirmation email"** button.

### 3.2 Role-Based Routing & Session Guarding
- [ ] **Session Check**: Access the login page while already logged in. Verify the app automatically redirects you to `/users/admin` (if ADMIN) or `/users/member` (if MEMBER).
- [ ] **Admin Guard**: Log in as a `MEMBER` and attempt to navigate directly to `/users/admin` or administrative subpages. Verify you are automatically redirected back to `/users/member`.
- [ ] **Guest Guard**: Clear your cookies/session and try to visit `/users/member` or `/users/admin`. Verify you are instantly redirected to `/users/login` with the redirect path appended to the URL query string.
- [ ] **Post-Auth Redirection**: Log in from a page that caught you as a guest. Verify you are redirected back to your original destination target (using the `redirect` or `next` URL parameters).

---

## Phase 4: Event Management
*Ensure events are correctly created, formatted, and exposed to members.*

### 4.1 Single Event Creation
- [ ] **Field Inputs**: Create an event with a name, points, category, date, start/end times, offsets, location, and dress code.
- [ ] **Check-In Windows**: Confirm that check-in start and end dates/times are accurately computed based on your event start time and the specified start/end offset minutes.
- [ ] **Code Validation**: Verify that the generated QR code matches the dynamic route `/check-in/[qr_code_secret]`.

### 4.2 Bulk Event Import (CSV)
- [ ] **Datetime Combination**: Upload an event CSV. Verify the parser merges the `date` and `start_time` fields into valid Unix timestamp integers.
- [ ] **Categorization Normalization**: Verify that categories like "professional" or "social" are normalized to uppercase string values (`PROFESSIONAL`, `SOCIAL`, `SERVICE`) matching the database enum.
- [ ] **Dress Code Normalization**: Ensure fields like "biz casual" normalize to "Business Casual" during parsing.

---

## Phase 5: Event Attendance & QR Check-In
*Test the real-time check-in workflow and point mechanics.*

### 5.1 QR Code Scanning (Dynamic Routes)
- [ ] **Guest Scan**: Scan a QR code secret when logged out. Verify the user is prompted to log in and, upon success, is automatically checked in without having to scan the QR code again.
- [ ] **Authenticated Scan**: Scan a QR code secret when logged in. Verify check-in is instant and shows a success state.
- [ ] **Point Awards Verification**: Look up the member in the database. Ensure the points for the event category (e.g. `professional_points`) incremented by the correct point value.
- [ ] **Attendance Log**: Verify a new record was added to the `attendance` table containing the correct `user_id`, `event_id`, `points_awarded`, and `point_type`.

### 5.2 Check-In Validation Edge Cases
- [ ] **Invalid QR**: Navigate to `/check-in/fake_secret_123`. Verify the API returns `404 Invalid QR code`.
- [ ] **Premature Scan**: Attempt check-in before the check-in window opens. Verify the page returns `403 Check-in opens at [Formatted Chicago Time]`.
- [ ] **Late Scan**: Attempt check-in after the check-in window closes. Verify the page returns `403 Check-in closed at [Formatted Chicago Time]`.
- [ ] **Double Check-In**: Attempt check-in on an event you have already checked into. Verify the API blocks it and returns `409 You have already checked in to this event`.

---

## Phase 6: Absence Submission & Approval Pipeline
*Debug the submission of excused absences and the subsequent review flow.*

### 6.1 Member Submission
- [ ] **Dropdown Events**: Open the absence form. Verify that only active/upcoming events are loaded.
- [ ] **Duplicate Protection**: Attempt to submit a second request for the same event. Verify that the submission is blocked.
- [ ] **Documentation Upload**: Submit an absence form including an image file. Verify that:
  - The image is saved in the Supabase `absence-images` bucket under the path `[user_id]/[timestamp]-[filename]`.
  - A record is written to `excused_absences` with status `PENDING` and a valid `image_url`.
- [ ] **Admin Notification Email**: Check that an notification email was sent to `NEXT_PUBLIC_ADMIN_NOTIFICATION_EMAIL` showing the submitter, event, and reason.

### 6.2 Admin Review
- [ ] **Absence Request List**: Log in as an admin and open `/users/admin/reviewAbsence`. Verify that pending requests display correctly and reviewed requests are grouped separately.
- [ ] **Approval Effects (Point Restoration)**: Approve a pending absence. Verify:
  - An `attendance` record is generated automatically for the member (marking them as present).
  - An email notification is sent to the member showing the status as approved.
  - **CRITICAL DEBUGGING CASE**: If a strike was already generated for this missed event, verify whether the system automatically deletes/updates the corresponding strike in the `strikes` table and decrements `People.strikes`. *(Note: If this logic is missing, mark this as a bug to fix!)*
- [ ] **Denial Effects**: Deny a request. Verify that the record status changes to `DENIED` and an email notification detailing the denial reason is sent to the member.
- [ ] **Retry Channel**: Attempt to trigger `api/admin/retry-email` for a request where the notification email initially failed to send. Verify the retry operates successfully.

---

## Phase 7: Infractions & Strike Processing
*Test automated and manual strike management.*

### 7.1 Manual Strikes
- [ ] **Manual Assignment**: Navigate to `/users/admin/reviewMemberStats/[memberId]/addStrike` and add a strike. Verify:
  - A strike record is created in the `strikes` table marked as `ACTIVE` and `status = 'ACTIVE'`.
  - The `strikes` count on the user's profile in the `People` table increments by `1`.
  - A strike notification email is sent to the member's Illinois inbox.

### 7.2 Automatic Strike Engine (`/api/admin/process-strikes`)
- [ ] **Processing Selection**: Run a POST request to `/api/admin/process-strikes`. Verify it selects only events that:
  1. Are marked as mandatory (`is_mandatory = true`).
  2. Have ended in the past (`check_in_ends_at < now`).
  3. Have not been processed yet (`strikes_processed = false`).
- [ ] **Infraction Check**: Verify that members who:
  - **Did not attend** and **do not** have an APPROVED excuse receive a strike record, have their `People.strikes` incremented, and receive a notification email.
  - **Did attend** are skipped.
  - **Have an APPROVED excuse** (verified in `excused_absences` where status is `APPROVED`) are skipped.
- [ ] **Mark Processed**: Confirm the event's `strikes_processed` field updates to `true` to prevent duplicate processing.

---

## Phase 8: Cron Jobs & Automated Comms
*Verify scheduled email automation routes.*

### 8.1 Weekly Digest (`/api/send-weekly-digest`)
- [ ] **Digest Query Parameters**: Trigger a test digest by hitting `/api/send-weekly-digest?testEmail=netid@illinois.edu&dryRun=true`.
- [ ] **Categorized Event Sort**: Inspect the email content. Verify events are categorized and sorted in order: `PROFESSIONAL`, `SOCIAL`, `SERVICE`, `GENERAL_MEETING`, etc.
- [ ] **Notes Insertion**: Ensure text from the `weekly_reminder_note` table is appended to the bottom of the email digest.

### 8.2 Point Alerts (`/api/send-point-alerts`)
- [ ] **Alert Query Parameters**: Trigger a test points alert by hitting `/api/send-point-alerts?testEmail=netid@illinois.edu`.
- [ ] **Progress Math**: Verify the email contains exact numbers comparing current points against required goals (e.g. `Professional: 3/7 points`).
- [ ] **Recommendations Engine**: Verify that if a category goal is not met, the email appends up to 3 upcoming events matching that specific category. Ensure categories with completed goals do not recommend events.
