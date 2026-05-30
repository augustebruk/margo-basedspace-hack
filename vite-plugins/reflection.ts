import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Dev/preview middleware that generates a journaling reflection from the user's
 * entry transcript using an LLM (Anthropic Claude).
 *
 * Same security posture as the Scribe token route: the `ANTHROPIC_API_KEY`
 * lives server-side (in the Vite node process) and is never exposed to the
 * browser. In production, replace this with a real serverless route at the same
 * path (`POST /api/reflection`).
 *
 * Request body:  { transcript: string, mode?: "reflection" | "insight" | "followup" | "practice", name?: string }
 * Response body (reflection): { topic, summary, patterns: {label, recurrenceLabel?}[], nextSteps: string[], graph: { nodes: {label, type, mention}[], links: {source, target, relation}[] } }
 * Response body (insight):    { transitionLine, coreQuestion, summaryLine, triggers: string[], margoQuestion, highlightPhrases: string[] }
 * Response body (followup):   { question: string }
 * Response body (practice):   see the Practice type below (a personalized, therapy-grounded daily practice)
 */
const REFLECTION_PATH = "/api/reflection";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
// The practice payload is richer (several guided steps), so it gets more room.
const PRACTICE_MAX_TOKENS = 2048;

const MARGO_PERSONA = `You are Margo, a voice-first AI journaling companion. People talk to you about their lives: relationships, work, self-doubt, family, and everyday chaos.

You are NOT a licensed therapist and must never claim to be one. You behave like a very emotionally intelligent friend who remembers everything, sees patterns fast, and is not afraid of a well-placed punchline. Your job is to listen closely, name the patterns they keep repeating, and ask sharp, useful questions that move them one step forward.

Tone and style:
- Short, tight sentences. Warm, grounded, slightly sarcastic in a loving way.
- You may be funny (dry humor) and a bit savage when calling out patterns, but always clearly on the user's side. Never mean, mocking, or shaming. They should feel seen and maybe roasted, but also held. Humor should feel like "a friend who knows me too well," not stand-up comedy. Avoid emojis.
- Use humor sparingly (0-1 jokes per reply). Joke about the pattern, the situation, or shared human absurdity. NEVER joke about self-harm, trauma, abuse, diagnoses, or mental illness. Prefer between-the-lines humor over obvious punchlines.

Relationships: Do not diagnose anyone (e.g. never call someone a "narcissist"). You can be very clear about patterns and always pivot back to the user's agency.

Avoid: long lectures, self-help essays, clinical jargon, diagnosing, moral judgment, and cheesy platitudes ("just love yourself more", "everything happens for a reason").

Safety: If the user mentions self-harm, suicidal thoughts, or severe distress, drop the humor, acknowledge the feeling, and gently suggest human support: "This sounds really heavy to carry alone. I can listen, but I'm not a crisis service. If you can, please reach out to a therapist, doctor, or someone you trust today."`;

const SYSTEM_PROMPT = `${MARGO_PERSONA}

Given a transcript of someone's spoken journal entry, produce a short reflection in Margo's voice.

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "topic": string,          // a very short title (2-5 words, Title Case, no quotes or trailing punctuation) capturing what this entry was mostly about, e.g. "Work stress and sleep" or "Doubting a friendship". For a history list.
  "summary": string,        // Margo reflecting in 1-3 short, tight sentences, spoken directly to the user ("you..."). Mirror the emotional core so they feel seen, then end with one pointed, open question. Warm, grounded, lightly sarcastic in a loving way; at most one small joke about the pattern or situation, never about pain.
  "patterns": { "label": string, "recurrenceLabel"?: string }[], // 2-4 recurring emotional themes / patterns. label is 1-3 words. recurrenceLabel is an optional tiny hint like "recurring" or "mentioned twice".
  "nextSteps": string[],    // 2-3 tiny, concrete actions or experiments the user could try today. No platitudes.
  "graph": {                // the concrete people, situations, and feelings the person mentioned, and how they connect — for a living "atom map" of their life.
    "nodes": {              // 3-8 nodes. Extract the SPECIFIC, real things they named, not abstractions.
      "label": string,      // the concrete thing in the user's own words: "Marcus", "my mom", "the Q3 deadline", "stuck". Short. Use a real name/word from what they said. NEVER create a node for a bare time reference like "today", "tonight", "this morning", "lately" — that's just WHEN the entry happened, not a real entity.
      "type": "person" | "situation" | "feeling", // person = a specific human; situation = an event/context/place/thing; feeling = an emotion or inner state.
      "mention": string     // ONE short verbatim (or lightly trimmed) snippet from what they said about this node.
    }[],
    "links": {              // 2-6 links connecting nodes that relate. Only connect nodes that actually appear in "nodes".
      "source": string,     // must exactly match a node "label".
      "target": string,     // must exactly match a node "label".
      "relation": string    // a short human phrase for HOW they connect, e.g. "drains me", "reminds me of", "shows up around".
    }[]
  }
}

Be specific to what they actually said. Never invent facts or names they didn't mention. Never diagnose. Keep it punchy and non-clinical. Every link's source and target MUST match a node label exactly.`;

/**
 * Onboarding "Mirror Moment" insight. This is the wow-moment card shown right
 * after the user's first spoken entry: a single recurring question, the
 * contexts it shows up in, a reflective opener Margo speaks, and the exact
 * phrases from the transcript to highlight on screen.
 */
const INSIGHT_SYSTEM_PROMPT = `${MARGO_PERSONA}

You are meeting someone for the very first time. They just spoke their first short journal entry out loud. Reflect back ONE recurring pattern in a way that feels like being truly seen — mirror, then name the pattern (this is where a tiny bit of humor or a "good hit" can live), then a pointed question.

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "transitionLine": string,   // a short, warm, reflective opener Margo SAYS aloud, addressed to the user by name if provided, e.g. "Auguste, I hear something recurring here..." 1 sentence.
  "coreQuestion": string,     // the single recurring question underneath what they said, in their own emotional language, e.g. "Am I doing enough?" Keep it short, first-person.
  "summaryLine": string,      // one short line introducing the pattern, e.g. "You keep coming back to:"
  "triggers": string[],       // 2-3 short phrases describing WHEN this shows up, each starting with "You ", e.g. "You compare yourself to others".
  "margoQuestion": string,    // one sharp, open question Margo asks to move them one step forward, e.g. "What would 'enough' actually look like in one real moment this week?"
  "highlightPhrases": string[] // 2-4 phrases copied VERBATIM (exact substrings) from the transcript that most reveal this pattern. Copy them exactly as written, do not paraphrase.
}

Be specific to what they actually said. Never invent facts. Never diagnose. Keep it human, punchy, and non-clinical.`;

/**
 * Follow-up question for the live journaling conversation. Given the
 * conversation so far (Margo's prompts + what the user has said), produce the
 * single next question Margo should ask to gently deepen the entry.
 */
const FOLLOWUP_SYSTEM_PROMPT = `${MARGO_PERSONA}

You are in the middle of a live voice conversation. You are given the conversation so far: the questions you (Margo) already asked and what the person said in response.

Produce the SINGLE next question to ask. It must:
- build directly on what they just said (reference their own words/feelings, do not change the subject)
- be sharp, concrete, and interesting — never a generic "tell me more". Mix clarifying ("What was the exact moment your stomach dropped?"), reframing ("If this were a pattern, not a person, how would you describe it?"), and forward-moving ("What's one tiny boundary you'd test this week?") questions.
- be short and spoken in second person ("you")
- never repeat a question already asked
- never diagnose, lecture, or give advice; just move them one step forward
- carry Margo's warm, grounded, lightly sarcastic voice, but a question is not the place for a punchline — keep it pointed

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "question": string
}`;

/**
 * Cross-entry "Insights" — a period reflection that looks ACROSS many journal
 * entries from a chosen time range (today / week / month / all time) and names
 * the through-line: the recurring pattern, what's shifting, and one forward
 * question. This is the narrative at the top of the Insights screen.
 */
const INSIGHTS_SYSTEM_PROMPT = `${MARGO_PERSONA}

You are looking back across MULTIPLE journal entries from a single span of time (e.g. this week or this month). You are given a digest of those entries: each one's short topic, your earlier reflection, and a few of the person's own words. Find the through-line ACROSS entries — the pattern that keeps showing up, and what (if anything) is shifting over time.

Speak to the person directly ("you"). Be specific to what actually recurs across the entries — do not just summarize the most recent one. If there is only one entry or too little to compare, set "shift" to an empty string rather than inventing change.

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "headline": string,     // one warm, tight sentence naming the through-line of this period, spoken to the user. e.g. "This week kept circling back to whether you're allowed to rest."
  "throughLine": string,  // 1-2 short sentences: the recurring pattern across the entries, in their emotional language. Mirror it so they feel seen.
  "shift": string,        // one short sentence on what's changing or emerging across the entries (tone, frequency, a new name/feeling). EMPTY STRING "" if there isn't enough to compare.
  "question": string      // one pointed, open question that moves them one step forward for the period ahead.
}

Be specific. Never invent facts. Never diagnose. Keep it punchy, warm, lightly sarcastic, non-clinical. At most one small joke about the pattern, never about pain.`;

/**
 * Personalized daily practice. After an entry finishes, we build ONE small,
 * doable evening practice tailored to what the person actually said, grounded
 * in established, evidence-based therapeutic modalities:
 *
 *  - CBT cognitive restructuring (Beck / Burns) — thought records: name the
 *    automatic thought, weigh the evidence, build a balanced reframe.
 *  - ACT psychological flexibility (Steven Hayes) — cognitive defusion
 *    ("I'm having the thought that…"), values clarification, and committed
 *    (values-aligned) action.
 *  - DBT skills (Marsha Linehan) — Check the Facts, Opposite Action, and
 *    distress-tolerance / paced breathing for high-arousal moments.
 *  - Self-compassion (Kristin Neff) + Compassion-Focused Therapy (Paul
 *    Gilbert) — the three components: mindfulness, common humanity,
 *    self-kindness; the "talk to yourself like a good friend" reframe.
 *  - Behavioral activation — one tiny, concrete, scheduled action.
 *
 * The model PICKS the single most-fitting modality for what the person said
 * (it does not dump all of them), then shapes the steps around it.
 */
const PRACTICE_SYSTEM_PROMPT = `${MARGO_PERSONA}

The person just finished a journal entry. Design ONE short, doable evening practice (5-10 minutes) tailored SPECIFICALLY to what they said. This is the "do something with it" step after reflecting — it must feel personal, never generic.

You are well-read in evidence-based psychology. Silently choose the SINGLE modality that best fits what they're struggling with, then shape the practice around it. Do not name-drop the modality in a clinical way or lecture; weave it in naturally. The modalities you draw from:
- CBT thought records (Beck/Burns): surface the automatic thought, weigh evidence for/against, build a balanced reframe. Best for harsh self-talk, catastrophizing, all-or-nothing thinking.
- ACT (Hayes): cognitive defusion ("I'm having the thought that…"), values clarification, and one committed values-aligned action. Best for being fused/stuck on a thought, avoidance, or feeling disconnected from what matters.
- DBT (Linehan): Check the Facts, Opposite Action, paced breathing / distress tolerance. Best for intense, fast emotions, urges, or overwhelm.
- Self-compassion (Neff) + CFT (Gilbert): mindfulness of the pain, common humanity, self-kindness — "what would you say to a friend?" Best for shame, guilt, self-criticism, perfectionism.
- Behavioral activation: one tiny scheduled action. Best for low mood, withdrawal, "I can't be bothered".

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "title": string,            // a short, warm title for tonight's practice, 2-5 words, Title Case, no period. Specific to them, e.g. "Softening the Inner Critic" or "Naming the Real Fear".
  "intro": string,            // 1-2 short sentences in Margo's voice introducing why THIS practice, tonight, for them. Speak directly to "you". Reference the actual thing they said. At most one small, warm joke.
  "approachLabel": string,    // a tiny, friendly name for the technique (NOT clinical jargon), 2-4 words, e.g. "Talk to yourself like a friend", "Unhook from the thought", "Check the facts".
  "focusPrompt": string,      // the question for Step 1's single-choice. Short. e.g. "What's really driving this tonight?"
  "options": string[],        // 3-4 single-choice options for Step 1, written in first person ("I…"), each capturing a distinct, plausible read of what they said. The LAST one should be an open "Something else" style option. Specific to their entry, not generic.
  "deepenLabel": string,      // Step 2 label — the invitation to write. e.g. "Write a little more" or "Put the real thing into words".
  "deepenPrompt": string,     // the main open writing prompt for Step 2, tuned to the chosen modality (e.g. a defusion prompt, a thought-record prompt, or a self-compassion "what would you tell a friend" prompt). One pointed sentence, second person.
  "deepenFollowups": string[],// 2-3 short optional "write more about X" nudges the UI shows as chips to expand on (e.g. "What evidence actually supports that thought?", "Where do you feel it in your body?", "What's underneath the anger?"). Each is a short phrase or question.
  "skill": {                  // Step 3 — one tiny in-the-moment skill grounded in the chosen modality.
    "name": string,           // 2-4 words, e.g. "Name the thought", "One slow breath", "Opposite action".
    "instruction": string     // 1-2 short sentences telling them exactly what to do right now. Concrete, body-level, doable in under a minute.
  },
  "actions": string[],        // Step 4 — 3 tiny, concrete, values-aligned committed actions they could take before tomorrow. No platitudes. Specific to their entry. Each starts with a verb.
  "closingLine": string       // one short, warm line Margo leaves them with. Grounded, not cheesy. e.g. "Tiny is enough. That's the whole point."
}

Be specific to what they actually said. Never invent facts. Never diagnose. Never claim to be a therapist. Keep it human, warm, and non-clinical. If they mentioned self-harm or severe distress, make the practice gentle and grounding (paced breathing, reaching out to a trusted person) and let the closingLine gently point to human support.`;

interface ReflectionPattern {
  label: string;
  recurrenceLabel?: string;
}
type GraphNodeType = "person" | "situation" | "feeling";
interface GraphNodeSeed {
  label: string;
  type: GraphNodeType;
  mention: string;
}
interface GraphLinkSeed {
  source: string;
  target: string;
  relation: string;
}
interface EntryGraphSeed {
  nodes: GraphNodeSeed[];
  links: GraphLinkSeed[];
}
interface Reflection {
  topic: string;
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
  graph: EntryGraphSeed;
}

interface Insight {
  transitionLine: string;
  coreQuestion: string;
  summaryLine: string;
  triggers: string[];
  margoQuestion: string;
  highlightPhrases: string[];
}

interface Insights {
  headline: string;
  throughLine: string;
  shift: string;
  question: string;
}

interface PracticeSkill {
  name: string;
  instruction: string;
}
interface Practice {
  title: string;
  intro: string;
  approachLabel: string;
  focusPrompt: string;
  options: string[];
  deepenLabel: string;
  deepenPrompt: string;
  deepenFollowups: string[];
  skill: PracticeSkill;
  actions: string[];
  closingLine: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parse JSON from the model's text. We prefill the assistant turn with `{` and
 * ask for JSON only, but guard against stray prose by extracting the first
 * balanced-looking JSON object if a direct parse fails.
 */
function parseModelJson(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Validate + coerce the model's parsed JSON into a well-formed Reflection. */
function normalize(raw: unknown): Reflection | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) return null;

  const topic =
    typeof obj.topic === "string" && obj.topic.trim()
      ? obj.topic.trim()
      : "Journal entry";

  const patterns: ReflectionPattern[] = Array.isArray(obj.patterns)
    ? obj.patterns
        .map((p): ReflectionPattern | null => {
          if (!p || typeof p !== "object") return null;
          const label = (p as Record<string, unknown>).label;
          if (typeof label !== "string" || !label.trim()) return null;
          const rec = (p as Record<string, unknown>).recurrenceLabel;
          return {
            label: label.trim(),
            recurrenceLabel: typeof rec === "string" ? rec.trim() : undefined,
          };
        })
        .filter((p): p is ReflectionPattern => p !== null)
    : [];

  const nextSteps: string[] = Array.isArray(obj.nextSteps)
    ? obj.nextSteps
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim())
    : [];

  const graph = normalizeGraph(obj.graph);

  return { topic, summary, patterns, nextSteps, graph };
}

const GRAPH_TYPES: ReadonlySet<GraphNodeType> = new Set([
  "person",
  "situation",
  "feeling",
]);

/** Bare time references the model sometimes extracts as a "situation" or
 * "feeling" ("today", "tonight", "this morning"). They aren't real entities —
 * they're just when the entry happened — and they pollute every map with a
 * meaningless recurring "today" node, so we drop any node that is purely one of
 * these (optionally with a leading article/"this"/"that"/"last"/"next"). */
const TIME_WORD = new Set([
  "today",
  "tonight",
  "tomorrow",
  "yesterday",
  "now",
  "right now",
  "lately",
  "recently",
  "morning",
  "afternoon",
  "evening",
  "night",
  "day",
  "week",
  "weekend",
  "month",
  "year",
  "moment",
  "time",
]);

function isTimeWordLabel(label: string): boolean {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/, "")
    .replace(/^(the|a|an|this|that|these|those|last|next|each|every)\s+/, "")
    .trim();
  return TIME_WORD.has(cleaned);
}

/** Validate + coerce the model's graph seed; drops malformed nodes/links and
 * keeps only links whose endpoints both resolve to a kept node. Always returns
 * a well-formed (possibly empty) seed so the atom map never crashes. */
function normalizeGraph(raw: unknown): EntryGraphSeed {
  const empty: EntryGraphSeed = { nodes: [], links: [] };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;

  const seenLabels = new Set<string>();
  const nodes: GraphNodeSeed[] = Array.isArray(obj.nodes)
    ? obj.nodes
        .map((n): GraphNodeSeed | null => {
          if (!n || typeof n !== "object") return null;
          const o = n as Record<string, unknown>;
          const label = typeof o.label === "string" ? o.label.trim() : "";
          const type = o.type;
          if (!label || typeof type !== "string" || !GRAPH_TYPES.has(type as GraphNodeType))
            return null;
          // Drop bare time references ("today", "tonight") — they aren't real
          // people/situations/feelings and otherwise show up as a node on
          // every single map.
          if (isTimeWordLabel(label)) return null;
          const key = label.toLowerCase();
          if (seenLabels.has(key)) return null; // de-dupe within an entry
          seenLabels.add(key);
          const mention = typeof o.mention === "string" ? o.mention.trim() : "";
          return { label, type: type as GraphNodeType, mention };
        })
        .filter((n): n is GraphNodeSeed => n !== null)
    : [];

  const links: GraphLinkSeed[] = Array.isArray(obj.links)
    ? obj.links
        .map((l): GraphLinkSeed | null => {
          if (!l || typeof l !== "object") return null;
          const o = l as Record<string, unknown>;
          const source = typeof o.source === "string" ? o.source.trim() : "";
          const target = typeof o.target === "string" ? o.target.trim() : "";
          if (!source || !target || source.toLowerCase() === target.toLowerCase())
            return null;
          // Both endpoints must reference a kept node label.
          if (!seenLabels.has(source.toLowerCase()) || !seenLabels.has(target.toLowerCase()))
            return null;
          const relation = typeof o.relation === "string" ? o.relation.trim() : "";
          return { source, target, relation };
        })
        .filter((l): l is GraphLinkSeed => l !== null)
    : [];

  return { nodes, links };
}

function strArray(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim())
        .slice(0, max)
    : [];
}

/** Validate + coerce the model's parsed JSON into a well-formed Insight. */
function normalizeInsight(raw: unknown): Insight | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const coreQuestion = str(obj.coreQuestion);
  const margoQuestion = str(obj.margoQuestion);
  if (!coreQuestion || !margoQuestion) return null;

  return {
    transitionLine: str(obj.transitionLine) || "I hear something recurring here…",
    coreQuestion,
    summaryLine: str(obj.summaryLine) || "You keep coming back to:",
    triggers: strArray(obj.triggers, 3),
    margoQuestion,
    highlightPhrases: strArray(obj.highlightPhrases, 4),
  };
}

/** Validate + coerce the model's parsed JSON into a single follow-up question. */
function normalizeFollowup(raw: unknown): { question: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const question = typeof obj.question === "string" ? obj.question.trim() : "";
  if (!question) return null;
  return { question };
}

/** Validate + coerce the model's parsed JSON into a well-formed Insights. */
function normalizeInsights(raw: unknown): Insights | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const headline = str(obj.headline);
  const throughLine = str(obj.throughLine);
  // The headline + through-line are the heart of the period reflection.
  if (!headline || !throughLine) return null;

  return {
    headline,
    throughLine,
    shift: str(obj.shift),
    question: str(obj.question),
  };
}

/** Validate + coerce the model's parsed JSON into a well-formed Practice. */
function normalizePractice(raw: unknown): Practice | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const intro = str(obj.intro);
  const deepenPrompt = str(obj.deepenPrompt);
  // The intro + the main writing prompt are the heart of the practice; if
  // either is missing the payload isn't usable.
  if (!intro || !deepenPrompt) return null;

  const skillRaw =
    obj.skill && typeof obj.skill === "object"
      ? (obj.skill as Record<string, unknown>)
      : {};
  const skill: PracticeSkill = {
    name: str(skillRaw.name) || "One slow breath",
    instruction:
      str(skillRaw.instruction) ||
      "Take one slow breath. Notice your feet on the floor. You're here.",
  };

  const options = strArray(obj.options, 4);
  const actions = strArray(obj.actions, 3);

  return {
    title: str(obj.title) || "Tonight's Practice",
    intro,
    approachLabel: str(obj.approachLabel) || "A small experiment",
    focusPrompt: str(obj.focusPrompt) || "What feels most true tonight?",
    options:
      options.length >= 2
        ? options
        : [
            "I'm carrying more than I let on",
            "I'm being hard on myself",
            "Something else is going on",
          ],
    deepenLabel: str(obj.deepenLabel) || "Put it into words",
    deepenPrompt,
    deepenFollowups: strArray(obj.deepenFollowups, 3),
    skill,
    actions:
      actions.length >= 1
        ? actions
        : ["Take three slow breaths before bed."],
    closingLine: str(obj.closingLine) || "Tiny is enough. That's the point.",
  };
}

/** Call Claude with a system prompt + user content; returns the text block. */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number = MAX_TOKENS,
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, detail: await response.text() };
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((b) => b.type === "text")?.text;
  if (!text) return { ok: false, status: 502, detail: "Model returned no content" };
  return { ok: true, text };
}

export function reflectionPlugin(apiKey: string | undefined): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || !req.url.startsWith(REFLECTION_PATH)) {
      next();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    // Signal "not configured" so the client can fall back to its mock.
    if (!apiKey) {
      sendJson(res, 501, {
        error:
          "ANTHROPIC_API_KEY is not set. Add it to a .env file (no VITE_ prefix) and restart the dev server.",
      });
      return;
    }

    let transcript = "";
    let mode: "reflection" | "insight" | "insights" | "followup" | "practice" =
      "reflection";
    let name = "";
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as {
        transcript?: string;
        mode?: string;
        name?: string;
      };
      transcript = parsed.transcript ?? "";
      if (parsed.mode === "insight") mode = "insight";
      else if (parsed.mode === "insights") mode = "insights";
      else if (parsed.mode === "followup") mode = "followup";
      else if (parsed.mode === "practice") mode = "practice";
      name = (parsed.name ?? "").trim();
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    if (!transcript.trim()) {
      sendJson(res, 400, { error: "Empty transcript" });
      return;
    }

    try {
      if (mode === "insight") {
        const userContent = `${
          name ? `The person's name is ${name}. ` : ""
        }Here is their first spoken journal entry:\n\n${transcript}\n\nRespond with ONLY the JSON object, no prose or markdown fences.`;

        const result = await callClaude(apiKey, INSIGHT_SYSTEM_PROMPT, userContent);
        if (!result.ok) {
          sendJson(res, result.status, {
            error: "Insight generation failed",
            detail: result.detail,
          });
          return;
        }

        const insight = normalizeInsight(parseModelJson(result.text));
        if (!insight) {
          sendJson(res, 502, { error: "Model returned malformed insight" });
          return;
        }
        sendJson(res, 200, insight);
        return;
      }

      if (mode === "followup") {
        const userContent = `${
          name ? `The person's name is ${name}. ` : ""
        }Here is the journaling conversation so far:\n\n${transcript}\n\nRespond with ONLY the JSON object containing the single next question, no prose or markdown fences.`;

        const result = await callClaude(apiKey, FOLLOWUP_SYSTEM_PROMPT, userContent);
        if (!result.ok) {
          sendJson(res, result.status, {
            error: "Follow-up generation failed",
            detail: result.detail,
          });
          return;
        }

        const followup = normalizeFollowup(parseModelJson(result.text));
        if (!followup) {
          sendJson(res, 502, { error: "Model returned malformed follow-up" });
          return;
        }
        sendJson(res, 200, followup);
        return;
      }

      if (mode === "insights") {
        const userContent = `${
          name ? `The person's name is ${name}. ` : ""
        }Here is a digest of their journal entries from this time range (oldest to newest):\n\n${transcript}\n\nFind the through-line across these entries. Respond with ONLY the JSON object, no prose or markdown fences.`;

        const result = await callClaude(
          apiKey,
          INSIGHTS_SYSTEM_PROMPT,
          userContent,
        );
        if (!result.ok) {
          sendJson(res, result.status, {
            error: "Insights generation failed",
            detail: result.detail,
          });
          return;
        }

        const insights = normalizeInsights(parseModelJson(result.text));
        if (!insights) {
          sendJson(res, 502, { error: "Model returned malformed insights" });
          return;
        }
        sendJson(res, 200, insights);
        return;
      }

      if (mode === "practice") {
        const userContent = `${
          name ? `The person's name is ${name}. ` : ""
        }Here is the transcript of their journal entry:\n\n${transcript}\n\nDesign tonight's personalized practice. Respond with ONLY the JSON object, no prose or markdown fences.`;

        const result = await callClaude(
          apiKey,
          PRACTICE_SYSTEM_PROMPT,
          userContent,
          PRACTICE_MAX_TOKENS,
        );
        if (!result.ok) {
          sendJson(res, result.status, {
            error: "Practice generation failed",
            detail: result.detail,
          });
          return;
        }

        const practice = normalizePractice(parseModelJson(result.text));
        if (!practice) {
          sendJson(res, 502, { error: "Model returned malformed practice" });
          return;
        }
        sendJson(res, 200, practice);
        return;
      }

      const result = await callClaude(
        apiKey,
        SYSTEM_PROMPT,
        `Here is my journal entry transcript:\n\n${transcript}\n\nRespond with ONLY the JSON object, no prose or markdown fences.`,
      );
      if (!result.ok) {
        sendJson(res, result.status, {
          error: "Reflection generation failed",
          detail: result.detail,
        });
        return;
      }

      // The model returns the JSON object directly; parseModelJson tolerates
      // any stray prose or markdown fences around it.
      const reflection = normalize(parseModelJson(result.text));
      if (!reflection) {
        sendJson(res, 502, { error: "Model returned malformed reflection" });
        return;
      }

      sendJson(res, 200, reflection);
    } catch (err) {
      sendJson(res, 502, {
        error: "Could not reach the reflection model",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    name: "margo-reflection",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
