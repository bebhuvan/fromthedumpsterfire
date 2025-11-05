---
title: "Whither AGI?"
source: "Stanford HAI"
originalUrl: "https://www.youtube.com/watch?v=_PioN-CpOP0&t=1301s"
author: "Fei-Fei Li"
publishedDate: 2024-12-15
readingTime: 6
articleType: "video"
topics: ["artificial-intelligence", "spatial-intelligence", "computer-vision"]
featured: false
curatorNotes: "This conversation with Fei-Fei Li cuts through the AGI hype with surgical precision. Her argument that text-based LLMs are fundamentally insufficient for true intelligence—because they lack spatial understanding—aligns perfectly with what Yann LeCun has been saying about autoregressive models being doomed. The evolutionary perspective is particularly compelling: vision emerged 540 million years ago and sparked an arms race in intelligence, while language is a recent human invention. Li's work on spatial intelligence feels like one of the few serious attempts to move beyond the current paradigm of 'throw more text at transformers and hope for magic.'"
excerpt: "Stanford's Fei-Fei Li argues that AGI is impossible with text-only LLMs, making the case that spatial intelligence—understanding and reasoning about the 3D world—is fundamental to true AI. Her evolutionary perspective on why vision predates and underlies intelligence offers a compelling counter-narrative to the current text-obsessed AI landscape."
pullQuote: "AGI won't be complete without spatial intelligence. Getting there requires world models that go beyond flat pixels and beyond language to capture the true 3D structure of reality."
---

I started watching this video of [Fei-Fei Li](https://en.wikipedia.org/wiki/Fei-Fei_Li) because I saw [a snippet of one of her interviews](https://x.com/drfeifei/status/1966265813637460471) on Twitter.

<div class="video-embed">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/_PioN-CpOP0?start=1301" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

It's an interesting video. A couple of things that stood out to me:

## AGI (whatever that means) is impossible with only text-based LLMs

> I have a habit, as a computer-vision scientist, of looking to evolution and brain science for inspiration. When I search for the next north-star problem, I ask what evolution and brain development have already solved. Human language emerged relatively recently—on the order of hundreds of thousands of years—and humans are the only species with language as a full tool for communication, reasoning, and abstraction. Vision is different. The ability to understand, navigate, and act in a 3D world traces back roughly 540 million years to the first trilobites, and it sparked an evolutionary arms race in intelligence. That's why solving spatial intelligence—understanding, generating, and reasoning about the 3D world—is a fundamental problem for AI. AGI won't be complete without it. Getting there requires world models that go beyond flat pixels and beyond language to capture the true 3D structure of reality.

## Why vision is harder than language

> Language is fundamentally one-dimensional: syllables come in sequence, which is why sequence-to-sequence modeling is so classic. What people often miss is that language is purely generative. There is no "language" in nature—you can't touch it or see it. It emerges from the human mind as a constructed signal.
>
> The world, by contrast, is far more complex. It is fundamentally 3D—and if you add time, 4D. Visual perception is also a projection: eyes or cameras collapse 3D into 2D, which makes it a mathematically ill-posed problem. That's why biological vision relies on multiple sensors.
> 
> Moreover, the world is not purely generative. You can generate virtual 3D worlds, but they must obey physics. At the same time, there is a real world that demands reconstruction and interaction. AI has to move fluidly between generation and reconstruction—across domains from gaming and the metaverse to robotics. All of this sits on the continuum of world modeling and spatial intelligence.
> 
> Unlike language, where abundant internet data exists, spatial intelligence lacks easily accessible datasets—it mostly lives in our heads. That makes the problem harder, but also more exciting. If it were easy, someone else would have solved it already. My career has always been about pursuing problems so difficult they border on delusional. Spatial intelligence is exactly that problem.

This reminds me of something [Yann LeCun](https://en.wikipedia.org/wiki/Yann_LeCun) said:

<div class="video-embed">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/ETZfkkv6V7Y?start=369" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

> My prediction is that autoregressive LLMs are doomed. A few years from now, nobody in their right mind will use them. They sometimes produce nonsense because of this autoregressive prediction. We're missing something really big—a new concept of how to build AI systems.
> 
> We're never going to get to human-level AI by just training large language models on bigger datasets. It's not going to happen. We can't even reproduce what a cat can do. A cat has an amazing understanding of the physical world, can plan complex actions, and has causal models of consequences. Humans are even more remarkable: a ten-year-old can load a dishwasher the first time they're asked, and a teenager can learn to drive in 20 hours—because they have mental models of the world.
> 
> Meanwhile, autonomous driving companies have hundreds of thousands of hours of training data and still no Level 5 self-driving cars. AI systems can pass bar exams and prove theorems, but where is my domestic robot? The physical world is much more complicated than language. That's the Moravec paradox: tasks hard for humans, like solving equations or playing chess, are easy for machines, while tasks easy for humans, like perception and motor control, remain incredibly hard.
> 
> We're not going to get to human-level AI by just training on text.