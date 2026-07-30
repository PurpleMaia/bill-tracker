import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  emailSchema,
  loginSchema,
  registerSchema,
  tagsSchema,
  nicknameSchema,
  proposalSchema,
  newTagSchema,
  usersSchema,
  userIdSchema,
} from '../auth/validators';

describe('uuidSchema', () => {
  it('accepts a valid UUID', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('rejects an invalid UUID', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(uuidSchema.safeParse('').success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('accepts a valid email', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = emailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Please provide a valid email address.');
    }
  });

  it('rejects empty string', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    expect(loginSchema.safeParse({ authString: 'user@test.com', password: 'pass123' }).success).toBe(true);
  });

  it('rejects empty authString', () => {
    const result = loginSchema.safeParse({ authString: '', password: 'pass123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ authString: 'user', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects username shorter than 3 chars', () => {
    const result = registerSchema.safeParse({
      username: 'ab',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('at least 3 characters');
    }
  });

  it('rejects username with special characters', () => {
    const result = registerSchema.safeParse({
      username: 'test user!',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('letters, numbers, and underscores');
    }
  });

  it('accepts username with underscores', () => {
    const result = registerSchema.safeParse({
      username: 'test_user_123',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'notanemail',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});

describe('tagsSchema', () => {
  it('accepts valid array of UUIDs', () => {
    const result = tagsSchema.safeParse({
      tagIds: ['550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty array', () => {
    expect(tagsSchema.safeParse({ tagIds: [] }).success).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(tagsSchema.safeParse({ tagIds: ['not-uuid'] }).success).toBe(false);
  });
});

describe('nicknameSchema', () => {
  it('accepts valid nickname', () => {
    const result = nicknameSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      nickname: 'Food Safety Act',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty nickname', () => {
    const result = nicknameSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      nickname: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects nickname over 100 chars', () => {
    const result = nicknameSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      nickname: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe('proposalSchema', () => {
  it('accepts valid proposal', () => {
    const result = proposalSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      currentStatus: 'introduced',
      proposedStatus: 'scheduled1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts proposal with note', () => {
    const result = proposalSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      currentStatus: 'introduced',
      proposedStatus: 'scheduled1',
      note: 'Heard in committee today',
    });
    expect(result.success).toBe(true);
  });

  it('rejects note over 1000 chars', () => {
    const result = proposalSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      currentStatus: 'introduced',
      proposedStatus: 'scheduled1',
      note: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty currentStatus', () => {
    const result = proposalSchema.safeParse({
      billId: '550e8400-e29b-41d4-a716-446655440000',
      currentStatus: '',
      proposedStatus: 'scheduled1',
    });
    expect(result.success).toBe(false);
  });
});

describe('newTagSchema', () => {
  it('accepts valid tag', () => {
    expect(newTagSchema.safeParse({ name: 'Priority', color: '#FF0000' }).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(newTagSchema.safeParse({ name: '', color: '#FF0000' }).success).toBe(false);
  });

  it('rejects name over 50 chars', () => {
    expect(newTagSchema.safeParse({ name: 'a'.repeat(51), color: '#FF0000' }).success).toBe(false);
  });
});

describe('usersSchema', () => {
  it('accepts array with valid UUIDs', () => {
    const result = usersSchema.safeParse({
      userIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty array', () => {
    const result = usersSchema.safeParse({ userIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('At least one user ID');
    }
  });
});

describe('userIdSchema', () => {
  it('accepts valid userId object', () => {
    expect(userIdSchema.safeParse({ userId: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
  });

  it('rejects invalid userId', () => {
    expect(userIdSchema.safeParse({ userId: 'bad' }).success).toBe(false);
  });
});
