/**
 * "How this works" spotlight tours for the two action flows — Write Testimony
 * and Contact Legislator. Pure data; the spotlight UI lives in
 * components/tour/flow-walkthrough.tsx.
 *
 * A tour opens on a centered card that states the flow's limitation (`caveat`)
 * — the Hawaiʻi Bill Tracker never submits or sends anything on the user's
 * behalf — so it's read even by someone who skips the rest. Testimony leads
 * with it; the contact tours put it under the goal. It then
 * spotlights each part of the page and says what it does, and closes on what
 * to expect next.
 */

import { committeePhrase } from '@/lib/legislators/contact-script';

/** localStorage flags — each tour auto-starts once per flow. Bump to re-show. */
export const TESTIMONY_WALKTHROUGH_KEY = 'billtracker:walkthrough-testimony-v1';
export const CONTACT_WALKTHROUGH_KEY = 'billtracker:walkthrough-contact-v1';

/**
 * Page elements a tour step can spotlight, marked with data-flow-tour="<target>".
 * A step whose target isn't on screen (e.g. the desktop-only sidebar) is skipped.
 */
export type FlowTourTarget =
  | 'stepper'
  | 'details'
  | 'editor'
  | 'versions'
  | 'reference'
  | 'next'
  | 'goal'
  | 'email'
  | 'call'
  | 'contacts'
  | 'committee'
  | 'other-committees'
  | 'help';

export interface WalkthroughStep {
  target: FlowTourTarget;
  title: string;
  body: string;
}

export interface Walkthrough {
  title: string;
  /** The limitation the user must not miss — always on the tour's first card. */
  caveat: { title: string; body: string };
  /** Put the caveat above the title rather than below the goal (and emphasis). */
  caveatFirst?: boolean;
  /** What the flow is for, in one or two sentences. */
  goal: string;
  /** The one line the reader should take away, shown highlighted under the goal. */
  emphasis?: string;
  steps: WalkthroughStep[];
  /** What to expect after finishing the flow. */
  next: string;
}

const APP = 'Hawaiʻi Bill Tracker';

const HELP_STEP: WalkthroughStep = {
  target: 'help',
  title: 'See this again anytime',
  body: 'Press How this works (the ? button) to replay this tour.',
};

export function testimonyWalkthrough({ billNumber }: { billNumber: string }): Walkthrough {
  return {
    title: 'How writing testimony works',
    caveatFirst: true,
    caveat: {
      title: `The ${APP} cannot submit testimony for you`,
      body: 'Nothing you write here reaches the Legislature until you submit it yourself on capitol.hawaii.gov, at least 24 hours before the hearing. The capitol site only accepts testimony once a committee has scheduled a hearing on the bill.',
    },
    goal: `Testimony is your written opinion on ${billNumber}. The committee reads it before it votes. This page helps you write it and download it, ready to submit.`,
    steps: [
      {
        target: 'stepper',
        title: 'Three steps',
        body: 'Write, Review, then Submit on Capitol site. The last step shows you how to submit on capitol.hawaii.gov. You do the submitting there.',
      },
      {
        target: 'details',
        title: 'Who it’s from',
        body: 'Your name, your organization (optional), and whether you support, oppose, or are commenting. These print at the top of the testimony.',
      },
      {
        target: 'editor',
        title: 'Your testimony',
        body: `Write why ${billNumber} matters to you. Your draft saves as you type, so you can come back to it later.`,
      },
      {
        target: 'versions',
        title: 'A version for each hearing',
        body: `${billNumber} may be heard by more than one committee, in the House and then the Senate, and each hearing takes its own testimony. When it reaches a new hearing, a menu next to the bill number lets you start a new version (copied from your last one) and switch between them.`,
      },
      {
        target: 'reference',
        title: 'Bill info',
        body: `${billNumber}'s summary, status, and hearing date, for reference while you write.`,
      },
      {
        target: 'next',
        title: 'Review and download',
        body: 'Opens once you’ve written something. On Review you download a PDF or DOCX (or copy the text). That file is what you submit on capitol.hawaii.gov.',
      },
      HELP_STEP,
    ],
    next: `After you submit on capitol.hawaii.gov, come back and press "I submitted it on the Capitol site" so ${billNumber} shows as done in Testimonies. That's only a note for you. It doesn't send anything.`,
  };
}

/** Why one more email matters — highlighted on the hearing-request page and its tour. */
export const REQUESTS_MATTER = 'The more requests a legislator gets, the more likely the bill gets heard.';

/** Which ask the contact page is making — mirrors the page's own stage branches. */
export type ContactStage = 'hearing' | 'conference' | 'governor' | 'intentToVeto' | 'override';

const CONTACT_REFERENCE_STEP: WalkthroughStep = {
  target: 'reference',
  title: 'Bill info',
  body: "The bill's summary, introducers, committees, and status updates, for reference while you write your message.",
};

const SEND_BUTTONS =
  'Email opens your own email app with the message filled in, and Gmail opens it in Gmail. Either way, you press Send there. The copy button copies the message instead.';

function emailScriptStep(extra = ''): WalkthroughStep {
  return {
    target: 'email',
    title: 'Your message',
    body: `The Email script tab holds one message for everyone on the list. Replace <your-name> and add a sentence about why the bill matters to you. A personal line carries more weight than a form letter.${extra}`,
  };
}

const CALL_STEP: WalkthroughStep = {
  target: 'call',
  title: 'Call script',
  body: 'Prefer the phone? Switch to this tab for what to say to the office. Staff note your request.',
};

/** Shared steps for the flows that send email to one list of legislators. */
function emailSteps(): WalkthroughStep[] {
  return [
    emailScriptStep(),
    { target: 'contacts', title: 'Who to send it to', body: SEND_BUTTONS },
    CALL_STEP,
  ];
}

const EMAIL_CAVEAT = {
  title: `The ${APP} does not send anything for you`,
  body: 'The Email button only opens your own email app. The message goes out from your address when you press Send. Offices tally requests, so you may not get a personal reply, but every message counts.',
};

export function contactWalkthrough({
  stage,
  billNumber,
  committeeName,
}: {
  stage: ContactStage;
  billNumber: string;
  /** The committee the bill is waiting on (hearing stage only). */
  committeeName?: string;
}): Walkthrough {
  switch (stage) {
    case 'hearing': {
      const committee = committeePhrase(committeeName);
      return {
        title: 'How requesting a hearing works',
        caveat: EMAIL_CAVEAT,
        goal: `The goal is to get legislators to act. Here that means asking the chair of ${committee} to schedule a hearing for ${billNumber}, or to meet with you about it. A bill that never gets a hearing can't move forward this session.`,
        emphasis: REQUESTS_MATTER,
        steps: [
          {
            target: 'goal',
            title: 'What you’re asking for',
            body: `${billNumber} is waiting on ${committee}. Its chair and vice-chair decide whether it gets a hearing.`,
          },
          CONTACT_REFERENCE_STEP,
          emailScriptStep(' You can also ask to meet with the chair or their staff.'),
          {
            target: 'committee',
            title: 'The committee it’s waiting on',
            body: `The top committee, marked Awaiting hearing, is the one holding ${billNumber} now, so its chair and vice-chair are who to contact. If two are marked, they're hearing it jointly, so contact both. ${SEND_BUTTONS}`,
          },
          {
            target: 'other-committees',
            title: 'The bill’s other committees',
            body: `${billNumber} goes through its committees in order. These are the others on its path. Contact them only after the bill has moved on to them.`,
          },
          CALL_STEP,
          HELP_STEP,
        ],
        next: `If the chair schedules a hearing, it shows up on ${billNumber} here. That's your cue to write testimony. Chairs decide their own agenda, so there is no guarantee, but adding your voice raises the odds.`,
      };
    }
    case 'conference':
      return {
        title: 'How contacting conferees works',
        caveat: EMAIL_CAVEAT,
        goal: `The goal is to get legislators to act. ${billNumber} passed both chambers in different versions, so the conferees must meet and agree on one final version before the conference deadline, or the bill stalls for the session.`,
        steps: [
          {
            target: 'goal',
            title: 'What you’re asking for',
            body: `The conferees are the House and Senate members appointed to settle ${billNumber}'s final version.`,
          },
          CONTACT_REFERENCE_STEP,
          ...emailSteps(),
          HELP_STEP,
        ],
        next: `If the conferees agree, ${billNumber} goes back to both chambers for a final vote, then to the Governor. The new status shows on the bill here.`,
      };
    case 'governor':
    case 'intentToVeto': {
      const veto = stage === 'intentToVeto';
      return {
        title: veto ? 'How asking the Governor to reconsider works' : 'How asking the Governor to sign works',
        caveat: {
          title: `The ${APP} does not send anything for you`,
          body: 'Your message only reaches the Governor once you paste it into their form and submit it there yourself.',
        },
        goal: veto
          ? `The goal is to get the Governor to act. The Governor plans to veto ${billNumber}, and your message asks them to reconsider and let it become law.`
          : `The goal is to get the Governor to act. ${billNumber} passed the Legislature, and your message asks the Governor to sign it.`,
        steps: [
          {
            target: 'goal',
            title: 'What you’re asking for',
            body: `Legislators have finished their work on ${billNumber}, so the Governor is the one to contact now.`,
          },
          CONTACT_REFERENCE_STEP,
          {
            target: 'email',
            title: 'Your message',
            body: 'The Message script tab holds your message. Replace <your-name> and add a sentence about why the bill matters to you, then copy the subject and message from here.',
          },
          {
            target: 'contacts',
            title: "The Governor's forms",
            body: 'The Governor has no public email. Open a form, paste in the subject and message, and submit the form there.',
          },
          {
            target: 'call',
            title: 'Call script',
            body: "Prefer the phone? Switch to this tab for what to say to the Governor's office.",
          },
          HELP_STEP,
        ],
        next: `When the Governor signs or vetoes ${billNumber}, the new status shows on the bill here. The Governor's office tallies messages by position, so short and clear is best.`,
      };
    }
    case 'override':
      return {
        title: 'How urging a veto override works',
        caveat: EMAIL_CAVEAT,
        goal: `The goal is to get legislators to act. The Governor vetoed ${billNumber}, and the Legislature can still override the veto with a two-thirds vote in each chamber. Your message asks them to hold that vote and vote yes.`,
        steps: [
          {
            target: 'goal',
            title: 'What you’re asking for',
            body: `${billNumber}'s introducers are most likely to lead an override. Use the member directory link here to find your own House and Senate members, and send them the same message.`,
          },
          CONTACT_REFERENCE_STEP,
          ...emailSteps(),
          HELP_STEP,
        ],
        next: 'Override votes are rare and happen in a short window, so contact them soon.',
      };
  }
}
