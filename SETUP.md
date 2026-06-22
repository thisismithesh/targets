# Weekly Targets - Setup Guide

Complete step-by-step guide to set up and deploy Weekly Targets.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Supabase Configuration](#supabase-configuration)
4. [Environment Setup](#environment-setup)
5. [First Run](#first-run)
6. [Deployment](#deployment)

## Prerequisites

Before you start, make sure you have:

- **Node.js 16+** - Download from [nodejs.org](https://nodejs.org)
- **npm or yarn** - Comes with Node.js
- **A Supabase account** - Sign up at [supabase.com](https://supabase.com)
- **A GitHub account** (optional, but recommended) - For version control
- **A code editor** - VS Code recommended

### Verify Installation

```bash
node --version    # Should be v16 or higher
npm --version     # Should be v7 or higher
```

## Local Development Setup

### Step 1: Clone or Download the Project

```bash
# If cloning from GitHub
git clone <your-repository-url>
cd weekly-targets-vite

# Or if downloaded as ZIP
unzip weekly-targets-vite.zip
cd weekly-targets-vite
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages:
- React 18
- Vite 4
- React Router
- Supabase client
- Tailwind CSS
- And more...

### Step 3: Verify Installation

```bash
npm list --depth=0
```

You should see all dependencies listed without errors.

## Supabase Configuration

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in project details:
   - **Name**: `weekly-targets` (or your preferred name)
   - **Database Password**: Create a strong password
   - **Region**: Choose closest to you
4. Click "Create new project"
5. Wait for the project to be created (2-3 minutes)

### Step 2: Get Your Credentials

1. Go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (under "Connecting to your database")
   - **anon public** (under "Project API keys")
3. Keep these safe - you'll need them in the next step

### Step 3: Set Up Database Schema

1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click **Run**
5. You should see a success message

This creates:
- `team_members` table
- `weeks` table
- `tasks` table
- Indexes for performance
- Row-level security policies

### Step 4: Verify Database Setup

1. Go to **Table Editor** in Supabase
2. You should see three tables:
   - `team_members` (with 3 sample records)
   - `weeks` (with 1 sample record for current week)
   - `tasks` (empty, ready for data)

## Environment Setup

### Step 1: Create .env.local File

In the project root, create a new file called `.env.local`:

```bash
# On macOS/Linux
touch .env.local

# On Windows
echo. > .env.local
```

### Step 2: Add Your Credentials

Open `.env.local` and add your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important**:
- Replace `your-project-id` with your actual project ID
- Replace `your-anon-key-here` with your actual anon key
- Do NOT commit this file to version control
- Do NOT share these credentials publicly

### Step 3: Verify .gitignore

Make sure `.env.local` is in `.gitignore`:

```bash
cat .gitignore | grep ".env"
```

You should see `.env.local` listed.

## First Run

### Step 1: Start Development Server

```bash
npm run dev
```

You should see:
```
  VITE v4.4.0  ready in xxx ms

  ➜  Local:   http://localhost:3000/
```

The app will open automatically in your browser.

### Step 2: Test the App

1. **Dashboard** - You should see the 3 sample team members
2. **Admin** - Click "Admin" in the navigation
3. **Add Team Member** - Try adding a new team member
4. **Add Task** - Create a task for one of the team members
5. **View Tasks** - Click "View Details" on a team member card to see their tasks

### Step 3: Test Task Management

1. Click on a task's checkbox to mark it complete
2. Click "Hold" button to mark a task as on hold
3. Click "✏️" to edit task details
4. Check that changes save immediately

## Build for Production

### Step 1: Create Production Build

```bash
npm run build
```

This creates an optimized build in the `dist/` folder.

### Step 2: Test Production Build Locally

```bash
npm run preview
```

Visit `http://localhost:4173` to preview the production build.

### Step 3: Check Build Size

```bash
# List file sizes
ls -lh dist/
```

Typical production build is 100-200 KB.

## Deployment

### Option 1: Deploy to Vercel (Recommended)

#### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

#### Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Click "Import"

#### Step 3: Add Environment Variables

1. In Vercel project settings, go to "Environment Variables"
2. Add both variables from `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Click "Save"
4. Redeploy the project

#### Step 4: Verify Deployment

Your app will be live at a URL like: `https://weekly-targets-xyz.vercel.app`

### Option 2: Deploy to Netlify

#### Step 1: Build the Project

```bash
npm run build
```

#### Step 2: Connect to Netlify

1. Drag and drop the `dist/` folder to [netlify.com](https://netlify.com)
2. Or connect your GitHub repo for automatic deployments
3. Go to Site Settings → Build & Deploy → Environment
4. Add your environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Option 3: Deploy to GitHub Pages

```bash
# Add to vite.config.js:
# export default defineConfig({
#   base: '/weekly-targets/',
#   ...
# })

npm run build

# Deploy dist folder to gh-pages branch
git subtree push --prefix dist origin gh-pages
```

## Troubleshooting

### "Missing Supabase environment variables"

**Solution**: Check that `.env.local` exists in the project root with correct values.

### "Cannot read property 'select' of undefined"

**Solution**: Ensure Supabase URL and key are correct in `.env.local`

### Database tables not showing up

**Solution**: 
1. Refresh the Supabase console
2. Check that the SQL query ran without errors
3. Verify you're in the correct project

### Tasks not loading

**Solution**:
1. Check browser console for errors (F12)
2. Verify team members exist in Supabase
3. Verify a week exists for the current date

### Deployment fails

**Solution**:
1. Ensure all environment variables are set on the platform
2. Check that `npm run build` works locally
3. Check build logs on your hosting platform

## Next Steps

1. **Customize colors** - Edit `tailwind.config.js`
2. **Add authentication** - Implement Supabase Auth
3. **Add more features** - Weekly reports, notifications, etc.
4. **Enable RLS policies** - Secure your database
5. **Set up monitoring** - Monitor app performance

## Getting Help

- Check the [README.md](./README.md) for feature documentation
- See Supabase docs: [supabase.com/docs](https://supabase.com/docs)
- See Vite docs: [vitejs.dev](https://vitejs.dev)
- See React Router docs: [reactrouter.com](https://reactrouter.com)

## Security Checklist

- [ ] Secrets stored in `.env.local` (not committed)
- [ ] Environment variables set on production platform
- [ ] Database RLS policies reviewed
- [ ] API routes protected (if any)
- [ ] No sensitive data logged
- [ ] HTTPS enabled on production
- [ ] Regular backups enabled in Supabase

Good luck! 🚀
