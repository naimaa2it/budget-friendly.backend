# YourHaat Backend — Admin & User Authentication

This Express backend provides two separate authentication systems:
1. **Regular users** (Firebase-authenticated) → stored in `User` collection
2. **Admin/Moderator accounts** (email/password + secret code) → stored in `Admin` collection

**Same email CAN register as both a user AND an admin** because:
- **Users** create Firebase accounts and are stored in User collection
- **Admins** do NOT use Firebase - they have local passwords hashed in Admin collection
- They are completely independent with no connection

---

## Database Models

### User Model (`models/User.js`)
For regular customers who sign up via Firebase (Google or email/password).

**Fields:**
- `email` (required, lowercase, trimmed) - can duplicate if different provider
- `name`, `image`
- `role` (default: 'user')
- `provider` (firebase, google, local)
- `isVerified` (Boolean)
- `createdAt`

**Authentication flow:**
1. Frontend authenticates with Firebase
2. Frontend posts user info to `POST /api/auth/firebase-login`
3. Backend upserts user in `User` collection and issues JWT cookie

---

### Admin Model (`models/Admin.js`)
For admin and moderator accounts with local email/password authentication.

**Fields:**
- `name`, `email` (lowercase, trimmed, unique per admin)
- `hashedPassword` (bcrypt with 12 rounds - local password, NOT Firebase)
- `role` (admin | moderator)
- **Security fields:**
  - `isActive` — can be disabled by super admin
  - `isLocked` — locked after failed login attempts
  - `lockUntil` — auto-unlock timestamp
  - `loginAttempts` — counter for failed attempts
  - `lastLoginAt`, `lastLoginIP` — audit trail
- **Password reset:**
  - `resetToken`, `resetExpires`
- **Audit:**
  - `createdAt`, `updatedAt`

**KEY DIFFERENCE: Admins do NOT create Firebase accounts**
- Admin passwords are hashed with bcrypt on the backend
- Admin login requires: email + password + admin secret code
- No Firebase involvement for admins
- Same email can be both user (in Firebase) and admin (local password)

**Security features:**
- Account locks after **5 failed login attempts** (30-minute lockout)
- Passwords must be **at least 6 characters**
- Login attempts and IP addresses are logged
- Admin secret code (`ADMIN_SECRET`) validated on registration and login
- Passwords hashed with bcrypt (12 rounds)

**Virtual field:**
- `isCurrentlyLocked` — checks if account is locked and lockout hasn't expired

**Methods:**
- `incLoginAttempts()` — increments failed login counter and locks account if threshold reached
- `resetLoginAttempts()` — resets counter on successful login

---

## API Endpoints

### Regular User Auth (`/api/auth`)

#### `POST /api/auth/firebase-login`
Upserts user in `User` collection after Firebase authentication.
- **Body:** `{ email, name, image, provider }`
- **Response:** Sets JWT cookie and returns user object

#### `GET /api/auth/me`
Returns current user from JWT cookie (checks both User and Admin collections based on token type).
- **Response:** `{ user: {...} }` or `{ user: null }`

#### `POST /api/auth/logout`
Clears JWT cookie.

---

### Admin Auth (`/api/admin`)

#### `POST /api/admin/check-email`
Checks if email is already registered as admin (same email OK for users).
- **Body:** `{ email }`
- **Response:** `{ exists: false, ok: true }` or error

#### `POST /api/admin/register`
Creates a new admin/moderator account with local password (NO Firebase).
- **Body:** `{ name, email, password, adminSecret, role }`
- **Validation:**
  - Password must be ≥6 characters
  - Email must not already exist as admin (can exist as user)
  - `adminSecret` must match `process.env.ADMIN_SECRET`
  - Password is hashed with bcrypt on backend
- **Response:** `{ ok: true, user: {...} }`

#### `POST /api/admin/login`
Authenticates admin/moderator with email + password + secret code (NO Firebase).
- **Body:** `{ email, password, adminSecret }`
- **Security checks:**
  1. Validates admin secret
  2. Checks if admin account exists
  3. Checks if account is active (`isActive = true`)
  4. Checks if account is locked (returns minutes remaining)
  5. Verifies password → increments login attempts on failure
  6. On success: resets attempts, updates `lastLoginAt` and `lastLoginIP`



- **Response:** Sets JWT cookie (with `type: 'admin'`) and returns user object
**Error responses:**
- 403: Invalid admin secret, account disabled, or not an admin account
- 423: Account temporarily locked (includes minutes remaining)
- 401: Invalid credentials

#### `POST /api/admin/forgot`
Generates password reset token for admin.
- **Body:** `{ email, adminSecret }`
- **Response:** `{ ok: true, token }` (in production, send via email)

#### `POST /api/admin/reset`
Resets admin password using reset token.
- **Body:** `{ token, newPassword }`
- Validates token expiry (30 minutes)
- Resets login attempts and unlocks account

---

## Environment Variables

**Required:**
- `MONGODB_URI` or `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — Secret for signing JWT tokens
- `ADMIN_SECRET` — Secret code required for admin registration/login
- `FRONTEND_ORIGIN` — Frontend URL (for CORS)

**Optional:**
- `PORT` — Server port (default: 5000)
- `NODE_ENV` — Set to 'production' for secure cookies

---

## JWT Token Structure

**Regular user token:**
```json
{
  "id": "user_id",
  "role": "user"
}
```

**Admin/Moderator token:**
```json
{
  "id": "user_id",
  "role": "admin",
  "type": "admin"
}
```

**Note:** Both user and admin tokens are issued for users stored in the `User` collection. The difference is in the `role` field determined by their account type.


The `type: 'admin'` field tells `/api/auth/me` to look in the `Admin` collection instead of `User`.

---

## Security Best Practices

### Current implementation:
✅ Separate Admin collection (admins not mixed with users)  
✅ Bcrypt password hashing (12 rounds)  
✅ Account locking after failed attempts  
✅ JWT HTTP-only cookies (sameSite: lax)  
✅ Server-side admin secret validation  
✅ Login attempt and IP logging  

### Recommended improvements:
- [ ] Verify Firebase ID tokens server-side (Firebase Admin SDK)
- [ ] Add rate limiting to login endpoints (express-rate-limit)
- [ ] Send password reset emails instead of returning tokens
- [ ] Add 2FA for admin accounts
- [ ] Use refresh tokens for longer sessions
- [ ] Add role-based middleware to protect admin-only routes
- [ ] Log admin actions to audit log

---

## Usage Example

### Register an admin:
```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@example.com",
    "password": "securepass123",
    "adminSecret": "your-secret-from-env",
    "role": "admin"
  }'
```

### Login as admin:
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "admin@example.com",
    "password": "securepass123",
    "adminSecret": "your-secret-from-env"
  }'
```

### Check session:
```bash
curl http://localhost:5000/api/auth/me -b cookies.txt
```

---

## Migration Notes

If you have existing admin accounts in the `User` collection, you'll need to migrate them to the `Admin` collection. Run a migration script to:
1. Find all users with `role: 'admin'` or `role: 'moderator'`
2. Copy them to the `Admin` collection
3. Optionally remove them from `User` collection

---

## Troubleshooting

**"Account is temporarily locked"**
- Wait 30 minutes, or manually reset in MongoDB:
  ```javascript
  db.admins.updateOne(
    { email: "admin@example.com" },
    { $set: { isLocked: false, loginAttempts: 0 }, $unset: { lockUntil: 1 } }
  )
  ```

**"Invalid admin secret"**
- Check that `ADMIN_SECRET` is set in `.env`
- Make sure frontend is sending the correct value

**Admin can't access dashboard**
- Check `/api/auth/me` returns `role: 'admin'` or `role: 'moderator'`
- Check JWT cookie is being sent with credentials

---

## File Structure
```
yourhaatbackend/
├── index.js              # Express app + CORS + MongoDB
├── models/
│   ├── User.js          # Regular user model
│   └── Admin.js         # Admin/moderator model (NEW)
└── routes/
    ├── auth.js          # Regular user auth + /me endpoint
    └── admin.js         # Admin registration/login/reset
```
