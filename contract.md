# MediKiosk — Internal API Contract

| Field | Value |
|---|---|
| **Source** | TRD (`02_MediKiosk_TRD.md`), Document 2 of 6, §6 "Internal API Specification" |
| **Repo location** | Per TRD §3, this file lives at `medikiosk/contract.md` |
| **Frozen at** | Day 1, 11:00 (TRD §16, "Change rule") |
| **Change rule** | Any change to a 🔒 section after freeze requires notifying the kiosk pod **and** the dialogue pod in the same message |

## 0. How to read this document

Two status markers are used throughout. They exist because TRD §6.8 lists the five physician/doctor endpoints only as a purpose table — it does not give response JSON for any of them, and gives a request body for only one (`PATCH`). Labelling a guessed shape as "frozen" would be worse than useless on a multi-pod build, so the distinction is explicit everywhere:

| Marker | Meaning |
|---|---|
| 🔒 **FROZEN** | Copied verbatim (or a mechanical, non-lossy transcription — e.g. filled-in ellipses) from TRD §6.2–§6.7 and §6.9. Build against this with no further sign-off needed. |
| 🟡 **PROPOSED** | Not present in TRD §6 text. Constructed here from adjacent frozen types (§6.9), explicit TRD requirements elsewhere (e.g. NFR-S2, E-01…E-05, B-07), and the worked examples in `fixtures/demo-scenarios.md`. **Needs a two-minute team sign-off before pods build against it** — see §14, Open Contract Gaps. |

---

## 1. Conventions — 🔒 FROZEN (TRD §6.1)

- All requests and responses are `application/json` unless stated otherwise.
- **All endpoints return HTTP `200`** with a body-level `ok` boolean. Transport-level HTTP error codes (4xx/5xx) are reserved for genuine failures (e.g. malformed request, unhandled exception) — they are not part of the body-level success/failure contract.
- Standard error body:

```json
{ "ok": false, "error": { "code": "STRING_CODE", "message": "human readable", "recoverable": true } }
```

- `recoverable: true` → the client should offer a retry or fallback.
- `recoverable: false` → route the patient to human assistance.

No authentication header is specified anywhere in TRD §6 for either the kiosk-facing or physician-facing routes. This is called out as an open gap in §14 — do not invent a bearer-token scheme for the physician endpoints without a team decision.

---

## 2. `POST /api/session` — create session — 🔒 FROZEN

**Purpose:** Start a new intake session (TRD §6.2).

**Headers:** `Content-Type: application/json`

**Status codes:** `200` always (see §1). Body `ok:false` on failure.

### Request

```json
{ "language": "hi", "mode": "allopathic", "abha_id": "12-3456-7890-1234" }
```

- `abha_id` is **optional** (PRD D-02). While `ABDM_MOCK=true` (TRD §5.6), it is validated for format only (`NN-NNNN-NNNN-NNNN`) and resolves to a synthetic record from `fixtures/synthetic-patients.json` — never transmitted to real ABDM.

### Response — success

```json
{
  "ok": true,
  "session_id": "uuid",
  "patient": { "name": "Synthetic Patient", "age": 62, "gender": "F", "abha_linked": true },
  "first_question": { /* Question object — see §13 */ }
}
```

### TypeScript

```typescript
interface SessionCreateRequest {
  language: Language;                 // 'hi' | 'en' | 'ta'
  mode: Mode;                         // 'allopathic' | 'ayush'
  abha_id?: string;                   // optional, format NN-NNNN-NNNN-NNNN
}

interface SessionPatient {
  name: string;
  age: number;
  gender: string;
  abha_linked: boolean;
}

interface SessionCreateResponse {
  ok: true;
  session_id: string;
  patient: SessionPatient;
  first_question: Question;
}
```

---

## 3. `POST /api/consent` — record consent — 🔒 FROZEN

**Purpose:** Log patient consent before any clinical data capture (TRD §6.3).

**Headers:** `Content-Type: application/json`

### Request

```json
{
  "session_id": "uuid",
  "granted": true,
  "scopes": ["history_capture", "document_digitization", "his_share"],
  "audio_played": true
}
```

`granted: false` ends the session immediately and clears all data (NFR-S2).

### Response — success

```json
{ "ok": true, "consent_id": "uuid", "recorded_at": "2026-08-24T09:14:22Z" }
```

### TypeScript

```typescript
type ConsentScope = 'history_capture' | 'document_digitization' | 'his_share';

interface ConsentRequest {
  session_id: string;
  granted: boolean;
  scopes: ConsentScope[];
  audio_played: boolean;
}

interface ConsentResponse {
  ok: true;
  consent_id: string;
  recorded_at: string;               // ISO 8601
}
```

---

## 4. `POST /api/transcribe` — speech to text — 🔒 FROZEN

**Purpose:** Turn a captured audio blob into a transcript (TRD §6.4).

**Headers:** `Content-Type: multipart/form-data`

**Fields:** `audio` (Blob, `webm/opus`) · `session_id` (string) · `language` (string)

### Response — success

```json
{ "ok": true, "transcript": "मुझे तीन दिन से सीने में दर्द है", "confidence": 0.87, "provider": "bhashini" }
```

`provider` is one of `"bhashini" | "whisper" | "web_speech"` — logged so the failover chain is observable end to end.

### Response — failure

```json
{
  "ok": false,
  "error": { "code": "ASR_UNAVAILABLE", "message": "...", "recoverable": true },
  "fallback": "web_speech"
}
```

The client falls back to the browser's Web Speech API on this response (TRD §9.1, ASR failover chain).

### TypeScript

```typescript
type AsrProvider = 'bhashini' | 'whisper' | 'web_speech';

interface TranscribeRequestFields {
  audio: Blob;                        // webm/opus
  session_id: string;
  language: string;
}

interface TranscribeSuccessResponse {
  ok: true;
  transcript: string;
  confidence: number;
  provider: AsrProvider;
}

interface TranscribeFailureResponse {
  ok: false;
  error: { code: 'ASR_UNAVAILABLE'; message: string; recoverable: true };
  fallback: 'web_speech';
}

type TranscribeResponse = TranscribeSuccessResponse | TranscribeFailureResponse;
```

---

## 5. `POST /api/turn` — dialogue engine & red-flag check — 🔒 FROZEN

**Purpose:** The core interview turn: extract slots, run deterministic red-flag rules, return the next question (TRD §6.5, §7, §8).

**Headers:** `Content-Type: application/json`

**Ordering guarantee:** `lib/redflags.ts` runs synchronously, before and independently of any LLM call (TRD §7.1, §8.1). If the LLM is down, `red_flags` is still correct.

### Request

```json
{
  "session_id": "uuid",
  "question_id": "hpi_radiation",
  "answer": { "type": "voice", "transcript": "हाँ, बाएँ हाथ में जाता है" }
}
```

`answer.type` is `"voice" | "choice" | "skip"`. For `"choice"`, send:

```json
{ "type": "choice", "selected": ["left_arm"] }
```

### Response — success

```json
{
  "ok": true,
  "extracted_slots": { "hpi.radiation": "left arm" },
  "next_question": {
    "id": "hpi_associated_symptoms",
    "section": "hpi",
    "text_en": "Do you have any of these along with the pain?",
    "text_localized": "क्या दर्द के साथ इनमें से कुछ है?",
    "ui_type": "multi_choice",
    "options": [
      { "value": "sweating", "label_en": "Sweating", "label_localized": "पसीना", "icon": "droplet" },
      { "value": "nausea",   "label_en": "Nausea",   "label_localized": "मतली",  "icon": "frown" },
      { "value": "none",     "label_en": "None",     "label_localized": "कुछ नहीं", "icon": "x" }
    ],
    "allow_voice": true,
    "allow_skip": false
  },
  "red_flags": [
    { "code": "CHEST_PAIN_RADIATING", "severity": "critical", "label": "Chest pain radiating to arm", "triggered_by": "deterministic" }
  ],
  "progress": { "done": 7, "total": 24, "section": "hpi" },
  "complete": false
}
```

`triggered_by: "deterministic"` is authoritative over `"llm"` (TRD §6.5, §8.4).

### TypeScript

```typescript
type AnswerType = 'voice' | 'choice' | 'skip';

interface TurnAnswer {
  type: AnswerType;
  transcript?: string;                // present when type === 'voice'
  selected?: string[];                // present when type === 'choice'
}

interface TurnRequest {
  session_id: string;
  question_id: string;
  answer: TurnAnswer;
}

interface TurnProgress {
  done: number;
  total: number;
  section: string;
}

interface TurnResponse {
  ok: true;
  extracted_slots: Record<string, unknown>;
  next_question: Question | null;     // null when complete === true
  red_flags: RedFlag[];
  progress: TurnProgress;
  complete: boolean;
}
```

---

## 6. `POST /api/ocr` — document digitization — 🔒 FROZEN

**Purpose:** Extract structured fields from a photographed prescription/lab report via Gemini vision (TRD §6.6, §5.1).

**Headers:** `Content-Type: application/json` (image is base64-encoded in the body — **not** multipart, unlike `/api/transcribe`).

**No LLM failover.** If Gemini vision is unavailable, this returns a graceful "unavailable" state rather than falling through to Groq (TRD §5.2, §9.1) — document digitization is non-blocking for the patient journey by design.

### Request

```json
{ "session_id": "uuid", "image_base64": "...", "mime_type": "image/jpeg" }
```

### Response — success

```json
{
  "ok": true,
  "document_id": "uuid",
  "doc_type": "prescription",
  "doc_date": "2026-03-14",
  "date_confidence": 0.91,
  "provider_name": "City Clinic",
  "entities": {
    "medications": [
      { "name": "Metformin", "dose": "500mg", "frequency": "BD", "confidence": 0.94 }
    ],
    "diagnoses": [
      { "text": "Type 2 Diabetes Mellitus", "confidence": 0.88 }
    ],
    "lab_values": [
      { "parameter": "HbA1c", "value": "8.2", "unit": "%", "reference_range": "4.0-5.6", "is_abnormal": true, "confidence": 0.96 }
    ]
  },
  "overall_confidence": 0.89,
  "requires_review": false
}
```

**Confidence rule (B-07), frozen:** any field with `confidence < 0.75` is marked with `requires_review: true` on the document and rendered visually distinct (amber, never red — per `fixtures/demo-scenarios.md` Scenario 4) in the physician UI. A low-confidence extraction is never presented to either the patient or the physician as confirmed fact.

### TypeScript

```typescript
type DocType = 'prescription' | 'lab_report' | 'other';

interface OcrMedication {
  name: string;
  dose: string;
  frequency: string;
  confidence: number;
}

interface OcrDiagnosis {
  text: string;
  confidence: number;
}

interface OcrLabValue {
  parameter: string;
  value: string;
  unit: string;
  reference_range: string;
  is_abnormal: boolean;
  confidence: number;
}

interface OcrEntities {
  medications: OcrMedication[];
  diagnoses: OcrDiagnosis[];
  lab_values: OcrLabValue[];
}

interface OcrRequest {
  session_id: string;
  image_base64: string;
  mime_type: string;                  // e.g. 'image/jpeg'
}

interface OcrResponse {
  ok: true;
  document_id: string;
  doc_type: DocType;
  doc_date: string | null;            // ISO date; null if undetectable
  date_confidence: number;
  provider_name: string | null;
  entities: OcrEntities;
  overall_confidence: number;
  requires_review: boolean;
}
```

---

## 7. `POST /api/summarize` — generate clinical summary — 🔒 FROZEN

**Purpose:** Assemble the structured physician-facing summary from the completed interview (TRD §6.7).

**Headers:** `Content-Type: application/json`

**Timeout / fallback:** 25s timeout → cached fixture on expiry or when `DEMO_MODE=true` (TRD §9.1, §9.2, F-06).

### Request

```json
{ "session_id": "uuid" }
```

### Response — success

```json
{
  "ok": true,
  "summary_id": "uuid",
  "summary": {
    "chief_complaint": "Chest pain for 3 days",
    "hpi": {
      "narrative": "...",
      "socrates": {
        "site": "central chest",
        "onset": "3 days ago",
        "character": "pressure-like",
        "radiation": "left arm",
        "associations": ["sweating"],
        "time_course": "intermittent, worsening",
        "exacerbating": ["exertion"],
        "severity": 7
      }
    },
    "past_medical_history": [],
    "drug_history": [],
    "allergies": [],
    "family_history": [],
    "personal_history": {},
    "review_of_systems": {},
    "ayush": null,
    "documents_summary": { "count": 3, "date_range": ["2025-11-02", "2026-03-14"], "timeline": [] }
  },
  "red_flags": [],
  "uncertain_fields": ["family_history.diabetes"],
  "generated_at": "2026-08-24T09:31:10Z",
  "source": "live"
}
```

`source` is `"live" | "cached_fallback"`. For `mode: "ayush"`, the `ayush` key carries the Dashavidha Pariksha block — **patient-reported responses only, never a computed Prakriti classification** (AY-05, TRD §14 Rule 4 — this is a build-blocking rule, not a style preference).

### TypeScript

```typescript
interface Socrates {
  site: string;
  onset: string;
  character: string;
  radiation: string;
  associations: string[];
  time_course: string;
  exacerbating: string[];
  severity: number;                   // 1–10
}

interface Hpi {
  narrative: string;
  socrates: Socrates;
}

interface DocumentsSummary {
  count: number;
  date_range: [string, string];       // [earliest, latest] ISO dates
  timeline: unknown[];                // shape not specified in TRD §6 — see §14
}

interface ClinicalSummary {
  chief_complaint: string;
  hpi: Hpi;
  past_medical_history: unknown[];
  drug_history: unknown[];
  allergies: unknown[];
  family_history: unknown[];
  personal_history: Record<string, unknown>;
  review_of_systems: Record<string, unknown>;
  ayush: AyushSummary | null;         // never contains a Prakriti verdict (AY-05)
  documents_summary: DocumentsSummary;
}

interface SummarizeRequest {
  session_id: string;
}

interface SummarizeResponse {
  ok: true;
  summary_id: string;
  summary: ClinicalSummary;
  red_flags: RedFlag[];
  uncertain_fields: string[];         // dot-path field names
  generated_at: string;               // ISO 8601
  source: 'live' | 'cached_fallback';
}
```

`AyushSummary` is not defined anywhere in TRD §6 — flagged in §14.

---

## 8. `GET /api/fhir/[sessionId]` — FHIR R4 Bundle — 🟡 PROPOSED (envelope only)

**Purpose per TRD §6.8:** "Generated FHIR Bundle (D-06, D-07, E-05)."

**What is actually frozen:** the route exists, it is a `GET`, it returns *a* FHIR Bundle, and it is generated by `lib/fhir.ts` (TRD §3). Nothing about the bundle's internal resource mapping is specified in TRD §6. The one concrete mapping hint anywhere in the project is in `fixtures/demo-scenarios.md` (Scenario 3): *"FHIR mapping: Dashavidha → `Observation` with custom code system (Schema §10)"* — but "Schema §10" is Document 5 (Backend Schema), which was not provided to build this contract and must be checked before implementing.

**Proposed envelope** (the outer `Bundle` shape is HL7 FHIR R4 spec, not a project invention — only the `entry` contents below are a proposal):

```json
{
  "ok": true,
  "bundle": {
    "resourceType": "Bundle",
    "type": "document",
    "timestamp": "2026-08-24T09:31:10Z",
    "entry": [
      { "resource": { "resourceType": "Patient", "...": "..." } },
      { "resource": { "resourceType": "Condition", "...": "..." } },
      { "resource": { "resourceType": "Observation", "...": "..." } }
    ]
  }
}
```

### TypeScript

```typescript
interface FhirBundleResponse {
  ok: true;
  bundle: {
    resourceType: 'Bundle';
    type: string;                     // proposed: 'document' — confirm against Document 5
    timestamp: string;
    entry: Array<{ resource: Record<string, unknown> }>;  // resource typing pending Document 5
  };
}
```

---

## 9. `GET /api/doctor/queue` — physician queue — 🟡 PROPOSED

**Purpose per TRD §6.8:** "Sessions awaiting review, red-flagged sorted first (E-01)."

No response shape is given in TRD §6. The proposal below is built from the frozen `RedFlag`/`Severity` types (§13) plus the physician-queue rendering actually specified in `fixtures/demo-scenarios.md` (Scenario 6's queue entry: priority ordering, token, age/gender, chief complaint, red-flag chip, and the `⚠ INCOMPLETE` badge for abandoned-but-flagged sessions per Schema §6.3's `physician_queue` view).

```json
{
  "ok": true,
  "queue": [
    {
      "session_id": "uuid",
      "token": "A-49",
      "patient": { "name": "Unregistered", "age": 68, "gender": "M" },
      "mode": "allopathic",
      "chief_complaint": "Sudden severe headache",
      "status": "abandoned",
      "red_flags": [
        { "code": "SEVERE_HEADACHE", "severity": "critical", "label": "Sudden severe headache", "triggered_by": "deterministic" }
      ],
      "is_priority": true,
      "questions_answered": 3,
      "questions_total": 24,
      "waiting_since": "2026-08-24T09:04:00Z"
    }
  ]
}
```

### TypeScript

```typescript
type SessionStatus = 'in_progress' | 'complete' | 'abandoned' | 'declined';

interface QueuePatientSummary {
  name: string;
  age: number;
  gender: string;
}

interface QueueEntry {
  session_id: string;
  token: string;
  patient: QueuePatientSummary;
  mode: Mode;
  chief_complaint: string;
  status: SessionStatus;
  red_flags: RedFlag[];
  is_priority: boolean;               // true if any red_flags[].severity === 'critical'
  questions_answered: number;
  questions_total: number;
  waiting_since: string;              // ISO 8601
}

interface DoctorQueueResponse {
  ok: true;
  queue: QueueEntry[];
}
```

---

## 10. `GET /api/doctor/[sessionId]` — full session graph — 🟡 PROPOSED

**Purpose per TRD §6.8:** "Full summary + documents (E-02, E-03)."

No response shape given in TRD §6. Proposed by composing the frozen `ClinicalSummary` (§7 above) with the frozen `OcrResponse` entity shape (§6 above) plus session/consent metadata implied by E-02/E-03 and by Scenario 6's abandoned-session handling.

```json
{
  "ok": true,
  "session": {
    "session_id": "uuid",
    "token": "A-49",
    "status": "abandoned",
    "abandoned_at": "2026-08-24T09:15:00Z",
    "patient": { "name": "Unregistered", "age": 68, "gender": "M", "abha_linked": false },
    "mode": "allopathic",
    "language": "hi"
  },
  "consent": { "granted": true, "scopes": ["history_capture"], "recorded_at": "2026-08-24T09:00:00Z" },
  "summary": { /* ClinicalSummary — see §7 */ },
  "red_flags": [
    { "code": "SEVERE_HEADACHE", "severity": "critical", "label": "Sudden severe headache", "triggered_by": "deterministic" }
  ],
  "documents": [ /* OcrResponse[] minus the "ok" wrapper — see §6 */ ]
}
```

### TypeScript

```typescript
interface DoctorSessionDetail {
  session_id: string;
  token: string;
  status: SessionStatus;
  abandoned_at: string | null;
  patient: SessionPatient;
  mode: Mode;
  language: Language;
}

interface DoctorSessionResponse {
  ok: true;
  session: DoctorSessionDetail;
  consent: { granted: boolean; scopes: ConsentScope[]; recorded_at: string };
  summary: ClinicalSummary;
  red_flags: RedFlag[];
  documents: Omit<OcrResponse, 'ok'>[];
}
```

---

## 11. `PATCH /api/doctor/[sessionId]` — autosave physician edits — request 🔒 FROZEN / response 🟡 PROPOSED

**Purpose per TRD §6.8:** "Save physician edits (C-03)."

### Request — 🔒 FROZEN (TRD §6.8)

```json
{ "edits": { "field.path": "new value" } }
```

### Response — 🟡 PROPOSED

Not specified in TRD §6. Proposed as a plain acknowledgement, since §6.8 is explicit that nothing is committed to the record here — this is an autosave, not the commit action (see §12).

```json
{ "ok": true, "updated_at": "2026-08-24T09:40:00Z" }
```

### TypeScript

```typescript
interface DoctorEditsRequest {
  edits: Record<string, string>;      // dot-path field -> new value
}

interface DoctorEditsResponse {
  ok: true;
  updated_at: string;                 // ISO 8601
}
```

---

## 12. `POST /api/doctor/[sessionId]/confirm` — final commit — 🟡 PROPOSED

**Purpose per TRD §6.8:** "Confirm and commit (C-04, E-04)." TRD §6.8 is explicit and frozen on one point: **"Nothing is committed to the record until `/confirm` is called"** — the physician-in-the-loop gate (PRD NG3, C-04).

**⚠ Open discrepancy — do not resolve silently:** the requested endpoint description for this route is "final commit & **transcript purge**." But TRD §11 (NFR-S2) frozen behaviour is: *"On `/complete`, delete session working rows; retain only the confirmed summary and consent log."* `/complete` is the **patient-facing** route (kiosk auto-reset after the summary is shown to the patient, TRD §3), not the physician's `/confirm` action. If the physician needs the raw transcript available to review *before* confirming, it cannot already have been purged at patient `/complete` — and if `/confirm` is also supposed to purge it, that needs to be added to NFR-S2 explicitly, because right now the TRD only assigns purge to one of the two routes. **This needs a one-line team decision, not an assumption** (TRD §14 Rule 13). See §14.

### Request — proposed

```json
{ "physician_id": "optional-string" }
```

### Response — proposed

```json
{ "ok": true, "committed_at": "2026-08-24T09:45:00Z", "fhir_available": true }
```

### TypeScript

```typescript
interface DoctorConfirmRequest {
  physician_id?: string;
}

interface DoctorConfirmResponse {
  ok: true;
  committed_at: string;               // ISO 8601
  fhir_available: boolean;
}
```

---

## 13. Shared TypeScript types — 🔒 FROZEN (TRD §6.9)

Per TRD §14 Rule 6: **always** import these from `lib/types.ts`; never redefine these shapes locally. All interfaces in §2–§12 above build on these.

```typescript
type Language = 'hi' | 'en' | 'ta';
type Mode = 'allopathic' | 'ayush';
type UIType = 'voice_open' | 'single_choice' | 'multi_choice'
            | 'scale' | 'yes_no' | 'body_map';
type Severity = 'critical' | 'urgent' | 'advisory';

interface Question {
  id: string;
  section: string;
  text_en: string;
  text_localized: string;
  ui_type: UIType;
  options?: Option[];
  allow_voice: boolean;
  allow_skip: boolean;
}

interface Option {
  value: string;
  label_en: string;
  label_localized: string;
  icon: string;            // lucide-react icon name — required by NFR-A4
}

interface RedFlag {
  code: string;
  severity: Severity;
  label: string;
  triggered_by: 'deterministic' | 'llm';
}
```

---

## 14. Open Contract Gaps

Modeled on TRD §15's "Open Technical Decisions" table. Every 🟡 section above traces to a row here. These need a team decision before the doctor pod builds against mocks — per TRD §16, any resolution still counts as a contract change and must be messaged to both the kiosk and dialogue pods.

| ID | Gap | Affects | Needed by |
|---|---|---|---|
| CG1 | No auth scheme defined for `/api/doctor/*` routes — anyone with a session ID can currently PATCH/confirm it | §9–§12 | Before doctor pod starts |
| CG2 | `GET /api/doctor/queue` response shape not in TRD §6 — proposal above needs sign-off | §9 | Before doctor pod starts |
| CG3 | `GET /api/doctor/[sessionId]` response shape not in TRD §6 | §10 | Before doctor pod starts |
| CG4 | `PATCH /api/doctor/[sessionId]` and `POST .../confirm` response shapes not in TRD §6 | §11, §12 | Before doctor pod starts |
| CG5 | **Transcript purge timing conflict:** requested `/confirm` behaviour ("transcript purge") vs. frozen NFR-S2 ("purge on patient `/complete`") name different routes for the same action. Pick one, update the losing spec. | §12 | Before any commit-path code is written — this is a data-retention/DPDP-relevant decision, not cosmetic |
| CG6 | `GET /api/fhir/[sessionId]` resource mapping (Patient/Condition/Observation field-by-field) depends on Document 5 §10, not provided here | §8 | Before FHIR generator is implemented |
| CG7 | `documents_summary.timeline` item shape (used in `/api/summarize`) not specified in TRD §6 | §7 | Before summary UI renders the timeline |
| CG8 | `AyushSummary` (the Dashavidha Pariksha block shape) not defined in TRD §6 — only the constraint "no computed Prakriti" is frozen (AY-05) | §7 | Before AYUSH summary UI is built |
| CG9 | `app/api/doctor/[sessionId]/confirm/route.ts` is required by §6.8 but is absent from the TRD §3 repo-structure tree (which stops at `doctor/[sessionId]/route.ts`) | §12 | Cosmetic — just add the file; flagged so nobody thinks its absence from §3 means it's out of scope |

---

## 15. Freeze & change rule — 🔒 FROZEN (TRD §16)

> "The API contract in section 6 is frozen at Day 1, 11:00. Changes after that point require notifying both the kiosk and dialogue pods in the same message."

This applies unchanged to this file. Resolving any row in §14 is a change to this contract, not an implementation detail — notify both pods when a gap is closed.

*End of contract.md.*
