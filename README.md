# IMTS Task Management System - Backend

A comprehensive task management system backend built with Node.js, Express, and MongoDB.

## Features

- **User Management**: Multi-role user system (Worker, Giver, HOD, Observer)
- **Task Management**: Complete task lifecycle with stages, priorities, and assignments
- **Department Integration**: Cross-department task workflow
- **Real-time Notifications**: Socket.IO for live updates
- **Email Notifications**: NodeMailer integration
- **File Attachments**: Multer for file uploads
- **Authentication**: JWT-based authentication and authorization
- **Task History**: Complete audit trail for all task changes

## Project Structure

```
IMTS-Task-Backend/
├── controllers/         # Route controllers
├── models/             # Mongoose schemas
├── routes/             # Express routes
├── middleware/         # Custom middleware
├── services/           # Business logic services
├── utils/              # Utility functions
├── config/             # Configuration files
├── uploads/            # File upload directory
├── app.js              # Main application file
└── package.json        # Dependencies and scripts
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure your environment variables
4. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

- `PORT`: Server port (default: 5000)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `EMAIL_HOST`: SMTP server host
- `EMAIL_USER`: Email username
- `EMAIL_PASS`: Email password

## API Documentation

### Authentication Routes
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Task Routes
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `GET /api/tasks/:id` - Get task by ID
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

## User Roles

- **Worker**: Can view and complete assigned tasks
- **Giver**: Can create tasks and assign to workers
- **HOD**: Can manage department tasks and approve transfers
- **Observer**: Can view tasks but cannot modify

## Task Status Flow

1. **Created** - Initial task creation
2. **Assigned** - Task assigned to worker
3. **In Progress** - Worker started working
4. **Completed** - Worker marked as complete
5. **Approved** - Giver approved completion
6. **Rejected** - Giver rejected, needs rework

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

ISC License
