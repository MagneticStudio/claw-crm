# Magnetic CRM

A document-based CRM designed for small business owners and solopreneurs who need a simple, intuitive way to manage their sales pipeline. Unlike complex enterprise CRMs, Magnetic CRM uses a document-first approach inspired by note-taking apps like Apple Notes or Notion.

## Key Features

- **Document-based Interface**: Create notes with a clean, distraction-free editor
- **Smart Entity Detection**: Mention people or companies with `@` symbol (e.g., `@JohnDoe` or `@AcmeCorp`)
- **Task Management**: Create tasks using `>` prefix (e.g., `> Follow up with client`)
- **Real-time Autosave**: Changes are automatically saved as you type
- **User Authentication**: Secure login/registration system

## Tech Stack

### Frontend
- **React**: UI component library
- **TypeScript**: Type-safe JavaScript
- **TanStack Query (React Query)**: Data fetching and state management
- **TipTap**: Rich-text editor framework
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/UI**: Component library built on Radix UI
- **Wouter**: Lightweight routing library

### Backend
- **Node.js**: JavaScript runtime
- **Express**: Web server framework
- **PostgreSQL**: Relational database
- **Drizzle ORM**: Database query building and schema management
- **Zod**: Schema validation
- **Passport.js**: Authentication middleware

## Project Structure

```
├── client/                # Frontend React application
│   ├── src/
│   │   ├── components/    # UI components
│   │   │   ├── editor-extensions/  # TipTap editor customizations
│   │   │   ├── ui/        # Shadcn UI components
│   │   │   └── ...
│   │   ├── hooks/         # React hooks
│   │   ├── lib/           # Utility functions
│   │   ├── pages/         # App pages
│   │   └── ...
├── server/                # Backend Express application
│   ├── auth.ts            # Authentication setup
│   ├── routes.ts          # API routes
│   ├── storage.ts         # Data storage abstraction
│   └── ...
├── shared/                # Shared code between frontend and backend
│   └── schema.ts          # Database schema and type definitions
```

## Key Files

### Frontend
- `client/src/App.tsx`: Main application component with routing
- `client/src/pages/auth-page.tsx`: Authentication page with login/register forms
- `client/src/pages/home-page.tsx`: Main app interface with notes management
- `client/src/components/note-editor.tsx`: Note editor component
- `client/src/components/editor-extensions/mention-extension.tsx`: @mention functionality 
- `client/src/components/editor-extensions/task-extension.tsx`: Task functionality
- `client/src/hooks/use-auth.tsx`: Authentication state management

### Backend
- `server/auth.ts`: Authentication setup with Passport.js
- `server/routes.ts`: API route definitions
- `server/storage.ts`: Data access layer with database operations
- `server/index.ts`: Express server setup and initialization

### Shared
- `shared/schema.ts`: Database schema definitions and types

## Data Model

### Users
- Standard user accounts with email, password, and profile information

### Notes
- Text documents that can contain rich text, mentions, and tasks
- Auto-saved in real-time as users type

### Entities
- People or companies mentioned within notes using `@` syntax
- Automatically extracted and stored for future reference

### Tasks
- Action items created using the `>` prefix in notes
- Can include due dates for better organization

## Getting Started

### Prerequisites
- Node.js (v16+)
- PostgreSQL database

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables (see `.env.example`)
4. Start the development server: `npm run dev`

## Future Development

- AI integration to automatically identify entities, suggest tasks, and categorize leads
- Pipeline visualization to group leads by sales stage
- Calendar integration for scheduling follow-ups
- Email integration for tracking communication