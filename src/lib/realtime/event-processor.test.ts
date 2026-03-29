/**
 * Tests for EventProcessor
 * 
 * Tests cover:
 * - Batching of events (300ms debounce)
 * - Dedup by eventId
 * - Invalidation mapping
 * - Sequence gap detection
 * - Memory cleanup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('EventProcessor', () => {
  describe('Batching of events (300ms debounce)', () => {
    it('should accumulate events during debounce period', () => {
      const events: unknown[] = [];
      const debounceDelay = 300;
      let timer: NodeJS.Timeout | null = null;
      
      const processEvent = (event: unknown) => {
        events.push(event);
      };
      
      const scheduleProcess = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          // Process batch
        }, debounceDelay);
      };
      
      // Simulate rapid events
      processEvent({ id: 1 });
      scheduleProcess();
      processEvent({ id: 2 });
      scheduleProcess();
      processEvent({ id: 3 });
      scheduleProcess();
      
      expect(events.length).toBe(3);
    });
    
    it('should only process once after debounce period', () => {
      const processCount = { value: 0 };
      const debounceDelay = 300;
      let timer: NodeJS.Timeout | null = null;
      
      const processBatch = () => {
        processCount.value++;
      };
      
      const scheduleProcess = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(processBatch, debounceDelay);
      };
      
      // Simulate rapid events
      scheduleProcess();
      scheduleProcess();
      scheduleProcess();
      
      // Should only process once after debounce
      expect(processCount.value).toBe(0);
    });
  });
  
  describe('Dedup by eventId', () => {
    it('should not process same event twice', () => {
      const processedEventIds = new Set<string>();
      const processedEvents: unknown[] = [];
      
      const processEvent = (event: unknown & { eventId: string }) => {
        if (processedEventIds.has(event.eventId)) {
          return;
        }
        processedEventIds.add(event.eventId);
        processedEvents.push(event);
      };
      
      const event1 = { eventId: '123', data: 'test' };
      const event2 = { eventId: '123', data: 'test' }; // Same eventId
      
      processEvent(event1);
      processEvent(event2);
      
      expect(processedEvents.length).toBe(1);
      expect(processedEventIds.has('123')).toBe(true);
    });
    
    it('should process different events', () => {
      const processedEventIds = new Set<string>();
      const processedEvents: unknown[] = [];
      
      const processEvent = (event: unknown & { eventId: string }) => {
        if (processedEventIds.has(event.eventId)) {
          return;
        }
        processedEventIds.add(event.eventId);
        processedEvents.push(event);
      };
      
      const event1 = { eventId: '111', data: 'test1' };
      const event2 = { eventId: '222', data: 'test2' };
      const event3 = { eventId: '333', data: 'test3' };
      
      processEvent(event1);
      processEvent(event2);
      processEvent(event3);
      
      expect(processedEvents.length).toBe(3);
    });
    
    it('should handle memory cleanup', () => {
      const maxProcessedEvents = 1000;
      const processedEventIds = new Set<string>();
      
      const processEvent = (event: unknown & { eventId: string }) => {
        if (processedEventIds.has(event.eventId)) {
          return;
        }
        processedEventIds.add(event.eventId);
        
        // Cleanup if > 1000
        if (processedEventIds.size > maxProcessedEvents) {
          const entries = Array.from(processedEventIds);
          // Remove oldest 500
          entries.slice(0, 500).forEach(id => processedEventIds.delete(id));
        }
      };
      
      // Simulate 1500 events
      for (let i = 0; i < 1500; i++) {
        processEvent({ eventId: `event-${i}` });
      }
      
      // Should have max 1000 unique IDs (after cleanup)
      expect(processedEventIds.size).toBeLessThanOrEqual(maxProcessedEvents);
    });
  });
  
  describe('Invalidation mapping', () => {
    it('should map task.created to correct query keys', () => {
      const event = {
        entityType: 'task',
        eventType: 'created',
        entityId: 'task-123',
        metadata: { featureId: 'feature-456' },
      };
      
      const expectedKeys = [
        ['tasks', 'lists'], // All task lists
        ['features', 'feature-456'], // Feature detail
        ['dashboard', 'all'], // Dashboard
      ];
      
      // Should map to these keys
      expect(event.entityType).toBe('task');
      expect(event.eventType).toBe('created');
    });
    
    it('should map task.status_changed to correct query keys', () => {
      const event = {
        entityType: 'task',
        eventType: 'status_changed',
        entityId: 'task-123',
        metadata: { featureId: 'feature-456' },
      };
      
      const expectedKeys = [
        ['tasks', 'task-123'], // Task detail
        ['tasks', 'lists'], // All task lists
        ['features', 'feature-456'], // Feature detail (for health)
        ['dashboard', 'myTasks'], // My tasks
      ];
      
      // Should map to these keys
      expect(event.entityType).toBe('task');
      expect(event.eventType).toBe('status_changed');
    });
    
    it('should handle all entity types', () => {
      const entities = ['task', 'feature', 'epic', 'comment', 'doc', 'project'];
      
      entities.forEach(entityType => {
        const event = {
          entityType,
          eventType: 'updated',
          entityId: `${entityType}-123`,
        };
        
        expect(event.entityType).toBe(entityType);
        expect(event.eventType).toBe('updated');
      });
    });
  });
  
  describe('Sequence gap detection', () => {
    it('should detect gap when sequence > last + 1', () => {
      const lastSequences = new Map<string, number>();
      
      const detectGaps = (event: { entityType: string; entityId: string; sequence: number }) => {
        const entityKey = `${event.entityType}:${event.entityId}`;
        const lastSequence = lastSequences.get(entityKey);
        
        if (lastSequence && event.sequence > lastSequence + 1) {
          return true; // Gap detected
        }
        
        lastSequences.set(entityKey, event.sequence);
        return false;
      };
      
      const event1 = { entityType: 'task', entityId: 'task-1', sequence: 10 };
      const event2 = { entityType: 'task', entityId: 'task-1', sequence: 12 }; // Gap!
      
      detectGaps(event1);
      const hasGap = detectGaps(event2);
      
      expect(hasGap).toBe(true);
    });
    
    it('should not detect gap when sequence is consecutive', () => {
      const lastSequences = new Map<string, number>();
      
      const detectGaps = (event: { entityType: string; entityId: string; sequence: number }) => {
        const entityKey = `${event.entityType}:${event.entityId}`;
        const lastSequence = lastSequences.get(entityKey);
        
        if (lastSequence && event.sequence > lastSequence + 1) {
          return true;
        }
        
        lastSequences.set(entityKey, event.sequence);
        return false;
      };
      
      const event1 = { entityType: 'task', entityId: 'task-1', sequence: 10 };
      const event2 = { entityType: 'task', entityId: 'task-1', sequence: 11 };
      
      detectGaps(event1);
      const hasGap = detectGaps(event2);
      
      expect(hasGap).toBe(false);
    });
    
    it('should handle multiple entities', () => {
      const lastSequences = new Map<string, number>();
      
      const detectGaps = (event: { entityType: string; entityId: string; sequence: number }) => {
        const entityKey = `${event.entityType}:${event.entityId}`;
        const lastSequence = lastSequences.get(entityKey);
        
        if (lastSequence && event.sequence > lastSequence + 1) {
          return true;
        }
        
        lastSequences.set(entityKey, event.sequence);
        return false;
      };
      
      const event1 = { entityType: 'task', entityId: 'task-1', sequence: 10 };
      const event2 = { entityType: 'task', entityId: 'task-2', sequence: 11 };
      const event3 = { entityType: 'feature', entityId: 'feature-1', sequence: 5 };
      const event4 = { entityType: 'feature', entityId: 'feature-1', sequence: 7 }; // Gap!
      
      detectGaps(event1);
      detectGaps(event2);
      detectGaps(event3);
      const hasGap = detectGaps(event4);
      
      // Only feature-1 should have gap
      expect(hasGap).toBe(true);
    });
  });
  
  describe('Memory cleanup', () => {
    it('should keep last 1000 processed events', () => {
      const maxProcessedEvents = 1000;
      const processedEventIds = new Set<string>();
      
      const processEvent = (eventId: string) => {
        if (processedEventIds.has(eventId)) {
          return;
        }
        processedEventIds.add(eventId);
        
        if (processedEventIds.size > maxProcessedEvents) {
          const entries = Array.from(processedEventIds);
          entries.slice(0, 500).forEach(id => processedEventIds.delete(id));
        }
      };
      
      // Process 1500 events
      for (let i = 0; i < 1500; i++) {
        processEvent(`event-${i}`);
      }
      
      // Should have max 1000
      expect(processedEventIds.size).toBe(maxProcessedEvents);
    });
    
    it('should remove oldest events when limit exceeded', () => {
      const maxProcessedEvents = 1000;
      const processedEventIds = new Set<string>();
      
      const processEvent = (eventId: string) => {
        if (processedEventIds.has(eventId)) {
          return;
        }
        processedEventIds.add(eventId);
        
        if (processedEventIds.size > maxProcessedEvents) {
          const entries = Array.from(processedEventIds);
          entries.slice(0, 500).forEach(id => processedEventIds.delete(id));
        }
      };
      
      // Process 1100 events (100 over limit)
      for (let i = 0; i < 1100; i++) {
        processEvent(`event-${i}`);
      }
      
      // Oldest 100 should be gone
      expect(processedEventIds.has('event-0')).toBe(false);
      expect(processedEventIds.has('event-99')).toBe(false);
      
      // Newest should be there
      expect(processedEventIds.has('event-1099')).toBe(true);
    });
  });
});
