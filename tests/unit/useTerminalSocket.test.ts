import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Fake socket state — reset in beforeEach
let fakeSocket: {
  handlers: Map<string, (...args: unknown[]) => void>;
  ioHandlers: Map<string, (...args: unknown[]) => void>;
  disconnected: boolean;
  on: ReturnType<typeof vi.fn>;
  io: { on: ReturnType<typeof vi.fn> };
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function makeFakeSocket() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const ioHandlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    ioHandlers,
    disconnected: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    io: {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        ioHandlers.set(event, handler);
      }),
    },
    emit: vi.fn(),
    disconnect: vi.fn(() => {
      fakeSocket.disconnected = true;
    }),
  };
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    fakeSocket = makeFakeSocket();
    return fakeSocket;
  }),
}));

import { useTerminalSocket } from '../../src/client/hooks/useTerminalSocket.js';
import { io as mockIo } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireSocketEvent(event: string, ...args: unknown[]) {
  const handler = fakeSocket.handlers.get(event);
  if (!handler) throw new Error(`No socket handler registered for "${event}"`);
  handler(...args);
}

function fireIoEvent(event: string, ...args: unknown[]) {
  const handler = fakeSocket.ioHandlers.get(event);
  if (!handler) throw new Error(`No io handler registered for "${event}"`);
  handler(...args);
}

function defaultParams() {
  return {
    sessionName: 'forge-project-abc123',
    onTerminalOutput: vi.fn(),
    onTerminalReset: vi.fn(),
    onSessionExit: vi.fn(),
    getDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Structural
// ---------------------------------------------------------------------------

describe('useTerminalSocket', () => {
  it('exports the useTerminalSocket function', () => {
    expect(typeof useTerminalSocket).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Suite 1 — 1500ms overlay delay
// ---------------------------------------------------------------------------

describe('useTerminalSocket — 1500ms overlay delay', () => {
  it('showConnectingOverlay is false immediately after disconnect', () => {
    const params = defaultParams();
    const { result } = renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.showConnectingOverlay).toBe(false);

    act(() => {
      fireSocketEvent('disconnect');
    });

    // Timer has not elapsed — overlay should still be hidden
    expect(result.current.showConnectingOverlay).toBe(false);
  });

  it('showConnectingOverlay becomes true after 1500ms of disconnect', () => {
    const params = defaultParams();
    const { result } = renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });
    act(() => {
      fireSocketEvent('disconnect');
    });

    // Advance to just before the threshold — overlay still hidden
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current.showConnectingOverlay).toBe(false);

    // Cross the 1500ms threshold — overlay should now appear
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.showConnectingOverlay).toBe(true);
  });

  it('showConnectingOverlay stays false if socket reconnects within 1500ms', () => {
    const params = defaultParams();
    const { result } = renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });
    act(() => {
      fireSocketEvent('disconnect');
    });

    // Advance partway — timer not yet elapsed
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.showConnectingOverlay).toBe(false);

    // Socket reconnects before the 1500ms timer fires
    act(() => {
      fireSocketEvent('connect');
    });

    // Advance past original 1500ms mark — timer was cancelled so overlay stays hidden
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.showConnectingOverlay).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — PTY exit triggers reconnect
// ---------------------------------------------------------------------------

describe('useTerminalSocket — PTY exit reconnect', () => {
  it('terminal:exit disconnects socket and increments reconnectGeneration after 2s', () => {
    const params = defaultParams();
    renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });

    const ioCallCountBefore = (mockIo as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      fireSocketEvent('terminal:exit', { exitCode: 0 });
    });

    // disconnect() should have been called on the socket
    expect(fakeSocket.disconnect).toHaveBeenCalled();

    // Before 2s delay: no new socket created yet
    expect((mockIo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(ioCallCountBefore);

    // Advance past the 2s delay — reconnectGeneration increments → new socket
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // A new socket should have been created (io() called again)
    expect((mockIo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(ioCallCountBefore + 1);
  });

  it('terminal:exit calls onSessionExit with the exit code', () => {
    const params = defaultParams();
    renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });
    act(() => {
      fireSocketEvent('terminal:exit', { exitCode: 42 });
    });

    expect(params.onSessionExit).toHaveBeenCalledWith(42);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Callback ref stability (no reconnect on callback identity change)
// ---------------------------------------------------------------------------

describe('useTerminalSocket — callback ref stability', () => {
  it('re-rendering with new callback identity does not create a new socket', () => {
    const params = defaultParams();
    const { rerender } = renderHook(
      (currentParams: ReturnType<typeof defaultParams>) => useTerminalSocket(currentParams),
      { initialProps: params },
    );

    act(() => {
      fireSocketEvent('connect');
    });

    const ioCallCountAfterConnect = (mockIo as ReturnType<typeof vi.fn>).mock.calls.length;

    // Re-render with brand-new callback function instances (different object identity)
    const newParams = {
      ...params,
      onTerminalOutput: vi.fn(),
      onTerminalReset: vi.fn(),
      onSessionExit: vi.fn(),
    };

    act(() => {
      rerender(newParams);
    });

    // io() must NOT have been called again — callbacks are stored in refs
    expect((mockIo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(ioCallCountAfterConnect);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — sendInput and sendResize
// ---------------------------------------------------------------------------

describe('useTerminalSocket — sendInput and sendResize', () => {
  it('sendInput emits terminal:input to the socket', () => {
    const params = defaultParams();
    const { result } = renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });
    act(() => {
      result.current.sendInput('hello');
    });

    expect(fakeSocket.emit).toHaveBeenCalledWith('terminal:input', 'hello');
  });

  it('sendResize emits terminal:resize with cols and rows to the socket', () => {
    const params = defaultParams();
    const { result } = renderHook(() => useTerminalSocket(params));

    act(() => {
      fireSocketEvent('connect');
    });
    act(() => {
      result.current.sendResize(120, 30);
    });

    expect(fakeSocket.emit).toHaveBeenCalledWith('terminal:resize', { cols: 120, rows: 30 });
  });
});
