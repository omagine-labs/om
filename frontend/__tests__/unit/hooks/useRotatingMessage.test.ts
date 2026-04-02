/**
 * Unit tests for useRotatingMessage hook
 * Tests message cycling, interval timing, and cleanup
 */

import { renderHook, act } from '@testing-library/react';
import { useRotatingMessage } from '@/hooks/useRotatingMessage';

describe('useRotatingMessage hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const testMessages = ['Message 1', 'Message 2', 'Message 3'];

  it('should return the first message initially', () => {
    const { result } = renderHook(() => useRotatingMessage(testMessages));

    expect(result.current).toBe('Message 1');
  });

  it('should cycle to next message after interval', () => {
    const { result } = renderHook(() => useRotatingMessage(testMessages, 1000));

    expect(result.current).toBe('Message 1');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current).toBe('Message 2');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current).toBe('Message 3');
  });

  it('should wrap around to first message after last', () => {
    const { result } = renderHook(() => useRotatingMessage(testMessages, 1000));

    // Advance through all messages
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Should wrap back to first message
    expect(result.current).toBe('Message 1');
  });

  it('should use default interval of 3000ms', () => {
    const { result } = renderHook(() => useRotatingMessage(testMessages));

    expect(result.current).toBe('Message 1');

    // At 2999ms, should still be first message
    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(result.current).toBe('Message 1');

    // At 3000ms, should advance
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('Message 2');
  });

  it('should clean up interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => useRotatingMessage(testMessages));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('should reset interval when messages array length changes', () => {
    const { result, rerender } = renderHook(
      ({ messages }) => useRotatingMessage(messages, 1000),
      { initialProps: { messages: testMessages } }
    );

    // Advance to second message
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('Message 2');

    // Change messages array
    const newMessages = ['New 1', 'New 2'];
    rerender({ messages: newMessages });

    // After rerender with new messages, index should be preserved (mod length)
    // Index was 1, new length is 2, so 1 % 2 = 1 -> 'New 2'
    expect(result.current).toBe('New 2');
  });

  it('should handle single message array', () => {
    const { result } = renderHook(() =>
      useRotatingMessage(['Only message'], 1000)
    );

    expect(result.current).toBe('Only message');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should still be the same message (0 % 1 = 0)
    expect(result.current).toBe('Only message');
  });
});
