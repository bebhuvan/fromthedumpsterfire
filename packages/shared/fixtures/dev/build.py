# Builds the development sample Hauls 002 and 003 (local web only; never published).
# They exist to exercise every content type, every block kind and the edition colours.
import json
WAVE = {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg", "width": 1280, "height": 860, "caption": "Under the Wave off Kanagawa, about 1831.", "credit": "Wikimedia Commons", "licence": "public domain", "creator": "Katsushika Hokusai", "date": "about 1831", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg"}
def item(id, type, title, creator, src, date, url, why, **kw):
    d = {"id": id, "type": type, "title": title if isinstance(title, dict) else {"text": title}, "creator": creator,
         "source": {"name": src, "date": date, "url": url}, "why": {"text": why}, "marginalia": [], "wiki": [], "connections": []}
    d.update(kw); return d
h2 = {
 "bundleVersion": 1, "number": 2, "version": 1, "title": {"text": "Letters to", "italic": "the next people"},
 "deck": "A president's condolence, a commencement speech, a print of a wave, and a tool for keeping data where others can find it.",
 "publishedAt": "2026-10-22", "swatch": "lilac",
 "fieldNote": {"title": {"text": "Sample Haul,", "italic": "for the layout"}, "paragraphs": [
   "This is a development sample. It holds one of every kind of thing the magazine can carry, so the pages can be checked before real Hauls arrive.",
   "Each object here is set in its own printed form, and each carries the rich media a Haul can hold: code, a video, a podcast, a pull quote and a picture."],
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
       "Sample note. Everyone remembers the last line. The middle, about getting fired, is the better part.", place="Stanford, California", minutes=15,
       excerpt={"text": "Stay hungry. Stay foolish.", "highlight": "Stay hungry.", "locator": "14:33"},
       blocks=[{"kind": "video", "provider": "youtube", "id": "UF8uR6Z6KLc", "title": "Steve Jobs' 2005 Stanford Commencement Address", "start": 0, "poster": {"url": "https://i.ytimg.com/vi/UF8uR6Z6KLc/hqdefault.jpg", "width": 480, "height": 360}}]),
  item("kay", "quote", "Predicting the future", "Alan Kay", "Xerox PARC meeting", "1971", "https://en.wikipedia.org/wiki/Alan_Kay",
       "Sample note. Said in a planning meeting at Xerox PARC, where they were asked to forecast.",
       excerpt={"text": "The best way to predict the future is to invent it.", "locator": ""}),
  item("wave", "image", {"text": "Under the Wave", "italic": "off Kanagawa"}, "Katsushika Hokusai", "Thirty-six Views of Mount Fuji", "about 1831", "https://en.wikipedia.org/wiki/The_Great_Wave_off_Kanagawa",
       "Sample note. The most copied print in the world. Look at the boats before the wave.", year=1831, plate=WAVE),
  item("seeing-state", "book", {"text": "Seeing Like", "italic": "a State"}, "James C. Scott", "Yale University Press", "1998", "https://en.wikipedia.org/wiki/Seeing_Like_a_State",
       "Sample note. On my desk for a month. Every chapter is a case of a plan that could only see what it could count.",
       excerpt={"text": "Certain forms of knowledge and control require a narrowing of vision.", "locator": "Chapter 1"}),
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
idx = {"bundleVersion": 1, "updatedAt": "2026-10-24T12:00:00Z", "hauls": []}
for h in (h3, h2):
    n = h["number"]; json.dump(h, open(f"haul-{n:03}.json", "w"), indent=1, ensure_ascii=False)
    idx["hauls"].append({"number": n, "title": h["title"], "deck": h["deck"], "publishedAt": h["publishedAt"], "swatch": h["swatch"], "itemCount": len(h["items"]), "path": f"hauls/{n:03}/v1/haul.json"})
base = json.load(open("../index.json"))
idx["hauls"] += base["hauls"]
json.dump(idx, open("index.json", "w"), indent=1, ensure_ascii=False)
