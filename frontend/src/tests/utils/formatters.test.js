import { describe, it, expect } from 'vitest';
import { isDataroomOwner, isDataroomCollaborator, getAvatarInitial } from '../../utils/formatters';

describe('formatters & dataroom role helpers', () => {
  describe('isDataroomOwner', () => {
    it('returns true when current_user_role is owner', () => {
      const dataroom = { id: 'room-1', current_user_role: 'owner', created_by: 'user-2', owner: { id: 'user-2' } };
      const user = { id: 'user-1' };
      expect(isDataroomOwner(dataroom, user)).toBe(true);
    });

    it('returns true when created_by string matches user id', () => {
      const dataroom = { id: 'room-1', created_by: 'user-1' };
      const user = { id: 'user-1' };
      expect(isDataroomOwner(dataroom, user)).toBe(true);
    });

    it('returns true when created_by object id matches user id', () => {
      const dataroom = { id: 'room-1', created_by: { id: 'user-1' } };
      const user = { id: 'user-1' };
      expect(isDataroomOwner(dataroom, user)).toBe(true);
    });

    it('returns true when owner object id matches user id', () => {
      const dataroom = { id: 'room-1', owner: { id: 'user-1' } };
      const user = { id: 'user-1' };
      expect(isDataroomOwner(dataroom, user)).toBe(true);
    });

    it('returns false when user does not match owner credentials', () => {
      const dataroom = { id: 'room-1', current_user_role: 'collaborator', created_by: 'user-2', owner: { id: 'user-2' } };
      const user = { id: 'user-1' };
      expect(isDataroomOwner(dataroom, user)).toBe(false);
    });

    it('returns false for null or undefined input', () => {
      expect(isDataroomOwner(null, { id: '1' })).toBe(false);
      expect(isDataroomOwner({ id: 'room-1' }, null)).toBe(false);
    });
  });

  describe('isDataroomCollaborator', () => {
    it('returns true when current_user_role is collaborator', () => {
      const dataroom = { id: 'room-1', current_user_role: 'collaborator', created_by: 'user-2' };
      const user = { id: 'user-1' };
      expect(isDataroomCollaborator(dataroom, user)).toBe(true);
    });

    it('returns true when user id is present in collaborators array', () => {
      const dataroom = {
        id: 'room-1',
        created_by: 'user-2',
        collaborators: [{ user_id: 'user-1' }, { user: { id: 'user-3' } }],
      };
      const user = { id: 'user-1' };
      expect(isDataroomCollaborator(dataroom, user)).toBe(true);
    });

    it('returns false if the user is the owner, even if listed in collaborators', () => {
      const dataroom = {
        id: 'room-1',
        current_user_role: 'owner',
        created_by: 'user-1',
        collaborators: [{ user_id: 'user-1' }],
      };
      const user = { id: 'user-1' };
      expect(isDataroomCollaborator(dataroom, user)).toBe(false);
    });

    it('returns false when user is neither owner nor collaborator', () => {
      const dataroom = { id: 'room-1', current_user_role: 'none', created_by: 'user-2', collaborators: [] };
      const user = { id: 'user-1' };
      expect(isDataroomCollaborator(dataroom, user)).toBe(false);
    });
  });

  describe('getAvatarInitial', () => {
    it('returns first and last initials for full names', () => {
      expect(getAvatarInitial('Alice Chen', '')).toBe('AC');
    });

    it('returns first 2 characters for single-word names', () => {
      expect(getAvatarInitial('Admin', '')).toBe('AD');
    });

    it('falls back to email when name is empty', () => {
      expect(getAvatarInitial('', 'bob@example.com')).toBe('BO');
    });

    it('returns ? when both are empty', () => {
      expect(getAvatarInitial('', '')).toBe('?');
    });
  });
});
