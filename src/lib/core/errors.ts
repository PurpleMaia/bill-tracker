export class ApiError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const Errors = {
    // Rate limit
    TOO_MANY_REQUESTS: new ApiError('TOO_MANY_REQUESTS', 429, 'Too many requests. Please try again later.'),
    
    // Register errors
    USER_ALREADY_EXISTS: new ApiError('USER_ALREADY_EXISTS', 409, 'User already exists. Please choose a different email or username.'),
    
    // Login errors
    INVALID_CREDENTIALS: new ApiError('INVALID_CREDENTIALS', 401, 'Invalid credentials. Please try again.'),
    ACCOUNT_INACTIVE: new ApiError('ACCOUNT_INACTIVE', 403, 'Account is inactive. Please contact support.'),
    EMAIL_NOT_VERIFIED: new ApiError('EMAIL_NOT_VERIFIED', 403, 'Email not verified. Please verify your email before logging in.'),
    
    // Session or authorization errors
    UNAUTHORIZED: new ApiError('UNAUTHORIZED', 401, 'Unauthorized access. Please log in.'),
    FORBIDDEN: new ApiError('FORBIDDEN', 403, 'Forbidden. You do not have permission to access this resource.'),
    INVALID_REQUEST: new ApiError('INVALID_REQUEST', 400, 'Invalid request parameters.'),
    NO_SESSION_COOKIE: new ApiError('NO_SESSION', 401, 'No session cookie found. Please log in.'),
    
    INTERNAL_ERROR: new ApiError('INTERNAL_ERROR', 500, 'Internal server error. Please try again later.'),
    NOT_A_MEMBER: new ApiError('NOT_A_MEMBER', 403, 'You are not a member of this organization.'),
    TENANT_NOT_FOUND: new ApiError('TENANT_NOT_FOUND', 404, 'Organization not found.'),
} as const;

/**
 * 
 *  if (error instanceof ApiError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.statusCode }
        );
    }
         
    // Unknown error
    console.error('[REGISTER]', error);
    return NextResponse.json(
        { error: 'Unknown Error' }, 
        { status: 500 }
    );
 */