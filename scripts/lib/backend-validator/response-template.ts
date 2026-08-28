/**
 * response-template — deterministic interpolation of a clinic's
 * `responseTemplates` entry with the REAL data of the operation that just happened.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The closing message is the patient's last chance to notice the bot did the
 * wrong thing ("he movido tu cita" — to when?). Leaving the substitution of
 * `{fecha}` / `{hora}` to a language model means the one string that must be
 * factual is the one string nobody guarantees. So the placeholders are filled
 * HERE, from the tool result, before the text is handed to anyone.
 *
 * Pure function, no I/O.
 */

/** Values a template placeholder can be filled with. */
export type ResponseTemplateData = Readonly<Record<string, unknown>>;

export type ResponseTemplateMode = 'literal' | 'model';

export type ResponseTemplateDefinition = {
  readonly text: string;
  readonly mode?: ResponseTemplateMode;
};

export type ResponseTemplates = Readonly<Record<string, ResponseTemplateDefinition>>;

export type ResponseTemplateResolution =
  | { readonly status: 'not_configured' }
  | { readonly status: 'not_found'; readonly key: string }
  | {
      readonly status: 'resolved';
      readonly key: string;
      readonly mode: ResponseTemplateMode;
      readonly text: string;
      readonly missing: readonly string[];
    }
  | {
      /** Diagnostic state only: this result has no patient-facing text. */
      readonly status: 'missing_data';
      readonly key: string;
      readonly mode: ResponseTemplateMode;
      readonly missing: readonly string[];
    };

export type RenderedResponseTemplate = {
  /** The template with every known placeholder replaced. */
  readonly text: string;
  /**
   * Placeholders the operation had no data for, in order of first appearance
   * and without repeats. They stay VISIBLE in `text`: a hole the caller can log
   * and a reader can see beats a sentence that silently lost a fact.
   */
  readonly missing: readonly string[];
};

/**
 * `{clave}` — a single-brace placeholder.
 *
 * The lookarounds skip `{{CLINIC_NAME}}`-style markers, which belong to the
 * system-prompt interpolation layer and must survive this pass untouched.
 */
const PLACEHOLDER = /(?<!\{)\{([A-Za-z][A-Za-z0-9_]*)\}(?!\})/g;

/** A value is usable only if it renders to something non-blank. */
function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') return value.trim().length > 0 ? value : null;
  if (typeof value === 'boolean') return String(value);
  return null;
}

export function renderResponseTemplate(
  template: string,
  data: ResponseTemplateData,
): RenderedResponseTemplate {
  const missing: string[] = [];

  const text = template.replace(PLACEHOLDER, (whole, key: string) => {
    const value = toText(data[key]);
    if (value === null) {
      if (!missing.includes(key)) missing.push(key);
      return whole;
    }
    return value;
  });

  return { text, missing };
}

/**
 * Resolve a flow/intent responseTemplateKey from the explicit registry.
 *
 * A key is never a patient-facing message. Unknown keys intentionally resolve
 * to a non-deliverable result so callers can use their authoritative outcome or
 * the model response instead of leaking configuration identifiers.
 */
export function resolveResponseTemplateKey(
  responseTemplateKey: string | null | undefined,
  registry: ResponseTemplates | null | undefined,
  data: ResponseTemplateData,
): ResponseTemplateResolution {
  if (typeof responseTemplateKey !== 'string' || responseTemplateKey.trim().length === 0) {
    return { status: 'not_configured' };
  }

  const key = responseTemplateKey.trim();
  const definition = registry && Object.prototype.hasOwnProperty.call(registry, key) ? registry[key] : undefined;
  if (!definition || typeof definition.text !== 'string' || definition.text.trim().length === 0) {
    return { status: 'not_found', key };
  }

  const rendered = renderResponseTemplate(definition.text, data);
  if (rendered.missing.length > 0) {
    return {
      status: 'missing_data',
      key,
      mode: definition.mode === 'literal' || definition.mode === 'model' ? definition.mode : 'model',
      missing: rendered.missing,
    };
  }

  return {
    status: 'resolved',
    key,
    mode: definition.mode === 'literal' || definition.mode === 'model' ? definition.mode : 'model',
    text: rendered.text,
    missing: [],
  };
}
