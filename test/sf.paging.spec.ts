/**
 * Tests for Salesforce paging functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Connection } from 'jsforce';
import { fetchPendingTasksPaged } from '../src/sf.js';
import type { STask } from '../src/sf.js';

// Setup env
process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
process.env.SF_USERNAME = 'test@example.com';
process.env.SF_PASSWORD = 'password';
process.env.SF_TOKEN = 'token';
process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
process.env.GLASSIX_API_KEY = 'test-key';

describe('Salesforce Paging', () => {
  let mockConn: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch single page when all records fit', async () => {
    const mockTasks: STask[] = [
      { Id: 'task-1', Status: 'Not Started', Subject: 'Test 1' },
      { Id: 'task-2', Status: 'Not Started', Subject: 'Test 2' },
    ];

    mockConn = {
      query: vi.fn().mockResolvedValue({
        records: mockTasks,
        done: true,
        totalSize: 2,
      }),
      queryMore: vi.fn(),
    };

    const pages: STask[][] = [];
    for await (const page of fetchPendingTasksPaged(mockConn as Connection, 200)) {
      pages.push(page);
    }

    expect(pages.length).toBe(1);
    expect(pages[0].length).toBe(2);
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.queryMore).not.toHaveBeenCalled();
  });

  it('should fetch multiple pages when records exceed page size', async () => {
    const page1Tasks: STask[] = [
      { Id: 'task-1', Status: 'Not Started', Subject: 'Test 1' },
      { Id: 'task-2', Status: 'Not Started', Subject: 'Test 2' },
    ];

    const page2Tasks: STask[] = [
      { Id: 'task-3', Status: 'Not Started', Subject: 'Test 3' },
      { Id: 'task-4', Status: 'Not Started', Subject: 'Test 4' },
    ];

    mockConn = {
      query: vi.fn().mockResolvedValue({
        records: page1Tasks,
        done: false,
        nextRecordsUrl: '/query/next-page-1',
        totalSize: 4,
      }),
      queryMore: vi.fn().mockResolvedValue({
        records: page2Tasks,
        done: true,
        totalSize: 4,
      }),
    };

    const pages: STask[][] = [];
    let totalRecords = 0;
    
    for await (const page of fetchPendingTasksPaged(mockConn as Connection, 2)) {
      pages.push(page);
      totalRecords += page.length;
    }

    expect(pages.length).toBe(2);
    expect(pages[0].length).toBe(2);
    expect(pages[1].length).toBe(2);
    expect(totalRecords).toBe(4);
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.queryMore).toHaveBeenCalledTimes(1);
    expect(mockConn.queryMore).toHaveBeenCalledWith('/query/next-page-1');
  });

  it('should handle three pages correctly', async () => {
    const page1: STask[] = [{ Id: 'task-1', Status: 'Not Started', Subject: 'T1' }];
    const page2: STask[] = [{ Id: 'task-2', Status: 'Not Started', Subject: 'T2' }];
    const page3: STask[] = [{ Id: 'task-3', Status: 'Not Started', Subject: 'T3' }];

    mockConn = {
      query: vi.fn().mockResolvedValue({
        records: page1,
        done: false,
        nextRecordsUrl: '/query/page-2',
      }),
      queryMore: vi
        .fn()
        .mockResolvedValueOnce({
          records: page2,
          done: false,
          nextRecordsUrl: '/query/page-3',
        })
        .mockResolvedValueOnce({
          records: page3,
          done: true,
        }),
    };

    const pages: STask[][] = [];
    for await (const page of fetchPendingTasksPaged(mockConn as Connection, 1)) {
      pages.push(page);
    }

    expect(pages.length).toBe(3);
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.queryMore).toHaveBeenCalledTimes(2);
  });

  it('should handle empty result set', async () => {
    mockConn = {
      query: vi.fn().mockResolvedValue({
        records: [],
        done: true,
        totalSize: 0,
      }),
      queryMore: vi.fn(),
    };

    const pages: STask[][] = [];
    for await (const page of fetchPendingTasksPaged(mockConn as Connection, 200)) {
      pages.push(page);
    }

    expect(pages.length).toBe(1);
    expect(pages[0].length).toBe(0);
    expect(mockConn.queryMore).not.toHaveBeenCalled();
  });
});


