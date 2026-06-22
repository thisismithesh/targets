# Weekly Targets - Quick Start

Get up and running in 5 minutes!

## 1. Install Dependencies (1 min)

```bash
npm install
```

## 2. Set Up Supabase (2 min)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **SQL Editor** and run this file: `supabase-schema.sql`
4. Copy your **Project URL** and **Anon Key** from Settings → API

## 3. Add Environment Variables (1 min)

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## 4. Start Development (1 min)

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## 5. Start Using!

- **Dashboard**: View all team members' tasks
- **Admin**: Add team members and create tasks
- **Team Member**: View individual task details

## Common Commands

```bash
npm run dev      # Start development server
npm run build    # Create production build
npm run preview  # Preview production build
```

## Next Steps

- Read [SETUP.md](./SETUP.md) for detailed setup instructions
- Read [README.md](./README.md) for feature documentation
- Deploy to [Vercel](https://vercel.com), [Netlify](https://netlify.com), or your own server

## Need Help?

1. Check if `.env.local` has correct credentials
2. Verify that `supabase-schema.sql` was executed
3. Check browser console for errors (F12)
4. See [SETUP.md](./SETUP.md) Troubleshooting section

Good luck! 🚀
