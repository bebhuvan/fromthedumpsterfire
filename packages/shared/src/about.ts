// The editor's note at the top of the About page, shared by the website and the app. These are the
// editor's own words (dictated, then tightened at the editor's request on 2026-10-25); never machine-rewrite them.
// A paragraph is a run of plain strings and spans; a span is a link (http(s) or the editor's mailto)
// or the italic title of a work.

export type AboutSpan = { text: string; href?: string; em?: boolean };
export type AboutParagraph = (string | AboutSpan)[];

export const EDITOR_EMAIL = 'bhuvan@bebhuvan.com';

const site = (host: string): AboutSpan => ({ text: host, href: `https://${host}` });
const sep = ', ';

export const editorNote: AboutParagraph[] = [
  [
    "Hello, denizen of the internet. Welcome to Dumpster Fire, a small little corner of it. The internet might be a raging, stinking dumpster fire, spewing noxious fumes that blind anyone in its vicinity, but it's still one of the coolest things humanity has ever made. And the fire hasn't consumed all the good things yet: the fun, wonderful and weirdly enjoyable things on the interweb. This is a place to find some of them, and to salvage them before the fire consumes everything in its path.",
  ],
  [
    "A little backstory. My name is Bhuvan, and I'm a creature of the internet. Pretty much everything I know has more or less to do with it. The internet has become unpopular, and touching grass seems to be back in fashion, although to me it has this gourmet vibe. But the internet still teaches me things and gives me chances to have fun.",
  ],
  [
    'The idea behind Dumpster Fire started sometime in the early 2020s, I forget which year, when I read ',
    { text: 'Curation', em: true },
    " by Michael Bhaskar. The idea of curation resonated with me instantly, and I've been thinking about it ever since. When LLM coding tools arrived, I bought this domain to share links to interesting articles, videos, podcasts, research papers, quotes, tweets and all sorts of assorted digital paraphernalia. It didn't go anywhere. I was either too lazy, or I was always suffering from some sort of “ooh, that's interesting” syndrome, which coincidentally is also the title of ",
    { text: 'my newsletter', href: 'https://bhuvan.substack.com' },
    '.',
  ],
  [
    "The internet may well be consumed by this dumpster fire. AI slop and human slop are clogging its veins, and who knows how long it has before it has a heart attack and dies. But there are still a whole lot of weird, wonderful and fascinating things out there, and this is one small corner where I'll share some of them: a nice article, a beautiful verse, a good word, a funny joke, a dank meme, a rabbit hole, whatever it is, so that you can enjoy it.",
  ],
  ["Disclosure: everything here is chosen by a human, but I lean heavily on LLMs to publish it. There are two reasons."],
  [
    "One, I think LLMs are awesome. If you think anything on this site is tainted goods because it has been touched by the unholy touch of an LLM, if you're one of those idiots who still has visions of human supremacy and thinks LLMs produce nothing but slop, to you I say fuck you. And mate, if you still think you're better than an LLM, stand in front of a mirror, open your mouth and listen to what comes out. You're not all that great, and I hate to be the one to break it to you. Humans make plenty of slop too, so get your priorities straight and stop being sloppy.",
  ],
  [
    "Two, I'm solo. Apart from Dumpster Fire, I have a whole host of other projects: ",
    site('akshara.ink'), sep, site('thisindianlife.today'), sep, site('measure.thisindianlife.today'), sep,
    site('lifeinindia.org'), sep, site('tipsheet.markets'), sep, site('poeticreveries.com'), sep,
    site('smallweb.blog'), sep, site('seneca.ink'), ' and ', site('hopeanddespair.world'),
    ". None of this would be possible without LLMs. They're involved in everything, from designing the site and building the app to helping me publish each Haul.",
  ],
  [
    "I'm telling you this so that one day I don't see some sanctimonious prick jump up in the air and shout, “Look, this heretic has used LLMs!” and unleash a mob of digital human puritans on team human superiority to come after me and burn me down like the witch that I am.",
  ],
  [
    "So with that, I hope you find as many rabbit holes here as I do elsewhere on the internet. That's the simple goal of Dumpster Fire: to send you down a million rabbit holes and have you come out a whole another person. I want you to have serendipity, that moment where you just keep going, “that's interesting,” and more.",
  ],
  [
    'Thank you for being here. Feedback and suggestions to ',
    { text: EDITOR_EMAIL, href: `mailto:${EDITOR_EMAIL}` },
    ". I'm bebhuvan on ",
    { text: 'Twitter', href: 'https://x.com/bebhuvan' },
    ' and ',
    { text: 'LinkedIn', href: 'https://www.linkedin.com/in/bebhuvan' },
    ', and on Substack at ',
    { text: 'bhuvan.substack.com', href: 'https://bhuvan.substack.com' },
    '. Hit me up.',
  ],
];

/** The note as plain text, one paragraph per line (for the plain-text and Markdown editions). */
export const editorNoteText = (): string[] => editorNote.map((p) => p.map((s) => (typeof s === 'string' ? s : s.text)).join(''));

/**
 * The magazine's licence (the editor's choice, 2026-10-31): what is written for it is CC BY 4.0,
 * commercial use included; the works it quotes and shows keep their makers' own terms. In the
 * website's footer and at the foot of the app's About.
 */
export const LICENCE = {
  name: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  before: 'Words written for this magazine are licensed ',
  after:
    ': share and adapt them, commercially too, with credit to From the Dumpster Fire. Quotations, excerpts, pictures and every other work shown here stay with their makers, under their own copyright and licences.',
} as const;
