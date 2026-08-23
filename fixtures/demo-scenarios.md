# Demo Scenarios — Source of Truth

**MediKiosk · Team DEBUGGERS · SIH 2026**
**File:** `fixtures/demo-scenarios.md` · **Version** 1.0 · **Date** 23 August 2026

> **This file is the spec.** Every feature we build serves one of these eight scenarios. If a feature doesn't appear here, we don't build it. If a scenario doesn't run, we're not done.
>
> **All patients are synthetic.** No real patient data appears in this file or anywhere in this build (PRD D-10, Schema §4.1 `synthetic_only`).

---

## How to use this file

| Role | Use |
|---|---|
| **Dialogue pod** | Question IDs and slot paths here are authoritative. Build `clinical.json` to match. |
| **Kiosk pod** | Every `ui_type` and interaction state used here must render correctly. |
| **Summary pod** | The "Expected Physician Summary" blocks are your target output. |
| **Demo owner** | **Scenario 1 is the live pitch demo.** Rehearse it until it's boring. |
| **Everyone** | Gate 3 (15–20 end-to-end runs) means running these eight. |

**Notation:** `🤖` = system · `🗣️` = patient speech · `👆` = touch input · `⚠️` = red flag fires · `🔇` = failure injected

---

## Coverage Matrix

| # | Scenario | Lang | Mode | Interaction | Red flag | Docs | Tests |
|---|---|---|---|---|---|---|---|
| 1 | Kamala Devi — cardiac | Hindi | Allo | Voice | 🔴 Critical | — | A-14, C-05, E-01, App Flow §5.5 |
| 2 | Murugan — knee pain | Tamil | Allo | Touch-only | — | — | A-06, A-08, NFR-A5 |
| 3 | Priya Nair — digestive | Hindi | **AYUSH** | Touch | — | — | AY-01→06 |
| 4 | Rajesh Kumar — diabetes | En/Hi | Allo | Voice + upload | — | 📄 2 | B-01→08, §7.3 |
| 5 | Lakshmi — fever | Tamil | Allo | Voice **fails 2×** | — | — | F-02, F-03, E4, E5 |
| 6 | Abdul Rehman — headache | Hindi | Allo | Voice, **abandons** | 🔴 Critical | — | **E16**, Schema §6.3 |
| 7 | Sunita Devi — declines | Hindi | Allo | Touch | — | — | D-03, E12, `valid_consent` |
| 8 | Arjun Menon — ankle | English | Allo | Voice | ✅ **None** | — | Red-flag *specificity* |

**Seeded queue mapping** (Schema §12.1): Scenario 1 → seed #1 · Scenario 4 → seed #2 · Scenario 3 → seed #3 · Scenario 6 → seed #4.

---

# Scenario 1 — Kamala Devi
## 🎬 THE LIVE PITCH DEMO

| Field | Value |
|---|---|
| **Name** | Kamala Devi |
| **Age / Gender** | 62 / Female |
| **Language** | Hindi (हिंदी) |
| **Tech literacy** | **None.** Never used a touchscreen. Does not own a phone. |
| **Reading literacy** | Minimal — can recognise numbers, not sentences |
| **ABHA** | None → "Continue Without Card" |
| **Mode** | Allopathic |
| **Documents** | None |
| **Chief complaint** | Chest pain, 3 days |

### What this tests
Deterministic red-flag detection (A-14) · patient sees nothing alarming (App Flow §5.5) · voice-led intake in Hindi · priority queue routing (E-01) · red-flag banner with provenance (C-05)

### Script

```
🤖 [S1] Audio cycles: "नमस्ते / Welcome / வணக்கம்"
👆 Taps हिंदी → mode tiles appear → taps "सामान्य चिकित्सा" → START

🤖 [S2] "अगर आपके पास आयुष्मान कार्ड है तो नंबर डालें।
        अगर नहीं है तो 'बिना कार्ड आगे बढ़ें' दबाएँ।"
👆 Taps "बिना कार्ड आगे बढ़ें"

🤖 [S3] Consent audio plays in full (14s). I AGREE enables only after playback.
👆 Taps "मैं सहमत हूँ"
```

**Interview — `cc_open`**
```
🤖 "आपको क्या तकलीफ़ है? आराम से बताइए।"
   ("What is troubling you? Take your time.")
🗣️ "मुझे तीन दिन से सीने में दर्द हो रहा है"
   (mujhe teen din se seene mein dard ho raha hai)
   → "I've had chest pain for three days"

🤖 Transcript card shown + read back → 👆 "हाँ, सही है"
```
> **Extracted:** `chief_complaint: "chest pain"` · `hpi.socrates.onset: "3 days"` · `hpi.socrates.site: "chest"`
> **⚠️ Red flag check:** `CHEST_PAIN_*` rules armed. No trigger yet — chest pain alone is not critical.

**`hpi_character`**
```
🤖 "दर्द कैसा लगता है?"   ui_type: single_choice
   👆 [दबाव जैसा] [जलन] [चुभन] [कुछ और]
👆 Taps "दबाव जैसा" (pressure-like)
```
> **Extracted:** `hpi.socrates.character: "pressure-like"`

**`hpi_radiation`** ← **the setup**
```
🤖 "क्या दर्द कहीं और भी जाता है?"   ui_type: single_choice
   👆 [बाएँ हाथ में] [जबड़े में] [पीठ में] [नहीं]
👆 Taps "बाएँ हाथ में" (left arm)
```
> **Extracted:** `hpi.socrates.radiation: "left arm"`
> **⚠️⚠️ `CHEST_PAIN_RADIATING` FIRES — severity: critical, source: deterministic**
> **Patient screen: UNCHANGED.** No banner. No colour shift. No sound. Interview continues normally.
> **Server:** `red_flags` row inserted · session jumps to top of `physician_queue` **immediately**

**`hpi_associated`**
```
🤖 "दर्द के साथ इनमें से कुछ होता है?"   ui_type: multi_choice
   👆 [पसीना] [जी मिचलाना] [साँस फूलना] [चक्कर] [कुछ नहीं]
👆 Taps "पसीना" (sweating) → CONTINUE
```
> **Extracted:** `hpi.socrates.associations: ["sweating"]` · flag reinforced (already recorded, `ON CONFLICT DO NOTHING`)

**`hpi_severity`**
```
🤖 "दर्द कितना तेज़ है? 1 से 10 तक।"   ui_type: scale
👆 Taps 7
```

**`hpi_exacerbating`**
```
🤖 "दर्द कब बढ़ता है?"   ui_type: multi_choice
👆 Taps "चलने पर" (on walking)
```

**Remaining turns — completed rapidly via touch for demo pacing**
```
pmh_conditions   👆 "ब्लड प्रेशर" (hypertension)
drug_current     👆 "हाँ, एक गोली रोज़"  → free detail skipped
allergy_known    👆 "नहीं"
family_conditions 👆 "पिता को दिल की बीमारी थी" (father — heart disease)
personal_tobacco 👆 "नहीं"
ros_targeted     👆 "पैरों में सूजन — नहीं"
```

```
🤖 [S5] "अगर आपके पास डॉक्टर के काग़ज़ हैं..."
👆 Taps "मेरे पास काग़ज़ नहीं हैं"

🤖 [S6] Summary assembly animation (~14s) → plain-language cards, Hindi audio read-back
        ⚠️ NO red-flag content shown to patient
👆 Taps "यह सही है"

🤖 [S7] Token: A-47 · 15s auto-reset
```

### Expected system behaviour

| Check | Expected |
|---|---|
| Red flags | 1 × `CHEST_PAIN_RADIATING`, critical, deterministic |
| Trigger text stored | `"बाएँ हाथ में"` in `red_flags.trigger_text` |
| Patient-visible alarm | **None, at any point** |
| Queue position | Top of priority zone, before interview ended |
| Turn count | ~14 |
| Duration | 5–7 minutes |

### Expected Physician Summary (D2)

```
┌──────────────────────────────────────────────────────────────┐
│ 🔺 PRIORITY — EMERGENCY INDICATORS DETECTED                  │
│                                                              │
│  Chest pain radiating to arm                                 │
│  › "बाएँ हाथ में"                          [deterministic]    │
│  Detected 09:23:41 · 4 min before intake completed           │
│                                              [ ACKNOWLEDGE ] │
└──────────────────────────────────────────────────────────────┘

A-47 · Kamala Devi · 62F · Unregistered (no ABHA) · Allopathic
Intake 6m 12s · Hindi · ASR: bhashini · LLM: gemini

CHIEF COMPLAINT
  Chest pain, 3 days

HISTORY OF PRESENT ILLNESS
  Site           Central chest
  Onset          3 days ago
  Character      Pressure-like
  Radiation      Left arm
  Associations   Sweating
  Time course    Intermittent
  Exacerbating   Exertion (walking)
  Severity       7 / 10

PAST MEDICAL HISTORY     Hypertension
DRUG HISTORY             1 daily antihypertensive (name not captured) ⚠ uncertain
ALLERGIES                None reported
FAMILY HISTORY           Father — cardiac disease
PERSONAL                 Non-smoker
REVIEW OF SYSTEMS        No pedal oedema

DOCUMENTS                None presented

[ CONFIRM & COMMIT ]   [ Save Draft ]   [ View FHIR ]
```

### ✅ Pass criteria
- [ ] Flag fires at `hpi_radiation`, before `hpi_associated`
- [ ] `triggered_by: "deterministic"` — **not** `llm`
- [ ] Patient screen shows nothing unusual through the entire interview
- [ ] Session reaches priority queue **before** the patient finishes
- [ ] Banner shows the Hindi trigger utterance verbatim
- [ ] Drug history marked uncertain (name not captured)
- [ ] Runs start to finish in under 4 minutes when demoed at pace

---

# Scenario 2 — Murugan
## Non-literate elderly · full SOCRATES · touch-only

| Field | Value |
|---|---|
| **Name** | Murugan |
| **Age / Gender** | 71 / Male |
| **Language** | Tamil (தமிழ்) |
| **Tech literacy** | **None** |
| **Reading literacy** | **Non-literate.** Cannot read any script. |
| **ABHA** | None |
| **Mode** | Allopathic |
| **Chief complaint** | Right knee pain, 3 months |

### What this tests
The hardest accessibility case. Every question must be answerable **without reading anything** — audio + icons only (NFR-A5, NFR-A6, DP3). Full 8-dimension SOCRATES via touch (A-08).

### Script

```
🤖 [S1] Audio cycles; Murugan waits for Tamil, then taps தமிழ்
👆 Mode: taps the stethoscope icon (does not read the label)
🤖 [S3] Consent audio in Tamil (16s) → 👆 green tick tile
```

**`cc_open`** — voice attempted, succeeds
```
🤖 "உங்களுக்கு என்ன பிரச்சனை?"  ("What is your problem?")
🗣️ "முழங்கால் வலிக்குது"  (muzhangaal valikkuthu) → "My knee hurts"
```

**Full SOCRATES — every turn touch-based with icons**

| Q ID | Question (Tamil) | ui_type | Options (icon-led) | Answer |
|---|---|---|---|---|
| `hpi_site` | "எங்கே வலிக்குது?" | `body_map` | SVG body outline | 👆 Right knee region |
| `hpi_onset` | "எவ்வளவு நாளா?" | `single_choice` | 🌅 Today · 📅 This week · 🗓️ This month · 📆 Longer | 👆 📆 Longer → "3 months" |
| `hpi_character` | "வலி எப்படி இருக்கு?" | `single_choice` | 🔥 Burning · 📌 Sharp · 🪨 Dull ache · ⚡ Shooting | 👆 🪨 Dull ache |
| `hpi_radiation` | "வலி வேற எங்கயாவது போகுதா?" | `single_choice` | ⬆️ Up thigh · ⬇️ Down calf · ❌ No | 👆 ❌ No |
| `hpi_associations` | "இதுல ஏதாவது இருக்கா?" | `multi_choice` | 🎈 Swelling · 🔒 Stiffness · 🌡️ Warmth · ❌ None | 👆 🎈 + 🔒 |
| `hpi_timecourse` | "வலி எப்ப அதிகம்?" | `single_choice` | 🌅 Morning · ☀️ Daytime · 🌙 Night · ⏱️ Always | 👆 🌅 Morning |
| `hpi_exacerbating` | "எப்ப வலி கூடும்?" | `multi_choice` | 🪜 Stairs · 🚶 Walking · 🧎 Squatting · 🛏️ Rest | 👆 🪜 + 🧎 |
| `hpi_severity` | "வலி எவ்வளவு?" | `scale` | 1–10, 😊→😖 faces, green→red | 👆 6 |

```
pmh_conditions    👆 ❌ None
drug_current      👆 💊 "Pain tablet from shop" (generic option)
allergy_known     👆 ❌ None
family_conditions 👆 ❓ Don't know
personal_tobacco  👆 🚬 Yes → 👆 "Chewing tobacco"

🤖 [S5] 👆 "No papers"
🤖 [S6] Tamil audio read-back → 👆 green tick
🤖 [S7] Token T-12
```

### Expected system behaviour

| Check | Expected |
|---|---|
| Text-only questions | **Zero.** Every question has icons. |
| Free-text inputs | **Zero** (NFR-A5) |
| Voice turns | 1 of 14 |
| Red flags | None |
| Duration | 7–9 minutes (slower — expected and acceptable, NFR-A7) |

### Expected Physician Summary

```
T-12 · Murugan · 71M · Unregistered · Allopathic
Intake 8m 41s · Tamil · Interaction: 93% touch

CHIEF COMPLAINT      Right knee pain, 3 months

HPI
  Site           Right knee
  Onset          ~3 months
  Character      Dull ache
  Radiation      None
  Associations   Swelling, morning stiffness
  Time course    Worse in the morning
  Exacerbating   Stairs, squatting
  Severity       6 / 10

PAST MEDICAL         None reported
DRUG HISTORY         Self-medicating — OTC analgesic, name unknown ⚠ uncertain
ALLERGIES            None reported
FAMILY HISTORY       Unknown
PERSONAL             Chewing tobacco — current use
```

### ✅ Pass criteria
- [ ] Murugan completes intake **without reading a single word**
- [ ] Every option tile has an icon
- [ ] `body_map` registers an accurate tap at 71-year-old motor precision
- [ ] Scale uses face icons at both ends, not just numbers
- [ ] No timeout penalty despite slow pace
- [ ] Tobacco use captured — it's clinically relevant to his presentation

---

# Scenario 3 — Priya Nair
## AYUSH mode · Dashavidha Pariksha

| Field | Value |
|---|---|
| **Name** | Priya Nair |
| **Age / Gender** | 34 / Female |
| **Language** | Hindi |
| **Tech literacy** | Moderate — uses a smartphone daily |
| **ABHA** | `45-2891-6634-0072` (entered) |
| **Mode** | **AYUSH** |
| **Chief complaint** | Bloating, irregular digestion, low energy — 6 months |

### What this tests
The differentiator (AY-01→AY-06). Touch-only branch (AY-04). Illustrated options instead of Sanskrit terms. **No computed Prakriti verdict** (AY-05).

### Script

```
👆 हिंदी → 👆 "आयुर्वेद" (leaf icon) → START
👆 ABHA entered on number pad → VERIFY → "Priya Nair, 34, F" shown 2s
🤖 Consent → 👆 सहमत
```

**Standard sections first** (AYUSH shares the base history)
```
cc_open      🗣️ "पेट फूला रहता है और पाचन ठीक नहीं"
             → "My stomach stays bloated and digestion isn't right"
hpi_onset    👆 "6 महीने से"
hpi_severity 👆 5
pmh          👆 "थायरॉइड" (hypothyroidism)
drug_current 👆 "हाँ — थायरॉइड की दवा"
allergy      👆 "नहीं"
```

**→ Branches to Dashavidha Pariksha — all touch, all illustrated**

| # | Parameter | Patient-facing question | Options shown | Answer |
|---|---|---|---|---|
| 1 | **Prakriti** | "आपकी बनावट कैसी है?" | 🏃 Thin, quick, dry skin · 🔥 Medium, warm, sharp appetite · 🧘 Heavy, calm, oily skin | 👆 🔥 + 🏃 |
| 2 | **Vikriti** | "अभी क्या बदला हुआ लगता है?" | 💨 Gas, dryness · 🔥 Acidity, heat · 💧 Heaviness, mucus | 👆 💨 + 🔥 |
| 3 | **Sara** | "शरीर की मज़बूती कैसी है?" | 💪 Strong · 🙂 Average · 😔 Weak | 👆 🙂 |
| 4 | **Samhanana** | "शरीर का गठन?" | Compact · Medium · Loose | 👆 Medium |
| 5 | **Pramana** | Height / weight | Numeric pad | 👆 158 cm / 54 kg |
| 6 | **Satmya** | "किस तरह का खाना सहन होता है?" | 🌶️ Spicy fine · 🥛 Bland only · 🍲 Mixed | 👆 🥛 Bland only |
| 7 | **Sattva** | "मानसिक स्थिति?" | 😌 Steady · 😐 Sometimes disturbed · 😟 Easily disturbed | 👆 😐 |
| 8 | **Ahara Shakti** | "भूख कैसी लगती है?" | 🍽️ Strong · 🥄 Moderate · 🚫 Poor · 📉 Irregular | 👆 📉 Irregular |
| 9 | **Vyayama Shakti** | "शारीरिक ताक़त?" | 🏋️ High · 🚶 Moderate · 🛋️ Low | 👆 🛋️ Low |
| 10 | **Vaya** | Auto-derived from age | — | Madhyama (middle) |

**Agni & Koshtha**
```
ay_agni     🤖 "खाना पचता कैसा है?"
            👆 [तेज़] [ठीक] [धीमा/भारीपन] [कभी तेज़ कभी धीमा]
            👆 "कभी तेज़ कभी धीमा" → Vishamagni (irregular)

ay_koshtha  🤖 "पेट रोज़ साफ़ होता है?"
            👆 [रोज़ आसानी से] [कभी मुश्किल] [अक्सर बहुत मुश्किल]
            👆 "कभी मुश्किल" → Madhyama koshtha
```

```
🤖 [S5] 👆 No papers → [S6] read-back → 👆 सही है → [S7] Token A-51
```

### Expected system behaviour

| Check | Expected |
|---|---|
| Voice turns in AYUSH branch | **Zero** (AY-04) |
| Sanskrit shown to patient | Section headers only, always with plain-language subtitle |
| **Computed Prakriti verdict** | **ABSENT — anywhere in output, code, or UI** |
| Red flags | None |
| FHIR mapping | Dashavidha → `Observation` with custom code system (Schema §10) |

### Expected Physician Summary

```
A-51 · Priya Nair · 34F · ABHA 45-2891-6634-0072 · 🍃 AYUSH
Intake 9m 03s · Hindi · Interaction: 100% touch in AYUSH section

CHIEF COMPLAINT   Bloating, irregular digestion, low energy — 6 months
PAST MEDICAL      Hypothyroidism
DRUG HISTORY      Thyroid medication (name not captured) ⚠ uncertain
ALLERGIES         None reported

─── DASHAVIDHA PARIKSHA ─── patient-reported responses ───

  Prakriti        Pitta-leaning with Vata features  [patient-reported]
  Vikriti         Vata + Pitta features reported
  Sara            Madhyama (average)
  Samhanana       Madhyama
  Pramana         158 cm / 54 kg · BMI 21.6
  Satmya          Bland food tolerated; spiced food poorly tolerated
  Sattva          Madhyama
  Ahara Shakti    Irregular appetite
  Vyayama Shakti  Avara (low)
  Vaya            Madhyama (34y)

  Agni            Vishamagni — irregular digestion
  Koshtha         Madhyama

  ⓘ These are the patient's structured responses.
    Constitutional determination remains with the physician.

[ CONFIRM & COMMIT ]   [ View FHIR ]
```

### ✅ Pass criteria
- [ ] All 10 Dashavidha parameters captured
- [ ] Zero voice prompts in the AYUSH branch
- [ ] Every option illustrated; patient never sees raw Sanskrit as an answer choice
- [ ] **No Prakriti classification computed or displayed** — grep the codebase to confirm
- [ ] The ⓘ physician note renders
- [ ] Agni and Koshtha captured separately from the ten-fold set

---

# Scenario 4 — Rajesh Kumar
## Document digitization · handwritten prescription + lab report

| Field | Value |
|---|---|
| **Name** | Rajesh Kumar |
| **Age / Gender** | 55 / Male |
| **Language** | English with Hindi code-switching |
| **Tech literacy** | High — office worker |
| **ABHA** | `28-7734-1290-5518` |
| **Mode** | Allopathic |
| **Documents** | 📄 Handwritten prescription (Mar 2026) · 📄 Printed lab report (Aug 2026) |
| **Chief complaint** | Diabetes follow-up; tingling in feet, 2 months |

### What this tests
Module B end to end (B-01→B-08) · confidence marking at 0.75 (B-07) · abnormal lab flagging (B-04) · chronological timeline with a visible care gap (§7.3)

### Script

```
👆 English → Allopathic → ABHA entered → consent
```

```
cc_open      🗣️ "I'm here for my diabetes follow-up. Also getting
                tingling in my feet for about two months."
hpi_site     👆 Both feet
hpi_character 👆 Tingling / pins-and-needles
hpi_timecourse 👆 Worse at night
hpi_severity 👆 4
pmh          👆 Type 2 Diabetes (8 years)
drug_current 🗣️ "Metformin, and something else I don't remember the name of"
             → ⚠ marked uncertain, resolved later by OCR
allergy      👆 None
family       👆 Mother — diabetes
```

**S5 — Document capture**

```
📄 Document 1 — handwritten prescription, City Clinic, 14 Mar 2026
   👆 CAPTURE → "Reading…" → ✅ "Prescription"
   
   Extracted:
     Metformin 500mg BD              conf 0.94  ✅
     Glimepiride 1mg OD              conf 0.71  ⚠ requires_review
     Dx: Type 2 Diabetes Mellitus    conf 0.88  ✅
     Date: 14/03/2026                conf 0.91  ✅
   → overall_confidence 0.86 · requires_review TRUE (one field below 0.75)

📄 Document 2 — printed lab report, 18 Aug 2026
   👆 CAPTURE → ✅ "Lab Report"
   
   Extracted:
     HbA1c        8.2 %      ref 4.0–5.6     🔺 ABNORMAL   conf 0.96
     Fasting glu  156 mg/dL  ref 70–100      🔺 ABNORMAL   conf 0.97
     Creatinine   1.1 mg/dL  ref 0.7–1.3     ✅ normal     conf 0.95
     Date: 18/08/2026                                      conf 0.98
   → overall_confidence 0.96 · requires_review FALSE

👆 DONE → [S6] → 👆 "This is correct" → [S7] Token A-52
```

### Expected system behaviour

| Check | Expected |
|---|---|
| Handwritten doc | Processes; `Glimepiride` at 0.71 → amber, "Doctor will check this" |
| Amber framing | Never presented as patient error (App Flow S5) |
| Abnormal flagging | HbA1c and fasting glucose flagged; creatinine not |
| Timeline gap | **5 months** between documents — rendered as a visible break |
| Drug reconciliation | Patient said "something I don't remember" → OCR supplies the candidate; physician confirms |

### Expected Physician Summary

```
A-52 · Rajesh Kumar · 55M · ABHA 28-7734-1290-5518 · Allopathic
Intake 7m 22s · English

CHIEF COMPLAINT   Diabetes follow-up + bilateral foot tingling, 2 months

HPI
  Site         Both feet
  Character    Tingling / paraesthesia
  Time course  Worse at night
  Severity     4 / 10

PAST MEDICAL     Type 2 Diabetes Mellitus — 8 years
DRUG HISTORY     Metformin 500mg BD           [from prescription]
                 Glimepiride 1mg OD    ⚠ verify [conf 0.71]
                 ⓘ Patient could not recall the second agent.
                   Extracted from prescription dated 14/03/2026.
ALLERGIES        None reported
FAMILY HISTORY   Mother — diabetes

─── DOCUMENT TIMELINE ─────────────────────────────────────
   14 Mar 2026          ┄┄┄ 5 month gap ┄┄┄        18 Aug 2026
   📄 Prescription                                  📄 Lab Report
   City Clinic                                      
   ⚠ 1 field to verify                              🔺 2 abnormal
───────────────────────────────────────────────────────────

LAB VALUES (18 Aug 2026)
  HbA1c            8.2 %        (4.0–5.6)     🔺 HIGH
  Fasting glucose  156 mg/dL    (70–100)      🔺 HIGH
  Creatinine       1.1 mg/dL    (0.7–1.3)     ✅
```

### ✅ Pass criteria
- [ ] Handwritten prescription yields structured fields, not raw text
- [ ] `Glimepiride` marked `requires_review` at conf < 0.75
- [ ] Amber styling per UI/UX §6.6, never red
- [ ] Both abnormal labs flagged; the normal one is not
- [ ] Timeline shows the 5-month gap as a visible break
- [ ] The "patient couldn't recall → OCR resolved it" note renders — **this is the line to say out loud if you demo this scenario**

---

# Scenario 5 — Lakshmi
## Noisy OPD · voice fails twice · auto-switch to touch

| Field | Value |
|---|---|
| **Name** | Lakshmi |
| **Age / Gender** | 45 / Female |
| **Language** | Tamil |
| **Tech literacy** | Low — basic feature phone |
| **ABHA** | None |
| **Mode** | Allopathic |
| **Chief complaint** | Fever and cough, 5 days |
| **Environment** | 🔊 **Loud OPD** — crowd noise, announcements, crying child |

### What this tests
The resilience story (F-02, F-03, App Flow E4/E5). **This is the scenario that proves the product works in a real government hospital**, not a quiet lab.

### Script

```
👆 தமிழ் → Allopathic → No card → consent
```

**`cc_open` — attempt 1 🔇**
```
🤖 "உங்களுக்கு என்ன பிரச்சனை?"
🗣️ [speaks — drowned by a PA announcement]
🤖 ASR returns: "" (empty)  → App Flow E4
   "எனக்கு புரியல. மறுபடியும் சொல்லுங்க."
   ("I didn't catch that. Please say it again.")
   retry_count = 1
```

**`cc_open` — attempt 2 🔇**
```
🗣️ [speaks louder — a child cries nearby]
🤖 ASR returns: "காய்ச்சல்... [unintelligible] ...ஐந்து"
   confidence 0.31 → below threshold, rejected
   retry_count = 2
```

**→ AUTO-SWITCH (App Flow E5)**
```
🤖 Mic control fades out. Touch options expand to fill.
   Spoken: "பரவாயில்ல. கீழே தட்டி சொல்லுங்க."
   ("No problem. Please tap below instead.")
   
   ⓘ NOTE: framed as the system adapting, NEVER as patient failure.

   👆 [🌡️ காய்ச்சல் Fever] [😷 இருமல் Cough] [🤕 வலி Pain]
      [🤢 வாந்தி Vomiting] [➕ வேற ஏதாவது Something else]
👆 Taps 🌡️ + 😷
```

**Remaining interview — touch-only for the whole session**
```
hpi_onset       👆 📅 5 days
hpi_severity    👆 6
hpi_associations 👆 🥶 Chills · 🤕 Body ache
fever_pattern   👆 🌙 Rises at night
cough_type      👆 💧 With phlegm
ros_breathing   👆 ❌ No difficulty breathing at rest
                → ✅ BREATHLESS_AT_REST correctly does NOT fire
pmh             👆 ❌ None
drug_current    👆 💊 Paracetamol from a shop
allergy         👆 ❌ None
```

```
🤖 [S5] 👆 No papers → [S6] → 👆 ✅ → [S7] Token T-19
```

### Expected system behaviour

| Check | Expected |
|---|---|
| Voice failures before switch | Exactly 2 |
| Auto-switch | Permanent for the session — mic does not reappear |
| Framing | "Tap instead" — never "you failed" or "error" |
| ASR chain attempted | Bhashini → Whisper → then touch-only |
| `asr_provider_used` | `web_speech` or `none` |
| Completion | ✅ Full intake completes despite total voice failure |
| False red flag | ❌ None — cough/fever without neck stiffness must not fire `MENINGITIS_SIGNS` |

### Expected Physician Summary

```
T-19 · Lakshmi · 45F · Unregistered · Allopathic
Intake 6m 48s · Tamil · ⓘ Voice unavailable — completed via touch

CHIEF COMPLAINT   Fever and cough, 5 days

HPI
  Onset          5 days
  Associations   Chills, body ache
  Pattern        Fever rises at night
  Cough          Productive
  Severity       6 / 10

REVIEW OF SYSTEMS   No breathlessness at rest
PAST MEDICAL        None reported
DRUG HISTORY        OTC paracetamol
ALLERGIES           None reported

ⓘ INTAKE NOTE: Speech recognition unsuccessful (high ambient noise).
  History captured entirely via touch interface. No data loss.
```

### ✅ Pass criteria
- [ ] Auto-switch fires at exactly 2 failures, not 1 or 3
- [ ] Mic does not reappear later in the session
- [ ] **No error message, no red styling, no blame language** anywhere
- [ ] Intake completes with full clinical content
- [ ] The physician note explains *why* voice wasn't used
- [ ] Fever + cough does **not** trigger a false meningitis flag

> **Demo note:** if live voice fails on stage, **do not apologise — narrate it.** "This is exactly what a real OPD sounds like, and the system just handled it." A failure you designed for is a feature.

---

# Scenario 6 — Abdul Rehman
## 🔴 Abandoned session with a critical red flag

| Field | Value |
|---|---|
| **Name** | Abdul Rehman |
| **Age / Gender** | 68 / Male |
| **Language** | Hindi |
| **Tech literacy** | None |
| **ABHA** | None |
| **Mode** | Allopathic |
| **Chief complaint** | Sudden severe headache |
| **Outcome** | ⚠️ **Walks away mid-interview.** Session abandoned. |

### What this tests
**App Flow edge case E16 and the `physician_queue` view's WHERE clause (Schema §6.3).** An abandoned emergency is a *higher* priority clinical event, not a lower one. Most teams silently drop these rows.

### Script

```
👆 हिंदी → Allopathic → No card → consent
```

```
cc_open      🤖 "आपको क्या तकलीफ़ है?"
             🗣️ "अचानक बहुत तेज़ सिरदर्द हुआ, ऐसा पहले कभी नहीं हुआ"
                (achaanak bahut tez sirdard hua, aisa pehle kabhi nahin hua)
                → "Sudden very severe headache — I've never had one like this"

             ⚠️⚠️ SEVERE_HEADACHE FIRES — critical, deterministic
             (sudden onset + worst-ever descriptor)
             Patient screen: UNCHANGED.

hpi_onset    👆 "आज सुबह" (this morning)
hpi_severity 👆 9

hpi_associations
             🤖 "इसके साथ कुछ और है?"
             ⏸️ NO RESPONSE
             
             ⏱️ 8s   → spoken re-prompt
             ⏱️ +10s → touch options highlighted
             ⏱️ 90s  → O3 overlay: "क्या आप अभी भी हैं?"
             ⏱️ 120s → AUTO-RESET
             
             Session status → 'abandoned', abandoned_at = NOW()
             Kiosk returns to S1
```

### Expected system behaviour — the whole point of this scenario

| Check | Expected |
|---|---|
| Session status | `abandoned` |
| Red flag row | **Retained** — `SEVERE_HEADACHE`, critical |
| **Appears in physician queue** | ✅ **YES** — via the `OR status='abandoned' AND EXISTS(critical flag)` clause |
| Queue badge | `⚠ INCOMPLETE` alongside the red-flag chip |
| Summary | Partial — generated from the 3 answered turns |
| 24h cleanup job | **Skips this row** — critical flags are excluded from auto-delete |

### Expected Physician Queue Entry (D1)

```
╔═══════════════════════════════════════════════════════════════╗
║  PRIORITY                                                  2  ║
╠═══════════════════════════════════════════════════════════════╣
║ ▌A-53  Kamala Devi      62F  Chest pain          🔴 Radiating ║
║ ▌                                                    waiting 4m║
╟───────────────────────────────────────────────────────────────╢
║ ▌A-49  Unregistered     68M  Severe headache  🔴 Sudden/severe║
║ ▌      ⚠ INCOMPLETE — patient left kiosk mid-intake            ║
║ ▌      3 of 24 questions answered      last seen 11m ago      ║
╚═══════════════════════════════════════════════════════════════╝
```

### Expected Physician Summary

```
🔺 PRIORITY — EMERGENCY INDICATORS DETECTED
   Sudden severe headache ("worst ever" descriptor)
   › "अचानक बहुत तेज़ सिरदर्द हुआ, ऐसा पहले कभी नहीं हुआ"  [deterministic]

⚠️ INCOMPLETE INTAKE — patient did not finish
   3 of 24 questions answered · abandoned 11:04

A-49 · Unregistered · 68M · Allopathic

CHIEF COMPLAINT   Sudden severe headache, described as worst ever
HPI
  Onset      This morning, sudden
  Severity   9 / 10
  [Remaining history not captured]

ⓘ This patient reported emergency-level symptoms and left before
  completing intake. Consider locating them in the OPD area.
```

### ✅ Pass criteria
- [ ] Session marked `abandoned`, not deleted
- [ ] **Appears in the priority queue** — this is the whole test
- [ ] `⚠ INCOMPLETE` badge with the answered/total count
- [ ] `cleanup_stale_sessions()` does **not** delete it after 24h
- [ ] The "consider locating them" note renders

> **Say this on stage if you have 10 spare seconds:** *"A patient who reported the worst headache of his life and then walked away is more urgent than one who filled the form. Most systems would drop that row. Ours surfaces it."* It's the sharpest detail in the whole build.

---

# Scenario 7 — Sunita Devi
## Consent declined

| Field | Value |
|---|---|
| **Name** | Sunita Devi |
| **Age / Gender** | 29 / Female |
| **Language** | Hindi |
| **Tech literacy** | Moderate |
| **Mode** | Allopathic |
| **Outcome** | ❌ **Declines consent.** Session purged. |

### What this tests
D-03, D-04, App Flow E12, and the `valid_consent` check constraint (Schema §4.3). Also proves the audio gate is real.

### Script

```
👆 हिंदी → Allopathic → START
👆 "बिना कार्ड आगे बढ़ें"

🤖 [S3] Consent audio begins.
        ⚠️ TEST: attempt to tap "मैं सहमत हूँ" at 3 seconds
        → BUTTON DISABLED. Audio progress bar visible.
        
        Audio completes (14s) → I AGREE enables

👆 Taps "मैं सहमत नहीं हूँ" (I do not agree)

🤖 "ठीक है। आपकी जानकारी नहीं रखी जाएगी।
    कृपया मदद के लिए काउंटर पर जाएँ।"
    ("Understood. Your information will not be kept.
      Please go to the counter for help.")
    
    [ वापस जाएँ ] shown for 3 seconds
    
⏱️ 3s → returns to S1
```

### Expected system behaviour

| Check | Expected |
|---|---|
| I AGREE before audio completes | **Disabled.** Disabled state reads as *waiting*, not *broken* (UI/UX §9) |
| `consents` row | `granted = FALSE`, `audio_played = TRUE` |
| `valid_consent` constraint | Satisfied (only `granted = TRUE` requires audio) |
| Session status | `declined` |
| Data retention | **Immediate full delete** via `cleanup_stale_sessions()` — cascades everywhere |
| Appears in queue | ❌ No |
| Tone | Neutral and respectful. No guilt, no retry pressure. |

### Expected DB state after cleanup

```sql
SELECT * FROM sessions WHERE id = '<session>';   -- 0 rows
SELECT * FROM answers  WHERE session_id = '<>';  -- 0 rows (cascade)
-- Consent row cascades with the session: declined consent means
-- no lawful basis to retain anything, including the refusal record.
```

### ✅ Pass criteria
- [ ] I AGREE genuinely disabled until audio completes — test by tapping early
- [ ] Decline path is neutral in tone
- [ ] "वापस जाएँ" available for 3s (accidental taps recoverable)
- [ ] Session and all children deleted
- [ ] Nothing appears in the physician queue

> **Q&A value:** if a judge asks how you comply with DPDP, show this scenario and the `valid_consent` constraint. Compliance enforced by a database check, not by a slide.

---

# Scenario 8 — Arjun Menon
## Control case · red-flag *specificity*

| Field | Value |
|---|---|
| **Name** | Arjun Menon |
| **Age / Gender** | 24 / Male |
| **Language** | English |
| **Tech literacy** | High |
| **ABHA** | None (skips) |
| **Mode** | Allopathic |
| **Chief complaint** | Right ankle pain after football, 2 days |

### What this tests
**That the system doesn't cry wolf.** Scenario 1 proves sensitivity; this proves the rules aren't just "flag everything." Also the fast happy path — clean baseline, no failures injected.

### Script

```
👆 English → Allopathic → Continue without card → consent
```

```
cc_open       🗣️ "I twisted my ankle playing football two days ago.
                 It's swollen and hurts when I walk."
hpi_site      👆 Right ankle (body_map)
hpi_onset     👆 2 days
hpi_character 👆 Sharp
hpi_associations 👆 Swelling · Bruising
hpi_exacerbating 👆 Walking · Weight-bearing
hpi_severity  👆 5

ros_targeted  🤖 "Any of these recently?"
              🗣️ "I was pretty breathless after the match, but that's
                  normal for me. Fine now."
              
              🎯 CRITICAL SPECIFICITY TEST
              → BREATHLESS_AT_REST must NOT fire.
                Rule requires breathlessness WITHOUT exertion.
                "After the match" = exertional. Correctly ignored.

pmh           👆 None
drug_current  👆 None
allergy       👆 None
family        👆 None known
personal      👆 Non-smoker · occasional alcohol
```

```
🤖 [S5] 👆 No papers → [S6] → 👆 Correct → [S7] Token A-54
```

### Expected system behaviour

| Check | Expected |
|---|---|
| **Red flags** | ✅ **ZERO** |
| `BREATHLESS_AT_REST` | ❌ Does not fire — exertional context correctly excluded |
| Queue placement | Standard zone, **not** priority |
| Duration | 3–4 minutes (fastest scenario) |
| Turn count | ~12 |
| Uncertain fields | None |
| Failures | None injected — this is the clean baseline |

### Expected Physician Summary

```
A-54 · Arjun Menon · 24M · Unregistered · Allopathic
Intake 3m 51s · English · No flags

CHIEF COMPLAINT   Right ankle pain following sports injury, 2 days

HPI
  Site           Right ankle
  Onset          2 days ago, during football
  Character      Sharp
  Associations   Swelling, bruising
  Exacerbating   Walking, weight-bearing
  Severity       5 / 10

PAST MEDICAL     None
DRUG HISTORY     None
ALLERGIES        None
FAMILY HISTORY   None known
PERSONAL         Non-smoker · occasional alcohol
ROS              Post-exertional breathlessness only, self-limiting
```

### ✅ Pass criteria
- [ ] **Zero red flags**
- [ ] `BREATHLESS_AT_REST` does not fire on the exertional mention
- [ ] Lands in the standard queue zone
- [ ] Completes in under 4 minutes
- [ ] No fields marked uncertain

> **Q&A value:** when a judge asks *"doesn't your system just flag everything?"* — this scenario is the answer. Run it. Show zero flags. Then explain that PRD PM4 deliberately tunes for sensitivity over specificity, because a missed emergency is not the same kind of error as a false alarm.

---

## Regression Checklist — run all eight at Gate 3

| # | Scenario | Critical assertion | ☐ |
|---|---|---|---|
| 1 | Kamala Devi | Flag fires deterministically; patient sees nothing | ☐ |
| 2 | Murugan | Completes without reading a single word | ☐ |
| 3 | Priya Nair | 10 parameters captured; **no Prakriti verdict** | ☐ |
| 4 | Rajesh Kumar | Handwritten OCR + confidence marking + timeline gap | ☐ |
| 5 | Lakshmi | Auto-switch at exactly 2 failures; no blame language | ☐ |
| 6 | Abdul Rehman | **Abandoned + flagged still reaches the queue** | ☐ |
| 7 | Sunita Devi | Audio gate holds; full purge on decline | ☐ |
| 8 | Arjun Menon | **Zero flags** — specificity holds | ☐ |

**Run each 2–3 times.** Fifteen to twenty runs total, per Implementation Plan G3-1.

---

## Notes for the build

1. **Scenario 1 is the demo.** Everything else is regression coverage. Rehearse 1 until it's boring; run the rest to catch breakage.
2. **Scenarios 6 and 8 are your Q&A weapons.** E16 shows you thought past the happy path; the specificity control shows you thought about error cost. Most teams have neither.
3. **Scenario 5 is your insurance.** If live voice fails on stage, you're not improvising — you're demonstrating a designed path. Narrate it, don't apologise for it.
4. **Scenario 4 needs real documents.** Phase 0 step P0-12. Collect them today; you cannot fabricate a convincing handwritten prescription at 2am.
5. **Hindi and Tamil strings here are demo copy, not final i18n.** They belong in `lib/i18n/{hi,ta}.json` (P2-X2). Have a native speaker check them on Day 1 — untested translations are the classic late embarrassment.

---

*End of file.*