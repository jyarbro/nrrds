# nrrds Development Setup

Simple development setup using Vite for frontend and production API for backend.

## Quick Start

```bash
cd nrrds
npm run dev
```

This starts the Vite dev server and your app will use the production API at `https://api.nrrds.com`.

## Project Structure

- **Frontend**: `/nrrds` - Vite-based frontend
- **Backend**: `/nrrds-backend` - Vercel Functions (deployed to production)

## Development Workflow

### Frontend Development
```bash
cd nrrds
npm run dev
```
- Runs on `http://localhost:5173`
- Hot reloading for fast development
- Calls production API directly

### Backend Development
```bash
cd nrrds-backend
# Make your changes
npm run deploy
```
- Deploy changes to production
- Frontend will automatically use updated API

## Available Scripts

### Frontend (`/nrrds`)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Backend (`/nrrds-backend`)
- `npm run deploy` - Deploy to production

## Configuration

The app is configured to use the production API at `https://api.nrrds.com` for both development and production.

## Benefits of This Setup

- ✅ Simple and reliable
- ✅ Fast frontend development with hot reloading
- ✅ No local backend complexity
- ✅ Test against real production environment
- ✅ Consistent behavior across dev and prod
