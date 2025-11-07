import "@testing-library/jest-dom";
import { vi } from 'vitest';

// Mock ResizeObserver for Radix UI components
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
