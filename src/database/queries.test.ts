/**
 * Tests for queries.ts — verifies that all write operations use
 * parameterized db.runAsync() calls instead of string-interpolated
 * db.execAsync() calls (SQL injection fix).
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = jest.fn();
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('./db', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    runAsync: mockRunAsync,
    execAsync: mockExecAsync,
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: mockGetAllAsync,
  }),
  withDbRead: jest.fn(async (fn: any) =>
    fn({
      runAsync: mockRunAsync,
      execAsync: mockExecAsync,
      getFirstAsync: mockGetFirstAsync,
      getAllAsync: mockGetAllAsync,
    })
  ),
  withDbWrite: jest.fn(async (fn: any) =>
    fn({
      runAsync: mockRunAsync,
      execAsync: mockExecAsync,
      getFirstAsync: mockGetFirstAsync,
      getAllAsync: mockGetAllAsync,
    })
  ),
  withDbSafe: jest.fn(async (fn: any) =>
    fn({
      runAsync: mockRunAsync,
      execAsync: mockExecAsync,
      getFirstAsync: mockGetFirstAsync,
      getAllAsync: mockGetAllAsync,
    })
  ),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/documents/',
  deleteAsync: mockDeleteAsync,
}));

jest.mock('../utils/timestampParser', () => ({
  normalizeLyrics: jest.fn((lyrics: any[]) => lyrics),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import {
  insertSong,
  updateSong,
  deleteSong,
  hideSong,
  updatePlayStats,
} from './queries';
import { Song } from '../types/song';

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  id: 'song-123',
  title: "It's a Trap",           // single quote — injection probe
  artist: "O'Brien",              // single quote — injection probe
  album: 'Greatest Hits',
  gradientId: 'aurora',
  duration: 210,
  dateCreated: '2026-01-01T00:00:00.000Z',
  dateModified: '2026-01-02T00:00:00.000Z',
  playCount: 5,
  scrollSpeed: 50,
  lyricsAlign: 'left',
  textCase: 'titlecase',
  audioUri: 'file:///app/documents/music/song-123/audio.mp3',
  isLiked: false,
  coverImageUri: undefined,
  lyrics: [],
  ...overrides,
});

// ── Helpers ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

/** Returns every SQL string passed to runAsync across all calls. */
const allRunAsyncSqls = (): string[] =>
  mockRunAsync.mock.calls.map((call: any[]) => call[0] as string);

/** Returns every SQL string passed to execAsync across all calls. */
const allExecAsyncSqls = (): string[] =>
  mockExecAsync.mock.calls.map((call: any[]) => call[0] as string);

// ── insertSong ─────────────────────────────────────────────────────────────

describe('insertSong', () => {
  it('uses runAsync (parameterized) for the songs INSERT', async () => {
    await insertSong(makeSong());
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('INSERT OR REPLACE INTO songs'))).toBe(true);
  });

  it('does NOT interpolate song values into the SQL string', async () => {
    const song = makeSong({ title: "Injection'); DROP TABLE songs;--" });
    await insertSong(song);
    const sqls = allRunAsyncSqls();
    const insertSql = sqls.find(s => s.includes('INSERT OR REPLACE INTO songs'))!;
    // The malicious payload must NOT appear in the SQL string itself
    expect(insertSql).not.toContain('DROP TABLE');
    expect(insertSql).not.toContain("Injection'");
  });

  it('passes song.title as a bound parameter, not inline', async () => {
    const song = makeSong({ title: "It's Complicated" });
    await insertSong(song);
    const insertCall = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('INSERT OR REPLACE INTO songs')
    );
    expect(insertCall).toBeDefined();
    const params: any[] = insertCall![1];
    expect(params).toContain("It's Complicated");
  });

  it('passes null for optional fields instead of interpolating NULL', async () => {
    const song = makeSong({ artist: undefined, album: undefined, coverImageUri: undefined });
    await insertSong(song);
    const insertCall = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('INSERT OR REPLACE INTO songs')
    );
    const params: any[] = insertCall![1];
    expect(params).toContain(null);
  });

  it('never calls execAsync for the songs INSERT', async () => {
    await insertSong(makeSong());
    const execSqls = allExecAsyncSqls();
    expect(execSqls.some(s => s.includes('INSERT OR REPLACE INTO songs'))).toBe(false);
  });

  it('uses runAsync for each lyric row INSERT', async () => {
    const song = makeSong({
      lyrics: [
        { timestamp: 1.5, text: "Line one", lineOrder: 0 },
        { timestamp: 3.0, text: "Don't stop", lineOrder: 1 },
      ],
    });
    await insertSong(song);
    const lyricInserts = mockRunAsync.mock.calls.filter((call: any[]) =>
      (call[0] as string).includes('INSERT INTO lyrics')
    );
    expect(lyricInserts.length).toBe(2);
  });
});

// ── updateSong ─────────────────────────────────────────────────────────────

describe('updateSong', () => {
  it('uses runAsync (parameterized) for the UPDATE songs statement', async () => {
    await updateSong(makeSong());
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('UPDATE songs SET'))).toBe(true);
  });

  it('does NOT interpolate title into the UPDATE SQL string', async () => {
    const song = makeSong({ title: "'; DROP TABLE songs;--" });
    await updateSong(song);
    const updateSql = allRunAsyncSqls().find(s => s.includes('UPDATE songs SET'))!;
    expect(updateSql).not.toContain('DROP TABLE');
  });

  it('passes song.id as the last bound parameter (WHERE clause)', async () => {
    const song = makeSong({ id: 'abc-999' });
    await updateSong(song);
    const updateCall = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('UPDATE songs SET')
    );
    const params: any[] = updateCall![1];
    expect(params[params.length - 1]).toBe('abc-999');
  });

  it('uses runAsync for DELETE lyrics and INSERT lyrics when lyrics provided', async () => {
    const song = makeSong({
      lyrics: [{ timestamp: 0, text: 'Hello', lineOrder: 0 }],
    });
    await updateSong(song);
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('DELETE FROM lyrics'))).toBe(true);
    expect(sqls.some(s => s.includes('INSERT INTO lyrics'))).toBe(true);
  });

  it('never calls execAsync for song UPDATE or lyrics operations', async () => {
    const song = makeSong({
      lyrics: [{ timestamp: 0, text: 'Line', lineOrder: 0 }],
    });
    await updateSong(song);
    expect(allExecAsyncSqls()).toHaveLength(0);
  });
});

// ── deleteSong ─────────────────────────────────────────────────────────────

describe('deleteSong', () => {
  beforeEach(() => {
    // getSongById calls getFirstAsync + getAllAsync internally
    mockGetFirstAsync.mockResolvedValue(null); // song not found → skip file deletion
  });

  it('uses runAsync (parameterized) for DELETE FROM lyrics', async () => {
    await deleteSong('song-123');
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('DELETE FROM lyrics'))).toBe(true);
  });

  it('uses runAsync (parameterized) for DELETE FROM songs', async () => {
    await deleteSong('song-123');
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('DELETE FROM songs'))).toBe(true);
  });

  it('passes the id as a bound parameter, not inline in SQL', async () => {
    const maliciousId = "'; DROP TABLE songs;--";
    await deleteSong(maliciousId);
    const lyricsDelete = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('DELETE FROM lyrics')
    );
    const songsDelete = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('DELETE FROM songs')
    );
    expect(lyricsDelete![0]).not.toContain('DROP TABLE');
    expect(songsDelete![0]).not.toContain('DROP TABLE');
    expect(lyricsDelete![1]).toContain(maliciousId);
    expect(songsDelete![1]).toContain(maliciousId);
  });
});

// ── hideSong ───────────────────────────────────────────────────────────────

describe('hideSong', () => {
  it('uses runAsync (parameterized) for the UPDATE', async () => {
    await hideSong('song-123', true);
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('UPDATE songs SET is_hidden'))).toBe(true);
  });

  it('does NOT interpolate the id into the SQL string', async () => {
    const maliciousId = "'; UPDATE songs SET is_hidden=0 WHERE '1'='1";
    await hideSong(maliciousId, true);
    const sql = allRunAsyncSqls().find(s => s.includes('UPDATE songs SET is_hidden'))!;
    expect(sql).not.toContain('UPDATE songs SET is_hidden=0');
  });

  it('passes hide=true as 1 and hide=false as 0', async () => {
    await hideSong('song-1', true);
    const hideCall = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('is_hidden')
    );
    expect(hideCall![1][0]).toBe(1);

    jest.clearAllMocks();
    await hideSong('song-1', false);
    const unhideCall = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('is_hidden')
    );
    expect(unhideCall![1][0]).toBe(0);
  });
});

// ── updatePlayStats ────────────────────────────────────────────────────────

describe('updatePlayStats', () => {
  it('uses runAsync (parameterized) for the play_count UPDATE', async () => {
    await updatePlayStats('song-123');
    const sqls = allRunAsyncSqls();
    expect(sqls.some(s => s.includes('play_count = play_count + 1'))).toBe(true);
  });

  it('does NOT interpolate the id or timestamp into the SQL string', async () => {
    const maliciousId = "'; DELETE FROM songs WHERE '1'='1";
    await updatePlayStats(maliciousId);
    const sql = allRunAsyncSqls().find(s => s.includes('play_count'))!;
    expect(sql).not.toContain('DELETE FROM songs');
    expect(sql).not.toContain(maliciousId);
  });

  it('passes both last_played ISO string and id as bound parameters', async () => {
    await updatePlayStats('song-xyz');
    const call = mockRunAsync.mock.calls.find((call: any[]) =>
      (call[0] as string).includes('play_count')
    );
    const params: any[] = call![1];
    // params[0] = ISO date string, params[1] = id
    expect(typeof params[0]).toBe('string');
    expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    expect(params[1]).toBe('song-xyz');
  });
});
