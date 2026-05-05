import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const MODEL = "claude-sonnet-4-5";

// Fields Claude is allowed to fill
const FILLABLE_FIELDS: Array<{ key: string; label: string; long: boolean }> = [
  { key: "primaryCategory",    label: "Primary category",      long: false },
  { key: "subCategory",        label: "Sub-category",          long: false },
  { key: "platform",           label: "Platform",              long: false },
  { key: "hookType",           label: "Hook type",             long: false },
  { key: "formatType",         label: "Format type",           long: false },
  { key: "ctaType",            label: "CTA type",              long: false },
  { key: "creativeAngle",      label: "Creative angle",        long: false },
  { key: "funnelStage",        label: "Funnel stage",          long: false },
  { key: "personaTarget",      label: "Persona target",        long: false },
  { key: "urlType",            label: "URL type",              long: false },
  { key: "assetStatus",        label: "Asset status",          long: false },
  { key: "complianceRisk",     label: "Compliance risk",       long: false },
  { key: "strategicTag",       label: "Strategic tag",         long: false },
  { key: "hookExample",        label: "Hook example",          long: true  },
  { key: "whyItWorks",         label: "Why it works",          long: true  },
  { key: "howToReplicate",     label: "How to replicate",      long: true  },
  { key: "valueForUs",         label: "Value for us",          long: true  },
  { key: "useCaseForUs",       label: "Use case for us",       long: true  },
  { key: "aiAvatarAdaptation", label: "AI avatar adaptation",  long: true  },
  { key: "notes",              label: "Notes",                 long: true  },
];

// POST /api/ai/complete — streams field suggestions as SSE
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ error: "ANTHROPIC_API_KEY not set in environment." })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json();
  const ad: Record<string, unknown> = body.ad ?? {};
  const fieldsToFill: string[] = body.fields ?? [];

  // Determine which fields are empty and requested
  const targets = FILLABLE_FIELDS.filter(
    ({ key }) => fieldsToFill.includes(key) && (ad[key] == null || String(ad[key]).trim() === "")
  );

  if (targets.length === 0) {
    return new Response(
      `data: ${JSON.stringify({ error: "No empty fields to fill." })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // Build context from existing ad fields
  const context = Object.entries(ad)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`)
    .join("\n");

  const fieldList = targets
    .map(({ key, label, long }) => `- "${key}" (${label})${long ? " [multi-sentence]" : " [brief]"}`)
    .join("\n");

  const prompt = `You are an expert ad analyst for a weight loss / peptide / AI-avatar marketing company.

You are analysing a competitor or reference ad. Based on the existing ad data below, fill in the missing fields with accurate, insightful content.

EXISTING AD DATA:
${context || "(no existing data — infer from the URL or platform if available)"}

FIELDS TO FILL (return JSON with only these keys):
${fieldList}

Rules:
- Return ONLY valid JSON — no markdown, no explanation, no wrapping text
- For "brief" fields: 1–5 words, specific and factual (e.g. platform: "TikTok", hookType: "Problem-agitate")
- For "multi-sentence" fields: 2–5 sentences, specific to this ad and our peptide/weight-loss business
- whyItWorks: explain the psychological or structural reason this ad works
- howToReplicate: specific steps to recreate for our AI-avatar / peptide brand
- valueForUs: what we can learn or steal from this ad
- useCaseForUs: specific campaign or funnel position where this would work for us
- aiAvatarAdaptation: how to adapt this with an AI avatar — appearance, tone, setting
- If you cannot confidently fill a field from the context, use null
- Do NOT invent URLs or metrics
- complianceRisk options: "Low", "Medium — health claims", "High — before/after imagery", "High — medical claims"
- assetStatus options: "To replicate", "In production", "Done", "Archived"
- funnelStage options: "Awareness", "Interest", "Consideration", "Conversion", "Retention"
- urlType options: "youtube", "search", "direct", "none"

Respond with a single JSON object.`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Use streaming messages API
        const messageStream = await client.messages.create({
          model: MODEL,
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        });

        let fullText = "";

        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            // Stream progress token
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`)
            );
          }
          if (event.type === "message_stop") {
            // Parse the complete JSON and send as final result
            try {
              // Strip any accidental markdown fences
              const cleaned = fullText.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
              const parsed = JSON.parse(cleaned) as Record<string, string | null>;

              // Filter to only fillable keys and remove nulls
              const result: Record<string, string> = {};
              targets.forEach(({ key }) => {
                const val = parsed[key];
                if (val != null && String(val).trim() !== "") {
                  result[key] = String(val);
                }
              });

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ result })}\n\n`)
              );
            } catch {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: "Failed to parse AI response as JSON." })}\n\n`)
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
