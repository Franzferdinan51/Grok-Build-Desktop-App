let meta = #{
    name: "telegram-enhance",
    description: "Pull contract-safe Telegram agent UX from Hermes Agent and OpenClaw into Grok Build Desktop",
    when_to_use: "When the user wants Telegram channel enhancements without adding a second agent runtime",
    phases: [
        #{ title: "Discover", detail: "scan Hermes and OpenClaw Telegram surfaces" },
        #{ title: "Rank", detail: "keep only missing, contract-safe channel UX" },
        #{ title: "Pull", detail: "implement ranked picks in the existing Solid/Electron bridge" },
    ],
};

let candidates_schema = #{
    "type": "object",
    "required": ["candidates"],
    "properties": #{
        "candidates": #{
            "type": "array",
            "maxItems": 6,
            "items": #{
                "type": "object",
                "required": ["title", "source", "target", "why"],
                "properties": #{
                    "title": #{ "type": "string" },
                    "source": #{ "type": "string" },
                    "target": #{ "type": "string" },
                    "why": #{ "type": "string" },
                    "risk": #{ "type": "string" },
                },
            },
        },
    },
};

let report_schema = #{
    "type": "object",
    "required": ["pulled", "skipped", "summary"],
    "properties": #{
        "pulled": #{ "type": "array", "items": #{ "type": "string" } },
        "skipped": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let desktop = if args == () { () } else { args.desktop };
if desktop == () { desktop = "/Users/duckets/Desktop/Grok-Build-Desktop-App"; }

let contract = "Product contract: Grok Build is the only coding backend; transport stays grok -p --output-format streaming-json; do not import Hermes or OpenClaw as a runtime; Telegram tokens stay in main/safeStorage; adapt UX into packages/desktop/src/main/telegram*.ts and telegram/agent-handler.ts.";

phase("Discover");
let jobs = [];

let p1 = "Scan Hermes Agent Telegram UX that Grok Build Desktop can adapt. ";
p1 += "Read https://github.com/NousResearch/hermes-agent docs for telegram if needed, and local " + desktop + "/docs/TELEGRAM.md plus packages/desktop/src/main/telegram.ts, telegram-ux.ts, telegram/agent-handler.ts, telegram/commands.ts. ";
p1 += contract + " ";
p1 += "Return at most 6 missing, contract-safe candidates as {title, source, target, why, risk}.";
jobs.push(#{ prompt: p1, label: "discover:hermes", capability_mode: "read-only", output_schema: candidates_schema });

let p2 = "Scan OpenClaw Telegram pairing, mention, approval-button, and queue-control UX. ";
p2 += "Compare to " + desktop + " packages/desktop/src/main/telegram-connection.ts and telegram/agent-handler.ts. ";
p2 += contract + " Reject Slack/Discord/WhatsApp extra runtimes and any Hermes/OpenClaw gateway. ";
p2 += "Return at most 6 missing, contract-safe candidates as {title, source, target, why, risk}.";
jobs.push(#{ prompt: p2, label: "discover:openclaw", capability_mode: "read-only", output_schema: candidates_schema });

let results = parallel(jobs);
let candidates = [];
for r in results {
    if r != () && r.success && r.output.candidates != () {
        for c in r.output.candidates { candidates.push(c); }
    }
}
if candidates.len() == 0 { complete(#{ summary: "No Telegram enhancement candidates.", pulled: [], skipped: [] }); }

phase("Rank");
let rank_prompt = "Rank these Telegram enhancement candidates for Grok Build Desktop. ";
rank_prompt += contract + " ";
rank_prompt += "Keep only missing, user-visible, contract-safe channel UX. Drop second runtimes, webhooks-as-a-service, STT/TTS, and local Bot API servers. ";
rank_prompt += "Return at most 4 as {title, source, target, why, risk}. Candidates JSON: ";
rank_prompt += json_encode(candidates);
let ranked = agent(rank_prompt, #{
    label: "rank",
    capability_mode: "read-only",
    output_schema: candidates_schema,
});
let picks = [];
if ranked != () && ranked.success && ranked.output.candidates != () {
    for c in ranked.output.candidates { picks.push(c); }
}
if picks.len() == 0 { complete(#{ summary: "No contract-safe Telegram pulls.", pulled: [], skipped: [] }); }

phase("Pull");
let impl = "Implement the ranked Telegram pulls in Grok Build Desktop at " + desktop + ". ";
impl += contract + " ";
impl += "Use existing Solid/Electron files. Keep changes scoped. Add unit tests next to helpers. Do not commit or push. ";
impl += "Ranked picks JSON: " + json_encode(picks) + " ";
impl += "After editing, run pnpm --filter @grok-build/desktop typecheck and test:unit if feasible. Return {pulled, skipped, summary}.";
let done = agent(impl, #{
    label: "implement",
    capability_mode: "read-write",
    output_schema: report_schema,
});
if done != () && done.success && done.output.summary != () {
    complete(#{
        summary: done.output.summary,
        pulled: done.output.pulled,
        skipped: done.output.skipped,
        picks: picks,
    });
}
complete(#{ summary: "Implementer did not return a report.", pulled: [], skipped: [], picks: picks });
