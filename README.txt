================================================================================
                AJS — GATED COMMUNITY MANAGEMENT SYSTEM (GCMS)
                      Complete Project Documentation
================================================================================

PRODUCT OVERVIEW
----------------
AJS GCMS is a full-stack, self-hosted web application designed to
manage a gated residential community. It provides a premium dark-themed portal
for residents and administrators, accessible from any modern web browser with
no app installation required.

The system is production-ready and includes:
  - Secure JWT-based login (email + password)
  - Role-based access control (Super Admin / Community Admin / Resident)
  - Real-time community messaging with AES-GCM end-to-end encryption
  - Community polls and voting
  - Property listings (for rent / for sale / vacant)
  - Live notification system (bell badge + slide-in panel)
  - Profile management (name + password change)
  - Multi-language support (English, Telugu, Hindi)
  - Light / Dark theme toggle
  - Mobile-responsive layout
  - PWA-ready (Progressive Web App — can be installed on phone home screen)


================================================================================
TECH STACK
================================================================================

  Backend  : Python 3.x + FastAPI + SQLAlchemy + SQLite
  Frontend : Vanilla HTML5 + CSS3 + JavaScript (no frameworks, no build step)
  Auth     : OAuth2 Password Flow + JWT (HS256)
  Crypto   : Web Crypto API (AES-GCM 256-bit, PBKDF2 key derivation)
  Icons    : Phosphor Icons (CDN)
  Fonts    : Inter (Google Fonts CDN)
  Database : SQLite file (sql_app.db) — can be migrated to PostgreSQL/MySQL


================================================================================
FOLDER STRUCTURE
================================================================================

  CMS/
  ├── backend/
  │   ├── main.py           — FastAPI app, all API routes
  │   ├── models.py         — SQLAlchemy database models
  │   ├── schemas.py        — Pydantic request/response schemas
  │   ├── auth.py           — JWT creation & verification
  │   ├── database.py       — DB engine & session factory
  │   ├── notifications.py  — Notification create/broadcast helpers
  │   ├── permissions.py    — Resident permission helpers
  │   └── sql_app.db        — SQLite database file (all data lives here)
  │
  ├── frontend/
  │   ├── index.html        — Single-page app shell
  │   ├── manifest.json     — PWA manifest
  │   ├── service-worker.js — PWA offline caching
  │   ├── css/
  │   │   └── styles.css    — All styles (dark/light themes)
  │   └── js/
  │       ├── app.js        — Main SPA logic (all pages rendered here)
  │       ├── api.js        — API client (all fetch calls)
  │       ├── crypto_helper.js — AES-GCM encryption/decryption
  │       └── i18n.js       — Multi-language translations
  │
  ├── venv/                 — Python virtual environment (do NOT delete)
  ├── setup_db.py           — One-time database seeding script
  └── README.txt            — This file


================================================================================
HOW TO START THE SERVER
================================================================================

  1. Open a Command Prompt or PowerShell window.

  2. Navigate to the project folder:
       cd "C:\Users\Admin\Documents\CMS"

  3. Start the server:
       .\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

  4. Open your browser and go to:
       http://127.0.0.1:8000

  The server will keep running in that window. To stop it, press CTRL+C.

  NOTE: The --reload flag automatically restarts the server whenever you edit
  a Python file. For production deployment, remove --reload and use:
       .\venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000


================================================================================
DEFAULT LOGIN CREDENTIALS
================================================================================

  SUPER ADMIN (platform owner — can create communities and manage everything):
    Email    : superadmin@example.com
    Password : superpassword

  COMMUNITY ADMIN (manages one community — users, polls, announcements):
    Email    : admin@example.com
    Password : password123

  RESIDENT (regular community member):
    Email    : resident@example.com
    Password : password123

  IMPORTANT: Change all passwords immediately after handing over to a client.
  Use the Account Settings page inside the app to update passwords.


================================================================================
USER ROLES EXPLAINED
================================================================================

  SUPER ADMIN
    - Logs in and sees a platform dashboard
    - Can create multiple communities (e.g. "AJS", "Sunrise Villas")
    - Does NOT participate in community messaging or polls
    - Manages the platform at the highest level

  COMMUNITY ADMIN
    - Belongs to one community
    - Can post to the Announcements channel
    - Can create polls
    - Can add property listings
    - Can add new resident users via the Messaging page
    - Sees all pages: Dashboard, Messaging, Polls, Properties, Voting, etc.

  RESIDENT
    - Belongs to one community
    - Can read announcements and chat in General channel
    - Can vote in active polls
    - Can browse property listings
    - Can update their own name and password


================================================================================
KEY FEATURES — TECHNICAL DETAILS
================================================================================

  END-TO-END ENCRYPTED MESSAGING
    All messages sent through the app are encrypted in the browser before being
    sent to the server. The server stores ciphertext only. The encryption key
    is derived from the community ID using PBKDF2 + AES-GCM 256-bit.
    A lock icon (🔒) is shown next to encrypted messages in the chat.

  LIVE NOTIFICATIONS
    - When an admin posts an announcement, all other community members
      automatically receive a notification.
    - When a new poll is created, all community members are notified.
    - The bell icon in the top-right corner shows an unread count badge.
    - Clicking the bell opens a slide-in panel showing all notifications.
    - Notifications auto-mark as read when the panel is opened.
    - The badge polls the server every 15 seconds.

  POLLS
    - Admins can create polls with any number of options.
    - Each resident can vote once per poll.
    - Results are displayed as animated progress bars after voting.
    - Active polls show vote buttons; closed polls show percentage results.

  PROPERTY LISTINGS
    - Admins can add listings with title, description, price, and status.
    - Status options: For Rent / For Sale / Vacant.
    - Residents can filter listings by status.
    - Each card shows a property photo, price, and a Contact button.

  PROFILE MANAGEMENT
    - All users can update their display name.
    - Password changes require the current password for security.
    - The header always shows the live name fetched from the backend.

  MULTI-LANGUAGE
    - Supports English, Telugu, and Hindi for navigation labels.
    - Language preference is saved in browser local storage.


================================================================================
DATABASE MANAGEMENT
================================================================================

  DATABASE FILE: CMS/backend/sql_app.db (SQLite)
  - All data (users, messages, polls, properties, notifications) is stored here.
  - To back up all data, simply copy this file.
  - To reset the database to factory defaults, delete sql_app.db and restart
    the server (it will create a fresh empty database automatically).
  - To re-seed default users/communities, run:
      .\venv\Scripts\python.exe setup_db.py

  SWITCHING TO POSTGRESQL (for production/scaling):
  - Install psycopg2: .\venv\Scripts\pip.exe install psycopg2-binary
  - Edit backend/database.py and replace the SQLALCHEMY_DATABASE_URL with:
      postgresql://username:password@localhost/dbname


================================================================================
API ENDPOINTS REFERENCE
================================================================================

  All API routes are prefixed with /api/
  Full interactive docs available at: http://127.0.0.1:8000/docs

  AUTH
    POST   /api/token                    — Login (returns JWT)
    POST   /api/superadmin/register      — Register super admin
    GET    /api/me                       — Get current logged-in user info

  PROFILE
    GET    /api/profile                  — Get full profile
    PUT    /api/profile                  — Update name / password

  COMMUNITIES
    POST   /api/communities/             — Create community (superadmin only)
    GET    /api/communities/             — List owned communities

  USERS
    POST   /api/users/?community_id=N    — Add user to community (admin only)
    GET    /api/users/                   — List users in community (admin only)

  MESSAGES
    GET    /api/messages/?channel=X      — Get messages (general/announcements)
    POST   /api/messages/                — Send a message

  POLLS
    GET    /api/polls/                   — List polls in community
    POST   /api/polls/                   — Create poll (admin only)
    POST   /api/polls/{id}/vote          — Cast a vote

  PROPERTIES
    GET    /api/properties/              — List property listings
    POST   /api/properties/              — Add listing (admin only)

  NOTIFICATIONS
    GET    /api/notifications/           — Get all notifications (latest 30)
    GET    /api/notifications/unread-count — Get unread count
    PUT    /api/notifications/{id}/read  — Mark one as read
    PUT    /api/notifications/read-all   — Mark all as read


================================================================================
CUSTOMISATION FOR A NEW CLIENT
================================================================================

  BRANDING (Community Name)
    Change "AJS" to the client's community name in:
    - frontend/index.html  (lines with "AJS" in <span> tags)

  LOGO / FAVICON
    - Replace the Phosphor "buildings" icon with a custom <img> tag.
    - Add a favicon.ico file in the frontend/ folder.
    - Update the <link rel="icon"> in index.html.

  COLOURS
    All colours are CSS variables in frontend/css/styles.css (lines 1–21).
    Change --primary-color to the client's brand colour.

  ADDING MORE COMMUNITIES
    - Log in as Super Admin.
    - Go to Dashboard → Create New Community.
    - Then add Admin and Resident users via the Messaging page.

  ADDING A CUSTOM DOMAIN
    - Point your domain's DNS A-record to the server's IP address.
    - Use a reverse proxy (Nginx/Caddy) to forward port 80/443 to port 8000.
    - Enable HTTPS with a free Let's Encrypt certificate via Certbot.


================================================================================
DEPLOYMENT ON A LIVE SERVER (VPS/Cloud)
================================================================================

  RECOMMENDED HOSTING: DigitalOcean, Hetzner, Linode, AWS Lightsail
  MINIMUM SPECS: 1 vCPU, 1 GB RAM, 10 GB SSD, Ubuntu 22.04

  STEPS:
  1. Upload the project folder to the server (use SCP or FileZilla).
  2. Install Python 3.11+ on the server.
  3. Create a virtual environment and install dependencies:
       python3 -m venv venv
       venv/bin/pip install fastapi uvicorn sqlalchemy python-jose[cryptography] passlib[bcrypt] python-multipart
  4. Run the server with:
       venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
  5. Use a process manager (systemd or PM2) to keep it running permanently.
  6. Set up Nginx as a reverse proxy for port 80/443.

  For Windows Server hosting, use the same commands with venv\Scripts\ paths.


================================================================================
WHAT IS INCLUDED IN THE SALE
================================================================================

  ✔ Complete source code (backend + frontend)
  ✔ Working SQLite database with sample data
  ✔ Python virtual environment (pre-installed dependencies)
  ✔ This documentation file
  ✔ Multi-community support (one installation, many communities)
  ✔ End-to-end encrypted messaging
  ✔ Live notification system
  ✔ PWA support (installable on phones)
  ✔ Light + Dark theme
  ✔ Multi-language UI (English, Telugu, Hindi)
  ✔ Full REST API with interactive docs (/docs)
  ✔ No ongoing licensing fees — self-hosted, you own it

  OPTIONAL ADD-ONS (available as custom development):
  - Email notifications (SMTP integration)
  - Maintenance request / complaint ticketing system
  - Visitor gate management
  - Monthly maintenance fee tracking & payment reminders
  - Photo gallery with upload support
  - Mobile app (Android/iOS) wrapper


================================================================================
SUPPORT & HANDOVER NOTES
================================================================================

  - Always keep a backup of backend/sql_app.db before making changes.
  - The SECRET_KEY for JWT tokens is defined in backend/auth.py.
    Change this value before going live to production.
  - To add Python packages: .\venv\Scripts\pip.exe install <package-name>
  - Browser cache: if changes don't appear, press CTRL+SHIFT+R (hard refresh).
  - The service worker (PWA) caches files aggressively — if needed, clear
    site data in browser DevTools > Application > Storage.


================================================================================
CONTACT / DEVELOPER
================================================================================

  This system was custom-built as a full-stack web application.
  For deployment help, customisation, or new features, contact the developer.

================================================================================
                         END OF DOCUMENTATION
================================================================================
