/**
 * The contract template language, and the vocabulary a template can draw on.
 *
 * A contract carries two different things: the structured terms the app runs on
 * (deliverables, payments, product, rights — everything confirmation turns into work),
 * and the wording a company's lawyer chose. The first is ours and mandatory, the second
 * is theirs and free. Slots are the seam: a template is the company's text with the
 * variable parts marked, and rendering fills those parts from the deal.
 *
 * The language is a deliberately small Mustache subset — values, if/else, each — with no
 * arithmetic and no free logic. Anything that needs computing (per-piece rates, clause
 * numbering, what counts as a cash fee) is computed by the app and exposed as a value,
 * so a template can place a fact but never derive one. That is what keeps a template
 * from promising a figure the pricing never produced.
 *
 *   {{creator.party}}                       a value
 *   {{#if commission}} … {{else}} … {{/if}} a block shown when the value is set/non-empty
 *   {{#each deliverables.items}} {{@index}}. {{title}} {{/each}}
 *   {{! a comment, dropped on render }}
 */

export type SlotKind = "value" | "flag" | "list" | "block";

export interface SlotSpec {
  /** Dotted path as written inside {{ }}. List item fields are written "list[].field". */
  path: string;
  label: string;
  /** What fills it, and where the app gets it — shown to the person mapping a template. */
  description: string;
  kind: SlotKind;
  /** Which requirement group this satisfies, if any. */
  satisfies?: RequirementGroup;
  example: string;
}

/**
 * What every template must be able to say, whatever its wording. These are the parts
 * the app has to be able to fill for the downstream chain to hold: confirmation reads
 * deliverables and compensation back out of the signed copy, and a contract that names
 * neither party is not a contract. A template missing a group saves as incomplete.
 */
export type RequirementGroup = "parties" | "deliverables" | "compensation";

export const REQUIREMENT_LABEL: Record<RequirementGroup, string> = {
  parties: "Names both parties",
  deliverables: "States the deliverables",
  compensation: "States the compensation",
};

export const CONTRACT_SLOTS: SlotSpec[] = [
  // Parties
  { path: "brand.name", label: "Brand legal name", description: "From Settings → Brand profile.", kind: "value", satisfies: "parties", example: "Ryoko Ltd" },
  { path: "brand.signatory", label: "Brand signatory", description: "The sender name in the brand profile.", kind: "value", example: "Thomas N." },
  { path: "brand.product", label: "Product name", description: "From the brand profile.", kind: "value", example: "Ryoko Core 2" },
  { path: "creator.party", label: "Creator party", description: "Company name, represented by the legal name when both are known; else the legal name; else the handle.", kind: "value", satisfies: "parties", example: "Weglewski Media LLC, represented by Jim Weglewski" },
  { path: "creator.legalName", label: "Creator legal name", description: "Filled by the creator through their portal.", kind: "value", example: "Jim Weglewski" },
  { path: "creator.companyName", label: "Creator company", description: "Filled by the creator through their portal, if they invoice through a company.", kind: "value", example: "Weglewski Media LLC" },
  { path: "creator.handle", label: "Creator handle", description: "The channel handle the deal was opened under.", kind: "value", example: "jim.weglewski.explores" },
  { path: "creator.email", label: "Creator email", description: "From the creator record.", kind: "value", example: "james@example.com" },
  { path: "creator.taxId", label: "Creator tax ID", description: "Filled by the creator through their portal; empty until then.", kind: "value", example: "12-3456789" },
  { path: "creator.address", label: "Creator address", description: "Filled by the creator through their portal; a placeholder until then.", kind: "value", example: "1 Main St, Los Angeles, CA" },

  // Deliverables
  { path: "deliverables.lines", label: "Deliverables, numbered", description: "One line per content item — \"1.1 YouTube integration — publish by 2026-10-01\". Falls back to the deal's scope text.", kind: "block", satisfies: "deliverables", example: "  1.1 YouTube integration — publish by 2026-10-01" },
  { path: "deliverables.text", label: "Deliverables, one line", description: "The deal's scope as the manager wrote it — \"3x YouTube integrations\".", kind: "value", satisfies: "deliverables", example: "3x YouTube integrations" },
  { path: "deliverables.items", label: "Deliverables list", description: "For {{#each}}: one entry per content item.", kind: "list", satisfies: "deliverables", example: "" },
  { path: "deliverables.items[].title", label: "  item title", description: "", kind: "value", example: "YouTube integration" },
  { path: "deliverables.items[].platform", label: "  item platform", description: "", kind: "value", example: "youtube" },
  { path: "deliverables.items[].dueDate", label: "  item publish-by date", description: "Empty when no date is set.", kind: "value", example: "2026-10-01" },
  { path: "deliverables.count", label: "Deliverables count", description: "How many pieces of content.", kind: "value", example: "3" },
  { path: "platforms", label: "Platforms", description: "Comma-separated — \"YouTube, Instagram\".", kind: "value", example: "YouTube" },

  // Compensation
  { path: "compensation.lines", label: "Compensation, numbered", description: "The app's full clause: fee or payment schedule, commission with attribution and payout terms, gifted product, and an explicit \"no fixed fee\" line when there is none. Numbered 2.1, 2.2 …", kind: "block", satisfies: "compensation", example: "  2.1 Fixed fee: $900" },
  { path: "fee", label: "Fee", description: "The agreed cash fee as money — \"$900\". Empty when there is no fee.", kind: "value", satisfies: "compensation", example: "$900" },
  { path: "hasFee", label: "Has a cash fee", description: "For {{#if}}: true when a fee or payment schedule exists. Use it to show invoice terms only when there is something to invoice.", kind: "flag", example: "" },
  { path: "payments.items", label: "Payment schedule", description: "For {{#each}}: one entry per instalment when the deal has a schedule.", kind: "list", satisfies: "compensation", example: "" },
  { path: "payments.items[].amount", label: "  instalment amount", description: "", kind: "value", example: "$450" },
  { path: "payments.items[].description", label: "  instalment description", description: "", kind: "value", example: "on signature" },
  { path: "payments.items[].condition", label: "  instalment condition", description: "\"payable after 2 deliverables are live and verified\", or empty.", kind: "value", example: "payable after 2 deliverables are live and verified" },
  { path: "commission", label: "Commission", description: "For {{#if}}: set when the deal pays commission (its own terms, else the Playbook default the pricing used).", kind: "flag", satisfies: "compensation", example: "" },
  { path: "commission.rate", label: "Commission rate", description: "\"10% of net sales\" or \"$20 per order\".", kind: "value", example: "$20 per order" },
  { path: "commission.attributionDays", label: "Attribution window (days)", description: "", kind: "value", example: "30" },
  { path: "commission.clause", label: "Commission clause", description: "The app's full sentence: rate, attribution window, net-sales basis, monthly payout.", kind: "value", example: "Commission: $20 per order attributed to …" },
  { path: "product", label: "Gifted product", description: "For {{#if}}: set when something ships to the creator.", kind: "flag", example: "" },
  { path: "product.items", label: "Gifted products", description: "For {{#each}}: one entry per shipment.", kind: "list", example: "" },
  { path: "product.items[].name", label: "  product", description: "", kind: "value", example: "Ryoko Core 2 watch" },
  { path: "product.items[].value", label: "  retail value", description: "As money, or empty.", kind: "value", example: "$70" },
  { path: "product.summary", label: "Gifted product, one line", description: "\"Ryoko Core 2 watch (retail value $70)\"; several joined with commas.", kind: "value", example: "Ryoko Core 2 watch (retail value $70)" },

  // Rights and dates
  { path: "rights.clause", label: "Usage rights clause", description: "Written from the rights the deal was priced for — the parser checks the signed copy against the same structure.", kind: "value", example: "Organic posting on the Creator's own channels only." },
  { path: "today", label: "Today's date", description: "YYYY-MM-DD.", kind: "value", example: "2026-09-02" },
];

const SLOT_BY_PATH = new Map(CONTRACT_SLOTS.map((s) => [s.path, s]));

// ---------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------

type Node =
  | { type: "text"; text: string }
  | { type: "value"; path: string; line: number }
  | { type: "if"; path: string; line: number; then: Node[]; otherwise: Node[] }
  | { type: "each"; path: string; line: number; body: Node[] };

interface Token {
  kind: "text" | "value" | "if" | "else" | "endif" | "each" | "endeach" | "comment";
  text: string;
  path: string;
  line: number;
}

const TAG = /\{\{\s*(#if|#each|\/if|\/each|else|!)?\s*([^{}]*?)\s*\}\}/g;

/**
 * A block tag alone on its line takes the line with it, so `{{#if commission}}` on its
 * own line does not leave a blank one behind when the block is skipped. Values are not
 * standalone: "{{fee}}" on its own line is a line of output.
 */
const STANDALONE = /^[ \t]*(\{\{\s*(?:#if|#each|\/if|\/each|else|!)\b[^{}]*\}\})[ \t]*(?:\r?\n|$)/gm;

function tokenize(body: string): Token[] {
  const src = body.replace(STANDALONE, "$1");
  const tokens: Token[] = [];
  let last = 0;
  let line = 1;
  const advance = (text: string) => {
    for (const ch of text) if (ch === "\n") line += 1;
  };
  for (const m of src.matchAll(TAG)) {
    const at = m.index ?? 0;
    if (at > last) {
      const text = src.slice(last, at);
      tokens.push({ kind: "text", text, path: "", line });
      advance(text);
    }
    const [whole, op, inner] = m;
    const tagLine = line;
    const kind: Token["kind"] =
      op === "#if" ? "if"
      : op === "#each" ? "each"
      : op === "/if" ? "endif"
      : op === "/each" ? "endeach"
      : op === "else" ? "else"
      : op === "!" ? "comment"
      : "value";
    tokens.push({ kind, text: whole, path: inner.trim(), line: tagLine });
    advance(whole);
    last = at + whole.length;
  }
  if (last < src.length) tokens.push({ kind: "text", text: src.slice(last), path: "", line });
  return tokens;
}

export interface TemplateError {
  line: number;
  message: string;
}

function parse(tokens: Token[]): { nodes: Node[]; errors: TemplateError[] } {
  const errors: TemplateError[] = [];
  let i = 0;

  function block(until: Set<Token["kind"]>, opener?: Token): { nodes: Node[]; closer: Token | null } {
    const nodes: Node[] = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (until.has(t.kind)) return { nodes, closer: t };
      i += 1;
      switch (t.kind) {
        case "text":
          nodes.push({ type: "text", text: t.text });
          break;
        case "comment":
          break;
        case "value":
          if (!t.path) errors.push({ line: t.line, message: "Empty {{ }} tag." });
          else nodes.push({ type: "value", path: t.path, line: t.line });
          break;
        case "if": {
          if (!t.path) errors.push({ line: t.line, message: "{{#if}} needs a slot name." });
          const then = block(new Set(["else", "endif"]), t);
          let otherwise: Node[] = [];
          if (then.closer?.kind === "else") {
            i += 1;
            const rest = block(new Set(["endif"]), t);
            otherwise = rest.nodes;
            if (!rest.closer) errors.push({ line: t.line, message: `{{#if ${t.path}}} is never closed.` });
            else i += 1;
          } else if (!then.closer) {
            errors.push({ line: t.line, message: `{{#if ${t.path}}} is never closed.` });
          } else {
            i += 1;
          }
          nodes.push({ type: "if", path: t.path, line: t.line, then: then.nodes, otherwise });
          break;
        }
        case "each": {
          if (!t.path) errors.push({ line: t.line, message: "{{#each}} needs a list name." });
          const body = block(new Set(["endeach"]), t);
          if (!body.closer) errors.push({ line: t.line, message: `{{#each ${t.path}}} is never closed.` });
          else i += 1;
          nodes.push({ type: "each", path: t.path, line: t.line, body: body.nodes });
          break;
        }
        case "else":
        case "endif":
        case "endeach":
          errors.push({
            line: t.line,
            message: `${t.text.trim()} has no matching opener${opener ? ` (inside {{#${opener.kind} ${opener.path}}})` : ""}.`,
          });
          break;
      }
    }
    return { nodes, closer: null };
  }

  const { nodes } = block(new Set());
  return { nodes, errors };
}

// ---------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------

export type SlotValue = string | number | boolean | null | undefined | SlotValue[] | { [key: string]: SlotValue };

function lookup(path: string, scopes: SlotValue[]): SlotValue {
  const parts = path.split(".");
  for (let s = scopes.length - 1; s >= 0; s--) {
    let cur: SlotValue = scopes[s];
    let ok = true;
    for (const p of parts) {
      if (cur != null && typeof cur === "object" && !Array.isArray(cur) && p in cur) cur = cur[p];
      else { ok = false; break; }
    }
    if (ok) return cur;
  }
  return undefined;
}

function truthy(v: SlotValue): boolean {
  if (v == null || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function stringify(v: SlotValue): string {
  if (v == null || v === false) return "";
  if (v === true) return "yes";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(stringify).join(", ");
  return "";
}

function renderNodes(nodes: Node[], scopes: SlotValue[]): string {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        out += n.text;
        break;
      case "value":
        out += stringify(lookup(n.path, scopes));
        break;
      case "if":
        out += renderNodes(truthy(lookup(n.path, scopes)) ? n.then : n.otherwise, scopes);
        break;
      case "each": {
        const list = lookup(n.path, scopes);
        if (!Array.isArray(list)) break;
        list.forEach((item, idx) => {
          const scope: SlotValue =
            item != null && typeof item === "object" && !Array.isArray(item)
              ? { ...item, "@index": idx + 1 }
              : { "@index": idx + 1, this: item };
          out += renderNodes(n.body, [...scopes, scope]);
        });
        break;
      }
    }
  }
  return out;
}

/** Fills a template. Unknown slots render empty rather than throwing — see validate. */
export function renderTemplate(body: string, context: Record<string, SlotValue>): string {
  const { nodes } = parse(tokenize(body));
  // Trailing whitespace a skipped block leaves on a line is dropped; blank lines that were
  // in the template stay, so a lawyer's paragraph spacing survives intact.
  return renderNodes(nodes, [context]).replace(/[ \t]+$/gm, "");
}

// ---------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------

export interface TemplateReport {
  /** Syntax problems. A template with any of these cannot be saved. */
  errors: TemplateError[];
  /** Slots the app does not know. They render empty — almost always a typo. */
  unknownSlots: { path: string; line: number }[];
  /** Requirement groups no slot in the template satisfies. Saves as incomplete. */
  missing: RequirementGroup[];
  /** Every known slot the template uses, for the summary. */
  used: string[];
}

function collect(nodes: Node[], listScope: string[], out: { path: string; line: number; resolved: string }[]) {
  for (const n of nodes) {
    if (n.type === "text") continue;
    const resolved = resolveSlotPath(n.path, listScope);
    out.push({ path: n.path, line: n.line, resolved });
    if (n.type === "if") {
      collect(n.then, listScope, out);
      collect(n.otherwise, listScope, out);
    } else if (n.type === "each") {
      collect(n.body, [...listScope, resolved], out);
    }
  }
}

/**
 * Inside {{#each deliverables.items}}, "title" means "deliverables.items[].title". A
 * path that is already a full slot name still resolves as itself, so an inner block can
 * reach a top-level value too.
 */
function resolveSlotPath(path: string, listScope: string[]): string {
  if (path === "@index" || path === "this") return path;
  if (SLOT_BY_PATH.has(path)) return path;
  for (let s = listScope.length - 1; s >= 0; s--) {
    const candidate = `${listScope[s]}[].${path}`;
    if (SLOT_BY_PATH.has(candidate)) return candidate;
  }
  return path;
}

export function validateTemplate(body: string): TemplateReport {
  const { nodes, errors } = parse(tokenize(body));
  const seen: { path: string; line: number; resolved: string }[] = [];
  collect(nodes, [], seen);

  const used = new Set<string>();
  const unknownSlots: { path: string; line: number }[] = [];
  for (const s of seen) {
    if (s.resolved === "@index" || s.resolved === "this") continue;
    if (SLOT_BY_PATH.has(s.resolved)) used.add(s.resolved);
    else unknownSlots.push({ path: s.path, line: s.line });
  }

  const satisfied = new Set<RequirementGroup>();
  for (const path of used) {
    const g = SLOT_BY_PATH.get(path)?.satisfies;
    if (g) satisfied.add(g);
  }
  // Parties needs both sides, not either.
  const partiesOk = used.has("brand.name") && (used.has("creator.party") || used.has("creator.legalName"));
  if (!partiesOk) satisfied.delete("parties");

  const missing = (["parties", "deliverables", "compensation"] as RequirementGroup[]).filter(
    (g) => !satisfied.has(g)
  );
  return { errors, unknownSlots, missing, used: [...used].sort() };
}

/** Slots grouped for the editor's reference panel; list item fields sit under their list. */
export function slotCatalog(): { path: string; label: string; description: string; kind: SlotKind; satisfies?: RequirementGroup; example: string }[] {
  return CONTRACT_SLOTS;
}
