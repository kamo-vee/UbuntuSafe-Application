import blocklist from "./rules/blocklist.json";
import allowlist from "./rules/allowlist.json";
import jobPatterns from "./rules/jobPatterns.json";
import english from "./rules/english.json";
import setswana from "./rules/setswana.json";
import sepedi from "./rules/sepedi.json";
import xitsonga from "./rules/xitsonga.json";
import isixhosa from "./rules/isixhosa.json";
import isizulu from "./rules/isizulu.json";

export type ScanKind = "message" | "voice" | "email" | "link" | "job";
export type LocalVerdict = {
  status: "safe" | "warning" | "danger";
  title: string;
  detail: string;
  signals: string[];
};
const languageRules = [english, setswana, sepedi, xitsonga, isixhosa, isizulu];

function normalise(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
function hasPattern(value: string, patterns: string[]) {
  return patterns.filter((pattern) => {
    try {
      return new RegExp(pattern, "iu").test(value);
    } catch {
      return false;
    }
  });
}

function parseLinkToken(token: string): URL | null {
  const cleaned = token
    .replace(/^[<([{"']+/, "")
    .replace(/[>,.;!?)\]}"']+$/g, "");
  if (!cleaned || /\s/.test(cleaned)) return null;
  const candidate = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned.replace(/^www\./i, "")}`;
  try {
    const url = new URL(candidate);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      !/^[a-z0-9.-]+$/i.test(url.hostname)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function linkTokens(content: string) {
  return content
    .split(/[\s,]+/)
    .map((token) => parseLinkToken(token))
    .filter((url): url is URL => Boolean(url));
}

function isLinkOnly(content: string) {
  const tokens = content.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => parseLinkToken(token));
}

const jobContextPatterns = [
  "\\b(job|jobs|vacanc(?:y|ies)|position|recruit(?:ment|er|ing)?|employment|career|work opportunity|tender|procurement|bid|rfp|rfq|request for (?:proposal|quotation)s?)\\b",
  "\\b(mme(?:r)?iro|tiro|thendara|go reka|go dira|go thapiwa tiro)\\b",
  "\\b(mošomo|thendara|kgopelo ya (?:ditšhišinyo|ditheko))\\b",
  "\\b(ntirho|thendara|xitiviso xa (?:ntirho|thendara))\\b",
  "\\b(umsebenzi|imisebenzi|ithenda|isikhala somsebenzi|ukuqashwa)\\b",
  "\\b(umsebenzi|imisebenzi|ithenda|isikhala somsebenzi|ukuqeshwa)\\b",
];
const dangerPatterns = [
  "\\b(send|transfer|wire)\\s+(me\\s+)?money\\b",
  "\\b(romela|roma)\\s+(madi|tšhelete|mali)\\b",
  "\\bthumela\\s+imali\\b",
  "\\brhumela\\s+mali\\b",
  "\\b(share|send|give|tell me)\\s+(your\\s+)?(otp|one[- ]time pin|pin|password|passcode)\\b",
  "\\b(romela|share|send)\\s+(khoutu|sephiri|iphasiwedi|ikhodi|phasewete|paswedi)\\b",
  "\\b(pay|duela|lefa|hakela|khokha|hlawula)\\s+(a\\s+)?(registration|application|training|processing)?\\s*(fee|fees|tefelo|hakelo)\\b",
  "\\b(remote access|install (?:this )?app|screen sharing)\\b",
  "\\bverify\\s+(your\\s+)?(bank|account)\\s+(now|immediately)\\b",
];

export function scanOffline(kind: ScanKind, rawContent: string): LocalVerdict {
  const content = normalise(rawContent);
  if (!content) throw new Error("Enter content to check.");
  if (content.length > 12000)
    throw new Error("Content must be 12,000 characters or less.");

  if (kind === "link") {
    const tokens = content.split(/[\s,]+/).filter(Boolean);
    if (!tokens.length || tokens.some((token) => !parseLinkToken(token)))
      throw new Error(
        "Link check accepts web links only. Remove any surrounding message text.",
      );
  } else if (kind === "job") {
    if (
      !jobContextPatterns.some((pattern) =>
        new RegExp(pattern, "iu").test(content),
      )
    )
      throw new Error(
        "Job check accepts job advertisements or tender notices only.",
      );
  } else if (
    (kind === "message" || kind === "email") &&
    isLinkOnly(content)
  ) {
    throw new Error("This is a link, not a message. Open Link check to scan it.");
  } else if (kind === "voice" && isLinkOnly(content)) {
    throw new Error("Paste the words spoken in the voice message, not a link.");
  }

  const signals = [
    ...languageRules.flatMap((rules) =>
      hasPattern(content, rules.scamPatterns),
    ),
    ...hasPattern(content, blocklist.patterns),
    ...(kind === "job" ? hasPattern(content, jobPatterns.patterns) : []),
  ];
  if (kind === "link") {
    for (const url of linkTokens(content)) {
      const host = url.hostname.toLowerCase();
      if (
        blocklist.domains.some(
          (domain) => host === domain || host.endsWith(`.${domain}`),
        )
      ) {
        signals.push(host);
      } else if (
        !allowlist.domains.some(
          (domain) => host === domain || host.endsWith(`.${domain}`),
        )
      ) {
        signals.push(`unverified-domain:${host}`);
      }
    }
  }
  const danger =
    dangerPatterns.some((pattern) => new RegExp(pattern, "iu").test(content)) ||
    signals.some((signal) =>
      blocklist.domains.some((domain) => signal.includes(domain)),
    );
  const status = danger ? "danger" : signals.length ? "warning" : "safe";
  return {
    status,
    title:
      status === "safe"
        ? "This looks safe"
        : status === "danger"
          ? "Do not continue"
          : "Review before you continue",
    detail:
      status === "safe"
        ? kind === "voice"
          ? "No common scam signals were found in this voice transcript. Verify unexpected requests."
          : "No common scam signals were found offline. Stay alert and verify unexpected requests."
        : status === "danger"
          ? "Strong scam signals were found. Do not send money, passwords, PINs, or remote access."
          : "Potential scam signals were found. Verify the sender or company independently before acting.",
    signals,
  };
}
