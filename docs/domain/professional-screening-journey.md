# Professional Screening Journey

Status: current domain journey reference as of 2026-06-12.

## User

The primary user is a professional advisor or building actor:

- architect
- building advisor
- type-house company
- contractor
- residential developer

The user is not primarily trying to design a house. The user is trying to
qualify whether a project, purchase or client idea is realistic before expensive
work begins.

## Core Job

> I need to understand whether this property can support the intended project,
> what the risks are, which sources support that view and what still needs
> manual professional control.

## Journey

### 1. Address Intake

The user enters an address and confirms the property identity.

System output:

- address and property identity
- DAR/BBR/MAT/EBR keys
- source status for address enrichment

### 2. Property Profile

The system assembles known facts about the property.

System output:

- plot area and parcel context
- existing buildings
- BBR technical facts
- VUR context
- FBB/SAVE/fredning signals
- known utilities or supply context where available

### 3. Planning Profile

The system identifies the planning context.

System output:

- local plans
- kommuneplanrammer
- relevant plan documents and links
- extracted planning constraints with confidence and citations where available

### 4. Risk Register

The system classifies findings without overclaiming.

Risk categories:

- blocker
- dispensation
- manual review
- cost risk
- unknown

Unknown is not failure. Unknown is a professional signal that the user must
check a source manually or obtain specialist input.

### 5. Source Ledger

The system shows the evidence behind the screening.

Each source should expose:

- source name
- status
- timestamp
- confidence
- mock/cache/error/skipped state
- link or reference when available
- what the source was used for

### 6. Manual-Control Checklist

The system lists what cannot be safely automated yet.

Typical manual checks:

- Tingbog/servitudes
- municipal building archive
- land survey and boundary certainty
- geotechnical report
- soil contamination documentation
- sewer and utility confirmations
- noise/climate/coastal risk where automated sources are missing
- specialist BR18 review for fire, statics, energy or LCA where relevant

### 7. Screening Report

The system produces a professional preliminary report.

The report must clearly state:

- what appears feasible
- what blocks or may block the project
- what requires dispensation or authority handling
- what is uncertain
- which sources were used
- which checks remain manual
- that the report is not legal advice or a municipal decision

## Success Criteria

The product succeeds when a professional user says:

> This gives me a trustworthy first-pass screening and a client-ready checklist
> faster than my normal desk research.

## Non-Goals For This Journey

- generating floor plans
- producing BIM
- making permit-ready authority drawings
- promising legal approval
- replacing professional judgement
- turning AI text into compliance truth
