# Content Creation Guide

A guide for creating compelling content for From The Dumpster Fire.

## 📝 Content Philosophy

### What We Curate
- Thoughtful essays that make you think
- Educational videos and documentaries
- Insightful podcasts and interviews
- Research papers (made accessible)
- Historical letters and correspondence
- Poetry that resonates
- Art that tells a story

### What We Avoid
- Clickbait and hot takes
- Rage bait or divisive content for its own sake
- Surface-level content
- Content that's all noise, no signal

## ✍️ Writing Overviews (Not Summaries)

### The Difference

**Summary**: "This article discusses the decline of religion globally, analyzing data from 111 countries."

**Overview**: "Religion doesn't vanish overnight. It fades in sequence, following the same pattern across cultures. This study reveals that people shed commitments by cost: attendance goes first, then personal importance, finally identity."

### Key Principles

1. **Hook Immediately**: Open with the most interesting insight
2. **Plain English**: Sophisticated but never stuffy
3. **Dense with Insight**: Every sentence should add value
4. **Show Don't Tell**: Demonstrate why it matters
5. **Leave Them Curious**: Make them want to read the original

### Structure (200-600 words)

```
Opening Hook (1-2 sentences)
↓
Key Insight #1 (1 paragraph)
↓
Key Insight #2 (1 paragraph)
↓
Key Insight #3 (1 paragraph)
↓
Why It Matters (1 paragraph)
↓
[Optional] Provocative Ending
```

## 🎨 Article Frontmatter

```yaml
---
title: "The Garden You Plant for Someone Else"
source: "Wait But Why"
originalUrl: "https://waitbutwhy.com/..."
author: "Tim Urban"
publishedDate: 2025-01-15
readingTime: 8
articleType: "essay"
topics: ["philosophy", "meaning", "legacy"]
featured: false
curatorNotes: "This piece fundamentally changed how I think about legacy. Urban argues that our grandest achievements might be the ones we'll never see completed—and that's exactly what makes them meaningful."
excerpt: "Your best work might be something you'll never finish. Here's why that's not depressing, but deeply freeing."
pullQuote: "The trees we plant today create shade for people we'll never meet."
---
```

### Field Definitions

- **title**: Clear, compelling title
- **source**: Where it's from (publication/site)
- **originalUrl**: Link to original
- **author**: Creator name (optional)
- **publishedDate**: YYYY-MM-DD format
- **readingTime**: Minutes to read overview
- **articleType**: essay | video | podcast | note | tweet | thread | paper | book
- **topics**: Array of relevant tags
- **featured**: Boolean for homepage feature
- **curatorNotes**: Why YOU rescued this (personal, authentic)
- **excerpt**: 1-2 sentence hook for cards
- **pullQuote**: Memorable quote (optional)

## 📚 Content Types

### Articles (Main Content)

**Purpose**: Deep dives and thoughtful pieces
**Length**: 200-600 words
**Tone**: Intelligent but accessible

### Art of the Week

```yaml
---
title: "Nighthawks"
artist: "Edward Hopper"
year: "1942"
imageUrl: "/images/nighthawks.jpg"
imageAlt: "Painting of a diner at night"
publishedDate: 2025-01-15
context: "Brief art historical context"
curatorNotes: "Why this piece resonates today"
topics: ["painting", "modernism", "isolation"]
---
```

### Poems

```yaml
---
title: "The Peace of Wild Things"
author: "Wendell Berry"
year: "1968"
publishedDate: 2025-01-15
excerpt: |
  When despair for the world grows in me
  and I wake in the night at the least sound...
curatorNotes: "Why this poem speaks to our moment"
topics: ["nature", "peace", "solitude"]
---
```

### Letters

```yaml
---
writer: "Virginia Woolf"
recipient: "Vita Sackville-West"
date: "January 31, 1927"
location: "London"
excerpt: "Intimate excerpt from the letter"
context: "Historical and personal context"
publishedDate: 2025-01-15
topics: ["correspondence", "literature", "love"]
---
```

### Books

```yaml
---
title: "How to Do Nothing"
author: "Jenny Odell"
coverImage: "/images/books/how-to-do-nothing.jpg"
publishedDate: 2025-01-15
featured: true
status: "reading" # reading | finished | to-read
curatorNote: "Resisting the attention economy in a distracted world."
topics: ["attention", "technology", "resistance"]
---
```

## 🎯 Topic Guidelines

### Good Topics (Specific)
- "attention-economy"
- "urban-isolation"
- "meaning-crisis"
- "climate-action"

### Bad Topics (Too Broad)
- "philosophy"
- "politics"
- "technology"
- "culture"

Use 2-5 topics per piece. Be specific enough to be useful for discovery.

## ✨ Curator Notes

This is YOUR voice. Be:

- **Personal**: How did this affect you?
- **Honest**: Real reactions, not marketing copy
- **Insightful**: What did you see that others might miss?
- **Concise**: 2-4 sentences max

### Examples

**Good**:
> "This essay crystallizes something I've felt for years but couldn't articulate. The constant dumbing down of tools in the name of 'accessibility' is actually making them less accessible to those who want to go deep."

**Bad**:
> "This is a great article about product design. You should read it. It has good points about users."

## 🔍 Quality Checklist

Before publishing, ask:

- [ ] Does the overview teach me something new?
- [ ] Would I send this to a smart friend?
- [ ] Is every sentence necessary?
- [ ] Does it make me want to read the original?
- [ ] Is the tone sophisticated but never stuffy?
- [ ] Have I checked for typos and grammar?
- [ ] Are all links working?
- [ ] Is the frontmatter complete and accurate?

## 📆 Publishing Cadence

Suggested schedule:

- **Articles**: 2-3 per week
- **Art of the Week**: Every Monday
- **Poem of the Week**: Every Wednesday
- **Letter of the Week**: Every Friday
- **Books**: Update monthly

Quality > Quantity. Better to publish less often with great content.

## 🎨 Markdown Tips

### Headers
Use `##` for main sections, `###` for subsections.

### Emphasis
- *Italic* for emphasis: `*text*`
- **Bold** for strong emphasis: `**text**`
- ~~Strikethrough~~: `~~text~~`

### Links
`[Link text](https://url.com)`

### Images
`![Alt text](/images/filename.jpg)`

### Lists
```markdown
- Unordered item
- Another item

1. Ordered item
2. Another item
```

### Blockquotes
```markdown
> This is a quote.
> It can span multiple lines.
```

## 🌟 Examples of Excellence

Study these for inspiration:
- Maria Popova's [The Marginalian](https://themarginalian.org)
- Daring Fireball's link posts
- Kottke.org's featured articles
- Wait But Why's explainers

## 💡 Finding Great Content

### Sources to Watch
- Long-form magazines (The Atlantic, The New Yorker)
- Thoughtful substacks
- Academic papers (arXiv, SSRN)
- Documentary recommendations
- Historical archives
- Poetry collections

### Red Flags
- Content that assumes you're dumb
- Excessive self-promotion
- Clickbait headlines
- Hot takes without substance
- Content optimized for engagement over insight

## 🤝 Content Collaboration

If others contribute:
1. Review for quality and tone
2. Edit for house style
3. Add curator notes if needed
4. Verify all links and sources
5. Run through quality checklist

---

**Remember**: You're rescuing signal from noise. Be selective. Be thoughtful. Be honest. Make every piece count.
