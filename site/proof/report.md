# Whole-site proof

- Files compared: 192 (187 HTML, plus llms.txt, rss.xml, sitemap.xml, video-sitemap.xml, robots.txt)
- Files that differ: 2 (4 differing tokens)
- Accepted differences: 0
- Only in build.py's output: none
- Only in the new build's output: none

## blog/company-offsite-ideas-colorado-remote-teams/index.html (awaiting a decision: Reading time is now counted from the post's text as a reader sees it, so it follows edits. build.py counted each {{market:...}} figure and the {{market_sources}} line as one word. This post prints 11 figures as words ("62 percent") and the one-sentence sources note, which takes it from 1,599 to 1,631 words, past the 1,600 that reads in 8 minutes: 9 min read instead of 8.)
body: 2 differing tokens
```
@@ -147,3 +147,3 @@
 <span >
-T 8 min read
+T 9 min read
 </span>
```

## blog/index.html (awaiting a decision: The same post's row on the blog index: 9 min read instead of 8.)
body: 2 differing tokens
```
@@ -1012,3 +1012,3 @@
 <span >
-T 8 min read
+T 9 min read
 </span>
```

