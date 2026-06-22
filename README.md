# Vite + React Project

A modern web application built with Vite and React.

## Project Structure

```
.
├── public/              # Static assets
├── src/
│   ├── App.jsx         # Main React component
│   ├── App.css         # App component styles
│   ├── main.jsx        # React app entry point
│   └── index.css       # Global styles
├── index.html          # HTML entry point
├── package.json        # Project dependencies
├── vite.config.js      # Vite configuration
├── setup.sql           # Database schema
└── .gitignore          # Git ignore rules
```

## Getting Started

### Prerequisites
- Node.js 16+ and npm/yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This will start the development server at `http://localhost:3000` with hot module replacement (HMR).

### Build

```bash
npm run build
```

This creates an optimized production build in the `dist` folder.

### Preview

```bash
npm run preview
```

Preview the production build locally.

## Database Setup

Run the SQL schema from `setup.sql` in your database:

```sql
-- Execute the contents of setup.sql
```

This creates tables for:
- `users` - User accounts
- `projects` - User projects
- `tasks` - Project tasks

## Tech Stack

- **Frontend**: React 18 + Vite 4
- **Build Tool**: Vite
- **Database**: PostgreSQL (setup.sql provided)
- **Package Manager**: npm

## Learn More

- [Vite Documentation](https://vitejs.dev)
- [React Documentation](https://react.dev)
