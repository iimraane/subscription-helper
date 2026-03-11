# Subscription Helper

Welcome to the **Subscription Helper** repository! This project allows you to manage subscriptions efficiently with an integrated Gmail parsing system (via OpenAI) and push notifications.

This architecture includes a backend `server/` and a frontend `client/`, both written in TypeScript.

## 🚀 Getting Started

To get your own instance running locally, follow these steps.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/subscription-helper.git
cd subscription-helper
```

### 2. Install Dependencies

You need to install dependencies for both the frontend and the backend.

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 3. Environment Variables & Keys

All sensitive keys, API credentials, and secrets must be kept out of version control. They are ignored by Git through `.gitignore`. 

Create an environment variable file in the `server/` directory:
```bash
cp .env.example server/.env
```
*(If `.env.example` is at the root, copy it to the `server/` directory or whichever location your backend loads variables from. Alternatively, copy `server/.env.example` to `server/.env` if provided).*

Edit `server/.env` with your actual keys. **Do not commit `.env`!**

#### Generating Keys

*   **VAPID Keys** (For Web Push Notifications)
    Generate a pair of VAPID keys by running:
    ```bash
    npx web-push generate-vapid-keys
    ```
    Add them to `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in your `.env`.

*   **JWT Secret & Encryption Key**
    Use secure random strings (at least 32 characters) for `JWT_SECRET` and `ENCRYPTION_KEY`.

*   **Gmail API (OAuth)**
    Go to the [Google Cloud Console](https://console.cloud.google.com/), create an OAuth 2.0 application, and get your `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.

*   **OpenAI API**
    Create an API key in your [OpenAI platform dashboard](https://platform.openai.com/api-keys) and assign it to `OPENAI_API_KEY`.

### 4. Database Setup

The project uses Prisma as an ORM. Initialize the database schema:

```bash
cd server
npx prisma db push
# or npx prisma migrate dev
```

### 5. Start the Development Servers

Run the frontend and backend in development mode.

**Terminal 1: Server**
```bash
cd server
npm run dev
```

**Terminal 2: Client**
```bash
cd client
npm run dev
```

The client will be running at `http://localhost:5173` and the server around port `3001` (depending on your configuration).

## 🐳 Docker Deployment

The project provides Docker configuration files (`Dockerfile`, `docker-compose.yml`, `Caddyfile`) for easy deployment. Use:
```bash
docker-compose up -d --build
```
Ensure you have configured all environment variables in a `.env` file where Docker can access them before building.

## 🔒 Security

Remember that all keys and sensitive configurations should strictly stay in your `.env` file, which is ignored correctly via the `.gitignore` setup found in this repository. 
# subscription-helper
