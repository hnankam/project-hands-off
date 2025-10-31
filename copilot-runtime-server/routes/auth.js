/**
 * Authentication Routes
 * 
 * This file sets up all Better Auth routes for authentication and organization management.
 */

import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth/index.js';

const router = Router();

/**
 * Mount Better Auth handler using the official Node.js adapter
 * 
 * This handles all Better Auth endpoints:
 * - POST /api/auth/sign-up/email
 * - POST /api/auth/sign-in/email
 * - POST /api/auth/sign-out
 * - GET  /api/auth/session
 * - POST /api/auth/organization/create
 * - GET  /api/auth/organization/list
 * - POST /api/auth/organization/invite-member
 * - And many more...
 */

// Use Better Auth's official Node.js adapter which handles all the request/response conversion
const authHandler = toNodeHandler(auth);

router.all('/*', authHandler);

export default router;

