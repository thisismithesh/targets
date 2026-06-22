# Weekly Targets - Vite + React

A team task management tool for tracking weekly objectives. Managers create weekly targets for team members, who can track progress, mark tasks complete, and manage dependencies.

## Features

- **Dashboard**: View all team members' weekly targets at a glance
- **Task Management**: Create, edit, and complete tasks with subtasks
- **Status Tracking**: 
  - Mark tasks as complete
  - Hold tasks (with optional comments)
  - Auto-carry forward incomplete tasks
- **Time Estimation**: Track estimated hours per task and weekly totals
- **Team Overview**: Multi-team member management
- **Weekly Navigation**: Move between different weeks for historical tracking

## Tech Stack

- **Frontend**: React 18 + Vite 4 + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **Routing**: React Router
- **Date Utils**: date-fns

## Project Structure

```
weekly-targets-vite/
├── src/
│   ├── pages/                # Page components
│   │   ├── Dashboard.jsx    # Main dashboard
│   │   ├── AdminPanel.jsx   # Admin management
│   │   └── TeamMemberDetail.jsx # Team member details
│   ├── components/          # Reusable components
│   │   ├── Task.jsx         # Task item component
│   │   ├── TaskSection.jsx  # Task grouping
│   │   └── TeamMemberCard.jsx # Team member card
│   ├── lib/                 # Utilities
│   │   ├── supabase.js      # Supabase client
│   │   └── utils.js         # Date & task utilities
│   ├── App.jsx              # Root layout
│   ├── main.jsx             # Entry point
│   ├── App.css              # App styles
│   └── index.css            # Global styles
├── public/                  # Static assets
├── index.html              # HTML entry
├── vite.config.js          # Vite config
├── tailwind.config.js      # Tailwind config
├── postcss.config.js       # PostCSS config
├── package.json            # Dependencies
├── .env.example            # Environment template
├── supabase-schema.sql     # Database schema
└── README.md               # This file
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- Supabase account
- GitHub account (optional, for version control)

### Installation

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd weekly-targets-vite
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new Supabase project
   - Go to SQL Editor and run the contents of `supabase-schema.sql`
   - Copy your project URL and anon key

4. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

### Development

```bash
npm run dev
```

This starts the development server at `http://localhost:3000` with hot module replacement.

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

## Usage

### For Managers

1. Go to `/admin`
2. Add team members
3. Create weekly targets by adding tasks with:
   - Task name
   - Category/heading
   - Deadline
   - Estimated hours
4. Create subtasks for complex items

### For Team Members

1. View their week on the dashboard (home page)
2. Check off tasks as complete
3. Use "Hold" to mark tasks blocked (with reason)
4. Tasks automatically carry forward if not completed

## Database Schema

### Tables

- **team_members**: Stores team member information
  - `id`: UUID primary key
  - `name`: Team member name
  - `email`: Team member email
  - `created_at`, `updated_at`: Timestamps

- **weeks**: Tracks different weeks
  - `id`: UUID primary key
  - `week_start_date`: Monday of the week
  - `week_end_date`: Sunday of the week
  - `created_at`: Creation timestamp

- **tasks**: Stores task information
  - `id`: UUID primary key
  - `team_member_id`: FK to team_members
  - `week_id`: FK to weeks
  - `task_name`: Task title
  - `heading`: Category/section
  - `deadline`: Task deadline
  - `completed_date`: When task was completed
  - `estimated_hours`: Estimated duration
  - `status`: pending, completed, on-hold, carry-forward
  - `on_hold_reason`: Reason if on hold
  - `carry_forward_weeks`: Number of weeks carried forward
  - `parent_task_id`: FK to parent task (for subtasks)
  - `position`: Display order
  - `created_at`, `updated_at`: Timestamps

## Deployment

### To Vercel

1. Push to GitHub repository
2. Connect GitHub repo to Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

### To Other Platforms

The `dist/` folder (created by `npm run build`) is a static site and can be deployed to:
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Any static hosting service

## Customization

### Colors

Edit `tailwind.config.js` to change status colors:
- `status-hold`: Red (#DC2626)
- `status-carryforward`: Purple (#A855F7)
- `status-completed`: Green (#10B981)
- `status-pending`: Gray (#6B7280)

### Styling

Global styles are in `src/index.css` and component-specific styles in CSS files.

### Adding Pages/Routes

1. Create a new page component in `src/pages/`
2. Add the route in `src/main.jsx`
3. Link to it from the navigation in `src/App.jsx`

## Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Note: All Vite environment variables must be prefixed with `VITE_` to be accessible in the browser.

## Contributing

1. Create a feature branch
2. Make changes
3. Test locally with `npm run dev`
4. Build to check for errors: `npm run build`
5. Push and create a pull request

## License

MIT

## Support

For issues or questions:
1. Check the code comments
2. Review Supabase documentation
3. Check Vite documentation
4. Create an issue in the repository

## Performance Tips

- The app uses React Router for client-side navigation
- Supabase queries are optimized with proper indexing
- Tailwind CSS is tree-shaken for smaller bundle sizes
- Consider adding pagination for large task lists
- Use React.memo for expensive components if needed

## Security Notes

- Row-level security (RLS) is enabled in Supabase
- Update RLS policies based on your authentication needs
- Never commit `.env.local` to version control
- Use signed URLs for sensitive data access
