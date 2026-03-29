/**
 * Real-time Connection Manager
 * 
 * Manages WebSocket connection to Supabase Realtime with:
 * - Exponential backoff reconnection
 * - Jitter to avoid thundering herd
 * - Status tracking
 * - Automatic disconnect/reconnect
 */

import type { SupabaseClient, RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import type { ConnectionStatus, BroadcastEvent, ConnectionManagerConfig } from './types';

export class RealtimeConnectionManager {
  private channel: RealtimeChannel | null = null;
  private adminChannel: RealtimeChannel | null = null;
  private reconnectAttempts = 0;
  private maxAttempts = 10;
  private baseDelay = 1000; // 1 second
  private maxDelay = 30000; // 30 seconds
  private reconnectTimer?: NodeJS.Timeout;
  private connectTimeout?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private currentStatus: ConnectionStatus = 'disconnected';
  private config: ConnectionManagerConfig;
  private orgId!: string; // Assigned in connect()
  private userId!: string; // Assigned in connect()
  private tabId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: SupabaseClient<any, any, any>;
  private shouldReconnect = true;
  private lastHeartbeat = 0;
  private heartbeatInterval = 30000; // 30 seconds
  private hasReachedMaxAttempts = false; // Prevent infinite reconnection loops

  /**
   * Create a new RealtimeConnectionManager
   * 
   * @param config - Connection configuration (callbacks)
   * @param supabase - Supabase client instance (injected from app's singleton)
   * 
   * ✅ Uses injected client to share auth state with rest of app
   * ✅ No duplicate GoTrueClient instances
   * ✅ Single WebSocket connection for auth + realtime
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: ConnectionManagerConfig, supabase: SupabaseClient<any, any, any>) {
    this.config = config;
    this.tabId = config.tabId || this.generateTabId();
    this.supabase = supabase;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[RealtimeConnectionManager] Initialized with injected Supabase client');
    }
  }

  /**
   * Connect to Supabase Realtime for an organization
   */
  connect(orgId: string, userId: string) {
    // ✅ If connecting to different org, cancel previous connection
    if (this.currentStatus === 'connecting' && this.orgId && this.orgId !== orgId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] Canceling connection to ${this.orgId}, switching to ${orgId}`);
      }
      this.disconnect();
    }
    
    // If already connected to the same org, skip reconnection
    if (this.currentStatus === 'connected' && this.orgId === orgId && this.userId === userId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Realtime] Already connected to org, skipping reconnection');
      }
      return;
    }

    // If currently connecting to the same org, skip
    if (this.currentStatus === 'connecting' && this.orgId === orgId && this.userId === userId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Realtime] Already connecting to org, skipping');
      }
      return;
    }

    // Enable reconnection for explicit connects
    this.shouldReconnect = true;

    // Reset max attempts flag when manually connecting
    this.hasReachedMaxAttempts = false;
    this.reconnectAttempts = 0;

    this.orgId = orgId;
    this.userId = userId;
    this.currentStatus = 'connecting';
    this.config.onStatusChange('connecting');

    // Clean up previous channel if exists (prevent memory leak)
    if (this.channel) {
      // ✅ FIX: removeChannel() properly cleans up (unsubscribe only detaches listeners)
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Clean up previous timeout if exists
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }

    // Use shared Supabase client instead of creating new one
    // Create channel scoped to organization
    this.channel = this.supabase.channel(`org:${orgId}`, {
      config: {
        broadcast: { self: true }, // ✅ Receive own events for cross-tab sync
        presence: { key: `${userId}:${this.tabId}` },
      },
    });

    // Listen for broadcast events
    this.channel.on('broadcast', { event: 'entity_event' }, (payload) => {
      try {
        const event = payload.payload as BroadcastEvent;

        // Dedup by eventId
        if (event.eventId) {
          this.config.onEvent(event);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Realtime] Failed to parse broadcast event:', error);
        }
      }
    });

    // Listen for connection status changes
    this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.onConnected();
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.onDisconnected(status === 'CHANNEL_ERROR' ? 'Connection error' : 'Connection closed');
      }
    });

    // Also subscribe to admin commands channel (global, not org-specific)
    this.adminChannel = this.supabase.channel('admin:commands', {
      config: {
        broadcast: { self: false },
      },
    });

    // Listen for admin commands (cleanup, etc)
    this.adminChannel.on('broadcast', { event: 'admin_command' }, (payload) => {
      try {
        const command = payload.payload as { command: string; timestamp: string; reason: string };
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Realtime] Received admin command:', command);
        }

        if (command.command === 'force_reconnect') {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Realtime] Force reconnect requested by admin:', command.reason);
          }
          // Disconnect cleanly - will reconnect automatically
          this.disconnect();
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Realtime] Failed to process admin command:', error);
        }
      }
    });

    // Subscribe to admin channel
    this.adminChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Realtime] Admin commands channel subscribed');
        }
      } else if (status === 'CHANNEL_ERROR') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Realtime] Admin commands channel error');
        }
      }
    });

    // Set connection timeout (10s)
    this.connectTimeout = setTimeout(() => {
      if (this.currentStatus === 'connecting') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Realtime] Connection timeout');
        }
        this.onDisconnected('Connection timeout');
      }
    }, 10000);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Realtime] Connecting to org:${orgId} as user:${userId} tab:${this.tabId}`);
    }
  }

  /**
   * Disconnect from Realtime channel
   */
  disconnect() {
    // Disable reconnection for intentional disconnects
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.adminChannel) {
      // ✅ FIX: removeChannel() properly cleans up (unsubscribe only detaches listeners)
      this.supabase.removeChannel(this.adminChannel);
      this.adminChannel = null;
    }

    if (this.channel) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] Disconnecting from org:${this.orgId}`);
      }
      // ✅ FIX: removeChannel() properly cleans up (unsubscribe only detaches listeners)
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.currentStatus = 'disconnected';
    this.reconnectAttempts = 0;
    this.config.onStatusChange('disconnected');
  }

  /**
   * Broadcast an event to other clients
   */
  broadcast(event: Omit<BroadcastEvent, 'sequence' | 'tabId'>) {
    if (!this.channel || this.currentStatus !== 'connected') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Realtime] Cannot broadcast: not connected');
      }
      return;
    }

    const enrichedEvent: BroadcastEvent = {
      ...event,
      sequence: Date.now(), // ✅ Unified: same as server-side
      tabId: this.tabId,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Realtime] 📤 Broadcasting event with sequence=${enrichedEvent.sequence}`);
    }

    this.channel.send({
      type: 'broadcast',
      event: 'entity_event',
      payload: enrichedEvent,
    });
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  /**
   * Get current tab ID
   */
  getTabId(): string {
    return this.tabId;
  }

  // ==================== Private Methods ====================

  private onConnected() {
    // Clear connection timeout
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Realtime] Connected to org:${this.orgId}`);
    }
    this.currentStatus = 'connected';
    this.reconnectAttempts = 0; // Reset on successful connection
    this.hasReachedMaxAttempts = false; // Reset max attempts flag
    this.config.onStatusChange('connected');

    // Start heartbeat to keep connection alive and detect zombie connections
    this.startHeartbeat();
  }

  private onDisconnected(reason: string) {
    // Clear connection timeout
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }

    // Clear heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Realtime] Disconnected from org:${this.orgId}: ${reason}`);
    }

    this.currentStatus = 'disconnected';
    this.config.onStatusChange('disconnected');

    // Don't reconnect if intentionally disconnected
    if (!this.shouldReconnect) return;

    // Attempt reconnection with exponential backoff
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    // Prevent reconnection if we've already reached max attempts
    if (this.hasReachedMaxAttempts) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Realtime] Already reached max attempts. Skipping reconnection.');
      }
      return;
    }

    const delay = this.getReconnectDelay();

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Realtime] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxAttempts})`);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;

      // Check BEFORE proceeding
      if (this.reconnectAttempts > this.maxAttempts) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Realtime] Max reconnection attempts reached. Giving up.');
        }
        this.hasReachedMaxAttempts = true;
        this.currentStatus = 'failed';
        this.config.onStatusChange('failed');
        return;
      }

      // Re-create channel and reconnect
      if (this.orgId && this.userId && !this.hasReachedMaxAttempts) {
        this.connect(this.orgId, this.userId);
      }
    }, delay);
  }

  /**
   * Calculate reconnection delay with exponential backoff and jitter
   * 
   * Formula: min(baseDelay * 2^attempts, maxDelay) * (0.8 + random() * 0.4)
   * 
   * Example:
   * - Attempt 1: 1000ms ±20% = 800-1200ms
   * - Attempt 2: 2000ms ±20% = 1600-2400ms
   * - Attempt 3: 4000ms ±20% = 3200-4800ms
   * - Attempt 4: 8000ms ±20% = 6400-9600ms
   * - Attempt 5: 16000ms ±20% = 12800-19200ms
   * - Attempt 6: 30000ms (capped) ±20% = 24000-30000ms
   */
  private getReconnectDelay(): number {
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxDelay
    );
    
    // Add jitter (±20%) to avoid thundering herd
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.floor(exponentialDelay * jitter);
  }

  /**
   * Generate a unique tab ID for this browser session
   * Persists across page reloads but not across different tabs
   */
  private generateTabId(): string {
    // Check if we already have a tab ID in session storage
    const existingTabId = sessionStorage.getItem('realtime_tab_id');
    if (existingTabId) {
      return existingTabId;
    }

    // Generate new UUID for this tab
    const newTabId = crypto.randomUUID();
    sessionStorage.setItem('realtime_tab_id', newTabId);
    return newTabId;
  }

  /**
   * Start heartbeat to keep connection alive
   * Updates presence every 30 seconds to detect zombie connections
   */
  private startHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.lastHeartbeat = Date.now();

    // Send heartbeat every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      if (!this.channel || this.currentStatus !== 'connected') {
        // Stop heartbeat if not connected
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = undefined;
        }
        return;
      }

      try {
        // Track presence with timestamp
        this.channel.track({
          online: true,
          timestamp: Date.now(),
          userId: this.userId,
          tabId: this.tabId,
        });

        this.lastHeartbeat = Date.now();
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Realtime] Heartbeat error:', error);
        }
        // Don't stop heartbeat on error - it might be transient
      }
    }, this.heartbeatInterval);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Realtime] Heartbeat started (${this.heartbeatInterval}ms interval)`);
    }
  }
}
