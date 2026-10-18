Offline fixtures for the platform routes and the Wayback fallback (`test/fetch-routes.test.ts`).
Each one copies the shape of a real response seen on 2026-10-18 (Substack post API and feed,
WordPress REST, Medium RSS, Wayback CDX, Save Page Now) with short made-up text in place of the
articles. Field names, nesting and the markers the code relies on (Substack's `audience` and
`wordcount`, the "Read more" tail of a paid post in the feed, Medium's `medium-feed-link`, the
`spn2-` job id) are as the services send them.
