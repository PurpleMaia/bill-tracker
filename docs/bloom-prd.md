# Bloom — Product Requirements Document

> A calendar for your *internal* world. A soft, surreal place to chart feelings,
> tend to your baseline needs, reach for the right tool in the moment, and watch
> yourself move through seasons — because we don't always need to be blooming,
> but we do need to go through the process of it.

*Status: draft v0.1 — living document.*
*"Bloom" is a working name; easy to change.*

---

## 1. Why this exists

Therapy surfaces themes, concepts, and tools faster than any one memory can hold —
especially alongside OCD, ADHD, autism, and depression, where recall gets foggy and
emotions can be hard to name *in the moment*. Bloom is a personal instrument for:

- **Connecting body and soul** — noticing an emotion, then recording *when*, *why*,
  and *what it feels like in the body*, so feeling becomes legible instead of vague.
- **Filling in foggy memory** — a gentle record of the internal world that external
  calendars never capture.
- **Keeping in line, softly** — medication reminders, baseline care, and rituals,
  without shame.
- **Seeing growth as seasonal** — progress framed through blooming and the stages a
  flower moves through, not a productivity streak that punishes rest.

The guiding distinction throughout: this calendar is about the **internal world**
(what's happening inside) more than the **external** one (meetings, deadlines).

## 2. Who it's for

One person: the author. Private by default. Not a team product, not a clinical tool.
Any medical/therapeutic framing is a *scaffold for self-understanding*, never advice.

## 3. Design principles

1. **Soft and surreal.** Visually close to iCloud Calendar in structure, but dreamy,
   low-saturation, and tender in color — a garden at dawn seen through frosted glass.
2. **No shame mechanics.** No red streaks, no "you missed a day." Rest is part of the
   cycle. Absence is information, not failure.
3. **In-the-moment first.** The fastest possible path from "I feel something" to a
   recorded check-in. Naming is the hard part; the UI does the rest.
4. **Body is a first-class field.** Every emotion can be located somewhere physical.
5. **Metaphor as structure, not decoration.** Blooming/seasons genuinely organize how
   progress is shown.
6. **Private, portable, yours.** Data belongs to the author; export always possible.

## 4. Core concepts

- **Check-in** — the atomic entry. An emotion + context, pinned to a moment.
  Fields: emotion (core → specific, via the wheel), intensity, *what's happening / why*,
  *where it lives in the body*, life-domain tags, free note, timestamp.
- **Emotions wheel** — a radial, tappable map from broad core feelings outward to
  specific ones (in the lineage of the Feelings Wheel). The primary way to *name*.
- **Life domains** — the social/contextual axes an emotion touches: **work, friends,
  family, environment, self** (extensible). Lets you later see how your social life
  interplays with fulfillment.
- **Tending (baseline + pleasures)** — two lists: the things required for a healthy,
  hygienic, happy baseline (sleep, food, meds, movement, water, connection) and the
  things that are pleasures. Checked off gently, per day.
- **Tool sets** — a sidebar of situational toolkits you can open when you need them:
  *Coping with anxiety*, *Dopamine menu*, *Motivation / task initiation*, and more.
  The calendar is the record; the tool sets are the interventions.
- **Blooming dashboard** — progress toward chosen goals, shown as a flower/plant moving
  through stages and seasons rather than a bar. Some seasons are dormancy — by design.
- **Overlays** — ambient context layered on the calendar:
  - **Moon phases** — a glyph per day.
  - **Menstrual / hormonal overlay** — cycle-aware shading to anticipate hormonal
    drops, optionally paired with moon phases.
  - **Medication** — reminders and a taken/skipped record.

## 5. Feature map — now vs. later

### 5.1 First one-shot (this prototype) — the beating heart
**Emotions wheel + calendar**, made to feel real and beautiful, plus light gestures at
the surrounding world so the whole vision is visible.

- [x] Soft, surreal visual identity; light + dark.
- [x] Month calendar, iCloud-like, airy — click a day to see its check-ins.
- [x] **Emotions wheel** (core ring → specific ring), tappable.
- [x] **Check-in composer**: emotion → intensity → what/why → **body-map** (tap where it
      lives) → life-domain tags → note. Saves and pins to the day.
- [x] Day detail: a timeline of the day's check-ins with body + domains.
- [x] Moon-phase glyphs on calendar days.
- [x] Menstrual/cycle overlay (set last period + length → predicted window shading).
- [x] Sidebar: **tool sets** (opening a set shows its contents) + **today's tending**
      checklist (baseline + pleasures).
- [x] Small **blooming** indicator that grows with check-ins.
- [x] Local persistence (in-browser) + JSON export, so it's usable immediately.

### 5.2 Next (real app)
- [ ] Real persistence + auth (per the project's Next.js + Postgres/Kysely stack).
- [ ] Medication schedule with actual notifications/reminders.
- [ ] Goals & the full blooming dashboard (stages, seasons, dormancy) with trends.
- [ ] Insight views: emotion frequency, body heatmap, domain interplay over time,
      correlations with cycle phase and moon.
- [ ] Editable/extensible tool sets, wheel vocabulary, tags, and tending lists.
- [ ] Richer somatic capture (intensity per body region, sensation words).
- [ ] Gentle, opt-in reminders to check in.

### 5.3 Someday / open questions
- [ ] Import/sync with external calendars (kept visually separate — internal vs external).
- [ ] Journaling / longer reflective entries linked to check-ins.
- [ ] Sharing a curated slice with a therapist (explicit, revocable).
- [ ] Voice check-ins for in-the-moment capture.
- Open: which emotion vocabulary to standardize on; how clinical vs. poetic to make it;
  how much the app should ever *prompt* vs. stay quiet.

## 6. The emotions-wheel model

- **Core ring** (broad, always visible): Joyful, Loving, Peaceful, Sad, Scared, Angry,
  Surprised. Each has a soft signature hue used consistently across the whole app.
- **Specific ring** (revealed on focus): each core opens to specific feelings
  (e.g. Joyful → *content, proud, playful, hopeful, grateful*).
- Selecting any wedge seeds a check-in with that feeling; the color follows it onto the
  calendar, the day timeline, and the bloom.

## 7. Data model (prototype)

```
CheckIn {
  id: string
  ts: ISO datetime
  core: string        // core emotion
  emotion: string     // specific (or the core itself)
  intensity: 1..5
  why: string         // what's happening
  body: string[]      // body-map region ids
  domains: string[]   // work | friends | family | environment | self | ...
  note: string
}
Cycle { lastPeriodStart: date, cycleLength: number, periodLength: number }
Tending { date -> { baselineDone: string[], pleasureDone: string[] } }
```

Prototype stores this in the browser (localStorage) and can export to JSON. The real
app maps the same shapes onto the existing Kysely/Postgres layer.

## 8. Success = it gets used

Not engagement metrics — this is for one person. It's working if it lowers the effort of
naming a feeling in the moment, if it fills memory gaps the author actually cares about,
and if the blooming frame makes rest feel like part of growth instead of a lapse.

## 9. Non-goals

- Not medical advice, diagnosis, or a clinical record.
- Not a social/shared product.
- Not a task manager or external-calendar replacement.
- No dark-pattern engagement loops, no shame, no punitive streaks.
