'use server';

import bcrypt from 'bcryptjs';
import { db } from '../db/kysely/client';
import { createHash, randomUUID } from 'crypto';
import { Errors } from './errors';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { User } from '@/types/user';
import { SystemRole } from '@/types/tenant';

/**
 * Fetches the cached authenticated user's session and details.
 * Uses caching to optimize repeated calls within the same request.
 *
 * @returns An object containing the user details if authenticated, otherwise null.
 */
export const auth = cache(async (): Promise<{ user: User } | null> => {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value ?? null;
    const user = await validateSession(token);
    return { user };
  } catch (error) {
    if (error === Errors.NO_SESSION_COOKIE || error === Errors.UNAUTHORIZED) {
      console.log('❌ [AUTH] No valid session found');
    } else {
      console.log('❌ [AUTH] Error during authentication:', error);
    }
    return null;
  }
});

/**
 * Creates session tokens for a user and stores the hashed token in the database
 * @param userId ID of user to create session for
 * @returns raw session token to be set in cookie
 */
export async function createSession(userId: string): Promise<string> {

  // Generate a secure random token
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const rawToken = Buffer.from(bytes).toString('hex');
  const hashed_token = createHash('sha256').update(rawToken).digest('hex');

  // sets expiration date for session
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // inserts session into database
  const result = await db
    .insertInto('sessions')
    .values({
      id: randomUUID(),
      created_at: new Date(),
      expires_at: expiresAt,
      session_token: hashed_token,
      user_id: userId
    })
    .returning('session_token')
    .executeTakeFirst();  

  if (!result || !result.session_token) {
    console.error('[createSession] Failed to create session in database for user ID:', userId);
    throw Errors.INTERNAL_ERROR;
  }

  return rawToken;
}


/**
 * Validates the session for a given request.
 * @param request The NextRequest object
 * @returns The user object if the session is valid
 * @throws NO_SESSION_COOKIE - if session is invalid || UNAUTHORIZED - if not found in DB
 */
export async function validateSession(token: string | null): Promise<User> {    
  if (!token) {
    console.log('[validateSession] No session cookie found');
    throw Errors.NO_SESSION_COOKIE;
  }

  // Hash the token from the cookie
  const hashedToken = createHash('sha256').update(token).digest('hex');

  // Query the database for the session and associated user
  const result = await db
    .selectFrom('sessions as s')
    .innerJoin('user as u', 's.user_id', 'u.id')
    .select(['u.id', 'u.role', 'u.email', 'u.username', 'u.email_verified', 'u.system_role'])
    .where('s.session_token', '=', hashedToken)
    .where('s.expires_at', '>', new Date())
    .executeTakeFirst();  
  if (!result) {
    console.log('[validateSession] No session found in database for token');
    throw Errors.UNAUTHORIZED;
  }

  // Debug log to see what role is being returned
  // console.log('🔍 [VALIDATE SESSION] User role from DB:', result.role, 'User email:', result.email);

  return {
    id: result.id,
    email: result.email,
    username: result.username,
    systemRole: result.system_role as SystemRole,
    role: result.role,
  };
}

/**
 * Deletes a session from the database.
 * @param token Raw session token from cookie
 */
export async function deleteSession(token: string): Promise<void> {
  const hashedToken = createHash('sha256').update(token).digest('hex');
  await db
    .deleteFrom('sessions')
    .where('session_token', '=', hashedToken)
    .execute();
}

/**
 * Authenticates a user by email or username and password
 * @param identifier email or username 
 * @param password 
 * @returns User object if authentication is successful, otherwise throws an error
 */
export async function authenticateUser(identifier: string, password: string): Promise<User> {
  //1. Looks up user by email or username in user table
  const userResult = await db
    .selectFrom('user')
    .select(['id', 'email', 'username', 'role', 'account_status', 'requested_admin', 'email_verified', 'system_role'])
    .where((eb: any) => eb.or([
      eb('email', '=', identifier),
      eb('username', '=', identifier)  // using email parameter as it could be either email or username
    ]))
    .executeTakeFirst();      
  if (!userResult) {
    console.error('[authenticateUser] No user found with identifier:', identifier);
    throw Errors.INVALID_CREDENTIALS;
  }
  
  // Only accounts with 'active' status can log in
  // New users are active by default; org membership is controlled by invites
  // Note: Using snake_case because we're using (db as any) which returns raw DB column names
  if (userResult.account_status !== 'active') {
    // For new accounts: check if email is verified (for better error message)
    if (userResult.account_status === 'unverified' || userResult.account_status === 'pending') {
      if (!userResult.email_verified) {
        console.error('[authenticateUser] Email not verified for user:', userResult.email);
        // throw Errors.EMAIL_NOT_VERIFIED;
      }
      // Email is verified but account is pending admin approval
      console.error('[authenticateUser] Email is verified BUT account pending admin approval for user:', userResult.email);
      throw Errors.ACCOUNT_INACTIVE;
    }
    // Any other non-active status (denied, etc.)
    console.error('[authenticateUser] Account not active for user:', userResult.email, 'Status:', userResult.account_status);
    throw Errors.ACCOUNT_INACTIVE;
  }
  
  // Account is active - can log in
  // Note: For old accounts created before email verification, we don't require email_verified
  // But all accounts (old and new) MUST have account_status = 'active' to log in 

  //2. Finds auth_key for that user
  const keyResult = await db
    .selectFrom('auth_key')
    .select(['id', 'user_id', 'hashed_password'])
    .where('user_id', '=', userResult.id)
    .executeTakeFirst();

  if (!keyResult) {
    console.error('[authenticateUser] No auth key found in auth_key for user ID:', userResult.id);
    throw Errors.INTERNAL_ERROR;
  }

  //3. Compares password using bycrypt (hashed)
  if (!keyResult.hashed_password || !(await bcrypt.compare(password, keyResult.hashed_password))) {
    console.error('[authenticateUser] Password mismatch for user:', identifier);
    throw Errors.INVALID_CREDENTIALS;
  }

  return { id: userResult.id, email: userResult.email, username: userResult.username, systemRole: userResult.system_role as SystemRole, role: userResult.role };  //Success
} 

// NOTE; will return verificationToken for email sending at a later date
/**
 * Registers a new user.
 * @returns Newly created User object
 * @throws If user already exists or database insert errors occur
 */
export async function registerUser(email: string, username: string, password: string): Promise<{ user: User }> {  
    //1. Check if user already exists
    const existingUser = await db.selectFrom('user')
      .selectAll()
      .where((eb) => eb.or([
        eb('email', '=', email),
        eb('username', '=', username)
      ]))
      .executeTakeFirst();

    if (existingUser) {
      console.error('[registerUser] User already exists with email or username:', email, username);
      throw Errors.USER_ALREADY_EXISTS;
    }

    //2. Generate verification token (NOTE: not storing verification token for now)
    // const verificationTokenBytes = new Uint8Array(32);
    // crypto.getRandomValues(verificationTokenBytes);
    // const verificationToken = Buffer.from(verificationTokenBytes).toString('hex');    

    //3. Create new user (status: 'unverified' - waiting for email verification)
    const userResult = await db.insertInto('user').values({
      username: username,
      email: email, 
      role: 'user',
      account_status: 'active', // Public users are active by default; org membership is controlled by invites
      requested_admin: false,      
      // verification_token: verificationToken (NOTE: not storing verification token for now)
    }).returning('id').executeTakeFirst();

    if (!userResult || !userResult.id) {
      console.error('[registerUser] Failed to insert new user into database');
      throw Errors.INTERNAL_ERROR;
    }

    const userId = userResult.id;

    //4. Hash password and store in auth_key table
    const hashedPassword = await bcrypt.hash(password, 10);
    const authKeyResult = await db
      .insertInto('auth_key')
      .values({ id: randomUUID(), user_id: userId, hashed_password: hashedPassword })
      .execute();

    if (!authKeyResult) {
      console.error('[registerUser] Failed to insert auth key into database');
      throw Errors.INTERNAL_ERROR;
    }

    return {
      user: { id: userId, email, username, systemRole: 'user', role: 'user' },
      // verificationToken
    };
}