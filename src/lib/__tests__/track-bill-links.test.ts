import { describe, it, expect } from 'vitest';
import { columnTrackSearchHref, SEARCH_TRACK_HREF } from '../bills/track-bill-links';
import { KANBAN_COLUMNS, SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED } from '../bills/kanban-columns';

describe('SEARCH_TRACK_HREF', () => {
  it('points at the search page', () => {
    expect(SEARCH_TRACK_HREF).toBe('/search');
  });
});

describe('columnTrackSearchHref', () => {
  it('maps a detailed column to its simplified stage and scopes to untracked', () => {
    // scheduled1 -> simpleScheduled
    expect(columnTrackSearchHref('scheduled1')).toBe(
      '/search?stages=simpleScheduled&tracked=untracked',
    );
  });

  it('maps a crossover column to its simplified stage', () => {
    // crossoverWaiting2 -> simpleCrossoverWaiting
    expect(columnTrackSearchHref('crossoverWaiting2')).toBe(
      '/search?stages=simpleCrossoverWaiting&tracked=untracked',
    );
  });

  it('passes a simplified column id through unchanged', () => {
    expect(columnTrackSearchHref('simpleWaiting')).toBe(
      '/search?stages=simpleWaiting&tracked=untracked',
    );
  });

  it('passes a conference/governor column (1:1 mapping) through', () => {
    expect(columnTrackSearchHref('transmittedGovernor')).toBe(
      '/search?stages=transmittedGovernor&tracked=untracked',
    );
  });

  it('produces a valid, parseable stage for every detailed board column', () => {
    // Every column the board can render must resolve to a stage the search rail
    // knows (a SIMPLIFIED_COLUMNS id), so the link is never a dead filter.
    const knownStages = new Set(SIMPLIFIED_COLUMNS.map((c) => c.id));
    for (const col of KANBAN_COLUMNS) {
      const href = columnTrackSearchHref(col.id);
      const stage = new URL(href, 'https://x').searchParams.get('stages');
      expect(stage, `column ${col.id}`).not.toBeNull();
      expect(knownStages.has(stage!), `column ${col.id} -> ${stage}`).toBe(true);
    }
  });

  it('falls back to the bare search page for an unknown column id', () => {
    expect(columnTrackSearchHref('nonsense')).toBe('/search?tracked=untracked');
  });

  it('never emits a stage absent from STATUS_TO_SIMPLIFIED for a known status', () => {
    // Guards the option-a contract: a detailed status maps through the same
    // table the board and DB query use.
    expect(columnTrackSearchHref('waiting2')).toBe(
      `/search?stages=${STATUS_TO_SIMPLIFIED['waiting2']}&tracked=untracked`,
    );
  });
});
