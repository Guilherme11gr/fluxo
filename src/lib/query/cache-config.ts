/**
 * Global Cache Configuration
 * 
 * 5 cache tiers for different data freshness requirements.
 * All times are in milliseconds.
 * 
 * - staleTime: How long data is considered fresh (no refetch on mount)
 * - gcTime: How long unused data stays in cache (garbage collection)
 */

// Base time units (milliseconds)
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Cache Tiers
 *
 * REALTIME     - Live data that needs constant updates (poker votes, notifications)
 * FRESH        - Frequently changing data (tasks, comments)
 * STANDARD     - Regular data (projects, epics, features)
 * STABLE       - Rarely changing data (user profile, org settings)
 * ULTRA_STABLE - Almost never changes, called frequently (current user profile)
 * STATIC       - Never changes (enums, static config)
 */
export const CACHE_TIMES = {
  /** Live data - always refetch on focus/mount */
  REALTIME: {
    staleTime: 0,
    gcTime: 10 * SECOND, // ✅ Reduced from 1min to 10s to prevent memory buildup
  },

  /** Frequently changing - 5s fresh, 5min cache
   * Reduced to 5s to feel "snappy" on navigation but avoid instant refetches during quick interactions.
   */
  FRESH: {
    staleTime: 5 * SECOND,
    gcTime: 5 * MINUTE,
  },

  /** Regular data - 30s fresh, 10min cache
   * Reduced from 2min to 30s to keep project/feature lists reasonably up to date.
   */
  STANDARD: {
    staleTime: 30 * SECOND,
    gcTime: 10 * MINUTE,
  },

  /** Rarely changing - 10min fresh, 30min cache */
  STABLE: {
    staleTime: 10 * MINUTE,
    gcTime: 30 * MINUTE,
  },

  /** Almost never changes - 30min fresh, 2hr cache
   * For data that barely changes but is called very frequently (e.g., /api/users/me)
   * Reduces API calls to Vercel by aggressive client-side caching
   */
  ULTRA_STABLE: {
    staleTime: 30 * MINUTE,
    gcTime: 2 * HOUR,
  },

  /** Almost static - 1hr fresh, 24hr cache */
  STATIC: {
    staleTime: 1 * HOUR,
    gcTime: 24 * HOUR,
  },
} as const;

/** Type for cache tier keys */
export type CacheTier = keyof typeof CACHE_TIMES;

/**
 * Get cache config for a specific tier
 * @example
 * useQuery({ ...getCacheConfig('FRESH'), queryKey: [...] })
 */
export function getCacheConfig(tier: CacheTier) {
  return CACHE_TIMES[tier];
}

/**
 * Cache Tier Guidelines
 *
 * REALTIME     - tasks, comments (with RT), poker votes, notifications
 * FRESH        - features list, dashboard stats
 * STANDARD     - projects, epics list, features detail, epics detail
 * STABLE       - user profile, org settings, users list
 * ULTRA_STABLE - current user profile (/api/users/me) - rarely changes, most called endpoint
 * STATIC       - enums, config, project modules
 *
 * ✅ Real-time is implemented - tasks/comments use REALTIME tier (staleTime: 0)
 * This ensures stale data is refetched immediately when needed while benefiting
 * from real-time broadcasts for updates from other clients.
 */
export const CACHE_TIER_GUIDELINES = {
  tasks: 'REALTIME', // ✅ Real-time enabled - immediate refetch + live updates
  comments: 'REALTIME', // ✅ Real-time enabled - immediate refetch + live updates
  features: 'STANDARD',
  epics: 'STANDARD',
  projects: 'STANDARD',
  users: 'STABLE',
  currentUser: 'ULTRA_STABLE', // ✅ Aggressive caching for /api/users/me - most called endpoint
  orgSettings: 'STABLE',
  enums: 'STATIC',
  pokerVotes: 'REALTIME',
  notifications: 'REALTIME',
} as const;
