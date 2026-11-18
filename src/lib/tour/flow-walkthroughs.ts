/**
 * "How this works" walkthroughs for the two action flows — Write Testimony and
 * Contact Legislator. Pure data: each walkthrough is a worked example built from
 * the real bill, so the reader sees their own bill number and committee rather
 * than abstract instructions. The dialog lives in components/tour/flow-walkthrough.tsx.
 *
 * Every walkthrough states the flow's limitation plainly (`caveat`): the Hawaiʻi Bill Tracker never
 * submits or sends anything on the user's behalf.
 */

/** localStorage flags — the walkthrough auto-opens once per flow. Bump to re-show. */
export const TESTIMONY_WALKTHROUGH_KEY = 'billtracker:walkthrough-testimony-v1';
export const CONTACT_WALKTHROUGH_KEY = 'billtracker:walkthrough-contact-v1';

export interface WalkthroughStep {
  title: string;
  body: string;
}

export interface Walkthrough {
  title: string;
  /** What the flow is for, in one or two sentences. */
  goal: string;
  /** The one line the reader should take away, shown highlighted under the goal. */
  emphasis?: string;
  /** Sets up the worked example the steps follow. */
  example: string;
  steps: WalkthroughStep[];
  /** The limitation the user must not miss. */
  caveat: { title: string; body: string };
  /** What to expect after finishing the flow. */
  next: string;
}

/** The person the worked examples follow. */
const PERSON = 'Kai';

export function testimonyWalkthrough({ billNumber }: { billNumber: string }): Walkthrough {
  return {
    title: 'How writing testimony works',
    goal: 'Testimony is your written opinion on a bill. The committee reads it before it votes. The Hawaiʻi Bill Tracker helps you write it and get it ready. Submitting it is up to you.',
    example: `Example: ${PERSON} supports ${billNumber} and wants the committee to pass it.`,
    steps: [
      {
        title: 'Write it here',
        body: `${PERSON} picks Support and writes a few paragraphs on why ${billNumber} matters to their community. The Hawaiʻi Bill Tracker saves the draft as they type.`,
      },
      {
        title: 'Download or copy it',
        body: `On the Review step, ${PERSON} downloads the testimony as a PDF (or copies the text).`,
      },
      {
        title: 'Submit it yourself on capitol.hawaii.gov',
        body: `${PERSON} logs in to the Legislature's website, finds the hearing for ${billNumber}, and uploads the PDF. This is the only step that actually delivers testimony. Do it at least 24 hours before the hearing.`,
      },
      {
        title: 'Mark it submitted here',
        body: `Back in the Hawaiʻi Bill Tracker, ${PERSON} presses "I submitted it on the Capitol site" so ${billNumber} shows as done in Testimonies. This is only a note for ${PERSON}. It doesn't send anything.`,
      },
    ],
    caveat: {
      title: 'The Hawaiʻi Bill Tracker cannot submit testimony for you',
      body: 'Nothing you write here reaches the Legislature until you submit it yourself on capitol.hawaii.gov. The capitol site only accepts testimony once a committee has scheduled a hearing on the bill.',
    },
    next: 'Your testimony goes on the public record for that hearing, and the committee considers it before voting. You can sign up to testify in person or online on the same capitol form.',
  };
}

/** Why one more email matters — highlighted on the hearing-request page and its walkthrough. */
export const REQUESTS_MATTER = 'The more requests a legislator gets, the more likely the bill gets heard.';

/** Which ask the contact page is making — mirrors the page's own stage branches. */
export type ContactStage = 'hearing' | 'conference' | 'governor' | 'intentToVeto' | 'override';

/** Shared "the message comes from you" steps for the flows that send email. */
function emailSteps(billNumber: string, recipients: string): WalkthroughStep[] {
  return [
    {
      title: 'Make the message yours',
      body: `${PERSON} replaces <your-name> and adds a sentence about why ${billNumber} matters to them. A personal line carries more weight than a form letter.`,
    },
    {
      title: 'Send it from your own email, or call',
      body: `${PERSON} presses Email next to each of the ${recipients}. Their own email app opens with the message filled in, and ${PERSON} presses Send there. Prefer the phone? The call script says what to tell the office.`,
    },
  ];
}

const EMAIL_CAVEAT = {
  title: 'The Hawaiʻi Bill Tracker does not send anything for you',
  body: "The Email button only opens your own email app. The message goes out from your address when you press Send. Offices tally requests, so you may not get a personal reply, but every message counts.",
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
      const committee = committeeName ? `the ${committeeName}` : 'the committee';
      return {
        title: 'How requesting a hearing works',
        goal: `The goal is to get legislators to act. Here that means asking the chair of ${committee} to schedule a hearing for ${billNumber}, or to meet with you about it. A bill that never gets a hearing can't move forward this session.`,
        emphasis: REQUESTS_MATTER,
        example: `Example: ${PERSON} wants ${billNumber} to get a hearing.`,
        steps: [
          ...emailSteps(billNumber, 'chair and vice-chair'),
          {
            title: 'Ask for a meeting, too (optional)',
            body: `${PERSON} adds a line asking to meet with the chair or their staff to talk about the bill. Offices often say yes to constituents.`,
          },
          {
            title: 'Watch for a hearing notice',
            body: `If the chair schedules a hearing, it shows up on ${billNumber} in the Hawaiʻi Bill Tracker. That's ${PERSON}'s cue to write testimony.`,
          },
        ],
        caveat: EMAIL_CAVEAT,
        next: 'Chairs decide what goes on their agenda, so there is no guarantee of a hearing. Adding your voice still raises the odds.',
      };
    }
    case 'conference':
      return {
        title: 'How contacting conferees works',
        goal: `The goal is to get legislators to act. ${billNumber} passed both chambers in different versions, so the conferees must meet and agree on one final version before the conference deadline, or the bill stalls for the session.`,
        example: `Example: ${PERSON} wants ${billNumber} to survive conference.`,
        steps: [
          ...emailSteps(billNumber, 'conferees'),
          {
            title: 'Watch for a final vote',
            body: `If the conferees agree, ${billNumber} goes back to both chambers for a final vote, then to the Governor. The Hawaiʻi Bill Tracker shows the new status on the bill.`,
          },
        ],
        caveat: EMAIL_CAVEAT,
        next: 'Conferees hear from many people during conference. A short, clear message that names the bill is the most useful.',
      };
    case 'governor':
    case 'intentToVeto': {
      const veto = stage === 'intentToVeto';
      return {
        title: veto ? 'How asking the Governor to reconsider works' : 'How asking the Governor to sign works',
        goal: veto
          ? `The goal is to get the Governor to act. The Governor plans to veto ${billNumber}, and your message asks them to reconsider and let it become law.`
          : `The goal is to get the Governor to act. ${billNumber} passed the Legislature, and your message asks the Governor to sign it.`,
        example: veto
          ? `Example: ${PERSON} wants the Governor to reconsider vetoing ${billNumber}.`
          : `Example: ${PERSON} wants the Governor to sign ${billNumber}.`,
        steps: [
          {
            title: 'Make the message yours',
            body: `${PERSON} replaces <your-name> and adds a sentence about why ${billNumber} matters to them.`,
          },
          {
            title: "Paste it into the Governor's form, or call",
            body: `The Governor has no public email. ${PERSON} copies the subject and message, opens one of the Governor's web forms, pastes them in, and submits the form there. Or ${PERSON} calls the office with the call script.`,
          },
          {
            title: 'Watch for the decision',
            body: `When the Governor signs or vetoes ${billNumber}, The Hawaiʻi Bill Tracker shows the new status on the bill.`,
          },
        ],
        caveat: {
          title: 'The Hawaiʻi Bill Tracker does not send anything for you',
          body: "Your message only reaches the Governor once you paste it into their form and submit it there yourself.",
        },
        next: "The Governor's office tallies messages by position. Short and clear is best.",
      };
    }
    case 'override':
      return {
        title: 'How urging a veto override works',
        goal: `The goal is to get legislators to act. The Governor vetoed ${billNumber}, and the Legislature can still override the veto with a two-thirds vote in each chamber. Your message asks them to hold that vote and vote yes.`,
        example: `Example: ${PERSON} wants the Legislature to override the veto of ${billNumber}.`,
        steps: [
          ...emailSteps(billNumber, "bill's introducers"),
          {
            title: 'Contact your own legislators',
            body: `${PERSON} finds their own House and Senate members in the Capitol member directory and sends them the same message.`,
          },
        ],
        caveat: EMAIL_CAVEAT,
        next: 'Override votes are rare and happen in a short window, so contact them soon.',
      };
  }
}
