# Builds the development sample Hauls 002 and 003 (local web only; never published).
# They exist to exercise every content type, every block kind and the edition colours.
import json, os
# The Sukumar Sen Life, assembled from the session's draft (life-sen.json), and the editor's note on it (fillers cut).
WHY_SEN = "I wanted to add a profile of Sukumar Sen, India's first election commissioner. The context here is the debates about the special intensive revision, SIR, and all the debates about disenfranchisement. I think it's important to know how far we have come. It's important to know how radical and revolutionary our past elections were, and how monumentally challenging they were, and yet how far we have come: how we started at a place where we protected the sacred right of people to vote and express their democratic choice at all costs. There's that anecdote in Guha's book that four months before that, in the glacier somewhere, there were election booths, and the general election happened much later across the country. How Sukumar Sen was radical, how he included the women's names in the rolls, and how he struck them off."
LIFE = json.load(open(os.path.join(os.path.dirname(__file__), "life-sen.json")))
SEN_PORTRAIT = json.load(open(os.path.join(os.path.dirname(__file__), "sen-portrait.json")))
WAVE = {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg", "width": 1280, "height": 860, "caption": "Under the Wave off Kanagawa, about 1831.", "credit": "Wikimedia Commons", "licence": "public domain", "creator": "Katsushika Hokusai", "date": "about 1831", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg"}
def item(id, type, title, creator, src, date, url, why, **kw):
    d = {"id": id, "type": type, "title": title if isinstance(title, dict) else {"text": title}, "creator": creator,
         "source": {"name": src, "date": date, "url": url}, "why": {"text": why}, "marginalia": [], "wiki": [], "connections": []}
    body = kw.pop("why_body", None)
    if body: d["why"]["body"] = body
    d.update(kw); return d
# The field note as the editor sets it out (FieldNote.body): a heading, links and italics, a quotation,
# a video and a post between the paragraphs. FN_PARAS is its plain words, as bodyParagraphs gives them.
FN_POST = {"kind": "post", "platform": "x", "url": "https://x.com/samplewriter/status/1000000000000000002", "author": "Sample Writer", "handle": "samplewriter",
           "date": "4 October 2026", "text": "A second sample post, set inside the field note between two paragraphs."}
FN_VIDEO = {"kind": "video", "provider": "youtube", "id": "UF8uR6Z6KLc", "title": "Steve Jobs' 2005 Stanford Commencement Address",
            "poster": {"url": "https://i.ytimg.com/vi/UF8uR6Z6KLc/hqdefault.jpg", "width": 480, "height": 360}}
FN_BODY = [
  {"kind": "paragraph", "runs": [{"text": "This is a development sample. It holds one of every kind of thing the magazine can carry, so the pages can be checked before real Hauls arrive."}]},
  {"kind": "heading", "text": "What the field note can hold"},
  {"kind": "paragraph", "runs": [{"text": "Each object here is set in its own printed form. The note itself can carry links, like "},
     {"text": "the letter to Mrs. Bixby", "url": "https://en.wikipedia.org/wiki/Bixby_letter"}, {"text": ", titles in italic, like "},
     {"text": "Walden", "em": True}, {"text": ", and quotations:"}]},
  {"kind": "quotation", "paragraphs": [[{"text": "Stay hungry. Stay foolish."}], [{"text": "A second quoted paragraph, from "}, {"text": "the same speech", "url": "https://www.youtube.com/watch?v=UF8uR6Z6KLc"}, {"text": "."}]]},
  {"kind": "paragraph", "runs": [{"text": "A video sits between paragraphs when its link is on a line of its own:"}]},
  FN_VIDEO,
  {"kind": "paragraph", "runs": [{"text": "And so does a post from X, drawn as a clipping in its own words."}]},
  FN_POST,
  {"kind": "paragraph", "runs": [{"text": "Each carries the rich media a Haul can hold: code, a video, a podcast, a pull quote and a picture."}]},
]
def _plain(b):
    if b["kind"] == "paragraph": return ["".join(r["text"] for r in b["runs"])]
    if b["kind"] == "heading": return [b["text"]]
    if b["kind"] == "quotation": return ["".join(r["text"] for r in p) for p in b["paragraphs"]]
    return []
FN_PARAS = [t for b in FN_BODY for t in _plain(b)]
h2 = {
 "bundleVersion": 1, "number": 2, "version": 1, "title": {"text": "Letters to", "italic": "the next people"},
 "deck": "A president's condolence, a commencement speech, a print of a wave, and a tool for keeping data where others can find it.",
 "publishedAt": "2026-10-22", "swatch": "lilac",
 "fieldNote": {"title": {"text": "Sample Haul,", "italic": "for the layout"}, "paragraphs": FN_PARAS, "body": FN_BODY,
   "highlight": "one of every kind of thing the magazine can carry", "route": [
   {"day": "Mon", "text": "A letter from 1864, still read aloud.", "by": "editor", "itemId": "bixby"},
   {"day": "Wed", "text": "A tool for publishing data, with its one command.", "by": "editor", "itemId": "datasette"},
   {"day": "Fri", "text": "Both are about leaving something for strangers.", "by": "machine"},
   {"day": "Sat", "text": "A speech at Stanford, 2005.", "by": "editor", "itemId": "stanford"}]},
 "items": [
  item("bixby", "letter", "Letter to Mrs. Bixby", "Abraham Lincoln", "Library of Congress", "21 November 1864", "https://en.wikipedia.org/wiki/Bixby_letter",
       "Sample note. A letter of five sentences that is still read at funerals. The form matters: a dateline, a salutation, the body, the close.",
       recipient="Mrs. Lydia Bixby", place="Executive Mansion, Washington",
       excerpt={"text": "Dear Madam,\nI have been shown in the files of the War Department a statement of the Adjutant General of Massachusetts that you are the mother of five sons who have died gloriously on the field of battle.", "highlight": "the mother of five sons who have died gloriously on the field of battle", "locator": ""}),
  item("sample-post", "social", "On keeping a commonplace book", "Sample Writer", "X", "3 October 2026", "https://x.com/",
       "Sample note. A post set as a clipping, with the handle and the date, never the platform's embed.", handle="@samplewriter",
       excerpt={"text": "Keep a commonplace book. Not for anyone else. Copy out the lines that stop you. In ten years it will be the best book you own.", "highlight": "Copy out the lines that stop you.", "locator": ""}),
  item("datasette", "tool", "Datasette", "Simon Willison", "Open source, Python", "2017", "https://datasette.io/",
       "Sample note. One command turns a SQLite file into a website and an API. I use it to keep the magazine's own data browsable.",
       excerpt={"text": "An open source multi-tool for exploring and publishing data", "locator": "datasette.io"},
       blocks=[{"kind": "code", "lang": "bash", "caption": "Install it and serve a database", "code": "pip install datasette\ndatasette serve hauls.db --open"},
               {"kind": "code", "lang": "python", "caption": "Or load rows from Python first", "code": "import sqlite_utils\n\n# One table per Haul, one row per object\ndb = sqlite_utils.Database(\"hauls.db\")\ndb[\"items\"].insert_all(rows, pk=\"id\")\nprint(db[\"items\"].count, \"objects\")\n"}]),
  item("stanford", "speech", "Commencement address", "Steve Jobs", "Stanford University", "12 June 2005", "https://www.youtube.com/watch?v=UF8uR6Z6KLc",
       "Sample note. Everyone remembers the last line. The middle, about getting fired, is the better part.\n\nStay hungry. Stay foolish.\n\nA note can quote its source and set a title in italic, like the Whole Earth Catalog.", place="Stanford, California", minutes=15,
       why_body=[{"kind": "paragraph", "runs": [{"text": "Sample note. Everyone remembers the last line. The middle, about getting fired, is the better part."}]},
                 {"kind": "quotation", "paragraphs": [[{"text": "Stay hungry. Stay foolish."}]]},
                 {"kind": "paragraph", "runs": [{"text": "A note can quote its source and set a title in italic, like the "}, {"text": "Whole Earth Catalog", "em": True}, {"text": "."}]}],
       excerpt={"text": "Stay hungry. Stay foolish.", "highlight": "Stay hungry.", "locator": "14:33"},
       blocks=[{"kind": "video", "provider": "youtube", "id": "UF8uR6Z6KLc", "title": "Steve Jobs' 2005 Stanford Commencement Address", "start": 0, "poster": {"url": "https://i.ytimg.com/vi/UF8uR6Z6KLc/hqdefault.jpg", "width": 480, "height": 360}}]),
  item("kay", "quote", "Predicting the future", "Alan Kay", "Xerox PARC meeting", "1971", "https://en.wikipedia.org/wiki/Alan_Kay",
       "Sample note. Said in a planning meeting at Xerox PARC, where they were asked to forecast.",
       excerpt={"text": "The best way to predict the future is to invent it.", "locator": ""}),
  item("wave", "image", {"text": "Under the Wave", "italic": "off Kanagawa"}, "Katsushika Hokusai", "Thirty-six Views of Mount Fuji", "about 1831", "https://en.wikipedia.org/wiki/The_Great_Wave_off_Kanagawa",
       "Sample note. The most copied print in the world. Look at the boats before the wave.", year=1831, plate=WAVE),
  item("seeing-state", "book", {"text": "Seeing Like", "italic": "a State"}, "James C. Scott", "Yale University Press", "1998", "https://en.wikipedia.org/wiki/Seeing_Like_a_State",
       "Sample note. On my desk for a month. Every chapter is a case of a plan that could only see what it could count.",
       excerpt={"text": "Certain forms of knowledge and control require a narrowing of vision.", "locator": "Chapter 1"}, shelf="seeing-like-a-state"),
  item("sukumar-sen", "life", "Sukumar Sen", "Ramachandra Guha", "India After Gandhi", "2007", "https://amzn.in/d/07BIgTop",
       WHY_SEN, year=1951, life=LIFE, plate=SEN_PORTRAIT),
  item("sample-pod", "podcast", "A podcast episode", "Sample Host", "Spotify", "2026", "https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL",
       "Sample note. A podcast with its official player, and an audio file played by the browser.", minutes=95,
       blocks=[{"kind": "audio", "provider": "spotify", "url": "https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL", "title": "The show on Spotify"},
               {"kind": "quote", "text": "A pull quote from the episode, matched word for word against its transcript.", "locator": "41:10"}]),
 ],
 "threads": [], "colophon": "A development sample. Chosen and annotated by nobody; it exists to test the layout."}
h3 = {
 "bundleVersion": 1, "number": 3, "version": 1, "title": {"text": "The machine", "italic": "in the garden"},
 "deck": "A short essay with code in it, a poem, a Wikipedia oddity, and the print that started it.",
 "publishedAt": "2026-10-24", "swatch": "mint",
 "fieldNote": {"title": {"text": "Another sample,", "italic": "smaller"}, "paragraphs": ["A second sample Haul, so two editions can be compared side by side."], "route": []},
 "items": [
  item("worse-is-better", "essay", {"text": "Worse is", "italic": "better"}, "Richard P. Gabriel", "dreamsongs.com", "1989", "https://www.dreamsongs.com/WorseIsBetter.html",
       "Sample note. The argument that simple and slightly wrong beats right and complicated, from a man who preferred right.",
       excerpt={"text": "Simplicity: the design must be simple, both in implementation and interface.", "highlight": "the design must be simple", "locator": "The rise of worse is better"},
       blocks=[{"kind": "quote", "text": "It is more important for the implementation to be simple than the interface.", "locator": "The rise of worse is better"},
               {"kind": "code", "lang": "c", "caption": "The PC-loser-ing problem, in miniature", "code": "/* A system call interrupted by a signal returns early. */\nwhile ((n = read(fd, buf, len)) == -1 && errno == EINTR)\n    ;  /* the caller retries */\n"}]),
  item("wave2", "image", "The great wave, again", "Katsushika Hokusai", "Thirty-six Views of Mount Fuji", "about 1831", "https://en.wikipedia.org/wiki/The_Great_Wave_off_Kanagawa",
       "Sample note. A picture on its own, as the object of the item.", year=1831, plate=WAVE),
  item("leaves", "poem", "Leaves of Grass", "Walt Whitman", "Leaves of Grass", "1855", "https://en.wikipedia.org/wiki/Leaves_of_Grass",
       "Sample note. A poem as a broadside.", excerpt={"text": "I celebrate myself, and sing myself,\nAnd what I assume you shall assume,\nFor every atom belonging to me as good belongs to you.", "locator": ""}),
  item("emu-war", "rabbit-hole", "The Emu War", "Wikipedia", "Wikipedia", "1932", "https://en.wikipedia.org/wiki/Emu_War",
       "Sample note. The Australian army against a flock of birds. The birds won."),
  item("ideas-talk", "talk", "The computer revolution hasn't happened yet", "Alan Kay", "OOPSLA", "1997", "https://www.youtube.com/watch?v=oKg1hTOQXoY",
       "Sample note. A talk with its video set inside the transcript.", minutes=64,
       blocks=[{"kind": "video", "provider": "youtube", "id": "oKg1hTOQXoY", "title": "The computer revolution hasn't happened yet", "poster": {"url": "https://i.ytimg.com/vi/oKg1hTOQXoY/hqdefault.jpg", "width": 480, "height": 360}}]),
  item("victorian", "passage", "The Machine in the Garden", "Leo Marx", "Oxford University Press", "1964", "https://en.wikipedia.org/wiki/The_Machine_in_the_Garden",
       "Sample note. A passage as a page from the book.", excerpt={"text": "A sample passage set as a page from the book, justified, under its running head, with its page as the folio.", "locator": "p. 15"}),
 ],
 "threads": [], "colophon": "A development sample."}
# A chart item (the figure) and a chart block, drawn from the chart comps' real data.
CHARTS = "../../../../docs/design-comps/charts/data/"
chart = lambda name: json.load(open(CHARTS + name + ".json"))
h3["items"].append(item("delhi-heat", "chart", {"text": "A year of Delhi's", "italic": "heat"}, "Open-Meteo (ERA5)", "Open-Meteo", "2024", "https://open-meteo.com/",
       "Sample note. A year of daily highs and lows against the normal range and the records, after the New York Times weather chart.", year=2024,
       blocks=[{"kind": "chart", "chart": chart("delhi-band-2024")}, {"kind": "chart", "chart": chart("temperature-stripes")}]))
h2["items"][2]["blocks"].append({"kind": "chart", "chart": chart("south-asia-gdp-bar")})
# A post block (2026-10-31): an X post set inside another item as a small clipping.
h2["items"][2]["blocks"].append({"kind": "post", "platform": "x", "url": "https://x.com/samplewriter/status/1000000000000000001", "author": "Sample Writer", "handle": "samplewriter", "date": "3 October 2026", "text": "Sample post, set inside another item as a clipping in its own words.\n\nWhen X gives only the start of a long post, the card says so and sends readers to the rest…", "truncated": True})
idx = {"bundleVersion": 1, "updatedAt": "2026-10-24T12:00:00Z", "hauls": []}
for h in (h3, h2):
    n = h["number"]; json.dump(h, open(f"haul-{n:03}.json", "w"), indent=1, ensure_ascii=False)
    idx["hauls"].append({"number": n, "title": h["title"], "deck": h["deck"], "publishedAt": h["publishedAt"], "swatch": h["swatch"], "itemCount": len(h["items"]), "path": f"hauls/{n:03}/v1/haul.json"})
base = json.load(open("../index.json"))
idx["hauls"] += base["hauls"]
json.dump(idx, open("index.json", "w"), indent=1, ensure_ascii=False)
