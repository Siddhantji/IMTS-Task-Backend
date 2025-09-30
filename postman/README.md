# IMTS Task Management - Postman Collections

This folder contains Postman collection files for testing the IMTS Task Management System APIs.

## Collections

### 1. IMTS-User-Auth-APIs.postman_collection.json
Complete collection for User Authentication and User Management APIs including:

**Authentication Endpoints:**
- Register User
- Login User (with auto token saving)
- Get User Profile
- Update User Profile
- Change Password
- Refresh Token (with auto token refresh)
- Logout
- Logout All Devices

**User Management Endpoints:**
- Get All Users (with filtering and pagination)
- Get User by ID
- Get Workers (for task assignment)
- Get Task Givers
- Get User Statistics
- Update User Role (HOD only)
- Toggle User Status (HOD only)
- Transfer User to Department (HOD only)

### 2. IMTS-Task-APIs.postman_collection.json
Complete collection for Task Management APIs including:

**Task CRUD Operations:**
- Create Task (with auto task ID saving)
- Get All Tasks (with filtering, searching, and pagination)
- Get Task by ID
- Update Task
- Delete Task

**Task Status Management:**
- Update Task Status (pending, in_progress, completed, cancelled, on_hold)
- Accept Task
- Complete Task

**Task Stage Management:**
- Update Task Stage (not_started, planning, in_progress, review, testing, completed)

**Task Remarks & Comments:**
- Add Remark to Task
- Get Task Remarks

**Task Assignment & Transfer:**
- Reassign Task

**Task Analytics & Reports:**
- Get Task Statistics
- Get My Tasks
- Get Tasks I Created
- Get Overdue Tasks

**Task History:**
- Get Task History

## Environment Variables

Both collections use the following environment variables:

### Base Configuration
- `baseUrl`: Server URL (default: http://localhost:5000)

### Authentication
- `authToken`: JWT access token (auto-saved from login)
- `refreshToken`: JWT refresh token (auto-saved from login)

### User IDs
- `userId`: Current user ID (auto-saved from login)
- `workerId`: Worker user ID for task assignment
- `giverId`: Task giver user ID for filtering
- `newWorkerId`: New worker ID for task reassignment

### Other IDs
- `taskId`: Task ID (auto-saved from task creation)
- `departmentId`: Department ID for filtering

## Setup Instructions

1. **Import Collections:**
   - Open Postman
   - Click "Import" button
   - Select both JSON files from this folder
   - Collections will be imported with all endpoints

2. **Set Environment Variables:**
   - Create a new environment in Postman
   - Add the variables listed above
   - Set `baseUrl` to your server URL (http://localhost:5000 for local development)

3. **Authentication Flow:**
   - First, register a user using "Register User" endpoint
   - Then login using "Login User" endpoint
   - The auth token will be automatically saved to environment variables
   - All subsequent requests will use this token automatically

4. **Testing Workflow:**
   - Start with authentication endpoints
   - Create some users with different roles (worker, giver, hod)
   - Create tasks using task management endpoints
   - Test status updates, stage management, and remarks
   - Verify role-based permissions work correctly

## Features

### Auto Token Management
- Login endpoints automatically save tokens to environment variables
- Refresh token endpoint automatically updates tokens
- All authenticated endpoints use saved tokens automatically

### Role-Based Testing
- Collection includes endpoints for different user roles
- HOD-only endpoints are clearly marked
- Worker and Giver specific endpoints are documented

### Comprehensive Examples
- All endpoints include example request bodies
- Response examples are provided for key endpoints
- Query parameters are documented with descriptions

### Error Testing
- Collections include examples for testing error scenarios
- Validation errors can be tested by modifying request bodies
- Authorization errors can be tested by removing/modifying tokens

## API Documentation

The collections serve as living documentation for the API and can be used to:
- Understand available endpoints and their parameters
- Test API functionality during development
- Generate API documentation
- Share API specifications with team members
- Validate API responses and error handling

## Notes

- Make sure your backend server is running before testing
- Update environment variables according to your setup
- Some endpoints require specific user roles - create test users accordingly
- File upload endpoints (if implemented) may require additional configuration
