import { describe, it, expect } from 'vitest';
import {
  buildGovernorBaseScript,
  buildGovernorCallScript,
  getGovernorStage,
  isGovernorStatus,
  parseIntroducers,
  GOVERNOR_GREETING,
} from '../legislators/governor-contact';
import { NAME_PLACEHOLDER } from '../legislators/contact-script';

const u = (statustext: string) => ({ statustext });

describe('isGovernorStatus', () => {
  it('is true only at the governor-phase statuses', () => {
    expect(isGovernorStatus('transmittedGovernor')).toBe(true);
    expect(isGovernorStatus('vetoList')).toBe(true);
    expect(isGovernorStatus('governorSigns')).toBe(false);
    expect(isGovernorStatus('conferencePassed')).toBe(false);
    expect(isGovernorStatus(null)).toBe(false);
  });
});

describe('getGovernorStage', () => {
  it('is null outside the governor phase', () => {
    expect(getGovernorStage('conferencePassed', [])).toBeNull();
    expect(getGovernorStage('governorSigns', [u('Vetoed (Gov. Msg. No. 1).')])).toBeNull();
    expect(getGovernorStage(undefined, undefined)).toBeNull();
  });

  it('reads transmitted bills as awaiting the Governor', () => {
    expect(getGovernorStage('transmittedGovernor', [u('Enrolled to Governor.')])).toBe('awaitingGovernor');
  });

  it('tells the intent-to-veto list apart from a final veto by status history', () => {
    const intent = [u('Enrolled to Governor.'), u('Notice of intent to veto (Gov. Msg. No. 1264)')];
    expect(getGovernorStage('vetoList', intent)).toBe('intentToVeto');
    expect(getGovernorStage('vetoList', [...intent, u('Vetoed (Gov. Msg. No. 1369).')])).toBe('vetoed');
    expect(
      getGovernorStage('vetoList', [u('Vetoed on 07/15/2026 - Returned from the Governor without approval (Gov. Msg. No. 1369).')]),
    ).toBe('vetoed');
    // No history loaded yet → assume the Governor can still relent.
    expect(getGovernorStage('vetoList', undefined)).toBe('intentToVeto');
  });
});

describe('buildGovernorBaseScript', () => {
  it('asks the Governor to sign a transmitted bill', () => {
    const s = buildGovernorBaseScript({ billNumber: 'HB1', billTitle: 'Relating to Food', intentToVeto: false });
    expect(s.subject).toBe('Please sign HB1 into law');
    expect(s.body.split('\n')[0]).toBe(GOVERNOR_GREETING);
    expect(s.body).toContain('urge you to sign HB1, Relating to Food, into law');
    expect(s.body).toContain(NAME_PLACEHOLDER);
  });

  it('asks the Governor to reconsider a bill on the intent-to-veto list', () => {
    const s = buildGovernorBaseScript({ billNumber: 'SB2', billTitle: null, intentToVeto: true, userName: 'Kai' });
    expect(s.subject).toBe('Please reconsider your intent to veto SB2');
    expect(s.body).toContain('reconsider your intent to veto SB2 and');
    expect(s.body).not.toContain('null');
    expect(s.body.endsWith('Kai')).toBe(true);
  });

  it('drops the trailing period from a Capitol title so it reads mid-sentence', () => {
    const s = buildGovernorBaseScript({ billNumber: 'HB1', billTitle: 'RELATING TO FOOD.', intentToVeto: false });
    expect(s.body).toContain('sign HB1, RELATING TO FOOD, into law');
  });
});

describe('buildGovernorCallScript', () => {
  it('words the ask by stage', () => {
    expect(buildGovernorCallScript({ billNumber: 'HB1', billTitle: 'RELATING TO FOOD.', intentToVeto: false }))
      .toContain('ask the Governor to sign HB1, RELATING TO FOOD into law');
    expect(buildGovernorCallScript({ billNumber: 'HB1', billTitle: null, intentToVeto: true }))
      .toContain('reconsider the intent to veto HB1');
  });
});

describe('parseIntroducers', () => {
  it('places introducers in the originating chamber', () => {
    expect(parseIntroducers('KIM, CHANG, Wakai', 'SB3262')).toEqual([
      { surname: 'KIM', chamber: 'Senate', isChair: false },
      { surname: 'CHANG', chamber: 'Senate', isChair: false },
      { surname: 'Wakai', chamber: 'Senate', isChair: false },
    ]);
    expect(parseIntroducers('WOODSON', 'HB1')[0].chamber).toBe('House');
  });

  it('re-attaches initials and drops parenthetical notes', () => {
    expect(parseIntroducers('HASHIMOTO, LEE, C., MCKELVEY', 'SB1').map((p) => p.surname))
      .toEqual(['HASHIMOTO', 'LEE, C.', 'MCKELVEY']);
    expect(parseIntroducers('KOUCHI (Introduced by request of another party)', 'SB1').map((p) => p.surname))
      .toEqual(['KOUCHI']);
  });

  it('is empty for a missing introducer', () => {
    expect(parseIntroducers('', 'SB1')).toEqual([]);
    expect(parseIntroducers(null, 'SB1')).toEqual([]);
  });
});
