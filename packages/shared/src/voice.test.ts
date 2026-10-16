// Tests for the voice tells. Positive examples are real model-written curator notes (the 2026
// static site's placeholder notes, the contrast set in docs/VOICE.md). Negative examples are the
// editor's own published sentences from the Dumpster Fire on Substack (2022-2025): the tells must
// not fire on what he actually writes, so the list never bans his real habits.

import { describe, expect, it } from 'vitest';
import { aiTells, describeVoiceFindings, dictationGarbles, dictionaryHints, editorVoice, voiceCheck } from './voice';
import { checkStyle } from './style';

const ids = (t: string, machine = true) => voiceCheck(t, { machine }).map((f) => f.id);

describe('voiceCheck: model-written notes are caught', () => {
  const cases: [string, string][] = [
    ['staccato-run', 'Six words that contain an entire philosophy of writing. Write hard. Write clear. Write about what hurts.'],
    ['anaphora-triplet', 'Read it when you’re stuck. Read it when you’re afraid. Read it when you’ve forgotten why you started.'],
    ['not-a-x-a-y', 'This essay changed how the web looks. Not a rant. A diagnosis.'],
    ['doesnt-just', 'Ethan Zuckerman doesn’t just complain about advertising, he traces the exact moment we chose surveillance.'],
    ['why-it-matters', 'He makes a case for why their disappearance matters more than we think.'],
    ['curator-cliche', 'A eulogy and a rallying cry, all at once.'],
    ['curator-cliche', 'A love letter to the link.'],
    ['curator-cliche', 'If you’ve ever felt exhausted by the algorithm, this essay is the antidote.'],
    ['inflated-stakes', 'Twenty-five years later, this remains the most important thing anyone has ever said about the internet.'],
    ['inflated-stakes', 'An ethnography of the matsutake mushroom that is secretly about everything.'],
    ['signpost-reveal', 'Here’s the part I can’t wriggle out of: nobody asked.'],
    ['and-yet-opener', 'The sites are gone. And yet the links still point at them.'],
    ['quiet-register', 'Robin Sloan catalogues the quiet extinction of the web’s most beloved species.'],
    ['possessive-triad', 'It’s a manifesto for reclaiming your focus, your time, and your right to simply be present.'],
    ['question-hook', 'What if we treated the web like an ecosystem instead of a factory? This episode offers a framework.'],
    ['no-x-no-y', 'No algorithms. No feeds. Just a person who cares.'],
    ['not-because-but-because', 'People return to it not because it is beautifully written, but because it refuses to flatter them.'],
    ['first-person', 'I found this in a digital art archive last Tuesday at 2am.'],
    ['first-person', 'I keep this on a sticky note above my desk.'],
    ['praise-adjective', 'A brilliant, fascinating conversation.'],
  ];
  for (const [id, text] of cases) {
    it(`${id}: ${text.slice(0, 50)}`, () => expect(ids(text)).toContain(id));
  }

  it('the summary closer fires only on the last sentence of a multi-sentence text', () => {
    const t = 'Pratchett wrote about narrative. Stories shape what readers believe is possible. That’s the point.';
    expect(ids(t)).toContain('summary-closer');
    expect(ids('That’s the point.')).not.toContain('summary-closer');
  });

  it('reports positions that point at the matched text', () => {
    const t = 'Some text here. And yet it moves.';
    const f = voiceCheck(t).find((x) => x.id === 'and-yet-opener')!;
    expect(t.slice(f.index, f.index + f.match.length)).toBe('And yet');
  });

  it('describes errors for a regeneration prompt, without duplicates', () => {
    const d = describeVoiceFindings(voiceCheck('A love letter to the link. A love letter to the link.'));
    expect(d).toContain('Blurb cliché');
    expect(d.split('\n')).toHaveLength(1);
  });
});

describe('voiceCheck: the editor’s own sentences pass (editor mode)', () => {
  // Real sentences from his Substack notes. Several do things models are told not to (a single em
  // dash, swearing, a rhetorical question, a long list, "isn't just X; it's also Y") because those
  // are his habits, not machine tells.
  const editor = [
    'The interweb is like a smelly public toilet with no doors near the Majestic Bus Stand.',
    'The tide of cheap money deluded an entire generation into thinking they were geniuses.',
    'Now that the tide has receded, it turns out the geniuses were swimming naked. The geniuses are now trying to convince the world that their nakedness was a deliberate fashion choice.',
    'So I set up this section of the blog to read a poem a week and share it, hoping that a wayward traveler on the internet might stumble upon one and be inspired to read poetry like I was. I failed.',
    'Things have never been better.',
    'I came across the idea of “forever drafts” on Kyle Kowalski’s website last week, and I loved the idea. The term perfectly captures the essence of this blog as well—always exploring, never done.',
    'As someone who’s remarkably average at most things, I’ve realized that life is a steady process of chipping away at one’s ignorance and stupidity. Books help you do that.',
    'This shows status isn’t just about money or fancy cars; it’s also about one’s socioeconomic status.',
    'So, a lot of people, including some Indian fund managers, have been screaming from their rooftops to their 73 followers on Twitter that a recession is coming. Is a recession coming?',
    'It was a beautiful Thursday morning in the smelly, water-starved, garbage-ridden, gridlocked, treeless garden city that is Namma Bengaluru.',
    'Lift your head up from those screens, go smell the fresh polluted air of Bangalore, and enjoy a long silent stroll. What did you think?',
    'I still remember trips as a young, runny-nosed kid to Sapna Book House in Gandhinagar on my dad’s rickety Bajaj Chetak.',
    'Go and suffer a little.',
  ];
  for (const t of editor) {
    it(t.slice(0, 60), () => expect(ids(t, false)).toEqual([]));
  }

  it('machine mode still refuses to write as him', () => {
    expect(ids(editor[3]!, true)).toContain('first-person');
  });

  it('does not split sentences inside decimals or file names', () => {
    expect(ids('Rates were 3.3 and 4.1 per 10k. See stats.py and vocab.py for the method.', false)).toEqual([]);
  });

  it('does not take a Roman numeral for the first person', () => {
    expect(ids('Dan Carlin’s six-part series on World War I is long.')).not.toContain('first-person');
  });
});

describe('complements checkStyle', () => {
  it('does not re-report what checkStyle already catches', () => {
    // An em dash, a short "not X but Y", a hedge and a banned word: checkStyle territory.
    const t = 'It is worth noting that this is not just a book, but a tapestry.';
    expect(checkStyle(t).ok).toBe(false);
    expect(ids(t, false)).toEqual([]);
  });
  it('every tell has an id, a why, a bad example and evidence', () => {
    const seen = new Set<string>();
    for (const t of aiTells) {
      expect(t.id && t.why && t.bad && t.evidence).toBeTruthy();
      expect(t.pattern || t.detect).toBeTruthy();
      if (t.pattern) expect(t.pattern.flags).toContain('g');
      seen.add(t.id);
    }
    expect(seen.size).toBe(aiTells.length);
  });
  it('each bad example trips its own tell', () => {
    for (const t of aiTells) expect(ids(t.bad), t.id).toContain(t.id);
  });
});

describe('editorVoice and dictation hints', () => {
  it('keeps the prompt block under 250 words and passes the house style itself', () => {
    expect(editorVoice.split(/\s+/).length).toBeLessThan(250);
    const errors = checkStyle(editorVoice).issues.filter((i) => i.severity === 'error' && i.rule !== 'banned-word' && i.rule !== 'not-x-but-y');
    expect(errors).toEqual([]);
  });
  it('lists unique proper nouns and terms, with garbles mapped to them', () => {
    expect(new Set(dictionaryHints).size).toBe(dictionaryHints.length);
    // Every proper noun a garble resolves to must be in the hints (phrases like "paid by blood" need not).
    for (const g of dictationGarbles.filter((x) => /^[A-Z]/.test(x.meant))) {
      const meant = g.meant.toLowerCase();
      expect(dictionaryHints.some((h) => h.toLowerCase().includes(meant) || meant.includes(h.toLowerCase())), g.meant).toBe(true);
    }
  });
});
