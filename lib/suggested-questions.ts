// The suggested-question buttons under the chat box (app/page.tsx). Shared with
// the dashboard so rows logged before buttons reported `source` can still be
// matched by text. Editing a question here changes that match for old rows.
// The first three show on arrival. The first always shows the career timeline
// (asksForOverview in lib/timeline.ts). The second is the build story
// (asksForBuildStory in lib/build-story.ts), and systems thinking moves to
// third. "What did Jordanne build herself, hands on keyboard?" was dropped
// (Jordanne, 2026-11-08).
export const SUGGESTED_QUESTIONS = [
  "Walk me through Jordanne's career.",
  "How did Jordanne build this site?",
  "How has Jordanne demonstrated systems thinking?",
  "How did Regimen Builder help new customers know where to start?",
  "Why did Jordanne turn the store off for Black Friday?",
  "How does Jordanne prove an idea before the data exists?",
  "Why does Jordanne say your next customer never sees your interface?",
  "What is the instinct that drives Jordanne to build?",
  "What is Jordanne's process for moving from concept to production?",
  "What is FundLocal and why did Jordanne build it?",
  "How does Jordanne work with engineers and designers as a counterpart?"
];
