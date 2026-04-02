/**
 * @jest-environment node
 *
 * API Route Tests: /api/assign-speaker
 */

import { POST } from '@/app/api/assign-speaker/route';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// Mock dependencies
jest.mock('@/lib/supabase-server');

const mockServerSupabase = {
  auth: {
    getUser: jest.fn(),
  },
};

const mockServiceSupabase = {
  from: jest.fn(),
};

describe('POST /api/assign-speaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(
      mockServerSupabase
    );
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockServiceSupabase);
  });

  describe('Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should proceed if user is authenticated', async () => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });

      mockServiceSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });

  describe('Request Validation', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should return 400 if meetingId is missing', async () => {
      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerLabel: 'SPEAKER_A' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Missing meetingId or speakerLabel' });
    });

    it('should return 400 if speakerLabel is missing', async () => {
      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: 'meeting-123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Missing meetingId or speakerLabel' });
    });

    it('should return 400 if both parameters are missing', async () => {
      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Missing meetingId or speakerLabel' });
    });
  });

  describe('Speaker Assignment', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should use service role client for database update', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockServiceSupabase.from.mockReturnValue({
        update: mockUpdate,
      });

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      await POST(request);

      expect(createServiceRoleClient).toHaveBeenCalled();
      expect(mockServiceSupabase.from).toHaveBeenCalledWith('meeting_analysis');
    });

    it('should assign speaker to authenticated user', async () => {
      const mockEq2 = jest.fn().mockResolvedValue({ error: null });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq1 });

      mockServiceSupabase.from.mockReturnValue({
        update: mockUpdate,
      });

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      await POST(request);

      expect(mockUpdate).toHaveBeenCalledWith({
        assigned_user_id: 'user-123',
        custom_speaker_name: null,
      });
      expect(mockEq1).toHaveBeenCalledWith('meeting_id', 'meeting-123');
      expect(mockEq2).toHaveBeenCalledWith('speaker_label', 'SPEAKER_A');
    });

    it('should return 500 if database update fails', async () => {
      mockServiceSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              error: { message: 'Database error' },
            }),
          }),
        }),
      });

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to assign speaker' });
    });

    it('should return success on successful assignment', async () => {
      mockServiceSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should return 500 if request parsing fails', async () => {
      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should return 500 if auth check throws', async () => {
      mockServerSupabase.auth.getUser.mockRejectedValue(
        new Error('Auth error')
      );

      const request = new Request('http://localhost/api/assign-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meeting-123',
          speakerLabel: 'SPEAKER_A',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
