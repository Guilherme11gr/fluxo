// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExecutionWatchMode } from './execution-watch-mode';

vi.mock('@/lib/query/hooks/use-execution-stream', () => ({
  useExecutionStream: vi.fn(),
}));

vi.mock('@/lib/query/hooks/use-executions', () => ({
  useLiveExecution: vi.fn(),
}));

vi.mock('lucide-react', () => {
  const S = () => <span />;
  return {
    Loader2: S, Play: S, CheckCircle2: S, XCircle: S, AlertTriangle: S,
    Eye: S, ChevronDown: S, ChevronRight: S, Code: S, Wrench: S,
    FileText: S, Zap: S, Activity: S, X: S,
  };
});

import { useExecutionStream } from '@/lib/query/hooks/use-execution-stream';
import { useLiveExecution } from '@/lib/query/hooks/use-executions';

const mockedStream = useExecutionStream as ReturnType<typeof vi.fn>;
const mockedLive = useLiveExecution as ReturnType<typeof vi.fn>;

function makeEvent(seq: number, kind: string, content = `event ${seq}`, metadata: Record<string, unknown> = {}) {
  return {
    id: `evt-${seq}`,
    executionId: 'exec-1',
    seq,
    kind,
    content,
    metadata,
    createdAt: '2026-05-17T12:00:00.000Z',
  };
}

describe('ExecutionWatchMode', () => {
  const defaultProps = {
    executionId: 'exec-1',
    open: true,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedStream.mockReturnValue({
      events: [],
      lastSeq: 0,
      isConnected: false,
      mode: 'disconnected',
      error: null,
      reset: vi.fn(),
    });
    mockedLive.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders sheet with title when open', () => {
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('Assistir ao vivo')).toBeInTheDocument();
  });

  it('renders SSE connection badge when mode is sse', () => {
    mockedStream.mockReturnValue({
      events: [], lastSeq: 0, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('SSE ao vivo')).toBeInTheDocument();
  });

  it('renders polling badge when mode is polling', () => {
    mockedStream.mockReturnValue({
      events: [], lastSeq: 0, isConnected: true, mode: 'polling', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('Polling')).toBeInTheDocument();
  });

  it('renders disconnected badge when mode is disconnected', () => {
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });

  it('renders waiting state when no events', () => {
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('Aguardando eventos...')).toBeInTheDocument();
  });

  it('renders event list with kind labels', () => {
    mockedStream.mockReturnValue({
      events: [
        makeEvent(1, 'step', 'Starting build'),
        makeEvent(2, 'tool_use', 'Read file'),
        makeEvent(3, 'tool_result', 'File content'),
        makeEvent(4, 'result', 'Build success'),
        makeEvent(5, 'error', 'Build failed'),
      ],
      lastSeq: 5, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('Step')).toBeInTheDocument();
    expect(screen.getByText('Tool Use')).toBeInTheDocument();
    expect(screen.getByText('Tool Result')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders tool name badge when metadata has toolName', () => {
    mockedStream.mockReturnValue({
      events: [makeEvent(1, 'tool_use', 'Read file', { toolName: 'Read' })],
      lastSeq: 1, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('renders step name when metadata has stepName', () => {
    mockedStream.mockReturnValue({
      events: [makeEvent(1, 'step', 'Building', { stepName: 'compile' })],
      lastSeq: 1, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('compile')).toBeInTheDocument();
  });

  it('renders execution status badge from live data', () => {
    mockedLive.mockReturnValue({
      data: { id: 'exec-1', status: 'RUNNING', tool: 'opencode', model: 'glm-5.1', duration: null },
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('renders duration from live data', () => {
    mockedLive.mockReturnValue({
      data: { id: 'exec-1', status: 'SUCCESS', duration: 125 },
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText(/2m 5s/)).toBeInTheDocument();
  });

  it('renders connection error when error is present', () => {
    mockedStream.mockReturnValue({
      events: [], lastSeq: 0, isConnected: false, mode: 'polling',
      error: new Error('SSE connection failed'), reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText(/Erro de conexão/)).toBeInTheDocument();
    expect(screen.getByText(/SSE connection failed/)).toBeInTheDocument();
  });

  it('toggles between compact and complete mode', () => {
    const longContent = 'A'.repeat(200);
    mockedStream.mockReturnValue({
      events: [makeEvent(1, 'output', longContent)],
      lastSeq: 1, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);

    const toggleBtn = screen.getByText('Modo completo');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Modo compacto')).toBeInTheDocument();
  });

  it('renders event count in footer', () => {
    mockedStream.mockReturnValue({
      events: [makeEvent(1, 'step'), makeEvent(2, 'output')],
      lastSeq: 2, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText(/2 eventos/)).toBeInTheDocument();
  });

  it('renders last sequence number in footer', () => {
    mockedStream.mockReturnValue({
      events: [makeEvent(1, 'step'), makeEvent(2, 'output')],
      lastSeq: 42, isConnected: true, mode: 'sse', error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(screen.getByText(/seq: 42/)).toBeInTheDocument();
  });

  it('renders live indicator when execution is CLAIMED', () => {
    mockedLive.mockReturnValue({ data: { id: 'exec-1', status: 'CLAIMED' } });
    mockedStream.mockReturnValue({
      events: [makeEvent(1, 'step')], lastSeq: 1, isConnected: true, mode: 'sse',
      error: null, reset: vi.fn(),
    });
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(document.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('does not render sheet content when open is false', () => {
    const { container } = render(<ExecutionWatchMode {...defaultProps} open={false} />);
    expect(container.querySelector('[data-state="open"]')).toBeNull();
  });

  it('uses useExecutionStream with correct executionId and enabled', () => {
    render(<ExecutionWatchMode {...defaultProps} />);
    expect(mockedStream).toHaveBeenCalledWith('exec-1', true);
  });

  it('passes enabled=false to useExecutionStream when sheet is closed', () => {
    render(<ExecutionWatchMode {...defaultProps} open={false} />);
    expect(mockedStream).toHaveBeenCalledWith('exec-1', false);
  });
});
